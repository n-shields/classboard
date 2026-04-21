import { useState } from "react";
import "./TextBoard.css";

const PAGE_COUNT = 3;
const DEFAULT_FONT = 48;

export default function TextBoard({ texts = ["", "", ""], onTextChange, periodLabel, fontSizes: fontSizesProp, onFontSizesChange }) {
  const [activeTab, setActiveTab] = useState(0);
  const [localFontSizes, setLocalFontSizes] = useState(() => Array(PAGE_COUNT).fill(DEFAULT_FONT));

  const fontSizes = fontSizesProp ?? localFontSizes;
  const setFontSizes = (updater) => {
    const next = typeof updater === "function" ? updater(fontSizes) : updater;
    if (onFontSizesChange) onFontSizesChange(next);
    else setLocalFontSizes(next);
  };

  const currentText = texts[activeTab] ?? "";
  const prevPage = () => setActiveTab(t => (t - 1 + PAGE_COUNT) % PAGE_COUNT);
  const nextPage = () => setActiveTab(t => (t + 1) % PAGE_COUNT);

  return (
    <div className="card textboard" tabIndex={-1}>
      <div className="textboard-content">
        <textarea
          className="textboard-textarea"
          value={currentText}
          onChange={e => onTextChange(activeTab, e.target.value)}
          placeholder={`Announcement ${activeTab + 1}${periodLabel ? ` — ${periodLabel}` : ""}…`}
          style={{ fontSize: `${fontSizes[activeTab]}px`, lineHeight: 1.3 }}
          spellCheck={false}
        />
        <div className="textboard-page-nav">
          <button className="textboard-nav-btn" onClick={prevPage} onMouseDown={e => e.preventDefault()} title="Previous page" tabIndex={-1}>‹</button>
          <span className="textboard-page-indicator">{activeTab + 1}/{PAGE_COUNT}</span>
          <button className="textboard-nav-btn" onClick={nextPage} onMouseDown={e => e.preventDefault()} title="Next page" tabIndex={-1}>›</button>
        </div>
      </div>

      <div className="textboard-sidebar">
        <div className="sidebar-label">
          {periodLabel ?? "Board"}
        </div>

        <div className="sidebar-section">
          <button
            className="sidebar-btn"
            onClick={() => setFontSizes(fs => fs.map((f, i) => i === activeTab ? Math.min(144, f + 8) : f))}
            title="Larger text"
          >A+</button>
          <button
            className="sidebar-btn"
            onClick={() => setFontSizes(fs => fs.map((f, i) => i === activeTab ? Math.max(16, f - 8) : f))}
            title="Smaller text"
          >A-</button>
        </div>

      </div>
    </div>
  );
}
