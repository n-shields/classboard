export const TEACHER_VIEW_BOUNDS_KEY = "classboard_teacher_view_bounds";

export function loadTeacherViewBounds() {
  try {
    const s = JSON.parse(localStorage.getItem(TEACHER_VIEW_BOUNDS_KEY) || "null");
    if (s && Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch (_) {}
  return null;
}

export function saveTeacherViewBounds(bounds) {
  try { localStorage.setItem(TEACHER_VIEW_BOUNDS_KEY, JSON.stringify(bounds)); } catch (_) {}
}
