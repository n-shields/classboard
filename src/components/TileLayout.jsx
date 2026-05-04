import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from "react";
import { moveTile } from "../data/layout";
import "./TileLayout.css";

// ── Shared drag context ──────────────────────────────────────────────────────

const DragCtx = createContext(null);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Drop overlay shown when a tile is being dragged ──────────────────────────

function DropOverlay({ tileId, onDrop }) {
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
        const fromId = e.dataTransfer.getData("text/plain");
        if (side && fromId && fromId !== tileId) onDrop(fromId, side);
        setSide(null);
      }}
    >
      {side && <div className={`tl-drop-indicator tl-drop-${side}`} />}
    </div>
  );
}

// ── Tile slot — leaf rendering with drag handle and drop overlay ─────────────

function TileSlot({ id, content }) {
  const { dragging, setDragging, onMove, onToggle, isCollapsed, tileNames } = useContext(DragCtx);
  const collapsed = isCollapsed(id);
  const didDrag = useRef(false);
  const name = tileNames?.[id] ?? "";

  return (
    <div className={`tl-slot ${collapsed ? "tl-slot--collapsed" : ""}`} data-tile={id}>
      <div
        className={`tl-drag-handle ${dragging === id ? "tl-drag-handle-dragging" : ""} ${collapsed ? "tl-drag-handle-collapsed" : ""}`}
        draggable
        onDragStart={e => {
          didDrag.current = true;
          e.dataTransfer.setData("text/plain", id);
          e.dataTransfer.effectAllowed = "move";
          setTimeout(() => setDragging(id), 0);
        }}
        onDragEnd={() => { setDragging(null); }}
        onClick={() => { if (!didDrag.current) onToggle?.(id); didDrag.current = false; }}
        title={collapsed ? "Click to expand" : "Drag to reposition · click to minimize"}
      >
        {collapsed ? <>▶{name && <span className="tl-drag-handle-name">{name}</span>}</> : "⠿"}
      </div>
      {dragging && dragging !== id && (
        <DropOverlay tileId={id} onDrop={(fromId, side) => { onMove(fromId, id, side); setDragging(null); }} />
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

export default function TileLayout({ layout, onLayoutChange, tiles, isCollapsed, onToggle, tileNames }) {
  const [dragging, setDragging] = useState(null);

  const onMove = useCallback((fromId, toId, side) => {
    onLayoutChange(prev => moveTile(prev, fromId, toId, side));
  }, [onLayoutChange]);

  // Safety net: if the dragged element remounts (layout changed mid-drag),
  // onDragEnd won't fire on it — clear dragging state from the document level.
  useEffect(() => {
    const handler = () => setDragging(null);
    document.addEventListener("dragend", handler);
    return () => document.removeEventListener("dragend", handler);
  }, []);

  const ctxValue = useMemo(
    () => ({ dragging, setDragging, onMove, onToggle, isCollapsed, tileNames }),
    [dragging, onMove, onToggle, isCollapsed, tileNames],
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
