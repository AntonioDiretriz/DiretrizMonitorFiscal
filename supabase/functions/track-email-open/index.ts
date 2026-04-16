/**
 * Edge Function: track-email-open
 * Retorna um pixel 1x1 transparente e registra abertura do email.
 * URL: /functions/v1/track-email-open?id=UUID
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Pixel GIF 1x1 transparente (base64)
const PIXEL = Uint8Array.from(atob(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
), c => c.charCodeAt(0));

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const id  = url.searchParams.get("id");

  if (id) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
      await supabase
        .from("email_notificacoes")
        .update({ aberto_em: new Date().toISOString(), status: "aberto" })
        .eq("id", id)
        .is("aberto_em", null); // só atualiza na primeira abertura
    } catch (e) {
      console.error("track-email-open error:", e);
    }
  }

  return new Response(PIXEL, {
    headers: {
      "Content-Type":  "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma":        "no-cache",
    },
  });
});
