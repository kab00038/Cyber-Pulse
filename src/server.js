import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import db from "./db.js";
import { ingestAll } from "./ingest.js";
import { fetchRecentCves } from "./cves.js";
import { fetchKevWatch } from "./kev.js";
import { fetchForecast } from "./forecast.js";
import { mapToFrameworks } from "./frameworks.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = process.env.PORT || 4000;
const INGEST_INTERVAL_MS = 30 * 60 * 1000;
const NODE_ENV = process.env.NODE_ENV || "development";

// Disable version disclosure
app.disable("x-powered-by");

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none';"
  );
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// CORS Configuration
app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:4000", "http://localhost:3000"];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || !NODE_ENV.includes("production")) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false
});

const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many refresh requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false
});

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "../public"), { index: false }));

// Input Validation Helpers
function validateInteger(value, min = 0, max = 120) {
  const num = parseInt(value, 10);
  if (isNaN(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function validateDateString(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function validateSource(value, validSources) {
  if (!value) return "";
  return validSources.includes(value) ? value : "";
}

function getSafeErrorMessage(error) {
  if (NODE_ENV === "production") {
    return "An error occurred processing your request";
  }
  return String(error?.message || error);
}

// Get list of valid sources for validation
const validSourcesList = [
  "CISA",
  "CISA Alerts",
  "NCSC UK",
  "Cisco Talos",
  "Palo Alto Unit 42",
  "CrowdStrike",
  "Microsoft Security",
  "Google Threat Analysis Group"
];


const feedQuery = db.prepare(`
  SELECT id, source, title, link, summary, published_at AS publishedAt
  FROM articles
  WHERE (@source = '' OR source = @source)
    AND (@fromDate = '' OR date(published_at) >= date(@fromDate))
    AND (@toDate = '' OR date(published_at) <= date(@toDate))
  ORDER BY datetime(published_at) DESC
  LIMIT @limit OFFSET @offset
`);

const sourceQuery = db.prepare(`
  SELECT source, COUNT(*) as count
  FROM articles
  GROUP BY source
  ORDER BY count DESC
`);

const dayQuery = db.prepare(`
  SELECT date(published_at) as day, COUNT(*) as count
  FROM articles
  GROUP BY date(published_at)
  ORDER BY day DESC
  LIMIT 30
`);

app.get("/api/news", apiLimiter, (req, res) => {
  try {
    const limit = validateInteger(req.query.limit, 1, 120);
    const offset = validateInteger(req.query.offset, 0, Number.MAX_SAFE_INTEGER);
    const source = validateSource(req.query.source, validSourcesList);
    const fromDate = validateDateString(req.query.from);
    const toDate = validateDateString(req.query.to);

    const items = feedQuery.all({ limit, offset, source, fromDate, toDate });
    res.json({ items, total: items.length });
  } catch (error) {
    console.error("GET /api/news error:", error);
    res.status(500).json({ error: getSafeErrorMessage(error) });
  }
});

app.get("/api/meta", apiLimiter, (_req, res) => {
  try {
    const sources = sourceQuery.all();
    const days = dayQuery.all();
    res.json({ sources, days });
  } catch (error) {
    console.error("GET /api/meta error:", error);
    res.status(500).json({ error: getSafeErrorMessage(error) });
  }
});

app.post("/api/refresh", refreshLimiter, async (req, res) => {
  try {
    // Check authorization - require a refresh token in production
    const refreshToken = process.env.REFRESH_TOKEN;
    if (NODE_ENV === "production" && refreshToken) {
      const authHeader = req.headers.authorization || "";
      if (authHeader !== `Bearer ${refreshToken}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const stats = await ingestAll();
    res.json({ ok: true, stats });
  } catch (error) {
    console.error("POST /api/refresh error:", error);
    res.status(500).json({ error: getSafeErrorMessage(error) });
  }
});

app.get(["/", "/dashboard"], (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/dashboard.html"), (err) => {
    if (err) {
      console.error("Error sending dashboard.html:", err);
      res.status(404).json({ error: "Not found" });
    }
  });
});

app.get(["/threat-intel", "/intel"], (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"), (err) => {
    if (err) {
      console.error("Error sending index.html:", err);
      res.status(404).json({ error: "Not found" });
    }
  });
});

app.get(["/cves", "/vulnerabilities"], (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/cves.html"), (err) => {
    if (err) {
      console.error("Error sending cves.html:", err);
      res.status(404).json({ error: "Not found" });
    }
  });
});

app.get(["/kev", "/exploit-watch"], (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/kev.html"), (err) => {
    if (err) {
      console.error("Error sending kev.html:", err);
      res.status(404).json({ error: "Not found" });
    }
  });
});

app.get(["/forecast", "/weather"], (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/forecast.html"), (err) => {
    if (err) {
      console.error("Error sending forecast.html:", err);
      res.status(404).json({ error: "Not found" });
    }
  });
});

app.get("/api/cves", apiLimiter, async (_req, res) => {
  try {
    const data = await fetchRecentCves();
    res.json(data);
  } catch (error) {
    console.error("GET /api/cves error:", error);
    res.status(500).json({ error: getSafeErrorMessage(error) });
  }
});

app.get("/api/kev", apiLimiter, async (_req, res) => {
  try {
    const data = await fetchKevWatch();
    res.json(data);
  } catch (error) {
    console.error("GET /api/kev error:", error);
    res.status(500).json({ error: getSafeErrorMessage(error) });
  }
});

app.get("/api/forecast", apiLimiter, async (_req, res) => {
  try {
    const data = await fetchForecast();
    res.json(data);
  } catch (error) {
    console.error("GET /api/forecast error:", error);
    res.status(500).json({ error: getSafeErrorMessage(error) });
  }
});

app.post("/api/framework-map", apiLimiter, (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const cveId = String(req.body?.cveId || "").trim().slice(0, 20);
    const summary = String(req.body?.summary || "").trim().slice(0, 5000);
    const title = String(req.body?.title || "").trim().slice(0, 5000);

    if (!summary && !title) {
      return res.status(400).json({ error: "summary or title is required" });
    }

    const mapped = mapToFrameworks({ cveId, summary, title });
    res.json(mapped);
  } catch (error) {
    console.error("POST /api/framework-map error:", error);
    res.status(500).json({ error: getSafeErrorMessage(error) });
  }
});

// 404 and Error Handlers
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: getSafeErrorMessage(err) });
});

async function boot() {
  try {
    console.log(`Starting CyberPulse in ${NODE_ENV} mode...`);
    await ingestAll();

    setInterval(() => {
      ingestAll().catch((error) => {
        console.error("Background ingestion failed", error);
      });
    }, INGEST_INTERVAL_MS);

    const server = app.listen(PORT, () => {
      console.log(`✓ CyberPulse is running at http://localhost:${PORT}`);
      if (NODE_ENV === "production") {
        console.log("✓ Security headers enabled");
        console.log("✓ Rate limiting active");
        console.log("✓ HTTPS recommended (use Cloudflare)");
      }
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      console.log("SIGTERM received, shutting down gracefully...");
      server.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

boot();

