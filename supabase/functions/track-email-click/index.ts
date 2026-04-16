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

  // Redireciona para o destino (WhatsApp ou outro)
  const destino = dest ? decodeURIComponent(dest) : "https://wa.me/5581994058847";

  return new Response(null, {
    status: 302,
    headers: { Location: destino },
  });
});
