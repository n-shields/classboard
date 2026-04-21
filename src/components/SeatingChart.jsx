import { useState, useRef, useEffect, useCallback } from "react";
import "./SeatingChart.css";

const STORAGE_KEY    = (p) => `classboard_seating_${p ?? "default"}`;
const SEATING_UI_KEY = (p) => `classboard_seating_ui_${p ?? "default"}`;
const RECTS_KEY      = (p) => `classboard_seating_rects_${p ?? "default"}`;
const ROTATIONS  = [0, 90, 180, 270];
const CARD_SIZE  = 90;
const CANVAS_W   = 1000;
const CANVAS_H   = 700;
const SNAP_GRID  = 10;

const snapV = v => Math.round(v / SNAP_GRID) * SNAP_GRID;

const SPECIAL = {
  __door__:    { label: "Door",    w: 180, h: 30, className: "seating-card--door"    },
  __teacher__: { label: "Teacher", w: 120, h: 90, className: "seating-card--teacher" },
};
const DEFAULT_SPECIAL_POS = {
  __door__:    { x: 680, y: 18  },
  __teacher__: { x: 450, y: 570 },
};

function initPositions(names, stored) {
  const cols = Math.ceil(Math.sqrt(names.length));
  const students = Object.fromEntries(names.map((name, i) => [
    name,
    stored?.[name] ?? { x: snapV((i % cols) * (CARD_SIZE + 20) + 40), y: snapV(Math.floor(i / cols) * (CARD_SIZE + 20) + 80) },
  ]));
  return {
    ...students,
    __door__:    stored?.__door__    ?? DEFAULT_SPECIAL_POS.__door__,
    __teacher__: stored?.__teacher__ ?? DEFAULT_SPECIAL_POS.__teacher__,
  };
}

function loadPositions(p) { try { return JSON.parse(localStorage.getItem(STORAGE_KEY(p)) || "null"); } catch (_) { return null; } }
function savePositions(p, v) { try { localStorage.setItem(STORAGE_KEY(p), JSON.stringify(v)); } catch (_) {} }
function loadUI(p) { try { return { showDoor: true, showTeacher: true, ...JSON.parse(localStorage.getItem(SEATING_UI_KEY(p)) || "{}") }; } catch (_) { return { showDoor: true, showTeacher: true }; } }
function saveUI(p, v) { try { localStorage.setItem(SEATING_UI_KEY(p), JSON.stringify(v)); } catch (_) {} }
function loadRects(p) { try { return JSON.parse(localStorage.getItem(RECTS_KEY(p)) || "[]"); } catch (_) { return []; } }
function saveRects(p, v) { try { localStorage.setItem(RECTS_KEY(p), JSON.stringify(v)); } catch (_) {} }

export default function SeatingChart({ names, periodLabel, periodKey, onClose }) {
  const stored = loadPositions(periodKey);
  const initUI = loadUI(periodKey);

  const [positions,   setPositions]   = useState(() => initPositions(names, stored));
  const [rotation,    setRotation]    = useState(0);
  const [zoom,        setZoom]        = useState(1);
  const [showDoor,    setShowDoor]    = useState(initUI.showDoor);
  const [showTeacher, setShowTeacher] = useState(initUI.showTeacher);
  const [rects,       setRects]       = useState(() => loadRects(periodKey));
  const [drawMode,    setDrawMode]    = useState(false);
  const [preview,     setPreview]     = useState(null);
  const [selected,    setSelected]    = useState(new Set());
  const [marquee,     setMarquee]     = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const canvasRef       = useRef(null);
  const wrapRef         = useRef(null);
  const rootRef         = useRef(null);
  // dragging.current: { startX, startY, origPositions:{[key]:{x,y}}, origRects:{[id]:{x,y}} }
  const dragging        = useRef(null);
  // resizing.current: { rectId, handle, startX, startY, origRect:{x,y,w,h} }
  const resizing        = useRef(null);
  const drawStartRef    = useRef(null);
  const marqueeStartRef = useRef(null);
  const initialStateRef = useRef(null);
  // Always-current refs so event handlers don't need positions/rects as deps
  const positionsRef    = useRef(positions);
  const rectsRef        = useRef(rects);
  useEffect(() => { positionsRef.current = positions; });
  useEffect(() => { rectsRef.current = rects; });

  // Snapshot on open for cancel
  useEffect(() => {
    initialStateRef.current = {
      positions: JSON.parse(JSON.stringify(positions)),
      rects:     JSON.parse(JSON.stringify(rects)),
    };
  }, []); // eslint-disable-line

  useEffect(() => { savePositions(periodKey, positions); }, [positions, periodKey]);
  useEffect(() => { saveUI(periodKey, { showDoor, showTeacher }); }, [showDoor, showTeacher, periodKey]);
  useEffect(() => { saveRects(periodKey, rects); }, [rects, periodKey]);

  // Add new students not yet in positions
  useEffect(() => {
    setPositions(prev => {
      const missing = names.filter(n => !prev[n]);
      if (!missing.length) return prev;
      const cols = Math.ceil(Math.sqrt(names.length));
      const extra = Object.fromEntries(missing.map(name => {
        const idx = names.indexOf(name);
        return [name, { x: snapV((idx % cols) * (CARD_SIZE + 20) + 40), y: snapV(Math.floor(idx / cols) * (CARD_SIZE + 20) + 80) }];
      }));
      return { ...prev, ...extra };
    });
  }, [names]); // eslint-disable-line

  // Wheel zoom
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom(z => Math.max(0.25, Math.min(3, z * (1 - e.deltaY * 0.001))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const cycleRotation = () => setRotation(r => ROTATIONS[(ROTATIONS.indexOf(r) + 1) % ROTATIONS.length]);
  const resetPositions = () => { setPositions(initPositions(names, null)); setZoom(1); };

  const randomize = () => {
    setPositions(prev => {
      const keys = names.filter(n => prev[n]);
      const slots = keys.map(k => ({ ...prev[k] }));
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      const next = { ...prev };
      keys.forEach((k, i) => { next[k] = slots[i]; });
      return next;
    });
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen();
  };

  const handleSave   = useCallback(() => onClose(), [onClose]);
  const handleCancel = useCallback(() => {
    if (initialStateRef.current) {
      const { positions: p, rects: r } = initialStateRef.current;
      savePositions(periodKey, p);
      saveRects(periodKey, r);
    }
    onClose();
  }, [periodKey, onClose]);

  const screenToCanvas = useCallback((screenX, screenY) => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const dx = screenX - cx;
    const dy = screenY - cy;
    const r  = (rotation * Math.PI) / 180;
    return {
      x: (dx * Math.cos(r) + dy * Math.sin(r)) / zoom + CANVAS_W / 2,
      y: (-dx * Math.sin(r) + dy * Math.cos(r)) / zoom + CANVAS_H / 2,
    };
  }, [rotation, zoom]);

  const toLocal = useCallback((dx, dy) => {
    const r = (rotation * Math.PI) / 180;
    return {
      x: (dx * Math.cos(r) + dy * Math.sin(r)) / zoom,
      y: (-dx * Math.sin(r) + dy * Math.cos(r)) / zoom,
    };
  }, [rotation, zoom]);

  // Build orig snapshots from a selection set for dragging
  const buildSnapshot = useCallback((sel) => {
    const origPositions = {};
    const origRects     = {};
    for (const k of sel) {
      if (typeof k === "string") {
        const p = positionsRef.current[k];
        if (p) origPositions[k] = { ...p };
      } else {
        const r = rectsRef.current.find(r => r.id === k);
        if (r) origRects[r.id] = { x: r.x, y: r.y };
      }
    }
    return { origPositions, origRects };
  }, []);

  // Card mousedown: select + start drag
  const onCardMouseDown = useCallback((e, key) => {
    if (drawMode) return;
    e.preventDefault();
    e.stopPropagation();
    let next;
    if (e.shiftKey) {
      next = new Set(selected);
      next.has(key) ? next.delete(key) : next.add(key);
    } else if (!selected.has(key)) {
      next = new Set([key]);
    } else {
      next = selected; // keep multi-selection, start group drag
    }
    setSelected(next);
    dragging.current = { startX: e.clientX, startY: e.clientY, ...buildSnapshot(next) };
  }, [selected, drawMode, buildSnapshot]);

  // Rect mousedown: select + start drag
  const onRectMouseDown = useCallback((e, rectId) => {
    if (drawMode) return;
    e.preventDefault();
    e.stopPropagation();
    let next;
    if (e.shiftKey) {
      next = new Set(selected);
      next.has(rectId) ? next.delete(rectId) : next.add(rectId);
    } else if (!selected.has(rectId)) {
      next = new Set([rectId]);
    } else {
      next = selected;
    }
    setSelected(next);
    dragging.current = { startX: e.clientX, startY: e.clientY, ...buildSnapshot(next) };
  }, [selected, drawMode, buildSnapshot]);

  // Resize handle mousedown
  const onResizeMouseDown = useCallback((e, rectId, handle) => {
    e.preventDefault();
    e.stopPropagation();
    const r = rectsRef.current.find(r => r.id === rectId);
    if (!r) return;
    resizing.current = { rectId, handle, startX: e.clientX, startY: e.clientY, origRect: { x: r.x, y: r.y, w: r.w, h: r.h } };
  }, [drawMode]);

  // Canvas mousedown (empty space): start marquee, clear selection
  const onCanvasMouseDown = useCallback((e) => {
    if (drawMode) return;
    e.preventDefault();
    const pt = screenToCanvas(e.clientX, e.clientY);
    marqueeStartRef.current = pt;
    setMarquee({ x: pt.x, y: pt.y, w: 0, h: 0 });
  }, [drawMode, screenToCanvas]);

  // Combined drag + marquee effect
  useEffect(() => {
    const MIN = SNAP_GRID;

    const onMove = (e) => {
      if (dragging.current) {
        const { startX, startY, origPositions, origRects } = dragging.current;
        const { x: dx, y: dy } = toLocal(e.clientX - startX, e.clientY - startY);
        if (Object.keys(origPositions).length) {
          setPositions(prev => {
            const next = { ...prev };
            for (const [k, o] of Object.entries(origPositions))
              next[k] = { x: snapV(o.x + dx), y: snapV(o.y + dy) };
            return next;
          });
        }
        if (Object.keys(origRects).length) {
          setRects(prev => prev.map(r => {
            const o = origRects[r.id];
            return o ? { ...r, x: snapV(o.x + dx), y: snapV(o.y + dy) } : r;
          }));
        }
      } else if (resizing.current) {
        const { rectId, handle, startX, startY, origRect: o } = resizing.current;
        const { x: dx, y: dy } = toLocal(e.clientX - startX, e.clientY - startY);
        let { x, y, w, h } = o;
        if (handle.includes("n")) { y = snapV(o.y + dy); h = snapV(o.h - dy); if (h < MIN) { h = MIN; y = o.y + o.h - MIN; } }
        if (handle.includes("s")) { h = snapV(o.h + dy); if (h < MIN) h = MIN; }
        if (handle.includes("w")) { x = snapV(o.x + dx); w = snapV(o.w - dx); if (w < MIN) { w = MIN; x = o.x + o.w - MIN; } }
        if (handle.includes("e")) { w = snapV(o.w + dx); if (w < MIN) w = MIN; }
        setRects(prev => prev.map(r => r.id === rectId ? { ...r, x, y, w, h } : r));
      }
      if (marqueeStartRef.current) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        const s  = marqueeStartRef.current;
        setMarquee({ x: Math.min(s.x, pt.x), y: Math.min(s.y, pt.y), w: Math.abs(pt.x - s.x), h: Math.abs(pt.y - s.y) });
      }
    };

    const onUp = (e) => {
      dragging.current  = null;
      resizing.current  = null;
      if (marqueeStartRef.current) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        const s  = marqueeStartRef.current;
        const mx = Math.min(s.x, pt.x), my = Math.min(s.y, pt.y);
        const mw = Math.abs(pt.x - s.x), mh = Math.abs(pt.y - s.y);
        if (mw > 5 || mh > 5) {
          const newSel = new Set();
          for (const [key, p] of Object.entries(positionsRef.current)) {
            const { w, h } = SPECIAL[key] || { w: CARD_SIZE, h: CARD_SIZE };
            if (p.x + w > mx && p.x < mx + mw && p.y + h > my && p.y < my + mh) newSel.add(key);
          }
          for (const r of rectsRef.current) {
            if (r.x + r.w > mx && r.x < mx + mw && r.y + r.h > my && r.y < my + mh) newSel.add(r.id);
          }
          setSelected(newSel);
        } else {
          setSelected(new Set());
        }
        marqueeStartRef.current = null;
        setMarquee(null);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [toLocal, screenToCanvas]);

  // Rectangle draw handlers
  useEffect(() => {
    if (!drawMode) return;
    const onMove = (e) => {
      if (!drawStartRef.current) return;
      const pt = screenToCanvas(e.clientX, e.clientY);
      const s  = drawStartRef.current;
      const x1 = snapV(Math.min(s.x, pt.x)), y1 = snapV(Math.min(s.y, pt.y));
      const x2 = snapV(Math.max(s.x, pt.x)), y2 = snapV(Math.max(s.y, pt.y));
      setPreview({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    };
    const onUp = (e) => {
      if (!drawStartRef.current) return;
      const pt = screenToCanvas(e.clientX, e.clientY);
      const s  = drawStartRef.current;
      const x1 = snapV(Math.min(s.x, pt.x)), y1 = snapV(Math.min(s.y, pt.y));
      const x2 = snapV(Math.max(s.x, pt.x)), y2 = snapV(Math.max(s.y, pt.y));
      const r  = { id: Date.now(), x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      if (r.w > 8 && r.h > 8) setRects(prev => [...prev, r]);
      drawStartRef.current = null;
      setPreview(null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [drawMode, screenToCanvas]);

  useEffect(() => {
    const ARROW = { ArrowLeft: [-SNAP_GRID, 0], ArrowRight: [SNAP_GRID, 0], ArrowUp: [0, -SNAP_GRID], ArrowDown: [0, SNAP_GRID] };
    const handler = (e) => {
      if (e.key === "Escape") { handleCancel(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selected.size) {
        const toRemove = [...selected].filter(k => typeof k === "number");
        if (toRemove.length) {
          e.preventDefault();
          setRects(prev => prev.filter(r => !toRemove.includes(r.id)));
          setSelected(prev => { const next = new Set(prev); toRemove.forEach(id => next.delete(id)); return next; });
          return;
        }
      }
      const dir = ARROW[e.key];
      if (!dir || !selected.size) return;
      e.preventDefault();
      const [dx, dy] = dir;
      setPositions(prev => {
        const next = { ...prev };
        for (const k of selected)
          if (typeof k === "string" && next[k]) next[k] = { x: next[k].x + dx, y: next[k].y + dy };
        return next;
      });
      setRects(prev => prev.map(r => selected.has(r.id) ? { ...r, x: r.x + dx, y: r.y + dy } : r));
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleCancel, selected]);

  const specialVisible = { __door__: showDoor, __teacher__: showTeacher };

  return (
    <div className="seating-overlay" ref={rootRef}>
      <div className="seating-toolbar">
        <span className="seating-title">{periodLabel ? `${periodLabel} — Seating` : "Seating Chart"}</span>
        <button className="seating-tb-btn" onClick={cycleRotation} title="Rotate view 90°">⟳ {rotation}°</button>
        <button className="seating-tb-btn" onClick={resetPositions} title="Reset all positions">Reset</button>
        <button className="seating-tb-btn" onClick={randomize} title="Randomly shuffle student seats">Randomize</button>

        <div className="seating-tb-divider" />

        <button
          className={`seating-tb-btn seating-tb-toggle seating-tb-toggle--door ${showDoor ? "seating-tb-toggle--on" : ""}`}
          onClick={() => setShowDoor(v => !v)} title="Toggle Door"
        >Door</button>
        <button
          className={`seating-tb-btn seating-tb-toggle seating-tb-toggle--teacher ${showTeacher ? "seating-tb-toggle--on" : ""}`}
          onClick={() => setShowTeacher(v => !v)} title="Toggle Teacher"
        >Teacher</button>

        <div className="seating-tb-divider" />

        <button
          className={`seating-tb-btn ${drawMode ? "seating-tb-btn--rect-on" : ""}`}
          onClick={() => setDrawMode(v => !v)}
          title={drawMode ? "Exit rectangle mode" : "Draw a rectangle"}
        >⬜ Rect</button>
        <button
          className="seating-tb-btn"
          onClick={() => setRects([])}
          title="Clear all rectangles"
          style={{ opacity: rects.length ? 1 : 0.35 }}
        >Clear</button>

        <button className="seating-tb-btn seating-tb-btn--save"   onClick={handleSave}   title="Save and close">Save</button>
        <button className="seating-tb-btn seating-tb-btn--cancel" onClick={handleCancel} title="Cancel changes (Escape)">Cancel</button>
      </div>

      <div className="seating-canvas-wrap" ref={wrapRef}>
        <button className="seating-fullscreen-btn" onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
          {isFullscreen ? "⊡" : "⛶"}
        </button>
        <div
          className="seating-canvas"
          ref={canvasRef}
          style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, cursor: drawMode ? "crosshair" : "default" }}
          onMouseDown={onCanvasMouseDown}
        >
          {/* Drawn rectangles */}
          {rects.map(r => (
            <div key={r.id}
              className={`seating-rect${selected.has(r.id) ? " seating-rect--selected" : ""}`}
              style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
              onMouseDown={e => onRectMouseDown(e, r.id)}
            >
              {["nw","n","ne","e","se","s","sw","w"].map(h => (
                <div key={h} className={`seating-rect-handle seating-rect-handle--${h}`}
                  onMouseDown={e => onResizeMouseDown(e, r.id, h)} />
              ))}
              <button
                className="seating-rect-del"
                onMouseDown={e => { e.stopPropagation(); e.preventDefault(); setRects(prev => prev.filter(x => x.id !== r.id)); }}
                title="Delete rectangle"
              >✕</button>
            </div>
          ))}

          {/* Preview while drawing */}
          {preview && preview.w > 2 && preview.h > 2 && (
            <div className="seating-rect seating-rect--preview"
              style={{ left: preview.x, top: preview.y, width: preview.w, height: preview.h }} />
          )}

          {/* Marquee selection box */}
          {marquee && marquee.w > 2 && marquee.h > 2 && (
            <div className="seating-marquee"
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />
          )}

          {/* Special items */}
          {Object.entries(SPECIAL).map(([key, { label, w, h, className }]) => {
            if (!specialVisible[key]) return null;
            const pos = positions[key] ?? DEFAULT_SPECIAL_POS[key];
            return (
              <div key={key}
                className={`seating-card ${className}${selected.has(key) ? " seating-card--selected" : ""}`}
                style={{ left: pos.x, top: pos.y, width: w, height: h }}
                onMouseDown={e => onCardMouseDown(e, key)}>
                <span style={{ transform: `rotate(-${rotation}deg)`, display: "block", transition: "transform 0.3s" }}>
                  {label}
                </span>
              </div>
            );
          })}

          {/* Student desks */}
          {names.map(name => {
            const pos = positions[name];
            if (!pos) return null;
            return (
              <div key={name}
                className={`seating-card${selected.has(name) ? " seating-card--selected" : ""}`}
                style={{ left: pos.x, top: pos.y, width: CARD_SIZE, height: CARD_SIZE }}
                onMouseDown={e => onCardMouseDown(e, name)}>
                <span style={{ transform: `rotate(-${rotation}deg)`, display: "block", transition: "transform 0.3s" }}>
                  {name}
                </span>
              </div>
            );
          })}

          {/* Draw mode overlay — above cards, captures mousedown for drawing */}
          {drawMode && (
            <div
              className="seating-draw-overlay"
              onMouseDown={e => {
                e.preventDefault();
                const pt = screenToCanvas(e.clientX, e.clientY);
                const snapped = { x: snapV(pt.x), y: snapV(pt.y) };
                drawStartRef.current = snapped;
                setPreview({ x: snapped.x, y: snapped.y, w: 0, h: 0 });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
