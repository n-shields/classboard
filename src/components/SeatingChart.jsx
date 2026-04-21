import { useState, useRef, useEffect, useCallback } from "react";
import "./SeatingChart.css";

const STORAGE_KEY    = (p) => `classboard_seating_${p ?? "default"}`;
const SEATING_UI_KEY = (p) => `classboard_seating_ui_${p ?? "default"}`;
const ROTATIONS = [0, 90, 180, 270];
const CARD_SIZE = 90;

const SPECIAL = {
  __door__:    { label: "Door",    w: 180, h: 30,  className: "seating-card--door"    },
  __teacher__: { label: "Teacher", w: 120, h: 90,  className: "seating-card--teacher" },
};

const DEFAULT_SPECIAL_POS = {
  __door__:    { x: 680, y: 18  },
  __teacher__: { x: 450, y: 570 },
};

function initPositions(names, stored) {
  const cols = Math.ceil(Math.sqrt(names.length));
  const students = Object.fromEntries(names.map((name, i) => [
    name,
    stored?.[name] ?? { x: (i % cols) * (CARD_SIZE + 20) + 40, y: Math.floor(i / cols) * (CARD_SIZE + 20) + 80 },
  ]));
  return {
    ...students,
    __door__:    stored?.__door__    ?? DEFAULT_SPECIAL_POS.__door__,
    __teacher__: stored?.__teacher__ ?? DEFAULT_SPECIAL_POS.__teacher__,
  };
}

function loadPositions(periodKey) {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY(periodKey)) || "null"); } catch (_) { return null; }
}

function savePositions(periodKey, positions) {
  try { localStorage.setItem(STORAGE_KEY(periodKey), JSON.stringify(positions)); } catch (_) {}
}

function loadUI(periodKey) {
  try { return { showDoor: true, showTeacher: true, ...JSON.parse(localStorage.getItem(SEATING_UI_KEY(periodKey)) || "{}") }; }
  catch (_) { return { showDoor: true, showTeacher: true }; }
}

function saveUI(periodKey, ui) {
  try { localStorage.setItem(SEATING_UI_KEY(periodKey), JSON.stringify(ui)); } catch (_) {}
}

export default function SeatingChart({ names, periodLabel, periodKey, onClose }) {
  const stored   = loadPositions(periodKey);
  const initUI   = loadUI(periodKey);

  const [positions, setPositions] = useState(() => initPositions(names, stored));
  const [rotation, setRotation]   = useState(0);
  const [showDoor,    setShowDoor]    = useState(initUI.showDoor);
  const [showTeacher, setShowTeacher] = useState(initUI.showTeacher);
  const canvasRef  = useRef(null);
  const dragging   = useRef(null);

  // Persist positions on change
  useEffect(() => { savePositions(periodKey, positions); }, [positions, periodKey]);

  // Persist UI toggles on change
  useEffect(() => { saveUI(periodKey, { showDoor, showTeacher }); }, [showDoor, showTeacher, periodKey]);

  // Add any student names that don't have positions yet
  useEffect(() => {
    setPositions(prev => {
      const missing = names.filter(n => !prev[n]);
      if (!missing.length) return prev;
      const cols = Math.ceil(Math.sqrt(names.length));
      const extra = Object.fromEntries(missing.map((name) => {
        const idx = names.indexOf(name);
        return [name, { x: (idx % cols) * (CARD_SIZE + 20) + 40, y: Math.floor(idx / cols) * (CARD_SIZE + 20) + 80 }];
      }));
      return { ...prev, ...extra };
    });
  }, [names]); // eslint-disable-line

  const cycleRotation = () => setRotation(r => ROTATIONS[(ROTATIONS.indexOf(r) + 1) % ROTATIONS.length]);
  const resetPositions = () => setPositions(initPositions(names, null));

  const toLocal = useCallback((dx, dy) => {
    const r = (rotation * Math.PI) / 180;
    return {
      x: dx * Math.cos(r) + dy * Math.sin(r),
      y: -dx * Math.sin(r) + dy * Math.cos(r),
    };
  }, [rotation]);

  const onCardMouseDown = useCallback((e, key) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = positions[key];
    dragging.current = { name: key, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  }, [positions]);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const { name, startX, startY, origX, origY } = dragging.current;
      const { x: dx, y: dy } = toLocal(e.clientX - startX, e.clientY - startY);
      setPositions(prev => ({ ...prev, [name]: { x: origX + dx, y: origY + dy } }));
    };
    const onUp = () => { dragging.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [toLocal]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const specialVisible = { __door__: showDoor, __teacher__: showTeacher };

  return (
    <div className="seating-overlay">
      <div className="seating-toolbar">
        <span className="seating-title">{periodLabel ? `${periodLabel} — Seating` : "Seating Chart"}</span>
        <button className="seating-tb-btn" onClick={cycleRotation} title="Rotate view 90°">
          ⟳ {rotation}°
        </button>
        <button className="seating-tb-btn" onClick={resetPositions} title="Reset all positions">
          Reset
        </button>

        <div className="seating-tb-divider" />

        <button
          className={`seating-tb-btn seating-tb-toggle seating-tb-toggle--door ${showDoor ? "seating-tb-toggle--on" : ""}`}
          onClick={() => setShowDoor(v => !v)}
          title="Toggle Door"
        >Door</button>
        <button
          className={`seating-tb-btn seating-tb-toggle seating-tb-toggle--teacher ${showTeacher ? "seating-tb-toggle--on" : ""}`}
          onClick={() => setShowTeacher(v => !v)}
          title="Toggle Teacher"
        >Teacher</button>

        <button className="seating-tb-btn seating-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="seating-canvas-wrap">
        <div
          className="seating-canvas"
          ref={canvasRef}
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div className="seating-front-label">▲ FRONT</div>

          {/* Special items: Door, Teacher */}
          {Object.entries(SPECIAL).map(([key, { label, w, h, className }]) => {
            if (!specialVisible[key]) return null;
            const pos = positions[key] ?? DEFAULT_SPECIAL_POS[key];
            return (
              <div
                key={key}
                className={`seating-card ${className}`}
                style={{ left: pos.x, top: pos.y, width: w, height: h }}
                onMouseDown={e => onCardMouseDown(e, key)}
              >
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
              <div
                key={name}
                className="seating-card"
                style={{ left: pos.x, top: pos.y, width: CARD_SIZE, height: CARD_SIZE }}
                onMouseDown={e => onCardMouseDown(e, name)}
              >
                <span style={{ transform: `rotate(-${rotation}deg)`, display: "block", transition: "transform 0.3s" }}>
                  {name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
