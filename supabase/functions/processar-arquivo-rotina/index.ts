/**
 * Edge Function: processar-arquivo-rotina
 *
 * Fluxo:
 *   1. Recebe arquivo (via webhook Storage INSERT ou POST manual)
 *   2. Baixa o arquivo e tenta extrair texto do PDF
 *   3. Detecta CNPJ, competência e tipo de obrigação (palavras-chave)
 *   4. Se path já segue padrão tipo/cnpj/yyyymm/ → usa path diretamente
 *   5. Se for inbox/ → usa detecção por conteúdo
 *   6. Chama processar_arquivo_rotina() no banco
 *   7. Se rotina não encontrada → salva em documentos_pendentes para baixa manual
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET_NAME      = "obrigacoes-docs";

// ── Extrai texto bruto de PDF (funciona para PDFs text-based do governo) ──────
function extractTextFromPdfBytes(bytes: Uint8Array): string {
  try {
    const decoder = new TextDecoder("latin1");
    const raw = decoder.decode(bytes);
    const texts: string[] = [];

    // Extrai strings entre parênteses (formato PDF text operators)
    const re = /\(([^)\\]{1,200})\)/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const t = m[1]
        .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
        .replace(/\\n/g, " ").replace(/\\r/g, " ").replace(/\\\\/g, "\\")
        .trim();
      if (t.length > 2 && /[a-zA-Z0-9]/.test(t)) texts.push(t);
    }

    return texts.join(" ");
  } catch {
    return "";
  }
}

// ── Extrai CNPJ do texto ────────────────────────────────────────────────────
function extractCnpj(text: string): string | null {
  const re = /\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g;
  const m = re.exec(text);
  return m ? m[0].replace(/\D/g, "") : null;
}

// ── Extrai competência (mês/ano) do texto ──────────────────────────────────
function extractCompetencia(text: string): string | null {
  // "competência: MM/YYYY" ou "período: MM/YYYY"
  const m1 = /(?:COMPET[EÊ]NCIA|PER[IÍ]ODO|APURA[CÇ][AÃ]O)[:\s\/]+(\d{2})[\/\-](\d{4})/i.exec(text);
  if (m1) return `${m1[2]}${m1[1]}`;

  // "MM/YYYY" genérico
  const m2 = /\b(\d{2})\/(\d{4})\b/.exec(text);
  if (m2 && parseInt(m2[1]) >= 1 && parseInt(m2[1]) <= 12) return `${m2[2]}${m2[1]}`;

  // Mês por extenso
  const MESES: Record<string, string> = {
    JANEIRO:"01",FEVEREIRO:"02",MARCO:"03",ABRIL:"04",MAIO:"05",JUNHO:"06",
    JULHO:"07",AGOSTO:"08",SETEMBRO:"09",OUTUBRO:"10",NOVEMBRO:"11",DEZEMBRO:"12",
    JAN:"01",FEV:"02",MAR:"03",ABR:"04",MAI:"05",JUN:"06",
    JUL:"07",AGO:"08",SET:"09",OUT:"10",NOV:"11",DEZ:"12",
  };
  for (const [nome, num] of Object.entries(MESES)) {
    const re = new RegExp(`${nome}[\\s\\/\\-]+(\\d{4})`, "i");
    const mm = re.exec(text.toUpperCase());
    if (mm) return `${mm[1]}${num}`;
  }
  return null;
}

// ── Identifica tipo de obrigação pelas palavras-chave configuradas ─────────
async function detectTipoByKeywords(text: string, supabase: any): Promise<string | null> {
  const { data: modelos } = await supabase
    .from("rotina_modelo")
    .select("tipo_rotina, palavras_chave")
    .not("palavras_chave", "is", null);

  if (!modelos) return null;

  const upper = text.toUpperCase();
  for (const m of modelos) {
    if (!m.palavras_chave?.length) continue;
    for (const kw of m.palavras_chave) {
      if (upper.includes(kw.toUpperCase())) return m.tipo_rotina;
    }
  }
  return null;
}

// ── Parseia path padrão: tipo/cnpj/yyyymm/arquivo ─────────────────────────
function parseConventionPath(path: string): boolean {
  const parts = path.split("/");
  return parts.length >= 3 && parts[0] !== "inbox";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
    }});
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const body = await req.json().catch(() => null);

    let arquivo_path: string;
    let arquivo_url:  string;
    let user_id:      string;

    // Webhook de Storage
    if (body?.type === "INSERT" && body?.table === "objects") {
      const record = body.record;
      if (record.bucket_id !== BUCKET_NAME) {
        return new Response(JSON.stringify({ skipped: true }), { status: 200 });
      }
      arquivo_path = record.name;
      user_id = record.owner ?? record.metadata?.user_id;
      if (!user_id) {
        return new Response(JSON.stringify({ erro: "user_id não encontrado" }), { status: 400 });
      }
      const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(arquivo_path);
      arquivo_url = publicUrl;
    } else if (body?.arquivo_path && body?.user_id) {
      arquivo_path = body.arquivo_path;
      user_id      = body.user_id;
      arquivo_url  = body.arquivo_url ?? supabase.storage.from(BUCKET_NAME).getPublicUrl(arquivo_path).data.publicUrl;
    } else {
      return new Response(JSON.stringify({ erro: "Payload inválido" }), { status: 400 });
    }

    // Registra no log
    await supabase.from("rotina_automacao_log").insert({
      user_id,
      arquivo_path,
      arquivo_nome: arquivo_path.split("/").pop(),
      status: "detectado",
    });

    // ── Tenta via path convencional (tipo/cnpj/yyyymm/) ──────────────────
    if (parseConventionPath(arquivo_path)) {
      const { data, error } = await supabase.rpc("processar_arquivo_rotina", {
        p_user_id:      user_id,
        p_arquivo_path: arquivo_path,
        p_arquivo_url:  arquivo_url,
      });
      if (!error && (data as any)?.ok) {
        console.log("Processado via path:", data);
        return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      console.log("Path não resolveu rotina, tentando detecção por conteúdo...");
    }

    // ── Detecção por conteúdo (leitura do PDF) ────────────────────────────
    let cnpj_detectado:        string | null = null;
    let competencia_detectada: string | null = null;
    let tipo_detectado:        string | null = null;

    try {
      const fileResp = await fetch(arquivo_url);
      if (fileResp.ok) {
        const bytes = new Uint8Array(await fileResp.arrayBuffer());
        const text = extractTextFromPdfBytes(bytes);

        if (text) {
          cnpj_detectado        = extractCnpj(text);
          competencia_detectada = extractCompetencia(text);
          tipo_detectado        = await detectTipoByKeywords(text, supabase);
          console.log("Detecção:", { cnpj_detectado, competencia_detectada, tipo_detectado });
        }
      }
    } catch (e) {
      console.error("Erro ao ler PDF:", e);
    }

    // Se detectou tipo + CNPJ + competência, tenta via função SQL com path sintetizado
    if (tipo_detectado && cnpj_detectado && competencia_detectada) {
      const syntheticPath = `${tipo_detectado}/${cnpj_detectado}/${competencia_detectada}/${arquivo_path.split("/").pop()}`;
      const { data, error } = await supabase.rpc("processar_arquivo_rotina", {
        p_user_id:      user_id,
        p_arquivo_path: syntheticPath,
        p_arquivo_url:  arquivo_url,
      });
      if (!error && (data as any)?.ok) {
        console.log("Processado via detecção de conteúdo:", data);
        return new Response(JSON.stringify({ ...data, metodo: "conteudo" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }

    // ── Nenhuma rotina encontrada → salva como pendente para baixa manual ──
    const compDate = competencia_detectada
      ? `${competencia_detectada.slice(0,4)}-${competencia_detectada.slice(4,6)}-01`
      : null;

    await supabase.from("documentos_pendentes").insert({
      user_id,
      arquivo_path,
      arquivo_url,
      arquivo_nome:          arquivo_path.split("/").pop(),
      cnpj_detectado,
      competencia_detectada: compDate,
      tipo_detectado,
      confianca: (cnpj_detectado ? 40 : 0) + (competencia_detectada ? 30 : 0) + (tipo_detectado ? 30 : 0),
      status: "pendente",
    });

    await supabase.from("rotina_automacao_log")
      .update({ status: "erro", erro_msg: "Rotina nao encontrada - adicionado a fila de pendentes" })
      .eq("user_id", user_id).eq("arquivo_path", arquivo_path).eq("status", "detectado");

    return new Response(JSON.stringify({
      ok: false,
      pendente: true,
      cnpj_detectado,
      competencia_detectada,
      tipo_detectado,
      mensagem: "Documento adicionado a fila de pendentes para baixa manual",
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("Erro na edge function:", err);
    return new Response(JSON.stringify({ erro: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
