import { useState, useRef, useEffect } from "react";
import ScheduleEditor from "./ScheduleEditor";
import StudentList from "./StudentList";
import LayoutTool from "./LayoutTool";
import { THEMES, THEME_KEYS } from "../data/themes";
import { loadTeacherViewBounds, loadSeatingViewBounds } from "../data/teacherView";
import "./PeriodBar.css";

function collectData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith("classboard_")) continue;
    const v = localStorage.getItem(k);
    if (v !== null) try { data[k] = JSON.parse(v); } catch (_) { data[k] = v; }
  }
  return data;
}

function doExport() {
  const data = collectData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `classboard-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PeriodBar({
  schedules, onSchedulesChange,
  scheduleType, onScheduleTypeChange,
  scheduleDays, onScheduleDaysChange,
  periodNames, onPeriodNamesChange,
  currentPeriodIndex, nextPeriodIndex, onPeriodSelect,
  autoMode, onAutoModeChange,
  currentTheme, onThemeChange,
  onImport,
  names = [], onNamesChange,
  excludedNames = [], onExcludedNamesChange,
  birthdays = {}, onBirthdaysChange,
  colors = {}, onColorsChange,
  gems = {}, onGemsChange,
  gemsLabel = "Gems", onGemsLabelChange,
  jobs = {}, onJobsChange,
  wheelColors = [],
  otherPeriods = [], onDeleteClassList,
  periodLabel,
  textPaneStatus, textPaneActions,
  layout, onLayoutChange,
}) {
  const [editorOpen,    setEditorOpen]    = useState(false);
  const [studentsOpen,  setStudentsOpen]  = useState(false);
  const [layoutToolOpen, setLayoutToolOpen] = useState(false);
  const [visible,       setVisible]       = useState(false);
  const [isFullscreen,  setIsFullscreen]  = useState(false);
  const fileRef   = useRef(null);
  const hideTimer = useRef(null);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  const periods       = schedules[scheduleType] || [];
  const scheduleNames = Object.keys(schedules);

  const show = () => { clearTimeout(hideTimer.current); setVisible(true); };
  const scheduleHide = () => { hideTimer.current = setTimeout(() => setVisible(false), 300); };

  const openTeacherView = () => {
    const bounds = loadTeacherViewBounds();
    const width  = bounds?.width  || 380;
    const height = bounds?.height || 640;
    const left   = Number.isFinite(bounds?.left) ? bounds.left : window.screenX + window.outerWidth;
    const top    = Number.isFinite(bounds?.top)  ? bounds.top  : window.screenY;
    const url = new URL(window.location.href);
    url.searchParams.set("view", "teacher");
    url.searchParams.delete("s");
    const popup = window.open(url.toString(), "classboard-teacher-view", `width=${width},height=${height},left=${left},top=${top}`);
    popup?.focus();
  };

  const openSeatingView = () => {
    const bounds = loadSeatingViewBounds();
    const width  = bounds?.width  || 1000;
    const height = bounds?.height || 700;
    const left   = Number.isFinite(bounds?.left) ? bounds.left : window.screenX + 40;
    const top    = Number.isFinite(bounds?.top)  ? bounds.top  : window.screenY + 40;
    const url = new URL(window.location.href);
    url.searchParams.set("view", "seating");
    url.searchParams.delete("s");
    const popup = window.open(url.toString(), "classboard-seating-view", `width=${width},height=${height},left=${left},top=${top}`);
    popup?.focus();
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        Object.entries(data).forEach(([k, v]) => {
          if (!k.startsWith("classboard_") || v == null) return;
          localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
        });
        onImport?.();
      } catch (err) {
        alert("Could not read file: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  return (
    <>
      {/* Invisible hover zone at very top of screen */}
      <div className="toolbar-trigger" onMouseEnter={show} onMouseLeave={scheduleHide} />

      <div
        className={`period-toolbar${visible ? " period-toolbar--visible" : ""}`}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      >
        <div className="period-toolbar-row">
          {/* Schedule selector */}
          <select
            className="tb-select"
            value={scheduleType}
            onChange={e => onScheduleTypeChange(e.target.value)}
          >
            {scheduleNames.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <button
            className={`btn btn-sm tb-btn ${autoMode ? "btn-primary" : "btn-ghost"}`}
            onClick={() => onAutoModeChange(!autoMode)}
            title="Auto-detect period from time"
          >Auto</button>

          <button className="btn btn-ghost btn-sm tb-btn" onClick={() => setEditorOpen(true)}>Edit</button>
          <button className="btn btn-ghost btn-sm tb-btn" onClick={() => setLayoutToolOpen(true)} title="Show/hide panes, presets, and saved layouts">▦ Layout</button>

          <div className="tb-divider" />

          {/* Period buttons */}
          {periods.map((p, i) => {
            const isActive = i === currentPeriodIndex;
            const isNext   = !isActive && autoMode && currentPeriodIndex === -1 && i === nextPeriodIndex;
            return (
              <button
                key={p.id ?? `${p.label}-${i}`}
                className={`btn btn-sm period-btn ${isActive ? "period-btn-active" : isNext ? "period-btn-next" : "btn-ghost"}`}
                onClick={() => onPeriodSelect(i)}
                title={`${p.start}–${p.end}`}
              >
                {p.label}
              </button>
            );
          })}

          <div className="tb-divider" />

          {/* Theme picker — click dot to cycle */}
          <button
            className="tb-theme-dot"
            style={{ background: THEMES[currentTheme]?.swatch }}
            onClick={() => onThemeChange(THEME_KEYS[(THEME_KEYS.indexOf(currentTheme) + 1) % THEME_KEYS.length])}
            title={`Theme: ${THEMES[currentTheme]?.name} (click to cycle)`}
          />

          {/* Student list */}
          {onNamesChange && (
            <button className="btn btn-ghost btn-sm tb-btn" onClick={() => setStudentsOpen(true)} title="Edit the student list">
              👥 Students
            </button>
          )}

          {/* Seating chart — opens in its own popup window, like Teacher View */}
          <button className="btn btn-ghost btn-sm tb-btn" onClick={openSeatingView} title="Open the seating chart in its own window">⊞ Seats</button>

          {/* Teacher-only popup window, draggable to a second monitor */}
          <button className="btn btn-ghost btn-sm tb-btn" onClick={openTeacherView} title="Open a teacher-only window (drag it to another monitor)">
            🧑‍🏫 Teacher View
          </button>

          {/* Import / export — pinned right */}
          <button className="btn btn-ghost btn-sm tb-btn ei-btn" style={{ marginLeft: "auto" }} onClick={doExport} title="Export all data">↓ Export</button>
          <button className="btn btn-ghost btn-sm tb-btn ei-btn" onClick={() => fileRef.current.click()} title="Import data">↑ Import</button>
          <button
            className={`btn btn-sm tb-btn ${isFullscreen ? "btn-primary" : "btn-ghost"}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            style={{ fontSize: "1rem", padding: "0 8px" }}
          >⛶</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
        </div>

        {/* Text controls — a second row, acting on whichever pane last had focus */}
        {textPaneActions && (
          <div className="period-toolbar-row period-toolbar-textrow">
            <button className="btn btn-ghost btn-sm tb-btn" onMouseDown={e => { e.preventDefault(); textPaneActions.sizeUp(); }} title={textPaneStatus?.hasSelection ? "Larger selected text" : "Larger text"}>A+</button>
            <button className="btn btn-ghost btn-sm tb-btn" onMouseDown={e => { e.preventDefault(); textPaneActions.sizeDown(); }} title={textPaneStatus?.hasSelection ? "Smaller selected text" : "Smaller text"}>A−</button>
            <button className={`btn btn-sm tb-btn ${textPaneStatus?.isBold ? "btn-primary" : "btn-ghost"}`} onMouseDown={e => { e.preventDefault(); textPaneActions.bold(); }} title="Bold"><strong>B</strong></button>
            <button className={`btn btn-sm tb-btn ${textPaneStatus?.isItalic ? "btn-primary" : "btn-ghost"}`} onMouseDown={e => { e.preventDefault(); textPaneActions.italic(); }} title="Italic"><em>I</em></button>
            <button className={`btn btn-sm tb-btn ${textPaneStatus?.isBullet ? "btn-primary" : "btn-ghost"}`} onMouseDown={e => { e.preventDefault(); textPaneActions.bulletList(); }} title="Bullet list">•—</button>
            <button className={`btn btn-sm tb-btn ${textPaneStatus?.isNumbered ? "btn-primary" : "btn-ghost"}`} onMouseDown={e => { e.preventDefault(); textPaneActions.numberedList(); }} title="Numbered list">1.</button>
            <div className="tb-divider" />
            <button className="btn btn-ghost btn-sm tb-btn" onClick={textPaneActions.clear} title="Clear this page" style={{ color: "var(--danger)" }}>✕</button>
            <button className="btn btn-ghost btn-sm tb-btn" onClick={textPaneActions.addPage} title="Add a page">+</button>
            <button className="btn btn-ghost btn-sm tb-btn" onClick={textPaneActions.closePage} title="Close this page">🗑</button>
            <button
              className={`btn btn-sm tb-btn ${textPaneStatus?.isSynced ? "btn-primary" : "btn-ghost"}`}
              onClick={textPaneActions.openSync}
              title={textPaneStatus?.isSynced ? `This tab is synced with ${textPaneStatus.syncMates.join(", ")}` : "Sync this tab with another period"}
            >∞</button>
            <div className="tb-divider" />
            <label className="tb-scrolling-toggle" title="Scroll this page's text across the pane like a ticker">
              <input
                type="checkbox"
                checked={!!textPaneStatus?.isScrolling}
                onChange={textPaneActions.toggleScrolling}
              />
              Scrolling message
            </label>
          </div>
        )}
      </div>

      {editorOpen && (
        <ScheduleEditor
          schedules={schedules}
          onChange={onSchedulesChange}
          scheduleDays={scheduleDays}
          onScheduleDaysChange={onScheduleDaysChange}
          scheduleType={scheduleType}
          onScheduleTypeChange={onScheduleTypeChange}
          periodNames={periodNames}
          onPeriodNamesChange={onPeriodNamesChange}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {studentsOpen && (
        <StudentList
          names={names}
          onNamesChange={onNamesChange}
          excludedNames={excludedNames}
          onExcludedNamesChange={onExcludedNamesChange}
          birthdays={birthdays}
          onBirthdaysChange={onBirthdaysChange}
          colors={colors}
          onColorsChange={onColorsChange}
          gems={gems}
          onGemsChange={onGemsChange}
          gemsLabel={gemsLabel}
          onGemsLabelChange={onGemsLabelChange}
          jobs={jobs}
          onJobsChange={onJobsChange}
          wheelColors={wheelColors}
          otherPeriods={otherPeriods}
          onDeleteClassList={onDeleteClassList}
          periodLabel={periodLabel}
          onClose={() => setStudentsOpen(false)}
          simple
        />
      )}

      {layoutToolOpen && (
        <LayoutTool
          layout={layout}
          onLayoutChange={onLayoutChange}
          onClose={() => setLayoutToolOpen(false)}
        />
      )}
    </>
  );
}
