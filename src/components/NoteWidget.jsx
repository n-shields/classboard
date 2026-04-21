import { useState, useRef, useEffect } from "react";
import "./NoteWidget.css";

const PAGE_COUNT = 3;
const DEFAULT_FONT = 20;

export default function NoteWidget({ notes = ["", "", ""], onNoteChange, periodLabel, collapsed, onToggle, fontSizes: fontSizesProp, onFontSizesChange }) {
  const [activeTab, setActiveTab] = useState(0);
  const [localFontSizes, setLocalFontSizes] = useState(() => Array(PAGE_COUNT).fill(DEFAULT_FONT));
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const cardRef = useRef(null);

  const fontSizes = fontSizesProp ?? localFontSizes;
  const setFontSizes = (updater) => {
    const next = typeof updater === "function" ? updater(fontSizes) : updater;
    if (onFontSizesChange) onFontSizesChange(next);
    else setLocalFontSizes(next);
  };

  const currentText = notes[activeTab] ?? "";

  const prevPage = () => setActiveTab(t => (t - 1 + PAGE_COUNT) % PAGE_COUNT);
  const nextPage = () => setActiveTab(t => (t + 1) % PAGE_COUNT);

  useEffect(() => {
    const handler = (e) => {
      if (toolbarVisible && cardRef.current && !cardRef.current.contains(e.target)) {
        setToolbarVisible(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [toolbarVisible]);

  return (
    <div
      className={`card note-widget card--header-bottom ${collapsed ? "card--collapsed" : ""}`}
      ref={cardRef}
      onMouseDown={() => setToolbarVisible(true)}
      tabIndex={-1}
    >
      <div className="card-header">
        {!collapsed && toolbarVisible && (
          <div className="note-header-controls">
            <button className="btn btn-ghost btn-sm" onClick={() => setFontSizes(fs => fs.map((f, i) => i === activeTab ? Math.min(72, f + 4) : f))} title="Larger text">A+</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setFontSizes(fs => fs.map((f, i) => i === activeTab ? Math.max(10, f - 4) : f))} title="Smaller text">A−</button>
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
          style={{ fontSize: `${fontSizes[activeTab]}px`, lineHeight: 1.4 }}
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
