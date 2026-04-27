import { XMLParser } from "fast-xml-parser";
import { insertArticles } from "./data-store.js";
import { SOURCES } from "./sources.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  trimValues: true,
  processEntities: true
});

function cleanText(input = "") {
  return String(input || "").replaceAll(/<[^<>]*>/g, " ").replaceAll(/\s+/g, " ").trim();
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function pickLink(entry) {
  if (typeof entry.link === "string") return entry.link;
  if (Array.isArray(entry.link)) {
    const preferred = entry.link.find((item) => item?.["@_rel"] === "alternate" && item?.["@_href"])
      || entry.link.find((item) => item?.["@_href"]);
    return preferred?.["@_href"] || preferred?.href || "";
  }
  return entry.link?.["@_href"] || entry.link?.href || entry.link?.url || "";
}

function pickSummary(entry) {
  return entry.summary || entry.description || entry.content || entry["content:encoded"] || entry["media:description"] || "";
}

function pickDate(entry, fallbackIso) {
  const candidate = entry.pubDate || entry.published || entry.updated || entry.date || fallbackIso;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? fallbackIso : parsed.toISOString();
}

function extractItemsFromFeed(xml) {
  const parsed = parser.parse(xml);
  const rssItems = parsed?.rss?.channel?.item;
  if (rssItems) return asArray(rssItems);

  const atomEntries = parsed?.feed?.entry;
  if (atomEntries) {
    return asArray(atomEntries).map((entry) => ({
      title: entry.title,
      link: entry.link,
      summary: entry.summary || entry.content || "",
      published: entry.published,
      updated: entry.updated,
      id: entry.id
    }));
  }

  return [];
}

async function fetchXml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "CyberPulse/2.0" }
    });

    if (!response.ok) {
      throw new Error(`Feed request failed with status ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function ingestAll(store) {
  if (!store) {
    throw new Error("ingestAll requires a database store");
  }

  const now = new Date().toISOString();
  const stats = [];

  for (const source of SOURCES) {
    try {
      const xml = await fetchXml(source.rss);
      const entries = extractItemsFromFeed(xml);
      const records = entries.slice(0, 50).map((entry) => {
        const link = cleanText(pickLink(entry) || entry.guid || entry.id || "");
        return {
          source: source.name,
          title: cleanText(entry.title || entry.headline || "Untitled"),
          link,
          summary: cleanText(pickSummary(entry)),
          published_at: pickDate(entry, now),
          ingested_at: now
        };
      }).filter((entry) => Boolean(entry.link));

      const inserted = await insertArticles(store, records);
      stats.push({ source: source.name, inserted, ok: true });
    } catch (error) {
      stats.push({ source: source.name, inserted: 0, ok: false, error: String(error?.message || error) });
    }
  }

  return stats;
}
