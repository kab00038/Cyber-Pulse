const kevList = document.getElementById("kevList");
const kevStatus = document.getElementById("kevStatus");
const refreshKevButton = document.getElementById("refreshKevButton");
const kevTemplate = document.getElementById("kevTemplate");
const kevTotal = document.getElementById("kevTotal");
const kevOverdue = document.getElementById("kevOverdue");
const kevDueSoon = document.getElementById("kevDueSoon");

function fmtDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

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
}

async function loadKev() {
  kevStatus.textContent = "Loading...";
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
}

async function refreshKev() {
  refreshKevButton.disabled = true;
  refreshKevButton.textContent = "Refreshing...";
  await loadKev();
  refreshKevButton.disabled = false;
  refreshKevButton.textContent = "Refresh KEV";
}

refreshKevButton.addEventListener("click", () => {
  refreshKev().catch((error) => {
    kevStatus.textContent = "Failed to load KEV";
    console.error(error);
  });
});

loadKev().catch((error) => {
  kevStatus.textContent = "Failed to load KEV";
  console.error(error);
});
