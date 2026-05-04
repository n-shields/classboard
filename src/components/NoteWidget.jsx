import { useState, useEffect, useRef } from "react";
import "./NoteWidget.css";

const PAGE_COUNT = 3;
const DEFAULT_FONT = 20;

export default function NoteWidget({ notes = ["", "", ""], onNoteChange, periodLabel, collapsed, onToggle, fontSizes: fontSizesProp, onFontSizesChange }) {
  const [activeTab, setActiveTab] = useState(0);
  const [localFontSizes, setLocalFontSizes] = useState(() => Array(PAGE_COUNT).fill(DEFAULT_FONT));
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isBullet, setIsBullet] = useState(false);
  const [isNumbered, setIsNumbered] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const cardRef = useRef(null);
  const editorRef = useRef(null);

  const fontSizes = fontSizesProp ?? localFontSizes;
  const setFontSizes = (updater) => {
    const next = typeof updater === "function" ? updater(fontSizes) : updater;
    if (onFontSizesChange) onFontSizesChange(next);
    else setLocalFontSizes(next);
  };

  const prevPage = () => setActiveTab(t => (t - 1 + PAGE_COUNT) % PAGE_COUNT);
  const nextPage = () => setActiveTab(t => (t + 1) % PAGE_COUNT);

  // Sync content on tab change; period changes remount via key in App
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = notes[activeTab] ?? "";
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

  useEffect(() => {
    const handler = (e) => {
      if (toolbarVisible && cardRef.current && !cardRef.current.contains(e.target)) {
        setToolbarVisible(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [toolbarVisible]);

  const saveContent = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const cleaned = html === "<br>" ? "" : html;
    if (cleaned === "" && html !== "") editorRef.current.innerHTML = "";
    onNoteChange(activeTab, cleaned);
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
      setFontSizes(fs => fs.map((f, i) => i === activeTab ? Math.min(72, Math.max(10, f + delta)) : f));
    }
  };

  const handleClear = () => {
    if (editorRef.current) editorRef.current.innerHTML = "";
    onNoteChange(activeTab, "");
  };

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
            <button className="btn btn-ghost btn-sm" onMouseDown={e => { e.preventDefault(); handleSizeBtn(4); }} title={hasSelection ? "Larger selected text" : "Larger text"}>A+</button>
            <button className="btn btn-ghost btn-sm" onMouseDown={e => { e.preventDefault(); handleSizeBtn(-4); }} title={hasSelection ? "Smaller selected text" : "Smaller text"}>A−</button>
            <div className="note-divider" />
            <button className={`btn btn-ghost btn-sm${isBold ? " note-btn-active" : ""}`} onMouseDown={e => { e.preventDefault(); execFormat("bold"); }} title="Bold"><strong>B</strong></button>
            <button className={`btn btn-ghost btn-sm${isItalic ? " note-btn-active" : ""}`} onMouseDown={e => { e.preventDefault(); execFormat("italic"); }} title="Italic"><em>I</em></button>
            <div className="note-divider" />
            <button className={`btn btn-ghost btn-sm${isBullet ? " note-btn-active" : ""}`} onMouseDown={e => { e.preventDefault(); execFormat("insertUnorderedList"); }} title="Bullet list">•—</button>
            <button className={`btn btn-ghost btn-sm${isNumbered ? " note-btn-active" : ""}`} onMouseDown={e => { e.preventDefault(); execFormat("insertOrderedList"); }} title="Numbered list">1.</button>
            <div className="note-divider" />
            <button className="btn btn-ghost btn-sm note-clear-btn" onClick={handleClear} title="Clear this page">✕</button>
          </div>
        )}
      </div>
      <div className="card-body note-body">
        <div
          ref={editorRef}
          className="note-textarea"
          contentEditable
          suppressContentEditableWarning
          onInput={saveContent}
          style={{ fontSize: `${fontSizes[activeTab]}px`, lineHeight: 1.4 }}
          data-placeholder={`Notes ${activeTab + 1}${periodLabel ? ` — ${periodLabel}` : ""}…`}
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
