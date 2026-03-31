import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verificar que o chamador está autenticado como dono
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error("Sessão inválida");

    // 2. Admin client com service role
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { action, perfil_id, email, password, nome } = body;

    // ── CRIAR membro ────────────────────────────────────────────────────────────
    if (action === "create") {
      if (!email || !password) throw new Error("E-mail e senha são obrigatórios");

      // Cria o usuário de autenticação
      const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,   // confirma sem precisar de e-mail
        user_metadata: { nome },
      });
      if (authErr) throw authErr;

      const newUserId = authData.user.id;

      // Vincula o user_id do auth ao perfil já criado
      if (perfil_id) {
        const { error: updateErr } = await adminClient
          .from("usuarios_perfil")
          .update({ user_id: newUserId })
          .eq("id", perfil_id)
          .eq("escritorio_owner_id", caller.id);
        if (updateErr) throw updateErr;
      }

      return new Response(
        JSON.stringify({ ok: true, user_id: newUserId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ATUALIZAR senha ──────────────────────────────────────────────────────────
    if (action === "update_password") {
      const { member_auth_id } = body;
      if (!member_auth_id || !password) throw new Error("Dados insuficientes");

      // Confirma que o perfil pertence ao dono chamador
      const { data: perfil, error: perfilErr } = await adminClient
        .from("usuarios_perfil")
        .select("id")
        .eq("user_id", member_auth_id)
        .eq("escritorio_owner_id", caller.id)
        .maybeSingle();

      if (perfilErr || !perfil) throw new Error("Membro não pertence ao seu escritório");

      const { error: pwErr } = await adminClient.auth.admin.updateUserById(
        member_auth_id,
        { password }
      );
      if (pwErr) throw pwErr;

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── EXCLUIR membro ────────────────────────────────────────────────────────────
    if (action === "delete") {
      const { member_auth_id } = body;
      if (!member_auth_id) throw new Error("member_auth_id obrigatório");

      // Confirma que o perfil pertence ao dono
      const { data: perfil, error: perfilErr } = await adminClient
        .from("usuarios_perfil")
        .select("id")
        .eq("user_id", member_auth_id)
        .eq("escritorio_owner_id", caller.id)
        .maybeSingle();

      if (!perfilErr && perfil) {
        // Remove o usuário de autenticação
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
