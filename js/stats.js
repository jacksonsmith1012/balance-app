import { state, fetchSubmissions } from "./store.js";
import { entriesForSlider, weightedAverage } from "./math.js";
import { STATUS_THRESHOLDS } from "./constants.js";
import { showMainScreen } from "./main-screen.js";
import { themedColor } from "./themes.js";
import { toDate } from "./utils.js";

const WINDOWS = [
  { id: "7", label: "7 days", days: 7 },
  { id: "30", label: "30 days", days: 30 },
  { id: "all", label: "All time", days: null },
];

let currentWindow = "30";

export async function showStatsScreen(container) {
  const sliders = [...(state.userDoc.sliders || [])].sort((a, b) => a.order - b.order);

  const screen = document.createElement("div");
  screen.className = "screen stats-screen";
  screen.innerHTML = `
    <div class="stats-header">
      <button class="icon-btn" id="backBtn" aria-label="Back">←</button>
      <div class="stats-title">How you're doing</div>
    </div>
    <div class="window-toggle" id="windowToggle">
      ${WINDOWS.map(
        (w) => `<button data-window="${w.id}" class="${w.id === currentWindow ? "active" : ""}">${w.label}</button>`
      ).join("")}
    </div>
    <div id="statsBody">
      <div class="skeleton" style="height:96px;margin-bottom:12px"></div>
      <div class="skeleton" style="height:96px;margin-bottom:12px"></div>
      <div class="skeleton" style="height:180px"></div>
    </div>
  `;

  container.innerHTML = "";
  container.appendChild(screen);
  screen.querySelector("#backBtn").addEventListener("click", () => showMainScreen(container));

  let daily = null;
  const body = screen.querySelector("#statsBody");

  screen.querySelector("#windowToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-window]");
    if (!btn) return;
    currentWindow = btn.dataset.window;
    screen.querySelectorAll("#windowToggle button").forEach((b) => b.classList.toggle("active", b === btn));
    if (daily) renderStats(body, sliders, daily);
  });

  try {
    daily = await fetchSubmissions(state.user.uid, "daily", 300);
  } catch (err) {
    console.error("Stats load failed", err);
    if (screen.isConnected) {
      body.innerHTML = `<div class="stats-empty">Couldn't load your stats. Check your connection and reopen this screen.</div>`;
    }
    return;
  }
  if (!screen.isConnected) return;
  renderStats(body, sliders, daily);
}

function averagesInWindow(sliders, daily) {
  const days = WINDOWS.find((w) => w.id === currentWindow).days;
  const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : 0;
  const inWindow = daily.filter((s) => {
    const when = toDate(s.submittedAt);
    return when && when.getTime() >= cutoff;
  });
  return sliders.map((s, i) => {
    const avg = weightedAverage(entriesForSlider(inWindow, s.id));
    return { slider: s, color: themedColor(s, i), avg, logs: inWindow.length };
  });
}

function renderStats(body, sliders, daily) {
  if (!daily.length) {
    body.innerHTML = `<div class="stats-empty">Log your first check-in to see how each area is doing.</div>`;
    return;
  }

  const rows = averagesInWindow(sliders, daily);
  const withData = rows.filter((r) => r.avg != null);
  if (!withData.length) {
    body.innerHTML = `<div class="stats-empty">No check-ins in this time range. Try a longer one.</div>`;
    return;
  }

  const ranked = [...withData].sort((a, b) => b.avg - a.avg);
  const room = ranked.filter((r) => r.avg < STATUS_THRESHOLDS.yellow).reverse(); // lowest first
  const good = ranked.filter((r) => r.avg >= STATUS_THRESHOLDS.green);
  const overall = withData.reduce((sum, r) => sum + r.avg, 0) / withData.length;

  body.innerHTML = `
    ${callout("room", "Room to grow", room, (r) => `${r.slider.label} <span>${Math.round(100 - r.avg)} points below full</span>`,
      `Nothing under ${STATUS_THRESHOLDS.yellow}% — every area is holding up.`)}
    ${callout("good", "Going well", good, (r) => `${r.slider.label} <span>${Math.round(r.avg)}%</span>`,
      `Nothing at ${STATUS_THRESHOLDS.green}% or above yet.`)}
    <div class="section-title">All areas, best to lowest</div>
    <div class="rank-list">
      ${ranked.map(rankRow).join("")}
      ${rows.filter((r) => r.avg == null).map(noDataRow).join("")}
    </div>
    <div class="overall-line">Overall average across areas: <b>${Math.round(overall)}%</b></div>
  `;
}

function callout(kind, title, items, line, emptyText) {
  return `
    <div class="stats-callout ${kind}">
      <div class="callout-title">${title}</div>
      ${
        items.length
          ? items.map((r) => `<div class="callout-item"><div>${line(r)}</div></div>`).join("")
          : `<div class="callout-empty">${emptyText}</div>`
      }
    </div>`;
}

function statusClass(avg) {
  if (avg >= STATUS_THRESHOLDS.green) return "green";
  if (avg >= STATUS_THRESHOLDS.yellow) return "yellow";
  return "red";
}

function rankRow(r) {
  const pct = Math.max(0, Math.min(100, r.avg));
  return `
    <div class="rank-row">
      <div class="rank-label">${r.slider.label}</div>
      <div class="rank-track"><div class="rank-fill" style="width:${pct}%;background:${r.color}"></div></div>
      <div class="rank-value ${statusClass(r.avg)}">${Math.round(r.avg)}%</div>
    </div>`;
}

function noDataRow(r) {
  return `
    <div class="rank-row">
      <div class="rank-label">${r.slider.label}</div>
      <div class="rank-track"></div>
      <div class="rank-value dim">—</div>
    </div>`;
}
