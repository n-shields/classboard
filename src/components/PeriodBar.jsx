import { useState, useRef } from "react";
import ScheduleEditor from "./ScheduleEditor";
import { THEMES, THEME_KEYS } from "../data/themes";
import "./PeriodBar.css";

const SCHEDULE_TYPES = ["Normal", "Wednesday", "Half Day"];

const EXPORT_KEYS = [
  "classboard_schedules", "classboard_schedule_type",
  "classboard_schedule_days",
  "classboard_period_data", "classboard_global_theme",
  "classboard_period_layout",
];

function doExport() {
  const data = {};
  EXPORT_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) try { data[k] = JSON.parse(v); } catch (_) { data[k] = v; }
  });
  data.classboard_schedule_type = localStorage.getItem("classboard_schedule_type") || "Normal";
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
  currentPeriodIndex, nextPeriodIndex, onPeriodSelect,
  autoMode, onAutoModeChange,
  currentTheme, onThemeChange,
  onImport,
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const fileRef = useRef(null);
  const periods = schedules[scheduleType] || [];

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const strKeys = ["classboard_schedule_type", "classboard_global_theme"];
        const jsonKeys = ["classboard_schedules", "classboard_schedule_days", "classboard_period_data", "classboard_period_layout"];
        strKeys.forEach(k => { if (data[k] != null) localStorage.setItem(k, data[k]); });
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
    <div className="period-bar">
      {/* Far left: export / import */}
      <div className="ei-group">
        <button className="btn btn-ghost btn-sm ei-btn" onClick={doExport} title="Export all data to JSON">↓ Export</button>
        <button className="btn btn-ghost btn-sm ei-btn" onClick={() => fileRef.current.click()} title="Import data from JSON">↑ Import</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
      </div>

      {/* Schedule controls */}
      <div className="period-bar-left">
        <select className="schedule-select" value={scheduleType} onChange={e => onScheduleTypeChange(e.target.value)}>
          {SCHEDULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className={`btn btn-sm ${autoMode ? "btn-primary" : "btn-ghost"}`} onClick={() => onAutoModeChange(!autoMode)} title="Auto-detect period">Auto</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditorOpen(true)}>Edit Schedule</button>

        {/* Theme picker */}
        <div className="theme-picker">
          <div className="theme-swatch" style={{ background: THEMES[currentTheme]?.swatch }} title="Color theme" />
          <select
            className="schedule-select theme-select"
            value={currentTheme}
            onChange={e => onThemeChange(e.target.value)}
            title="Color theme"
          >
            {THEME_KEYS.map(k => <option key={k} value={k}>{THEMES[k].name}</option>)}
          </select>
        </div>
      </div>

      {/* Center: period buttons */}
      <div className="period-buttons">
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
      </div>

      {editorOpen && (
        <ScheduleEditor
          schedules={schedules} onChange={onSchedulesChange}
          scheduleDays={scheduleDays} onScheduleDaysChange={onScheduleDaysChange}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}
