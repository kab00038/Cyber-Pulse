const cveList = document.getElementById("cveList");
const cveStatus = document.getElementById("cveStatus");
const refreshCvesButton = document.getElementById("refreshCvesButton");
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

async function loadCves() {
  cveStatus.textContent = "Loading...";
  const resp = await fetch("/api/cves");
  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(data.error || "Unable to load CVEs");
  }

  renderCves(data.items || []);
  cveStatus.textContent = `${(data.items || []).length} CVEs loaded`;
}

async function refreshCves() {
  refreshCvesButton.disabled = true;
  refreshCvesButton.textContent = "Refreshing...";
  await loadCves();
  refreshCvesButton.disabled = false;
  refreshCvesButton.textContent = "Refresh CVEs";
}

refreshCvesButton.addEventListener("click", () => {
  refreshCves().catch((error) => {
    cveStatus.textContent = "Failed to load CVEs";
    console.error(error);
  });
});

cveList.addEventListener("click", (event) => {
  const button = event.target.closest(".framework-btn");
  if (!button) return;
  const card = button.closest(".cve-card");
  if (!card) return;
  mapCard(card);
});

loadCves().catch((error) => {
  cveStatus.textContent = "Failed to load CVEs";
  console.error(error);
});
