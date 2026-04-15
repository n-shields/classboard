import { useState } from "react";
import "./TextBoard.css";

const TAB_LABELS = ["1", "2", "3"];

export default function TextBoard({ texts = ["", "", ""], onTextChange, periodLabel }) {
  const [activeTab, setActiveTab] = useState(0);
  const [fontSize, setFontSize] = useState(48);

  const currentText = texts[activeTab] ?? "";

  return (
    <div className="card textboard" tabIndex={-1}>
      <div className="textboard-sidebar">
        <div className="sidebar-label">
          {periodLabel ?? "Board"}
        </div>

        <div className="sidebar-section">
          {TAB_LABELS.map((label, i) => (
            <button
              key={i}
              className={`sidebar-btn ${activeTab === i ? "sidebar-btn-active" : ""}`}
              onClick={() => setActiveTab(i)}
              title={`Announcement ${label}`}
            >{label}</button>
          ))}
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-section">
          <button
            className="sidebar-btn"
            onClick={() => setFontSize(f => Math.min(144, f + 8))}
            title="Larger text"
          >A+</button>
          <button
            className="sidebar-btn"
            onClick={() => setFontSize(f => Math.max(16, f - 8))}
            title="Smaller text"
          >A-</button>
        </div>

        <div className="sidebar-divider" />

        <button
          className="sidebar-btn sidebar-btn-danger"
          onClick={() => onTextChange(activeTab, "")}
          title="Clear this tab"
        >✕</button>
      </div>

      <div className="textboard-content">
        <textarea
          className="textboard-textarea"
          value={currentText}
          onChange={e => onTextChange(activeTab, e.target.value)}
          placeholder={`Announcement ${activeTab + 1}${periodLabel ? ` — ${periodLabel}` : ""}…`}
          style={{ fontSize: `${fontSize}px`, lineHeight: 1.3 }}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
