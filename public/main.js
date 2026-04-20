const sourceFilter = document.getElementById("sourceFilter");
const fromDate = document.getElementById("fromDate");
const toDate = document.getElementById("toDate");
const applyFilters = document.getElementById("applyFilters");
const refreshButton = document.getElementById("refreshButton");
const newsGrid = document.getElementById("newsGrid");
const statusText = document.getElementById("statusText");
const dailyBreakdown = document.getElementById("dailyBreakdown");
const cardTemplate = document.getElementById("cardTemplate");
const sourceCount = document.getElementById("sourceCount");
const dayCount = document.getElementById("dayCount");
const utcClock = document.getElementById("utcClock");

const fmtDate = (value) => {
  if (!value) return "Unknown";
  const d = new Date(value);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

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

function updateUtcClock() {
  if (!utcClock) return;

  const now = new Date();
  const h = String(now.getUTCHours()).padStart(2, "0");
  const m = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  utcClock.textContent = `${h}:${m}:${s}`;
}

async function refreshFeed() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing...";
  await fetch("/api/refresh", { method: "POST" });
  sourceFilter.innerHTML = `<option value="">All sources</option>`;
  await Promise.all([loadMeta(), loadNews()]);
  refreshButton.disabled = false;
  refreshButton.textContent = "Refresh Sources";
}

applyFilters.addEventListener("click", loadNews);
refreshButton.addEventListener("click", refreshFeed);

Promise.all([loadMeta(), loadNews()]).catch((error) => {
  statusText.textContent = "Failed to load feed";
  console.error(error);
});

updateUtcClock();
setInterval(updateUtcClock, 1000);
