import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import "./WheelOfNames.css";

const WHEEL_SETTINGS_KEY = "classboard_wheel_settings";
function loadWheelSettings() {
  try { return { spinDuration: 3, displayDuration: 3, ...JSON.parse(localStorage.getItem(WHEEL_SETTINGS_KEY) || "{}") }; }
  catch (_) { return { spinDuration: 3, displayDuration: 3 }; }
}
function saveWheelSettings(s) {
  try { localStorage.setItem(WHEEL_SETTINGS_KEY, JSON.stringify(s)); } catch (_) {}
}

const DEFAULT_WHEEL_COLORS = [
  "#e94560", "#0f3460", "#533483", "#1a7431",
  "#b5451b", "#1a5276", "#76448a", "#1e8bc3",
  "#27ae60", "#e67e22", "#c0392b", "#2980b9",
];

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function WheelOfNames({
  names, onNamesChange,
  excludedNames = [], onExcludedNamesChange,
  periodLabel, collapsed, onToggle,
  wheelColors = DEFAULT_WHEEL_COLORS, wheelText = "#ffffff",
}) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const rotationRef = useRef(0);
  const [spinning,      setSpinning]      = useState(false);
  const [winner,        setWinner]        = useState(null);
  const [editOpen,      setEditOpen]      = useState(false);
  const [editText,      setEditText]      = useState("");
  const [showEditText,  setShowEditText]  = useState(false);
  const [wheelSettings, setWheelSettings] = useState(loadWheelSettings);

  const activeNames = useMemo(
    () => names.filter(n => !excludedNames.includes(n)),
    [names, excludedNames],
  );

  const toggleExclude = (name) => {
    const next = excludedNames.includes(name)
      ? excludedNames.filter(n => n !== name)
      : [...excludedNames, name];
    onExcludedNamesChange?.(next);
  };

  useEffect(() => { setWinner(null); }, [names]);

  const drawWheel = useCallback((rotation) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const radius = Math.min(cx, cy) - 8;
    if (radius <= 0) return;
    const n = activeNames.length;

    ctx.clearRect(0, 0, W, H);

    if (n === 0) {
      ctx.fillStyle = "#777";
      ctx.font = "14px Segoe UI";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(periodLabel ? `No students for ${periodLabel}` : "Add names to spin", cx, cy);
      return;
    }

    const segAngle = (2 * Math.PI) / n;
    for (let i = 0; i < n; i++) {
      const startAngle = rotation + i * segAngle - Math.PI / 2;
      const endAngle   = startAngle + segAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = wheelColors[i % wheelColors.length];
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const textAngle    = startAngle + segAngle / 2;
      const flipped      = Math.cos(textAngle) < 0;
      const textRotation = flipped ? textAngle + Math.PI : textAngle;
      const textRadius   = radius * 0.55;

      ctx.save();
      ctx.translate(cx + textRadius * Math.cos(textAngle), cy + textRadius * Math.sin(textAngle));
      ctx.rotate(textRotation);

      const name      = activeNames[i];
      const maxWidth  = radius * 0.72;
      const arcHeight = segAngle * textRadius;
      const byWidth   = maxWidth / Math.max(name.length, 1) / 0.58;
      const byHeight  = arcHeight * 0.62;
      const byRadius  = radius * 0.13;
      const fontSize  = Math.max(radius * 0.022, Math.min(byWidth, byHeight, byRadius));
      ctx.font        = `bold ${fontSize}px Segoe UI`;
      ctx.fillStyle   = wheelText;
      ctx.textAlign   = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur  = 3;
      ctx.fillText(name, 0, 0, maxWidth);
      ctx.restore();
    }

    // Center hub
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, 2 * Math.PI);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pointer triangle
    const py = cy - radius - 4;
    ctx.beginPath();
    ctx.moveTo(cx, py + 2);
    ctx.lineTo(cx - 12, py - 18);
    ctx.lineTo(cx + 12, py - 18);
    ctx.closePath();
    ctx.fillStyle = "#facc15";
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [activeNames, periodLabel, wheelColors, wheelText]);

  useEffect(() => { drawWheel(rotationRef.current); }, [drawWheel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      const size = Math.min(parent.clientWidth, parent.clientHeight);
      canvas.width = size;
      canvas.height = size;
      drawWheel(rotationRef.current);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [drawWheel]);

  const spin = useCallback(() => {
    if (spinning || activeNames.length < 2) return;
    setSpinning(true);
    setWinner(null);

    const startRotation = rotationRef.current;
    const totalSpin     = (3 + Math.random() * 2) * 2 * Math.PI + Math.random() * 2 * Math.PI;
    const endRotation   = startRotation + totalSpin;
    const duration      = (wheelSettings.spinDuration ?? 3) * 1000;
    const startTime     = performance.now();

    const animate = (now) => {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const cur      = startRotation + totalSpin * easeOut(progress);
      rotationRef.current = cur;
      drawWheel(cur);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        rotationRef.current = endRotation;
        setSpinning(false);
        const n          = activeNames.length;
        const segAngle   = (2 * Math.PI) / n;
        const normalized = ((-(endRotation % (2 * Math.PI))) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        setWinner(activeNames[Math.floor(normalized / segAngle) % n]);
      }
    };
    animRef.current = requestAnimationFrame(animate);
  }, [spinning, activeNames, drawWheel, wheelSettings.spinDuration]);

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const openEditor = () => {
    setEditText(names.join("\n"));
    setEditOpen(true);
  };

  const handleEditChange = (text) => {
    setEditText(text);
    const newNames = text.split("\n").map(s => s.trim()).filter(Boolean);
    onNamesChange(newNames);
  };

  const canSpin = !spinning && activeNames.length >= 2;

  return (
    <div className={`card wheel-card ${collapsed ? "card--collapsed" : ""}`} tabIndex={-1}>
      <div className="card-body wheel-body">
        <div className="canvas-container" onMouseDown={e => { if (e.target === canvasRef.current) e.preventDefault(); }}>
          <canvas
            ref={canvasRef}
            className={`wheel-canvas ${canSpin ? "wheel-clickable" : ""}`}
            onClick={spin}
            title={activeNames.length < 2 ? "Need at least 2 active students" : "Click to spin!"}
          />
          {winner && (
            <div
              className="wheel-winner-overlay"
              style={{ animationDuration: `${wheelSettings.displayDuration ?? 3}s` }}
              onAnimationEnd={() => setWinner(null)}
            >
              {winner}
            </div>
          )}
        </div>
        <button className="wheel-settings-btn" onClick={openEditor} title="Edit names">⚙</button>
      </div>

      {editOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditOpen(false)}>
          <div className="modal wheel-modal">
            <div className="wheel-modal-header">
              <h2>Students{periodLabel ? ` — ${periodLabel}` : ""}</h2>
              {names.length > 0 && (
                <span className="wheel-active-count">
                  {activeNames.length} / {names.length} in wheel
                </span>
              )}
            </div>

            {/* Name list with include/exclude toggles */}
            {names.length > 0 && (
              <>
                <div className="wheel-name-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => onExcludedNamesChange?.([])}>All</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onExcludedNamesChange?.(names.slice())}>None</button>
                </div>
                <div className="wheel-name-list">
                  {names.map(name => {
                    const excluded = excludedNames.includes(name);
                    return (
                      <label key={name} className={`wheel-name-row ${excluded ? "wheel-name-row--excluded" : ""}`}>
                        <input
                          type="checkbox"
                          checked={!excluded}
                          onChange={() => toggleExclude(name)}
                        />
                        <span>{name}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}

            {/* Collapsible edit textarea */}
            <button
              className="btn btn-ghost btn-sm wheel-edit-toggle"
              onClick={() => setShowEditText(v => !v)}
            >
              {showEditText ? "▲ Hide list editor" : "▼ Edit list"}
            </button>
            {showEditText && (
              <textarea
                className="wheel-edit-textarea"
                value={editText}
                onChange={e => handleEditChange(e.target.value)}
                placeholder="One name per line"
                autoFocus
              />
            )}

            {/* Timing settings */}
            <div className="wheel-settings-row">
              <label>Spin time</label>
              <input
                type="number" min="0.5" max="20" step="0.5"
                value={wheelSettings.spinDuration}
                onChange={e => {
                  const s = { ...wheelSettings, spinDuration: Math.max(0.5, parseFloat(e.target.value) || 3) };
                  setWheelSettings(s); saveWheelSettings(s);
                }}
              />
              <span>s</span>
              <label style={{ marginLeft: 12 }}>Show winner</label>
              <input
                type="number" min="0.5" max="15" step="0.5"
                value={wheelSettings.displayDuration}
                onChange={e => {
                  const s = { ...wheelSettings, displayDuration: Math.max(0.5, parseFloat(e.target.value) || 3) };
                  setWheelSettings(s); saveWheelSettings(s);
                }}
              />
              <span>s</span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn btn-primary" onClick={() => setEditOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
