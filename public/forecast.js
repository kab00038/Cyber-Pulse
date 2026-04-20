const refreshForecastButton = document.getElementById("refreshForecastButton");
const forecastWindow = document.getElementById("forecastWindow");
const forecastRisk = document.getElementById("forecastRisk");
const forecastGenerated = document.getElementById("forecastGenerated");
const forecastStatus = document.getElementById("forecastStatus");
const forecastLevel = document.getElementById("forecastLevel");
const forecastHeadline = document.getElementById("forecastHeadline");
const outlookList = document.getElementById("outlookList");
const aptList = document.getElementById("aptList");
const indicatorGrid = document.getElementById("indicatorGrid");

function fmtDate(value) {
  if (!value) return "Unknown";
  const d = new Date(value);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function renderAptActivity(items) {
  aptList.innerHTML = "";

  if (!items.length) {
    aptList.innerHTML = `<p class="empty">No direct APT mentions detected in the recent intel window.</p>`;
    return;
  }

  for (const item of items) {
    const row = document.createElement("article");
    row.className = "apt-card";
    row.innerHTML = `
      <div class="apt-head">
        <strong>${item.group}</strong>
        <span class="severity-pill severity-${item.confidence}">${item.confidence}</span>
      </div>
      <div class="apt-meta">
        <span>${item.mentions} mentions</span>
        <span>Latest: ${fmtDate(item.latest)}</span>
      </div>
    `;
    aptList.appendChild(row);
  }
}

function renderOutlook(items) {
  outlookList.innerHTML = "";

  for (const item of items) {
    const row = document.createElement("article");
    row.className = "outlook-card";
    const drivers = item.drivers.length
      ? item.drivers.map((driver) => `<li><span>${driver.source}</span><span>${driver.title}</span></li>`).join("")
      : `<li><span>Signal</span><span>No explicit recent drivers</span></li>`;

    row.innerHTML = `
      <div class="outlook-head">
        <h3>${item.label}</h3>
        <span class="severity-pill severity-${item.level.toLowerCase()}">${item.level} ${item.score}</span>
      </div>
      <ul class="outlook-drivers">${drivers}</ul>
    `;

    outlookList.appendChild(row);
  }
}

function renderIndicators(indicators) {
  indicatorGrid.innerHTML = "";
  const entries = [
    ["Recent Intel Reports", indicators.recentIntelReports],
    ["KEV Overdue", indicators.kevOverdue],
    ["KEV Due Soon", indicators.kevDueSoon],
    ["High CVSS (recent)", indicators.highCvssRecent]
  ];

  for (const [label, value] of entries) {
    const card = document.createElement("section");
    card.className = "panel metric-panel";
    card.innerHTML = `
      <span class="metric-label">${label}</span>
      <strong class="metric-value">${value}</strong>
      <span class="metric-note">forecast input</span>
    `;
    indicatorGrid.appendChild(card);
  }
}

async function loadForecast() {
  forecastStatus.textContent = "Loading...";
  const resp = await fetch("/api/forecast");
  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(data.error || "Unable to load forecast");
  }

  forecastWindow.textContent = `${data.windowHours}h`;
  forecastRisk.textContent = `${data.weather.level} ${data.weather.score}`;
  forecastGenerated.textContent = fmtDate(data.generatedAt);
  forecastLevel.textContent = data.weather.level;
  forecastHeadline.textContent = data.weather.headline;

  renderOutlook(data.threatOutlook || []);
  renderAptActivity(data.aptActivity || []);
  renderIndicators(data.indicators || {});

  forecastStatus.textContent = "Forecast updated";
}

async function refreshForecast() {
  refreshForecastButton.disabled = true;
  refreshForecastButton.textContent = "Refreshing...";
  await loadForecast();
  refreshForecastButton.disabled = false;
  refreshForecastButton.textContent = "Refresh Forecast";
}

refreshForecastButton.addEventListener("click", () => {
  refreshForecast().catch((error) => {
    forecastStatus.textContent = "Failed to refresh";
    console.error(error);
  });
});

(async () => {
  try {
    await loadForecast();
  } catch (error) {
    forecastStatus.textContent = "Failed to load";
    console.error(error);
  }
})();
