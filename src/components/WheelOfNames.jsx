import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import "./WheelOfNames.css";

const WHEEL_SETTINGS_KEY = "classboard_wheel_settings";
function loadWheelSettings() {
  try { return { spinDuration: 3, displayDuration: 3, avoidRepeat: false, ...JSON.parse(localStorage.getItem(WHEEL_SETTINGS_KEY) || "{}") }; }
  catch (_) { return { spinDuration: 3, displayDuration: 3, avoidRepeat: false }; }
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
  names, excludedNames = [], colors = {},
  periodLabel, collapsed, onToggle,
  wheelColors = DEFAULT_WHEEL_COLORS, wheelText = "#ffffff",
}) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const rotationRef = useRef(0);
  const winnerRef = useRef(null);
  const measureCanvasRef = useRef(null);
  const lastWinnerRef = useRef(null);
  const [spinning,      setSpinning]      = useState(false);
  const [winner,        setWinner]        = useState(null);
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [wheelSettings, setWheelSettings] = useState(loadWheelSettings);

  const activeNames = useMemo(
    () => names.filter(n => !excludedNames.includes(n)),
    [names, excludedNames],
  );

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
      const name = activeNames[i];
      const startAngle = rotation + i * segAngle - Math.PI / 2;
      const endAngle   = startAngle + segAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = colors[name] || wheelColors[i % wheelColors.length];
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
  }, [activeNames, periodLabel, wheelColors, wheelText, colors]);

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

    const n = activeNames.length;
    const segAngle = (2 * Math.PI) / n;

    // Pick the winner up front (rather than spinning to a random angle and
    // reading off whoever that lands on) so a "no repeats" setting can just
    // exclude last spin's winner from the pool here — there's always at
    // least one other name to exclude to, since spinning at all requires 2+.
    let eligible = activeNames.map((_, i) => i);
    if (wheelSettings.avoidRepeat && lastWinnerRef.current) {
      const filtered = eligible.filter(i => activeNames[i] !== lastWinnerRef.current);
      if (filtered.length > 0) eligible = filtered;
    }
    const winnerIndex = eligible[Math.floor(Math.random() * eligible.length)];
    const winnerName  = activeNames[winnerIndex];
    // Land somewhere in the middle of the chosen segment, not flush against
    // either edge, so it's visually unambiguous which wedge the pointer hit.
    const frac = 0.1 + Math.random() * 0.8;

    const startRotation = rotationRef.current;
    // See drawWheel: segment i sits under the (fixed, top) pointer when
    // rotation ≡ -(i + frac) * segAngle (mod 2π). Pick a few full visual
    // turns, then nudge by whatever's needed to land exactly on that target
    // angle, so the wheel always spins forward and still stops on winnerIndex.
    const targetMod  = (((-(winnerIndex + frac) * segAngle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const baseTurns  = (3 + Math.floor(Math.random() * 3)) * 2 * Math.PI;
    const currentMod = ((startRotation + baseTurns) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const adjustment = ((targetMod - currentMod) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const totalSpin  = baseTurns + adjustment;
    const endRotation = startRotation + totalSpin;
    const duration     = (wheelSettings.spinDuration ?? 3) * 1000;
    const startTime    = performance.now();

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
        lastWinnerRef.current = winnerName;
        setWinner(winnerName);
      }
    };
    animRef.current = requestAnimationFrame(animate);
  }, [spinning, activeNames, drawWheel, wheelSettings.spinDuration, wheelSettings.avoidRepeat]);

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  // Size the winner's name as large as will fit on one line: measure it off
  // a hidden canvas at a fixed reference size, then scale by however much
  // headroom the overlay actually has (width-bound for long names,
  // height-bound for short ones), so "Al" fills the wheel and "Bartholomew"
  // shrinks just enough to stay on one line instead of truncating.
  useLayoutEffect(() => {
    const el = winnerRef.current;
    if (!winner || !el) return;
    if (!measureCanvasRef.current) measureCanvasRef.current = document.createElement("canvas");
    const REF = 200; // reference px size for measurement — arbitrary, just needs to be large for precision
    const LETTER_SPACING_EM = 0.02; // keep in sync with .wheel-winner-overlay's letter-spacing

    const fit = () => {
      const cs = getComputedStyle(el);
      const availW = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (availW <= 0 || availH <= 0) return;

      const ctx = measureCanvasRef.current.getContext("2d");
      ctx.font = `${cs.fontWeight} ${REF}px ${cs.fontFamily}`;
      const textWidth = ctx.measureText(winner).width + REF * LETTER_SPACING_EM * Math.max(0, winner.length - 1);

      const byWidth  = REF * (availW / Math.max(textWidth, 1));
      const byHeight = availH * 0.82; // headroom above/below a single line
      el.style.fontSize = `${Math.max(20, Math.min(byWidth, byHeight, 400))}px`;
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [winner]);

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
              ref={winnerRef}
              className="wheel-winner-overlay"
              style={{ animationDuration: `${wheelSettings.displayDuration ?? 3}s` }}
              onAnimationEnd={() => setWinner(null)}
            >
              {winner}
            </div>
          )}
        </div>
        <button className="wheel-settings-btn" onClick={() => setSettingsOpen(true)} title="Wheel settings">⚙</button>
      </div>

      {settingsOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSettingsOpen(false)}>
          <div className="modal wheel-modal">
            <div className="wheel-modal-header">
              <h2>Wheel settings{periodLabel ? ` — ${periodLabel}` : ""}</h2>
              {names.length > 0 && (
                <span className="wheel-active-count">
                  {activeNames.length} / {names.length} in wheel
                </span>
              )}
            </div>

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

            <label className="wheel-settings-row">
              <input
                type="checkbox"
                checked={!!wheelSettings.avoidRepeat}
                onChange={e => {
                  const s = { ...wheelSettings, avoidRepeat: e.target.checked };
                  setWheelSettings(s); saveWheelSettings(s);
                }}
              />
              Don't call the same name twice in a row
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn btn-primary" onClick={() => setSettingsOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
