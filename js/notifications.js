import { auth, getMessaging, getToken, onMessage, messagingIsSupported } from "./firebase.js";
import { saveUserDoc, state } from "./store.js";
import { customSheet } from "./modal.js";

// Set this to your Firebase Cloud Messaging "Web Push certificate" key
// (Firebase Console > Project Settings > Cloud Messaging > Web configuration).
export const VAPID_KEY = "";

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function detectPlatform() {
  const ua = window.navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/** Requests notification permission and registers an FCM token for the user, best-effort. */
export async function setupPushNotifications() {
  try {
    if (!("Notification" in window)) return false;
    const supported = await messagingIsSupported().catch(() => false);
    if (!supported) return false;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    if (!VAPID_KEY) {
      console.warn("VAPID_KEY not set in js/notifications.js — skipping FCM token registration.");
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token && state.user) {
      await saveUserDoc(state.user.uid, { fcmToken: token });
    }

    onMessage(messaging, (payload) => {
      console.log("Foreground FCM message:", payload);
    });

    return true;
  } catch (err) {
    console.warn("Push notification setup failed (non-fatal):", err);
    return false;
  }
}

/**
 * Shows platform-appropriate "Add to Home Screen" guidance.
 * On Android with a captured beforeinstallprompt event, triggers the native prompt directly.
 * options.force: show even if already dismissed/standalone (used by Settings re-trigger).
 */
export async function promptAddToHomeScreen(options = {}) {
  if (isStandalone() && !options.force) return "already-installed";

  const platform = detectPlatform();

  if (platform === "android" && deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return choice.outcome;
  }

  return new Promise((resolve) => {
    const instructions =
      platform === "ios"
        ? `Tap the <b>Share</b> button in Safari's toolbar, then choose <b>Add to Home Screen</b>.`
        : platform === "android"
        ? `Tap the <b>⋮ menu</b> in your browser, then choose <b>Add to Home Screen</b> or <b>Install app</b>.`
        : `Open this page on your phone to install it, or use your browser's install option in the address bar.`;

    customSheet(
      `
        <div class="modal-title">Add Balance to your Home Screen</div>
        <div class="platform-instructions">${instructions}</div>
        <div class="modal-body" style="margin-top:12px;">
          Required for notifications on iPhone. Gives you the full app experience.
        </div>
        <div class="modal-actions" style="margin-top:16px;">
          <button class="btn btn-primary btn-block" id="doneBtn">Got it</button>
        </div>
      `,
      (sheet, close) => {
        sheet.querySelector("#doneBtn").addEventListener("click", () => {
          close();
          resolve("dismissed");
        });
      }
    );
  });
}
