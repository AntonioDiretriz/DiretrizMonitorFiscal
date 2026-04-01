import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY");
const APP_URL                   = Deno.env.get("APP_URL") || "https://diretriz-monitor-fiscal.vercel.app";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY não configurada — e-mail não enviado para", to);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Diretriz Monitor Fiscal <noreply@diretriz.com.br>",
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
  }
}

function emailBoasVindas(nome: string, email: string, senha: string, escritorioNome: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Bem-vindo ao Monitor Fiscal</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#10143D;padding:28px 32px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:14px;">
                  <svg width="40" height="40" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 52 L10 18 C10 8 18 0 28 0 L46 0 C56 0 64 8 64 18 L64 44 C64 54 56 62 46 62 L28 62 C18 62 10 54 10 52 Z" fill="#ED3237"/>
                    <rect x="4" y="18" width="52" height="7" rx="2" fill="white"/>
                    <rect x="4" y="37" width="52" height="7" rx="2" fill="white"/>
                  </svg>
                </td>
                <td>
                  <div style="color:#ffffff;font-size:22px;font-weight:700;line-height:1;">Diretriz</div>
                  <div style="color:#9ca3af;font-size:10px;letter-spacing:2px;margin-top:3px;">MONITOR FISCAL</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Faixa vermelha -->
        <tr><td style="background:#ED3237;height:4px;"></td></tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:36px 32px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#10143D;">Bem-vindo, ${nome}! 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
              Você foi adicionado à equipe de <strong>${escritorioNome}</strong> no sistema de monitoramento fiscal.
              Abaixo estão suas credenciais de acesso:
            </p>

            <!-- Credenciais -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-bottom:14px;border-bottom:1px solid #e2e8f0;">
                        <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600;">E-mail de acesso</p>
                        <p style="margin:0;font-size:15px;color:#10143D;font-weight:600;">${email}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top:14px;">
                        <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600;">Senha de acesso</p>
                        <p style="margin:0;font-size:18px;color:#10143D;font-weight:700;font-family:monospace;letter-spacing:2px;background:#fff;border:1px dashed #d1d5db;display:inline-block;padding:6px 16px;border-radius:6px;">${senha}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Botão -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#10143D;border-radius:8px;">
                  <a href="${APP_URL}" target="_blank"
                     style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                    Acessar o Sistema →
                  </a>
                </td>
              </tr>
            </table>

            <!-- Aviso segurança -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:13px;color:#92400e;">
                    ⚠️ <strong>Importante:</strong> por segurança, recomendamos alterar sua senha no primeiro acesso.
                    Não compartilhe suas credenciais com ninguém.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:18px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">
              Este e-mail foi enviado automaticamente pelo sistema Diretriz Monitor Fiscal.<br/>
              © ${new Date().getFullYear()} Diretriz Contabilidade e Consultoria — Todos os direitos reservados.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function emailAtualizacaoSenha(nome: string, email: string, novaSenha: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><title>Senha Atualizada</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:#10143D;padding:24px 32px;">
          <span style="color:#fff;font-size:20px;font-weight:700;">Diretriz</span>
          <span style="color:#9ca3af;font-size:10px;letter-spacing:2px;margin-left:8px;">MONITOR FISCAL</span>
        </td></tr>
        <tr><td style="background:#ED3237;height:4px;"></td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#10143D;">Olá, ${nome}!</p>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Sua senha de acesso foi atualizada. Utilize as credenciais abaixo para entrar no sistema:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">E-mail</p>
              <p style="margin:0 0 16px;font-size:15px;color:#10143D;font-weight:600;">${email}</p>
              <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Nova senha</p>
              <p style="margin:0;font-size:18px;font-weight:700;font-family:monospace;letter-spacing:2px;background:#fff;border:1px dashed #d1d5db;display:inline-block;padding:6px 16px;border-radius:6px;color:#10143D;">${novaSenha}</p>
            </td></tr>
          </table>
          <table cellpadding="0" cellspacing="0">
            <tr><td style="background:#10143D;border-radius:8px;">
              <a href="${APP_URL}" target="_blank" style="display:inline-block;padding:12px 28px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">Acessar o Sistema →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} Diretriz Contabilidade — Todos os direitos reservados.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error("Sessão inválida");

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { action, perfil_id, email, password, nome, escritorio_nome } = body;

    // ── CRIAR membro ──────────────────────────────────────────────────────────
    if (action === "create") {
      if (!email || !password) throw new Error("E-mail e senha são obrigatórios");

      const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome },
      });
      if (authErr) throw authErr;

      const newUserId = authData.user.id;

      if (perfil_id) {
        const { error: updateErr } = await adminClient
          .from("usuarios_perfil")
          .update({ user_id: newUserId })
          .eq("id", perfil_id)
          .eq("escritorio_owner_id", caller.id);
        if (updateErr) throw updateErr;
      }

      // Envia e-mail de boas-vindas com as credenciais
      const nomeExibicao = nome || email.split("@")[0];
      const escritorio   = escritorio_nome || "Diretriz Contabilidade";
      await sendEmail(
        email,
        `Bem-vindo ao Monitor Fiscal — ${escritorio}`,
        emailBoasVindas(nomeExibicao, email, password, escritorio)
      );

      return new Response(
        JSON.stringify({ ok: true, user_id: newUserId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ATUALIZAR senha ───────────────────────────────────────────────────────
    if (action === "update_password") {
      const { member_auth_id } = body;
      if (!member_auth_id || !password) throw new Error("Dados insuficientes");

      const { data: perfil, error: perfilErr } = await adminClient
        .from("usuarios_perfil")
        .select("id, nome, email")
        .eq("user_id", member_auth_id)
        .eq("escritorio_owner_id", caller.id)
        .maybeSingle();

      if (perfilErr || !perfil) throw new Error("Membro não pertence ao seu escritório");

      const { error: pwErr } = await adminClient.auth.admin.updateUserById(
        member_auth_id,
        { password }
      );
      if (pwErr) throw pwErr;

      // Envia e-mail com a nova senha
      await sendEmail(
        (perfil as any).email,
        "Sua senha foi atualizada — Monitor Fiscal",
        emailAtualizacaoSenha((perfil as any).nome, (perfil as any).email, password)
      );

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── EXCLUIR membro ────────────────────────────────────────────────────────
    if (action === "delete") {
      const { member_auth_id } = body;
      if (!member_auth_id) throw new Error("member_auth_id obrigatório");

      const { data: perfil, error: perfilErr } = await adminClient
        .from("usuarios_perfil")
        .select("id")
        .eq("user_id", member_auth_id)
        .eq("escritorio_owner_id", caller.id)
        .maybeSingle();

      if (!perfilErr && perfil) {
        await adminClient.auth.admin.deleteUser(member_auth_id);
      }

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Ação desconhecida: ${action}`);

  } catch (err: any) {
    console.error("manage-team-member error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
