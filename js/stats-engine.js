import { fetchSubmissions, saveStats, state } from "./store.js";
import {
  entriesForSlider,
  weightedAverage,
  blendedConstraintTotal,
  blendedConstraintPerSlider,
  fillMissingWithPeerAverage,
  sumValues,
} from "./math.js";

/** Recomputes daily/weekly/monthly averages and blended constraints, then persists to Firestore. */
export async function recomputeStats(uid) {
  const sliders = state.userDoc?.sliders || [];
  const sliderIds = sliders.map((s) => s.id);

  const [daily, weekly, monthly] = await Promise.all([
    fetchSubmissions(uid, "daily"),
    fetchSubmissions(uid, "weekly"),
    fetchSubmissions(uid, "monthly"),
  ]);

  const dailyAvg = {};
  const weeklyAvg = {};
  const monthlyAvg = {};

  for (const id of sliderIds) {
    dailyAvg[id] = weightedAverage(entriesForSlider(daily, id));
    weeklyAvg[id] = weightedAverage(entriesForSlider(weekly, id));
    monthlyAvg[id] = weightedAverage(entriesForSlider(monthly, id));
  }

  // A slider with no history yet for a cadence (e.g. one just added) is treated
  // as already being at the user's average for that cadence, not as a 0 — so
  // adding a new slider doesn't drag down totals it was never part of.
  const filledDaily = fillMissingWithPeerAverage(dailyAvg);
  const filledWeekly = fillMissingWithPeerAverage(weeklyAvg);
  const filledMonthly = fillMissingWithPeerAverage(monthlyAvg);

  const dailyAvgTotal = daily.length ? sumValues(filledDaily) : null;
  const weeklyAvgTotal = weekly.length ? sumValues(filledWeekly) : null;
  const monthlyAvgTotal = monthly.length ? sumValues(filledMonthly) : null;

  const blendedConstraintPerSliderMap = {};
  for (const id of sliderIds) {
    blendedConstraintPerSliderMap[id] = blendedConstraintPerSlider(
      filledDaily[id],
      filledWeekly[id],
      filledMonthly[id]
    );
  }

  const stats = {
    dailyAvg,
    weeklyAvg,
    monthlyAvg,
    blendedConstraintTotal: blendedConstraintTotal(
      dailyAvgTotal,
      weeklyAvgTotal,
      monthlyAvgTotal,
      sliderIds.length
    ),
    blendedConstraintPerSlider: blendedConstraintPerSliderMap,
  };

  await saveStats(uid, stats);
  return stats;
}
