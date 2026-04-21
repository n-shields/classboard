import { useState, useRef } from "react";
import LZString from "lz-string";
import ScheduleEditor from "./ScheduleEditor";
import { THEMES, THEME_KEYS } from "../data/themes";
import "./PeriodBar.css";

const EXPORT_KEYS = [
  "classboard_schedules", "classboard_schedule_type",
  "classboard_schedule_days",
  "classboard_period_data", "classboard_global_theme",
  "classboard_period_layout", "classboard_layout",
  "classboard_period_layout_trees", "classboard_camera_settings",
];

function collectData() {
  const data = {};
  EXPORT_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) try { data[k] = JSON.parse(v); } catch (_) { data[k] = v; }
  });
  data.classboard_schedule_type = localStorage.getItem("classboard_schedule_type") || "Regular";
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

function encodeData(data) {
  return LZString.compressToEncodedURIComponent(JSON.stringify(data));
}

export default function PeriodBar({
  schedules, onSchedulesChange,
  scheduleType, onScheduleTypeChange,
  scheduleDays, onScheduleDaysChange,
  currentPeriodIndex, nextPeriodIndex, onPeriodSelect,
  autoMode, onAutoModeChange,
  currentTheme, onThemeChange,
  onImport,
  onOpenSeatingChart,
}) {
  const [editorOpen,  setEditorOpen]  = useState(false);
  const [visible,     setVisible]     = useState(false);
  const [linkCopied,  setLinkCopied]  = useState(false);
  const fileRef   = useRef(null);
  const hideTimer = useRef(null);

  const doShareLink = () => {
    try {
      const encoded = encodeData(collectData());
      const url = new URL(window.location.href);
      url.searchParams.set('s', encoded);
      navigator.clipboard.writeText(url.toString()).then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2500);
      });
    } catch (e) {
      alert('Could not copy link: ' + e.message);
    }
  };

  const periods       = schedules[scheduleType] || [];
  const scheduleNames = Object.keys(schedules);

  const show = () => { clearTimeout(hideTimer.current); setVisible(true); };
  const scheduleHide = () => { hideTimer.current = setTimeout(() => setVisible(false), 300); };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const strKeys  = ["classboard_schedule_type", "classboard_global_theme"];
        const jsonKeys = ["classboard_schedules", "classboard_schedule_days",
          "classboard_period_data", "classboard_period_layout", "classboard_layout"];
        strKeys.forEach(k  => { if (data[k] != null) localStorage.setItem(k, data[k]); });
        jsonKeys.forEach(k => { if (data[k] != null) localStorage.setItem(k, JSON.stringify(data[k])); });
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

        <div className="tb-divider" />

        {/* Period buttons */}
        {periods.map((p, i) => {
          const isActive = i === currentPeriodIndex;
          const isNext   = !isActive && autoMode && currentPeriodIndex === -1 && i === nextPeriodIndex;
          return (
            <button
              key={p.id}
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

        {/* Seating chart */}
        {onOpenSeatingChart && (
          <button className="btn btn-ghost btn-sm tb-btn" onClick={onOpenSeatingChart} title="Open seating chart">⊞ Seats</button>
        )}

        {/* Import / export / share — pinned right */}
        <button className="btn btn-ghost btn-sm tb-btn ei-btn" style={{ marginLeft: "auto" }} onClick={doExport} title="Export all data">↓ Export</button>
        <button className="btn btn-ghost btn-sm tb-btn ei-btn" onClick={() => fileRef.current.click()} title="Import data">↑ Import</button>
        <button
          className={`btn btn-sm tb-btn ei-btn ${linkCopied ? "btn-primary" : "btn-ghost"}`}
          onClick={doShareLink}
          title="Copy shareable link with all settings encoded"
        >{linkCopied ? "✓ Copied" : "↗ Share"}</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
      </div>

      {editorOpen && (
        <ScheduleEditor
          schedules={schedules}
          onChange={onSchedulesChange}
          scheduleDays={scheduleDays}
          onScheduleDaysChange={onScheduleDaysChange}
          scheduleType={scheduleType}
          onScheduleTypeChange={onScheduleTypeChange}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </>
  );
}
