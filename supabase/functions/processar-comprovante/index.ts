/**
 * Edge Function: processar-comprovante
 * Recebe um comprovante (PDF ou imagem), faz upload no Storage,
 * chama Claude para extrair os dados fiscais e retorna o JSON extraído.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY    = Deno.env.get("ANTHROPIC_API_KEY")!;

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const formData  = await req.formData();
    const file      = formData.get("file") as File | null;
    const userId    = (formData.get("user_id") as string) ?? "anon";

    if (!file) {
      return new Response(JSON.stringify({ error: "Arquivo não fornecido" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase  = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const fileExt   = file.name.split(".").pop() ?? "bin";
    const storagePath = `comprovantes/${userId}/${Date.now()}.${fileExt}`;
    const fileBuffer  = await file.arrayBuffer();

    // Upload ao Storage (não bloqueia em caso de falha)
    let arquivoUrl = "";
    const { error: uploadErr } = await supabase.storage
      .from("obrigacoes-docs")
      .upload(storagePath, fileBuffer, { contentType: file.type, upsert: false });
    if (!uploadErr) {
      const { data: { publicUrl } } = supabase.storage
        .from("obrigacoes-docs").getPublicUrl(storagePath);
      arquivoUrl = publicUrl;
    }

    // Converte para base64
    const bytes  = new Uint8Array(fileBuffer);
    let binary   = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    const isPdf     = file.type === "application/pdf";
    const mediaType = isPdf ? "application/pdf" : file.type;

    const contentBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image",    source: { type: "base64", media_type: mediaType,          data: base64 } };

    // Chama Claude
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-api-key":       ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta":  "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `Analise este comprovante de pagamento fiscal brasileiro e extraia os dados. Responda APENAS com JSON válido, sem markdown:
{
  "tipo": "tipo em minúsculas: das | darf | gps | iss | fgts | inss | irpj | csll | pis | cofins | dctf | sped | ecf | ecd | dirf | rais | caged | icms | outro",
  "cnpj": "somente números (14 dígitos) ou null",
  "empresa": "nome da empresa ou null",
  "competencia": "formato YYYY-MM-01 ou null",
  "valor": número em reais ou null,
  "data_pagamento": "formato YYYY-MM-DD ou null",
  "codigo_receita": "código da receita ou null",
  "numero_autenticacao": "número de autenticação/protocolo ou null"
}`,
            },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic error:", errText);
      return new Response(JSON.stringify({ error: "Erro ao processar com IA: " + errText }), {
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
      JSON.stringify({ ok: true, arquivo_url: arquivoUrl, ...extracted }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("processar-comprovante:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
