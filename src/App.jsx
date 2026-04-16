import { useState, useEffect, useCallback, useRef } from "react";
import TextBoard from "./components/TextBoard";
import ClockWidget from "./components/ClockWidget";
import PeriodBar from "./components/PeriodBar";
import CameraFeed from "./components/CameraFeed";
import WheelOfNames from "./components/WheelOfNames";
import ProgressWidget from "./components/ProgressWidget";
import NoteWidget from "./components/NoteWidget";
import TileLayout from "./components/TileLayout";
import { loadSchedules, saveSchedules, loadScheduleDays, saveScheduleDays, getScheduleForToday, detectCurrentPeriod, detectNextPeriod } from "./data/schedules";
import { THEMES, applyTheme } from "./data/themes";
import { loadLayout, saveLayout } from "./data/layout";
import "./App.css";

const PERIOD_DATA_KEY   = "classboard_period_data";
const PERIOD_LAYOUT_KEY = "classboard_period_layout";

const DEFAULT_COLLAPSED = { clock: false, notes: false, wheel: false, prize: false };

function loadPeriodData() {
  try { const s = localStorage.getItem(PERIOD_DATA_KEY); if (s) return JSON.parse(s); } catch (_) {}
  return {};
}
function loadScheduleType() {
  return localStorage.getItem("classboard_schedule_type") || "Normal";
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
  const [scheduleType, setScheduleType]     = useState(() => {
    const days = loadScheduleDays();
    return getScheduleForToday(days) || loadScheduleType();
  });
  const [periodData, setPeriodData]         = useState(loadPeriodData);
  const [currentPeriodIndex, setCurrentPeriodIndex] = useState(-1);
  const [nextPeriodIndex, setNextPeriodIndex]       = useState(-1);
  const [autoMode, setAutoMode]             = useState(true);

  // Clock always tracks real time regardless of manual period selection
  const [clockPeriodIndex, setClockPeriodIndex]         = useState(-1);
  const [clockNextPeriodIndex, setClockNextPeriodIndex] = useState(-1);

  // Clock display string (mirrors whatever ClockWidget is showing)
  const [clockDisplay, setClockDisplay] = useState("");

  // Widget collapse state
  const [collapsed, setCollapsed] = useState({ ...DEFAULT_COLLAPSED });
  const toggleCollapsed = useCallback((key) => setCollapsed(c => ({ ...c, [key]: !c[key] })), []);

  // Theme
  const [globalTheme, setGlobalTheme] = useState(loadGlobalTheme);

  // Layout tree
  const [layout, setLayout] = useState(loadLayout);

  const layoutsRef      = useRef(loadLayouts());
  const justSwitchedRef = useRef(false);

  const periods = schedules[scheduleType] || [];
  const currentPeriod = currentPeriodIndex >= 0 ? periods[currentPeriodIndex] : null;
  const nextPeriod    = nextPeriodIndex    >= 0 ? periods[nextPeriodIndex]    : null;
  // Fall back to period 0 when nothing is active and nothing is upcoming
  const displayPeriod = currentPeriod || nextPeriod || (periods.length > 0 ? periods[0] : null);
  const periodKey     = displayPeriod ? displayPeriod.label : null;

  // Clock always uses auto-detected period
  const clockPeriod     = clockPeriodIndex     >= 0 ? periods[clockPeriodIndex]     : null;
  const clockNextPeriod = clockNextPeriodIndex >= 0 ? periods[clockNextPeriodIndex] : null;

  const currentTexts    = periodKey ? (periodData[periodKey]?.texts    ?? ["","",""]) : ["","",""];
  const currentNotes    = periodKey ? (periodData[periodKey]?.notes    ?? ["","",""]) : ["","",""];
  const currentNames    = periodKey ? (periodData[periodKey]?.names    ?? [])          : [];
  const currentProgress = periodKey ? (periodData[periodKey]?.progress ?? null)        : null;

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
    if (typeof updater === "function") {
      setLayout(prev => {
        const next = updater(prev);
        saveLayout(next);
        return next;
      });
    } else {
      setLayout(updater);
      saveLayout(updater);
    }
  }, []);

  // ── Data persistence ─────────────────────────────────────────────────────
  const savePeriod = useCallback((key, patch) => {
    if (!key) return;
    setPeriodData(d => {
      const next = { ...d, [key]: { ...d[key], ...patch } };
      localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleTextChange = useCallback((tabIdx, text) => {
    if (!periodKey) return;
    setPeriodData(d => {
      const existing = d[periodKey]?.texts ?? ["","",""];
      const texts = [...existing]; texts[tabIdx] = text;
      const next = { ...d, [periodKey]: { ...d[periodKey], texts } };
      localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
      return next;
    });
  }, [periodKey]);

  const handleNoteChange = useCallback((tabIdx, text) => {
    if (!periodKey) return;
    setPeriodData(d => {
      const existing = d[periodKey]?.notes ?? ["","",""];
      const notes = [...existing]; notes[tabIdx] = text;
      const next = { ...d, [periodKey]: { ...d[periodKey], notes } };
      localStorage.setItem(PERIOD_DATA_KEY, JSON.stringify(next));
      return next;
    });
  }, [periodKey]);

  const handleNamesChange    = useCallback((names)    => savePeriod(periodKey, { names }),    [periodKey, savePeriod]);
  const handleProgressChange = useCallback((progress) => savePeriod(periodKey, { progress }), [periodKey, savePeriod]);

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

  const handleSchedulesChange = useCallback((s) => { setSchedules(s); saveSchedules(s); }, []);
  const handleScheduleDaysChange = useCallback((d) => { setScheduleDays(d); saveScheduleDays(d); }, []);

  // ── Tile content map ─────────────────────────────────────────────────────
  const wheelTheme = THEMES[currentTheme] || THEMES.midnight;

  const tiles = {
    clock: (
      <ClockWidget
        currentPeriod={clockPeriod}
        nextPeriod={clockNextPeriod}
        collapsed={collapsed.clock}
        onToggle={() => toggleCollapsed("clock")}
        onDisplayChange={setClockDisplay}
      />
    ),
    text: (
      <TextBoard
        texts={currentTexts}
        onTextChange={handleTextChange}
        periodLabel={displayPeriod?.label}
      />
    ),
    camera: (
      <CameraFeed
        periodKey={periodKey}
        clockDisplay={clockDisplay}
      />
    ),
    notes: (
      <NoteWidget
        notes={currentNotes}
        onNoteChange={handleNoteChange}
        periodLabel={displayPeriod?.label}
        collapsed={collapsed.notes}
        onToggle={() => toggleCollapsed("notes")}
      />
    ),
    wheel: (
      <WheelOfNames
        names={currentNames}
        onNamesChange={handleNamesChange}
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
  };

  return (
    <div className="app">
      <PeriodBar
        schedules={schedules}           onSchedulesChange={handleSchedulesChange}
        scheduleType={scheduleType}     onScheduleTypeChange={handleScheduleTypeChange}
        scheduleDays={scheduleDays}     onScheduleDaysChange={handleScheduleDaysChange}
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
      />
      <TileLayout
        layout={layout}
        onLayoutChange={handleLayoutChange}
        tiles={tiles}
        isCollapsed={id => collapsed[id] || false}
      />
    </div>
  );
}
