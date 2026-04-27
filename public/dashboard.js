// Tab switching
const tabButtons = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabName = btn.dataset.tab;
    
    // Remove active class from all buttons and contents
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabContents.forEach((c) => c.classList.remove("active"));
    
    // Add active class to clicked button and corresponding content
    btn.classList.add("active");
    document.getElementById(tabName).classList.add("active");
    
    // Load data for threat watch tab if clicking it
    if (tabName === "intel") {
      loadThreatWatchData();
    }
  });
});

// ========== DASHBOARD TAB ==========
const metricSources = document.getElementById("metricSources");
const metricDays = document.getElementById("metricDays");
const metricStories = document.getElementById("metricStories");
const utcClock = document.getElementById("utcClock");
const searchInput = document.getElementById("searchInput");
const sourceBars = document.getElementById("sourceBars");
const dayBars = document.getElementById("dayBars");
const dashboardFeed = document.getElementById("dashboardFeed");
const dashboardStatus = document.getElementById("dashboardStatus");
const dashboardCardTemplate = document.getElementById("dashboardCardTemplate");

let feedItems = [];

const fmtDate = (value) => {
  if (!value) return "Unknown";
  const d = new Date(value);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

function updateUtcClock() {
  if (!utcClock) return;
  const now = new Date();
  utcClock.textContent = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")}`;
}

function updateIntelUtcClock() {
  const intelClock = document.getElementById("intelUtcClock");
  if (!intelClock) return;
  const now = new Date();
  intelClock.textContent = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")}`;
}

function renderBars(container, items, maxValue) {
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = `<p class="empty">No data available.</p>`;
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-meta">
        <span>${item.label}</span>
        <strong>${item.value}</strong>
      </div>
      <div class="bar-track"><span class="bar-fill" style="width:${Math.max(6, (item.value / maxValue) * 100)}%"></span></div>
    `;
    container.appendChild(row);
  }
}

function renderFeed(items) {
  dashboardFeed.innerHTML = "";

  if (!items.length) {
    dashboardFeed.innerHTML = `<p class="empty">No matching stories found.</p>`;
    return;
  }

  for (const item of items) {
    const fragment = dashboardCardTemplate.content.cloneNode(true);
    fragment.querySelector(".source-pill").textContent = item.source;
    fragment.querySelector("time").textContent = fmtDate(item.publishedAt);
    fragment.querySelector("h3").textContent = item.title;
    fragment.querySelector("p").textContent = item.summary || "No summary available.";
    fragment.querySelector("a").href = item.link;
    dashboardFeed.appendChild(fragment);
  }
}

function filterFeed() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = query
    ? feedItems.filter((item) => {
        const haystack = `${item.source} ${item.title} ${item.summary || ""}`.toLowerCase();
        return haystack.includes(query);
      })
    : feedItems;

  renderFeed(filtered);
  dashboardStatus.textContent = `${filtered.length} stories shown`;
}

async function loadDashboard() {
  dashboardStatus.textContent = "Loading dashboard...";
  const [metaResp, newsResp] = await Promise.all([
    fetch("/api/meta"),
    fetch("/api/news?limit=12")
  ]);

  const meta = await metaResp.json();
  const news = await newsResp.json();
  feedItems = news.items || [];

  metricSources.textContent = String(meta.sources.length);
  metricDays.textContent = String(meta.days.length);
  metricStories.textContent = String(feedItems.length);

  renderBars(
    sourceBars,
    meta.sources.slice(0, 8).map((item) => ({ label: item.source, value: item.count })),
    Math.max(...meta.sources.map((item) => item.count), 1)
  );

  renderBars(
    dayBars,
    meta.days.slice(0, 8).map((item) => ({ label: item.day, value: item.count })),
    Math.max(...meta.days.map((item) => item.count), 1)
  );

  renderFeed(feedItems);
  dashboardStatus.textContent = `${feedItems.length} stories loaded`;
}

searchInput.addEventListener("input", filterFeed);

// ========== THREAT WATCH TAB ==========
const sourceFilter = document.getElementById("sourceFilter");
const fromDate = document.getElementById("fromDate");
const toDate = document.getElementById("toDate");
const applyFilters = document.getElementById("applyFilters");
const newsGrid = document.getElementById("newsGrid");
const statusText = document.getElementById("statusText");
const dailyBreakdown = document.getElementById("dailyBreakdown");
const cardTemplate = document.getElementById("cardTemplate");
const sourceCount = document.getElementById("sourceCount");
const dayCount = document.getElementById("dayCount");

function renderArticles(items) {
  newsGrid.innerHTML = "";

  if (!items.length) {
    newsGrid.innerHTML = `<p class="empty">No articles found for selected filters.</p>`;
    return;
  }

  for (const item of items) {
    const fragment = cardTemplate.content.cloneNode(true);
    fragment.querySelector(".source-pill").textContent = item.source;
    fragment.querySelector("time").textContent = fmtDate(item.publishedAt);
    fragment.querySelector("h3").textContent = item.title;
    fragment.querySelector("p").textContent = item.summary || "No summary available.";
    const link = fragment.querySelector("a");
    link.href = item.link;
    newsGrid.appendChild(fragment);
  }
}

function updateQueryParams() {
  const params = new URLSearchParams();
  if (sourceFilter.value) params.set("source", sourceFilter.value);
  if (fromDate.value) params.set("from", fromDate.value);
  if (toDate.value) params.set("to", toDate.value);
  params.set("limit", "80");
  return params;
}

async function loadNews() {
  statusText.textContent = "Fetching news...";
  const params = updateQueryParams();
  const resp = await fetch(`/api/news?${params.toString()}`);
  const data = await resp.json();
  renderArticles(data.items);
  statusText.textContent = `${data.total} stories loaded`;
}

async function loadMeta() {
  const resp = await fetch("/api/meta");
  const data = await resp.json();

  for (const s of data.sources) {
    const option = document.createElement("option");
    option.value = s.source;
    option.textContent = `${s.source} (${s.count})`;
    sourceFilter.appendChild(option);
  }

  dailyBreakdown.innerHTML = data.days
    .map((row) => `<li><span>${row.day}</span><strong>${row.count}</strong></li>`)
    .join("");

  if (sourceCount) {
    sourceCount.textContent = String(data.sources.length);
  }

  if (dayCount) {
    dayCount.textContent = `${data.days.length} days`;
  }
}

async function loadThreatWatchData() {
  try {
    await Promise.all([loadMeta(), loadNews()]);
  } catch (error) {
    statusText.textContent = "Failed to load feed";
    console.error(error);
  }
}

async function refreshFeed() {
  const refreshButton = document.getElementById("refreshButton");
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing...";
  try {
    await fetch("/api/refresh", { method: "POST" });
    
    // Refresh both tabs data
    await loadDashboard();
    sourceFilter.innerHTML = `<option value="">All sources</option>`;
    await loadThreatWatchData();
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh";
  }
}

applyFilters.addEventListener("click", loadNews);

// Initialize
const refreshButton = document.getElementById("refreshButton");
refreshButton.addEventListener("click", refreshFeed);

updateUtcClock();
updateIntelUtcClock();
setInterval(() => {
  updateUtcClock();
  updateIntelUtcClock();
}, 1000);

try {
  await loadDashboard();
  // Load threat watch data in the background
  loadThreatWatchData().catch(() => {});
} catch (error) {
  dashboardStatus.textContent = "Failed to load dashboard";
  console.error(error);
}
