import {
  PHASE_1_MAX_SUBMISSIONS,
  PHASE_2_MAX_SUBMISSIONS,
  BLEND_WEIGHTS,
  DEFAULT_CADENCE_VALUE,
  OVERRIDE_BASE_WEIGHT,
  OVERRIDE_RAMP,
} from "./constants.js";

export function computePhase(dailySubmissionCount) {
  if (dailySubmissionCount < PHASE_1_MAX_SUBMISSIONS) return 1;
  if (dailySubmissionCount < PHASE_2_MAX_SUBMISSIONS) return 2;
  return 3;
}

export function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Moves one slider and rebalances the others so the total never changes.
 *
 * Values are whole percents, so the numbers on screen always add up exactly.
 * `values` is the snapshot from when the drag started; the result is computed
 * from that snapshot and the dragged slider's current target, so dragging
 * up-and-back lands exactly where it began. The other sliders absorb the
 * change 1% at a time in round-robin order (equal shares, off by at most 1%),
 * skipping any already at 0 or 100. If they can't absorb all of it, the
 * dragged slider stops short instead of letting the total drift.
 */
export function redistribute(values, changedId, requestedValue) {
  const result = { ...values };
  const ids = Object.keys(values);
  if (ids.length <= 1) return result;

  const start = values[changedId];
  const target = Math.round(clamp(requestedValue));
  const direction = Math.sign(target - start); // others move the opposite way
  if (direction === 0) return result;

  const others = ids.filter((id) => id !== changedId);
  let remaining = Math.abs(target - start);
  let moved = 0;

  while (remaining > 0) {
    let progressed = false;
    for (const id of others) {
      if (remaining === 0) break;
      const next = result[id] - direction;
      if (next < 0 || next > 100) continue;
      result[id] = next;
      remaining--;
      moved++;
      progressed = true;
    }
    if (!progressed) break;
  }

  result[changedId] = start + direction * moved;
  return result;
}

/** Splits `total` into `count` whole numbers that differ by at most 1 and add up exactly. */
export function evenSplit(total, count) {
  const whole = Math.round(total);
  const base = Math.floor(whole / count);
  const extra = whole - base * count;
  return Array.from({ length: count }, (_, i) => clamp(base + (i < extra ? 1 : 0)));
}

/** True when every value is a whole percent and they add up to exactly `total`. */
export function isBalanced(valuesList, total) {
  return (
    valuesList.every((v) => Number.isInteger(v)) &&
    valuesList.reduce((a, b) => a + b, 0) === Math.round(total)
  );
}

/** Maps an actual scaled value (e.g. sleep hours, fitness days/week) to 0-100%. */
export function scaledValueToPct(actualValue, satisfiedValue, unsatisfiedValue) {
  const span = satisfiedValue - unsatisfiedValue;
  if (span === 0) return 0;
  const pct = ((actualValue - unsatisfiedValue) / span) * 100;
  return clamp(pct);
}

/** Inverse of scaledValueToPct: maps a 0-100% value back to its real-world unit for display. */
export function pctToScaledValue(pct, satisfiedValue, unsatisfiedValue) {
  const span = satisfiedValue - unsatisfiedValue;
  return unsatisfiedValue + (pct / 100) * span;
}

// Backwards-compatible alias used by sleep-specific call sites.
export const hoursToPct = scaledValueToPct;

/** Weighted mean of submission values for one slider, given [{ value, weight }]. */
export function weightedAverage(entries) {
  if (!entries.length) return null;
  let sumValue = 0;
  let sumWeight = 0;
  for (const { value, weight } of entries) {
    sumValue += value * weight;
    sumWeight += weight;
  }
  if (sumWeight === 0) return null;
  return sumValue / sumWeight;
}

/** Builds { value, weight } entries for a slider from raw submissions. */
export function entriesForSlider(submissions, sliderId) {
  return submissions
    .filter((s) => s.values && Object.prototype.hasOwnProperty.call(s.values, sliderId))
    .map((s) => ({
      value: s.values[sliderId],
      weight: s.isOverride ? s.overrideWeight ?? OVERRIDE_BASE_WEIGHT : 1.0,
    }));
}

/**
 * Determines the override weight ramp for a slider based on how many of the
 * last 30 days' override submissions moved that slider consistently in one
 * direction relative to its constraint value.
 */
export function overrideWeightRamp(overrideSubmissionsLast30d) {
  const count = overrideSubmissionsLast30d.length;
  for (const step of OVERRIDE_RAMP) {
    if (count >= step.count) return step.weight;
  }
  return OVERRIDE_BASE_WEIGHT;
}

/** Blended constraint total across cadences, defaulting missing cadences to 70% per slider. */
export function blendedConstraintTotal(dailyAvgTotal, weeklyAvgTotal, monthlyAvgTotal, sliderCount) {
  const fallback = DEFAULT_CADENCE_VALUE * sliderCount;
  const d = dailyAvgTotal ?? fallback;
  const w = weeklyAvgTotal ?? fallback;
  const m = monthlyAvgTotal ?? fallback;
  return d * BLEND_WEIGHTS.daily + w * BLEND_WEIGHTS.weekly + m * BLEND_WEIGHTS.monthly;
}

/** Blended constraint value for a single slider across cadences. */
export function blendedConstraintPerSlider(dailyAvg, weeklyAvg, monthlyAvg) {
  const d = dailyAvg ?? DEFAULT_CADENCE_VALUE;
  const w = weeklyAvg ?? DEFAULT_CADENCE_VALUE;
  const m = monthlyAvg ?? DEFAULT_CADENCE_VALUE;
  return d * BLEND_WEIGHTS.daily + w * BLEND_WEIGHTS.weekly + m * BLEND_WEIGHTS.monthly;
}

export function sumValues(valuesMap) {
  return Object.values(valuesMap).reduce((a, b) => a + b, 0);
}

/**
 * Fills missing (null) per-slider averages with the mean of the sliders that DO
 * have data for this cadence. This treats a slider with no history yet (e.g. one
 * just added) as already being at the user's overall average, rather than as a
 * 0 that would drag the total down or an arbitrary flat default. Falls back to
 * DEFAULT_CADENCE_VALUE only when no slider has any data at all for the cadence.
 */
export function fillMissingWithPeerAverage(avgMap) {
  const known = Object.values(avgMap).filter((v) => v != null);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : DEFAULT_CADENCE_VALUE;
  const filled = {};
  for (const [id, v] of Object.entries(avgMap)) {
    filled[id] = v ?? fallback;
  }
  return filled;
}

export function trendArrow(current, previous) {
  if (previous == null || current == null) return "flat";
  const diff = current - previous;
  if (Math.abs(diff) < 1) return "flat";
  return diff > 0 ? "up" : "down";
}

export function statusColor(value, thresholds) {
  if (value == null) return "neutral";
  if (value >= thresholds.green) return "green";
  if (value >= thresholds.yellow) return "yellow";
  return "red";
}
