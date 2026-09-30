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
 * Redistributes the delta from one slider across all others, water-filling
 * around the 0-100 bounds so the total never silently drifts.
 *
 * At full strength (phase 3) the total of all sliders is conserved exactly:
 * if the others don't have enough headroom to absorb the full requested
 * delta, the dragged slider's own movement is capped to whatever the others
 * can actually give up. Without this, naively clamping each "other" slider
 * independently leaks total every time one hits 0 or 100, which is how
 * repeated dragging could ratchet every slider up to 100 or down to 0.
 *
 * At partial strength (phase 2's soft constraint) the dragged slider still
 * moves the full requested amount as long as the others have enough headroom
 * to shed their (smaller) share — the total is intentionally allowed to
 * drift by (1 - strength) * delta, same as before, but is still capped by
 * the others' real headroom rather than leaking through a clamp.
 *
 * strength: 1.0 (phase 3, full), 0.5 (phase 2), 0 (phase 1, no redistribution)
 * Returns a new values map { [sliderId]: number }.
 */
export function redistribute(values, changedId, newValue, strength) {
  const ids = Object.keys(values);
  const oldValue = values[changedId];

  if (strength <= 0 || ids.length <= 1) {
    return { ...values, [changedId]: clamp(newValue) };
  }

  const others = ids.filter((id) => id !== changedId);
  const desiredDelta = clamp(newValue) - oldValue;
  const result = { ...values };

  // Total change the other sliders need to absorb, in aggregate.
  let remaining = -desiredDelta * strength;
  let pool = others;

  while (Math.abs(remaining) > 1e-9 && pool.length > 0) {
    const share = remaining / pool.length;
    const survivors = [];
    let absorbed = 0;
    for (const id of pool) {
      const proposed = result[id] + share;
      const bounded = clamp(proposed);
      absorbed += bounded - result[id];
      result[id] = bounded;
      if (bounded === proposed) survivors.push(id);
    }
    remaining -= absorbed;
    if (survivors.length === pool.length) break; // everyone absorbed their share; done
    pool = survivors;
  }

  // Whatever the others couldn't absorb caps the dragged slider's own
  // movement instead, so the total is never lost or gained at the boundary.
  const actuallyAbsorbed = -desiredDelta * strength - remaining;
  const changedDelta = -actuallyAbsorbed / strength;
  result[changedId] = clamp(oldValue + changedDelta);

  return result;
}

export function redistributionStrengthForPhase(phase) {
  if (phase === 3) return 1.0;
  if (phase === 2) return 0.5;
  return 0;
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
