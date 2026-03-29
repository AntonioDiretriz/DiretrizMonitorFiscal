import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email to", to);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Monitor Fiscal <noreply@diretriz.com.br>",
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

serve(async () => {
  const today = new Date();
  const in7 = new Date(today); in7.setDate(today.getDate() + 7);
  const in30 = new Date(today); in30.setDate(today.getDate() + 30);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  // ── Certidões expiring in 7 or 30 days ──────────────────────────────────
  const { data: certidoes } = await supabase
    .from("certidoes")
    .select("*, empresas(razao_social, email_responsavel)")
    .in("data_validade", [fmt(in7), fmt(in30)])
    .in("status", ["regular", "vencendo"]);

  for (const cert of certidoes ?? []) {
    const email = cert.empresas?.email_responsavel;
    if (!email) continue;
    const dias = cert.data_validade === fmt(in7) ? 7 : 30;
    await sendEmail(
      email,
      `[Monitor Fiscal] Certidão vencendo em ${dias} dias — ${cert.empresas?.razao_social}`,
      `<p>Olá,</p>
       <p>A certidão <strong>${cert.tipo.replace(/_/g, " ").toUpperCase()}</strong> da empresa
       <strong>${cert.empresas?.razao_social}</strong> vence em <strong>${dias} dias</strong>
       (${cert.data_validade}).</p>
       <p>Acesse o Monitor Fiscal para renová-la.</p>`
    );
    // Create alert in the system
    await supabase.from("alertas").insert({
      user_id: cert.user_id,
      empresa_id: cert.empresa_id,
      certidao_id: cert.id,
      nivel: dias === 7 ? "critico" : "aviso",
      titulo: `Certidão vencendo em ${dias} dias`,
      mensagem: `A certidão ${cert.tipo} de ${cert.empresas?.razao_social} vence em ${dias} dias.`,
      acao_recomendada: "Renove a certidão antes do vencimento para evitar irregularidades.",
    });
  }

  // ── Certificados expiring in 7 or 30 days ────────────────────────────────
  const { data: certificados } = await supabase
    .from("certificados")
    .select("*")
    .in("data_vencimento", [fmt(in7), fmt(in30)]);

  for (const cert of certificados ?? []) {
    if (!cert.email_cliente) continue;
    const dias = cert.data_vencimento === fmt(in7) ? 7 : 30;
    await sendEmail(
      cert.email_cliente,
      `[Monitor Fiscal] Certificado Digital vencendo em ${dias} dias — ${cert.empresa}`,
      `<p>Olá,</p>
       <p>O certificado digital <strong>${cert.tipo}</strong> da empresa
       <strong>${cert.empresa}</strong> vence em <strong>${dias} dias</strong>
       (${cert.data_vencimento}).</p>
       <p>Contate seu contador para a renovação.</p>`
    );
    // Create alert
    await supabase.from("alertas").insert({
      user_id: cert.user_id,
      nivel: dias === 7 ? "critico" : "aviso",
      titulo: `Certificado digital vencendo em ${dias} dias`,
      mensagem: `O certificado ${cert.tipo} de ${cert.empresa} vence em ${dias} dias.`,
      acao_recomendada: "Providencie a renovação do certificado digital.",
    });
  }

  // ── Caixas Postais expiring in 7 or 30 days ─────────────────────────────
  const { data: caixas } = await supabase
    .from("caixas_postais")
    .select("*")
    .in("data_vencimento", [fmt(in7), fmt(in30)])
    .eq("contrato_status", "ativo");

  for (const caixa of caixas ?? []) {
    const dias = caixa.data_vencimento === fmt(in7) ? 7 : 30;
    if (caixa.email_responsavel) {
      await sendEmail(
        caixa.email_responsavel,
        `[Monitor Fiscal] Caixa Postal vencendo em ${dias} dias — ${caixa.empresa}`,
        `<p>Olá,</p>
         <p>O contrato da Caixa Postal <strong>nº ${caixa.numero}</strong> da empresa
         <strong>${caixa.empresa}</strong> vence em <strong>${dias} dias</strong>
         (${caixa.data_vencimento}).</p>
         <p>Acesse o Monitor Fiscal para realizar a renovação.</p>`
      );
    }
    await supabase.from("alertas").insert({
      user_id: caixa.user_id,
      empresa_id: caixa.empresa_id,
      caixa_postal_id: caixa.id,
      nivel: dias === 7 ? "critico" : "aviso",
      titulo: `Caixa Postal vencendo em ${dias} dias`,
      mensagem: `O contrato da Caixa Postal nº ${caixa.numero} de ${caixa.empresa} vence em ${dias} dias (${caixa.data_vencimento}).`,
      acao_recomendada: "Renove o contrato da caixa postal antes do vencimento.",
    });
  }

  return new Response(
    JSON.stringify({ ok: true, certidoes: certidoes?.length ?? 0, certificados: certificados?.length ?? 0, caixas: caixas?.length ?? 0 }),
    { headers: { "Content-Type": "application/json" } }
  );
});
