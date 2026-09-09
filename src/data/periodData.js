export const PERIOD_DATA_KEY = "classboard_period_data";

// Sanitize each period entry so malformed data doesn't crash components
export function loadPeriodData() {
  try {
    const s = localStorage.getItem(PERIOD_DATA_KEY);
    if (!s) return {};
    const data = JSON.parse(s);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
    for (const key of Object.keys(data)) {
      const p = data[key];
      if (typeof p !== "object" || p === null) { data[key] = {}; continue; }
      if (p.texts  && !Array.isArray(p.texts))          delete p.texts;
      if (p.notes  && !Array.isArray(p.notes))          delete p.notes;
      if (p.names  && !Array.isArray(p.names))          delete p.names;
      if (p.excludedNames && !Array.isArray(p.excludedNames)) delete p.excludedNames;
      if (p.birthdays && (typeof p.birthdays !== "object" || Array.isArray(p.birthdays))) delete p.birthdays;
      if (p.textFontSizes && !Array.isArray(p.textFontSizes)) delete p.textFontSizes;
      if (p.noteFontSizes && !Array.isArray(p.noteFontSizes)) delete p.noteFontSizes;
      if (p.reminders && !Array.isArray(p.reminders))         delete p.reminders;
    }
    return data;
  } catch (_) { return {}; }
}

// Merge `patch` into one period's entry and persist. Returns the full,
// updated period-data object so callers can push it straight into state.
export function savePeriodPatch(periodKey, patch) {
  if (!periodKey) return null;
  const data = loadPeriodData();
  const next = { ...data, [periodKey]: { ...data[periodKey], ...patch } };
  localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
  return next;
}
