const KEV_ENDPOINT = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const CACHE_MS = 30 * 60 * 1000;
const RECENT_YEAR_SPAN = 1;
const RECENT_OVERDUE_DAYS = 60;
const UPCOMING_DUE_DAYS = 120;

let cache = null;

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(dateString) {
  const target = parseDate(dateString);
  if (!target) return null;
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function buildUrgencyScore(daysLeft, vendorProject, product) {
  const overdueBonus = daysLeft === null ? 0 : Math.max(0, 45 - daysLeft) * 2;
  const overduePenalty = daysLeft !== null && daysLeft < 0 ? Math.abs(daysLeft) * 8 + 120 : 0;
  const breadthBonus = Math.min(20, `${vendorProject} ${product}`.trim().split(/[\s/,-]+/).filter(Boolean).length * 2);
  return overduePenalty + overdueBonus + breadthBonus;
}

function normalizeText(value) {
  return String(value || "").replaceAll(/\s+/g, " ").trim();
}

function isRecentYear(dateString) {
  const date = parseDate(dateString);
  if (!date) return false;
  const currentYear = new Date().getFullYear();
  return date.getFullYear() >= currentYear - RECENT_YEAR_SPAN;
}

function isDueSoonOrRecentlyOverdue(daysLeft) {
  if (daysLeft === null) return false;
  return daysLeft >= -RECENT_OVERDUE_DAYS && daysLeft <= UPCOMING_DUE_DAYS;
}

export async function fetchKevWatch() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_MS) {
    return cache.data;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(KEV_ENDPOINT, {
      signal: controller.signal,
      headers: {
        "User-Agent": "CyberPulse/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`CISA KEV request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const vulnerabilities = Array.isArray(payload.vulnerabilities) ? payload.vulnerabilities : [];

    const scopedItems = vulnerabilities
      .map((item) => {
        const daysLeft = daysUntil(item.dueDate);
        return {
          cveId: item.cveID,
          vendorProject: normalizeText(item.vendorProject),
          product: normalizeText(item.product),
          vulnerabilityName: normalizeText(item.vulnerabilityName),
          dateAdded: item.dateAdded,
          dueDate: item.dueDate,
          requiredAction: normalizeText(item.requiredAction),
          notes: normalizeText(item.notes),
          daysLeft,
          urgencyScore: buildUrgencyScore(daysLeft, item.vendorProject, item.product)
        };
      })
      .filter((item) => isRecentYear(item.dateAdded))
      .filter((item) => isDueSoonOrRecentlyOverdue(item.daysLeft))
      .sort((a, b) => {
        if (a.daysLeft === null && b.daysLeft !== null) return 1;
        if (b.daysLeft === null && a.daysLeft !== null) return -1;
        if (a.daysLeft !== null && b.daysLeft !== null && a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
        if (b.urgencyScore !== a.urgencyScore) return b.urgencyScore - a.urgencyScore;
        return new Date(b.dateAdded) - new Date(a.dateAdded);
      });

    const topItems = scopedItems.slice(0, 20);

    const data = {
      items: topItems,
      total: scopedItems.length,
      overdue: scopedItems.filter((item) => item.daysLeft !== null && item.daysLeft < 0).length,
      dueSoon: scopedItems.filter((item) => item.daysLeft !== null && item.daysLeft >= 0 && item.daysLeft <= 30).length,
      sourceTotal: vulnerabilities.length,
      scope: {
        years: "current_or_previous",
        dueWindowDays: {
          overdue: RECENT_OVERDUE_DAYS,
          upcoming: UPCOMING_DUE_DAYS
        }
      },
      updatedAt: new Date().toISOString()
    };

    cache = { fetchedAt: now, data };
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
