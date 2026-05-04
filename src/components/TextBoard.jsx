import { useState, useEffect, useRef } from "react";
import "./TextBoard.css";

const PAGE_COUNT = 3;
const DEFAULT_FONT = 48;

export default function TextBoard({ texts = ["", "", ""], onTextChange, periodLabel, fontSizes: fontSizesProp, onFontSizesChange }) {
  const [activeTab, setActiveTab] = useState(0);
  const [localFontSizes, setLocalFontSizes] = useState(() => Array(PAGE_COUNT).fill(DEFAULT_FONT));
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isBullet, setIsBullet] = useState(false);
  const [isNumbered, setIsNumbered] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const editorRef = useRef();

  const fontSizes = fontSizesProp ?? localFontSizes;
  const setFontSizes = (updater) => {
    const next = typeof updater === "function" ? updater(fontSizes) : updater;
    if (onFontSizesChange) onFontSizesChange(next);
    else setLocalFontSizes(next);
  };

  // Sync content on tab change; period changes remount this component via key in App
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = texts[activeTab] ?? "";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Track selection state for conditional formatting
  useEffect(() => {
    const update = () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !editorRef.current) return;
      if (!editorRef.current.contains(sel.anchorNode)) return;
      setHasSelection(!sel.isCollapsed);
      setIsBold(document.queryCommandState("bold"));
      setIsItalic(document.queryCommandState("italic"));
      setIsBullet(document.queryCommandState("insertUnorderedList"));
      setIsNumbered(document.queryCommandState("insertOrderedList"));
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  const saveContent = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const cleaned = html === "<br>" ? "" : html;
    if (cleaned === "" && html !== "") editorRef.current.innerHTML = "";
    onTextChange(activeTab, cleaned);
  };

  const execFormat = (cmd) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, null);
    saveContent();
  };

  const changeSizeForSelection = (delta) => {
    editorRef.current?.focus();
    document.execCommand("fontSize", false, "7");
    const newSpans = [];
    editorRef.current.querySelectorAll('font[size="7"]').forEach(el => {
      const size = parseFloat(window.getComputedStyle(el.parentElement).fontSize);
      const span = document.createElement("span");
      span.style.fontSize = `${Math.max(10, Math.min(200, Math.round(size + delta)))}px`;
      span.innerHTML = el.innerHTML;
      el.replaceWith(span);
      newSpans.push(span);
    });
    if (newSpans.length > 0) {
      const range = document.createRange();
      range.setStartBefore(newSpans[0]);
      range.setEndAfter(newSpans[newSpans.length - 1]);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    saveContent();
  };

  const handleSizeBtn = (delta) => {
    if (hasSelection) {
      changeSizeForSelection(delta);
    } else {
      setFontSizes(fs => fs.map((f, i) => i === activeTab ? Math.min(144, Math.max(16, f + delta)) : f));
    }
  };

  const prevPage = () => setActiveTab(t => (t - 1 + PAGE_COUNT) % PAGE_COUNT);
  const nextPage = () => setActiveTab(t => (t + 1) % PAGE_COUNT);

  return (
    <div className="card textboard" tabIndex={-1}>
      <div className="textboard-content">
        <div
          ref={editorRef}
          className="textboard-textarea"
          contentEditable
          suppressContentEditableWarning
          onInput={saveContent}
          style={{ fontSize: `${fontSizes[activeTab]}px`, lineHeight: 1.3 }}
          data-placeholder={`Announcement ${activeTab + 1}${periodLabel ? ` — ${periodLabel}` : ""}…`}
        />
        <div className="textboard-page-nav">
          <button className="textboard-nav-btn" onClick={prevPage} onMouseDown={e => e.preventDefault()} title="Previous page" tabIndex={-1}>‹</button>
          <span className="textboard-page-indicator">{activeTab + 1}/{PAGE_COUNT}</span>
          <button className="textboard-nav-btn" onClick={nextPage} onMouseDown={e => e.preventDefault()} title="Next page" tabIndex={-1}>›</button>
        </div>
      </div>

      <div className="textboard-sidebar">
        <div className="sidebar-label">{periodLabel ?? "Board"}</div>

        <div className="sidebar-section">
          <button
            className="sidebar-btn"
            onMouseDown={e => { e.preventDefault(); handleSizeBtn(8); }}
            title={hasSelection ? "Larger selected text" : "Larger text"}
          >A+</button>
          <button
            className="sidebar-btn"
            onMouseDown={e => { e.preventDefault(); handleSizeBtn(-8); }}
            title={hasSelection ? "Smaller selected text" : "Smaller text"}
          >A−</button>
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-section">
          <button
            className={`sidebar-btn${isBold ? " sidebar-btn-active" : ""}`}
            onMouseDown={e => { e.preventDefault(); execFormat("bold"); }}
            title="Bold"
          ><strong>B</strong></button>
          <button
            className={`sidebar-btn${isItalic ? " sidebar-btn-active" : ""}`}
            onMouseDown={e => { e.preventDefault(); execFormat("italic"); }}
            title="Italic"
          ><em>I</em></button>
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-section">
          <button
            className={`sidebar-btn${isBullet ? " sidebar-btn-active" : ""}`}
            onMouseDown={e => { e.preventDefault(); execFormat("insertUnorderedList"); }}
            title="Bullet list"
          >•—</button>
          <button
            className={`sidebar-btn${isNumbered ? " sidebar-btn-active" : ""}`}
            onMouseDown={e => { e.preventDefault(); execFormat("insertOrderedList"); }}
            title="Numbered list"
          >1.</button>
        </div>
      </div>
    </div>
  );
}
