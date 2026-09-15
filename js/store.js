import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from "./firebase.js";
import { computePhase } from "./math.js";

export const state = {
  user: null, // firebase auth user
  userDoc: null, // Firestore users/{uid} data
  currentScreen: "loading", // loading | onboarding | main | stats | settings
  onboardingStep: 1,
  onboardingDraft: {}, // scratch data collected across onboarding steps before final save
};

export function userRef(uid) {
  return doc(db, "users", uid);
}

export async function loadUserDoc(uid) {
  const snap = await getDoc(userRef(uid));
  state.userDoc = snap.exists() ? snap.data() : null;
  return state.userDoc;
}

export async function createUserDoc(uid, data) {
  const payload = {
    name: data.name ?? "",
    email: data.email ?? "",
    createdAt: serverTimestamp(),
    setupComplete: false,
    dailySubmissionCount: 0,
    phase: 1,
    lastDailySubmission: null,
    lastWeeklySubmission: null,
    lastMonthlySubmission: null,
    notificationTime: "21:00",
    fcmToken: null,
    addToHomeScreenDismissed: false,
    sliders: [],
  };
  await setDoc(userRef(uid), payload, { merge: true });
  state.userDoc = { ...payload, ...(state.userDoc || {}) };
  return state.userDoc;
}

export async function saveUserDoc(uid, partial) {
  await updateDoc(userRef(uid), partial);
  state.userDoc = { ...state.userDoc, ...partial };
  return state.userDoc;
}

export async function addSubmission(uid, submission) {
  const ref = collection(db, "users", uid, "submissions");
  const payload = {
    type: submission.type,
    submittedAt: serverTimestamp(),
    periodStart: submission.periodStart,
    values: submission.values,
    isOverride: !!submission.isOverride,
    overrideWeight: submission.overrideWeight ?? 1.0,
  };
  await addDoc(ref, payload);

  const updates = {};
  if (submission.type === "daily") {
    const newCount = (state.userDoc.dailySubmissionCount || 0) + 1;
    updates.dailySubmissionCount = newCount;
    updates.phase = computePhase(newCount);
    updates.lastDailySubmission = serverTimestamp();
  } else if (submission.type === "weekly") {
    updates.lastWeeklySubmission = serverTimestamp();
  } else if (submission.type === "monthly") {
    updates.lastMonthlySubmission = serverTimestamp();
  }

  const sliders = (state.userDoc.sliders || []).map((s) =>
    Object.prototype.hasOwnProperty.call(submission.values, s.id)
      ? { ...s, currentValue: submission.values[s.id] }
      : s
  );
  updates.sliders = sliders;

  await saveUserDoc(uid, updates);
}

export async function fetchSubmissions(uid, type, max = 200) {
  const ref = collection(db, "users", uid, "submissions");
  const q = query(ref, orderBy("submittedAt", "desc"), limit(max));
  const snap = await getDocs(q);
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return type ? all.filter((s) => s.type === type) : all;
}

export async function saveStats(uid, stats) {
  await setDoc(doc(db, "users", uid, "stats", "current"), {
    ...stats,
    lastUpdated: serverTimestamp(),
  });
}

export async function loadStats(uid) {
  const snap = await getDoc(doc(db, "users", uid, "stats", "current"));
  return snap.exists() ? snap.data() : null;
}

/** Deletes all submission documents for a user (used by Settings > Reset all data). */
export async function deleteAllSubmissions(uid) {
  const ref = collection(db, "users", uid, "submissions");
  const snap = await getDocs(query(ref, limit(500)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  // Firestore client SDK has no bulk delete; repeat in batches for accounts with heavy history.
  if (snap.size === 500) await deleteAllSubmissions(uid);
}

export async function resetAllData(uid) {
  await deleteAllSubmissions(uid);
  const resetSliders = (state.userDoc.sliders || []).map((s) => ({ ...s, currentValue: 50 }));
  await saveUserDoc(uid, {
    dailySubmissionCount: 0,
    phase: 1,
    lastDailySubmission: null,
    lastWeeklySubmission: null,
    lastMonthlySubmission: null,
    sliders: resetSliders,
  });
  await setDoc(doc(db, "users", uid, "stats", "current"), {
    dailyAvg: {},
    weeklyAvg: {},
    monthlyAvg: {},
    blendedConstraintTotal: null,
    blendedConstraintPerSlider: {},
    lastUpdated: serverTimestamp(),
  });
}
