// Scheduled notification sender for Balance.
// Run hourly by .github/workflows/notifications.yml. Reads all users, and for any
// user whose preferred notificationTime falls in the current UTC hour, sends the
// daily reminder (and the weekly/monthly reminder too, on the appropriate day).
//
// Known limitation: notificationTime is compared in UTC, not the user's local
// timezone (the data model has no timezone field yet). Users get reminders at a
// fixed UTC hour matching the hour portion of their chosen time.
//
// Required env var: FIREBASE_SERVICE_ACCOUNT — the full JSON of a Firebase
// service account key (Project Settings > Service Accounts > Generate new private key).

const admin = require("firebase-admin");

function initAdmin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not set.");
  }
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function isLastDayOfMonthUTC(date) {
  const tomorrow = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return tomorrow.getUTCMonth() !== date.getUTCMonth();
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const messaging = admin.messaging();

  const now = new Date();
  const currentHour = now.getUTCHours();
  const isSunday = now.getUTCDay() === 0;
  const isMonthEnd = isLastDayOfMonthUTC(now);

  const usersSnap = await db.collection("users").get();
  console.log(`Checking ${usersSnap.size} users at UTC hour ${currentHour}...`);

  let sent = 0;

  for (const doc of usersSnap.docs) {
    const user = doc.data();
    if (!user.fcmToken || !user.notificationTime) continue;

    const [hourStr] = String(user.notificationTime).split(":");
    const targetHour = Number(hourStr);
    if (targetHour !== currentHour) continue;

    const name = user.name || "there";
    const messages = [{ title: "Balance", body: `Time to log your day, ${name} 🌙` }];
    if (isSunday) messages.push({ title: "Balance", body: "How was your week? Take a moment to reflect." });
    if (isMonthEnd) messages.push({ title: "Balance", body: "Month's end — how did it balance out?" });

    for (const { title, body } of messages) {
      try {
        await messaging.send({
          token: user.fcmToken,
          notification: { title, body },
          webpush: {
            notification: { icon: "/icons/icon-192.png" },
            fcmOptions: { link: "/" },
          },
        });
        sent++;
      } catch (err) {
        console.error(`Failed to notify ${doc.id}:`, err.message);
        if (
          err.code === "messaging/registration-token-not-registered" ||
          err.code === "messaging/invalid-registration-token"
        ) {
          await doc.ref.update({ fcmToken: admin.firestore.FieldValue.delete() });
        }
      }
    }
  }

  console.log(`Done. Sent ${sent} notification(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
