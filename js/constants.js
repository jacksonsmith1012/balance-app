export const SLIDER_CATALOG = [
  { id: "faith", label: "Faith", color: "#D4A373", icon: "📖", metricType: "satisfaction" },
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

// Colors offered to custom (user-created) sliders, distinct from the built-in catalog.
export const CUSTOM_SLIDER_COLORS = [
  "#38BDF8",
  "#F472B6",
  "#4ADE80",
  "#FCD34D",
  "#C084FC",
  "#FB7185",
  "#2DD4BF",
  "#F59E0B",
];

export function nextCustomSliderColor(existingSliders) {
  const usedColors = new Set(existingSliders.map((s) => s.color));
  return (
    CUSTOM_SLIDER_COLORS.find((c) => !usedColors.has(c)) ||
    CUSTOM_SLIDER_COLORS[existingSliders.length % CUSTOM_SLIDER_COLORS.length]
  );
}

export function slugifySliderId(label, existingSliders) {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "custom";
  const existingIds = new Set(existingSliders.map((s) => s.id));
  if (!existingIds.has(base)) return base;
  let i = 2;
  while (existingIds.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
