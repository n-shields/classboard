import { DEFAULT_LAYOUT } from "./layout";

// A few hand-picked starting points, offered alongside the user's own saved
// layouts in the Layout tool. Applying one replaces the whole tree — tiles
// it omits just aren't shown, exactly as if they'd been unchecked.
export const BUILTIN_PRESETS = {
  "Default": DEFAULT_LAYOUT,
  "Announcement Focus": {
    dir: "h", ratio: 0.75,
    a: "text",
    b: { dir: "v", ratio: 0.5, a: "clock", b: "reminders" },
  },
  "Wheel Focus": {
    dir: "h", ratio: 0.7,
    a: "wheel",
    b: { dir: "v", ratio: 0.5, a: "clock", b: "text" },
  },
};

const SAVED_LAYOUTS_KEY = "classboard_saved_layouts";

export function loadSavedLayouts() {
  try {
    const s = localStorage.getItem(SAVED_LAYOUTS_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return {};
}

export function saveSavedLayouts(map) {
  localStorage.setItem(SAVED_LAYOUTS_KEY, JSON.stringify(map));
}
