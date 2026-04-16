import { useState, useRef } from "react";
import ScheduleEditor from "./ScheduleEditor";
import { THEMES, THEME_KEYS } from "../data/themes";
import "./PeriodBar.css";

const EXPORT_KEYS = [
  "classboard_schedules", "classboard_schedule_type",
  "classboard_schedule_days",
  "classboard_period_data", "classboard_global_theme",
  "classboard_period_layout", "classboard_layout",
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
  collapsed, onToggle,
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const fileRef = useRef(null);
  const periods = schedules[scheduleType] || [];
  const scheduleNames = Object.keys(schedules);

  const addSchedule = () => {
    let name = "New Schedule";
    let i = 2;
    while (scheduleNames.includes(name)) name = `New Schedule ${i++}`;
    const newSchedules = {
      ...schedules,
      [name]: [{ id: 1, label: "Period 1", start: "08:00", end: "09:00" }],
    };
    onSchedulesChange(newSchedules);
    onScheduleTypeChange(name);
    setEditorOpen(true);
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const strKeys = ["classboard_schedule_type", "classboard_global_theme"];
        const jsonKeys = ["classboard_schedules", "classboard_schedule_days",
          "classboard_period_data", "classboard_period_layout", "classboard_layout"];
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
    <div className={`card period-bar-card ${collapsed ? "card--collapsed" : ""}`} tabIndex={-1}>
      <div className="card-header" onClick={onToggle}>
        <span className="header-toggle">
          <span className="header-chevron">{collapsed ? "▶" : "▼"}</span>
          {scheduleType}
        </span>
        {collapsed && (() => {
          const p = currentPeriodIndex >= 0 ? periods[currentPeriodIndex]
                  : nextPeriodIndex >= 0   ? periods[nextPeriodIndex]
                  : null;
          return p ? <span className="pb-active-label">{p.label}</span> : null;
        })()}
      </div>

      <div className="card-body pb-body">
        {/* Controls row */}
        <div className="pb-controls">
          <select
            className="schedule-select"
            value={scheduleType}
            onChange={e => onScheduleTypeChange(e.target.value)}
          >
            {scheduleNames.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <button className="btn btn-ghost btn-sm" onClick={addSchedule} title="Add new schedule">+</button>

          <button
            className={`btn btn-sm ${autoMode ? "btn-primary" : "btn-ghost"}`}
            onClick={() => onAutoModeChange(!autoMode)}
            title="Auto-detect period from time"
          >Auto</button>

          <button className="btn btn-ghost btn-sm" onClick={() => setEditorOpen(true)}>Edit</button>

          <div className="theme-picker">
            <div className="theme-swatch" style={{ background: THEMES[currentTheme]?.swatch }} />
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

        {/* Period buttons */}
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

        {/* Import / export — pinned to bottom */}
        <div className="pb-footer">
          <button className="btn btn-ghost btn-sm ei-btn" onClick={doExport} title="Export all data">↓ Export</button>
          <button className="btn btn-ghost btn-sm ei-btn" onClick={() => fileRef.current.click()} title="Import data">↑ Import</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
        </div>
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
    </div>
  );
}
