import { useState, useEffect, useRef } from "react";
import useIdleCaret from "../hooks/useIdleCaret";
import NoteSyncModal from "./NoteSyncModal";
import { makePage } from "../data/pages";
import "./TextPane.css";

// One kind of rich-text pane, used for both the Board and Notes tiles (and
// any pane detached from either) — there's no functional difference between
// them, so any tab can dock into any pane. `kind`/`defaultFontSize` only
// flavor the placeholder text and the font size a brand-new page starts at.
//
// There's no tab strip — with more than one page, the toolbar shows a
// ‹ n/total › counter to step between them instead. Dragging a pane with
// multiple pages by its tile's own corner grip (see TileLayout) moves just
// the active page (to merge into another pane, or detach to a new tile);
// the toolbar itself is a normal, always-visible bar so the pane's content
// never resizes as the mouse enters or exits.
export default function TextPane({
  pages, onPagesChange, periodLabel,
  kind = "Page", defaultFontSize = 24,
  allPeriodLabels = [], pageSyncMates, onTabSyncChange, onActivePageChange,
}) {
  const [activePageId, setActivePageId] = useState(pages[0]?.id ?? null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isBullet, setIsBullet] = useState(false);
  const [isNumbered, setIsNumbered] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const editorRef = useRef(null);
  useIdleCaret(editorRef);

  // Keep the active tab pointed at a page that still exists (closed/merged away)
  useEffect(() => {
    if (!pages.some(p => p.id === activePageId)) setActivePageId(pages[0]?.id ?? null);
  }, [pages, activePageId]);

  // Report which page is active so the tile grid's drag handle knows which
  // one to move (see App's getTileDragPayload).
  useEffect(() => {
    if (activePageId) onActivePageChange?.(activePageId);
  }, [activePageId]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeIndex = pages.findIndex(p => p.id === activePageId);
  const activePage = activeIndex !== -1 ? pages[activeIndex] : null;
  const activeSyncMates = (activePageId && pageSyncMates?.(activePageId)) || [];

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

  const goToPage = (delta) => {
    if (activeIndex === -1) return;
    const next = pages[activeIndex + delta];
    if (next) setActivePageId(next.id);
  };

  return (
    <div className="textpane-wrap" tabIndex={-1}>
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
        <div className="textpane-divider" />

        {pages.length > 1 && (
          <div className="textpane-pagenav">
            <button className="btn btn-ghost btn-sm" onClick={() => goToPage(-1)} disabled={activeIndex <= 0} title="Previous page">‹</button>
            <span className="textpane-pagenav-count">{activeIndex + 1}/{pages.length}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => goToPage(1)} disabled={activeIndex === -1 || activeIndex >= pages.length - 1} title="Next page">›</button>
          </div>
        )}
        <button className="btn btn-ghost btn-sm" onClick={addPage} title="Add a page">+</button>
        {activePage && (
          <button className="btn btn-ghost btn-sm" onClick={() => closePage(activePageId)} title="Close this page">🗑</button>
        )}

        {onTabSyncChange && activePage && (
          <button
            className={`btn btn-ghost btn-sm textpane-sync-btn${activeSyncMates.length > 0 ? " textpane-btn-active" : ""}`}
            onClick={() => setSyncModalOpen(true)}
            title={activeSyncMates.length > 0 ? `This tab is synced with ${activeSyncMates.join(", ")}` : "Sync this tab with another period"}
          >∞</button>
        )}
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
              // A drag ending here (missing the tile's drop overlay, which
              // covers the whole slot but not always this exact target)
              // would otherwise fall through to the browser's default
              // contentEditable drop handling, which inserts the dragged
              // element's own text into the content. Suppress that; drops
              // are handled by the tile grid's drop overlay instead.
              onDragOver={e => e.preventDefault()}
              onDrop={e => e.preventDefault()}
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

      {syncModalOpen && activePage && (
        <NoteSyncModal
          currentLabel={periodLabel}
          allLabels={allPeriodLabels}
          initialSelected={activeSyncMates}
          onSave={labels => { onTabSyncChange(activePageId, labels); setSyncModalOpen(false); }}
          onClose={() => setSyncModalOpen(false)}
        />
      )}
    </div>
  );
}
