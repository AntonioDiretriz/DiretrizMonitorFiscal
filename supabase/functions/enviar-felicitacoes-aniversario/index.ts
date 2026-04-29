/**
 * Edge Function: enviar-felicitacoes-aniversario
 * Envia email de parabéns ao sócio no seu aniversário.
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
    const { to_email, nome, empresa_nome } = await req.json();
    if (!to_email || !nome) return json({ error: "Parâmetros obrigatórios ausentes" }, 400);

    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY não configurada");
      return json({ error: "Serviço de e-mail não configurado" }, 500);
    }

    const primeiroNome = nome.split(" ")[0];
    const ano = new Date().getFullYear();
    const empresaTexto = empresa_nome ? ` e a toda a equipe da ${empresa_nome}` : "";

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f4f8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.12);">

        <!-- Faixa colorida topo -->
        <tr><td style="padding:0;font-size:0;line-height:0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#ED3237;height:7px;"></td>
              <td style="background:#f59e0b;height:7px;"></td>
              <td style="background:#22c55e;height:7px;"></td>
              <td style="background:#3b82f6;height:7px;"></td>
              <td style="background:#8b5cf6;height:7px;"></td>
              <td style="background:#ED3237;height:7px;"></td>
            </tr>
          </table>
        </td></tr>

        <!-- Header navy com bolo -->
        <tr><td style="background:#10143D;padding:40px 40px 32px;text-align:center;">
          <!-- Balões decorativos (círculos coloridos) -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td align="center">
                <span style="display:inline-block;width:14px;height:14px;background:#ED3237;border-radius:50%;margin:0 5px;opacity:0.9;"></span>
                <span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:50%;margin:0 5px;opacity:0.9;"></span>
                <span style="display:inline-block;width:16px;height:16px;background:#22c55e;border-radius:50%;margin:0 5px;opacity:0.9;"></span>
                <span style="display:inline-block;width:12px;height:12px;background:#60a5fa;border-radius:50%;margin:0 5px;opacity:0.9;"></span>
                <span style="display:inline-block;width:14px;height:14px;background:#a78bfa;border-radius:50%;margin:0 5px;opacity:0.9;"></span>
                <span style="display:inline-block;width:10px;height:10px;background:#ED3237;border-radius:50%;margin:0 5px;opacity:0.9;"></span>
              </td>
            </tr>
          </table>

          <div style="font-size:64px;line-height:1;margin-bottom:16px;">&#127874;</div>
          <h1 style="color:#ffffff;font-size:32px;margin:0 0 8px;font-weight:800;letter-spacing:-0.5px;">
            Feliz Aniversário!
          </h1>
          <p style="color:#a5b4fc;font-size:16px;margin:0;font-weight:500;">
            ${ano} — Que seja um ano incrível!
          </p>

          <!-- Estrelinhas decorativas -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
            <tr>
              <td align="center">
                <span style="color:#f59e0b;font-size:18px;margin:0 4px;">&#9733;</span>
                <span style="color:#ED3237;font-size:12px;margin:0 4px;">&#9733;</span>
                <span style="color:#22c55e;font-size:20px;margin:0 4px;">&#9733;</span>
                <span style="color:#60a5fa;font-size:12px;margin:0 4px;">&#9733;</span>
                <span style="color:#f59e0b;font-size:18px;margin:0 4px;">&#9733;</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Corpo da mensagem -->
        <tr><td style="padding:40px 48px 32px;">

          <!-- Saudação personalizada -->
          <h2 style="color:#10143D;font-size:24px;margin:0 0 20px;font-weight:700;">
            Parabéns, ${primeiroNome}! &#127881;
          </h2>

          <p style="color:#374151;font-size:16px;line-height:1.7;margin:0 0 16px;">
            Neste dia tão especial, toda a equipe da <strong style="color:#10143D;">Diretriz Contabilidade</strong>${empresaTexto} une-se para desejar a você muita saúde, alegria e conquistas.
          </p>

          <p style="color:#374151;font-size:16px;line-height:1.7;margin:0 0 24px;">
            Que este novo ano de vida seja repleto de bênçãos, novos projetos realizados e momentos inesquecíveis ao lado das pessoas que você ama!
          </p>

          <!-- Destaque colorido -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr><td style="background:linear-gradient(135deg,#f0f4ff 0%,#fef3ff 100%);border-left:4px solid #10143D;border-radius:0 12px 12px 0;padding:20px 24px;">
              <p style="color:#10143D;font-size:17px;line-height:1.6;margin:0;font-style:italic;font-weight:500;">
                "O sucesso é a soma de pequenos esforços repetidos dia após dia."
              </p>
              <p style="color:#6b7280;font-size:13px;margin:8px 0 0;">— Robert Collier</p>
            </td></tr>
          </table>

          <p style="color:#374151;font-size:16px;line-height:1.7;margin:0 0 32px;">
            Com muito carinho e admiração,<br />
            <strong style="color:#10143D;">Equipe Diretriz Contabilidade</strong>
          </p>

          <!-- Botão decorativo -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <div style="display:inline-block;background:#10143D;color:#ffffff;font-size:15px;font-weight:700;padding:14px 40px;border-radius:50px;letter-spacing:0.5px;text-align:center;">
                &#127881; Comemore muito este dia! &#127881;
              </div>
            </td></tr>
          </table>
        </td></tr>

        <!-- Faixa separadora -->
        <tr><td style="padding:0 40px;">
          <div style="height:1px;background:linear-gradient(to right,transparent,#e5e7eb,transparent);"></div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:24px 40px;text-align:center;border-radius:0 0 20px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding-bottom:12px;">
                <span style="color:#10143D;font-size:16px;font-weight:800;letter-spacing:0.5px;">Diretriz Contabilidade</span>
              </td>
            </tr>
            <tr>
              <td align="center">
                <span style="color:#9ca3af;font-size:12px;">
                  R. Demócrito de Souza Filho, 335 — Madalena, Recife/PE<br />
                  (81) 3097-4549 &nbsp;|&nbsp; antonio@diretriz.cnt.br
                </span>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:12px;">
                <span style="color:#d1d5db;font-size:11px;">© ${ano} Diretriz Contabilidade. Todos os direitos reservados.</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Faixa colorida rodapé -->
        <tr><td style="padding:0;font-size:0;line-height:0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#8b5cf6;height:5px;"></td>
              <td style="background:#3b82f6;height:5px;"></td>
              <td style="background:#22c55e;height:5px;"></td>
              <td style="background:#f59e0b;height:5px;"></td>
              <td style="background:#ED3237;height:5px;"></td>
              <td style="background:#10143D;height:5px;"></td>
            </tr>
          </table>
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
      body: JSON.stringify({
        from: "Diretriz Contabilidade <noreply@diretriz.cnt.br>",
        to: to_email,
        subject: `Feliz Aniversário, ${primeiroNome}! &#127874; — Diretriz Contabilidade`,
        html,
      }),
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
