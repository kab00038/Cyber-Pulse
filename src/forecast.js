import db from "./db.js";
import { fetchRecentCves } from "./cves.js";
import { fetchKevWatch } from "./kev.js";

const HOURS_WINDOW = 72;

const APT_GROUPS = [
  "APT28",
  "APT29",
  "APT33",
  "APT34",
  "APT35",
  "APT38",
  "Lazarus",
  "Sandworm",
  "Cozy Bear",
  "Fancy Bear",
  "Volt Typhoon",
  "Salt Typhoon",
  "MuddyWater",
  "Mustang Panda",
  "Kimsuky",
  "Turla",
  "FIN7",
  "Scattered Spider"
];

const THREAT_PATTERNS = [
  { key: "ransomware", label: "Ransomware Pressure", regex: /ransomware|locker|encryptor/i },
  { key: "zero-day", label: "Zero-Day Exploitation", regex: /zero[- ]day|0day|in the wild exploit|actively exploited/i },
  { key: "phishing", label: "Phishing and Identity Abuse", regex: /phishing|credential theft|social engineering|oauth/i },
  { key: "supply-chain", label: "Supply Chain Intrusion", regex: /supply chain|dependency|package|repo|library compromise/i },
  { key: "cloud", label: "Cloud Control Plane Risk", regex: /aws|azure|gcp|cloud|iam|tenant/i },
  { key: "ics-ot", label: "ICS and OT Exposure", regex: /scada|ics|ot|industrial|plc|modbus/i }
];

const recentNewsStmt = db.prepare(`
  SELECT source, title, summary, published_at AS publishedAt
  FROM articles
  WHERE datetime(published_at) >= datetime('now', '-${HOURS_WINDOW} hours')
  ORDER BY datetime(published_at) DESC
  LIMIT 400
`);

function compact(text) {
  return String(text || "").replaceAll(/\s+/g, " ").trim();
}

function classifyRisk(score) {
  if (score >= 78) return "SEVERE";
  if (score >= 62) return "ELEVATED";
  if (score >= 45) return "GUARDED";
  return "LOW";
}

function bounded(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function buildAptActivity(newsItems) {
  const results = [];

  for (const group of APT_GROUPS) {
    const escapedGroup = group.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const rx = new RegExp(String.raw`\b${escapedGroup}\b`, "i");
    const matches = newsItems.filter((item) => rx.test(`${item.title} ${item.summary}`));

    if (!matches.length) continue;

    results.push({
      group,
      mentions: matches.length,
      latest: matches[0]?.publishedAt || null,
      confidence: classifyConfidence(matches.length)
    });
  }

  return results.toSorted((a, b) => b.mentions - a.mentions).slice(0, 8);
}

function classifyConfidence(matchCount) {
  if (matchCount >= 4) return "high";
  if (matchCount >= 2) return "medium";
  return "low";
}

function weatherHeadline(score) {
  if (score >= 78) {
    return "Storm conditions likely: active exploitation and elevated operational risk.";
  }
  if (score >= 62) {
    return "Elevated conditions: prioritize patching and external exposure reduction.";
  }
  if (score >= 45) {
    return "Guarded conditions: monitor key advisories and tighten detections.";
  }
  return "Low pressure: maintain baseline hardening and watchlist monitoring.";
}

function buildThreatOutlook(newsItems, kev, cves) {
  return THREAT_PATTERNS.map((pattern) => {
    const hits = newsItems.filter((item) => pattern.regex.test(`${item.title} ${item.summary}`));
    const base = hits.length * 7;
    const kevBoost = pattern.key === "zero-day" ? kev.overdue * 2 + kev.dueSoon : 0;
    const cveBoost = pattern.key === "zero-day" ? cves.items.filter((item) => item.baseScore >= 9).length * 6 : 0;
    const score = bounded(base + kevBoost + cveBoost, 0, 100);

    return {
      key: pattern.key,
      label: pattern.label,
      score,
      level: classifyRisk(score),
      drivers: hits.slice(0, 3).map((item) => ({
        source: item.source,
        title: item.title,
        publishedAt: item.publishedAt
      }))
    };
  }).sort((a, b) => b.score - a.score);
}

export async function fetchForecast() {
  const newsItems = recentNewsStmt.all().map((item) => ({
    source: compact(item.source),
    title: compact(item.title),
    summary: compact(item.summary),
    publishedAt: item.publishedAt
  }));

  const [cves, kev] = await Promise.all([fetchRecentCves(), fetchKevWatch()]);

  const highCvssCount = cves.items.filter((item) => item.baseScore >= 9).length;
  const riskRaw = newsItems.length * 0.2 + kev.overdue * 2.1 + kev.dueSoon * 1.2 + highCvssCount * 3;
  const weatherScore = bounded(Math.round(riskRaw), 0, 100);

  const forecast = {
    generatedAt: new Date().toISOString(),
    windowHours: HOURS_WINDOW,
    weather: {
      score: weatherScore,
      level: classifyRisk(weatherScore),
      headline: weatherHeadline(weatherScore)
    },
    aptActivity: buildAptActivity(newsItems),
    threatOutlook: buildThreatOutlook(newsItems, kev, cves),
    indicators: {
      recentIntelReports: newsItems.length,
      kevOverdue: kev.overdue,
      kevDueSoon: kev.dueSoon,
      highCvssRecent: highCvssCount
    }
  };

  return forecast;
}
