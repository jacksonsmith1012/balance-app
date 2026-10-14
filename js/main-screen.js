import { state, addSubmission, saveUserDoc, loadStats } from "./store.js";
import { recomputeStats } from "./stats-engine.js";
import { createVerticalSlider } from "./slider-component.js";
import { redistribute, evenSplit, isBalanced, pctToScaledValue, clamp } from "./math.js";
import { checkInDayStart, isSameCheckInDay, DAY_RESET_HOUR } from "./utils.js";
import { showStatsScreen } from "./stats.js";
import { showSettingsScreen } from "./settings.js";
import { themedColor } from "./themes.js";
import { DEFAULT_CADENCE_VALUE } from "./constants.js";

let logging = false; // true while constraints are unlocked for entering today's real values
let preLogValues = null;
let dragBase = null; // slider values when the current drag began
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
 * Makes the sliders add up to exactly `average` x slider count and remembers
 * that average on the account. Values that are already balanced (whole
 * percents, correct total) are left where they are unless `forceSplit` is set;
 * otherwise everything snaps to an even split (all within 1% of each other).
 * Returns true if any slider moved.
 */
function applyAverage(screen, sliders, average, { forceSplit = false } = {}) {
  const total = average * sliders.length;
  const needsSplit = forceSplit || !isBalanced(sliders.map((s) => localValues[s.id]), total);
  const averageChanged = state.userDoc.constraintAverage !== average;
  state.userDoc.constraintAverage = average;

  if (needsSplit) {
    const split = evenSplit(total, sliders.length);
    sliders.forEach((s, i) => (localValues[s.id] = split[i]));
    rememberPositions(localValues);
  }

  if (needsSplit || averageChanged) {
    clearTimeout(persistTimer);
    persistDirty = false;
    saveUserDoc(state.user.uid, {
      sliders: state.userDoc.sliders,
      constraintAverage: average,
    }).catch((err) => console.error("Couldn't save constraint average", err));
  }

  if (needsSplit && screen?.isConnected) {
    for (const s of sliders) {
      const instance = sliderInstances[s.id];
      if (!instance) continue;
      instance.setValue(localValues[s.id], { silent: true });
      instance.setSub(subLabelForValue(s, localValues[s.id]));
    }
  }
  return needsSplit;
}

// Accounts from before the average was stored on the user: work it out from the
// saved stats once, remember it, and rebalance. After this it's always on hand.
async function establishAverage(screen, sliders) {
  if (!state.user) return;
  let average = DEFAULT_CADENCE_VALUE;
  try {
    const stats = await loadStats(state.user.uid);
    const count = Object.keys(stats?.blendedConstraintPerSlider || {}).length || sliders.length;
    if (stats?.blendedConstraintTotal != null) average = stats.blendedConstraintTotal / count;
  } catch (err) {
    console.error("Couldn't load constraint average", err);
    return;
  }
  if (logging || !screen.isConnected) return;
  const moved = applyAverage(screen, sliders, average);
  if (moved && (state.userDoc.dailySubmissionCount || 0) > 0) showRebalanceToast(screen);
}

function showRebalanceToast(screen) {
  showToast(screen, "Rebalanced to match your constraint ⚖️");
}

window.addEventListener("pagehide", persistPositionsNow);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistPositionsNow();
});

export function showMainScreen(container) {
  logging = false;
  preLogValues = null;
  dragBase = null;
  const userDoc = state.userDoc;
  const sliders = [...(userDoc.sliders || [])].sort((a, b) => a.order - b.order);
  const phase = userDoc.phase || 1;

  localValues = {};
  for (const s of sliders) localValues[s.id] = clamp(s.currentValue ?? 50);

  // The total is locked to the stored constraint average from the moment the
  // screen loads — anything that doesn't add up gets evened out before it's drawn.
  const hasAverage = userDoc.constraintAverage != null;
  const corrected = hasAverage ? applyAverage(null, sliders, userDoc.constraintAverage) : false;

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
      sub: subLabelForValue(s, localValues[s.id]),
      value: localValues[s.id],
      onStart: () => {
        dragBase = { ...localValues };
      },
      onChange: (v) => handleSliderChange(s.id, v, sliders),
      onCommit: () => {
        dragBase = null;
      },
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

  renderSubmitArea(screen, sliders, alreadySubmittedToday);

  if (hasAverage) {
    if (corrected && (userDoc.dailySubmissionCount || 0) > 0) showRebalanceToast(screen);
  } else {
    establishAverage(screen, sliders);
  }
}

function renderSubmitArea(screen, sliders, alreadySubmittedToday) {
  const area = screen.querySelector("#submitArea");
  const banner = screen.querySelector("#unlockBanner");
  screen.classList.toggle("unlocked", logging);

  if (logging) {
    banner.hidden = false;
    banner.textContent = "🔓 Constraint unlocked — set each slider to how today really went.";
    area.innerHTML = `
      <div class="submit-row">
        <button class="btn btn-secondary" id="cancelLogBtn">Cancel</button>
        <button class="submit-btn" id="confirmBtn">Confirm &amp; Log</button>
      </div>`;
    area.querySelector("#cancelLogBtn").addEventListener("click", () => {
      cancelLogging(sliders);
      renderSubmitArea(screen, sliders, alreadySubmittedToday);
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
    renderSubmitArea(screen, sliders, alreadySubmittedToday);
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

function handleSliderChange(changedId, newValue, sliders) {
  if (logging) {
    // Entering what really happened: only this slider moves.
    localValues = { ...localValues, [changedId]: Math.round(clamp(newValue)) };
  } else {
    // Locked: the total can't change, so everyone else moves with it.
    localValues = redistribute(dragBase ?? localValues, changedId, newValue);
    rememberPositions(localValues);
    schedulePersist();
  }

  for (const s of sliders) {
    const instance = sliderInstances[s.id];
    if (!instance) continue;
    if (!logging || s.id !== changedId) instance.setValue(localValues[s.id], { silent: true });
    instance.setSub(subLabelForValue(s, localValues[s.id]));
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

  // Back to locked: every slider returns to the same level (within 1%) so they
  // add up to the freshly updated constraint average — not whatever you just logged.
  if (stats?.blendedConstraintTotal != null) {
    applyAverage(screen, sliders, stats.blendedConstraintTotal / sliders.length, { forceSplit: true });
  }

  logging = false;
  preLogValues = null;
  renderSubmitArea(screen, sliders, true);
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
