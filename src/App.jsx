import { useState, useEffect, useCallback, useRef } from "react";
import TextBoard from "./components/TextBoard";
import ClockWidget from "./components/ClockWidget";
import PeriodBar from "./components/PeriodBar";
import CameraFeed from "./components/CameraFeed";
import WheelOfNames from "./components/WheelOfNames";
import ProgressWidget from "./components/ProgressWidget";
import ExportImport from "./components/ExportImport";
import { loadSchedules, saveSchedules, detectCurrentPeriod, detectNextPeriod } from "./data/schedules";
import { applyTheme } from "./data/themes";
import "./App.css";

const PERIOD_DATA_KEY = "classboard_period_data";
const PANEL_ORDER = ["clock", "wheel", "prize"];

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

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function App() {
  const [schedules, setSchedules]           = useState(loadSchedules);
  const [scheduleType, setScheduleType]     = useState(loadScheduleType);
  const [periodData, setPeriodData]         = useState(loadPeriodData);
  const [currentPeriodIndex, setCurrentPeriodIndex] = useState(-1);
  const [nextPeriodIndex, setNextPeriodIndex]       = useState(-1);
  const [autoMode, setAutoMode]             = useState(true);

  // Widget collapse state
  const [collapsed, setCollapsed] = useState({ clock: false, wheel: false, prize: false });
  const toggleCollapsed = useCallback((key) => setCollapsed(c => ({ ...c, [key]: !c[key] })), []);

  // Theme
  const [globalTheme, setGlobalTheme] = useState(loadGlobalTheme);

  // Layout
  const [colSplit, setColSplit] = useState(78);   // left col width %
  const [leftRow,  setLeftRow]  = useState(22);   // TextBoard height % in left col
  // Right col: flex weights (proportional, ~= %)
  const [rW, setRW] = useState({ clock: 30, wheel: 44, prize: 26 });

  const colsRef    = useRef(null);
  const leftColRef = useRef(null);
  const rightColRef = useRef(null);

  const periods = schedules[scheduleType] || [];
  const currentPeriod = currentPeriodIndex >= 0 ? periods[currentPeriodIndex] : null;
  const nextPeriod    = nextPeriodIndex    >= 0 ? periods[nextPeriodIndex]    : null;
  const periodKey     = currentPeriod ? String(currentPeriod.id) : null;

  const currentTexts    = periodKey ? (periodData[periodKey]?.texts    ?? ["","",""]) : ["","",""];
  const currentNames    = periodKey ? (periodData[periodKey]?.names    ?? [])          : [];
  const currentProgress = periodKey ? (periodData[periodKey]?.progress ?? null)        : null;

  // Per-period theme overrides global
  const periodTheme = periodKey ? periodData[periodKey]?.theme : null;
  const currentTheme = periodTheme || globalTheme;

  // Apply theme whenever it changes
  useEffect(() => { applyTheme(currentTheme); }, [currentTheme]);

  // ── Period detection ────────────────────────────────────────────────────────
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

  // ── Data persistence ────────────────────────────────────────────────────────
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

  // ── Drag helpers ─────────────────────────────────────────────────────────────
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

  // Right column: drag between any two adjacent visible panels.
  // topKey / bottomKey are the panels above and below the divider being dragged.
  const dragRight = useCallback((topKey, bottomKey) => makeDrag(
    () => rightColRef.current.getBoundingClientRect(),
    (e, r) => {
      const H = r.height;
      const totalVis = PANEL_ORDER.reduce((s, k) => s + (collapsed[k] ? 0 : rW[k]), 0);
      // Height consumed by panels ABOVE topKey
      const aboveH = PANEL_ORDER.slice(0, PANEL_ORDER.indexOf(topKey))
        .reduce((s, k) => s + (collapsed[k] ? 0 : H * rW[k] / totalVis), 0);
      // Combined height of top+bottom panels
      const tbH = H * (rW[topKey] + rW[bottomKey]) / totalVis;
      const tbTotal = rW[topKey] + rW[bottomKey];
      const y = clamp(e.clientY - r.top - aboveH, 5, tbH - 5);
      const newTop = tbTotal * y / tbH;
      setRW(w => ({ ...w, [topKey]: Math.max(1, newTop), [bottomKey]: Math.max(1, tbTotal - newTop) }));
    },
  ), [rW, collapsed]);

  // ── Right column panels ───────────────────────────────────────────────────
  const panelContent = {
    clock: <ClockWidget currentPeriod={currentPeriod} nextPeriod={nextPeriod} collapsed={collapsed.clock} onToggle={() => toggleCollapsed("clock")} />,
    wheel: <WheelOfNames names={currentNames} onNamesChange={handleNamesChange} periodLabel={currentPeriod?.label} collapsed={collapsed.wheel} onToggle={() => toggleCollapsed("wheel")} />,
    prize: <ProgressWidget data={currentProgress} onChange={handleProgressChange} collapsed={collapsed.prize} onToggle={() => toggleCollapsed("prize")} />,
  };

  return (
    <div className="app">
      <PeriodBar
        schedules={schedules} onSchedulesChange={handleSchedulesChange}
        scheduleType={scheduleType} onScheduleTypeChange={handleScheduleTypeChange}
        currentPeriodIndex={currentPeriodIndex}
        onPeriodSelect={idx => { setCurrentPeriodIndex(idx); setNextPeriodIndex(detectNextPeriod(periods)); setAutoMode(false); }}
        autoMode={autoMode} onAutoModeChange={setAutoMode}
        currentTheme={currentTheme} onThemeChange={handleThemeChange}
      />

      <div className="columns" ref={colsRef}>
        {/* ── Left column ── */}
        <div className="col" ref={leftColRef} style={{ width: `${colSplit}%` }}>
          <div className="panel" style={{ flex: leftRow }}>
            <TextBoard texts={currentTexts} onTextChange={handleTextChange} periodLabel={currentPeriod?.label} />
          </div>
          <div className="drag drag-h" onMouseDown={dragLeftRow} />
          <div className="panel panel-flex">
            <CameraFeed />
          </div>
        </div>

        <div className="drag drag-v" onMouseDown={dragCol} />

        {/* ── Right column ── */}
        <div className="col col-flex" ref={rightColRef}>
          {PANEL_ORDER.map((key, i) => {
            const prevKey = i > 0 ? PANEL_ORDER[i - 1] : null;
            const showDrag = prevKey && !collapsed[prevKey] && !collapsed[key];
            return (
              <div key={key} style={{ display: "contents" }}>
                {showDrag && (
                  <div className="drag drag-h" onMouseDown={dragRight(prevKey, key)} />
                )}
                <div className="panel" style={collapsed[key] ? { flex: "0 0 auto" } : { flex: rW[key] }}>
                  {panelContent[key]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ExportImport onImport={() => window.location.reload()} />
    </div>
  );
}
