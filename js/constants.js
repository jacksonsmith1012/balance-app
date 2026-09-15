export const SLIDER_CATALOG = [
  { id: "sleep", label: "Sleep", color: "#7C8CF8", icon: "🌙", metricType: "hours" },
  { id: "love", label: "Love", color: "#F87171", icon: "❤️", metricType: "satisfaction" },
  { id: "hobbies", label: "Hobbies", color: "#FBBF24", icon: "🎨", metricType: "satisfaction" },
  { id: "school", label: "School", color: "#34D399", icon: "📚", metricType: "satisfaction" },
  { id: "work", label: "Work", color: "#60A5FA", icon: "💼", metricType: "satisfaction" },
  { id: "fitness", label: "Fitness", color: "#FB923C", icon: "💪", metricType: "satisfaction" },
  { id: "social", label: "Social Life", color: "#A78BFA", icon: "👥", metricType: "satisfaction" },
];

export const MIN_SLIDERS = 2;
export const MAX_SLIDERS = 7;

export const PHASE_1_MAX_SUBMISSIONS = 7; // days 0-6
export const PHASE_2_MAX_SUBMISSIONS = 14; // days 7-13

export const BLEND_WEIGHTS = { daily: 0.5, weekly: 0.3, monthly: 0.2 };
export const DEFAULT_CADENCE_VALUE = 70; // used before enough data exists for a cadence

export const STATUS_THRESHOLDS = { green: 75, yellow: 50 };

export const OVERRIDE_BASE_WEIGHT = 0.5;
export const OVERRIDE_RAMP = [
  { count: 10, weight: 1.0 },
  { count: 5, weight: 0.75 },
];

export function getSliderMeta(id) {
  return SLIDER_CATALOG.find((s) => s.id === id);
}
