import { useState, useRef, useEffect, useCallback } from "react";
import { toPng } from "html-to-image";
import "./SeatingChart.css";

const STORAGE_KEY      = (p) => `classboard_seating_${p ?? "default"}`;
const SEATING_UI_KEY   = (p) => `classboard_seating_ui_${p ?? "default"}`;
const RECTS_KEY        = (p) => `classboard_seating_rects_${p ?? "default"}`;
const DESKS_KEY        = (p) => `classboard_seating_desks_${p ?? "default"}`;
const CONSTRAINTS_KEY  = (p) => `classboard_seating_constraints_${p ?? "default"}`;
const LAYOUT_TEMPLATE_KEY = "classboard_seating_layout_templates";
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

function initPositions(names, stored, deskIds = []) {
  const cols = Math.ceil(Math.sqrt(names.length));
  const students = Object.fromEntries(names.map((name, i) => [
    name,
    stored?.[name] ?? { x: snapV((i % cols) * (CARD_SIZE + 20) + 40), y: snapV(Math.floor(i / cols) * (CARD_SIZE + 20) + 80) },
  ]));
  const desks = Object.fromEntries(deskIds.filter(id => stored?.[id]).map(id => [id, stored[id]]));
  return {
    ...students,
    ...desks,
    __door__:    stored?.__door__    ?? DEFAULT_SPECIAL_POS.__door__,
    __teacher__: stored?.__teacher__ ?? DEFAULT_SPECIAL_POS.__teacher__,
  };
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** First grid cell (scanning left-to-right, top-to-bottom) that doesn't overlap anything in `occupied` */
function findFreeSpot(occupied) {
  const step = CARD_SIZE + 20;
  const cols = Math.max(1, Math.floor((CANVAS_W - 40) / step));
  const rows = Math.max(1, Math.floor((CANVAS_H - 80) / step)) + 4; // a little slack for a crowded room
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = snapV(c * step + 40);
      const y = snapV(r * step + 80);
      const free = !occupied.some(o => rectsOverlap(x, y, CARD_SIZE, CARD_SIZE, o.x, o.y, o.w, o.h));
      if (free) return { x, y };
    }
  }
  // Canvas is genuinely full — stack near the corner rather than give up; still draggable.
  return { x: snapV(40 + occupied.length * 6), y: snapV(80 + occupied.length * 6) };
}

function loadPositions(p) { try { return JSON.parse(localStorage.getItem(STORAGE_KEY(p)) || "null"); } catch (_) { return null; } }
function savePositions(p, v) { try { localStorage.setItem(STORAGE_KEY(p), JSON.stringify(v)); } catch (_) {} }
function loadUI(p) { try { return { showDoor: true, showTeacher: true, ...JSON.parse(localStorage.getItem(SEATING_UI_KEY(p)) || "{}") }; } catch (_) { return { showDoor: true, showTeacher: true }; } }
function saveUI(p, v) { try { localStorage.setItem(SEATING_UI_KEY(p), JSON.stringify(v)); } catch (_) {} }
function loadRects(p) { try { return JSON.parse(localStorage.getItem(RECTS_KEY(p)) || "[]"); } catch (_) { return []; } }
function saveRects(p, v) { try { localStorage.setItem(RECTS_KEY(p), JSON.stringify(v)); } catch (_) {} }
function loadDesks(p) { try { return JSON.parse(localStorage.getItem(DESKS_KEY(p)) || "[]"); } catch (_) { return []; } }
function saveDesks(p, v) { try { localStorage.setItem(DESKS_KEY(p), JSON.stringify(v)); } catch (_) {} }
const DEFAULT_CONSTRAINTS = { together: [], apart: [], frontBack: {} };
function loadConstraints(p) {
  try { return { ...DEFAULT_CONSTRAINTS, ...JSON.parse(localStorage.getItem(CONSTRAINTS_KEY(p)) || "{}") }; }
  catch (_) { return { ...DEFAULT_CONSTRAINTS }; }
}
function saveConstraints(p, v) { try { localStorage.setItem(CONSTRAINTS_KEY(p), JSON.stringify(v)); } catch (_) {} }
function loadLayoutTemplates() { try { return JSON.parse(localStorage.getItem(LAYOUT_TEMPLATE_KEY) || "{}"); } catch (_) { return {}; } }
function saveLayoutTemplates(v) { try { localStorage.setItem(LAYOUT_TEMPLATE_KEY, JSON.stringify(v)); } catch (_) {} }

export default function SeatingChart({ names, periodLabel, periodKey, onClose }) {
  const stored    = loadPositions(periodKey);
  const initUI    = loadUI(periodKey);
  const initDesks = loadDesks(periodKey);

  const [positions,   setPositions]   = useState(() => initPositions(names, stored, initDesks));
  const [rotation,    setRotation]    = useState(0);
  const [zoom,        setZoom]        = useState(1);
  const [showDoor,    setShowDoor]    = useState(initUI.showDoor);
  const [showTeacher, setShowTeacher] = useState(initUI.showTeacher);
  const [rects,       setRects]       = useState(() => loadRects(periodKey));
  const [desks,       setDesks]       = useState(() => initDesks);
  const [drawMode,    setDrawMode]    = useState(false);
  const [preview,     setPreview]     = useState(null);
  const [selected,     setSelected]     = useState(new Set());
  const [pan,          setPan]          = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layouts,        setLayouts]        = useState(() => loadLayoutTemplates());
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [constraints,     setConstraints]     = useState(() => loadConstraints(periodKey));
  const [showRulesMenu,   setShowRulesMenu]   = useState(false);

  const canvasRef       = useRef(null);
  const wrapRef         = useRef(null);
  const rootRef         = useRef(null);
  const layoutMenuRef   = useRef(null);
  const layoutBtnRef    = useRef(null);
  const rulesMenuRef    = useRef(null);
  const rulesBtnRef     = useRef(null);
  // dragging.current: { startX, startY, origPositions:{[key]:{x,y}}, origRects:{[id]:{x,y}} }
  const dragging        = useRef(null);
  // resizing.current: { rectId, handle, startX, startY, origRect:{x,y,w,h} }
  const resizing        = useRef(null);
  // panningRef.current: { startX, startY, origPan:{x,y} }
  const panningRef      = useRef(null);
  const drawStartRef    = useRef(null);
  const initialStateRef = useRef(null);
  // Always-current refs so event handlers don't need positions/rects as deps
  const positionsRef    = useRef(positions);
  const rectsRef        = useRef(rects);
  const panRef          = useRef(pan);
  useEffect(() => { positionsRef.current = positions; });
  useEffect(() => { rectsRef.current = rects; });
  useEffect(() => { panRef.current = pan; });

  // Snapshot on open for cancel
  useEffect(() => {
    initialStateRef.current = {
      positions: JSON.parse(JSON.stringify(positions)),
      rects:     JSON.parse(JSON.stringify(rects)),
      desks:     JSON.parse(JSON.stringify(desks)),
    };
  }, []); // eslint-disable-line

  useEffect(() => { savePositions(periodKey, positions); }, [positions, periodKey]);
  useEffect(() => { saveUI(periodKey, { showDoor, showTeacher }); }, [showDoor, showTeacher, periodKey]);
  useEffect(() => { saveRects(periodKey, rects); }, [rects, periodKey]);
  useEffect(() => { saveDesks(periodKey, desks); }, [desks, periodKey]);
  useEffect(() => { saveConstraints(periodKey, constraints); }, [constraints, periodKey]);

  // Add new students not yet in positions — reuse an empty desk if one's
  // free (removing it), otherwise drop them somewhere that doesn't overlap
  // anyone already on the canvas.
  useEffect(() => {
    const missing = names.filter(n => !positions[n]);
    if (!missing.length) return;

    const next = { ...positions };
    const availableDesks = [...desks];
    const consumedDesks = [];

    const occupied = Object.entries(next)
      .filter(([k]) => k !== "__door__" && k !== "__teacher__")
      .map(([, p]) => ({ x: p.x, y: p.y, w: CARD_SIZE, h: CARD_SIZE }));
    if (next.__door__)    occupied.push({ ...next.__door__,    w: SPECIAL.__door__.w,    h: SPECIAL.__door__.h });
    if (next.__teacher__) occupied.push({ ...next.__teacher__, w: SPECIAL.__teacher__.w, h: SPECIAL.__teacher__.h });

    missing.forEach(name => {
      const deskId = availableDesks.shift();
      if (deskId && next[deskId]) {
        next[name] = { ...next[deskId] };
        delete next[deskId];
        consumedDesks.push(deskId);
      } else {
        const spot = findFreeSpot(occupied);
        next[name] = spot;
        occupied.push({ ...spot, w: CARD_SIZE, h: CARD_SIZE });
      }
    });

    setPositions(next);
    if (consumedDesks.length) setDesks(d => d.filter(id => !consumedDesks.includes(id)));
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

  // Close layout menu on outside click
  useEffect(() => {
    if (!showLayoutMenu) return;
    const handler = (e) => {
      if (layoutMenuRef.current?.contains(e.target) || layoutBtnRef.current?.contains(e.target)) return;
      setShowLayoutMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showLayoutMenu]);

  // Close rules menu on outside click
  useEffect(() => {
    if (!showRulesMenu) return;
    const handler = (e) => {
      if (rulesMenuRef.current?.contains(e.target) || rulesBtnRef.current?.contains(e.target)) return;
      setShowRulesMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showRulesMenu]);

  const cycleRotation = () => setRotation(r => ROTATIONS[(ROTATIONS.indexOf(r) + 1) % ROTATIONS.length]);
  const resetPositions = () => { setPositions(initPositions(names, null)); setDesks([]); setZoom(1); setPan({ x: 0, y: 0 }); };

  // Empty desks — for unassigned seats — are stored as plain card-shaped
  // entries in `positions` (like students), so drag/select/arrow-key
  // movement all work for free; `desks` just tracks which keys are desks.
  const addDesk = () => {
    const id = `__desk_${Date.now()}__`;
    const stagger = desks.length % 8;
    const pos = {
      x: snapV(CANVAS_W / 2 - CARD_SIZE / 2 + stagger * 20),
      y: snapV(CANVAS_H / 2 - CARD_SIZE / 2 + stagger * 20),
    };
    setPositions(prev => ({ ...prev, [id]: pos }));
    setDesks(prev => [...prev, id]);
  };

  const deleteDesk = (id) => {
    setDesks(prev => prev.filter(d => d !== id));
    setPositions(prev => { const next = { ...prev }; delete next[id]; return next; });
    setSelected(prev => { if (!prev.has(id)) return prev; const next = new Set(prev); next.delete(id); return next; });
  };

  // The physical room (seat positions, desks, door/teacher) is usually shared
  // across periods — save it once, under a name, and reapply it to other
  // classes' rosters instead of re-dragging every card. Seats are captured in
  // reading order (top-to-bottom, left-to-right) so they're independent of
  // who sat where.
  const saveLayoutAs = () => {
    const name = window.prompt("Name this layout:", "Room Layout");
    if (!name) return;
    const seatPositions = names
      .map(n => positions[n])
      .filter(Boolean)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const deskPositions = desks
      .map(id => positions[id])
      .filter(Boolean)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const next = {
      ...layouts,
      [name]: {
        seatPositions,
        deskPositions,
        rects,
        showDoor, showTeacher,
        doorPos:    positions.__door__,
        teacherPos: positions.__teacher__,
      },
    };
    saveLayoutTemplates(next);
    setLayouts(next);
  };

  const deleteLayout = (name) => {
    const next = { ...layouts };
    delete next[name];
    saveLayoutTemplates(next);
    setLayouts(next);
  };

  const applyLayout = (name) => {
    const tpl = layouts[name];
    if (!tpl) return;
    // The room's total capacity is student seats plus whatever desks were
    // already sitting empty when the layout was saved — both are real desks.
    const allSeats  = [...(tpl.seatPositions || []), ...(tpl.deskPositions || [])];
    const teacherAt = tpl.teacherPos ?? positions.__teacher__ ?? DEFAULT_SPECIAL_POS.__teacher__;
    const distToTeacher = (p) => Math.hypot(p.x - teacherAt.x, p.y - teacherAt.y);
    const byDistance = [...allSeats].sort((a, b) => distToTeacher(a) - distToTeacher(b));

    const next = { ...positions };
    desks.forEach(id => delete next[id]); // this layout's desks replace whatever was here before

    let newDeskIds = [];
    if (names.length <= byDistance.length) {
      // Fewer students than the room has desks — give the closest desks to
      // the teacher to real students, and turn the rest into empty desks.
      const studentSeats = byDistance.slice(0, names.length);
      const deskSeats    = byDistance.slice(names.length);

      names.forEach((n, i) => { next[n] = { x: studentSeats[i].x, y: studentSeats[i].y }; });
      newDeskIds = deskSeats.map((seat, i) => {
        const id = `__desk_${Date.now()}_${i}__`;
        next[id] = { x: seat.x, y: seat.y };
        return id;
      });
    } else {
      // More students than the room has desks — seat as many as fit (closest
      // to the teacher first); the rest keep their current spot.
      names.forEach((n, i) => {
        const seat = byDistance[i];
        if (seat) next[n] = { x: seat.x, y: seat.y };
      });
    }

    next.__door__    = tpl.doorPos    ?? next.__door__;
    next.__teacher__ = tpl.teacherPos ?? next.__teacher__;

    setPositions(next);
    setDesks(newDeskIds);
    setRects((tpl.rects || []).map((r, i) => ({ ...r, id: Date.now() + i })));
    setShowDoor(tpl.showDoor);
    setShowTeacher(tpl.showTeacher);
    setShowLayoutMenu(false);
  };

  // Seating rules — "keep together" / "keep apart" groups and front/back
  // placement — are set by selecting student cards (shift-click on the
  // canvas) and applying them from the Rules menu, then honored by Randomize.
  const selectedNames = () => [...selected].filter(k => typeof k === "string" && names.includes(k));
  // Swap works on students AND empty desks, so a student can trade places with a desk.
  const selectedSeats = () => [...selected].filter(k => typeof k === "string" && (names.includes(k) || desks.includes(k)));

  const swapSelected = () => {
    const [a, b] = selectedSeats();
    if (!a || !b) return;
    setPositions(prev => {
      if (!prev[a] || !prev[b]) return prev;
      return { ...prev, [a]: prev[b], [b]: prev[a] };
    });
  };

  const addTogetherGroup = () => {
    const group = selectedNames();
    if (group.length < 2) return;
    setConstraints(c => ({ ...c, together: [...c.together, group] }));
  };
  const addApartGroup = () => {
    const group = selectedNames();
    if (group.length < 2) return;
    setConstraints(c => ({ ...c, apart: [...c.apart, group] }));
  };
  const removeTogetherGroup = (i) => setConstraints(c => ({ ...c, together: c.together.filter((_, idx) => idx !== i) }));
  const removeApartGroup    = (i) => setConstraints(c => ({ ...c, apart:    c.apart.filter((_, idx) => idx !== i) }));

  const setFrontBack = (tag) => {
    const group = selectedNames();
    if (!group.length) return;
    setConstraints(c => {
      const frontBack = { ...c.frontBack };
      group.forEach(n => { if (tag) frontBack[n] = tag; else delete frontBack[n]; });
      return { ...c, frontBack };
    });
  };
  const clearFrontBack = (n) => setConstraints(c => { const f = { ...c.frontBack }; delete f[n]; return { ...c, frontBack: f }; });

  const shuffleArr = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const randomize = () => {
    setPositions(prev => {
      const keys = names.filter(n => prev[n]);
      if (keys.length < 2) return prev;
      // Seats in reading order (front row / left-to-right first) so "front"/
      // "back" map to the actual first/last seats, and "together" groups can
      // be laid down as a contiguous run of neighboring seats.
      const seatCoords = keys.map(k => prev[k]).sort((a, b) => a.y - b.y || a.x - b.x);
      const N = seatCoords.length;

      const together = constraints.together.map(g => g.filter(n => keys.includes(n))).filter(g => g.length > 1);
      const apart     = constraints.apart.map(g => g.filter(n => keys.includes(n))).filter(g => g.length > 1);
      const grouped   = new Set(together.flat());
      // A "together" grouping takes precedence over a front/back tag for the same student.
      const frontSet  = keys.filter(n => constraints.frontBack[n] === "front" && !grouped.has(n));
      const backSet   = keys.filter(n => constraints.frontBack[n] === "back"  && !grouped.has(n));
      const freeSingles = keys.filter(n => !grouped.has(n) && !frontSet.includes(n) && !backSet.includes(n));

      const buildAssignment = () => {
        const seq = new Array(N).fill(null);
        let front = 0, back = N - 1;
        const placed = new Set();
        shuffleArr(frontSet).forEach(n => { if (front <= back) { seq[front++] = n; placed.add(n); } });
        shuffleArr(backSet).forEach(n => { if (front <= back) { seq[back--] = n; placed.add(n); } });
        // Anyone tagged front/back who didn't fit (more tags than seats) still needs a seat.
        const leftoverTagged = [...frontSet, ...backSet].filter(n => !placed.has(n));
        const middleItems = shuffleArr([
          ...shuffleArr([...freeSingles, ...leftoverTagged]).map(n => [n]),
          ...shuffleArr(together).map(g => shuffleArr(g)),
        ]);
        for (const block of middleItems) {
          for (const n of block) { if (front <= back) seq[front++] = n; }
        }
        return seq;
      };

      const violatesApart = (seq) => apart.some(group =>
        group.some((n, i) => group.slice(i + 1).some(m => Math.abs(seq.indexOf(n) - seq.indexOf(m)) <= 1))
      );

      let seq = buildAssignment();
      for (let attempt = 0; attempt < 200 && violatesApart(seq); attempt++) seq = buildAssignment();

      const next = { ...prev };
      seq.forEach((name, i) => { if (name) next[name] = { ...seatCoords[i] }; });
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

  const handleDownload = useCallback(async () => {
    const el = canvasRef.current;
    if (!el) return;
    const orig = el.style.transform;
    el.style.transform = "none";
    try {
      const url = await toPng(el, { backgroundColor: "#0f172a", width: CANVAS_W, height: CANVAS_H });
      const a = document.createElement("a");
      a.href = url;
      a.download = `seating${periodLabel ? `-${periodLabel}` : ""}.png`;
      a.click();
    } catch (e) {
      console.error("Seating chart screenshot failed", e);
    } finally {
      el.style.transform = orig;
    }
  }, [periodLabel]);

  const handleSave   = useCallback(() => onClose(), [onClose]);
  const handleCancel = useCallback(() => {
    if (initialStateRef.current) {
      const { positions: p, rects: r, desks: d } = initialStateRef.current;
      savePositions(periodKey, p);
      saveRects(periodKey, r);
      saveDesks(periodKey, d);
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

  // Canvas mousedown (empty space): start panning
  const onCanvasMouseDown = useCallback((e) => {
    if (drawMode) return;
    e.preventDefault();
    panningRef.current = { startX: e.clientX, startY: e.clientY, origPan: { ...panRef.current } };
  }, [drawMode]);

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
      if (panningRef.current) {
        const { startX, startY, origPan } = panningRef.current;
        setPan({ x: origPan.x + e.clientX - startX, y: origPan.y + e.clientY - startY });
      }
    };

    const onUp = (e) => {
      dragging.current = null;
      resizing.current = null;
      if (panningRef.current) {
        const { startX, startY } = panningRef.current;
        if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < 5) {
          setSelected(new Set()); // plain click on empty space = deselect
        }
        panningRef.current = null;
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
        const toRemoveRects = [...selected].filter(k => typeof k === "number");
        const toRemoveDesks = [...selected].filter(k => typeof k === "string" && k.startsWith("__desk_"));
        if (toRemoveRects.length || toRemoveDesks.length) {
          e.preventDefault();
          if (toRemoveRects.length) setRects(prev => prev.filter(r => !toRemoveRects.includes(r.id)));
          toRemoveDesks.forEach(deleteDesk);
          setSelected(prev => {
            const next = new Set(prev);
            toRemoveRects.forEach(id => next.delete(id));
            toRemoveDesks.forEach(id => next.delete(id));
            return next;
          });
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
  const selNames = selectedNames();
  const selSeats = selectedSeats();

  return (
    <div className="seating-overlay" ref={rootRef}>
      <div className="seating-toolbar">
        <span className="seating-title">{periodLabel ? `${periodLabel} — Seating` : "Seating Chart"}</span>
        <button className="seating-tb-btn" onClick={cycleRotation} title="Rotate view 90°">⟳ {rotation}°</button>
        <button className="seating-tb-btn" onClick={resetPositions} title="Reset all positions">Reset</button>
        <button className="seating-tb-btn" onClick={randomize} title="Randomly shuffle student seats, honoring any seating rules below">Randomize</button>
        <button
          className="seating-tb-btn"
          disabled={selSeats.length !== 2}
          onClick={swapSelected}
          title="Shift-click exactly two students and/or empty desks, then swap their seats"
        >🔀 Swap</button>

        <div className="seating-tb-divider" />

        <div className="seating-layout-control">
          <button
            ref={rulesBtnRef}
            className={`seating-tb-btn ${showRulesMenu ? "seating-tb-btn--rect-on" : ""}`}
            onClick={() => setShowRulesMenu(v => !v)}
            title="Shift-click students to select them, then set rules for Randomize"
          >🎯 Rules</button>
          {showRulesMenu && (
            <div className="seating-layout-menu" ref={rulesMenuRef}>
              <span className="seating-rules-selection">
                {selNames.length ? `Selected: ${selNames.join(", ")}` : "Shift-click 2+ students to group them"}
              </span>
              <div className="seating-rules-row">
                <button className="seating-tb-btn" disabled={selNames.length < 2} onClick={addTogetherGroup} title="Seat these students next to each other">🤝 Together</button>
                <button className="seating-tb-btn" disabled={selNames.length < 2} onClick={addApartGroup} title="Never seat these students next to each other">🚫 Apart</button>
              </div>
              <div className="seating-rules-row">
                <button className="seating-tb-btn" disabled={!selNames.length} onClick={() => setFrontBack("front")} title="Seat these students at the front">⬆ Front</button>
                <button className="seating-tb-btn" disabled={!selNames.length} onClick={() => setFrontBack("back")} title="Seat these students at the back">⬇ Back</button>
                <button className="seating-tb-btn" disabled={!selNames.length} onClick={() => setFrontBack(null)} title="Clear front/back preference">Clear</button>
              </div>

              {(constraints.together.length > 0 || constraints.apart.length > 0 || Object.keys(constraints.frontBack).length > 0) && (
                <div className="seating-layout-divider" />
              )}

              {constraints.together.map((g, i) => (
                <div key={`t${i}`} className="seating-layout-item">
                  <span className="seating-layout-item-btn seating-rules-tag" title="Kept together">🤝 {g.join(" + ")}</span>
                  <button className="seating-layout-item-del" onClick={() => removeTogetherGroup(i)} title="Remove rule">✕</button>
                </div>
              ))}
              {constraints.apart.map((g, i) => (
                <div key={`a${i}`} className="seating-layout-item">
                  <span className="seating-layout-item-btn seating-rules-tag" title="Kept apart">🚫 {g.join(" + ")}</span>
                  <button className="seating-layout-item-del" onClick={() => removeApartGroup(i)} title="Remove rule">✕</button>
                </div>
              ))}
              {Object.entries(constraints.frontBack).map(([n, tag]) => (
                <div key={n} className="seating-layout-item">
                  <span className="seating-layout-item-btn seating-rules-tag">{tag === "front" ? "⬆" : "⬇"} {n}</span>
                  <button className="seating-layout-item-del" onClick={() => clearFrontBack(n)} title="Remove rule">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="seating-tb-divider" />

        <div className="seating-layout-control">
          <button
            ref={layoutBtnRef}
            className={`seating-tb-btn ${showLayoutMenu ? "seating-tb-btn--rect-on" : ""}`}
            onClick={() => setShowLayoutMenu(v => !v)}
            title="Save or reuse a room's seat positions, desks, and door/teacher across classes"
          >🗂 Layouts</button>
          {showLayoutMenu && (
            <div className="seating-layout-menu" ref={layoutMenuRef}>
              <button className="seating-tb-btn seating-layout-save" onClick={saveLayoutAs}>
                💾 Save current as...
              </button>
              {Object.keys(layouts).length > 0 && <div className="seating-layout-divider" />}
              {Object.keys(layouts).sort().map(name => (
                <div key={name} className="seating-layout-item">
                  <button
                    className="seating-layout-item-btn"
                    onClick={() => applyLayout(name)}
                    title={`Seat this class's roster into "${name}"`}
                  >{name}</button>
                  <button
                    className="seating-layout-item-del"
                    onClick={() => deleteLayout(name)}
                    title={`Delete "${name}"`}
                  >✕</button>
                </div>
              ))}
              {Object.keys(layouts).length === 0 && (
                <span className="seating-layout-empty">No saved layouts yet</span>
              )}
            </div>
          )}
        </div>

        <button className="seating-tb-btn" onClick={handleDownload} title="Download as PNG">⬇ PNG</button>
        <button className="seating-tb-btn seating-tb-btn--save"   onClick={handleSave}   title="Save and close">Save</button>
        <button className="seating-tb-btn seating-tb-btn--cancel" onClick={handleCancel} title="Cancel changes (Escape)">Cancel</button>
      </div>

      <div className="seating-body">
      <div className="seating-canvas-wrap" ref={wrapRef}>
        <button className="seating-fullscreen-btn" onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
          {isFullscreen ? "⊡" : "⛶"}
        </button>
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
        <div
          className="seating-canvas"
          ref={canvasRef}
          style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, cursor: drawMode ? "crosshair" : (panningRef.current ? "grabbing" : "default") }}
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

          {/* Empty desks */}
          {desks.map(id => {
            const pos = positions[id];
            if (!pos) return null;
            return (
              <div key={id}
                className={`seating-card seating-card--empty${selected.has(id) ? " seating-card--selected" : ""}`}
                style={{ left: pos.x, top: pos.y, width: CARD_SIZE, height: CARD_SIZE }}
                onMouseDown={e => onCardMouseDown(e, id)}>
                <span style={{ transform: `rotate(-${rotation}deg)`, display: "block", transition: "transform 0.3s" }}>
                  Empty
                </span>
                <button
                  className="seating-rect-del"
                  onMouseDown={e => { e.stopPropagation(); e.preventDefault(); deleteDesk(id); }}
                  title="Remove desk"
                >✕</button>
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
        </div>{/* end pan positioner */}
      </div>

      <div className="seating-sidebar">
        <button
          className={`seating-sidebar-btn seating-sidebar-btn--door ${showDoor ? "seating-sidebar-btn--on" : ""}`}
          onClick={() => setShowDoor(v => !v)}
          title="Toggle Door"
        >🚪</button>
        <button
          className={`seating-sidebar-btn seating-sidebar-btn--teacher ${showTeacher ? "seating-sidebar-btn--on" : ""}`}
          onClick={() => setShowTeacher(v => !v)}
          title="Toggle Teacher"
        >🧑‍🏫</button>

        <div className="seating-sidebar-divider" />

        <button
          className="seating-sidebar-btn"
          onClick={addDesk}
          title="Add an empty desk"
        >🪑</button>

        <div className="seating-sidebar-divider" />

        <button
          className={`seating-sidebar-btn ${drawMode ? "seating-sidebar-btn--on" : ""}`}
          onClick={() => setDrawMode(v => !v)}
          title={drawMode ? "Exit rectangle mode" : "Draw a rectangle"}
        >⬜</button>
        <button
          className="seating-sidebar-btn"
          onClick={() => setRects([])}
          title="Clear all rectangles"
          style={{ opacity: rects.length ? 1 : 0.35 }}
        >🧹</button>
      </div>
      </div>{/* end seating-body */}
    </div>
  );
}
