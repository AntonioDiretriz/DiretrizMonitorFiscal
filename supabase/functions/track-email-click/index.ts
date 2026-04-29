/**
 * Edge Function: track-email-click
 * Registra clique no botão WhatsApp e redireciona o cliente.
 * URL: /functions/v1/track-email-click?id=UUID&dest=URL_ENCODED
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const url  = new URL(req.url);
  const id   = url.searchParams.get("id");
  const dest = url.searchParams.get("dest");

  if (id) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
      await supabase
        .from("email_notificacoes")
        .update({ clicou_em: new Date().toISOString(), status: "clicou" })
        .eq("id", id);
    } catch (e) {
      console.error("track-email-click error:", e);
    }
  }

  const destino = dest ?? "https://wa.me/5581994058847";

  // Retorna HTML com redirect — evita que clientes de email (iOS/webmail) tentem baixar o arquivo
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=${destino}">
  <title>Redirecionando...</title>
  <script>window.location.replace("${destino}");</script>
</head>
<body style="font-family:Arial,sans-serif;text-align:center;padding:40px;color:#374151">
  <p>Redirecionando para o WhatsApp...</p>
  <p><a href="${destino}" style="color:#25d366;font-weight:bold">Clique aqui se não for redirecionado automaticamente</a></p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});
