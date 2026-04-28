/**
 * Edge Function: belvo-token
 * Gera um access token do Belvo para abrir o widget de conexão.
 */

const BELVO_SECRET_ID       = Deno.env.get("BELVO_SECRET_ID")!;
const BELVO_SECRET_PASSWORD = Deno.env.get("BELVO_SECRET_PASSWORD")!;
const BELVO_API             = "https://sandbox.belvo.com";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const credentials = btoa(`${BELVO_SECRET_ID}:${BELVO_SECRET_PASSWORD}`);

    const res = await fetch(`${BELVO_API}/api/token/`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Basic ${credentials}`,
      },
      body: JSON.stringify({
        scopes: "read_institutions,read_accounts,read_transactions,write_links",
      }),
    });

    if (!res.ok) throw new Error(`Belvo token error: ${await res.text()}`);
    const data = await res.json();
    return json({ accessToken: data.access });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
