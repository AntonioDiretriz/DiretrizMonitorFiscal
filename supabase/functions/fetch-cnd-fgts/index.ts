import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf";
const ORIGIN  = "https://consulta-crf.caixa.gov.br";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { cnpj, debug } = await req.json();
    const cnpjNumerico = (cnpj || "").replace(/\D/g, "");
    if (cnpjNumerico.length !== 14) {
      return json({ ok: false, motivo: "CNPJ inválido — informe 14 dígitos." });
    }

    // ── Passo 1: GET página inicial ──────────────────────────────────────────
    const pageRes = await fetch(BASE_URL, {
      headers: ua(),
      redirect: "follow",
    });

    if (!pageRes.ok) {
      return json({ ok: false, motivo: `Portal indisponível (HTTP ${pageRes.status}).`, url: BASE_URL });
    }

    const pageHtml = await pageRes.text();
    let cookies = collectCookies(pageRes.headers);

    // Diagnóstico: o que o GET retornou?
    const pageSnippet = pageHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 500).trim();
    const formFields  = extractFormFields(pageHtml);
    const hasViewState = !!formFields["javax.faces.ViewState"];

    if (!hasViewState) {
      return json({
        ok: false,
        motivo: "Portal não retornou formulário JSF válido.",
        debug_snippet: pageSnippet,
        debug_fields: Object.keys(formFields),
        url: BASE_URL,
      });
    }

    // Detectar campos dinamicamente
    const cnpjFieldName = findFieldName(pageHtml, [
      /name="([^"]*inscri[^"]*)"[^>]*/i,
      /name="([^"]*cnpj[^"]*)"[^>]*/i,
    ]) ?? "consultaEmpregadorForm:inscricao";

    const btnFieldName = findFieldName(pageHtml, [
      /name="([^"]*btnConsultar[^"]*)"[^>]*/i,
      /name="([^"]*consultar[^"]*)"[^>]*value="Consultar"/i,
    ]) ?? "consultaEmpregadorForm:btnConsultar";

    const tipoFieldName = findFieldName(pageHtml, [
      /name="([^"]*tipoInscricao[^"]*)"[^>]*/i,
      /name="([^"]*tipo[^"]*)"[^>]*/i,
    ]);

    const formActionMatch = pageHtml.match(/<form[^>]+action="([^"]+)"/i);
    const formAction = formActionMatch
      ? (formActionMatch[1].startsWith("http") ? formActionMatch[1] : `${ORIGIN}${formActionMatch[1]}`)
      : BASE_URL;

    // ── Passo 2: POST com CNPJ ───────────────────────────────────────────────
    const body = new URLSearchParams(formFields);
    body.set(cnpjFieldName, cnpjNumerico);
    body.set(btnFieldName, "Consultar");
    if (tipoFieldName) body.set(tipoFieldName, "CNPJ");

    const postRes = await fetch(formAction, {
      method: "POST",
      headers: {
        ...ua(),
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookies,
        "Referer": BASE_URL,
        "Origin": ORIGIN,
      },
      body: body.toString(),
      redirect: "follow",
    });

    const resultHtml = await postRes.text();
    cookies = mergeCookies(cookies, collectCookies(postRes.headers));
    const lower = resultHtml.toLowerCase();
    const resultSnippet = resultHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 800).trim();

    // ── Passo 3: Interpretar resposta ────────────────────────────────────────

    if (lower.includes("captcha") || lower.includes("robô") || lower.includes("robot")) {
      return json({ ok: false, motivo: "Portal exigiu CAPTCHA.", url: BASE_URL });
    }

    if (lower.includes("irregular") || lower.includes("pendên") || lower.includes("penden")) {
      const motivo = extrairTexto(resultHtml, [
        /class="[^"]*mensagem[^"]*"[^>]*>([^<]{10,})</i,
        /<td[^>]*>([^<]*débito[^<]{5,})</i,
      ]) ?? "Existem débitos pendentes de regularização junto ao FGTS.";
      return json({ ok: true, tipo: "irregular", status: "irregular", mensagem: motivo });
    }

    if (lower.includes("regular")) {
      const datasResultado = extrairDatasValidade(resultHtml);
      const crfUrl = encontrarLinkCrf(resultHtml);

      if (!crfUrl) {
        return json({
          ok: true, tipo: "regular", status: "regular",
          mensagem: "Empresa em situação regular perante o FGTS.",
          ...datasResultado,
          ...(debug ? { debug_snippet: resultSnippet, debug_cnjp_field: cnpjFieldName, debug_btn_field: btnFieldName } : {}),
        });
      }

      // ── Passo 4: GET página CRF ───────────────────────────────────────────
      try {
        const crfRes = await fetch(crfUrl, {
          headers: { ...ua(), "Cookie": cookies, "Referer": BASE_URL },
          redirect: "follow",
        });
        const crfHtml = await crfRes.text();
        const datas = extrairDatasValidade(crfHtml);
        const numCert = extrairNumeroCertificado(crfHtml);
        const datasFinais = Object.keys(datas).length > 0 ? datas : datasResultado;

        return json({
          ok: true, tipo: "regular", status: "regular",
          mensagem: "Empresa em situação regular — CRF emitido.",
          ...datasFinais,
          ...(numCert ? { numero_certificado: numCert } : {}),
        });
      } catch {
        return json({
          ok: true, tipo: "regular", status: "regular",
          mensagem: "Empresa em situação regular perante o FGTS.",
          ...datasResultado,
        });
      }
    }

    // Resposta inesperada — retornar diagnóstico completo
    return json({
      ok: false,
      motivo: "Resposta inesperada do portal.",
      debug_snippet: resultSnippet,
      debug_cnpj_field: cnpjFieldName,
      debug_btn_field: btnFieldName,
      debug_form_action: formAction,
      debug_fields_sent: Object.fromEntries(body.entries()),
      url: BASE_URL,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, motivo: `Erro interno: ${msg}`, url: BASE_URL });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ua() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Cache-Control": "no-cache",
  };
}

function extractFormFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]+type=["']hidden["'][^>]*>/gi)) {
    const name  = m[0].match(/name=["']([^"']+)["']/)?.[1];
    const value = m[0].match(/value=["']([^"']*)["']/)?.[1] ?? "";
    if (name) fields[name] = value;
  }
  for (const m of html.matchAll(/<select[^>]+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi)) {
    const name = m[1];
    const sel  = m[2].match(/<option[^>]+selected[^>]*value=["']([^"']*)["']/i)?.[1]
              ?? m[2].match(/<option[^>]+value=["']([^"']*)["']/i)?.[1] ?? "";
    if (name) fields[name] = sel;
  }
  return fields;
}

function findFieldName(html: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function encontrarLinkCrf(html: string): string | null {
  const patterns = [
    /href=["']([^"']*certificado[^"']*regularidade[^"']*)["']/i,
    /href=["']([^"']*crf[^"']*)["']/i,
    /href=["']([^"']*certificado[^"']*)["'][^>]*>/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      return m[1].startsWith("http") ? m[1] : `${ORIGIN}${m[1]}`;
    }
  }
  return null;
}

function extrairDatasValidade(html: string): { data_emissao?: string; data_validade?: string } {
  const m = html.match(/Validade[:\s]*(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!m) return {};
  const [, d1, m1, y1, d2, m2, y2] = m;
  return { data_emissao: `${y1}-${m1}-${d1}`, data_validade: `${y2}-${m2}-${d2}` };
}

function extrairNumeroCertificado(html: string): string | null {
  return (html.match(/Certifica[çc][aã]o?\s+N[úu]mero[:\s]*(\d{10,})/i)
       ?? html.match(/Certificado\s+N[úu]mero[:\s]*(\d{10,})/i))?.[1] ?? null;
}

function extrairTexto(html: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].replace(/<[^>]+>/g, "").trim();
  }
  return null;
}

function collectCookies(headers: Headers): string {
  return (headers.get("set-cookie") ?? "")
    .split(",").map(c => c.split(";")[0].trim()).filter(Boolean).join("; ");
}

function mergeCookies(a: string, b: string): string {
  const map = new Map<string, string>();
  for (const s of [a, b]) {
    for (const pair of s.split(";").map(x => x.trim()).filter(Boolean)) {
      const eq = pair.indexOf("=");
      if (eq > 0) map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
