// How fast a held arrow key repeats a gems adjustment — the browser's own
// OS-driven key-repeat rate varies (and can be much faster than this once a
// text input has focus), so callers drive their own interval instead of
// relying on repeat keydowns.
export const GEMS_REPEAT_MS = 250; // 4 per second

// One +/- step for a student: 1% of their current total (rounded), but never
// less than 1, so it keeps pace as totals grow. `multiplier` is 10 for Shift.
export function gemsStep(total, multiplier = 1) {
  return Math.max(1, Math.round((total || 0) / 100)) * multiplier;
}
