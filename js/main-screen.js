import { state, addSubmission, saveUserDoc, loadStats } from "./store.js";
import { recomputeStats } from "./stats-engine.js";
import { createVerticalSlider } from "./slider-component.js";
import {
  redistribute,
  redistributionStrengthForPhase,
  pctToScaledValue,
  clamp,
} from "./math.js";
import { checkInDayStart, isSameCheckInDay } from "./utils.js";
import { showStatsScreen } from "./stats.js";
import { showSettingsScreen } from "./settings.js";
import { themedColor } from "./themes.js";
import { DAY_RESET_HOUR } from "./utils.js";

let logging = false; // true while constraints are unlocked for entering today's real values
let preLogValues = null;
let sliderInstances = {};
let localValues = {};
let persistTimer = null;
let persistDirty = false;

// Slider positions are saved to the account shortly after each move, so they
// reload where you left them even when today's check-in is already logged.
function persistPositionsNow() {
  clearTimeout(persistTimer);
  persistTimer = null;
  if (!persistDirty || !state.user || !state.userDoc) return;
  persistDirty = false;
  saveUserDoc(state.user.uid, { sliders: state.userDoc.sliders }).catch((err) => {
    persistDirty = true;
    console.error("Couldn't save slider positions", err);
  });
}

function schedulePersist() {
  persistDirty = true;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistPositionsNow, 500);
}

function rememberPositions(values) {
  state.userDoc.sliders = (state.userDoc.sliders || []).map((s) =>
    Object.prototype.hasOwnProperty.call(values, s.id)
      ? { ...s, currentValue: Math.round(values[s.id] * 10) / 10 }
      : s
  );
}

/**
 * Snaps every slider to an even share of `total` and persists it, visually
 * animating the sliders already on screen if `screen` is still mounted.
 */
function applyEvenSplit(screen, sliders, total) {
  const evenValue = clamp(total / sliders.length);
  localValues = {};
  for (const s of sliders) localValues[s.id] = evenValue;
  rememberPositions(localValues);
  persistDirty = true;
  persistPositionsNow();

  if (!screen || !screen.isConnected) return;
  for (const s of sliders) {
    const instance = sliderInstances[s.id];
    if (!instance) continue;
    instance.setValue(evenValue, { silent: true });
    instance.setSub(subLabelForValue(s, evenValue));
  }
}

// On every load, make sure the locked total still matches the constraint —
// covers values that drifted from the old redistribution bug, a slider that
// was added/removed since the last visit, or any other way the two could get
// out of sync. A correct, already-matching total is left untouched.
async function reconcileWithConstraint(screen, sliders, phase) {
  if (phase !== 3 || !sliders.length || !state.user) return;
  let stats;
  try {
    stats = await loadStats(state.user.uid);
  } catch (err) {
    console.error("Couldn't check constraint total", err);
    return;
  }
  const total = stats?.blendedConstraintTotal;
  if (total == null) return;
  if (logging) return; // don't fight a log in progress

  const currentTotal = sliders.reduce((sum, s) => sum + (localValues[s.id] ?? 0), 0);
  if (Math.abs(currentTotal - total) < 0.5) return;

  applyEvenSplit(screen, sliders, total);
  if (screen?.isConnected) showToast(screen, "Rebalanced to match your constraint ⚖️");
}

window.addEventListener("pagehide", persistPositionsNow);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistPositionsNow();
});

export function showMainScreen(container) {
  logging = false;
  preLogValues = null;
  const userDoc = state.userDoc;
  const sliders = [...(userDoc.sliders || [])].sort((a, b) => a.order - b.order);
  const phase = userDoc.phase || 1;

  localValues = {};
  for (const s of sliders) localValues[s.id] = clamp(s.currentValue ?? 50);

  const alreadySubmittedToday = isSameCheckInDay(userDoc.lastDailySubmission);

  const screen = document.createElement("div");
  screen.className = "screen";
  screen.style.display = "flex";

  screen.innerHTML = `
    <div class="main-header">
      <button class="icon-btn" id="statsBtn" aria-label="Stats">📊</button>
      <div class="app-title">Balance</div>
      <button class="icon-btn" id="settingsBtn" aria-label="Settings">⚙️</button>
    </div>
    ${
      phase < 3
        ? `<div class="warning-banner">Still learning your patterns — data may not reflect reality yet.</div>`
        : ""
    }
    <div class="unlock-banner" id="unlockBanner" hidden></div>
    <div class="slider-track-area" id="sliderArea"></div>
    <div class="submit-area" id="submitArea"></div>
    <div class="toast" id="toast">Logged ✓</div>
  `;

  container.innerHTML = "";
  container.appendChild(screen);

  const sliderArea = screen.querySelector("#sliderArea");
  sliderInstances = {};

  sliders.forEach((s, i) => {
    const instance = createVerticalSlider({
      color: themedColor(s, i),
      label: s.label,
      sub: subLabelFor(s),
      value: localValues[s.id],
      onChange: (v) => handleSliderChange(s.id, v, sliders, phase),
    });
    sliderInstances[s.id] = instance;
    sliderArea.appendChild(instance.el);
  });

  screen.querySelector("#statsBtn").addEventListener("click", () => {
    persistPositionsNow();
    showStatsScreen(container);
  });
  screen.querySelector("#settingsBtn").addEventListener("click", () => {
    persistPositionsNow();
    showSettingsScreen(container);
  });

  renderSubmitArea(screen, sliders, phase, alreadySubmittedToday);
  reconcileWithConstraint(screen, sliders, phase);
}

function renderSubmitArea(screen, sliders, phase, alreadySubmittedToday) {
  const area = screen.querySelector("#submitArea");
  const banner = screen.querySelector("#unlockBanner");
  screen.classList.toggle("unlocked", logging);

  if (logging) {
    banner.hidden = false;
    banner.textContent =
      phase === 1
        ? "Set each slider to how today really went."
        : "🔓 Constraints unlocked — set each slider to how today really went.";
    area.innerHTML = `
      <div class="submit-row">
        <button class="btn btn-secondary" id="cancelLogBtn">Cancel</button>
        <button class="submit-btn" id="confirmBtn">Confirm &amp; Log</button>
      </div>`;
    area.querySelector("#cancelLogBtn").addEventListener("click", () => {
      cancelLogging(sliders);
      renderSubmitArea(screen, sliders, phase, alreadySubmittedToday);
    });
    const confirmBtn = area.querySelector("#confirmBtn");
    confirmBtn.addEventListener("click", () => handleSubmit(confirmBtn, screen, sliders));
    return;
  }

  banner.hidden = true;
  area.innerHTML = `
    <button class="submit-btn" id="submitBtn" ${alreadySubmittedToday ? "disabled" : ""}>
      ${alreadySubmittedToday ? "Logged for today ✓" : "Log Today"}
    </button>
    ${
      alreadySubmittedToday
        ? `<div class="submit-hint">Sliders keep where you leave them. Next check-in opens at ${DAY_RESET_HOUR}:00 AM.</div>`
        : ""
    }`;
  const submitBtn = area.querySelector("#submitBtn");
  submitBtn.addEventListener("click", () => {
    startLogging();
    renderSubmitArea(screen, sliders, phase, alreadySubmittedToday);
  });
}

function startLogging() {
  persistPositionsNow();
  preLogValues = { ...localValues };
  logging = true;
}

function cancelLogging(sliders) {
  logging = false;
  localValues = { ...preLogValues };
  preLogValues = null;
  for (const s of sliders) {
    const instance = sliderInstances[s.id];
    if (!instance) continue;
    instance.setValue(localValues[s.id], { silent: true });
    instance.setSub(subLabelForValue(s, localValues[s.id]));
  }
}

function subLabelFor(s) {
  if (s.metricType === "hours" || s.metricType === "days") {
    const actual = pctToScaledValue(s.currentValue ?? 50, s.satisfiedValue, s.unsatisfiedValue);
    const unit = s.metricType === "hours" ? "hrs" : "d/wk";
    return `${actual.toFixed(1)} ${unit}`;
  }
  return "";
}

function handleSliderChange(changedId, newValue, sliders, phase) {
  const strength = logging ? 0 : redistributionStrengthForPhase(phase);
  const updated = redistribute(localValues, changedId, newValue, strength);
  localValues = updated;
  if (!logging) {
    rememberPositions(updated);
    schedulePersist();
  }

  for (const s of sliders) {
    const instance = sliderInstances[s.id];
    if (!instance) continue;
    if (s.id !== changedId) {
      instance.setValue(updated[s.id], { silent: true });
    }
    instance.setSub(subLabelForValue(s, updated[s.id]));
  }
}

function subLabelForValue(s, value) {
  if (s.metricType === "hours" || s.metricType === "days") {
    const actual = pctToScaledValue(value, s.satisfiedValue, s.unsatisfiedValue);
    const unit = s.metricType === "hours" ? "hrs" : "d/wk";
    return `${actual.toFixed(1)} ${unit}`;
  }
  return "";
}

async function handleSubmit(submitBtn, screen, sliders) {
  const uid = state.user.uid;
  clearTimeout(persistTimer);
  persistDirty = false;
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";

  const previousPhase = state.userDoc.phase || 1;

  const values = {};
  for (const s of sliders) values[s.id] = Math.round(localValues[s.id]);

  let stats;
  try {
    await addSubmission(uid, {
      type: "daily",
      periodStart: checkInDayStart(),
      values,
      isOverride: false,
      overrideWeight: 1.0,
    });
    stats = await recomputeStats(uid);
  } catch (err) {
    console.error("Submit failed", err);
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm & Log";
    return;
  }

  const newPhase = state.userDoc.phase || previousPhase;

  // In full constraint mode, the locked view always starts from an even split
  // of the constraint average — not whatever you just logged — so the total
  // you drag around afterward is always exactly the constraint, never
  // whatever happened to be entered this time.
  if (newPhase === 3 && stats?.blendedConstraintTotal != null) {
    applyEvenSplit(screen, sliders, stats.blendedConstraintTotal);
  }

  logging = false;
  preLogValues = null;
  renderSubmitArea(screen, sliders, newPhase, true);
  showToast(screen, "Logged ✓");
  screen.querySelector("#submitBtn")?.classList.add("pulse");

  if (previousPhase < 3 && newPhase === 3) {
    showPhase3Activation(screen);
  }
}

function showToast(screen, message) {
  const toast = screen.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

function showPhase3Activation(screen) {
  const overlay = document.createElement("div");
  overlay.className = "phase3-banner";
  overlay.innerHTML = `
    <div>
      <div style="font-size:40px;margin-bottom:12px;">⚖️</div>
      <div style="font-size:20px;font-weight:800;margin-bottom:8px;">Balance mode activated</div>
      <div style="color:var(--text-dim);font-size:14px;max-width:280px;margin:0 auto 20px;">
        You've logged 14 days. Now your sliders reflect real trade-offs — moving one shifts the others.
      </div>
      <button class="btn btn-primary" id="phase3Dismiss">Got it</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#phase3Dismiss").addEventListener("click", () => overlay.remove());
}
