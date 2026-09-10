import { useState, useEffect, useRef, useContext } from "react";
import useIdleCaret from "../hooks/useIdleCaret";
import NoteSyncModal from "./NoteSyncModal";
import { makePage } from "../data/pages";
import { DragCtx, PAGE_DND_TYPE } from "./dragContext";
import "./TextPane.css";

// Short tab label derived from a page's content, browser-tab style.
function pageLabel(page, idx) {
  const text = (page.html || "").replace(/<[^>]+>/g, "").trim();
  if (text) return text.length > 14 ? text.slice(0, 14) + "…" : text;
  return `Page ${idx + 1}`;
}

// One kind of rich-text pane, used for both the Board and Notes tiles (and
// any pane detached from either) — there's no functional difference between
// them, so any tab can dock into any pane. `kind`/`defaultFontSize` only
// flavor the placeholder text and the font size a brand-new page starts at.
//
// The tab strip and formatting toolbar live outside the pane's own bordered
// box — above and below it — and collapse away to nothing when not hovered
// or focused, so the pane itself fills the tile when they're hidden.
export default function TextPane({
  pages, onPagesChange, paneId, periodLabel,
  kind = "Page", defaultFontSize = 24,
  allPeriodLabels = [], syncedWith = [], onSyncChange,
}) {
  const [activePageId, setActivePageId] = useState(pages[0]?.id ?? null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isBullet, setIsBullet] = useState(false);
  const [isNumbered, setIsNumbered] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const editorRef = useRef(null);
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
      const fontSize = Math.min(144, Math.max(10, activePage.fontSize + delta));
      onPagesChange(pages.map(p => (p.id === activePageId ? { ...p, fontSize } : p)));
    }
  };

  const handleClear = () => {
    if (!activePage) return;
    if (editorRef.current) editorRef.current.innerHTML = "";
    onPagesChange(pages.map(p => (p.id === activePageId ? { ...p, html: "" } : p)));
  };

  const addPage = () => {
    const page = makePage("", defaultFontSize);
    onPagesChange([...pages, page]);
    setActivePageId(page.id);
  };

  const closePage = (id) => onPagesChange(pages.filter(p => p.id !== id));

  // ── Drag-and-drop: reorder within this strip, detach to a new tile (via
  // TileLayout's edge drop zones), or merge a tab dragged in from elsewhere ──
  const onTabDragStart = (e, page) => {
    const info = { pageId: page.id, sourcePaneId: paneId };
    e.dataTransfer.setData(PAGE_DND_TYPE, JSON.stringify(info));
    e.dataTransfer.setData("text/plain", "");
    e.dataTransfer.effectAllowed = "move";
    // Set synchronously (unlike the tile-handle drag) so the other tiles'
    // drop overlays are guaranteed live before a fast real drag reaches them.
    dragCtx?.setDragging?.(page.id);
    dragCtx?.setPageDragOrigin?.(paneId);
  };
  const onTabDragEnd = () => {
    dragCtx?.setDragging?.(null);
    dragCtx?.setPageDragOrigin?.(null);
  };

  // Cross-pane drops are handled by the outer tile grid's drop overlay
  // (which merges into any other pane, or detaches a new tile elsewhere);
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
    <div className="textpane-wrap" tabIndex={-1}>
      <div className="textpane-tabstrip">
        {pages.map((p, i) => (
          <div
            key={p.id}
            className={`textpane-tab ${p.id === activePageId ? "textpane-tab--active" : ""}`}
            draggable
            onDragStart={e => onTabDragStart(e, p)}
            onDragEnd={onTabDragEnd}
            onDragOver={e => e.preventDefault()}
            onDrop={e => onTabDrop(e, i)}
            onClick={() => setActivePageId(p.id)}
            title="Drag to reorder, merge into another pane, or drop on a tile edge to pop out"
          >
            <span className="textpane-tab-label">{pageLabel(p, i)}</span>
            <button
              className="textpane-tab-close"
              onClick={e => { e.stopPropagation(); closePage(p.id); }}
              title="Close page"
            >×</button>
          </div>
        ))}
        <button className="textpane-tab-add" onClick={addPage} title="Add a page">+</button>
      </div>

      <div className="card textpane">
        <div className="card-body textpane-body">
          {activePage ? (
            <div
              ref={editorRef}
              className="textpane-textarea"
              contentEditable
              suppressContentEditableWarning
              onInput={saveContent}
              style={{ fontSize: `${activePage.fontSize}px` }}
              data-placeholder={`${kind}${periodLabel ? ` — ${periodLabel}` : ""}…`}
            />
          ) : (
            <div className="textpane-empty">
              <button className="btn btn-ghost btn-sm" onClick={addPage}>+ Add a page</button>
            </div>
          )}
        </div>
      </div>

      <div className="textpane-toolbar">
        <button className="btn btn-ghost btn-sm" onMouseDown={e => { e.preventDefault(); handleSizeBtn(4); }} title={hasSelection ? "Larger selected text" : "Larger text"}>A+</button>
        <button className="btn btn-ghost btn-sm" onMouseDown={e => { e.preventDefault(); handleSizeBtn(-4); }} title={hasSelection ? "Smaller selected text" : "Smaller text"}>A−</button>
        <div className="textpane-divider" />
        <button className={`btn btn-ghost btn-sm${isBold ? " textpane-btn-active" : ""}`} onMouseDown={e => { e.preventDefault(); execFormat("bold"); }} title="Bold"><strong>B</strong></button>
        <button className={`btn btn-ghost btn-sm${isItalic ? " textpane-btn-active" : ""}`} onMouseDown={e => { e.preventDefault(); execFormat("italic"); }} title="Italic"><em>I</em></button>
        <div className="textpane-divider" />
        <button className={`btn btn-ghost btn-sm${isBullet ? " textpane-btn-active" : ""}`} onMouseDown={e => { e.preventDefault(); execFormat("insertUnorderedList"); }} title="Bullet list">•—</button>
        <button className={`btn btn-ghost btn-sm${isNumbered ? " textpane-btn-active" : ""}`} onMouseDown={e => { e.preventDefault(); execFormat("insertOrderedList"); }} title="Numbered list">1.</button>
        <div className="textpane-divider" />
        <button className="btn btn-ghost btn-sm textpane-clear-btn" onClick={handleClear} title="Clear this page">✕</button>
        {onSyncChange && (
          <button
            className={`btn btn-ghost btn-sm textpane-sync-btn${syncedWith.length > 0 ? " textpane-btn-active" : ""}`}
            onClick={() => setSyncModalOpen(true)}
            onMouseDown={e => e.preventDefault()}
            title={syncedWith.length > 0 ? `Synced with ${syncedWith.join(", ")}` : "Sync with another period"}
          >∞</button>
        )}
      </div>

      {syncModalOpen && (
        <NoteSyncModal
          currentLabel={periodLabel}
          allLabels={allPeriodLabels}
          initialSelected={syncedWith}
          onSave={labels => { onSyncChange(labels); setSyncModalOpen(false); }}
          onClose={() => setSyncModalOpen(false)}
        />
      )}
    </div>
  );
}
