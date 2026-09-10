export const TEACHER_VIEW_BOUNDS_KEY = "classboard_teacher_view_bounds";
export const SEATING_VIEW_BOUNDS_KEY = "classboard_seating_view_bounds";

function loadBounds(key) {
  try {
    const s = JSON.parse(localStorage.getItem(key) || "null");
    if (s && Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch (_) {}
  return null;
}

function saveBounds(key, bounds) {
  try { localStorage.setItem(key, JSON.stringify(bounds)); } catch (_) {}
}

export function loadTeacherViewBounds() { return loadBounds(TEACHER_VIEW_BOUNDS_KEY); }
export function saveTeacherViewBounds(bounds) { saveBounds(TEACHER_VIEW_BOUNDS_KEY, bounds); }

export function loadSeatingViewBounds() { return loadBounds(SEATING_VIEW_BOUNDS_KEY); }
export function saveSeatingViewBounds(bounds) { saveBounds(SEATING_VIEW_BOUNDS_KEY, bounds); }
