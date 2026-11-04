// How fast a held arrow key repeats a gems adjustment — the browser's own
// OS-driven key-repeat rate varies (and can be much faster than this once a
// text input has focus), so callers drive their own interval instead of
// relying on repeat keydowns.
export const GEMS_REPEAT_MS = 250; // 4 per second

// One +/- step for a student: 1% of their current total (rounded), but never
// less than 1, so it keeps pace as totals grow. `multiplier` is 10 for
// Shift or Ctrl.
export function gemsStep(total, multiplier = 1) {
  return Math.max(1, Math.round((total || 0) / 100)) * multiplier;
}

// What a keypress does to the points: +1/-1, +10/-10 with Shift or Ctrl (both
// together are still 10), or 0 for any other key. Goes by e.code (the physical
// key) as well as e.key, since Shift changes e.key itself (e.g. "-" becomes
// "_"). Alt is excluded, which also leaves out AltGr (reported as Ctrl+Alt).
export function gemsKeyDelta(e) {
  if (e.metaKey || e.altKey) return 0;
  const magnitude = e.shiftKey || e.ctrlKey ? 10 : 1;
  if (e.code === "Equal" || e.key === "+" || e.key === "=") return magnitude;
  if (e.code === "Minus" || e.key === "-" || e.key === "_") return -magnitude;
  return 0;
}
