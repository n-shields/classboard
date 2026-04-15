import { useState } from "react";
import "./NoteWidget.css";

const TAB_LABELS = ["1", "2", "3"];
const DEFAULT_FONT = 20;

export default function NoteWidget({ notes = ["", "", ""], onNoteChange, periodLabel, collapsed, onToggle }) {
  const [activeTab, setActiveTab] = useState(0);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT);

  const currentText = notes[activeTab] ?? "";

  return (
    <div className={`card note-widget ${collapsed ? "card--collapsed" : ""}`} tabIndex={-1}>
      <div className="card-header">
        <span className="header-toggle" onClick={onToggle}>
          <span className="header-chevron">{collapsed ? "▶" : "▼"}</span>Notes
        </span>
        {!collapsed && (
          <div className="note-header-controls">
            {TAB_LABELS.map((label, i) => (
              <button
                key={i}
                className={`btn btn-sm ${activeTab === i ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setActiveTab(i)}
                title={`Notes page ${label}`}
              >{label}</button>
            ))}
            <div className="note-divider" />
            <button className="btn btn-ghost btn-sm" onClick={() => setFontSize(f => Math.min(72, f + 4))} title="Larger text">A+</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setFontSize(f => Math.max(10, f - 4))} title="Smaller text">A-</button>
            <div className="note-divider" />
            <button className="btn btn-ghost btn-sm note-clear-btn" onClick={() => onNoteChange(activeTab, "")} title="Clear this page">✕</button>
          </div>
        )}
      </div>
      <div className="card-body note-body">
        <textarea
          className="note-textarea"
          value={currentText}
          onChange={e => onNoteChange(activeTab, e.target.value)}
          placeholder={`Notes ${activeTab + 1}${periodLabel ? ` — ${periodLabel}` : ""}…`}
          style={{ fontSize: `${fontSize}px`, lineHeight: 1.4 }}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
