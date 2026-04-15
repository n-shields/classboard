import { useState, useEffect, useCallback, useRef } from "react";
import TextBoard from "./components/TextBoard";
import ClockWidget from "./components/ClockWidget";
import PeriodBar from "./components/PeriodBar";
import CameraFeed from "./components/CameraFeed";
import WheelOfNames from "./components/WheelOfNames";
import ProgressWidget from "./components/ProgressWidget";
import NoteWidget from "./components/NoteWidget";
import { loadSchedules, saveSchedules, loadScheduleDays, saveScheduleDays, getScheduleForToday, detectCurrentPeriod, detectNextPeriod } from "./data/schedules";
import { THEMES, applyTheme } from "./data/themes";
import "./App.css";

const PERIOD_DATA_KEY   = "classboard_period_data";
const PERIOD_LAYOUT_KEY = "classboard_period_layout";
// Notes above wheel
const RESIZABLE_RIGHT = ["notes", "wheel", "prize"];

const DEFAULT_COLLAPSED = { clock: false, notes: false, wheel: false, prize: false };
const DEFAULT_RW        = { notes: 40, wheel: 30, prize: 30 };

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

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

  // Widget collapse state
  const [collapsed, setCollapsed] = useState({ ...DEFAULT_COLLAPSED });
  const toggleCollapsed = useCallback((key) => setCollapsed(c => ({ ...c, [key]: !c[key] })), []);

  // Theme
  const [globalTheme, setGlobalTheme] = useState(loadGlobalTheme);

  // Layout
  const [colSplit, setColSplit] = useState(78);   // left col width %
  const [leftRow,  setLeftRow]  = useState(22);   // TextBoard height % in left col
  // Right col resizable panel flex weights (clock excluded — it's fixed height)
  const [rW, setRW] = useState({ ...DEFAULT_RW });

  const colsRef           = useRef(null);
  const leftColRef        = useRef(null);
  const rightResizableRef = useRef(null);

  // Per-period layout persistence
  const layoutsRef       = useRef(loadLayouts());
  const justSwitchedRef  = useRef(false);

  const periods = schedules[scheduleType] || [];
  const currentPeriod = currentPeriodIndex >= 0 ? periods[currentPeriodIndex] : null;
  const nextPeriod    = nextPeriodIndex    >= 0 ? periods[nextPeriodIndex]    : null;
  // Between periods: show the upcoming period's workspace so it can be prepped
  const displayPeriod = currentPeriod || nextPeriod;
  const periodKey     = displayPeriod ? displayPeriod.label : null;
  // Clock always uses auto-detected period
  const clockPeriod     = clockPeriodIndex     >= 0 ? periods[clockPeriodIndex]     : null;
  const clockNextPeriod = clockNextPeriodIndex >= 0 ? periods[clockNextPeriodIndex] : null;

  const currentTexts    = periodKey ? (periodData[periodKey]?.texts    ?? ["","",""]) : ["","",""];
  const currentNotes    = periodKey ? (periodData[periodKey]?.notes    ?? ["","",""]) : ["","",""];
  const currentNames    = periodKey ? (periodData[periodKey]?.names    ?? [])          : [];
  const currentProgress = periodKey ? (periodData[periodKey]?.progress ?? null)        : null;

  // Per-period theme overrides global
  const periodTheme = periodKey ? periodData[periodKey]?.theme : null;
  const currentTheme = periodTheme || globalTheme;

  // Apply theme whenever it changes
  useEffect(() => { applyTheme(currentTheme); }, [currentTheme]);

  // ── Schedule auto-selection: re-check day of week every minute ───────────
  // This catches midnight rollovers and fixes stale saved schedule types
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

  // ── Period detection ──────────────────────────────────────────────────────
  // Clock period: always follows real time, never overridden by manual selection
  useEffect(() => {
    const detect = () => {
      setClockPeriodIndex(detectCurrentPeriod(periods));
      setClockNextPeriodIndex(detectNextPeriod(periods));
    };
    detect();
    const id = setInterval(detect, 30_000);
    return () => clearInterval(id);
  }, [periods]);

  // Content period: follows real time only when autoMode is on
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

  // ── Per-period layout: restore when period changes ────────────────────────
  useEffect(() => {
    if (!periodKey) return;
    justSwitchedRef.current = true;
    const saved = layoutsRef.current[periodKey];
    if (saved) {
      setCollapsed(saved.collapsed ?? { ...DEFAULT_COLLAPSED });
      setLeftRow(saved.leftRow ?? 22);
      setRW(saved.rW ?? { ...DEFAULT_RW });
      if (saved.colSplit != null) setColSplit(saved.colSplit);
    } else {
      setCollapsed({ ...DEFAULT_COLLAPSED });
      setLeftRow(22);
      setRW({ ...DEFAULT_RW });
    }
  }, [periodKey]);

  // ── Per-period layout: save when layout changes (skip right after restore) ─
  useEffect(() => {
    if (!periodKey) return;
    if (justSwitchedRef.current) {
      justSwitchedRef.current = false;
      return;
    }
    layoutsRef.current = {
      ...layoutsRef.current,
      [periodKey]: { collapsed, leftRow, rW, colSplit },
    };
    localStorage.setItem(PERIOD_LAYOUT_KEY, JSON.stringify(layoutsRef.current));
  }, [periodKey, collapsed, leftRow, rW, colSplit]);

  // ── Data persistence ──────────────────────────────────────────────────────
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

  const handleScheduleTypeChange = (type) => {
    setScheduleType(type);
    localStorage.setItem("classboard_schedule_type", type);
  };

  const handleSchedulesChange = useCallback((s) => { setSchedules(s); saveSchedules(s); }, []);
  const handleScheduleDaysChange = useCallback((d) => { setScheduleDays(d); saveScheduleDays(d); }, []);

  // ── Drag helpers ──────────────────────────────────────────────────────────
  const makeDrag = (getRect, onMove) => (e) => {
    e.preventDefault();
    const rect = getRect();
    const move = (ev) => onMove(ev, rect);
    const up   = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  const dragCol = useCallback(makeDrag(
    () => colsRef.current.getBoundingClientRect(),
    (e, r) => setColSplit(clamp((e.clientX - r.left) / r.width * 100, 10, 90)),
  ), []);

  const dragLeftRow = useCallback(makeDrag(
    () => leftColRef.current.getBoundingClientRect(),
    (e, r) => setLeftRow(clamp((e.clientY - r.top) / r.height * 100, 5, 95)),
  ), []);

  const dragRight = useCallback((topKey, bottomKey) => makeDrag(
    () => rightResizableRef.current.getBoundingClientRect(),
    (e, r) => {
      const H = r.height;
      const totalVis = RESIZABLE_RIGHT.reduce((s, k) => s + (collapsed[k] ? 0 : rW[k]), 0);
      const aboveH = RESIZABLE_RIGHT.slice(0, RESIZABLE_RIGHT.indexOf(topKey))
        .reduce((s, k) => s + (collapsed[k] ? 0 : H * rW[k] / totalVis), 0);
      const tbH = H * (rW[topKey] + rW[bottomKey]) / totalVis;
      const tbTotal = rW[topKey] + rW[bottomKey];
      const y = clamp(e.clientY - r.top - aboveH, 5, tbH - 5);
      const newTop = tbTotal * y / tbH;
      setRW(w => ({ ...w, [topKey]: Math.max(1, newTop), [bottomKey]: Math.max(1, tbTotal - newTop) }));
    },
  ), [rW, collapsed]);

  // ── Right column panels ───────────────────────────────────────────────────
  const wheelTheme = THEMES[currentTheme] || THEMES.midnight;
  const resizableContent = {
    notes: <NoteWidget notes={currentNotes} onNoteChange={handleNoteChange} periodLabel={displayPeriod?.label} collapsed={collapsed.notes} onToggle={() => toggleCollapsed("notes")} />,
    wheel: <WheelOfNames names={currentNames} onNamesChange={handleNamesChange} periodLabel={displayPeriod?.label} collapsed={collapsed.wheel} onToggle={() => toggleCollapsed("wheel")} wheelColors={wheelTheme.wheelColors} wheelText={wheelTheme.wheelText} />,
    prize: <ProgressWidget data={currentProgress} onChange={handleProgressChange} collapsed={collapsed.prize} onToggle={() => toggleCollapsed("prize")} />,
  };

  return (
    <div className="app">
      <PeriodBar
        schedules={schedules} onSchedulesChange={handleSchedulesChange}
        scheduleType={scheduleType} onScheduleTypeChange={handleScheduleTypeChange}
        scheduleDays={scheduleDays} onScheduleDaysChange={handleScheduleDaysChange}
        currentPeriodIndex={currentPeriodIndex} nextPeriodIndex={nextPeriodIndex}
        onPeriodSelect={idx => { setCurrentPeriodIndex(idx); setNextPeriodIndex(detectNextPeriod(periods)); setAutoMode(false); }}
        autoMode={autoMode} onAutoModeChange={setAutoMode}
        currentTheme={currentTheme} onThemeChange={handleThemeChange}
        onImport={() => window.location.reload()}
      />

      <div className="columns" ref={colsRef}>
        {/* ── Left column ── */}
        <div className="col" ref={leftColRef} style={{ width: `${colSplit}%` }}>
          <div className="panel" style={{ flex: leftRow }}>
            <TextBoard texts={currentTexts} onTextChange={handleTextChange} periodLabel={displayPeriod?.label} />
          </div>
          <div className="drag drag-h" onMouseDown={dragLeftRow} />
          <div className="panel" style={{ flex: Math.max(5, 100 - leftRow) }}>
            <CameraFeed periodKey={periodKey} />
          </div>
        </div>

        <div className="drag drag-v" onMouseDown={dragCol} />

        {/* ── Right column ── */}
        <div className="col col-flex">
          {/* Clock: fixed height, not resizable; always uses real-time period */}
          <div className="panel" style={{ flex: "0 0 auto" }}>
            <ClockWidget currentPeriod={clockPeriod} nextPeriod={clockNextPeriod} collapsed={collapsed.clock} onToggle={() => toggleCollapsed("clock")} />
          </div>

          {/* Resizable panels */}
          <div className="right-resizable" ref={rightResizableRef}>
            {RESIZABLE_RIGHT.map((key, i) => {
              const prevKey = i > 0 ? RESIZABLE_RIGHT[i - 1] : null;
              const showDrag = prevKey && !collapsed[prevKey] && !collapsed[key];
              return (
                <div key={key} style={{ display: "contents" }}>
                  {showDrag && (
                    <div className="drag drag-h" onMouseDown={dragRight(prevKey, key)} />
                  )}
                  <div className="panel" style={collapsed[key] ? { flex: "0 0 auto" } : { flex: rW[key] }}>
                    {resizableContent[key]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
