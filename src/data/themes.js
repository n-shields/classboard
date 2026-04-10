export const THEMES = {
  midnight: {
    name: "Midnight",
    swatch: "#5b8dee",
    "--bg": "#0d0d1a",
    "--surface": "#141428",
    "--surface2": "#1e1e38",
    "--border": "#2a2a4a",
    "--accent": "#5b8dee",
    "--accent2": "#c084fc",
  },
  crimson: {
    name: "Crimson",
    swatch: "#f87171",
    "--bg": "#180a0a",
    "--surface": "#241010",
    "--surface2": "#321616",
    "--border": "#4a2020",
    "--accent": "#f87171",
    "--accent2": "#fb923c",
  },
  forest: {
    name: "Forest",
    swatch: "#4ade80",
    "--bg": "#091510",
    "--surface": "#0f2018",
    "--surface2": "#162e22",
    "--border": "#1e3d2c",
    "--accent": "#4ade80",
    "--accent2": "#86efac",
  },
  ocean: {
    name: "Ocean",
    swatch: "#38bdf8",
    "--bg": "#08121c",
    "--surface": "#0e1e2e",
    "--surface2": "#152840",
    "--border": "#1c3550",
    "--accent": "#38bdf8",
    "--accent2": "#67e8f9",
  },
  sunset: {
    name: "Sunset",
    swatch: "#fb923c",
    "--bg": "#180e08",
    "--surface": "#261610",
    "--surface2": "#341e16",
    "--border": "#48291e",
    "--accent": "#fb923c",
    "--accent2": "#fbbf24",
  },
  violet: {
    name: "Violet",
    swatch: "#c084fc",
    "--bg": "#100a1a",
    "--surface": "#181028",
    "--surface2": "#221838",
    "--border": "#302048",
    "--accent": "#c084fc",
    "--accent2": "#e879f9",
  },
};

export const THEME_KEYS = Object.keys(THEMES);

export function applyTheme(key) {
  const theme = THEMES[key] || THEMES.midnight;
  const root = document.documentElement;
  Object.entries(theme).forEach(([prop, val]) => {
    if (prop.startsWith("--")) root.style.setProperty(prop, val);
  });
  document.body.style.background = theme["--bg"];
}
