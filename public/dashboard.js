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
const refreshButton = document.getElementById("refreshButton");

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

async function refreshDashboard() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing...";
  await fetch("/api/refresh", { method: "POST" });
  await loadDashboard();
  refreshButton.disabled = false;
  refreshButton.textContent = "Refresh";
}

searchInput.addEventListener("input", filterFeed);
refreshButton.addEventListener("click", refreshDashboard);

updateUtcClock();
setInterval(updateUtcClock, 1000);
loadDashboard().catch((error) => {
  dashboardStatus.textContent = "Failed to load dashboard";
  console.error(error);
});
