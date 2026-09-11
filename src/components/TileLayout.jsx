import { useContext, useState, useRef, useCallback, useEffect, useMemo } from "react";
import { moveTile, swapLeaves, isPaneTile } from "../data/layout";
import { DragCtx, PAGE_DND_TYPE } from "./dragContext";
import "./TileLayout.css";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Drop overlay shown when a tile is being dragged ──────────────────────────

// `isMergeTarget`: this tile hosts a text pane, so dropping anywhere on it
// joins its tab strip instead of splitting off a new tile — shown as a
// single full-tile highlight rather than a directional split indicator.
function DropOverlay({ tileId, onDrop, onDropPage, isMergeTarget }) {
  const [side, setSide] = useState(null);

  const getSide = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (y < 0.25) return "top";
    if (y > 0.75) return "bottom";
    if (x < 0.3) return "left";
    return "right";
  };

  return (
    <div
      className="tl-drop-overlay"
      onDragOver={e => { e.preventDefault(); setSide(getSide(e)); }}
      onDragLeave={e => {
        // Only clear if leaving the overlay itself (not a child)
        if (!e.currentTarget.contains(e.relatedTarget)) setSide(null);
      }}
      onDrop={e => {
        e.preventDefault();
        const pageJson = e.dataTransfer.getData(PAGE_DND_TYPE);
        if (side && pageJson) {
          onDropPage(JSON.parse(pageJson), side);
        } else {
          const fromId = e.dataTransfer.getData("text/plain");
          if (side && fromId && fromId !== tileId) onDrop(fromId, side);
        }
        setSide(null);
      }}
    >
      {side && (isMergeTarget
        ? <div className="tl-drop-indicator tl-drop-merge"><span>+ Add tab</span></div>
        : <div className={`tl-drop-indicator tl-drop-${side}`} />
      )}
    </div>
  );
}

// ── Tile slot — leaf rendering with drag handle and drop overlay ─────────────

function TileSlot({ id, content }) {
  const { dragging, setDragging, pageDragOrigin, setPageDragOrigin, onMove, onSwap, swapMap, onToggle, isCollapsed, tileNames, onPageDrop, getTileDragPayload } = useContext(DragCtx);
  const collapsed = isCollapsed(id);
  const didDrag = useRef(false);
  const name = tileNames?.[id] ?? "";
  const swapTarget = swapMap?.[id];
  // A pane with more than one tab has no tab strip of its own to drag from —
  // this same corner grip instead drags its active tab (to merge into
  // another pane, or detach to a new tile), leaving the rest of the tabs here.
  const pagePayload = getTileDragPayload?.(id);

  return (
    <div className={`tl-slot ${collapsed ? "tl-slot--collapsed" : ""}`} data-tile={id}>
      <div
        className={`tl-drag-handle ${dragging === id ? "tl-drag-handle-dragging" : ""} ${collapsed ? "tl-drag-handle-collapsed" : ""}`}
        draggable
        onDragStart={e => {
          didDrag.current = true;
          if (pagePayload) {
            e.dataTransfer.setData(PAGE_DND_TYPE, JSON.stringify(pagePayload));
            e.dataTransfer.setData("text/plain", "");
            e.dataTransfer.effectAllowed = "move";
            setPageDragOrigin(pagePayload.sourcePaneId);
            setTimeout(() => setDragging(pagePayload.pageId), 0);
          } else {
            e.dataTransfer.setData("text/plain", id);
            e.dataTransfer.effectAllowed = "move";
            setTimeout(() => setDragging(id), 0);
          }
        }}
        onDragEnd={() => { setDragging(null); setPageDragOrigin(null); }}
        onClick={() => { if (!didDrag.current) onToggle?.(id); didDrag.current = false; }}
        title={collapsed ? "Click to expand" : pagePayload ? "Drag to move this tab · click to minimize" : "Drag to reposition · click to minimize"}
      >
        {collapsed ? <>▶{name && <span className="tl-drag-handle-name">{name}</span>}</> : "⠿"}
      </div>
      {!collapsed && swapTarget && (
        <button
          className="tl-swap-btn"
          onClick={() => onSwap(id, swapTarget)}
          title={`Swap with ${tileNames?.[swapTarget] ?? swapTarget}`}
        >⇄</button>
      )}
      {/* Suppress the overlay on the pane a tab drag started from — dropping
          a tab back onto its own pane isn't a meaningful move. */}
      {dragging && dragging !== id && pageDragOrigin !== id && (
        <DropOverlay
          tileId={id}
          isMergeTarget={!!pageDragOrigin && isPaneTile(id)}
          onDrop={(fromId, side) => { onMove(fromId, id, side); setDragging(null); }}
          onDropPage={(info, side) => { onPageDrop?.(info, id, side); setDragging(null); setPageDragOrigin(null); }}
        />
      )}
      <div className="tl-slot-content">{content}</div>
    </div>
  );
}

// ── Split node — two children with a resizable handle between them ───────────

function SplitNode({ node, onChange, tiles, isCollapsed }) {
  const containerRef = useRef(null);
  const nodeRef      = useRef(node);
  const onChangeRef  = useRef(onChange);
  nodeRef.current    = node;
  onChangeRef.current = onChange;

  const startResize = useCallback((e) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const onMouseMove = (ev) => {
      const n = nodeRef.current;
      const ratio = n.dir === "h"
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height;
      onChangeRef.current({ ...n, ratio: clamp(ratio, 0.05, 0.95) });
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const aCollapsed = typeof node.a === "string" && isCollapsed(node.a);
  const bCollapsed = typeof node.b === "string" && isCollapsed(node.b);
  const showHandle = !aCollapsed && !bCollapsed;

  return (
    <div ref={containerRef} className={`tl-split tl-split-${node.dir}`}>
      <div className="tl-child" style={{ flex: aCollapsed ? "0 0 auto" : bCollapsed ? 1 : node.ratio }}>
        <LayoutNode
          node={node.a}
          onChange={newA => onChange({ ...node, a: newA })}
          tiles={tiles}
          isCollapsed={isCollapsed}
        />
      </div>
      {showHandle && (
        <div
          className={`tl-handle tl-handle-${node.dir}`}
          onMouseDown={startResize}
        />
      )}
      <div className="tl-child" style={{ flex: bCollapsed ? "0 0 auto" : aCollapsed ? 1 : (1 - node.ratio) }}>
        <LayoutNode
          node={node.b}
          onChange={newB => onChange({ ...node, b: newB })}
          tiles={tiles}
          isCollapsed={isCollapsed}
        />
      </div>
    </div>
  );
}

// ── Layout node — dispatcher ─────────────────────────────────────────────────

function LayoutNode({ node, onChange, tiles, isCollapsed }) {
  if (typeof node === "string") {
    return <TileSlot id={node} content={tiles[node]} />;
  }
  return (
    <SplitNode
      node={node}
      onChange={onChange}
      tiles={tiles}
      isCollapsed={isCollapsed}
    />
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function TileLayout({ layout, onLayoutChange, tiles, isCollapsed, onToggle, tileNames, swapMap, onPageDrop, getTileDragPayload }) {
  const [dragging, setDragging] = useState(null);
  const [pageDragOrigin, setPageDragOrigin] = useState(null);

  const onMove = useCallback((fromId, toId, side) => {
    onLayoutChange(prev => moveTile(prev, fromId, toId, side));
  }, [onLayoutChange]);

  const onSwap = useCallback((idA, idB) => {
    onLayoutChange(prev => swapLeaves(prev, idA, idB));
  }, [onLayoutChange]);

  // Safety net: if the dragged element remounts (layout changed mid-drag),
  // onDragEnd won't fire on it — clear dragging state from the document level.
  useEffect(() => {
    const handler = () => { setDragging(null); setPageDragOrigin(null); };
    document.addEventListener("dragend", handler);
    return () => document.removeEventListener("dragend", handler);
  }, []);

  const ctxValue = useMemo(
    () => ({ dragging, setDragging, pageDragOrigin, setPageDragOrigin, onMove, onSwap, swapMap, onToggle, isCollapsed, tileNames, onPageDrop, getTileDragPayload }),
    [dragging, pageDragOrigin, onMove, onSwap, swapMap, onToggle, isCollapsed, tileNames, onPageDrop, getTileDragPayload],
  );

  return (
    <DragCtx.Provider value={ctxValue}>
      <div className="tl-root">
        <LayoutNode
          node={layout}
          onChange={onLayoutChange}
          tiles={tiles}
          isCollapsed={isCollapsed}
        />
      </div>
    </DragCtx.Provider>
  );
}
