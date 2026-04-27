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
import { bootApp } from "./app.js";

bootApp();
const dashboardFeed = document.getElementById("dashboardFeed");
