const page = "__INDEX_HTML__";
const styles = "__STYLES_CSS__";
const app = "__APP_JS__";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "https://rutvi18.github.io",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function validClientId(value) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

function isoDate(value) {
  if (!value) return new Date().toISOString();
  const normalized = String(value).replace(" ", "T");
  return normalized.endsWith("Z") ? normalized : `${normalized}Z`;
}

async function readPayload(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function getFund(request, env) {
  const clientId = new URL(request.url).searchParams.get("clientId") || "";
  const [recentResult, totalResult] = await env.DB.batch([
    env.DB.prepare("SELECT id, owner_id, amount, created_at FROM contributions ORDER BY created_at DESC, id DESC LIMIT 50"),
    env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM contributions")
  ]);
  const contributions = (recentResult.results || []).map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    date: isoDate(row.created_at),
    isOwn: validClientId(clientId) && row.owner_id === clientId
  }));
  return json({ contributions, total: Number(totalResult.results?.[0]?.total || 0) });
}

async function addToFund(request, env) {
  const payload = await readPayload(request);
  const amount = Math.round(Number(payload.amount));
  const clientId = payload.clientId;
  if (!validClientId(clientId)) return json({ error: "A valid browser ID is required" }, 400);
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) {
    return json({ error: "Enter an amount between ₹1 and ₹10,00,000" }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const [insertResult, totalResult] = await env.DB.batch([
    env.DB.prepare("INSERT INTO contributions (id, owner_id, amount, created_at) SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM contributions WHERE owner_id = ?) < 500")
      .bind(id, clientId, amount, createdAt, clientId),
    env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM contributions")
  ]);
  if (!insertResult.meta?.changes) return json({ error: "This browser has reached its contribution limit" }, 429);
  return json({
    contribution: { id, amount, date: createdAt, isOwn: true },
    total: Number(totalResult.results?.[0]?.total || 0)
  }, 201);
}

async function removeFromFund(request, env, id) {
  const payload = await readPayload(request);
  const clientId = payload.clientId;
  if (!validClientId(clientId)) return json({ error: "A valid browser ID is required" }, 400);
  const [deleteResult, totalResult] = await env.DB.batch([
    env.DB.prepare("DELETE FROM contributions WHERE id = ? AND owner_id = ?").bind(id, clientId),
    env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM contributions")
  ]);
  if (!deleteResult.meta?.changes) return json({ error: "Only your own contributions can be removed" }, 404);
  return json({ total: Number(totalResult.results?.[0]?.total || 0) });
}

async function clearOwnFund(request, env) {
  const payload = await readPayload(request);
  const clientId = payload.clientId;
  if (!validClientId(clientId)) return json({ error: "A valid browser ID is required" }, 400);
  const [, totalResult] = await env.DB.batch([
    env.DB.prepare("DELETE FROM contributions WHERE owner_id = ?").bind(clientId),
    env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM contributions")
  ]);
  return json({ total: Number(totalResult.results?.[0]?.total || 0) });
}

async function handleApi(request, env, path) {
  if (!env.DB) return json({ error: "Shared savings database is unavailable" }, 503);
  if (path === "/api/savings" && request.method === "GET") return getFund(request, env);
  if (path === "/api/savings" && request.method === "POST") return addToFund(request, env);
  if (path === "/api/savings" && request.method === "DELETE") return clearOwnFund(request, env);
  if (path.startsWith("/api/savings/") && request.method === "DELETE") {
    return removeFromFund(request, env, decodeURIComponent(path.slice("/api/savings/".length)));
  }
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (path.startsWith("/api/") && request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: jsonHeaders });
      }
      if (path.startsWith("/api/")) return await handleApi(request, env, path);
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
      if (path === "/" || path === "/index.html") return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
      if (path === "/styles.css") return new Response(styles, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-cache" } });
      if (path === "/app.js") return new Response(app, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" } });
      return new Response("Not found", { status: 404 });
    } catch (error) {
      console.error("Worker request failed", error);
      return path.startsWith("/api/")
        ? json({ error: "The shared fund is temporarily unavailable" }, 500)
        : new Response("The site is temporarily unavailable", { status: 500 });
    }
  }
};
