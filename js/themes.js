const STORAGE_KEY = "balance-theme";

export const THEMES = {
  midnight: {
    id: "midnight",
    name: "Midnight",
    description: "Deep blue-gray with glowing sliders",
    metaColor: "#1E2A3A",
    swatch: ["#1E2A3A", "#7C8CF8", "#F87171", "#34D399"],
    sliderPalette: null, // keep each category's own color
  },
  zen: {
    id: "zen",
    name: "Zen",
    description: "Paper stripes, ink lines, wooden faders",
    metaColor: "#F4F0E6",
    swatch: ["#F4F0E6", "#1A1A1A", "#B98A55", "#B5523B"],
    sliderPalette: ["#4A5D8A", "#B5523B", "#6B7F4A", "#B8893B", "#7A5A7D", "#4B7A78", "#A1705A"],
  },
  rose: {
    id: "rose",
    name: "Rose Garden",
    description: "Soft pink, rose and lavender",
    metaColor: "#FBEAF1",
    swatch: ["#FBEAF1", "#E58FB1", "#B98BD9", "#C0578A"],
    sliderPalette: ["#E58FB1", "#B98BD9", "#F2A0B8", "#C77DBA", "#D9A0D0", "#9B7FD1", "#F0B3C9"],
  },
};

export const DEFAULT_THEME = "midnight";

export function isValidTheme(id) {
  return Object.prototype.hasOwnProperty.call(THEMES, id);
}

export function getStoredTheme() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return isValidTheme(id) ? id : null;
  } catch {
    return null;
  }
}

let activeTheme = DEFAULT_THEME;

export function currentThemeId() {
  return activeTheme;
}

export function applyTheme(id) {
  const theme = THEMES[isValidTheme(id) ? id : DEFAULT_THEME];
  activeTheme = theme.id;
  document.documentElement.setAttribute("data-theme", theme.id);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme.metaColor);
  try {
    localStorage.setItem(STORAGE_KEY, theme.id);
  } catch {
    // storage unavailable (private mode) — the account copy still applies on next sign-in
  }
}

/** Color to draw a slider with under the active theme (palette themes recolor by slider order). */
export function themedColor(slider, index = slider.order ?? 0) {
  const palette = THEMES[activeTheme].sliderPalette;
  if (!palette) return slider.color;
  return palette[index % palette.length];
}

// Apply the last-used theme immediately so there is no flash before the account loads.
applyTheme(getStoredTheme() || DEFAULT_THEME);
