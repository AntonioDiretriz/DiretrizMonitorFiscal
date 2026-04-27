/**
 * Edge Function: pluggy-token
 * Gera um connectToken do Pluggy para abrir o widget no browser.
 */

const PLUGGY_CLIENT_ID     = Deno.env.get("PLUGGY_CLIENT_ID")!;
const PLUGGY_CLIENT_SECRET = Deno.env.get("PLUGGY_CLIENT_SECRET")!;
const PLUGGY_API           = "https://api.pluggy.ai";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function pluggyAuth(): Promise<string> {
  const res = await fetch(`${PLUGGY_API}/auth`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`Pluggy auth failed: ${await res.text()}`);
  const { apiKey } = await res.json();
  return apiKey as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const apiKey = await pluggyAuth();

    const tokenRes = await fetch(`${PLUGGY_API}/connect_token`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body:    JSON.stringify({}),
    });
    if (!tokenRes.ok) throw new Error(`Token error: ${await tokenRes.text()}`);

    const { accessToken } = await tokenRes.json();
    return json({ connectToken: accessToken });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
