import { useState } from "react";
import ScheduleEditor from "./ScheduleEditor";
import WarningMeter from "./WarningMeter";
import { THEMES, THEME_KEYS } from "../data/themes";
import "./PeriodBar.css";

const SCHEDULE_TYPES = ["Normal", "Wednesday", "Half Day"];

export default function PeriodBar({
  schedules, onSchedulesChange,
  scheduleType, onScheduleTypeChange,
  currentPeriodIndex, onPeriodSelect,
  autoMode, onAutoModeChange,
  currentTheme, onThemeChange,
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const periods = schedules[scheduleType] || [];

  return (
    <div className="period-bar">
      {/* Left: schedule controls */}
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
        {periods.map((p, i) => (
          <button
            key={p.id}
            className={`btn btn-sm period-btn ${i === currentPeriodIndex ? "period-btn-active" : "btn-ghost"}`}
            onClick={() => onPeriodSelect(i)}
            title={`${p.label}: ${p.start}–${p.end}`}
          >
            {p.id === "L" ? "Lunch" : `P${p.id}`}
          </button>
        ))}
      </div>

      <WarningMeter />

      {editorOpen && (
        <ScheduleEditor schedules={schedules} onChange={onSchedulesChange} onClose={() => setEditorOpen(false)} />
      )}
    </div>
  );
}
