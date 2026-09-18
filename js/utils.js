export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfWeek(date = new Date()) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return d;
}

export function startOfMonth(date = new Date()) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

export function isLastDayOfMonth(date = new Date()) {
  const d = new Date(date);
  const tomorrow = new Date(d);
  tomorrow.setDate(d.getDate() + 1);
  return tomorrow.getMonth() !== d.getMonth();
}

/** Accepts a Firestore Timestamp, Date, or null. */
export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  return new Date(value);
}

export function isSameDay(a, b = new Date()) {
  const da = toDate(a);
  if (!da) return false;
  return (
    da.getFullYear() === b.getFullYear() &&
    da.getMonth() === b.getMonth() &&
    da.getDate() === b.getDate()
  );
}

// The daily check-in "day" starts at 3 AM local time rather than midnight, so
// staying up past midnight doesn't roll the check-in over to a new day.
export const DAY_RESET_HOUR = 3;

function shiftForDayReset(date) {
  return new Date(date.getTime() - DAY_RESET_HOUR * 60 * 60 * 1000);
}

/** Wall-clock start (3 AM) of the current check-in day for a given moment. */
export function checkInDayStart(date = new Date()) {
  const shifted = shiftForDayReset(date);
  const dayStart = startOfDay(shifted);
  return new Date(dayStart.getTime() + DAY_RESET_HOUR * 60 * 60 * 1000);
}

/** Like isSameDay, but treats times before 3 AM as still belonging to the prior day. */
export function isSameCheckInDay(a, b = new Date()) {
  const da = toDate(a);
  if (!da) return false;
  return shiftForDayReset(da).toDateString() === shiftForDayReset(b).toDateString();
}

export function isSameWeek(a, b = new Date()) {
  const da = toDate(a);
  if (!da) return false;
  return startOfWeek(da).getTime() === startOfWeek(b).getTime();
}

export function isSameMonth(a, b = new Date()) {
  const da = toDate(a);
  if (!da) return false;
  return da.getFullYear() === b.getFullYear() && da.getMonth() === b.getMonth();
}

export function formatTime(date = new Date()) {
  return date.toTimeString().slice(0, 5);
}

export function greetingName(name) {
  return name && name.trim() ? name.trim().split(" ")[0] : "";
}

/** Fire-and-forget floating error banner, used as a last-resort net for failed background saves. */
export function showGlobalError(message) {
  const el = document.createElement("div");
  el.className = "toast show";
  el.style.cssText =
    "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#3a1f1f;border:1px solid var(--red);color:#fecaca;z-index:999;max-width:90%;text-align:center;";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
