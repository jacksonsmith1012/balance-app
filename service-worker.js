const CACHE_NAME = "balance-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/firebase.js",
  "./js/constants.js",
  "./js/math.js",
  "./js/utils.js",
  "./js/store.js",
  "./js/stats-engine.js",
  "./js/slider-component.js",
  "./js/main-screen.js",
  "./js/stats.js",
  "./js/settings.js",
  "./js/onboarding.js",
  "./js/notifications.js",
  "./js/modal.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// --- Firebase Cloud Messaging (background push) ---
// Classic-script SW so importScripts works; compat build is required here.
try {
  importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

  firebase.initializeApp({
    apiKey: "AIzaSyBrJR3qLmO_q9Ccu36ZGJUN-isIjenLz7A",
    authDomain: "balance-app-jacksonsmith.firebaseapp.com",
    projectId: "balance-app-jacksonsmith",
    storageBucket: "balance-app-jacksonsmith.firebasestorage.app",
    messagingSenderId: "711949661416",
    appId: "1:711949661416:web:e2b93a04a098dfc534c55d",
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || "Balance";
    const body = payload.notification?.body || "Time to check in.";
    self.registration.showNotification(title, {
      body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
    });
  });
} catch (err) {
  // Messaging is best-effort; app shell caching above still works without it.
  console.warn("FCM background handler unavailable:", err);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
