import { state, addSubmission, saveUserDoc } from "./store.js";
import { recomputeStats } from "./stats-engine.js";
import { createVerticalSlider } from "./slider-component.js";
import {
  redistribute,
  redistributionStrengthForPhase,
  pctToScaledValue,
  entriesForSlider,
  overrideWeightRamp,
  clamp,
} from "./math.js";
import { checkInDayStart, isSameCheckInDay } from "./utils.js";
import { fetchSubmissions } from "./store.js";
import { showStatsScreen } from "./stats.js";
import { showSettingsScreen } from "./settings.js";
import { themedColor } from "./themes.js";
import { DAY_RESET_HOUR } from "./utils.js";

let overrideActive = false;
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

window.addEventListener("pagehide", persistPositionsNow);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistPositionsNow();
});

export function showMainScreen(container) {
  overrideActive = false;
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
    ${
      phase === 3
        ? `<div class="override-row"><button class="override-toggle" id="overrideToggle">🔓 Override: independent for this entry</button></div>`
        : ""
    }
    <div class="slider-track-area" id="sliderArea"></div>
    <div class="submit-area">
      <button class="submit-btn" id="submitBtn" ${alreadySubmittedToday ? "disabled" : ""}>
        ${alreadySubmittedToday ? "Logged for today ✓" : "Log Today"}
      </button>
      ${
        alreadySubmittedToday
          ? `<div class="submit-hint">Sliders keep where you leave them. Next check-in opens at ${DAY_RESET_HOUR}:00 AM.</div>`
          : ""
      }
    </div>
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

  const overrideToggle = screen.querySelector("#overrideToggle");
  if (overrideToggle) {
    overrideToggle.addEventListener("click", () => {
      overrideActive = !overrideActive;
      overrideToggle.classList.toggle("active", overrideActive);
      overrideToggle.textContent = overrideActive
        ? "🔓 Override active — this entry won't rebalance others"
        : "🔓 Override: independent for this entry";
    });
  }

  screen.querySelector("#statsBtn").addEventListener("click", () => {
    persistPositionsNow();
    showStatsScreen(container);
  });
  screen.querySelector("#settingsBtn").addEventListener("click", () => {
    persistPositionsNow();
    showSettingsScreen(container);
  });

  const submitBtn = screen.querySelector("#submitBtn");
  submitBtn.addEventListener("click", () => handleSubmit(submitBtn, screen, sliders));
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
  const strength = overrideActive && phase === 3 ? 0 : redistributionStrengthForPhase(phase);
  const updated = redistribute(localValues, changedId, newValue, strength);
  localValues = updated;
  rememberPositions(updated);
  schedulePersist();

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
  const wasOverride = overrideActive;

  let overrideWeight = 1.0;
  if (wasOverride) {
    try {
      const daily = await fetchSubmissions(uid, "daily", 60);
      const recentOverrides = daily.filter((sub) => sub.isOverride);
      overrideWeight = overrideWeightRamp(recentOverrides);
    } catch {
      overrideWeight = 0.5;
    }
  }

  const values = {};
  for (const s of sliders) values[s.id] = Math.round(localValues[s.id]);

  try {
    await addSubmission(uid, {
      type: "daily",
      periodStart: checkInDayStart(),
      values,
      isOverride: wasOverride,
      overrideWeight,
    });
    await recomputeStats(uid);
  } catch (err) {
    console.error("Submit failed", err);
    submitBtn.disabled = false;
    submitBtn.textContent = "Log Today";
    return;
  }

  showToast(screen, "Logged ✓");
  submitBtn.classList.add("pulse");
  submitBtn.disabled = true;
  submitBtn.textContent = "Logged for today ✓";

  const newPhase = state.userDoc.phase || previousPhase;
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
