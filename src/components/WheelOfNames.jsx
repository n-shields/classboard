import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { playClick, playDing } from "../data/sounds";
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

// How fast a held Page Up/Down/arrow key repeats a gems adjustment — the
// browser's own OS-driven key-repeat rate varies and starts after a delay,
// so this drives its own interval instead of relying on repeat keydowns.
const GEMS_REPEAT_MS = 250; // 4 per second
const GEMS_PREVIEW_MS = 2000;

export default function WheelOfNames({
  names, excludedNames = [], colors = {},
  periodLabel, collapsed, onToggle,
  wheelColors = DEFAULT_WHEEL_COLORS, wheelText = "#ffffff",
  gems = {}, onGemsChange, gemsLabel = "Gems", jobs = {},
}) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const rotationRef = useRef(0);
  const [spinning,      setSpinning]      = useState(false);
  const [winner,        setWinner]        = useState(null);
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [wheelSettings, setWheelSettings] = useState(loadWheelSettings);
  const [gemsPreview,   setGemsPreview]   = useState(false);

  const activeNames = useMemo(
    () => names.filter(n => !excludedNames.includes(n)),
    [names, excludedNames],
  );

  useEffect(() => { setWinner(null); }, [names]);

  // ── Keyboard gems shortcuts: PageUp/PageDown ±10, ↑/↓ ±1, for every
  // student — held keys repeat at a fixed rate via our own timer, and each
  // adjustment (re-)shows a brief leaderboard preview over the wheel. ──
  const namesRef = useRef(names);
  const gemsRef = useRef(gems);
  const onGemsChangeRef = useRef(onGemsChange);
  useEffect(() => { namesRef.current = names; }, [names]);
  useEffect(() => { gemsRef.current = gems; }, [gems]);
  useEffect(() => { onGemsChangeRef.current = onGemsChange; }, [onGemsChange]);

  const previewTimerRef = useRef(null);
  const showGemsPreview = useCallback(() => {
    setGemsPreview(true);
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => setGemsPreview(false), GEMS_PREVIEW_MS);
  }, []);

  const applyGemsDelta = useCallback((delta) => {
    const handler = onGemsChangeRef.current;
    if (!handler) return;
    const currentNames = namesRef.current;
    const currentGems = gemsRef.current;
    const next = { ...currentGems };
    for (const name of currentNames) next[name] = Math.max(0, (next[name] || 0) + delta);
    handler(next);
    showGemsPreview();
    if (delta > 0) playDing(); else if (delta < 0) playClick();
  }, [showGemsPreview]);

  // `onGemsChange` (and thus this callback) gets a new identity on every
  // gems update, since it closes over the whole periodData state — reached
  // via a ref instead of a dependency, so a held key's repeat interval
  // isn't torn down and silently dropped mid-hold by that churn.
  const applyGemsDeltaRef = useRef(applyGemsDelta);
  useEffect(() => { applyGemsDeltaRef.current = applyGemsDelta; }, [applyGemsDelta]);

  useEffect(() => {
    const deltaForKey = (key) => {
      if (key === "PageUp") return 10;
      if (key === "PageDown") return -10;
      if (key === "ArrowUp") return 1;
      if (key === "ArrowDown") return -1;
      return 0;
    };
    const heldKeyRef = { current: null };
    const repeatTimerRef = { current: null };
    const stopRepeat = () => {
      if (repeatTimerRef.current) { clearInterval(repeatTimerRef.current); repeatTimerRef.current = null; }
      heldKeyRef.current = null;
    };
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (document.querySelector(".modal-overlay")) return;

      const delta = deltaForKey(e.key);
      if (!delta || !onGemsChangeRef.current) return;
      e.preventDefault();
      if (e.repeat || heldKeyRef.current === e.key) return; // we drive our own repeat, not the browser's
      applyGemsDeltaRef.current(delta);
      heldKeyRef.current = e.key;
      repeatTimerRef.current = setInterval(() => applyGemsDeltaRef.current(delta), GEMS_REPEAT_MS);
    };
    const onKeyUp = (e) => { if (e.key === heldKeyRef.current) stopRepeat(); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", stopRepeat);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stopRepeat);
      stopRepeat();
    };
  }, []);

  useEffect(() => () => clearTimeout(previewTimerRef.current), []);

  // Color a name to match its wheel segment, falling back to gray for
  // students currently excluded from the wheel — same rule StudentList uses.
  const colorFor = useCallback((name) => {
    if (colors[name]) return colors[name];
    const idx = activeNames.indexOf(name);
    if (idx === -1 || wheelColors.length === 0) return "#888888";
    return wheelColors[idx % wheelColors.length];
  }, [colors, activeNames, wheelColors]);

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
          {gemsPreview && (
            <div className="wheel-gems-preview">
              <div className="wheel-gems-preview-title">{periodLabel || "Students"}</div>
              <div className="wheel-gems-preview-list">
                {names.map(name => (
                  <div key={name} className="wheel-gems-preview-row">
                    <span className="wheel-gems-preview-name" style={{ backgroundColor: colorFor(name) }}>{name}</span>
                    {jobs[name] && <span className="wheel-gems-preview-job">{jobs[name]}</span>}
                    <span className="wheel-gems-preview-value" title={gemsLabel}>{gems[name] || 0}</span>
                  </div>
                ))}
              </div>
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

            <p className="wheel-settings-hint">
              Manage students from the “👥 Students” button in the top bar, or press
              {" "}<strong>Space</strong> to show/hide the list.
            </p>
            <p className="wheel-settings-hint">
              With no text field focused: <strong>Page Up</strong>/<strong>Page Down</strong> give
              or take 10 {gemsLabel} from every student; <strong>↑</strong>/<strong>↓</strong> give
              or take 1. Hold a key to repeat it 4 times a second. Each press briefly shows the
              student list here on the wheel.
            </p>

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
              <button className="btn btn-primary" onClick={() => setSettingsOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
