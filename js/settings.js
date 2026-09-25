import { state, saveUserDoc, resetAllData } from "./store.js";
import { fbSignOut, auth } from "./firebase.js";
import {
  SLIDER_CATALOG,
  MIN_SLIDERS,
  MAX_SLIDERS,
  getSliderMeta,
  nextCustomSliderColor,
  slugifySliderId,
} from "./constants.js";
import { confirmModal, customSheet } from "./modal.js";
import { showMainScreen } from "./main-screen.js";
import { promptAddToHomeScreen } from "./notifications.js";
import { THEMES, applyTheme, currentThemeId, themedColor } from "./themes.js";

export function showSettingsScreen(container) {
  const userDoc = state.userDoc;
  const sliders = [...(userDoc.sliders || [])].sort((a, b) => a.order - b.order);

  const screen = document.createElement("div");
  screen.className = "screen settings-screen";
  screen.innerHTML = `
    <div class="stats-header">
      <button class="icon-btn" id="backBtn" aria-label="Back">←</button>
      <div class="stats-title">Settings</div>
    </div>

    <div class="settings-section">
      <div class="settings-row clickable" id="editNameRow">
        <span class="row-label">Name</span>
        <span class="chevron">${userDoc.name || ""} ›</span>
      </div>
      <div class="settings-row clickable" id="notifTimeRow">
        <span class="row-label">Daily reminder time</span>
        <span class="chevron">${userDoc.notificationTime || "21:00"} ›</span>
      </div>
      <div class="settings-row clickable" id="a2hsRow">
        <span class="row-label">Add to Home Screen</span>
        <span class="chevron">›</span>
      </div>
    </div>

    <div class="section-title">Appearance</div>
    <div class="theme-grid" id="themeGrid">
      ${Object.values(THEMES)
        .map(
          (t) => `
        <button class="theme-card ${t.id === currentThemeId() ? "selected" : ""}" data-theme-id="${t.id}">
          <div class="theme-swatches">${t.swatch.map((c) => `<span style="background:${c}"></span>`).join("")}</div>
          <div class="theme-name">${t.name}</div>
        </button>`
        )
        .join("")}
    </div>
    <div class="theme-desc" id="themeDesc">${THEMES[currentThemeId()].description}</div>

    <div class="section-title">Your sliders (${sliders.length}/${MAX_SLIDERS})</div>
    <div id="sliderList"></div>
    <button class="btn btn-secondary btn-block" id="addSliderBtn" style="margin-top:8px;">+ Add a slider</button>

    <div class="section-title">Account</div>
    <div class="settings-section">
      <div class="settings-row clickable" id="signOutRow">
        <span class="row-label">Sign out</span>
        <span class="chevron">›</span>
      </div>
      <div class="settings-row clickable" id="resetRow">
        <span class="row-label danger-text">Reset all data</span>
        <span class="chevron danger-text">›</span>
      </div>
    </div>
  `;

  container.innerHTML = "";
  container.appendChild(screen);

  screen.querySelector("#backBtn").addEventListener("click", () => showMainScreen(container));

  renderSliderList(screen, sliders, container);

  screen.querySelector("#themeGrid").addEventListener("click", async (e) => {
    const card = e.target.closest(".theme-card");
    if (!card) return;
    const id = card.dataset.themeId;
    applyTheme(id);
    screen.querySelectorAll(".theme-card").forEach((c) => c.classList.toggle("selected", c === card));
    screen.querySelector("#themeDesc").textContent = THEMES[id].description;
    renderSliderList(screen, sliders, container);
    try {
      await saveUserDoc(state.user.uid, { theme: id });
    } catch (err) {
      console.error("Couldn't save theme", err);
    }
  });

  screen.querySelector("#editNameRow").addEventListener("click", () => openEditName(screen));
  screen.querySelector("#notifTimeRow").addEventListener("click", () => openEditNotifTime(screen));
  screen.querySelector("#a2hsRow").addEventListener("click", () => promptAddToHomeScreen({ force: true }));
  screen.querySelector("#addSliderBtn").addEventListener("click", () => openAddSlider(screen, container));

  screen.querySelector("#signOutRow").addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Sign out?",
      body: "You can sign back in with Google any time — your data stays saved.",
      confirmLabel: "Sign out",
    });
    if (ok) await fbSignOut(auth);
  });

  screen.querySelector("#resetRow").addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Reset all data?",
      body: "This permanently deletes every check-in you've logged. Your sliders and account stay set up. This can't be undone.",
      confirmLabel: "Delete everything",
      danger: true,
    });
    if (ok) {
      await resetAllData(state.user.uid);
      showMainScreen(container);
    }
  });
}

function renderSliderList(screen, sliders, container) {
  const list = screen.querySelector("#sliderList");
  list.innerHTML = "";
  for (const s of sliders) {
    const row = document.createElement("div");
    row.className = "slider-manage-row";
    row.style.setProperty("--swatch-color", themedColor(s));
    row.innerHTML = `
      <span class="swatch"></span>
      <span class="name">${s.label}</span>
      <span style="font-size:12px;color:var(--text-faint);">${metricSummary(s)}</span>
      <button class="remove-btn" data-id="${s.id}" aria-label="Remove">✕</button>
    `;
    list.appendChild(row);
    row.querySelector(".name").addEventListener("click", () => openReconfigureSlider(screen, s));
    row.querySelector(".remove-btn").addEventListener("click", () => handleRemoveSlider(s, sliders, container));
  }
}

function metricSummary(s) {
  if (s.metricType === "hours") return `${s.unsatisfiedValue}–${s.satisfiedValue} hrs`;
  if (s.metricType === "days") return `${s.unsatisfiedValue}–${s.satisfiedValue} d/wk`;
  return "satisfaction %";
}

async function handleRemoveSlider(slider, sliders, container) {
  if (sliders.length <= MIN_SLIDERS) {
    await confirmModal({
      title: "Can't remove",
      body: `You need at least ${MIN_SLIDERS} sliders to keep the balance mechanic meaningful.`,
      confirmLabel: "OK",
    });
    return;
  }
  const ok = await confirmModal({
    title: `Remove ${slider.label}?`,
    body: "All historical data for this slider stays in your log, but it will no longer appear or count toward your balance.",
    confirmLabel: "Remove",
    danger: true,
  });
  if (!ok) return;

  const updated = sliders.filter((s) => s.id !== slider.id).map((s, i) => ({ ...s, order: i }));
  await saveUserDoc(state.user.uid, { sliders: updated });
  showSettingsScreen(container);
}

function openEditName(screen) {
  customSheet(
    `
      <div class="modal-title">Edit name</div>
      <input class="text-input" id="nameInput" value="${state.userDoc.name || ""}" />
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
        <button class="btn btn-primary" id="saveBtn">Save</button>
      </div>
    `,
    (sheet, close) => {
      sheet.querySelector("#cancelBtn").addEventListener("click", close);
      sheet.querySelector("#saveBtn").addEventListener("click", async () => {
        const name = sheet.querySelector("#nameInput").value.trim();
        if (name) await saveUserDoc(state.user.uid, { name });
        close();
        showSettingsScreen(document.getElementById("app"));
      });
    }
  );
}

function openEditNotifTime(screen) {
  customSheet(
    `
      <div class="modal-title">Daily reminder time</div>
      <input class="time-input" type="time" id="timeInput" value="${state.userDoc.notificationTime || "21:00"}" />
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
        <button class="btn btn-primary" id="saveBtn">Save</button>
      </div>
    `,
    (sheet, close) => {
      sheet.querySelector("#cancelBtn").addEventListener("click", close);
      sheet.querySelector("#saveBtn").addEventListener("click", async () => {
        const notificationTime = sheet.querySelector("#timeInput").value;
        if (notificationTime) await saveUserDoc(state.user.uid, { notificationTime });
        close();
        showSettingsScreen(document.getElementById("app"));
      });
    }
  );
}

function openReconfigureSlider(screen, slider) {
  const isScaled = slider.metricType === "hours" || slider.metricType === "days";
  const unit = slider.metricType === "hours" ? "hours" : "days/week";
  customSheet(
    `
      <div class="modal-title">Configure ${slider.label}</div>
      ${
        isScaled
          ? `
        <div class="config-row">
          <div class="config-field">
            <label>Fully satisfied (${unit})</label>
            <input class="text-input" type="number" id="satInput" value="${slider.satisfiedValue}" />
          </div>
          <div class="config-field">
            <label>Completely unsatisfied (${unit})</label>
            <input class="text-input" type="number" id="unsatInput" value="${slider.unsatisfiedValue}" />
          </div>
        </div>`
          : `<div class="modal-body">This slider just tracks satisfaction — no extra configuration needed.</div>`
      }
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
        <button class="btn btn-primary" id="saveBtn">Save</button>
      </div>
    `,
    (sheet, close) => {
      sheet.querySelector("#cancelBtn").addEventListener("click", close);
      sheet.querySelector("#saveBtn").addEventListener("click", async () => {
        if (isScaled) {
          const satisfiedValue = Number(sheet.querySelector("#satInput").value);
          const unsatisfiedValue = Number(sheet.querySelector("#unsatInput").value);
          const updated = state.userDoc.sliders.map((s) =>
            s.id === slider.id ? { ...s, satisfiedValue, unsatisfiedValue } : s
          );
          await saveUserDoc(state.user.uid, { sliders: updated });
        }
        close();
        showSettingsScreen(document.getElementById("app"));
      });
    }
  );
}

function openAddSlider(screen, container) {
  const sliders = state.userDoc.sliders || [];
  if (sliders.length >= MAX_SLIDERS) {
    confirmModal({ title: "Max reached", body: `You can track up to ${MAX_SLIDERS} sliders.`, confirmLabel: "OK" });
    return;
  }
  const existingIds = new Set(sliders.map((s) => s.id));
  const available = SLIDER_CATALOG.filter((c) => !existingIds.has(c.id));

  customSheet(
    `
      <div class="modal-title">Add a slider</div>
      ${
        available.length
          ? `<div class="card-grid">
              ${available
                .map(
                  (c) => `
                <div class="category-card" data-id="${c.id}" style="--card-color:${c.color}">
                  <div class="category-icon">${c.icon}</div>
                  <div class="category-label">${c.label}</div>
                </div>`
                )
                .join("")}
            </div>`
          : `<div class="modal-body">You've added every built-in category — create your own below.</div>`
      }
      <button class="btn btn-secondary btn-block" id="customSliderBtn" style="margin-top:14px;">+ Create your own</button>
    `,
    (sheet, close) => {
      sheet.querySelectorAll(".category-card").forEach((card) => {
        card.addEventListener("click", async () => {
          const meta = getSliderMeta(card.dataset.id);
          const newSlider = {
            id: meta.id,
            label: meta.label,
            color: meta.color,
            metricType: meta.metricType,
            satisfiedValue: meta.metricType === "hours" ? 8 : meta.metricType === "days" ? 7 : null,
            unsatisfiedValue: meta.metricType === "hours" ? 4 : meta.metricType === "days" ? 0 : null,
            currentValue: 50,
            order: sliders.length,
          };
          await saveUserDoc(state.user.uid, { sliders: [...sliders, newSlider] });
          close();
          showSettingsScreen(container);
        });
      });

      sheet.querySelector("#customSliderBtn").addEventListener("click", () => {
        close();
        openCreateCustomSlider(container, sliders);
      });
    }
  );
}

function openCreateCustomSlider(container, sliders) {
  customSheet(
    `
      <div class="modal-title">Create a slider</div>
      <input class="text-input" id="customLabelInput" placeholder="e.g. Friends, Finances, Creativity" maxlength="24" />
      <div class="modal-body" style="margin-top:10px;">Tracked as satisfaction, 0–100%, just like Love or Work.</div>
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
        <button class="btn btn-primary" id="saveBtn" disabled>Add</button>
      </div>
    `,
    (sheet, close) => {
      const input = sheet.querySelector("#customLabelInput");
      const saveBtn = sheet.querySelector("#saveBtn");
      input.addEventListener("input", () => {
        saveBtn.disabled = !input.value.trim();
      });
      sheet.querySelector("#cancelBtn").addEventListener("click", close);
      saveBtn.addEventListener("click", async () => {
        const label = input.value.trim();
        if (!label) return;
        const newSlider = {
          id: slugifySliderId(label, sliders),
          label,
          color: nextCustomSliderColor(sliders),
          metricType: "satisfaction",
          satisfiedValue: null,
          unsatisfiedValue: null,
          currentValue: 50,
          order: sliders.length,
        };
        await saveUserDoc(state.user.uid, { sliders: [...sliders, newSlider] });
        close();
        showSettingsScreen(container);
      });
    }
  );
}
