import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import TextPane from "./components/TextPane";
import ClockWidget from "./components/ClockWidget";
import PeriodBar from "./components/PeriodBar";
import CameraFeed from "./components/CameraFeed";
import WheelOfNames from "./components/WheelOfNames";
import ProgressWidget from "./components/ProgressWidget";
import TileLayout from "./components/TileLayout";
import DateWidget from "./components/DateWidget";
import RemindersWidget from "./components/RemindersWidget";
import { loadSchedules, saveSchedules, loadScheduleDays, saveScheduleDays, loadPeriodNames, savePeriodNames, getScheduleForToday, detectCurrentPeriod, detectNextPeriod, saveActivePeriod } from "./data/schedules";
import { THEMES, applyTheme, hasDarkText, lightenForDarkText, darkenForLightText } from "./data/themes";
import { loadLayout, saveLayout, validateLayout, migrateLayout, DEFAULT_LAYOUT, insertLeaf, removeLeaf, moveTile, collectLeaves, isDynamicPaneId, isPaneTile, makePaneId, TILE_IDS, loadHiddenTileIds, saveHiddenTileIds, stripHiddenTiles } from "./data/layout";
import { loadPageSyncGroups, savePageSyncGroups, getPageSyncMates, setPageSyncGroup, removePageSyncLocation } from "./data/pageSync";
import { PERIOD_DATA_KEY, loadPeriodData } from "./data/periodData";
import { migrateToUnifiedPages, pagesForPane } from "./data/pages";
import { saveBoardViewBounds } from "./data/teacherView";
import "./App.css";

const PERIOD_LAYOUT_KEY       = "classboard_period_layout";
const PERIOD_LAYOUT_TREES_KEY = "classboard_period_layout_trees";

function loadPeriodLayoutTrees() {
  try { const s = localStorage.getItem(PERIOD_LAYOUT_TREES_KEY); if (s) return JSON.parse(s); } catch (_) {}
  return {};
}

const DEFAULT_COLLAPSED = { date: false, clock: false, text: false, notes: false, wheel: false, prize: false, reminders: false };
const TILE_NAMES = { date: "Clock", clock: "Timer", notes: "Notes", text: "Board", camera: "Camera", wheel: "Names", prize: "Goals", reminders: "Reminders" };
const SWAP_MAP = { camera: "notes", notes: "camera" };
const DEFAULT_NAMES = ["Diego", "Sara", "Andre", "Lin"];

// Each of the two fixed panes starts with one blank page, shown until it's
// edited (at which point it becomes a real stored page) or closed. Applied
// per-pane, not per-period, so editing one doesn't blank out the other's.
const FALLBACK_TEXT_PAGE = { id: "fallback-text", html: "", fontSize: 48 };
const FALLBACK_NOTE_PAGE = { id: "fallback-notes", html: "", fontSize: 20 };

// One-time: text panes used to come in two separate flavors (Board vs Notes),
// each with their own pool going back to a fixed 3-page array before that.
// Convert every period still on an old shape into the unified { pages, panes }
// shape (any page can live in any pane now), then persist and drop old fields.
function migrateTextNotesPages(periodData) {
  let changed = false;
  const next = { ...periodData };
  for (const key of Object.keys(next)) {
    const period = next[key];
    const mig = migrateToUnifiedPages(period);
    if (mig) {
      changed = true;
      const {
        texts: _texts, textFontSizes: _textFontSizes, notes: _notes, noteFontSizes: _noteFontSizes,
        textPages: _textPages, textPanes: _textPanes, notePages: _notePages, notePanes: _notePanes,
        ...rest
      } = period;
      next[key] = { ...rest, ...mig };
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

// Set only for the popup Teacher View opens via its "🖥 Board" button (see
// openBoardView) — a plain synced copy of the board, like Teacher View
// itself, that happens to share this same App component. Stable for the
// life of the window, so no need for state.
const isBoardPopup = typeof window !== "undefined" && !!window.opener;

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
  const [pageSyncGroups, setPageSyncGroups] = useState(loadPageSyncGroups);

  // Pick up changes made in Teacher View (a separate window) — e.g. a
  // student shown/hidden from the wheel, or a birthday/color/gems edit —
  // so this window doesn't need a manual reload to see them. The native
  // "storage" event only fires in OTHER same-origin windows, never the one
  // that made the change, so this can't loop back on our own writes.
  useEffect(() => {
    const reload = () => {
      setPeriodData(migrateWarmUpRename(migrateTextNotesPages(migrateGlobalReminders(loadPeriodData()))));
      setPageSyncGroups(loadPageSyncGroups());
    };
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, []);

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

  // Which page is active in each pane — reported up by TextPane so a pane
  // with more than one page (and thus no tab strip of its own) knows which
  // page its tile's own corner grip should drag.
  const [activePageIdByPane, setActivePageIdByPane] = useState({});
  const handleActivePageChange = useCallback((paneId, pageId) => {
    setActivePageIdByPane(prev => (prev[paneId] === pageId ? prev : { ...prev, [paneId]: pageId }));
  }, []);

  // Theme
  const [globalTheme, setGlobalTheme] = useState(loadGlobalTheme);

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

  const storedPages          = periodKey ? (periodData[periodKey]?.pages ?? []) : [];
  const storedPanes          = periodKey ? (periodData[periodKey]?.panes ?? {}) : {};
  const currentPages         = [FALLBACK_TEXT_PAGE, FALLBACK_NOTE_PAGE, ...storedPages];
  const currentPanes         = { text: ["fallback-text"], notes: ["fallback-notes"], ...storedPanes };
  const currentNames         = periodKey ? (periodData[periodKey]?.names         ?? DEFAULT_NAMES) : DEFAULT_NAMES;
  const currentExcluded      = periodKey ? (periodData[periodKey]?.excludedNames  ?? [])          : [];
  const currentBirthdays     = periodKey ? (periodData[periodKey]?.birthdays     ?? {})          : {};
  const currentColors        = periodKey ? (periodData[periodKey]?.colors        ?? {})          : {};
  const currentGems          = periodKey ? (periodData[periodKey]?.gems          ?? {})          : {};
  const currentJobs          = periodKey ? (periodData[periodKey]?.jobs          ?? {})          : {};
  const currentGemsLabel     = periodKey ? (periodData[periodKey]?.gemsLabel     ?? "Gems")       : "Gems";
  const currentSortMode      = periodKey ? (periodData[periodKey]?.sortMode      ?? "default")    : "default";

  // Other periods with a saved roster, for the "import student list" picker
  const otherPeriodOptions = useMemo(() => (
    Object.keys(periodData)
      .filter(k => k !== periodKey && Array.isArray(periodData[k]?.names) && periodData[k].names.length > 0)
      .map(k => ({ label: k, names: periodData[k].names, birthdays: periodData[k].birthdays || {}, colors: periodData[k].colors || {} }))
  ), [periodData, periodKey]);
  const currentProgress      = periodKey ? (periodData[periodKey]?.progress      ?? null)        : null;
  const currentReminders     = periodKey ? periodData[periodKey]?.reminders : undefined;

  // Detached pages (dragged out of a text pane's tab strip into their own tile)
  const dynamicPaneIds = [...collectLeaves(layout)].filter(isDynamicPaneId);

  // A pane has no tab strip of its own — dragging its tile's corner grip
  // instead moves its active page (to merge into another pane, or detach to
  // a new tile). This applies even to a single-page pane, so dropping onto
  // another pane always stacks consistently regardless of page count; see
  // handlePageDrop for how a single-page fixed tile still gets treated as a
  // whole-tile reposition when dropped somewhere else instead.
  const getTileDragPayload = (tileId) => {
    if (!isPaneTile(tileId)) return null;
    const pagesHere = pagesForPane(currentPages, currentPanes, tileId);
    if (pagesHere.length === 0) return null;
    const activeId = pagesHere.some(p => p.id === activePageIdByPane[tileId])
      ? activePageIdByPane[tileId] : pagesHere[0].id;
    return { pageId: activeId, sourcePaneId: tileId };
  };

  // Per-period theme overrides global
  const periodTheme  = periodKey ? periodData[periodKey]?.theme : null;
  const currentTheme = periodTheme || globalTheme;

  // Apply theme whenever it changes
  useEffect(() => { applyTheme(currentTheme); }, [currentTheme]);

  // Remember this window's position/size, but only when it's the popup
  // opened from Teacher View (see openBoardView) — the primary board window
  // (usually fullscreen on a projector) shouldn't have its bounds saved,
  // which would otherwise clobber the popup's own remembered spot.
  useEffect(() => {
    if (!isBoardPopup) return;
    const save = () => saveBoardViewBounds({
      left: window.screenX, top: window.screenY,
      width: window.outerWidth, height: window.outerHeight,
    });
    const id = setInterval(save, 2000);
    window.addEventListener("beforeunload", save);
    return () => { clearInterval(id); window.removeEventListener("beforeunload", save); };
  }, []);

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

  // Let popup windows (Teacher View, seating chart) mirror whichever period
  // is active here, instead of independently time-detecting their own.
  useEffect(() => {
    saveActivePeriod(autoMode, currentPeriod?.label ?? null);
  }, [autoMode, currentPeriod]);

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
    const hiddenTileIds = loadHiddenTileIds();
    const savedTree = migrateLayout(periodLayoutTreesRef.current[periodKey], hiddenTileIds);
    if (savedTree && validateLayout(savedTree, hiddenTileIds)) {
      setLayout(savedTree);
    } else {
      setLayout(stripHiddenTiles(JSON.parse(JSON.stringify(DEFAULT_LAYOUT)), hiddenTileIds));
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
    // Whenever a tile is added or removed (Layout tool checkbox, a pane's
    // last page dragged away, a preset applied...), remember it as
    // deliberately shown/hidden so migrateLayout won't second-guess it later.
    const trackHidden = (prev, next) => {
      const prevLeaves = collectLeaves(prev);
      const nextLeaves = collectLeaves(next);
      if (TILE_IDS.every(id => prevLeaves.has(id) === nextLeaves.has(id))) return;
      const hidden = new Set(loadHiddenTileIds());
      for (const id of TILE_IDS) {
        if (prevLeaves.has(id) && !nextLeaves.has(id)) hidden.add(id);
        else if (!prevLeaves.has(id) && nextLeaves.has(id)) hidden.delete(id);
      }
      saveHiddenTileIds([...hidden]);
    };
    setLayout(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      trackHidden(prev, next);
      persist(next);
      return next;
    });
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
  // longer referenced by any pane (this period's) are dropped from it. If
  // this was the pane's last page, its tile closes too (see
  // canCloseSourcePane — every pane tile behaves the same way here, fixed
  // text/notes included). Any tab synced with other periods (see
  // handleTabSyncChange) mirrors its edited content there too; a tab closed
  // here just drops out of the sync group rather than disappearing elsewhere.
  const handlePagesChange = (paneId, newPagesForPane) => {
    if (!periodKey) return;
    const willClose = newPagesForPane.length === 0 && canCloseSourcePane(paneId);
    const priorIds = new Set(periodData[periodKey]?.panes?.[paneId] || []);
    const newIds = new Set(newPagesForPane.map(p => p.id));
    const removedIds = [...priorIds].filter(id => !newIds.has(id));

    setPeriodData(d => {
      const next = { ...d };
      const period = next[periodKey] || {};
      const pool = Array.isArray(period.pages) ? period.pages : [];
      const poolById = new Map(pool.map(p => [p.id, p]));
      for (const p of newPagesForPane) poolById.set(p.id, p);
      const nextPanes = { ...(period.panes || {}), [paneId]: newPagesForPane.map(p => p.id) };
      if (willClose) delete nextPanes[paneId];
      const referenced = new Set(Object.values(nextPanes).flat());
      next[periodKey] = { ...period, pages: [...poolById.values()].filter(p => referenced.has(p.id)), panes: nextPanes };

      // Mirror each tab's content to whichever other periods it's synced with.
      for (const p of newPagesForPane) {
        const mates = getPageSyncMates(pageSyncGroups, periodKey, paneId, p.id);
        for (const mate of mates) {
          const mp = next[mate.period] || {};
          const mPool = Array.isArray(mp.pages) ? mp.pages : [];
          const mPoolById = new Map(mPool.map(pp => [pp.id, pp]));
          mPoolById.set(p.id, p);
          const mPanes = { ...(mp.panes || {}) };
          if (!(mPanes[mate.paneId] || []).includes(p.id)) {
            mPanes[mate.paneId] = [...(mPanes[mate.paneId] || []), p.id];
          }
          const mReferenced = new Set(Object.values(mPanes).flat());
          next[mate.period] = { ...mp, pages: [...mPoolById.values()].filter(pp => mReferenced.has(pp.id)), panes: mPanes };
        }
      }

      localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
      return next;
    });

    if (removedIds.length > 0) {
      setPageSyncGroups(g => {
        let next = g;
        for (const id of removedIds) next = removePageSyncLocation(next, periodKey, paneId, id);
        savePageSyncGroups(next);
        return next;
      });
    }
    if (willClose) handleLayoutChange(prev => removeLeaf(prev, paneId) ?? prev);
  };

  // The tile grid's own "delete this tab" button (next to swap) — removes
  // whichever page is active in that pane, same as the toolbar's close-page
  // button but reachable without first giving the pane focus.
  const handleDeleteTab = (tileId) => {
    const pagesHere = pagesForPane(currentPages, currentPanes, tileId);
    const activeId = pagesHere.some(p => p.id === activePageIdByPane[tileId])
      ? activePageIdByPane[tileId] : pagesHere[0]?.id;
    if (!activeId) return;
    handlePagesChange(tileId, pagesHere.filter(p => p.id !== activeId));
  };

  // Sync one tab with `mateLabels` (other periods, same paneId). Newly-linked
  // periods immediately inherit this tab's current content so there's
  // nothing left to copy-paste; periods dropped from the list just keep
  // their own now-independent copy rather than losing the tab.
  const handleTabSyncChange = useCallback((paneId, pageId, mateLabels) => {
    if (!periodKey) return;
    const prevMates = getPageSyncMates(pageSyncGroups, periodKey, paneId, pageId).map(m => m.period);
    const newlyAdded = mateLabels.filter(l => !prevMates.includes(l));

    const nextGroups = setPageSyncGroup(pageSyncGroups, periodKey, paneId, pageId, mateLabels);
    setPageSyncGroups(nextGroups);
    savePageSyncGroups(nextGroups);

    if (newlyAdded.length > 0) {
      setPeriodData(d => {
        const sourcePage = (d[periodKey]?.pages || []).find(p => p.id === pageId);
        if (!sourcePage) return d;
        const next = { ...d };
        for (const label of newlyAdded) {
          const period = next[label] || {};
          const pool = Array.isArray(period.pages) ? period.pages : [];
          const poolById = new Map(pool.map(p => [p.id, p]));
          poolById.set(pageId, sourcePage);
          const panes = { ...(period.panes || {}) };
          if (!(panes[paneId] || []).includes(pageId)) {
            panes[paneId] = [...(panes[paneId] || []), pageId];
          }
          const referenced = new Set(Object.values(panes).flat());
          next[label] = { ...period, pages: [...poolById.values()].filter(p => referenced.has(p.id)), panes };
        }
        localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, [periodKey, pageSyncGroups]);

  const pageSyncMates = useCallback(
    (paneId, pageId) => (periodKey ? getPageSyncMates(pageSyncGroups, periodKey, paneId, pageId).map(m => m.period) : []),
    [periodKey, pageSyncGroups],
  );

  // A pane whose last page is being dragged away closes along with it —
  // even the fixed text/notes tiles, which are otherwise permanent — as
  // long as at least one other pane tile will still be left somewhere to
  // add pages from (so there's always a way to get a text pane back).
  const canCloseSourcePane = (sourcePaneId) => {
    if (isDynamicPaneId(sourcePaneId)) return true;
    const paneTileCount = [...collectLeaves(layout)].filter(isPaneTile).length;
    return paneTileCount > 1;
  };

  // Detach a page tab into a brand-new tile, dropped next to `targetTileId`.
  // If that emptied the source pane and it can be closed (see
  // canCloseSourcePane), close it too instead of leaving an empty stray tile
  // behind.
  const handleDetachPage = (info, targetTileId, side) => {
    if (!periodKey) return;
    const { pageId, sourcePaneId } = info;
    const newPaneId = makePaneId();
    const panesNow = periodData[periodKey]?.panes || {};
    const remaining = (panesNow[sourcePaneId] || []).filter(id => id !== pageId);
    const willClose = remaining.length === 0 && canCloseSourcePane(sourcePaneId);

    setPeriodData(d => {
      const period = d[periodKey] || {};
      const panes = { ...(period.panes || {}) };
      panes[sourcePaneId] = remaining;
      panes[newPaneId] = [pageId];
      if (willClose) delete panes[sourcePaneId];
      const next = { ...d, [periodKey]: { ...period, panes } };
      localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
      return next;
    });
    handleLayoutChange(prev => {
      const next = insertLeaf(prev, targetTileId, newPaneId, side);
      return willClose ? (removeLeaf(next, sourcePaneId) ?? next) : next;
    });
  };

  // Merge a dragged-in page tab into an existing pane; if that empties the
  // source pane and it can be closed (see canCloseSourcePane), close it too.
  const handleMergePage = (info, targetPaneId) => {
    if (!periodKey) return;
    const { pageId, sourcePaneId } = info;
    if (sourcePaneId === targetPaneId) return;
    const panesNow = periodData[periodKey]?.panes || {};
    const remaining = (panesNow[sourcePaneId] || []).filter(id => id !== pageId);
    const willClose = remaining.length === 0 && canCloseSourcePane(sourcePaneId);

    setPeriodData(d => {
      const period = d[periodKey] || {};
      const panes = { ...(period.panes || {}) };
      panes[sourcePaneId] = remaining;
      panes[targetPaneId] = [...(panes[targetPaneId] || []), pageId];
      if (willClose) delete panes[sourcePaneId];
      const next = { ...d, [periodKey]: { ...period, panes } };
      localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
      return next;
    });
    if (willClose) handleLayoutChange(prev => removeLeaf(prev, sourcePaneId) ?? prev);
  };

  // A page tab was dropped on tile `targetTileId`: merge into it if it
  // already hosts a text pane and the drop landed away from its edges
  // (closing the source pane if that was its last page — see
  // canCloseSourcePane), otherwise pop the page out into a brand-new tile
  // at the given side — unless it's the only page in a fixed tile
  // (text/notes) being dropped on a non-pane target, where there's no pane
  // to merge into; reposition that tile as a whole instead of duplicating
  // it, so the drag reads as "move this pane" like it would if it had no
  // pages to speak of.
  const handlePageDrop = (info, targetTileId, side) => {
    // A `side` of null means the drop landed away from the target's own
    // edges (see TileLayout's EDGE_ZONE) — stack as a tab there. Otherwise,
    // even a pane tile falls through to the split/detach path below, so
    // dragging near an existing pane's edge still docks a new region
    // instead of always merging into its tab strip.
    if (isPaneTile(targetTileId) && !side) {
      handleMergePage(info, targetTileId);
      return;
    }
    const sourcePages = pagesForPane(currentPages, currentPanes, info.sourcePaneId);
    if (sourcePages.length <= 1 && !isDynamicPaneId(info.sourcePaneId)) {
      handleLayoutChange(prev => moveTile(prev, info.sourcePaneId, targetTileId, side));
      return;
    }
    handleDetachPage(info, targetTileId, side);
  };

  const handleNamesChange         = useCallback((names)         => savePeriod(periodKey, { names }),          [periodKey, savePeriod]);
  // A period's roster only becomes real, persisted data once its names are
  // explicitly saved — until then `currentNames` is just the DEFAULT_NAMES
  // fallback, invisible to Teacher View (which has no such fallback). Now
  // that the main modal can't add/remove students itself, setting some
  // other attribute (gems, a job, a color...) might be the first save this
  // period ever gets, so seed the names alongside it when that's the case.
  const handleExcludedChange = useCallback((excludedNames) => {
    const seed = periodKey && !periodData[periodKey]?.names ? { names: currentNames } : {};
    savePeriod(periodKey, { excludedNames, ...seed });
  }, [periodKey, savePeriod, periodData, currentNames]);
  const handleBirthdaysChange = useCallback((birthdays) => {
    const seed = periodKey && !periodData[periodKey]?.names ? { names: currentNames } : {};
    savePeriod(periodKey, { birthdays, ...seed });
  }, [periodKey, savePeriod, periodData, currentNames]);
  const handleColorsChange = useCallback((colors) => {
    const seed = periodKey && !periodData[periodKey]?.names ? { names: currentNames } : {};
    savePeriod(periodKey, { colors, ...seed });
  }, [periodKey, savePeriod, periodData, currentNames]);
  const handleGemsChange = useCallback((gems) => {
    const seed = periodKey && !periodData[periodKey]?.names ? { names: currentNames } : {};
    savePeriod(periodKey, { gems, ...seed });
  }, [periodKey, savePeriod, periodData, currentNames]);
  const handleJobsChange = useCallback((jobs) => {
    const seed = periodKey && !periodData[periodKey]?.names ? { names: currentNames } : {};
    savePeriod(periodKey, { jobs, ...seed });
  }, [periodKey, savePeriod, periodData, currentNames]);
  const handleGemsLabelChange = useCallback((gemsLabel) => {
    const seed = periodKey && !periodData[periodKey]?.names ? { names: currentNames } : {};
    savePeriod(periodKey, { gemsLabel, ...seed });
  }, [periodKey, savePeriod, periodData, currentNames]);
  const handleSortModeChange = useCallback((sortMode) => {
    const seed = periodKey && !periodData[periodKey]?.names ? { names: currentNames } : {};
    savePeriod(periodKey, { sortMode, ...seed });
  }, [periodKey, savePeriod, periodData, currentNames]);
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
      const patch = { theme };
      // A pane background picked under one theme can go illegible once the
      // opposite theme's text renders on top of it — brighten a too-dark one
      // for dark (light-theme) text, or darken a too-light one for light
      // (dark-theme) text; already-contrasting custom colors are untouched
      // either way.
      if (storedPages.some(p => p.bgColor)) {
        const adjust = hasDarkText(theme) ? lightenForDarkText : darkenForLightText;
        patch.pages = storedPages.map(p => p.bgColor ? { ...p, bgColor: adjust(p.bgColor) } : p);
      }
      savePeriod(periodKey, patch);
    } else {
      setGlobalTheme(theme);
      localStorage.setItem("classboard_global_theme", theme);
    }
  }, [periodKey, savePeriod, storedPages]);

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

  const tiles = {
    date: <DateWidget />,
    clock: (
      <ClockWidget
        currentPeriod={clockPeriod}
        nextPeriod={clockNextPeriod}
        collapsed={collapsed.clock}
        onToggle={() => toggleCollapsed("clock")}
        onDisplayChange={setClockDisplay}
        onSettingsChange={s => setClockFontSize(s.fontSize)}
      />
    ),
    text: (
      <TextPane
        key={`text-${periodKey}`}
        kind="Announcement"
        defaultFontSize={48}
        pages={pagesForPane(currentPages, currentPanes, "text")}
        onPagesChange={pages => handlePagesChange("text", pages)}
        periodLabel={displayPeriod?.label}
        allPeriodLabels={periodNames.map(n => n.label)}
        pageSyncMates={pageId => pageSyncMates("text", pageId)}
        onTabSyncChange={(pageId, mateLabels) => handleTabSyncChange("text", pageId, mateLabels)}
        onActivePageChange={pageId => handleActivePageChange("text", pageId)}
      />
    ),
    camera: (
      <CameraFeed
        periodKey={periodKey}
        clockDisplay={clockDisplay}
        clockFontSize={clockFontSize}
      />
    ),
    notes: (
      <TextPane
        key={`notes-${periodKey}`}
        kind="Notes"
        defaultFontSize={20}
        pages={pagesForPane(currentPages, currentPanes, "notes")}
        onPagesChange={pages => handlePagesChange("notes", pages)}
        periodLabel={displayPeriod?.label}
        allPeriodLabels={periodNames.map(n => n.label)}
        pageSyncMates={pageId => pageSyncMates("notes", pageId)}
        onTabSyncChange={(pageId, mateLabels) => handleTabSyncChange("notes", pageId, mateLabels)}
        onActivePageChange={pageId => handleActivePageChange("notes", pageId)}
      />
    ),
    ...Object.fromEntries(dynamicPaneIds.map(paneId => [
      paneId,
      <TextPane
        key={`pane-${periodKey}-${paneId}`}
        pages={pagesForPane(currentPages, currentPanes, paneId)}
        onPagesChange={pages => handlePagesChange(paneId, pages)}
        periodLabel={displayPeriod?.label}
        allPeriodLabels={periodNames.map(n => n.label)}
        pageSyncMates={pageId2 => pageSyncMates(paneId, pageId2)}
        onTabSyncChange={(pageId2, mateLabels) => handleTabSyncChange(paneId, pageId2, mateLabels)}
        onActivePageChange={pageId2 => handleActivePageChange(paneId, pageId2)}
      />,
    ])),
    wheel: (
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
    prize: (
      <ProgressWidget
        data={currentProgress}
        onChange={handleProgressChange}
        collapsed={collapsed.prize}
        onToggle={() => toggleCollapsed("prize")}
      />
    ),
    reminders: (
      <RemindersWidget
        key={`reminders-${periodKey}`}
        currentPeriod={clockPeriod}
        reminders={currentReminders}
        onRemindersChange={handleRemindersChange}
        collapsed={collapsed.reminders}
        names={currentNames}
        birthdays={currentBirthdays}
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
        names={currentNames}            onNamesChange={handleNamesChange}
        excludedNames={currentExcluded} onExcludedNamesChange={handleExcludedChange}
        birthdays={currentBirthdays}    onBirthdaysChange={handleBirthdaysChange}
        colors={currentColors}          onColorsChange={handleColorsChange}
        gems={currentGems}              onGemsChange={handleGemsChange}
        gemsLabel={currentGemsLabel}           onGemsLabelChange={handleGemsLabelChange}
        jobs={currentJobs}              onJobsChange={handleJobsChange}
        sortMode={currentSortMode}      onSortModeChange={handleSortModeChange}
        wheelColors={wheelTheme.wheelColors}
        otherPeriods={otherPeriodOptions}
        onDeleteClassList={handleDeleteClassList}
        periodLabel={displayPeriod?.label}
        layout={layout}
        onLayoutChange={handleLayoutChange}
      />
      <TileLayout
        layout={layout}
        onLayoutChange={handleLayoutChange}
        tiles={tiles}
        isCollapsed={id => collapsed[id] || false}
        onToggle={toggleCollapsed}
        tileNames={TILE_NAMES}
        swapMap={SWAP_MAP}
        onPageDrop={handlePageDrop}
        getTileDragPayload={getTileDragPayload}
        onDeleteTab={handleDeleteTab}
      />
    </div>
  );
}
