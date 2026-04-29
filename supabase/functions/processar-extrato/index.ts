/**
 * Edge Function: processar-extrato
 * Recebe um extrato bancário em PDF, chama Claude para extrair as transações
 * e retorna JSON com as transações e hash do arquivo.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY    = Deno.env.get("ANTHROPIC_API_KEY")!;

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const formData = await req.formData();
    const file     = formData.get("file") as File | null;
    const userId   = (formData.get("user_id") as string) ?? "anon";
    const contaId  = (formData.get("conta_bancaria_id") as string) ?? "";

    if (!file) {
      return new Response(JSON.stringify({ error: "Arquivo não fornecido" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const fileBuffer = await file.arrayBuffer();
    const hash       = await sha256(fileBuffer);

    // Verifica duplicidade de arquivo
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    if (contaId) {
      const { data: existe } = await supabase
        .from("importacoes_bancarias")
        .select("id, created_at")
        .eq("user_id", userId)
        .eq("conta_bancaria_id", contaId)
        .eq("arquivo_hash", hash)
        .limit(1);
      if (existe && existe.length > 0) {
        return new Response(JSON.stringify({
          error: "duplicado",
          message: `Este extrato já foi importado em ${new Date(existe[0].created_at).toLocaleDateString("pt-BR")}.`,
        }), { status: 409, headers: { ...cors, "Content-Type": "application/json" } });
      }
    }

    // Converte para base64
    const bytes  = new Uint8Array(fileBuffer);
    let binary   = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    const isPdf     = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const mediaType = isPdf ? "application/pdf" : file.type;
    const contentBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image",    source: { type: "base64", media_type: mediaType, data: base64 } };

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta":    "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `Analise este extrato bancário brasileiro e extraia TODAS as transações.
Responda APENAS com JSON válido, sem markdown:
{
  "banco": "nome do banco",
  "conta": "número da conta ou null",
  "agencia": "agência ou null",
  "periodo_inicio": "YYYY-MM-DD ou null",
  "periodo_fim": "YYYY-MM-DD ou null",
  "transacoes": [
    {
      "data": "YYYY-MM-DD",
      "descricao": "descrição da transação",
      "valor": número positivo,
      "tipo": "debito ou credito",
      "saldo": número ou null
    }
  ]
}

IMPORTANTE:
- Débitos (saídas, pagamentos, transferências enviadas) = tipo "debito"
- Créditos (entradas, depósitos, transferências recebidas, PIX recebido) = tipo "credito"
- valor sempre positivo
- data no formato YYYY-MM-DD
- Inclua TODAS as transações visíveis no documento`,
            },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(JSON.stringify({ error: "Erro IA: " + errText }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const text   = aiData.content?.[0]?.text ?? "{}";

    let extracted: Record<string, unknown> = {};
    try {
      extracted = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) extracted = JSON.parse(match[0]);
    }

    return new Response(
      JSON.stringify({ ok: true, hash, ...extracted }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("processar-extrato:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
