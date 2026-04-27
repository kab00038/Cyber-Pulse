import { ensureArticlesSchema, fetchMeta, fetchNews } from "./data-store.js";
import { fetchForecast } from "./forecast.js";
import { fetchKevWatch } from "./kev.js";
import { fetchRecentCves } from "./cves.js";
import { ingestAll } from "./ingest.js";
import { mapToFrameworks } from "./frameworks.js";

const PAGE_ROUTES = new Map([
  ["/", "/dashboard.html"],
  ["/dashboard", "/dashboard.html"],
  ["/threat-intel", "/threat-intel.html"],
  ["/intel", "/threat-intel.html"],
  ["/cves", "/cves.html"],
  ["/kev", "/kev.html"],
  ["/forecast", "/forecast.html"],
  ["/statistics", "/statistics.html"],
  ["/vulnerabilities", "/statistics.html"],
  ["/exploit-watch", "/statistics.html"],
  ["/weather", "/forecast.html"]
]);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://services.nvd.nist.gov https://www.cisa.gov https://cybermap.kaspersky.com; frame-src https://cybermap.kaspersky.com; frame-ancestors 'none';"
};

function addSecurityHeaders(headers) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
}

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  addSecurityHeaders(headers);
  return new Response(JSON.stringify(data), { ...init, headers });
}

function routeStaticRequest(request, env) {
  const url = new URL(request.url);
  const targetPath = PAGE_ROUTES.get(url.pathname);
  if (!targetPath) return null;

  const rewritten = new Request(new URL(targetPath, request.url).toString(), request);
  return env.ASSETS.fetch(rewritten);
}

function getNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function getDateString(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().split("T")[0];
}

async function ensureSchemaOnce(env) {
  if (env.__schemaReady) return;
  await ensureArticlesSchema(env.DB);
  env.__schemaReady = true;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const isApiRoute = url.pathname.startsWith("/api/");

  if (!isApiRoute) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return json({ ok: true });
  }

  await ensureSchemaOnce(env);

  if (url.pathname === "/api/news" && request.method === "GET") {
    return json(
      await fetchNews(env.DB, {
        limit: getNumber(url.searchParams.get("limit"), 1, 120, 80),
        offset: getNumber(url.searchParams.get("offset"), 0, Number.MAX_SAFE_INTEGER, 0),
        source: String(url.searchParams.get("source") || "").trim().slice(0, 120),
        fromDate: getDateString(url.searchParams.get("from")),
        toDate: getDateString(url.searchParams.get("to"))
      })
    );
  }

  if (url.pathname === "/api/meta" && request.method === "GET") {
    return json(await fetchMeta(env.DB));
  }

  if (url.pathname === "/api/refresh" && request.method === "POST") {
    const refreshToken = env.REFRESH_TOKEN;
    if (refreshToken) {
      const authHeader = request.headers.get("authorization") || "";
      if (authHeader !== `Bearer ${refreshToken}`) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    return json({ ok: true, stats: await ingestAll(env.DB) });
  }

  if (url.pathname === "/api/cves" && request.method === "GET") {
    return json(await fetchRecentCves());
  }

  if (url.pathname === "/api/kev" && request.method === "GET") {
    return json(await fetchKevWatch());
  }

  if (url.pathname === "/api/forecast" && request.method === "GET") {
    return json(await fetchForecast(env.DB));
  }

  if (url.pathname === "/api/framework-map" && request.method === "POST") {
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return json({ error: "Invalid request body" }, { status: 400 });
    }

    const cveId = String(payload.cveId || "").trim().slice(0, 20);
    const summary = String(payload.summary || "").trim().slice(0, 5000);
    const title = String(payload.title || "").trim().slice(0, 5000);

    if (!summary && !title) {
      return json({ error: "summary or title is required" }, { status: 400 });
    }

    return json(mapToFrameworks({ cveId, summary, title }));
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const apiResponse = await handleApi(request, env);
      if (apiResponse) return apiResponse;

      const staticResponse = routeStaticRequest(request, env);
      if (staticResponse) return staticResponse;

      return json({ error: "Not found" }, { status: 404 });
    } catch (error) {
      console.error("Worker request failure", {
        method: request.method,
        url: request.url,
        message: String(error?.message || error)
      });
      return json({ error: "Internal Server Error" }, { status: 500 });
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(ensureSchemaOnce(env).then(() => ingestAll(env.DB)));
  }
};