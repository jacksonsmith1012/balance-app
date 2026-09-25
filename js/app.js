import { auth, onAuthStateChanged, getRedirectResult } from "./firebase.js";
import { state, loadUserDoc, createUserDoc } from "./store.js";
import { renderOnboarding } from "./onboarding.js";
import { showMainScreen } from "./main-screen.js";
import { showGlobalError } from "./utils.js";
import { applyTheme, isValidTheme } from "./themes.js";

window.addEventListener("unhandledrejection", (event) => {
  const code = event.reason?.code || "";
  if (String(code).includes("permission-denied")) {
    showGlobalError("Couldn't save — permission denied. Check your connection and try again.");
  } else if (code) {
    showGlobalError("Something went wrong saving your data.");
  }
});

const container = document.getElementById("app");

function renderLoading() {
  container.innerHTML = `<div class="loading-screen">Loading…</div>`;
}

async function route() {
  const user = state.user;

  if (!user) {
    state.userDoc = null;
    state.onboardingDraft = {};
    state.onboardingStep = 1;
    renderOnboarding(container, { onComplete: () => showMainScreen(container) });
    return;
  }

  let userDoc = await loadUserDoc(user.uid);
  if (!userDoc) {
    userDoc = await createUserDoc(user.uid, {
      name: user.displayName || "",
      email: user.email || "",
    });
  }

  if (isValidTheme(userDoc.theme)) applyTheme(userDoc.theme);

  if (!userDoc.setupComplete) {
    state.onboardingDraft.name = state.onboardingDraft.name || userDoc?.name || user.displayName || "";
    state.onboardingStep = state.onboardingStep && state.onboardingStep > 2 ? state.onboardingStep : 3;
    renderOnboarding(container, { onComplete: () => showMainScreen(container) });
    return;
  }

  showMainScreen(container);
}

getRedirectResult(auth).catch((err) => {
  console.error("Google sign-in redirect failed:", err);
});

onAuthStateChanged(auth, async (user) => {
  state.user = user;
  renderLoading();
  try {
    await route();
  } catch (err) {
    console.error("Routing error:", err);
    container.innerHTML = `<div class="loading-screen">Something went wrong. Please refresh.</div>`;
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
