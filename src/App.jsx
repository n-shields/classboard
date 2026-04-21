import { useState, useEffect, useCallback, useRef } from "react";
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
import { loadSchedules, saveSchedules, loadScheduleDays, saveScheduleDays, getScheduleForToday, detectCurrentPeriod, detectNextPeriod } from "./data/schedules";
import { THEMES, applyTheme } from "./data/themes";
import { loadLayout, saveLayout, validateLayout, DEFAULT_LAYOUT } from "./data/layout";
import "./App.css";

const PERIOD_DATA_KEY         = "classboard_period_data";
const PERIOD_LAYOUT_KEY       = "classboard_period_layout";
const PERIOD_LAYOUT_TREES_KEY = "classboard_period_layout_trees";

function loadPeriodLayoutTrees() {
  try { const s = localStorage.getItem(PERIOD_LAYOUT_TREES_KEY); if (s) return JSON.parse(s); } catch (_) {}
  return {};
}

const DEFAULT_COLLAPSED = { date: false, clock: false, notes: false, wheel: false, prize: false };
const TILE_NAMES = { date: "Clock", clock: "Timer", notes: "Notes", text: "Board", camera: "Camera", wheel: "Names", prize: "Goals" };
const DEFAULT_NAMES = ["Diego", "Sara", "Andre", "Lin"];

function loadPeriodData() {
  try {
    const s = localStorage.getItem(PERIOD_DATA_KEY);
    if (!s) return {};
    const data = JSON.parse(s);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
    // Sanitize each period entry so malformed data doesn't crash components
    for (const key of Object.keys(data)) {
      const p = data[key];
      if (typeof p !== "object" || p === null) { data[key] = {}; continue; }
      if (p.texts  && !Array.isArray(p.texts))          delete p.texts;
      if (p.notes  && !Array.isArray(p.notes))          delete p.notes;
      if (p.names  && !Array.isArray(p.names))          delete p.names;
      if (p.excludedNames && !Array.isArray(p.excludedNames)) delete p.excludedNames;
      if (p.textFontSizes && !Array.isArray(p.textFontSizes)) delete p.textFontSizes;
      if (p.noteFontSizes && !Array.isArray(p.noteFontSizes)) delete p.noteFontSizes;
    }
    return data;
  } catch (_) { return {}; }
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
  const [scheduleType, setScheduleType]     = useState(() => {
    const loaded = loadSchedules();
    const days   = loadScheduleDays();
    const candidate = getScheduleForToday(days) || loadScheduleType();
    // Fall back to first available schedule if stored value is stale/unrecognized
    return (candidate && candidate in loaded) ? candidate : (Object.keys(loaded)[0] ?? "Regular");
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
  const [clockFontSize, setClockFontSize] = useState("md");

  // Widget collapse state
  const [collapsed, setCollapsed] = useState({ ...DEFAULT_COLLAPSED });
  const toggleCollapsed = useCallback((key) => setCollapsed(c => ({ ...c, [key]: !c[key] })), []);

  // Theme
  const [globalTheme, setGlobalTheme] = useState(loadGlobalTheme);

  // Seating chart
  const [showSeatingChart, setShowSeatingChart] = useState(false);

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

  const currentTexts         = periodKey ? (periodData[periodKey]?.texts         ?? ["","",""]) : ["","",""];
  const currentNotes         = periodKey ? (periodData[periodKey]?.notes         ?? ["","",""]) : ["","",""];
  const currentNames         = periodKey ? (periodData[periodKey]?.names         ?? DEFAULT_NAMES) : DEFAULT_NAMES;
  const currentExcluded      = periodKey ? (periodData[periodKey]?.excludedNames  ?? [])          : [];
  const currentProgress      = periodKey ? (periodData[periodKey]?.progress      ?? null)        : null;
  const currentTextFontSizes = periodKey ? (periodData[periodKey]?.textFontSizes ?? [48, 48, 48]) : [48, 48, 48];
  const currentNoteFontSizes = periodKey ? (periodData[periodKey]?.noteFontSizes ?? [20, 20, 20]) : [20, 20, 20];

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
    const savedTree = periodLayoutTreesRef.current[periodKey];
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

  const handleNamesChange         = useCallback((names)         => savePeriod(periodKey, { names }),          [periodKey, savePeriod]);
  const handleExcludedChange      = useCallback((excludedNames) => savePeriod(periodKey, { excludedNames }), [periodKey, savePeriod]);
  const handleProgressChange      = useCallback((progress)      => savePeriod(periodKey, { progress }),      [periodKey, savePeriod]);
  const handleTextFontSizesChange = useCallback((textFontSizes) => savePeriod(periodKey, { textFontSizes }), [periodKey, savePeriod]);
  const handleNoteFontSizesChange = useCallback((noteFontSizes) => savePeriod(periodKey, { noteFontSizes }), [periodKey, savePeriod]);

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
      <TextBoard
        texts={currentTexts}
        onTextChange={handleTextChange}
        periodLabel={displayPeriod?.label}
        fontSizes={currentTextFontSizes}
        onFontSizesChange={handleTextFontSizesChange}
      />
    ),
    camera: showSeatingChart ? (
      <SeatingChart
        names={currentNames}
        periodLabel={displayPeriod?.label}
        periodKey={periodKey}
        onClose={() => setShowSeatingChart(false)}
      />
    ) : (
      <CameraFeed
        periodKey={periodKey}
        clockDisplay={clockDisplay}
        clockFontSize={clockFontSize}
      />
    ),
    notes: (
      <NoteWidget
        notes={currentNotes}
        onNoteChange={handleNoteChange}
        periodLabel={displayPeriod?.label}
        collapsed={collapsed.notes}
        onToggle={() => toggleCollapsed("notes")}
        fontSizes={currentNoteFontSizes}
        onFontSizesChange={handleNoteFontSizesChange}
      />
    ),
    wheel: (
      <WheelOfNames
        names={currentNames}
        onNamesChange={handleNamesChange}
        excludedNames={currentExcluded}
        onExcludedNamesChange={handleExcludedChange}
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
        onOpenSeatingChart={() => setShowSeatingChart(true)}
      />
      <TileLayout
        layout={layout}
        onLayoutChange={handleLayoutChange}
        tiles={tiles}
        isCollapsed={id => collapsed[id] || false}
        onToggle={id => { if (id in DEFAULT_COLLAPSED) toggleCollapsed(id); }}
        tileNames={TILE_NAMES}
      />
    </div>
  );
}
