import { useState } from "react";
import "./NoteWidget.css";

const PAGE_COUNT = 3;
const DEFAULT_FONT = 20;

export default function NoteWidget({ notes = ["", "", ""], onNoteChange, periodLabel, collapsed, onToggle }) {
  const [activeTab, setActiveTab] = useState(0);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT);

  const currentText = notes[activeTab] ?? "";

  const prevPage = () => setActiveTab(t => (t - 1 + PAGE_COUNT) % PAGE_COUNT);
  const nextPage = () => setActiveTab(t => (t + 1) % PAGE_COUNT);

  return (
    <div className={`card note-widget card--header-bottom ${collapsed ? "card--collapsed" : ""}`} tabIndex={-1}>
      <div className="card-header">
        {!collapsed && (
          <div className="note-header-controls">
            <button className="btn btn-ghost btn-sm" onClick={() => setFontSize(f => Math.min(72, f + 4))} title="Larger text">A+</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setFontSize(f => Math.max(10, f - 4))} title="Smaller text">A−</button>
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
        <div className="note-page-nav">
          <button className="note-nav-btn" onClick={prevPage} onMouseDown={e => e.preventDefault()} title="Previous page" tabIndex={-1}>‹</button>
          <span className="note-page-indicator">{activeTab + 1}/{PAGE_COUNT}</span>
          <button className="note-nav-btn" onClick={nextPage} onMouseDown={e => e.preventDefault()} title="Next page" tabIndex={-1}>›</button>
        </div>
      </div>
    </div>
  );
}
