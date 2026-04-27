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
    
    // Load data for specific tab if not already loaded
    if (tabName === "cves") {
      loadCvesData();
    } else if (tabName === "kev") {
      loadKevData();
    }
  });
});

// ========== CVEs TAB ==========
const cveList = document.getElementById("cveList");
const cveStatus = document.getElementById("cveStatus");
const cveTemplate = document.getElementById("cveTemplate");
const cveLookup = new Map();

const fmtDate = (value) => {
  if (!value) return "Unknown";
  const d = new Date(value);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

function severityClass(severity = "UNKNOWN") {
  return `severity-${String(severity).toLowerCase()}`;
}

function renderCves(items) {
  cveList.innerHTML = "";
  cveLookup.clear();

  if (!items.length) {
    cveList.innerHTML = `<p class="empty">No recent critical CVEs were returned.</p>`;
    return;
  }

  for (const item of items) {
    cveLookup.set(item.id, item);
    const fragment = cveTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".cve-card");
    card.dataset.cveId = item.id;
    fragment.querySelector(".cve-id").textContent = item.id;
    fragment.querySelector("h3").textContent = `Impact score ${item.impactScore.toFixed(1)}`;
    fragment.querySelector(".cve-summary").textContent = item.summary || "No summary available.";
    fragment.querySelector(".severity-pill").textContent = item.severity;
    fragment.querySelector(".severity-pill").classList.add(severityClass(item.severity));
    fragment.querySelector(".cve-score").textContent = `CVSS ${item.baseScore.toFixed(1)}`;
    fragment.querySelector(".cve-affected").textContent = `${item.affectedCount} affected product groups`;
    fragment.querySelector(".cve-date").textContent = `Published ${fmtDate(item.published)}`;

    const links = fragment.querySelector(".cve-links");
    links.innerHTML = item.references.length
      ? item.references
          .map((ref) => `<a href="${ref}" target="_blank" rel="noopener noreferrer">Reference</a>`)
          .join("")
      : `<span class="cve-reference-muted">No public references listed</span>`;

    cveList.appendChild(fragment);
  }
}

function renderFrameworkResult(container, mapped) {
  const owaspRows = mapped.owasp.length
    ? mapped.owasp.map((row) => `<li><strong>${row.id}</strong> ${row.name}</li>`).join("")
    : `<li>No strong OWASP category signal detected.</li>`;

  const tacticRows = mapped.mitre.tactics.length
    ? mapped.mitre.tactics.map((row) => `<li><strong>${row.id}</strong> ${row.name}</li>`).join("")
    : `<li>No clear ATT&CK tactic signal detected.</li>`;

  const techniqueRows = mapped.mitre.techniques.length
    ? mapped.mitre.techniques
        .map((row) => `<li><strong>${row.id}</strong> ${row.name} <span class="framework-muted">(${row.tacticId})</span></li>`)
        .join("")
    : `<li>No clear ATT&CK technique signal detected.</li>`;

  container.innerHTML = `
    <div class="framework-head">
      <span class="framework-title">Framework Mapping</span>
      <span class="framework-confidence">Confidence: ${mapped.confidence}</span>
    </div>
    <div class="framework-columns">
      <section>
        <h4>OWASP Top 10</h4>
        <ul>${owaspRows}</ul>
      </section>
      <section>
        <h4>MITRE ATT&CK Tactics</h4>
        <ul>${tacticRows}</ul>
      </section>
      <section>
        <h4>MITRE ATT&CK Techniques</h4>
        <ul>${techniqueRows}</ul>
      </section>
    </div>
  `;
}

async function mapCard(card) {
  const cveId = card.dataset.cveId;
  const item = cveLookup.get(cveId);
  if (!item) return;

  const result = card.querySelector(".framework-result");
  const button = card.querySelector(".framework-btn");

  if (result.dataset.loaded === "true") {
    const hidden = result.hasAttribute("hidden");
    if (hidden) {
      result.removeAttribute("hidden");
      button.textContent = "Hide framework mapping";
    } else {
      result.setAttribute("hidden", "");
      button.textContent = "Show framework mapping";
    }
    return;
  }

  button.disabled = true;
  button.textContent = "Mapping...";

  try {
    const resp = await fetch("/api/framework-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cveId: item.id,
        title: item.id,
        summary: item.summary
      })
    });

    const mapped = await resp.json();
    if (!resp.ok) {
      throw new Error(mapped.error || "Mapping failed");
    }

    renderFrameworkResult(result, mapped);
    result.dataset.loaded = "true";
    result.removeAttribute("hidden");
    button.textContent = "Hide framework mapping";
  } catch (error) {
    result.innerHTML = `<p class="framework-error">Unable to map this vulnerability right now.</p>`;
    result.removeAttribute("hidden");
    button.textContent = "Retry framework mapping";
    console.error(error);
  } finally {
    button.disabled = false;
  }
}

async function loadCvesData() {
  cveStatus.textContent = "Loading...";
  try {
    const resp = await fetch("/api/cves");
    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || "Unable to load CVEs");
    }

    renderCves(data.items || []);
    cveStatus.textContent = `${(data.items || []).length} vulnerabilities`;

    // Add event listeners to framework buttons
    cveList.querySelectorAll(".framework-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".cve-card");
        mapCard(card).catch((error) => {
          console.error(error);
        });
      });
    });
  } catch (error) {
    cveStatus.textContent = "Failed to load CVEs";
    console.error(error);
  }
}

// ========== KEV TAB ==========
const kevList = document.getElementById("kevList");
const kevStatus = document.getElementById("kevStatus");
const kevTemplate = document.getElementById("kevTemplate");
const kevTotal = document.getElementById("kevTotal");
const kevOverdue = document.getElementById("kevOverdue");
const kevDueSoon = document.getElementById("kevDueSoon");

function statusLabel(daysLeft) {
  if (daysLeft === null) return "NO DATE";
  if (daysLeft < 0) return `OVERDUE ${Math.abs(daysLeft)}D`;
  if (daysLeft === 0) return "DUE TODAY";
  if (daysLeft <= 7) return `DUE ${daysLeft}D`;
  if (daysLeft <= 30) return `DUE ${daysLeft}D`;
  return `WINDOW ${daysLeft}D`;
}

function renderKev(items) {
  kevList.innerHTML = "";

  if (!items.length) {
    kevList.innerHTML = `<p class="empty">No exploit-watch items available.</p>`;
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
      <span>Added: ${fmtDate(item.dateAdded)}</span>
      <span>Due: ${item.dueDate || "Unknown"}</span>
    `;

    const dateBadge = fragment.querySelector(".kev-date-badge");
    dateBadge.textContent = statusLabel(item.daysLeft);
    let badgeClass = "kev-badge-neutral";
    if (item.daysLeft !== null && item.daysLeft < 0) {
      badgeClass = "kev-badge-overdue";
    } else if (item.daysLeft !== null && item.daysLeft <= 30) {
      badgeClass = "kev-badge-soon";
    }
    dateBadge.classList.add(badgeClass);

    kevList.appendChild(fragment);
  }
}

async function loadKevData() {
  kevStatus.textContent = "Loading...";
  try {
    const resp = await fetch("/api/kev");
    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || "Unable to load KEV items");
    }

    kevTotal.textContent = String(data.total ?? 0);
    kevOverdue.textContent = String(data.overdue ?? 0);
    kevDueSoon.textContent = String(data.dueSoon ?? 0);

    renderKev(data.items || []);
    kevStatus.textContent = `${(data.items || []).length} items shown`;
  } catch (error) {
    kevStatus.textContent = "Failed to load KEV";
    console.error(error);
  }
}

// Refresh button
const refreshButton = document.getElementById("refreshButton");
async function refreshData() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing...";
  try {
    await fetch("/api/refresh", { method: "POST" });
    
    // Refresh both tabs data
    await loadCvesData();
    await loadKevData();
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh Data";
  }
}

refreshButton.addEventListener("click", refreshData);

// Initialize - load first tab data
try {
  await loadCvesData();
} catch (error) {
  console.error(error);
}
