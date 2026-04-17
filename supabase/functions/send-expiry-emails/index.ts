import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_NUMBER           = Deno.env.get("WHATSAPP_NUMBER") ?? "5581994058847";
const FUNCTIONS_BASE            = `${SUPABASE_URL.replace("https://", "https://").split(".supabase.co")[0]}.supabase.co/functions/v1`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Registra notificação e retorna o ID para rastreamento ──────────────────
async function criarNotificacao(params: {
  user_id: string;
  tipo: string;
  referencia_id: string;
  destinatario_email: string;
  destinatario_nome?: string;
  assunto: string;
  dias_aviso: number;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from("email_notificacoes")
    .insert(params)
    .select("id")
    .single();
  if (error) { console.error("criarNotificacao:", error); return null; }
  return data?.id ?? null;
}

// ── Envia email via Resend ────────────────────────────────────────────────
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
      from: "Diretriz <noreply@diretriz.cnt.br>",
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

// ── URL de rastreamento de abertura (pixel) ───────────────────────────────
function pixelUrl(notifId: string) {
  return `${FUNCTIONS_BASE}/track-email-open?id=${notifId}`;
}

// ── URL de rastreamento de clique + redirecionamento ──────────────────────
function clickUrl(notifId: string, destino: string) {
  return `${FUNCTIONS_BASE}/track-email-click?id=${notifId}&dest=${encodeURIComponent(destino)}`;
}


// ── Template base de email ────────────────────────────────────────────────
function emailBase(titulo: string, corpo: string, notifId: string, cta?: { label: string; urlApp: string; urlWeb: string }) {
  const botoes = cta
    ? `<div style="text-align:center;margin:32px 0">
         <p style="color:#6b7280;font-size:13px;margin-bottom:16px">Escolha como prefere falar conosco:</p>
         <div style="display:inline-flex;gap:12px;flex-wrap:wrap;justify-content:center">
           <a href="${cta.urlApp}" style="background:#25d366;color:#fff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block">
             📱 WhatsApp — Celular
           </a>
           <a href="${cta.urlWeb}" style="background:#128c7e;color:#fff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block">
             💻 WhatsApp — Computador
           </a>
         </div>
       </div>`
    : "";
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px">
      <div style="background:#1a56db;padding:20px 24px;border-radius:8px 8px 0 0;text-align:center">
        <span style="color:#fff;font-size:22px;font-weight:bold">Diretriz Contabilidade</span>
      </div>
      <div style="background:#fff;padding:28px 32px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb">
        <h2 style="color:#111827;margin-top:0">${titulo}</h2>
        ${corpo}
        ${botoes}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="color:#9ca3af;font-size:12px;text-align:center">
          Diretriz Contabilidade e Consultoria · <a href="https://diretriz.cnt.br" style="color:#9ca3af">diretriz.cnt.br</a>
        </p>
      </div>
      <img src="${pixelUrl(notifId)}" width="1" height="1" style="display:none" />
    </div>`;
}

serve(async () => {
  const today = new Date();
  const in7   = new Date(today); in7.setDate(today.getDate() + 7);
  const in15  = new Date(today); in15.setDate(today.getDate() + 15);
  const in30  = new Date(today); in30.setDate(today.getDate() + 30);
  const fmt   = (d: Date) => d.toISOString().split("T")[0];

  const nivelPorDias = (dias: number) => dias <= 7 ? "critico" : dias <= 15 ? "urgente" : "aviso";
  const diasDe = (dateStr: string) => {
    if (dateStr === fmt(in7))  return 7;
    if (dateStr === fmt(in15)) return 15;
    return 30;
  };

  // ── Certidões vencendo em 7, 15 ou 30 dias ──────────────────────────────
  const { data: certidoes } = await supabase
    .from("certidoes")
    .select("*, empresas(razao_social, email_responsavel)")
    .in("data_validade", [fmt(in7), fmt(in15), fmt(in30)])
    .in("status", ["regular", "vencendo"]);

  for (const cert of certidoes ?? []) {
    const email = cert.empresas?.email_responsavel;
    if (!email) continue;
    const dias  = diasDe(cert.data_validade);
    const razao = cert.empresas?.razao_social ?? "";
    const assunto = `[Diretriz] Certidão vencendo em ${dias} dias — ${razao}`;

    const notifId = await criarNotificacao({
      user_id: cert.user_id, tipo: "certidao", referencia_id: cert.id,
      destinatario_email: email, assunto, dias_aviso: dias,
    });
    if (!notifId) continue;

    await sendEmail(email, assunto, emailBase(
      `Certidão vencendo em ${dias} dias`,
      `<p>Olá,</p>
       <p>A certidão <strong>${cert.tipo.replace(/_/g, " ").toUpperCase()}</strong> da empresa
       <strong>${razao}</strong> vence em <strong>${dias} dias</strong> (${cert.data_validade}).</p>
       <p>Acesse o sistema para acompanhar a renovação.</p>`,
      notifId
    ));

    await supabase.from("alertas").insert({
      user_id: cert.user_id, empresa_id: cert.empresa_id, certidao_id: cert.id,
      nivel: nivelPorDias(dias),
      titulo: `Certidão vencendo em ${dias} dias`,
      mensagem: `A certidão ${cert.tipo} de ${razao} vence em ${dias} dias (${cert.data_validade}).`,
      acao_recomendada: "Renove a certidão antes do vencimento para evitar irregularidades.",
    });
  }

  // ── Certificados Digitais vencendo em 7, 15 ou 30 dias ──────────────────
  const { data: certificados } = await supabase
    .from("certificados")
    .select("*")
    .in("data_validade", [fmt(in7), fmt(in15), fmt(in30)]);

  for (const cert of certificados ?? []) {
    if (!cert.email_cliente) continue;
    const dias    = diasDe(cert.data_validade);
    const assunto = `[Diretriz] Certificado Digital vencendo em ${dias} dias — ${cert.empresa}`;
    const waMsg   = `Olá! Sou da Diretriz Contabilidade. O certificado digital ${cert.tipo} da empresa ${cert.empresa} vence em ${dias} dias (${cert.data_validade}). Podemos agendar a renovação?`;

    // Deduplicação: só envia se não houver alerta não-resolvido para este certificado com mesma contagem de dias
    const { data: alertaExist } = await supabase.from("alertas")
      .select("id").eq("user_id", cert.user_id)
      .ilike("titulo", `%Certificado digital vencendo em ${dias} dias%`)
      .eq("resolvida", false).limit(1);
    if (alertaExist && alertaExist.length > 0) continue;

    const notifId = await criarNotificacao({
      user_id: cert.user_id, tipo: "certificado", referencia_id: cert.id,
      destinatario_email: cert.email_cliente, destinatario_nome: cert.empresa,
      assunto, dias_aviso: dias,
    });
    if (!notifId) continue;

    await sendEmail(cert.email_cliente, assunto, emailBase(
      `Certificado Digital vencendo em ${dias} dias`,
      `<p>Olá,</p>
       <p>O <strong>Certificado Digital ${cert.tipo}</strong> da empresa
       <strong>${cert.empresa}</strong> vence em <strong>${dias} dias</strong>
       (${cert.data_validade}).</p>
       <p>Entre em contato conosco para agendar a renovação com antecedência e evitar interrupções nos seus serviços digitais.</p>`,
      notifId,
      {
        label: "WhatsApp",
        urlApp: clickUrl(notifId, `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waMsg)}`),
        urlWeb: clickUrl(notifId, `https://web.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(waMsg)}`),
      }
    ));

    await supabase.from("alertas").insert({
      user_id: cert.user_id, empresa_id: cert.empresa_id ?? null,
      nivel: nivelPorDias(dias),
      titulo: `Certificado digital vencendo em ${dias} dias — ${cert.empresa}`,
      mensagem: `O certificado ${cert.tipo} de ${cert.empresa} vence em ${dias} dias (${cert.data_validade}).`,
      acao_recomendada: "Providencie a renovação do certificado digital.",
    });
  }

  // ── Caixas Postais vencendo em 7, 15 ou 30 dias ─────────────────────────
  const { data: caixas } = await supabase
    .from("caixas_postais")
    .select("*")
    .in("data_vencimento", [fmt(in7), fmt(in15), fmt(in30)])
    .eq("contrato_status", "ativo");

  for (const caixa of caixas ?? []) {
    const dias    = diasDe(caixa.data_vencimento);
    const assunto = `[Diretriz] Caixa Postal vencendo em ${dias} dias — ${caixa.empresa}`;
    const waMsg   = `Olá! Sou da Diretriz Contabilidade. O contrato da Caixa Postal nº ${caixa.numero} da empresa ${caixa.empresa} vence em ${dias} dias (${caixa.data_vencimento}). Podemos providenciar a renovação?`;

    if (caixa.email_responsavel) {
      const notifId = await criarNotificacao({
        user_id: caixa.user_id, tipo: "caixa_postal", referencia_id: caixa.id,
        destinatario_email: caixa.email_responsavel, destinatario_nome: caixa.empresa,
        assunto, dias_aviso: dias,
      });

      if (notifId) {
        await sendEmail(caixa.email_responsavel, assunto, emailBase(
          `Caixa Postal vencendo em ${dias} dias`,
          `<p>Olá,</p>
           <p>O contrato da <strong>Caixa Postal nº ${caixa.numero}</strong> da empresa
           <strong>${caixa.empresa}</strong> vence em <strong>${dias} dias</strong>
           (${caixa.data_vencimento}).</p>
           <p>Entre em contato conosco para renovar o contrato com antecedência e manter o endereço postal ativo.</p>`,
          notifId,
          {
            label: "WhatsApp",
            urlApp: clickUrl(notifId, `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waMsg)}`),
            urlWeb: clickUrl(notifId, `https://web.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(waMsg)}`),
          }
        ));
      }
    }

    // Deduplicação caixa postal
    const { data: alertaCaixaExist } = await supabase.from("alertas")
      .select("id").eq("user_id", caixa.user_id)
      .ilike("titulo", `%Caixa Postal%${caixa.numero}%`)
      .eq("resolvida", false).limit(1);
    if (!alertaCaixaExist || alertaCaixaExist.length === 0) {
      await supabase.from("alertas").insert({
        user_id: caixa.user_id, empresa_id: caixa.empresa_id ?? null,
        nivel: nivelPorDias(dias),
        titulo: `Caixa Postal nº ${caixa.numero} vencendo em ${dias} dias — ${caixa.empresa}`,
        mensagem: `O contrato da Caixa Postal nº ${caixa.numero} de ${caixa.empresa} vence em ${dias} dias (${caixa.data_vencimento}).`,
        acao_recomendada: "Renove o contrato da caixa postal antes do vencimento.",
      });
    }
  }

  // ── Contas a Pagar vencendo em 3 ou 7 dias ───────────────────────────────
  const in3 = new Date(today); in3.setDate(today.getDate() + 3);
  const { data: contasPagar } = await supabase
    .from("contas_pagar")
    .select("*, empresas(razao_social, email_responsavel)")
    .in("data_vencimento", [fmt(in3), fmt(in7)])
    .in("status", ["pendente", "aprovado"]);

  for (const conta of contasPagar ?? []) {
    const dias  = conta.data_vencimento === fmt(in3) ? 3 : 7;
    const email = conta.empresas?.email_responsavel;
    if (email) {
      const assunto = `[Diretriz] Conta a pagar vencendo em ${dias} dias — ${conta.fornecedor}`;
      const notifId = await criarNotificacao({
        user_id: conta.user_id, tipo: "conta_pagar", referencia_id: conta.id,
        destinatario_email: email, assunto, dias_aviso: dias,
      });
      if (notifId) {
        await sendEmail(email, assunto, emailBase(
          `Conta a pagar vencendo em ${dias} dias`,
          `<p>Olá,</p>
           <p>A conta a pagar para <strong>${conta.fornecedor}</strong>
           no valor de <strong>R$ ${Number(conta.valor).toFixed(2).replace(".", ",")}</strong>
           vence em <strong>${dias} dias</strong> (${conta.data_vencimento}).</p>
           <p>Acesse o sistema para registrar o pagamento.</p>`,
          notifId
        ));
      }
    }

    const titulo = `Conta a pagar: ${conta.fornecedor} vence em ${dias} dias`;
    const { data: jaExiste } = await supabase
      .from("alertas").select("id")
      .eq("user_id", conta.user_id).eq("titulo", titulo).eq("resolvida", false).limit(1);
    if (!jaExiste || jaExiste.length === 0) {
      await supabase.from("alertas").insert({
        user_id: conta.user_id, empresa_id: conta.empresa_id,
        nivel: dias === 3 ? "critico" : "aviso", titulo,
        mensagem: `Conta a pagar para ${conta.fornecedor} no valor de R$ ${Number(conta.valor).toFixed(2).replace(".", ",")} vence em ${dias} dias (${conta.data_vencimento}).`,
        acao_recomendada: "Registre o pagamento antes do vencimento para evitar juros.",
      });
    }
  }

  // ── Aniversários de Sócios ────────────────────────────────────────────────
  const todayMM = String(today.getMonth() + 1).padStart(2, "0");
  const todayDD = String(today.getDate()).padStart(2, "0");

  const { data: todosSocios } = await supabase
    .from("socios")
    .select("*, empresas(razao_social, email_responsavel)")
    .not("data_nascimento", "is", null);

  const aniversariantes = (todosSocios ?? []).filter((s: any) => {
    if (!s.data_nascimento) return false;
    const [, mm, dd] = (s.data_nascimento as string).split("-");
    return mm === todayMM && dd === todayDD;
  });

  for (const socio of aniversariantes) {
    const tituloAlerta = `Aniversário hoje: ${socio.nome}`;
    const { data: jaExiste } = await supabase
      .from("alertas").select("id")
      .eq("user_id", socio.user_id).eq("titulo", tituloAlerta)
      .gte("created_at", fmt(today)).limit(1);
    if (jaExiste && jaExiste.length > 0) continue;

    await supabase.from("alertas").insert({
      user_id: socio.user_id, empresa_id: socio.empresa_id, nivel: "info",
      titulo: tituloAlerta,
      mensagem: `Hoje é aniversário de ${socio.nome}, sócio de ${socio.empresas?.razao_social}. Não se esqueça de parabenizá-lo!`,
      acao_recomendada: "Envie uma mensagem de parabéns ao sócio.",
    });

    const { data: ownerData } = await supabase.auth.admin.getUserById(socio.user_id);
    const ownerEmail = ownerData?.user?.email;
    if (ownerEmail) {
      const idade = today.getFullYear() - Number((socio.data_nascimento as string).split("-")[0]);
      const assunto = `[Diretriz] Aniversário hoje: ${socio.nome} (${socio.empresas?.razao_social})`;
      const notifId = await criarNotificacao({
        user_id: socio.user_id, tipo: "aniversario", referencia_id: socio.id,
        destinatario_email: ownerEmail, assunto, dias_aviso: 0,
      });
      if (notifId) {
        await sendEmail(ownerEmail, assunto, emailBase(
          `Aniversário hoje: ${socio.nome}`,
          `<p>Olá,</p>
           <p>Hoje é aniversário de <strong>${socio.nome}</strong>, sócio de
           <strong>${socio.empresas?.razao_social}</strong>
           ${socio.cargo ? `(${socio.cargo})` : ""} — <strong>${idade} anos</strong>.</p>
           ${socio.email ? `<p>E-mail do sócio: <a href="mailto:${socio.email}">${socio.email}</a></p>` : ""}
           <p>Não se esqueça de enviar os parabéns!</p>`,
          notifId
        ));
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      certidoes:       certidoes?.length    ?? 0,
      certificados:    certificados?.length ?? 0,
      caixas:          caixas?.length       ?? 0,
      contas_pagar:    contasPagar?.length  ?? 0,
      aniversariantes: aniversariantes.length,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
