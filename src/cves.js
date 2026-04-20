const NVD_ENDPOINT = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const WINDOW_DAYS = 14;
const CACHE_MS = 30 * 60 * 1000;

let cache = null;

function getPublishedWindow() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - WINDOW_DAYS);
  return { start: start.toISOString(), end: end.toISOString() };
}

function readDescription(cve) {
  const description = cve.descriptions?.find((item) => item.lang === "en")?.value || cve.descriptions?.[0]?.value || "";
  return description.replace(/\s+/g, " ").trim();
}

function getSeverityScore(cve) {
  const metric = cve.metrics?.cvssMetricV31?.[0] || cve.metrics?.cvssMetricV30?.[0] || cve.metrics?.cvssMetricV2?.[0];
  const baseData = metric?.cvssData || metric?.cvssData || {};
  const baseScore = Number(baseData.baseScore || 0);
  const severity = baseData.baseSeverity || metric?.baseSeverity || "UNKNOWN";
  return { baseScore, severity };
}

function collectVulnerableCpes(configurations = []) {
  const items = new Set();

  const walkNode = (node) => {
    for (const match of node.cpeMatch || []) {
      if (match.vulnerable && match.criteria) {
        items.add(match.criteria);
      }
    }

    for (const child of node.children || []) {
      walkNode(child);
    }
  };

  for (const node of configurations) {
    walkNode(node);
  }

  return items;
}

function buildImpactScore(baseScore, affectedCount, referencesCount) {
  return baseScore * 10 + affectedCount * 1.6 + Math.min(referencesCount, 12);
}

export async function fetchRecentCves() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_MS) {
    return cache.data;
  }

  const { start, end } = getPublishedWindow();
  const url = new URL(NVD_ENDPOINT);
  url.searchParams.set("pubStartDate", start);
  url.searchParams.set("pubEndDate", end);
  url.searchParams.set("resultsPerPage", "80");
  url.searchParams.set("startIndex", "0");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "CyberPulse/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`NVD request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const items = (payload.vulnerabilities || [])
      .map((entry) => {
        const cve = entry.cve || {};
        const { baseScore, severity } = getSeverityScore(cve);
        const vulnerableCpes = collectVulnerableCpes(cve.configurations || []);
        const references = (cve.references || []).map((ref) => ref.url).filter(Boolean);

        return {
          id: cve.id,
          summary: readDescription(cve),
          published: cve.published || cve.lastModified || new Date().toISOString(),
          lastModified: cve.lastModified || cve.published || new Date().toISOString(),
          baseScore,
          severity,
          affectedCount: vulnerableCpes.size,
          references: references.slice(0, 3),
          impactScore: buildImpactScore(baseScore, vulnerableCpes.size, references.length)
        };
      })
      .filter((item) => item.id)
      .sort((a, b) => {
        if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
        if (b.baseScore !== a.baseScore) return b.baseScore - a.baseScore;
        return new Date(b.published) - new Date(a.published);
      })
      .slice(0, 10);

    const data = { items, window: { start, end }, updatedAt: new Date().toISOString() };
    cache = { fetchedAt: now, data };
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
