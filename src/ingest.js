import Parser from "rss-parser";
import { fileURLToPath } from "node:url";
import db from "./db.js";
import { SOURCES } from "./sources.js";

const parser = new Parser({ timeout: 15000 });

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO articles (source, title, link, summary, published_at, ingested_at)
  VALUES (@source, @title, @link, @summary, @published_at, @ingested_at)
`);

const cleanText = (input = "") => {
  // Remove HTML tags safely to prevent regex DoS
  let text = String(input || "");
  text = text.replaceAll(/<[^<>]*>/g, " ");
  text = text.replaceAll(/\s+/g, " ");
  return text.trim();
};

export async function ingestAll() {
  const now = new Date().toISOString();
  const stats = [];

  for (const source of SOURCES) {
    try {
      const feed = await parser.parseURL(source.rss);
      const entries = feed.items || [];
      let inserted = 0;

      for (const item of entries.slice(0, 50)) {
        const payload = {
          source: source.name,
          title: cleanText(item.title || "Untitled"),
          link: item.link || item.guid || item.id,
          summary: cleanText(item.summary || item.description || ""),
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : now,
          ingested_at: now
        };

        if (!payload.link) continue;
        const result = insertStmt.run(payload);
        if (result.changes > 0) inserted += 1;
      }

      stats.push({ source: source.name, inserted, ok: true });
    } catch (error) {
      stats.push({ source: source.name, inserted: 0, ok: false, error: String(error.message || error) });
    }
  }

  return stats;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  const start = Date.now();
  try {
    const stats = await ingestAll();
    const duration = Date.now() - start;
    console.log(JSON.stringify({ durationMs: duration, stats }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
