// The prize menu shown from the Students list — one menu for every period,
// since a percent-based cost already scales to each class's own total.
// "classboard_"-prefixed so it travels with Export/Import and auto-save.
export const PRIZES_KEY = "classboard_prizes";

// How a prize's cost is worked out: a percent of the class's total points,
// a fixed number of points, or whichever of those two is greater (so a
// percent-priced prize can't come out nearly free for a class that's only
// just started earning).
export const COST_MODES = {
  percent: "% of class total",
  fixed: "Fixed",
  greater: "Greater of the two",
};

export function makePrize(patch = {}) {
  return {
    id: `prize-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    mode: "fixed",
    percent: 10,
    fixed: 10,
    ...patch,
  };
}

export function loadPrizes() {
  try {
    const s = JSON.parse(localStorage.getItem(PRIZES_KEY) || "null");
    if (Array.isArray(s)) return s.filter(p => p && typeof p === "object" && p.id);
  } catch {
    // Unreadable — start with an empty menu.
  }
  return [];
}

export function savePrizes(prizes) {
  try { localStorage.setItem(PRIZES_KEY, JSON.stringify(prizes)); } catch { /* storage full/blocked */ }
}

/** A prize's cost in points, given the class's total — percent costs round
 *  up, so a prize is never cheaper than its percent says. */
export function prizeCost(prize, classTotal) {
  const fromPercent = Math.ceil(Math.max(0, classTotal) * (Number(prize.percent) || 0) / 100);
  const fixed = Math.max(0, Math.round(Number(prize.fixed) || 0));
  if (prize.mode === "percent") return fromPercent;
  if (prize.mode === "greater") return Math.max(fromPercent, fixed);
  return fixed;
}
