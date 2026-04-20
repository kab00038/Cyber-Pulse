import express from "express";
import path from "path";
import { fileURLToPath } from "url";
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

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public"), { index: false }));

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

app.get("/api/news", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 40, 120);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const source = req.query.source || "";
  const fromDate = req.query.from || "";
  const toDate = req.query.to || "";

  const items = feedQuery.all({ limit, offset, source, fromDate, toDate });
  res.json({ items, total: items.length });
});

app.get("/api/meta", (_req, res) => {
  const sources = sourceQuery.all();
  const days = dayQuery.all();
  res.json({ sources, days });
});

app.post("/api/refresh", async (_req, res) => {
  const stats = await ingestAll();
  res.json({ ok: true, stats });
});

app.get(["/", "/dashboard"], (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});

app.get(["/threat-intel", "/intel"], (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.get(["/cves", "/vulnerabilities"], (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/cves.html"));
});

app.get(["/kev", "/exploit-watch"], (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/kev.html"));
});

app.get(["/forecast", "/weather"], (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/forecast.html"));
});

app.get("/api/cves", async (_req, res) => {
  try {
    const data = await fetchRecentCves();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/kev", async (_req, res) => {
  try {
    const data = await fetchKevWatch();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/forecast", async (_req, res) => {
  try {
    const data = await fetchForecast();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.post("/api/framework-map", (req, res) => {
  try {
    const payload = {
      cveId: req.body?.cveId || "",
      summary: req.body?.summary || "",
      title: req.body?.title || ""
    };

    if (!payload.summary && !payload.title) {
      res.status(400).json({ error: "summary or title is required" });
      return;
    }

    const mapped = mapToFrameworks(payload);
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

async function boot() {
  await ingestAll();

  setInterval(() => {
    ingestAll().catch((error) => {
      console.error("Background ingestion failed", error);
    });
  }, INGEST_INTERVAL_MS);

  app.listen(PORT, () => {
    console.log(`CyberPulse is running at http://localhost:${PORT}`);
  });
}

boot().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
