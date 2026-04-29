/**
 * Edge Function: track-email-open
 * Retorna um pixel 1x1 transparente e registra CADA abertura no histórico.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PIXEL = Uint8Array.from(atob(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
), c => c.charCodeAt(0));

function parseDispositivo(ua: string): string {
  if (!ua) return "Desconhecido";
  if (/iPhone/i.test(ua))  return "iPhone";
  if (/iPad/i.test(ua))    return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(ua))     return "Mac";
  if (/Linux/i.test(ua))   return "Linux";
  return "Outro";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const id  = url.searchParams.get("id");

  if (id) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
              ?? req.headers.get("x-real-ip")
              ?? "N/D";
      const ua          = req.headers.get("user-agent") ?? "";
      const dispositivo = parseDispositivo(ua);
      const agora       = new Date().toISOString();

      // Atualiza primeira abertura na notificação (se ainda não foi aberta)
      await supabase
        .from("email_notificacoes")
        .update({ aberto_em: agora, status: "aberto", ip_abertura: ip, dispositivo, user_agent: ua })
        .eq("id", id)
        .is("aberto_em", null);

      // Registra SEMPRE no histórico de aberturas
      await supabase.from("email_aberturas").insert({
        notificacao_id: id,
        aberto_em:      agora,
        ip_abertura:    ip,
        dispositivo,
        user_agent:     ua,
      });
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
