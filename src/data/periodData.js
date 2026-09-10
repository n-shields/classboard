import { isPageArray, isPanesMap } from "./pages";

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
      if (p.colors && (typeof p.colors !== "object" || Array.isArray(p.colors))) delete p.colors;
      if (p.gems && (typeof p.gems !== "object" || Array.isArray(p.gems))) delete p.gems;
      if (p.textFontSizes && !Array.isArray(p.textFontSizes)) delete p.textFontSizes;
      if (p.noteFontSizes && !Array.isArray(p.noteFontSizes)) delete p.noteFontSizes;
      if (p.reminders && !Array.isArray(p.reminders))         delete p.reminders;
      if (p.teacherReminders && !Array.isArray(p.teacherReminders)) delete p.teacherReminders;
      if (p.textPages && !isPageArray(p.textPages))    delete p.textPages;
      if (p.notePages && !isPageArray(p.notePages))    delete p.notePages;
      if (p.textPanes && !isPanesMap(p.textPanes))     delete p.textPanes;
      if (p.notePanes && !isPanesMap(p.notePanes))     delete p.notePanes;
      if (p.pages && !isPageArray(p.pages))            delete p.pages;
      if (p.panes && !isPanesMap(p.panes))             delete p.panes;
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

// Other periods with a saved roster, for the Students modal's "import list" picker.
export function otherPeriodsWithRosters(periodData, excludeKey) {
  return Object.keys(periodData)
    .filter(k => k !== excludeKey && Array.isArray(periodData[k]?.names) && periodData[k].names.length > 0)
    .map(k => ({
      label: k,
      names: periodData[k].names,
      birthdays: periodData[k].birthdays || {},
      colors: periodData[k].colors || {},
      gems: periodData[k].gems || {},
    }));
}

const CLASS_LIST_KEYS = ["names", "excludedNames", "birthdays", "colors", "gems"];

// Delete a (possibly stale/renamed) period's saved class list — its roster,
// exclusions, birthdays, colors, and gems — leaving its other data (notes,
// etc.) alone. If nothing else is left for that period, drop the entry
// entirely. Returns the full, updated period-data object.
export function deleteClassList(periodData, label) {
  if (!label || !periodData[label]) return periodData;
  const period = periodData[label];
  const rest = Object.fromEntries(Object.entries(period).filter(([k]) => !CLASS_LIST_KEYS.includes(k)));
  const next = { ...periodData };
  if (Object.keys(rest).length === 0) delete next[label];
  else next[label] = rest;
  localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
  return next;
}

// The Gems currency's display name — global (not per-period), shared and
// renamable from either the main board or Teacher View's Students modal.
const GEMS_LABEL_KEY = "classboard_gems_label";

export function loadGemsLabel() {
  return localStorage.getItem(GEMS_LABEL_KEY) || "Gems";
}

export function saveGemsLabel(label) {
  localStorage.setItem(GEMS_LABEL_KEY, label);
}
