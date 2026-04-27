import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "./db.js";
import { ensureArticlesSchema, fetchMeta, fetchNews } from "./data-store.js";
import { fetchForecast } from "./forecast.js";
import { fetchKevWatch } from "./kev.js";
import { fetchRecentCves } from "./cves.js";
import { ingestAll } from "./ingest.js";
import { mapToFrameworks } from "./frameworks.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "../public");
const PORT = Number.parseInt(process.env.PORT || "4000", 10);
const NODE_ENV = process.env.NODE_ENV || "development";
const INGEST_INTERVAL_MS = 30 * 60 * 1000;

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

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"]
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

function jsonResponse(data, status = 200) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  addSecurityHeaders(headers);
  return new Response(JSON.stringify(data), { status, headers });
}

function readBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return request.text();
  return request.json();
}

function resolvePage(pathname) {
  return PAGE_ROUTES.get(pathname) || null;
}

function mimeType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function safePathname(pathname) {
  if (pathname.includes("..")) return null;
  return resolvePage(pathname) || pathname;
}

function serveStatic(requestUrl) {
  const url = new URL(requestUrl);
  const pathname = safePathname(url.pathname);
  if (!pathname) return null;

  const filePath = path.join(PUBLIC_DIR, pathname.replace(/^\//, ""));
  if (!existsSync(filePath)) return null;

  const headers = new Headers({
    "Content-Type": mimeType(filePath),
    "Cache-Control": pathname.endsWith(".html") ? "no-store" : "public, max-age=31536000, immutable"
  });
  addSecurityHeaders(headers);
  return new Response(readFileSync(filePath), { status: 200, headers });
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

async function handleApi(request) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (url.pathname === "/api/news" && request.method === "GET") {
    return jsonResponse(
      await fetchNews(db, {
        limit: getNumber(url.searchParams.get("limit"), 1, 120, 80),
        offset: getNumber(url.searchParams.get("offset"), 0, Number.MAX_SAFE_INTEGER, 0),
        source: String(url.searchParams.get("source") || "").trim().slice(0, 120),
        fromDate: getDateString(url.searchParams.get("from")),
        toDate: getDateString(url.searchParams.get("to"))
      })
    );
  }

  if (url.pathname === "/api/meta" && request.method === "GET") {
    return jsonResponse(await fetchMeta(db));
  }

  if (url.pathname === "/api/refresh" && request.method === "POST") {
    const refreshToken = process.env.REFRESH_TOKEN;
    if (refreshToken) {
      const authHeader = request.headers.get("authorization") || "";
      if (authHeader !== `Bearer ${refreshToken}`) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
    }

    return jsonResponse({ ok: true, stats: await ingestAll(db) });
  }

  if (url.pathname === "/api/cves" && request.method === "GET") {
    return jsonResponse(await fetchRecentCves());
  }

  if (url.pathname === "/api/kev" && request.method === "GET") {
    return jsonResponse(await fetchKevWatch());
  }

  if (url.pathname === "/api/forecast" && request.method === "GET") {
    return jsonResponse(await fetchForecast(db));
  }

  if (url.pathname === "/api/framework-map" && request.method === "POST") {
    const payload = await readBody(request).catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const cveId = String(payload.cveId || "").trim().slice(0, 20);
    const summary = String(payload.summary || "").trim().slice(0, 5000);
    const title = String(payload.title || "").trim().slice(0, 5000);

    if (!summary && !title) {
      return jsonResponse({ error: "summary or title is required" }, 400);
    }

    return jsonResponse(mapToFrameworks({ cveId, summary, title }));
  }

  return null;
}

async function requestListener(request) {
  try {
    const apiResponse = await handleApi(request);
    if (apiResponse) return apiResponse;

    const staticResponse = serveStatic(request.url);
    if (staticResponse) return staticResponse;

    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    addSecurityHeaders(headers);
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
  } catch (error) {
    console.error(error);
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    addSecurityHeaders(headers);
    return new Response(JSON.stringify({ error: NODE_ENV === "production" ? "An error occurred processing your request" : String(error?.message || error) }), { status: 500, headers });
  }
}

async function boot() {
  await ensureArticlesSchema(db);
  await ingestAll(db);

  setInterval(() => {
    ingestAll(db).catch((error) => {
      console.error("Background ingestion failed", error);
    });
  }, INGEST_INTERVAL_MS);

  const server = http.createServer(async (req, res) => {
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : req;
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body
    });

    const response = await requestListener(request);
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const bodyBuffer = await response.arrayBuffer();
    res.end(Buffer.from(bodyBuffer));
  });

  server.listen(PORT, () => {
    console.log(`CyberPulse listening on http://localhost:${PORT}`);
  });

  process.on("SIGTERM", () => {
    server.close(() => process.exit(0));
  });
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  boot().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}