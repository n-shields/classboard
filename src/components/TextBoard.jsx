import { useState, useEffect, useRef, useContext } from "react";
import useIdleCaret from "../hooks/useIdleCaret";
import { makePage } from "../data/pages";
import { DragCtx, PAGE_DND_TYPE } from "./dragContext";
import "./TextBoard.css";

const DEFAULT_FONT = 48;
const PANE_TYPE = "text";

// Short tab label derived from a page's content, browser-tab style.
function pageLabel(page, idx) {
  const text = (page.html || "").replace(/<[^>]+>/g, "").trim();
  if (text) return text.length > 14 ? text.slice(0, 14) + "…" : text;
  return `Page ${idx + 1}`;
}

export default function TextBoard({ pages, onPagesChange, paneId = "text", periodLabel }) {
  const [activePageId, setActivePageId] = useState(pages[0]?.id ?? null);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isBullet, setIsBullet] = useState(false);
  const [isNumbered, setIsNumbered] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const editorRef = useRef();
  const dragCtx = useContext(DragCtx);
  useIdleCaret(editorRef);

  // Keep the active tab pointed at a page that still exists (closed/merged away)
  useEffect(() => {
    if (!pages.some(p => p.id === activePageId)) setActivePageId(pages[0]?.id ?? null);
  }, [pages, activePageId]);

  const activePage = pages.find(p => p.id === activePageId) ?? null;

  // Sync content on tab change; period changes remount this component via key in App
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = activePage?.html ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId]);

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
    if (!editorRef.current || !activePage) return;
    const html = editorRef.current.innerHTML;
    const cleaned = html === "<br>" ? "" : html;
    if (cleaned === "" && html !== "") editorRef.current.innerHTML = "";
    onPagesChange(pages.map(p => (p.id === activePageId ? { ...p, html: cleaned } : p)));
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
    } else if (activePage) {
      const fontSize = Math.min(144, Math.max(16, activePage.fontSize + delta));
      onPagesChange(pages.map(p => (p.id === activePageId ? { ...p, fontSize } : p)));
    }
  };

  const addPage = () => {
    const page = makePage("", DEFAULT_FONT);
    onPagesChange([...pages, page]);
    setActivePageId(page.id);
  };

  const closePage = (id) => onPagesChange(pages.filter(p => p.id !== id));

  // ── Drag-and-drop: reorder within this strip, detach to a new tile (via
  // TileLayout's edge drop zones), or merge a tab dragged in from elsewhere ──
  const onTabDragStart = (e, page) => {
    const info = { paneType: PANE_TYPE, pageId: page.id, sourcePaneId: paneId };
    e.dataTransfer.setData(PAGE_DND_TYPE, JSON.stringify(info));
    e.dataTransfer.setData("text/plain", "");
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => {
      dragCtx?.setDragging?.(page.id);
      dragCtx?.setPageDragOrigin?.(paneId);
    }, 0);
  };
  const onTabDragEnd = () => {
    dragCtx?.setDragging?.(null);
    dragCtx?.setPageDragOrigin?.(null);
  };

  // Cross-pane drops are handled by the outer tile grid's drop overlay
  // (which merges into a Board/Notes pane, or detaches a new tile elsewhere);
  // this only reorders a tab within its own strip.
  const onTabDrop = (e, targetIdx) => {
    e.preventDefault();
    e.stopPropagation();
    const json = e.dataTransfer.getData(PAGE_DND_TYPE);
    const info = json ? JSON.parse(json) : null;
    if (info?.sourcePaneId === paneId) {
      const from = pages.findIndex(p => p.id === info.pageId);
      if (from !== -1 && from !== targetIdx) {
        const reordered = pages.slice();
        const [moved] = reordered.splice(from, 1);
        reordered.splice(from < targetIdx ? targetIdx - 1 : targetIdx, 0, moved);
        onPagesChange(reordered);
      }
    }
    onTabDragEnd();
  };

  return (
    <div className="card textboard" tabIndex={-1}>
      <div className="textboard-content">
        <div className="textboard-tabstrip">
          {pages.map((p, i) => (
            <div
              key={p.id}
              className={`textboard-tab ${p.id === activePageId ? "textboard-tab--active" : ""}`}
              draggable
              onDragStart={e => onTabDragStart(e, p)}
              onDragEnd={onTabDragEnd}
              onDragOver={e => e.preventDefault()}
              onDrop={e => onTabDrop(e, i)}
              onClick={() => setActivePageId(p.id)}
              title="Drag to reorder, merge into another pane, or drop on a tile edge to pop out"
            >
              <span className="textboard-tab-label">{pageLabel(p, i)}</span>
              <button
                className="textboard-tab-close"
                onClick={e => { e.stopPropagation(); closePage(p.id); }}
                title="Close page"
              >×</button>
            </div>
          ))}
          <button className="textboard-tab-add" onClick={addPage} title="Add a page">+</button>
        </div>

        {activePage ? (
          <div
            ref={editorRef}
            className="textboard-textarea"
            contentEditable
            suppressContentEditableWarning
            onInput={saveContent}
            style={{ fontSize: `${activePage.fontSize}px`, lineHeight: 1.3 }}
            data-placeholder={`Announcement${periodLabel ? ` — ${periodLabel}` : ""}…`}
          />
        ) : (
          <div className="textboard-empty">
            <button className="btn btn-ghost btn-sm" onClick={addPage}>+ Add a page</button>
          </div>
        )}
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
