// A small set of "export the data at this time of day" reminders — stored
// globally (not per-period, unlike the rest of RemindersWidget's list),
// since the whole point is firing near the end of the school day, which can
// be well after whichever period was "current" when the teacher set it up.
// Surfaced only in Teacher View's reminders editor (see RemindersWidget),
// merged into its list there rather than kept in a separate UI.
const KEY = "classboard_auto_export_reminders";

export function loadAutoExportReminders() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "null");
    if (Array.isArray(stored)) return stored;
  } catch (_) {}
  return [];
}

export function saveAutoExportReminders(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}
