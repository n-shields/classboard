function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)]
    .map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

// Generate 12 wheel segment colors rooted at the theme's accent hue.
// Hues are evenly distributed around the full wheel starting from the accent,
// with alternating saturation/lightness to add visual depth.
function wheelColors(accentHex) {
  const [h] = hexToHsl(accentHex);
  return Array.from({ length: 12 }, (_, i) => {
    const hue = (h + i * 30) % 360;
    const sat = 62 + (i % 3) * 8;   // cycles 62 → 70 → 78
    const lit = 36 + (i % 2) * 8;   // alternates 36 ↔ 44
    return hslToHex(hue, sat, lit);
  });
}

export const THEMES = {
  // ── Dark themes ──────────────────────────────────────────────────────────
  midnight: {
    name: "Dark Blue",
    swatch: "#5b8dee",
    wheelColors: wheelColors("#5b8dee"),
    wheelText: "#ffffff",
    "--bg":       "#0d0d1a",
    "--surface":  "#141428",
    "--surface2": "#1e1e38",
    "--border":   "#2a2a4a",
    "--text":     "#e8e8f0",
    "--text-dim": "#8888aa",
    "--accent":   "#5b8dee",
    "--accent2":  "#c084fc",
  },
  crimson: {
    name: "Dark Red",
    swatch: "#f87171",
    wheelColors: wheelColors("#f87171"),
    wheelText: "#ffffff",
    "--bg":       "#180a0a",
    "--surface":  "#241010",
    "--surface2": "#321616",
    "--border":   "#4a2020",
    "--text":     "#f0e8e8",
    "--text-dim": "#aa8888",
    "--accent":   "#f87171",
    "--accent2":  "#fb923c",
  },
  forest: {
    name: "Dark Green",
    swatch: "#4ade80",
    wheelColors: wheelColors("#4ade80"),
    wheelText: "#ffffff",
    "--bg":       "#091510",
    "--surface":  "#0f2018",
    "--surface2": "#162e22",
    "--border":   "#1e3d2c",
    "--text":     "#e8f0ea",
    "--text-dim": "#88aa90",
    "--accent":   "#4ade80",
    "--accent2":  "#86efac",
  },
  ocean: {
    name: "Dark Teal",
    swatch: "#38bdf8",
    wheelColors: wheelColors("#38bdf8"),
    wheelText: "#ffffff",
    "--bg":       "#08121c",
    "--surface":  "#0e1e2e",
    "--surface2": "#152840",
    "--border":   "#1c3550",
    "--text":     "#e8f0f8",
    "--text-dim": "#8899aa",
    "--accent":   "#38bdf8",
    "--accent2":  "#67e8f9",
  },
  sunset: {
    name: "Dark Orange",
    swatch: "#fb923c",
    wheelColors: wheelColors("#fb923c"),
    wheelText: "#ffffff",
    "--bg":       "#180e08",
    "--surface":  "#261610",
    "--surface2": "#341e16",
    "--border":   "#48291e",
    "--text":     "#f0ece8",
    "--text-dim": "#aa9988",
    "--accent":   "#fb923c",
    "--accent2":  "#fbbf24",
  },
  violet: {
    name: "Dark Purple",
    swatch: "#c084fc",
    wheelColors: wheelColors("#c084fc"),
    wheelText: "#ffffff",
    "--bg":       "#100a1a",
    "--surface":  "#181028",
    "--surface2": "#221838",
    "--border":   "#302048",
    "--text":     "#ece8f0",
    "--text-dim": "#9988aa",
    "--accent":   "#c084fc",
    "--accent2":  "#e879f9",
  },

  // ── Light / pastel themes ─────────────────────────────────────────────────
  chalk: {
    name: "Light Blue",
    swatch: "#3451c4",
    wheelColors: wheelColors("#3451c4"),
    wheelText: "#ffffff",
    "--bg":       "#d8def0",
    "--surface":  "#e4eaf8",
    "--surface2": "#cdd4e8",
    "--border":   "#b0bcd8",
    "--text":     "#16183a",
    "--text-dim": "#5260a0",
    "--accent":   "#3451c4",
    "--accent2":  "#6d3fc4",
  },
  paper: {
    name: "Light Teal",
    swatch: "#0b7fa0",
    wheelColors: wheelColors("#0b7fa0"),
    wheelText: "#ffffff",
    "--bg":       "#cce4ea",
    "--surface":  "#d8eef4",
    "--surface2": "#c0d8e0",
    "--border":   "#a0c8d4",
    "--text":     "#0c2030",
    "--text-dim": "#3a7090",
    "--accent":   "#0b7fa0",
    "--accent2":  "#0d9488",
  },
  sunrise: {
    name: "Light Orange",
    swatch: "#b84010",
    wheelColors: wheelColors("#b84010"),
    wheelText: "#ffffff",
    "--bg":       "#edd8ca",
    "--surface":  "#f5e4d8",
    "--surface2": "#e0cabb",
    "--border":   "#c8a890",
    "--text":     "#2a1208",
    "--text-dim": "#8a5a40",
    "--accent":   "#b84010",
    "--accent2":  "#b06010",
  },
  sky: {
    name: "Sky Blue",
    swatch: "#1060a4",
    wheelColors: wheelColors("#1060a4"),
    wheelText: "#ffffff",
    "--bg":       "#c8dff2",
    "--surface":  "#d8ecfc",
    "--surface2": "#bcd0e8",
    "--border":   "#98c0e0",
    "--text":     "#0a1e32",
    "--text-dim": "#2c608a",
    "--accent":   "#1060a4",
    "--accent2":  "#0d80c4",
  },
  mint: {
    name: "Light Green",
    swatch: "#0a7040",
    wheelColors: wheelColors("#0a7040"),
    wheelText: "#ffffff",
    "--bg":       "#bce4d0",
    "--surface":  "#cceedd",
    "--surface2": "#aed8c4",
    "--border":   "#88c4a8",
    "--text":     "#081e12",
    "--text-dim": "#285a3a",
    "--accent":   "#0a7040",
    "--accent2":  "#0d9488",
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
