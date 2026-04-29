/**
 * Edge Function: enviar-duvida-lancamento
 * Envia email ao cliente perguntando sobre um lançamento bancário desconhecido.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { to_email, empresa_nome, mensagem, assunto } = await req.json();
    if (!to_email || !mensagem) return json({ error: "Parâmetros obrigatórios ausentes" }, 400);

    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY não configurada");
      return json({ error: "Serviço de e-mail não configurado" }, 500);
    }

    const subject = assunto ?? `Identificação de lançamento — ${empresa_nome ?? "sua empresa"}`;

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#10143D;padding:24px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:bold;">Diretriz Contabilidade</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">Olá,</p>
          <div style="background:#f3f4f6;border-radius:6px;padding:16px 20px;font-size:14px;color:#374151;line-height:1.7;white-space:pre-line;">${mensagem.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          <p style="color:#6b7280;font-size:13px;margin:24px 0 0;">Por favor, responda este e-mail com as informações solicitadas.</p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;">
          <span style="color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} Diretriz Contabilidade</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: "Diretriz <noreply@diretriz.cnt.br>", to: to_email, subject, html }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return json({ error: "Falha ao enviar e-mail: " + err }, 500);
    }

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
