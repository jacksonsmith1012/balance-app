import { state, fetchSubmissions, loadStats } from "./store.js";
import { statusColor, trendArrow } from "./math.js";
import { STATUS_THRESHOLDS } from "./constants.js";
import { showMainScreen } from "./main-screen.js";

let currentCadence = "daily";

export async function showStatsScreen(container) {
  const userDoc = state.userDoc;
  const sliders = [...(userDoc.sliders || [])].sort((a, b) => a.order - b.order);

  const screen = document.createElement("div");
  screen.className = "screen stats-screen";
  screen.innerHTML = `
    <div class="stats-header">
      <button class="icon-btn" id="backBtn" aria-label="Back">←</button>
      <div class="stats-title">Your Balance</div>
    </div>
    <div class="overview-scroll" id="overviewScroll"></div>
    <div class="section-title">Balance View</div>
    <div class="balance-view" id="balanceView"></div>
    <div class="section-title">Trends</div>
    <div class="cadence-toggle" id="cadenceToggle">
      <button data-cadence="daily" class="active">Daily</button>
      <button data-cadence="weekly">Weekly</button>
      <button data-cadence="monthly">Monthly</button>
    </div>
    <div class="trend-chart" id="trendChart"></div>
  `;

  container.innerHTML = "";
  container.appendChild(screen);

  screen.querySelector("#backBtn").addEventListener("click", () => showMainScreen(container));

  const stats = (await loadStats(state.user.uid)) || {};

  renderOverview(screen, sliders, stats);
  renderBalanceView(screen, sliders, stats);

  currentCadence = "daily";
  await renderTrendChart(screen, sliders, currentCadence);

  screen.querySelector("#cadenceToggle").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-cadence]");
    if (!btn) return;
    currentCadence = btn.dataset.cadence;
    screen.querySelectorAll("#cadenceToggle button").forEach((b) => b.classList.toggle("active", b === btn));
    await renderTrendChart(screen, sliders, currentCadence);
  });
}

function renderOverview(screen, sliders, stats) {
  const wrap = screen.querySelector("#overviewScroll");
  wrap.innerHTML = "";
  for (const s of sliders) {
    const current = stats.dailyAvg?.[s.id];
    const prior = stats.weeklyAvg?.[s.id];
    const trend = trendArrow(current, prior);
    const color = statusColor(current, STATUS_THRESHOLDS);
    const arrowChar = trend === "up" ? "▲" : trend === "down" ? "▼" : "▬";
    const card = document.createElement("div");
    card.className = "overview-card";
    card.innerHTML = `
      <div class="label">${s.label}</div>
      <div class="value">${current != null ? Math.round(current) + "%" : "—"}</div>
      <div class="trend"><span class="status-dot ${color}"></span>${arrowChar} vs weekly</div>
    `;
    wrap.appendChild(card);
  }
}

function renderBalanceView(screen, sliders, stats) {
  const wrap = screen.querySelector("#balanceView");
  wrap.innerHTML = "";
  const total = stats.blendedConstraintTotal;
  const summary = document.createElement("div");
  summary.style.cssText = "margin-bottom:14px;color:var(--text-dim);font-size:13px;";
  summary.textContent =
    total != null
      ? `Blended constraint total: ${Math.round(total)} across ${sliders.length} areas`
      : "Not enough data yet — keep logging to unlock your balance view.";
  wrap.appendChild(summary);

  for (const s of sliders) {
    const constraintVal = stats.blendedConstraintPerSlider?.[s.id];
    const currentVal = s.currentValue ?? 0;
    const row = document.createElement("div");
    row.className = "balance-bar-row";
    row.innerHTML = `
      <div class="balance-bar-label">${s.label}</div>
      <div class="balance-bar-track">
        <div class="balance-bar-fill" style="width:${clampPct(currentVal)}%;background:${s.color}"></div>
      </div>
      <div class="balance-bar-value">${Math.round(currentVal)}%</div>
    `;
    wrap.appendChild(row);
    if (constraintVal != null) {
      const sub = document.createElement("div");
      sub.style.cssText = "font-size:11px;color:var(--text-faint);margin:-4px 0 8px 80px;";
      sub.textContent = `constraint avg: ${Math.round(constraintVal)}%`;
      wrap.appendChild(sub);
    }
  }
}

function clampPct(v) {
  return Math.min(100, Math.max(0, v));
}

async function renderTrendChart(screen, sliders, cadence) {
  const chart = screen.querySelector("#trendChart");
  chart.innerHTML = `<div style="color:var(--text-faint);font-size:13px;padding:20px;text-align:center;">Loading…</div>`;

  const submissions = await fetchSubmissions(state.user.uid, cadence, 60);
  const ordered = submissions.slice().reverse(); // oldest first

  if (ordered.length < 2) {
    chart.innerHTML = `<div style="color:var(--text-faint);font-size:13px;padding:20px;text-align:center;">Not enough ${cadence} data yet.</div>`;
    return;
  }

  const width = 320;
  const height = 160;
  const padding = 10;
  const n = ordered.length;

  const xFor = (i) => padding + (i / (n - 1)) * (width - padding * 2);
  const yFor = (v) => height - padding - (v / 100) * (height - padding * 2);

  let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none">`;
  svg += `<line x1="${padding}" y1="${yFor(50)}" x2="${width - padding}" y2="${yFor(50)}" stroke="var(--border)" stroke-dasharray="4 4" />`;

  for (const s of sliders) {
    const points = ordered.map((sub, i) => {
      const v = sub.values?.[s.id];
      return v == null ? null : `${xFor(i)},${yFor(v)}`;
    });
    const validPoints = points.filter(Boolean);
    if (validPoints.length < 2) continue;
    svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${validPoints.join(" ")}" />`;
  }
  svg += `</svg>`;

  const legend = sliders
    .map(
      (s) =>
        `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px;font-size:11px;color:var(--text-dim);">
          <span style="width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block;"></span>${s.label}
        </span>`
    )
    .join("");

  chart.innerHTML = svg + `<div style="margin-top:10px;">${legend}</div>`;
}
