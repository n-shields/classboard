import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import TextBoard from "./components/TextBoard";
import ClockWidget from "./components/ClockWidget";
import PeriodBar from "./components/PeriodBar";
import CameraFeed from "./components/CameraFeed";
import WheelOfNames from "./components/WheelOfNames";
import ProgressWidget from "./components/ProgressWidget";
import NoteWidget from "./components/NoteWidget";
import TileLayout from "./components/TileLayout";
import DateWidget from "./components/DateWidget";
import SeatingChart from "./components/SeatingChart";
import RemindersWidget from "./components/RemindersWidget";
import { loadSchedules, saveSchedules, loadScheduleDays, saveScheduleDays, loadPeriodNames, savePeriodNames, getScheduleForToday, detectCurrentPeriod, detectNextPeriod } from "./data/schedules";
import { THEMES, applyTheme } from "./data/themes";
import { loadLayout, saveLayout, validateLayout, migrateLayout, DEFAULT_LAYOUT, insertLeaf, removeLeaf, collectLeaves, isDynamicPaneId, makePaneId } from "./data/layout";
import { loadNoteSyncGroups, saveNoteSyncGroups, getSyncMates, setSyncGroup } from "./data/noteSync";
import { PERIOD_DATA_KEY, loadPeriodData } from "./data/periodData";
import { migratePeriodPages, pagesForPane } from "./data/pages";
import "./App.css";

const PERIOD_LAYOUT_KEY       = "classboard_period_layout";
const PERIOD_LAYOUT_TREES_KEY = "classboard_period_layout_trees";

function loadPeriodLayoutTrees() {
  try { const s = localStorage.getItem(PERIOD_LAYOUT_TREES_KEY); if (s) return JSON.parse(s); } catch (_) {}
  return {};
}

const DEFAULT_COLLAPSED = { date: false, clock: false, notes: false, wheel: false, prize: false, reminders: false };
const TILE_NAMES = { date: "Clock", clock: "Timer", notes: "Notes", text: "Board", camera: "Camera", wheel: "Names", prize: "Goals", reminders: "Reminders" };
const SWAP_MAP = { camera: "notes", notes: "camera" };
const DEFAULT_NAMES = ["Diego", "Sara", "Andre", "Lin"];

// Fallback pages/panes shown when no period is selected yet (edge case only)
const FALLBACK_TEXT_PAGES = [{ id: "fallback-text", html: "", fontSize: 48 }];
const FALLBACK_TEXT_PANES = { text: ["fallback-text"] };
const FALLBACK_NOTE_PAGES = [{ id: "fallback-notes", html: "", fontSize: 20 }];
const FALLBACK_NOTE_PANES = { notes: ["fallback-notes"] };

// One-time: Board/Notes used to be a fixed 3-page array (texts/textFontSizes,
// notes/noteFontSizes). Convert every period that still has the old shape
// into the new { pages, panes } shape, then persist and drop the old fields.
function migrateTextNotesPages(periodData) {
  let changed = false;
  const next = { ...periodData };
  for (const key of Object.keys(next)) {
    const period = next[key];
    const textMig = migratePeriodPages(period, {
      textKey: "texts", fontKey: "textFontSizes", pagesKey: "textPages", panesKey: "textPanes",
      mainPaneId: "text", defaultFont: 48,
    });
    const noteMig = migratePeriodPages(period, {
      textKey: "notes", fontKey: "noteFontSizes", pagesKey: "notePages", panesKey: "notePanes",
      mainPaneId: "notes", defaultFont: 20,
    });
    if (textMig || noteMig) {
      changed = true;
      const { texts: _texts, textFontSizes: _textFontSizes, notes: _notes, noteFontSizes: _noteFontSizes, ...rest } = period;
      next[key] = { ...rest, ...textMig, ...noteMig };
    }
  }
  if (changed) localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
  return next;
}

// One-time: reminders used to be a single global list. Seed each period that
// doesn't already have its own with the old global list so existing setups
// carry over, then drop the global key — reminders are now per-period.
function migrateGlobalReminders(periodData) {
  const raw = localStorage.getItem("classboard_reminders");
  if (raw == null) return periodData;
  let list = null;
  try { list = JSON.parse(raw); } catch (_) {}
  if (!Array.isArray(list) || list.length === 0) {
    localStorage.removeItem("classboard_reminders");
    return periodData;
  }
  const labels = new Set();
  for (const periods of Object.values(loadSchedules())) {
    for (const p of periods) labels.add(p.label);
  }
  if (labels.size === 0) return periodData; // no schedule yet — retry next load
  const next = { ...periodData };
  for (const label of labels) {
    if (!Array.isArray(next[label]?.reminders)) next[label] = { ...next[label], reminders: list };
  }
  localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
  localStorage.removeItem("classboard_reminders");
  return next;
}

// One-time: the default reminder text "Attendance" was renamed to "Warm Up"
// on the main board (attendance moved to the teacher-only view instead).
// Rename any already-saved reminder that still has the old text.
function migrateWarmUpRename(periodData) {
  let changed = false;
  const next = { ...periodData };
  for (const key of Object.keys(next)) {
    const period = next[key];
    if (!Array.isArray(period.reminders)) continue;
    const renamed = period.reminders.map(r => (r && r.text === "Attendance") ? { ...r, text: "Warm Up" } : r);
    if (renamed.some((r, i) => r !== period.reminders[i])) {
      changed = true;
      next[key] = { ...period, reminders: renamed };
    }
  }
  if (changed) localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
  return next;
}
function loadScheduleType() {
  return localStorage.getItem("classboard_schedule_type") || "Regular";
}
function loadGlobalTheme() {
  return localStorage.getItem("classboard_global_theme") || "midnight";
}
function loadLayouts() {
  try { const s = localStorage.getItem(PERIOD_LAYOUT_KEY); if (s) return JSON.parse(s); } catch (_) {}
  return {};
}

export default function App() {
  const [schedules, setSchedules]           = useState(loadSchedules);
  const [scheduleDays, setScheduleDays]     = useState(loadScheduleDays);
  const [periodNames, setPeriodNames]       = useState(() => loadPeriodNames(loadSchedules()));
  const [scheduleType, setScheduleType]     = useState(() => {
    const loaded = loadSchedules();
    const days   = loadScheduleDays();
    const candidate = getScheduleForToday(days) || loadScheduleType();
    // Fall back to first available schedule if stored value is stale/unrecognized
    return (candidate && candidate in loaded) ? candidate : (Object.keys(loaded)[0] ?? "Regular");
  });
  const [periodData, setPeriodData]         = useState(() => migrateWarmUpRename(migrateTextNotesPages(migrateGlobalReminders(loadPeriodData()))));
  const [noteSyncGroups, setNoteSyncGroups] = useState(loadNoteSyncGroups);
  const [currentPeriodIndex, setCurrentPeriodIndex] = useState(-1);
  const [nextPeriodIndex, setNextPeriodIndex]       = useState(-1);
  const [autoMode, setAutoMode]             = useState(true);

  // Clock always tracks real time regardless of manual period selection
  const [clockPeriodIndex, setClockPeriodIndex]         = useState(-1);
  const [clockNextPeriodIndex, setClockNextPeriodIndex] = useState(-1);

  // Clock display string (mirrors whatever ClockWidget is showing)
  const [clockDisplay, setClockDisplay] = useState("");
  const [clockFontSize, setClockFontSize] = useState("md");

  // Widget collapse state
  const [collapsed, setCollapsed] = useState({ ...DEFAULT_COLLAPSED });
  const toggleCollapsed = useCallback((key) => setCollapsed(c => ({ ...c, [key]: !c[key] })), []);

  // Theme
  const [globalTheme, setGlobalTheme] = useState(loadGlobalTheme);

  // Seating chart — stores which tile ID it's open in (null = closed)
  const [seatingTile, setSeatingTile] = useState(null);

  const openSeatingChart = useCallback(() => {
    const slots = document.querySelectorAll("[data-tile]");
    let bestId = null, bestArea = -1;
    slots.forEach(el => {
      const { width, height } = el.getBoundingClientRect();
      const area = width * height;
      if (area > bestArea) { bestArea = area; bestId = el.dataset.tile; }
    });
    if (bestId) setSeatingTile(bestId);
  }, []);

  // Layout tree
  const [layout, setLayout] = useState(loadLayout);

  const layoutsRef           = useRef(loadLayouts());
  const periodLayoutTreesRef = useRef(loadPeriodLayoutTrees());
  const justSwitchedRef      = useRef(false);

  const periods = schedules[scheduleType] || [];
  const currentPeriod = currentPeriodIndex >= 0 ? periods[currentPeriodIndex] : null;
  const nextPeriod    = nextPeriodIndex    >= 0 ? periods[nextPeriodIndex]    : null;
  // Fall back to period 0 when nothing is active and nothing is upcoming
  const displayPeriod = currentPeriod || nextPeriod || (periods.length > 0 ? periods[0] : null);
  const periodKey     = displayPeriod ? displayPeriod.label : null;

  // Clock always uses auto-detected period
  const clockPeriod     = clockPeriodIndex     >= 0 ? periods[clockPeriodIndex]     : null;
  const clockNextPeriod = clockNextPeriodIndex >= 0 ? periods[clockNextPeriodIndex] : null;

  const currentTextPages     = periodKey ? (periodData[periodKey]?.textPages ?? FALLBACK_TEXT_PAGES) : FALLBACK_TEXT_PAGES;
  const currentTextPanes     = periodKey ? (periodData[periodKey]?.textPanes ?? FALLBACK_TEXT_PANES) : FALLBACK_TEXT_PANES;
  const currentNotePages     = periodKey ? (periodData[periodKey]?.notePages ?? FALLBACK_NOTE_PAGES) : FALLBACK_NOTE_PAGES;
  const currentNotePanes     = periodKey ? (periodData[periodKey]?.notePanes ?? FALLBACK_NOTE_PANES) : FALLBACK_NOTE_PANES;
  const currentNames         = periodKey ? (periodData[periodKey]?.names         ?? DEFAULT_NAMES) : DEFAULT_NAMES;
  const currentExcluded      = periodKey ? (periodData[periodKey]?.excludedNames  ?? [])          : [];
  const currentBirthdays     = periodKey ? (periodData[periodKey]?.birthdays     ?? {})          : {};
  const currentColors        = periodKey ? (periodData[periodKey]?.colors        ?? {})          : {};

  // Other periods with a saved roster, for the "import student list" picker
  const otherPeriodOptions = useMemo(() => (
    Object.keys(periodData)
      .filter(k => k !== periodKey && Array.isArray(periodData[k]?.names) && periodData[k].names.length > 0)
      .map(k => ({ label: k, names: periodData[k].names, birthdays: periodData[k].birthdays || {}, colors: periodData[k].colors || {} }))
  ), [periodData, periodKey]);
  const currentProgress      = periodKey ? (periodData[periodKey]?.progress      ?? null)        : null;
  const currentReminders     = periodKey ? periodData[periodKey]?.reminders : undefined;

  // Detached pages (dragged out of a Board/Notes tab strip into their own tile)
  const dynamicPaneIds     = [...collectLeaves(layout)].filter(isDynamicPaneId);
  const dynamicTextPanes   = dynamicPaneIds.filter(id => id.startsWith("text-pane-"));
  const dynamicNotePanes   = dynamicPaneIds.filter(id => id.startsWith("notes-pane-"));

  // Per-period theme overrides global
  const periodTheme  = periodKey ? periodData[periodKey]?.theme : null;
  const currentTheme = periodTheme || globalTheme;

  // Apply theme whenever it changes
  useEffect(() => { applyTheme(currentTheme); }, [currentTheme]);

  // ── Schedule auto-selection ──────────────────────────────────────────────
  useEffect(() => {
    let lastDay = new Date().getDay();
    const id = setInterval(() => {
      const today = new Date().getDay();
      if (today !== lastDay) {
        lastDay = today;
        const next = getScheduleForToday(scheduleDays);
        if (next) {
          setScheduleType(next);
          localStorage.setItem("classboard_schedule_type", next);
        }
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [scheduleDays]);

  // ── Period detection ─────────────────────────────────────────────────────
  useEffect(() => {
    const detect = () => {
      setClockPeriodIndex(detectCurrentPeriod(periods));
      setClockNextPeriodIndex(detectNextPeriod(periods));
    };
    detect();
    const id = setInterval(detect, 30_000);
    return () => clearInterval(id);
  }, [periods]);

  useEffect(() => {
    if (!autoMode) return;
    const detect = () => {
      setCurrentPeriodIndex(detectCurrentPeriod(periods));
      setNextPeriodIndex(detectNextPeriod(periods));
    };
    detect();
    const id = setInterval(detect, 30_000);
    return () => clearInterval(id);
  }, [autoMode, periods]);

  useEffect(() => {
    if (autoMode) {
      setCurrentPeriodIndex(detectCurrentPeriod(periods));
      setNextPeriodIndex(detectNextPeriod(periods));
    }
  }, [scheduleType]); // eslint-disable-line

  // ── Per-period layout: restore on period change ──────────────────────────
  useEffect(() => {
    if (!periodKey) return;
    justSwitchedRef.current = true;
    const saved = layoutsRef.current[periodKey];
    if (saved?.collapsed) {
      setCollapsed({ ...DEFAULT_COLLAPSED, ...saved.collapsed });
    } else {
      setCollapsed({ ...DEFAULT_COLLAPSED });
    }
    // Restore per-period tile layout (fall back to hard-coded default, not global)
    const savedTree = migrateLayout(periodLayoutTreesRef.current[periodKey]);
    if (savedTree && validateLayout(savedTree)) {
      setLayout(savedTree);
    } else {
      setLayout(JSON.parse(JSON.stringify(DEFAULT_LAYOUT)));
    }
  }, [periodKey]);

  // ── Per-period layout: save on collapse change ───────────────────────────
  useEffect(() => {
    if (!periodKey) return;
    if (justSwitchedRef.current) { justSwitchedRef.current = false; return; }
    layoutsRef.current = { ...layoutsRef.current, [periodKey]: { collapsed } };
    localStorage.setItem(PERIOD_LAYOUT_KEY, JSON.stringify(layoutsRef.current));
  }, [periodKey, collapsed]);

  // ── Layout persistence ───────────────────────────────────────────────────
  const handleLayoutChange = useCallback((updater) => {
    const persist = (next) => {
      if (periodKey) {
        // Save per-period only; don't pollute the global default
        periodLayoutTreesRef.current = { ...periodLayoutTreesRef.current, [periodKey]: next };
        localStorage.setItem(PERIOD_LAYOUT_TREES_KEY, JSON.stringify(periodLayoutTreesRef.current));
      } else {
        saveLayout(next);
      }
    };
    if (typeof updater === "function") {
      setLayout(prev => { const next = updater(prev); persist(next); return next; });
    } else {
      setLayout(updater);
      persist(updater);
    }
  }, [periodKey]);

  // ── Data persistence ─────────────────────────────────────────────────────
  const savePeriod = useCallback((key, patch) => {
    if (!key) return;
    setPeriodData(d => {
      const next = { ...d, [key]: { ...d[key], ...patch } };
      localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Replace one pane's ordered page list — used for editing, adding, closing,
  // and reordering pages. New/edited pages are merged into the pool; pages no
  // longer referenced by any pane (this period's) are dropped from it. If a
  // detached pane's last page is closed this way, its tile closes too (the
  // main text/notes tile never does).
  const updatePanePages = (poolKey, panesKey, paneId, newPagesForPane) => {
    if (!periodKey) return;
    const willClose = newPagesForPane.length === 0 && isDynamicPaneId(paneId);
    setPeriodData(d => {
      const period = d[periodKey] || {};
      const pool = Array.isArray(period[poolKey]) ? period[poolKey] : [];
      const poolById = new Map(pool.map(p => [p.id, p]));
      for (const p of newPagesForPane) poolById.set(p.id, p);
      const nextPanes = { ...(period[panesKey] || {}), [paneId]: newPagesForPane.map(p => p.id) };
      if (willClose) delete nextPanes[paneId];
      const referenced = new Set(Object.values(nextPanes).flat());
      const nextPool = [...poolById.values()].filter(p => referenced.has(p.id));
      const next = { ...d, [periodKey]: { ...period, [poolKey]: nextPool, [panesKey]: nextPanes } };
      localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
      return next;
    });
    if (willClose) handleLayoutChange(prev => removeLeaf(prev, paneId) ?? prev);
  };

  const handleTextPagesChange = (paneId, pages) => updatePanePages("textPages", "textPanes", paneId, pages);

  // The main notes pane mirrors to synced periods; detached note panes are per-period only.
  const handleNotePagesChange = (paneId, pages) => {
    if (!periodKey) return;
    const mates = paneId === "notes" ? getSyncMates(noteSyncGroups, periodKey) : [];
    if (mates.length === 0) { updatePanePages("notePages", "notePanes", paneId, pages); return; }
    setPeriodData(d => {
      const next = { ...d };
      for (const label of [periodKey, ...mates]) {
        const period = next[label] || {};
        const pool = Array.isArray(period.notePages) ? period.notePages : [];
        const poolById = new Map(pool.map(p => [p.id, p]));
        for (const p of pages) poolById.set(p.id, p);
        const nextPanes = { ...(period.notePanes || {}), notes: pages.map(p => p.id) };
        const referenced = new Set(Object.values(nextPanes).flat());
        next[label] = { ...period, notePages: [...poolById.values()].filter(p => referenced.has(p.id)), notePanes: nextPanes };
      }
      localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
      return next;
    });
  };

  // Link `periodKey`'s notes with `mateLabels`; newly-linked periods immediately
  // inherit this period's current main-pane notes so there's nothing left to copy-paste.
  const handleNoteSyncChange = useCallback((mateLabels) => {
    if (!periodKey) return;
    const prevMates = getSyncMates(noteSyncGroups, periodKey);
    const newlyAdded = mateLabels.filter(l => !prevMates.includes(l));

    const nextGroups = setSyncGroup(noteSyncGroups, periodKey, mateLabels);
    setNoteSyncGroups(nextGroups);
    saveNoteSyncGroups(nextGroups);

    if (newlyAdded.length > 0) {
      setPeriodData(d => {
        const sourcePages = d[periodKey]?.notePages ?? [];
        const sourcePanes = d[periodKey]?.notePanes?.notes ?? [];
        const next = { ...d };
        for (const label of newlyAdded) {
          next[label] = { ...next[label], notePages: [...sourcePages], notePanes: { ...next[label]?.notePanes, notes: [...sourcePanes] } };
        }
        localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, [periodKey, noteSyncGroups]);

  // Detach a page tab into a brand-new tile, dropped next to `targetTileId`.
  const handleDetachPage = (paneType, info, targetTileId, side) => {
    if (!periodKey) return;
    const panesKey = paneType === "text" ? "textPanes" : "notePanes";
    const { pageId, sourcePaneId } = info;
    const newPaneId = makePaneId(paneType);
    setPeriodData(d => {
      const period = d[periodKey] || {};
      const panes = { ...(period[panesKey] || {}) };
      panes[sourcePaneId] = (panes[sourcePaneId] || []).filter(id => id !== pageId);
      panes[newPaneId] = [pageId];
      const next = { ...d, [periodKey]: { ...period, [panesKey]: panes } };
      localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
      return next;
    });
    handleLayoutChange(prev => insertLeaf(prev, targetTileId, newPaneId, side));
  };

  // Merge a dragged-in page tab into an existing pane; if that empties a
  // detached pane, close it (the main text/notes tile is never closed).
  const handleMergePage = (paneType, info, targetPaneId) => {
    if (!periodKey) return;
    const panesKey = paneType === "text" ? "textPanes" : "notePanes";
    const { pageId, sourcePaneId } = info;
    if (sourcePaneId === targetPaneId) return;
    const currentPanes = periodData[periodKey]?.[panesKey] || {};
    const remaining = (currentPanes[sourcePaneId] || []).filter(id => id !== pageId);
    const willClose = remaining.length === 0 && isDynamicPaneId(sourcePaneId);

    setPeriodData(d => {
      const period = d[periodKey] || {};
      const panes = { ...(period[panesKey] || {}) };
      panes[sourcePaneId] = remaining;
      panes[targetPaneId] = [...(panes[targetPaneId] || []), pageId];
      if (willClose) delete panes[sourcePaneId];
      const next = { ...d, [periodKey]: { ...period, [panesKey]: panes } };
      localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
      return next;
    });
    if (willClose) handleLayoutChange(prev => removeLeaf(prev, sourcePaneId) ?? prev);
  };

  // A page tab was dropped on tile `targetTileId`: merge into it if it's
  // already a Board/Notes pane of the matching type, otherwise pop the page
  // out into a brand-new tile next to it.
  const handlePageDrop = (paneType, info, targetTileId, side) => {
    const isPaneOfType = targetTileId === paneType || targetTileId.startsWith(`${paneType}-pane-`);
    if (isPaneOfType) handleMergePage(paneType, info, targetTileId);
    else handleDetachPage(paneType, info, targetTileId, side);
  };

  const handleNamesChange         = useCallback((names)         => savePeriod(periodKey, { names }),          [periodKey, savePeriod]);
  const handleExcludedChange      = useCallback((excludedNames) => savePeriod(periodKey, { excludedNames }), [periodKey, savePeriod]);
  const handleBirthdaysChange     = useCallback((birthdays)     => savePeriod(periodKey, { birthdays }),     [periodKey, savePeriod]);
  const handleColorsChange        = useCallback((colors)        => savePeriod(periodKey, { colors }),        [periodKey, savePeriod]);
  const handleProgressChange      = useCallback((progress)      => savePeriod(periodKey, { progress }),      [periodKey, savePeriod]);
  const handleRemindersChange     = useCallback((reminders)     => savePeriod(periodKey, { reminders }),     [periodKey, savePeriod]);

  // Delete a (possibly stale/renamed) period's saved class list — its roster,
  // exclusions, birthdays, and colors — leaving its other data (notes, etc.)
  // alone. If nothing else is left for that period, drop the entry entirely.
  const handleDeleteClassList = (label) => {
    if (!label) return;
    setPeriodData(d => {
      if (!d[label]) return d;
      const { names: _names, excludedNames: _excludedNames, birthdays: _birthdays, colors: _colors, ...rest } = d[label];
      const next = { ...d };
      if (Object.keys(rest).length === 0) delete next[label];
      else next[label] = rest;
      localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleThemeChange = useCallback((theme) => {
    applyTheme(theme);
    if (periodKey) {
      savePeriod(periodKey, { theme });
    } else {
      setGlobalTheme(theme);
      localStorage.setItem("classboard_global_theme", theme);
    }
  }, [periodKey, savePeriod]);

  const handleScheduleTypeChange = useCallback((type) => {
    if (type === scheduleType) return;
    // Preserve the currently displayed period if its label exists in the new schedule
    const newPeriods = schedules[type] || [];
    if (periodKey) {
      const idx = newPeriods.findIndex(p => p.label === periodKey);
      if (idx >= 0) {
        setCurrentPeriodIndex(idx);
        setNextPeriodIndex(detectNextPeriod(newPeriods));
        setAutoMode(false);
      }
    }
    setScheduleType(type);
    localStorage.setItem("classboard_schedule_type", type);
  }, [scheduleType, schedules, periodKey]);

  const handleSchedulesChange = useCallback((s) => {
    setSchedules(s);
    saveSchedules(s);
    // Re-anchor the displayed period by label — periods edited/removed elsewhere
    // can shift array indices out from under a manually-selected period.
    if (!autoMode && periodKey) {
      const newPeriods = s[scheduleType] || [];
      const idx = newPeriods.findIndex(p => p.label === periodKey);
      setCurrentPeriodIndex(idx);
      setNextPeriodIndex(idx >= 0 ? detectNextPeriod(newPeriods) : -1);
    }
  }, [autoMode, periodKey, scheduleType]);
  const handleScheduleDaysChange = useCallback((d) => { setScheduleDays(d); saveScheduleDays(d); }, []);
  const handlePeriodNamesChange = useCallback((n) => { setPeriodNames(n); savePeriodNames(n); }, []);

  // ── Tile content map ─────────────────────────────────────────────────────
  const wheelTheme = THEMES[currentTheme] || THEMES.midnight;

  const seatingChartNode = (
    <SeatingChart
      names={currentNames}
      periodLabel={displayPeriod?.label}
      periodKey={periodKey}
      onClose={() => setSeatingTile(null)}
    />
  );

  const tiles = {
    date: seatingTile === "date" ? seatingChartNode : <DateWidget />,
    clock: seatingTile === "clock" ? seatingChartNode : (
      <ClockWidget
        currentPeriod={clockPeriod}
        nextPeriod={clockNextPeriod}
        collapsed={collapsed.clock}
        onToggle={() => toggleCollapsed("clock")}
        onDisplayChange={setClockDisplay}
        onSettingsChange={s => setClockFontSize(s.fontSize)}
      />
    ),
    text: seatingTile === "text" ? seatingChartNode : (
      <TextBoard
        key={`text-${periodKey}`}
        paneId="text"
        pages={pagesForPane(currentTextPages, currentTextPanes, "text")}
        onPagesChange={pages => handleTextPagesChange("text", pages)}
        periodLabel={displayPeriod?.label}
      />
    ),
    camera: seatingTile === "camera" ? seatingChartNode : (
      <CameraFeed
        periodKey={periodKey}
        clockDisplay={clockDisplay}
        clockFontSize={clockFontSize}
      />
    ),
    notes: seatingTile === "notes" ? seatingChartNode : (
      <NoteWidget
        key={`notes-${periodKey}`}
        paneId="notes"
        pages={pagesForPane(currentNotePages, currentNotePanes, "notes")}
        onPagesChange={pages => handleNotePagesChange("notes", pages)}
        periodLabel={displayPeriod?.label}
        collapsed={collapsed.notes}
        onToggle={() => toggleCollapsed("notes")}
        allPeriodLabels={periodNames.map(n => n.label)}
        syncedWith={periodKey ? getSyncMates(noteSyncGroups, periodKey) : []}
        onSyncChange={handleNoteSyncChange}
      />
    ),
    ...Object.fromEntries(dynamicTextPanes.map(paneId => [
      paneId,
      <TextBoard
        key={`text-${periodKey}-${paneId}`}
        paneId={paneId}
        pages={pagesForPane(currentTextPages, currentTextPanes, paneId)}
        onPagesChange={pages => handleTextPagesChange(paneId, pages)}
        periodLabel={displayPeriod?.label}
      />,
    ])),
    ...Object.fromEntries(dynamicNotePanes.map(paneId => [
      paneId,
      <NoteWidget
        key={`notes-${periodKey}-${paneId}`}
        paneId={paneId}
        pages={pagesForPane(currentNotePages, currentNotePanes, paneId)}
        onPagesChange={pages => handleNotePagesChange(paneId, pages)}
        periodLabel={displayPeriod?.label}
      />,
    ])),
    wheel: seatingTile === "wheel" ? seatingChartNode : (
      <WheelOfNames
        names={currentNames}
        excludedNames={currentExcluded}
        colors={currentColors}
        periodLabel={displayPeriod?.label}
        collapsed={collapsed.wheel}
        onToggle={() => toggleCollapsed("wheel")}
        wheelColors={wheelTheme.wheelColors}
        wheelText={wheelTheme.wheelText}
      />
    ),
    prize: seatingTile === "prize" ? seatingChartNode : (
      <ProgressWidget
        data={currentProgress}
        onChange={handleProgressChange}
        collapsed={collapsed.prize}
        onToggle={() => toggleCollapsed("prize")}
      />
    ),
    reminders: seatingTile === "reminders" ? seatingChartNode : (
      <RemindersWidget
        key={`reminders-${periodKey}`}
        currentPeriod={clockPeriod}
        reminders={currentReminders}
        onRemindersChange={handleRemindersChange}
        collapsed={collapsed.reminders}
      />
    ),
  };

  return (
    <div className="app">
      <PeriodBar
        schedules={schedules}           onSchedulesChange={handleSchedulesChange}
        scheduleType={scheduleType}     onScheduleTypeChange={handleScheduleTypeChange}
        scheduleDays={scheduleDays}     onScheduleDaysChange={handleScheduleDaysChange}
        periodNames={periodNames}       onPeriodNamesChange={handlePeriodNamesChange}
        currentPeriodIndex={currentPeriodIndex}
        nextPeriodIndex={nextPeriodIndex}
        onPeriodSelect={idx => {
          setCurrentPeriodIndex(idx);
          setNextPeriodIndex(detectNextPeriod(periods));
          setAutoMode(false);
        }}
        autoMode={autoMode}             onAutoModeChange={setAutoMode}
        currentTheme={currentTheme}     onThemeChange={handleThemeChange}
        onImport={() => window.location.reload()}
        onOpenSeatingChart={openSeatingChart}
        names={currentNames}            onNamesChange={handleNamesChange}
        excludedNames={currentExcluded} onExcludedNamesChange={handleExcludedChange}
        birthdays={currentBirthdays}    onBirthdaysChange={handleBirthdaysChange}
        colors={currentColors}          onColorsChange={handleColorsChange}
        otherPeriods={otherPeriodOptions}
        onDeleteClassList={handleDeleteClassList}
        periodLabel={displayPeriod?.label}
      />
      <TileLayout
        layout={layout}
        onLayoutChange={handleLayoutChange}
        tiles={tiles}
        isCollapsed={id => collapsed[id] || false}
        onToggle={id => { if (id in DEFAULT_COLLAPSED) toggleCollapsed(id); }}
        tileNames={TILE_NAMES}
        swapMap={SWAP_MAP}
        onPageDrop={handlePageDrop}
      />
    </div>
  );
}
