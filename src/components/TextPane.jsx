import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import useIdleCaret from "../hooks/useIdleCaret";
import NoteSyncModal from "./NoteSyncModal";
import { makePage } from "../data/pages";
import "./TextPane.css";

// One kind of rich-text pane, used for both the Board and Notes tiles (and
// any pane detached from either) — there's no functional difference between
// them, so any tab can dock into any pane.
//
// The pane owns its formatting/page controls directly: hovering (or
// focusing) it slides a small toolbar out below the pane by default, or
// above it if the pane sits flush against the bottom of the layout
// (nothing below it to slide into) — so the toolbar never covers the
// pane's own content. It's portaled to <body> and positioned from the
// pane's live bounding rect, since the tile grid clips anything that
// overflows a tile's own box. Only small ‹ › page-nav arrows, shown when
// there's more than one page, live inside the pane itself, pinned to the
// bottom so they don't take up layout space. Dragging a multi-page pane by
// its tile's own corner grip (see TileLayout) moves just the active page,
// not the whole tab set.
const HOVER_HIDE_DELAY_MS = 250;

// CSS's own definition of a physical unit: 96px per inch, 2.54cm per inch —
// the same ratio the browser itself uses for e.g. `width: 1cm`, regardless
// of the screen's actual DPI (which JS can't reliably read anyway).
const CSS_PX_PER_CM = 96 / 2.54;
const SCROLL_SPEED_CM_PER_SEC = 1;

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
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [toolbarPlacement, setToolbarPlacement] = useState("below"); // "above" | "below" | "overlay"
  const [anchorRect, setAnchorRect] = useState(null);
  const editorRef = useRef(null);
  const wrapRef = useRef(null);
  const hideTimerRef = useRef(null);
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
  const isScrolling = !!activePage?.scrolling;

  // Sync content on tab change; period changes remount this component via key in App
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = activePage?.html ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId]);

  // Pick up edits to this same page arriving from elsewhere — another open
  // window (they sync through localStorage + the "storage" event almost
  // instantly, see App's reload effect), or a sync'd tab in another period —
  // while never touching the DOM if this pane is the one actually being
  // typed into right now, which would yank the caret out from under the
  // person typing.
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !activePage || document.activeElement === el) return;
    const html = activePage.html ?? "";
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [activePage?.html]); // eslint-disable-line react-hooks/exhaustive-deps

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
    applyMarqueeDistance();
  };

  // The marquee travels from fully off-screen right to fully off-screen
  // left — the clipping wrapper's width plus the text's own rendered width
  // (scrollWidth, free since white-space:nowrap + a content-sized box
  // already give us the unclipped width) — rather than a fixed 2x container
  // width. That fixed-distance version only worked for text shorter than
  // the pane: longer text never finished exiting before the loop reset,
  // reading as a stall/pause once it reached the left edge. Width comes
  // from the wrapper (.textpane-marquee-clip), not the editable element
  // itself — in scrolling mode the editable is content-sized (as wide as
  // its text) so it can be positioned by transform, so its own clientWidth
  // no longer means "the pane's visible width".
  const lastMarqueeMeasureRef = useRef(null);
  const applyMarqueeDistance = () => {
    const el = editorRef.current;
    if (!el || !activePage?.scrolling) return;
    const containerWidth = el.parentElement?.clientWidth ?? 0;
    const textWidth = el.scrollWidth;
    if (!containerWidth) return;
    // Reassigning animation-duration (or the --marquee-from/to it derives
    // from) while the animation is already running can make the browser
    // reset/jump its current position, even when the new values are
    // identical to what's already applied — this fires on every keystroke
    // (via saveContent) and on every ResizeObserver callback (which can
    // report spuriously, e.g. once on initial .observe()), so skip the
    // reassignment entirely unless the measured width actually changed.
    const last = lastMarqueeMeasureRef.current;
    if (last && last.containerWidth === containerWidth && last.textWidth === textWidth) return;
    lastMarqueeMeasureRef.current = { containerWidth, textWidth };
    const distancePx = containerWidth + textWidth;
    const seconds = distancePx / (CSS_PX_PER_CM * SCROLL_SPEED_CM_PER_SEC);
    el.style.setProperty("--marquee-from", `${containerWidth}px`);
    el.style.setProperty("--marquee-to", `${-textWidth}px`);
    el.style.animationDuration = `${seconds}s`;
  };

  const execFormat = (cmd, value = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    saveContent();
  };

  // A native color input's own click steals focus (and, in some browsers,
  // the selection) away from the contentEditable before its picker dialog
  // even opens — so the selection has to be captured up front, on mousedown,
  // and restored just before the command runs in onChange.
  const savedRangeRef = useRef(null);
  const captureSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };
  const execBackColor = (color) => {
    editorRef.current?.focus();
    if (savedRangeRef.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
      savedRangeRef.current = null; // one-shot — a plain button click (no picker dialog in the way) never needs a restore, so a stale range must never linger for it to pick up
    }
    document.execCommand("hiliteColor", false, color);
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
      // A bullet/number marker's size follows its own <li>'s font-size, not
      // its (resized) text content's — without this a resized list item's
      // marker stays at the old size while its text visibly changes.
      const li = span.closest("li");
      if (li) li.style.fontSize = span.style.fontSize;
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

  // direction is +1 (larger) or -1 (smaller); selected text still steps by
  // a flat few px, but the whole page's base size steps by 1% of its
  // current size instead — proportional across the page's whole practical
  // range (20px Notes text vs. 48px Board text), where a flat step would
  // feel too coarse at the small end and too fine at the large end. A
  // literal 1% rounds to 0px below ~100px, so it's floored at 1px so every
  // click still moves it somewhere.
  const adjustFontSize = (direction) => {
    if (hasSelection) {
      changeSizeForSelection(direction * 4);
    } else if (activePage) {
      const step = Math.max(1, Math.round(activePage.fontSize * 0.01));
      const fontSize = Math.min(144, Math.max(10, activePage.fontSize + direction * step));
      onPagesChange(pages.map(p => (p.id === activePageId ? { ...p, fontSize } : p)));
    }
  };

  const clear = () => {
    if (!activePage) return;
    if (editorRef.current) editorRef.current.innerHTML = "";
    onPagesChange(pages.map(p => (p.id === activePageId ? { ...p, html: "" } : p)));
  };

  // The pane's own background, as opposed to execBackColor's text highlight —
  // per page, like fontSize, so switching tabs can carry its own color.
  const setBgColor = (color) => {
    if (!activePage) return;
    onPagesChange(pages.map(p => (p.id === activePageId ? { ...p, bgColor: color } : p)));
  };
  const clearBgColor = () => setBgColor(undefined);

  const addPage = () => {
    const page = makePage("", defaultFontSize);
    onPagesChange([...pages, page]);
    setActivePageId(page.id);
  };

  const goToPage = (delta) => {
    if (activeIndex === -1) return;
    const next = pages[activeIndex + delta];
    if (next) setActivePageId(next.id);
  };

  const toggleScrolling = () => {
    if (!activePage) return;
    onPagesChange(pages.map(p => (p.id === activePageId ? { ...p, scrolling: !p.scrolling } : p)));
  };

  // ── Floating toolbar: shows on hover/focus, slides out of whichever edge
  // has room. Portaled to <body> since the tile grid clips any child that
  // overflows its own tile — position is computed from the pane's live rect.
  // A pane spanning the layout's full height has no room on EITHER edge, so
  // that case gets its own "overlay" placement: docked to the bottom of the
  // pane itself (sliding up over its own content) instead of trying to slot
  // into a gap that doesn't exist.
  const updateAnchor = () => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const root = el.closest(".tl-root");
    const rootRect = root ? root.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const touchesTop    = rect.top - rootRect.top <= 4;
    const touchesBottom = rootRect.bottom - rect.bottom <= 4;
    setToolbarPlacement(touchesTop && touchesBottom ? "overlay" : touchesBottom ? "above" : "below");
    setAnchorRect({ left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width });
  };

  const showToolbar = () => {
    clearTimeout(hideTimerRef.current);
    updateAnchor();
    setToolbarVisible(true);
  };
  const scheduleHideToolbar = () => {
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setToolbarVisible(false), HOVER_HIDE_DELAY_MS);
  };

  // Keep the floating toolbar aligned while visible — the pane can resize
  // (split-handle drag) or the window can resize while it's up.
  useEffect(() => {
    if (!toolbarVisible) return;
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    const ro = new ResizeObserver(updateAnchor);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => { window.removeEventListener("resize", updateAnchor); ro.disconnect(); };
  }, [toolbarVisible]);

  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  // Recalibrate the marquee's distance/duration (see applyMarqueeDistance)
  // whenever scrolling turns on, the page changes, or the pane itself
  // resizes — saveContent already recalculates on every edit, so content
  // changes don't need to be a dependency here too.
  useEffect(() => {
    if (!isScrolling) return;
    const el = editorRef.current;
    if (!el?.parentElement) return;
    applyMarqueeDistance();
    // The clipping wrapper (not the now content-sized editable element) is
    // what reports the pane's actual visible width.
    const ro = new ResizeObserver(applyMarqueeDistance);
    ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [isScrolling, activePageId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="textpane-wrap"
      tabIndex={-1}
      ref={wrapRef}
      onMouseEnter={showToolbar}
      onMouseLeave={scheduleHideToolbar}
      onFocusCapture={showToolbar}
      onBlurCapture={scheduleHideToolbar}
    >
      <div className="card textpane" style={activePage?.bgColor ? { background: activePage.bgColor } : undefined}>
        <div className="card-body textpane-body">
          {activePage ? (
            // In scrolling mode this wrapper does the actual clipping and
            // stays put — text-indent used to be the whole marquee, but it
            // forces a layout recalc every frame and visibly jitters/stalls
            // under load. transform is compositor-only and smooth, but it
            // moves an element's clip region right along with it, so it
            // can't animate the same overflow:hidden box that's doing the
            // clipping — it needs a separate, stationary clipping parent
            // around a content-sized (not clipped) child instead. Outside
            // scrolling mode this is `display: contents` (see CSS), i.e.
            // invisible to layout, so normal editing is untouched by its
            // presence. Its onMouseDown re-focuses the editable child on
            // click regardless of where the (transformed, possibly moved
            // away from the click point) text currently is.
            <div
              className={`textpane-marquee-clip${isScrolling ? " textpane-marquee-clip--active" : ""}`}
              onMouseDown={isScrolling ? e => { e.preventDefault(); editorRef.current?.focus(); } : undefined}
            >
              <div
                ref={editorRef}
                className={`textpane-textarea${isScrolling ? " textpane-textarea--scrolling" : ""}`}
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
            </div>
          ) : (
            <div className="textpane-empty">
              <button className="btn btn-ghost btn-sm" onClick={addPage}>+ Add a page</button>
            </div>
          )}
        </div>

        {pages.length > 1 && (
          <div className="textpane-pagenav">
            <button className="textpane-pagenav-btn" onClick={() => goToPage(-1)} disabled={activeIndex <= 0} title="Previous page">‹</button>
            <span className="textpane-pagenav-count">{activeIndex + 1}/{pages.length}</span>
            <button className="textpane-pagenav-btn" onClick={() => goToPage(1)} disabled={activeIndex === -1 || activeIndex >= pages.length - 1} title="Next page">›</button>
          </div>
        )}
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

      {toolbarVisible && activePage && anchorRect && createPortal(
        <div
          className={`textpane-toolbar textpane-toolbar--${toolbarPlacement} textpane-toolbar--visible`}
          style={{
            left: anchorRect.left,
            width: anchorRect.width,
            ...(toolbarPlacement === "below" ? { top: anchorRect.bottom }
              : toolbarPlacement === "overlay" ? { bottom: window.innerHeight - anchorRect.bottom }
              : { bottom: window.innerHeight - anchorRect.top }),
          }}
          onMouseEnter={showToolbar}
          onMouseLeave={scheduleHideToolbar}
        >
          <button className="btn btn-ghost btn-sm textpane-toolbar-btn" onMouseDown={e => { e.preventDefault(); adjustFontSize(1); }} title={hasSelection ? "Larger selected text" : "Larger text (1%)"}>A+</button>
          <button className="btn btn-ghost btn-sm textpane-toolbar-btn" onMouseDown={e => { e.preventDefault(); adjustFontSize(-1); }} title={hasSelection ? "Smaller selected text" : "Smaller text (1%)"}>A−</button>
          <button className={`btn btn-sm textpane-toolbar-btn ${isBold ? "btn-primary" : "btn-ghost"}`} onMouseDown={e => { e.preventDefault(); execFormat("bold"); }} title="Bold"><strong>B</strong></button>
          <button className={`btn btn-sm textpane-toolbar-btn ${isItalic ? "btn-primary" : "btn-ghost"}`} onMouseDown={e => { e.preventDefault(); execFormat("italic"); }} title="Italic"><em>I</em></button>
          <button className={`btn btn-sm textpane-toolbar-btn ${isBullet ? "btn-primary" : "btn-ghost"}`} onMouseDown={e => { e.preventDefault(); execFormat("insertUnorderedList"); }} title="Bullet list">•—</button>
          <button className={`btn btn-sm textpane-toolbar-btn ${isNumbered ? "btn-primary" : "btn-ghost"}`} onMouseDown={e => { e.preventDefault(); execFormat("insertOrderedList"); }} title="Numbered list">1.</button>
          <input
            type="color"
            className="textpane-toolbar-backcolor"
            defaultValue="#ffff00"
            onMouseDown={captureSelection}
            onChange={e => execBackColor(e.target.value)}
            title="Highlight color for selected text"
          />
          <button
            className="btn btn-ghost btn-sm textpane-toolbar-btn"
            onMouseDown={e => { e.preventDefault(); execFormat("hiliteColor", "transparent"); }}
            title="Remove highlight from selected text"
          >⊘</button>
          <input
            type="color"
            className="textpane-toolbar-bgcolor"
            value={activePage.bgColor || "#141428"}
            onChange={e => setBgColor(e.target.value)}
            title="Background color for this pane"
          />
          <button
            className="btn btn-ghost btn-sm textpane-toolbar-btn"
            onClick={clearBgColor}
            disabled={!activePage.bgColor}
            title="Reset pane background to default"
            style={{ opacity: activePage.bgColor ? 1 : 0.35 }}
          >↺</button>
          <div className="textpane-toolbar-divider" />
          <button className="btn btn-ghost btn-sm textpane-toolbar-btn" onClick={clear} title="Clear this page">✕</button>
          <button className="btn btn-ghost btn-sm textpane-toolbar-btn" onClick={addPage} title="Add a page">+</button>
          <button
            className={`btn btn-sm textpane-toolbar-btn ${activeSyncMates.length > 0 ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setSyncModalOpen(true)}
            title={activeSyncMates.length > 0 ? `This tab is synced with ${activeSyncMates.join(", ")}` : "Sync this tab with another period"}
          >∞</button>
          <div className="textpane-toolbar-divider" />
          <label className="textpane-toolbar-scrolling-toggle" title="Scroll this page's text across the pane like a ticker">
            <input type="checkbox" checked={isScrolling} onChange={toggleScrolling} />
            Scrolling message
          </label>
        </div>,
        document.body,
      )}
    </div>
  );
}
