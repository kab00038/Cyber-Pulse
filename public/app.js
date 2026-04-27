const CLOCK_TARGETS = ["utcClock", "intelUtcClock", "forecastGenerated"];

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatShortDay(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function updateClocks() {
  const now = new Date();
  const timeText = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")}`;

  for (const id of CLOCK_TARGETS) {
    const node = document.getElementById(id);
    if (node) {
      node.textContent = timeText;
    }
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...(options.headers || {}) },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}

function clearElement(element) {
  if (element) {
    element.innerHTML = "";
  }
}

function renderBars(container, items, valueKey = "count") {
  if (!container) return;
  clearElement(container);

  if (!items.length) {
    container.innerHTML = `<p class="empty">No data available.</p>`;
    return;
  }

  const maxValue = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1);
  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "bar-row";
    const value = Number(item[valueKey] || 0);
    row.innerHTML = `
      <div class="bar-meta">
        <span>${item.label}</span>
        <strong>${value}</strong>
      </div>
      <div class="bar-track"><span class="bar-fill" style="width:${Math.max(6, (value / maxValue) * 100)}%"></span></div>
    `;
    fragment.appendChild(row);
  }

  container.appendChild(fragment);
}

function renderArticleCards(container, template, items) {
  if (!container) return;
  clearElement(container);

  if (!items.length) {
    container.innerHTML = `<p class="empty">No stories found.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const card = template.content.cloneNode(true);
    const article = card.querySelector("article");
    if (article) {
      article.dataset.link = item.link || "";
    }

    const source = card.querySelector(".source-pill");
    if (source) source.textContent = item.source || "Unknown";

    const time = card.querySelector("time");
    if (time) time.textContent = formatDate(item.publishedAt || item.published_at);

    const heading = card.querySelector("h3");
    if (heading) heading.textContent = item.title || "Untitled";

    const summary = card.querySelector("p");
    if (summary) summary.textContent = item.summary || "No summary available.";

    const link = card.querySelector("a");
    if (link) {
      link.href = item.link || "#";
      link.textContent = link.textContent || "Read full article";
    }

    fragment.appendChild(card);
  }

  container.appendChild(fragment);
}

function renderFrameworkResult(container, mapped) {
  if (!container) return;

  const owaspRows = mapped.owasp.length
    ? mapped.owasp.map((row) => `<li><strong>${row.id}</strong> ${row.name}</li>`).join("")
    : `<li>No strong OWASP category signal detected.</li>`;

  const tacticRows = mapped.mitre.tactics.length
    ? mapped.mitre.tactics.map((row) => `<li><strong>${row.id}</strong> ${row.name}</li>`).join("")
    : `<li>No clear ATT&CK tactic signal detected.</li>`;

  const techniqueRows = mapped.mitre.techniques.length
    ? mapped.mitre.techniques.map((row) => `<li><strong>${row.id}</strong> ${row.name} <span class="framework-muted">(${row.tacticId})</span></li>`).join("")
    : `<li>No clear ATT&CK technique signal detected.</li>`;

  container.innerHTML = `
    <div class="framework-head">
      <span class="framework-title">Framework mapping</span>
      <span class="framework-confidence">Confidence: ${mapped.confidence}</span>
    </div>
    <div class="framework-columns">
      <section>
        <h4>OWASP Top 10</h4>
        <ul>${owaspRows}</ul>
      </section>
      <section>
        <h4>MITRE ATT&CK tactics</h4>
        <ul>${tacticRows}</ul>
      </section>
      <section>
        <h4>MITRE ATT&CK techniques</h4>
        <ul>${techniqueRows}</ul>
      </section>
    </div>
  `;
}

function setupTabs(tabLoaders = {}) {
  const buttons = $all(".tab-button");
  const panels = $all(".tab-content");

  if (!buttons.length || !panels.length) return;

  const activate = async (tabName) => {
    for (const button of buttons) {
      button.classList.toggle("active", button.dataset.tab === tabName);
    }

    for (const panel of panels) {
      panel.classList.toggle("active", panel.id === tabName);
    }

    const loader = tabLoaders[tabName];
    if (loader) {
      await loader();
    }
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      activate(button.dataset.tab).catch((error) => console.error(error));
    });
  });

  const activeButton = buttons.find((button) => button.classList.contains("active")) || buttons[0];
  if (activeButton) {
    activate(activeButton.dataset.tab).catch((error) => console.error(error));
  }
}

function initThreatMap() {
  const frame = document.querySelector("iframe[data-map-src]");
  if (!frame) return;

  const loadFrame = () => {
    if (!frame.getAttribute("src")) {
      frame.src = frame.dataset.mapSrc || "";
    }
  };

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      loadFrame();
      observer.disconnect();
    }
  }, { rootMargin: "400px" });

  observer.observe(frame);

  const button = document.querySelector("[data-map-load]");
  if (button) {
    button.addEventListener("click", () => {
      loadFrame();
      button.remove();
    });
  }
}

async function loadDashboardPage() {
  const metricSources = document.getElementById("metricSources");
  const metricDays = document.getElementById("metricDays");
  const metricStories = document.getElementById("metricStories");
  const searchInput = document.getElementById("searchInput");
  const sourceBars = document.getElementById("sourceBars");
  const dayBars = document.getElementById("dayBars");
  const dashboardFeed = document.getElementById("dashboardFeed");
  const dashboardStatus = document.getElementById("dashboardStatus");
  const dashboardCardTemplate = document.getElementById("dashboardCardTemplate");
  const refreshButton = document.getElementById("refreshButton");

  let feedItems = [];

  const renderFeed = (items) => renderArticleCards(dashboardFeed, dashboardCardTemplate, items);

  const filterFeed = () => {
    const query = (searchInput?.value || "").trim().toLowerCase();
    const filtered = query
      ? feedItems.filter((item) => `${item.source} ${item.title} ${item.summary || ""}`.toLowerCase().includes(query))
      : feedItems;

    renderFeed(filtered);
    if (dashboardStatus) {
      dashboardStatus.textContent = `${filtered.length} stories shown`;
    }
  };

  const loadDashboard = async () => {
    if (dashboardStatus) dashboardStatus.textContent = "Loading dashboard...";

    const [meta, news] = await Promise.all([
      fetchJson("/api/meta"),
      fetchJson("/api/news?limit=12")
    ]);

    feedItems = news.items || [];

    if (metricSources) metricSources.textContent = String(meta.sources?.length || 0);
    if (metricDays) metricDays.textContent = String(meta.days?.length || 0);
    if (metricStories) metricStories.textContent = String(feedItems.length);

    renderBars(sourceBars, (meta.sources || []).slice(0, 8).map((item) => ({ label: item.source, count: item.count })));
    renderBars(dayBars, (meta.days || []).slice(0, 8).map((item) => ({ label: formatShortDay(item.day), count: item.count })));
    renderFeed(feedItems);

    if (dashboardStatus) dashboardStatus.textContent = `${feedItems.length} stories loaded`;
  };

  if (searchInput) {
    searchInput.addEventListener("input", filterFeed);
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", async () => {
      refreshButton.disabled = true;
      const originalLabel = refreshButton.textContent;
      refreshButton.textContent = "Refreshing...";

      try {
        await fetchJson("/api/refresh", { method: "POST" });
        await loadDashboard();
      } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = originalLabel || "Refresh";
      }
    });
  }

  await loadDashboard();
}

async function loadThreatIntelPage() {
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

  const loadMeta = async () => {
    const meta = await fetchJson("/api/meta");

    if (sourceFilter) {
      const existing = new Set(Array.from(sourceFilter.options).map((option) => option.value));
      for (const source of meta.sources || []) {
        if (existing.has(source.source)) continue;
        const option = document.createElement("option");
        option.value = source.source;
        option.textContent = `${source.source} (${source.count})`;
        sourceFilter.appendChild(option);
      }
    }

    if (dailyBreakdown) {
      dailyBreakdown.innerHTML = (meta.days || [])
        .map((row) => `<li><span>${formatShortDay(row.day)}</span><strong>${row.count}</strong></li>`)
        .join("");
    }

    if (sourceCount) sourceCount.textContent = String(meta.sources?.length || 0);
    if (dayCount) dayCount.textContent = `${meta.days?.length || 0} days`;
  };

  const loadNews = async () => {
    if (statusText) statusText.textContent = "Fetching news...";
    const params = new URLSearchParams();
    if (sourceFilter?.value) params.set("source", sourceFilter.value);
    if (fromDate?.value) params.set("from", fromDate.value);
    if (toDate?.value) params.set("to", toDate.value);
    params.set("limit", "80");

    const data = await fetchJson(`/api/news?${params.toString()}`);
    renderArticleCards(newsGrid, cardTemplate, data.items || []);
    if (statusText) statusText.textContent = `${data.total || 0} stories loaded`;
  };

  const refreshIntel = async () => {
    if (refreshButton) {
      refreshButton.disabled = true;
      const originalLabel = refreshButton.textContent;
      refreshButton.textContent = "Refreshing...";

      try {
        await fetchJson("/api/refresh", { method: "POST" });
        if (sourceFilter) sourceFilter.innerHTML = `<option value="">All sources</option>`;
        await Promise.all([loadMeta(), loadNews()]);
      } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = originalLabel || "Refresh";
      }
      return;
    }

    await Promise.all([loadMeta(), loadNews()]);
  };

  if (applyFilters) {
    applyFilters.addEventListener("click", () => {
      loadNews().catch((error) => {
        if (statusText) statusText.textContent = "Failed to load feed";
        console.error(error);
      });
    });
  }

  initThreatMap();
  await refreshIntel();
}

async function loadCvesPage() {
  const cveList = document.getElementById("cveList");
  const cveStatus = document.getElementById("cveStatus");
  const refreshButton = document.getElementById("refreshCvesButton") || document.getElementById("refreshButton");
  const cveTemplate = document.getElementById("cveTemplate");
  const cveLookup = new Map();

  const severityClass = (severity = "UNKNOWN") => `severity-${String(severity).toLowerCase()}`;

  const loadCves = async () => {
    if (cveStatus) cveStatus.textContent = "Loading...";
    const data = await fetchJson("/api/cves");
    cveList.innerHTML = "";
    cveLookup.clear();

    const items = data.items || [];
    if (!items.length) {
      cveList.innerHTML = `<p class="empty">No recent critical CVEs were returned.</p>`;
      if (cveStatus) cveStatus.textContent = "No CVEs";
      return;
    }

    for (const item of items) {
      cveLookup.set(item.id, item);
      const fragment = cveTemplate.content.cloneNode(true);
      const card = fragment.querySelector(".cve-card");
      if (card) card.dataset.cveId = item.id;
      fragment.querySelector(".cve-id").textContent = item.id;
      fragment.querySelector("h3").textContent = `Impact score ${item.impactScore.toFixed(1)}`;
      fragment.querySelector(".cve-summary").textContent = item.summary || "No summary available.";
      fragment.querySelector(".severity-pill").textContent = item.severity;
      fragment.querySelector(".severity-pill").classList.add(severityClass(item.severity));
      fragment.querySelector(".cve-score").textContent = `CVSS ${item.baseScore.toFixed(1)}`;
      fragment.querySelector(".cve-affected").textContent = `${item.affectedCount} affected product groups`;
      fragment.querySelector(".cve-date").textContent = `Published ${formatDate(item.published)}`;

      const links = fragment.querySelector(".cve-links");
      links.innerHTML = item.references.length
        ? item.references.map((ref) => `<a href="${ref}" target="_blank" rel="noopener noreferrer">Reference</a>`).join("")
        : `<span class="cve-reference-muted">No public references listed</span>`;

      cveList.appendChild(fragment);
    }

    if (cveStatus) cveStatus.textContent = `${items.length} vulnerabilities`;

    cveList.querySelectorAll(".framework-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const card = button.closest(".cve-card");
        if (!card) return;

        const cveId = card.dataset.cveId;
        const item = cveLookup.get(cveId);
        const result = card.querySelector(".framework-result");

        if (result.dataset.loaded === "true") {
          result.hidden = !result.hidden;
          button.textContent = result.hidden ? "Show framework mapping" : "Hide framework mapping";
          return;
        }

        button.disabled = true;
        button.textContent = "Mapping...";

        try {
          const mapped = await fetchJson("/api/framework-map", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cveId: item.id, title: item.id, summary: item.summary })
          });

          renderFrameworkResult(result, mapped);
          result.dataset.loaded = "true";
          result.hidden = false;
          button.textContent = "Hide framework mapping";
        } catch (error) {
          result.innerHTML = `<p class="framework-error">Unable to map this vulnerability right now.</p>`;
          result.hidden = false;
          button.textContent = "Retry framework mapping";
          console.error(error);
        } finally {
          button.disabled = false;
        }
      });
    });
  };

  if (refreshButton) {
    refreshButton.addEventListener("click", async () => {
      refreshButton.disabled = true;
      const label = refreshButton.textContent;
      refreshButton.textContent = "Refreshing...";

      try {
        await fetchJson("/api/refresh", { method: "POST" });
        await loadCves();
      } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = label || "Refresh";
      }
    });
  }

  await loadCves();
}

async function loadKevPage() {
  const kevList = document.getElementById("kevList");
  const kevStatus = document.getElementById("kevStatus");
  const refreshButton = document.getElementById("refreshKevButton") || document.getElementById("refreshButton");
  const kevTemplate = document.getElementById("kevTemplate");
  const kevTotal = document.getElementById("kevTotal");
  const kevOverdue = document.getElementById("kevOverdue");
  const kevDueSoon = document.getElementById("kevDueSoon");

  const statusLabel = (daysLeft) => {
    if (daysLeft === null) return "NO DATE";
    if (daysLeft < 0) return `OVERDUE ${Math.abs(daysLeft)}D`;
    if (daysLeft === 0) return "DUE TODAY";
    if (daysLeft <= 7) return `DUE ${daysLeft}D`;
    if (daysLeft <= 30) return `DUE ${daysLeft}D`;
    return `WINDOW ${daysLeft}D`;
  };

  const loadKev = async () => {
    if (kevStatus) kevStatus.textContent = "Loading...";
    const data = await fetchJson("/api/kev");
    kevList.innerHTML = "";

    if (kevTotal) kevTotal.textContent = String(data.total ?? 0);
    if (kevOverdue) kevOverdue.textContent = String(data.overdue ?? 0);
    if (kevDueSoon) kevDueSoon.textContent = String(data.dueSoon ?? 0);

    const items = data.items || [];
    if (!items.length) {
      kevList.innerHTML = `<p class="empty">No exploit-watch items available.</p>`;
      if (kevStatus) kevStatus.textContent = "No KEV items";
      return;
    }

    for (const item of items) {
      const fragment = kevTemplate.content.cloneNode(true);
      fragment.querySelector(".kev-id").textContent = item.cveId;
      fragment.querySelector("h3").textContent = item.vulnerabilityName || `${item.vendorProject} ${item.product}`.trim();
      fragment.querySelector(".kev-summary").textContent = item.notes || item.requiredAction || "No additional notes available.";

      const meta = fragment.querySelector(".kev-meta");
      meta.innerHTML = `
        <span>Vendor: ${item.vendorProject || "Unknown"}</span>
        <span>Product: ${item.product || "Unknown"}</span>
        <span>Added: ${formatDate(item.dateAdded)}</span>
        <span>Due: ${item.dueDate || "Unknown"}</span>
      `;

      const action = fragment.querySelector(".kev-action");
      action.innerHTML = `
        <span class="kev-status-pill">${statusLabel(item.daysLeft)}</span>
        <span class="kev-action-text">${item.requiredAction || "Review and mitigate as soon as possible."}</span>
      `;

      const chip = fragment.querySelector(".kev-chip");
      chip.textContent = item.daysLeft !== null ? `${item.daysLeft}d` : "N/A";
      chip.classList.add(item.daysLeft !== null && item.daysLeft < 0 ? "kev-chip-overdue" : item.daysLeft !== null && item.daysLeft <= 30 ? "kev-chip-soon" : "kev-chip-neutral");

      kevList.appendChild(fragment);
    }

    if (kevStatus) kevStatus.textContent = `${items.length} items shown`;
  };

  if (refreshButton) {
    refreshButton.addEventListener("click", async () => {
      refreshButton.disabled = true;
      const label = refreshButton.textContent;
      refreshButton.textContent = "Refreshing...";

      try {
        await fetchJson("/api/refresh", { method: "POST" });
        await loadKev();
      } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = label || "Refresh";
      }
    });
  }

  await loadKev();
}

async function loadForecastPage() {
  const refreshButton = document.getElementById("refreshForecastButton");
  const forecastWindow = document.getElementById("forecastWindow");
  const forecastRisk = document.getElementById("forecastRisk");
  const forecastGenerated = document.getElementById("forecastGenerated");
  const forecastStatus = document.getElementById("forecastStatus");
  const forecastLevel = document.getElementById("forecastLevel");
  const forecastHeadline = document.getElementById("forecastHeadline");
  const outlookList = document.getElementById("outlookList");
  const aptList = document.getElementById("aptList");
  const indicatorGrid = document.getElementById("indicatorGrid");

  const renderAptActivity = (items) => {
    if (!aptList) return;
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
          <span>Latest: ${formatDate(item.latest)}</span>
        </div>
      `;
      aptList.appendChild(row);
    }
  };

  const renderOutlook = (items) => {
    if (!outlookList) return;
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
  };

  const renderIndicators = (indicators) => {
    if (!indicatorGrid) return;
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
  };

  const loadForecast = async () => {
    if (forecastStatus) forecastStatus.textContent = "Loading...";
    const data = await fetchJson("/api/forecast");

    if (forecastWindow) forecastWindow.textContent = `${data.windowHours}h`;
    if (forecastRisk) forecastRisk.textContent = `${data.weather.level} ${data.weather.score}`;
    if (forecastGenerated) forecastGenerated.textContent = formatDate(data.generatedAt);
    if (forecastLevel) forecastLevel.textContent = data.weather.level;
    if (forecastHeadline) forecastHeadline.textContent = data.weather.headline;

    renderOutlook(data.threatOutlook || []);
    renderAptActivity(data.aptActivity || []);
    renderIndicators(data.indicators || {});

    if (forecastStatus) forecastStatus.textContent = "Forecast updated";
  };

  if (refreshButton) {
    refreshButton.addEventListener("click", async () => {
      refreshButton.disabled = true;
      const label = refreshButton.textContent;
      refreshButton.textContent = "Refreshing...";

      try {
        await loadForecast();
      } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = label || "Refresh Forecast";
      }
    });
  }

  await loadForecast();
}

async function loadStatisticsPage() {
  const refreshButton = document.getElementById("refreshButton");

  const loadBoth = async () => {
    await Promise.all([loadCvesPage(), loadKevPage()]);
  };

  if (refreshButton) {
    refreshButton.addEventListener("click", async () => {
      refreshButton.disabled = true;
      const label = refreshButton.textContent;
      refreshButton.textContent = "Refreshing...";

      try {
        await fetchJson("/api/refresh", { method: "POST" });
        await loadBoth();
      } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = label || "Refresh Data";
      }
    });
  }

  await loadBoth();
}

async function bootApp() {
  updateClocks();
  setInterval(updateClocks, 1000);

  const page = document.body.dataset.page || "";
  const loaders = {
    dashboard: () => loadDashboardPage(),
    "threat-intel": () => loadThreatIntelPage(),
    statistics: () => loadStatisticsPage(),
    cves: () => loadCvesPage(),
    kev: () => loadKevPage(),
    forecast: () => loadForecastPage()
  };

  if (document.querySelector(".tab-button")) {
    if (page === "dashboard") {
      setupTabs({ overview: loadDashboardPage, intel: loadThreatIntelPage });
      return;
    }

    if (page === "statistics") {
      setupTabs({ cves: loadCvesPage, kev: loadKevPage });
      return;
    }
  }

  const loader = loaders[page];
  if (loader) {
    await loader();
  }
}

export { bootApp };
