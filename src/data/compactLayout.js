import { migrateLayout, TILE_IDS } from "./layout";

// Compact mode (Tab): a small-window format — narrowed to the clock pane's
// width by default — so another window can sit beside the board. Each period
// keeps its own compact layout tree and window size, separate from its full
// layout, under { [periodKey]: { tree, width, height } }.
const STORAGE_KEY = "classboard_compact_layouts";

// Per-window (sessionStorage): whether this window is compact, and the
// bounds to restore when it leaves — so a reload mid-compact stays compact.
const SESSION_KEY = "classboard_compact_session";

export const DEFAULT_COMPACT_LAYOUT = "clock";

export function loadCompactLayouts() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (s && typeof s === "object" && !Array.isArray(s)) return s;
  } catch (_) {}
  return {};
}

export function saveCompactLayouts(map) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch (_) {}
}

/** A saved compact tree with unknown leaves dropped — unlike the full layout,
 *  missing tiles are expected here (compact shows only a few), so nothing is
 *  grafted back in. Null if there's nothing usable. */
export function sanitizeCompactTree(tree) {
  try { return migrateLayout(tree, TILE_IDS); } catch (_) { return null; }
}

export function loadCompactSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (s && typeof s === "object") return s;
  } catch (_) {}
  return null;
}

export function saveCompactSession(session) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch (_) {}
}
