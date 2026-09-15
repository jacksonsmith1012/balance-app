import { fetchSubmissions, saveStats, state } from "./store.js";
import {
  entriesForSlider,
  weightedAverage,
  blendedConstraintTotal,
  blendedConstraintPerSlider,
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

  const dailyAvgTotal = daily.length ? sumValues(dailyAvg) : null;
  const weeklyAvgTotal = weekly.length ? sumValues(weeklyAvg) : null;
  const monthlyAvgTotal = monthly.length ? sumValues(monthlyAvg) : null;

  const blendedConstraintPerSliderMap = {};
  for (const id of sliderIds) {
    blendedConstraintPerSliderMap[id] = blendedConstraintPerSlider(
      dailyAvg[id],
      weeklyAvg[id],
      monthlyAvg[id]
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
