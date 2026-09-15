import { state, saveUserDoc, loadUserDoc, createUserDoc } from "./store.js";
import { auth, googleProvider, signInWithPopup, signInWithRedirect } from "./firebase.js";
import { SLIDER_CATALOG, MIN_SLIDERS, MAX_SLIDERS, getSliderMeta } from "./constants.js";
import { createVerticalSlider } from "./slider-component.js";
import { setupPushNotifications, promptAddToHomeScreen } from "./notifications.js";

const TOTAL_STEPS = 8;

export function renderOnboarding(container, { onComplete }) {
  const step = state.onboardingStep || 1;
  const draft = state.onboardingDraft;

  const wrapper = document.createElement("div");
  wrapper.className = "screen onboarding";
  wrapper.style.position = "relative";

  const progress = document.createElement("div");
  progress.className = "onboarding-progress";
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const dot = document.createElement("div");
    dot.className = "onboarding-progress-dot" + (i <= step ? " done" : "");
    progress.appendChild(dot);
  }

  container.innerHTML = "";
  container.appendChild(progress);
  container.appendChild(wrapper);

  const next = () => {
    state.onboardingStep = step + 1;
    renderOnboarding(container, { onComplete });
  };
  const back = () => {
    state.onboardingStep = Math.max(1, step - 1);
    renderOnboarding(container, { onComplete });
  };

  const steps = {
    1: renderWelcome,
    2: renderSignIn,
    3: renderName,
    4: renderChooseSliders,
    5: renderConfigureSliders,
    6: renderNotifications,
    7: renderAddToHomeScreen,
    8: renderDone,
  };

  (steps[step] || renderWelcome)(wrapper, { draft, next, back, container, onComplete });
}

function renderWelcome(el, { next }) {
  el.innerHTML = `
    <div class="logo-mark"></div>
    <h1 class="onb-title">Welcome to Balance</h1>
    <p class="onb-body">
      Track how satisfied you are across the parts of life that matter to you.
      Over time, Balance shows you the real trade-offs between them.
    </p>
    <div class="onb-footer">
      <button class="btn btn-primary btn-block" id="startBtn">Let's get started</button>
    </div>
  `;
  el.querySelector("#startBtn").addEventListener("click", next);
}

function renderSignIn(el, { next, back }) {
  el.innerHTML = `
    <p class="eyebrow">Step 2 of ${TOTAL_STEPS}</p>
    <h1 class="onb-title">Sign in to continue</h1>
    <p class="onb-body">Your data stays with your Google account — access it on any device.</p>
    <button class="google-btn" id="googleBtn">
      <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
      Sign in with Google
    </button>
    <div id="signInError" style="color:var(--red);font-size:13px;text-align:center;"></div>
    <div class="onb-footer">
      <button class="btn btn-secondary" id="backBtn">Back</button>
    </div>
  `;
  el.querySelector("#backBtn").addEventListener("click", back);
  el.querySelector("#googleBtn").addEventListener("click", async () => {
    const errorEl = el.querySelector("#signInError");
    errorEl.textContent = "";
    try {
      // Popup first: avoids the cross-domain redirect bounce through the
      // firebaseapp.com authDomain, which Safari's tracking prevention often
      // breaks (auth succeeds on Google's side but the app never sees it,
      // looping back to sign-in). Redirect is only a fallback for when the
      // popup itself is blocked.
      let result;
      try {
        result = await signInWithPopup(auth, googleProvider);
      } catch (popupErr) {
        if (
          popupErr.code === "auth/popup-blocked" ||
          popupErr.code === "auth/operation-not-supported-in-this-environment" ||
          popupErr.code === "auth/cancelled-popup-request"
        ) {
          await signInWithRedirect(auth, googleProvider);
          return;
        }
        throw popupErr;
      }

      state.user = result.user;
      let userDoc = await loadUserDoc(result.user.uid);
      if (!userDoc) {
        userDoc = await createUserDoc(result.user.uid, {
          name: result.user.displayName || "",
          email: result.user.email || "",
        });
      }
      state.onboardingDraft.name = state.onboardingDraft.name || userDoc.name || result.user.displayName || "";
      next();
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Sign-in failed. Please try again.";
    }
  });
}

function renderName(el, { draft, next, back }) {
  el.innerHTML = `
    <p class="eyebrow">Step 3 of ${TOTAL_STEPS}</p>
    <h1 class="onb-title">What's your name?</h1>
    <input class="text-input" id="nameInput" value="${draft.name || ""}" placeholder="Your name" />
    <div class="onb-footer">
      <button class="btn btn-secondary" id="backBtn">Back</button>
      <button class="btn btn-primary btn-block" id="continueBtn">Continue</button>
    </div>
  `;
  const input = el.querySelector("#nameInput");
  const continueBtn = el.querySelector("#continueBtn");
  const updateState = () => (continueBtn.disabled = !input.value.trim());
  input.addEventListener("input", updateState);
  updateState();

  el.querySelector("#backBtn").addEventListener("click", back);
  continueBtn.addEventListener("click", () => {
    draft.name = input.value.trim();
    next();
  });
}

function renderChooseSliders(el, { draft, next, back }) {
  draft.selectedIds = draft.selectedIds || ["sleep", "love", "work"];

  const renderGrid = () => {
    const grid = el.querySelector("#cardGrid");
    grid.innerHTML = SLIDER_CATALOG.map((c) => {
      const selected = draft.selectedIds.includes(c.id);
      return `
        <div class="category-card ${selected ? "selected" : ""}" data-id="${c.id}" style="--card-color:${c.color}">
          <div class="category-icon">${c.icon}</div>
          <div class="category-label">${c.label}</div>
        </div>`;
    }).join("");

    grid.querySelectorAll(".category-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        const idx = draft.selectedIds.indexOf(id);
        if (idx >= 0) {
          draft.selectedIds.splice(idx, 1);
        } else if (draft.selectedIds.length < MAX_SLIDERS) {
          draft.selectedIds.push(id);
        }
        renderGrid();
        updateContinue();
      });
    });
  };

  const updateContinue = () => {
    const n = draft.selectedIds.length;
    el.querySelector("#hint").textContent = `${n} selected — choose ${MIN_SLIDERS} to ${MAX_SLIDERS}`;
    el.querySelector("#continueBtn").disabled = n < MIN_SLIDERS || n > MAX_SLIDERS;
  };

  el.innerHTML = `
    <p class="eyebrow">Step 4 of ${TOTAL_STEPS}</p>
    <h1 class="onb-title">Choose your sliders</h1>
    <p class="onb-body">Pick the areas of life you want to track (2–7).</p>
    <div class="card-grid" id="cardGrid"></div>
    <div class="selection-hint" id="hint"></div>
    <div class="onb-footer">
      <button class="btn btn-secondary" id="backBtn">Back</button>
      <button class="btn btn-primary btn-block" id="continueBtn">Continue</button>
    </div>
  `;

  renderGrid();
  updateContinue();

  el.querySelector("#backBtn").addEventListener("click", back);
  el.querySelector("#continueBtn").addEventListener("click", () => {
    draft.configuredSliders = draft.configuredSliders || {};
    draft.configIndex = 0;
    next();
  });
}

function renderConfigureSliders(el, { draft, next, back, container, onComplete }) {
  const ids = draft.selectedIds;
  const idx = draft.configIndex || 0;

  if (idx >= ids.length) {
    next();
    return;
  }

  const meta = getSliderMeta(ids[idx]);
  const isSleep = meta.id === "sleep";
  const isFitness = meta.id === "fitness";
  const existing = draft.configuredSliders[meta.id] || {};

  el.innerHTML = `
    <p class="eyebrow">Step 5 of ${TOTAL_STEPS} · Configure ${idx + 1}/${ids.length}</p>
    <h1 class="onb-title">${meta.icon} ${meta.label}</h1>
    ${configBodyFor(meta, existing)}
    <div class="slider-preview-row" id="previewRow"></div>
    <div class="onb-footer">
      <button class="btn btn-secondary" id="backBtn">Back</button>
      <button class="btn btn-primary btn-block" id="continueBtn">Continue</button>
    </div>
  `;

  const previewRow = el.querySelector("#previewRow");
  let previewValue = 50;
  const preview = createVerticalSlider({
    color: meta.color,
    label: meta.label,
    value: previewValue,
    interactive: false,
  });
  preview.el.style.height = "220px";
  preview.el.style.maxWidth = "110px";
  previewRow.appendChild(preview.el);

  if (isSleep) {
    const satInput = el.querySelector("#satInput");
    const unsatInput = el.querySelector("#unsatInput");
    const sync = () => {
      const sat = Number(satInput.value) || 8;
      const unsat = Number(unsatInput.value) || 4;
      preview.setSub(`${sat}h target`);
    };
    satInput.addEventListener("input", sync);
    unsatInput.addEventListener("input", sync);
    sync();
  }

  if (isFitness) {
    const choices = el.querySelectorAll(".choice-btn");
    choices.forEach((btn) => {
      btn.addEventListener("click", () => {
        choices.forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        draft.fitnessMetricChoice = btn.dataset.metric;
      });
    });
  }

  el.querySelector("#backBtn").addEventListener("click", () => {
    if (idx === 0) {
      state.onboardingStep = 4;
      renderOnboarding(container, { onComplete });
    } else {
      draft.configIndex = idx - 1;
      renderOnboarding(container, { onComplete });
    }
  });

  el.querySelector("#continueBtn").addEventListener("click", () => {
    const config = { id: meta.id, label: meta.label, color: meta.color, order: idx };
    if (isSleep) {
      config.metricType = "hours";
      config.satisfiedValue = Number(el.querySelector("#satInput").value) || 8;
      config.unsatisfiedValue = Number(el.querySelector("#unsatInput").value) || 4;
    } else if (isFitness) {
      const choice = draft.fitnessMetricChoice || "satisfaction";
      config.metricType = choice === "days" ? "days" : "satisfaction";
      config.satisfiedValue = choice === "days" ? 7 : null;
      config.unsatisfiedValue = choice === "days" ? 0 : null;
    } else {
      config.metricType = "satisfaction";
      config.satisfiedValue = null;
      config.unsatisfiedValue = null;
    }
    config.currentValue = 50;
    draft.configuredSliders[meta.id] = config;
    draft.configIndex = idx + 1;
    renderOnboarding(container, { onComplete });
  });
}

function configBodyFor(meta, existing) {
  if (meta.id === "sleep") {
    return `
      <p class="onb-body">Set the range that maps to 0–100% satisfaction.</p>
      <div class="config-row">
        <div class="config-field">
          <label>Fully satisfied (hrs)</label>
          <input class="text-input" type="number" id="satInput" value="${existing.satisfiedValue ?? 8}" />
        </div>
        <div class="config-field">
          <label>Completely unsatisfied (hrs)</label>
          <input class="text-input" type="number" id="unsatInput" value="${existing.unsatisfiedValue ?? 4}" />
        </div>
      </div>
    `;
  }
  if (meta.id === "fitness") {
    return `
      <p class="onb-body">How do you want to measure fitness?</p>
      <div class="metric-choice">
        <button class="choice-btn selected" data-metric="satisfaction">Satisfaction %</button>
        <button class="choice-btn" data-metric="days">Days per week</button>
      </div>
    `;
  }
  return `<p class="onb-body">We'll track your satisfaction with ${meta.label.toLowerCase()} from 0–100%.</p>`;
}

function renderNotifications(el, { draft, next, back }) {
  el.innerHTML = `
    <p class="eyebrow">Step 6 of ${TOTAL_STEPS}</p>
    <h1 class="onb-title">Stay on track</h1>
    <p class="onb-body">
      We'll send a daily reminder to check in, plus weekly and monthly prompts to reflect on the bigger picture.
    </p>
    <div>
      <label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;">Daily reminder time</label>
      <input class="time-input" type="time" id="timeInput" value="${draft.notificationTime || "21:00"}" />
    </div>
    <button class="btn btn-secondary btn-block" id="enableBtn">Enable notifications</button>
    <div class="onb-footer">
      <button class="btn btn-secondary" id="backBtn">Back</button>
      <button class="btn btn-primary btn-block" id="continueBtn">Continue</button>
    </div>
  `;

  el.querySelector("#backBtn").addEventListener("click", back);
  el.querySelector("#enableBtn").addEventListener("click", async (e) => {
    e.target.textContent = "Requesting…";
    await setupPushNotifications();
    e.target.textContent = "Notifications enabled ✓";
    e.target.disabled = true;
  });
  el.querySelector("#continueBtn").addEventListener("click", () => {
    draft.notificationTime = el.querySelector("#timeInput").value || "21:00";
    next();
  });
}

function renderAddToHomeScreen(el, { draft, next, back }) {
  let dismissed = false;

  el.innerHTML = `
    <p class="eyebrow">Step 7 of ${TOTAL_STEPS}</p>
    <h1 class="onb-title">Add Balance to your Home Screen</h1>
    <p class="onb-body">
      Required for notifications on iPhone. Gives you the full app experience.
    </p>
    <button class="btn btn-primary btn-block" id="addBtn">Add to Home Screen</button>
    <button class="btn btn-ghost btn-block" id="laterBtn">I'll do it later</button>
    <div class="onb-footer">
      <button class="btn btn-secondary" id="backBtn">Back</button>
      <button class="btn btn-primary btn-block" id="continueBtn" disabled>Continue</button>
    </div>
  `;

  const continueBtn = el.querySelector("#continueBtn");
  const markDismissed = () => {
    dismissed = true;
    draft.addToHomeScreenDismissed = true;
    continueBtn.disabled = false;
  };

  el.querySelector("#backBtn").addEventListener("click", back);
  el.querySelector("#addBtn").addEventListener("click", async () => {
    await promptAddToHomeScreen();
    markDismissed();
  });
  el.querySelector("#laterBtn").addEventListener("click", markDismissed);
  continueBtn.addEventListener("click", () => {
    if (dismissed) next();
  });
}

async function renderDone(el, { draft, container, onComplete }) {
  el.innerHTML = `
    <div class="logo-mark"></div>
    <h1 class="onb-title">You're all set, ${draft.name || "there"}</h1>
    <p class="onb-body">Your sliders are ready. Log your first check-in whenever you're ready.</p>
    <div class="onb-footer">
      <button class="btn btn-primary btn-block" id="finishBtn">Start using Balance</button>
    </div>
  `;

  el.querySelector("#finishBtn").addEventListener("click", async () => {
    const finishBtn = el.querySelector("#finishBtn");
    finishBtn.disabled = true;
    finishBtn.textContent = "Setting up…";

    const sliders = draft.selectedIds.map((id, i) => ({
      ...draft.configuredSliders[id],
      order: i,
    }));

    try {
      await saveUserDoc(state.user.uid, {
        name: draft.name,
        notificationTime: draft.notificationTime || "21:00",
        addToHomeScreenDismissed: !!draft.addToHomeScreenDismissed,
        sliders,
        setupComplete: true,
      });
    } catch (err) {
      console.error("Failed to finish setup:", err);
      finishBtn.disabled = false;
      finishBtn.textContent = "Start using Balance";
      alert("Couldn't save your setup — check your connection and try again.");
      return;
    }

    state.onboardingStep = 1;
    state.onboardingDraft = {};
    onComplete();
  });
}
