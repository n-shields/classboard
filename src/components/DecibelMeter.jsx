import { useState, useRef, useEffect } from "react";
import "./DecibelMeter.css";

// There's no way to get a calibrated, device-independent SPL reading out of
// a browser mic — every device's gain/sensitivity differs — so this reports
// a relative "dB" derived from the mic signal's own RMS level (dBFS) run
// through a user-adjustable linear transform (multiplier * dBFS + offset,
// i.e. y = mx + b, set by dragging a line segment's two endpoints in the
// settings panel), rather than one baked-in offset, so it can be tuned by
// ear against whatever mic is actually in the room. It's a good
// louder/quieter indicator, not a calibrated measurement.
//
// multiplier/offset are the values actually used to compute a reading;
// p1/p2 are just the two draggable handle points the curve editor shows,
// kept in sync with multiplier/offset (a line has infinite equivalent point
// pairs, so persisting the points themselves keeps the handles from jumping
// to some other pair on reload).
const CURVE_X_DOMAIN = [-80, 0]; // raw dBFS a mic signal can produce
const CURVE_Y_DOMAIN = [0, 100]; // displayed dB, matches THERMO_MAX below
const DEFAULT_SETTINGS = {
  multiplier: 1, offset: 50,
  p1: { x: -50, y: 0 },
  p2: { x: 0, y: 50 },
  windowSeconds: 60,
};
const DECIBEL_SETTINGS_KEY = "classboard_decibel_settings";
function loadSettings() {
  try {
    const raw = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(DECIBEL_SETTINGS_KEY) || "{}") };
    if (!raw.p1 || !raw.p2) {
      // Predates the curve editor — derive two on-line points from the flat
      // multiplier/offset that already existed, so a returning user's own
      // calibration still shows up as a line instead of snapping to default.
      const clampY = (v) => Math.max(CURVE_Y_DOMAIN[0], Math.min(CURVE_Y_DOMAIN[1], v));
      const x1 = -50, x2 = 0; // same reference x's as DEFAULT_SETTINGS' own points
      raw.p1 = { x: x1, y: clampY(Math.round(raw.multiplier * x1 + raw.offset)) };
      raw.p2 = { x: x2, y: clampY(Math.round(raw.multiplier * x2 + raw.offset)) };
    }
    return raw;
  } catch (_) { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) {
  try { localStorage.setItem(DECIBEL_SETTINGS_KEY, JSON.stringify(s)); } catch (_) {}
}

// Pixel layout for the curve editor's SVG (viewBox units, not CSS px).
const CURVE_W = 280, CURVE_H = 170;
const CURVE_MARGIN = { left: 32, right: 10, top: 10, bottom: 20 };
const CURVE_PLOT_W = CURVE_W - CURVE_MARGIN.left - CURVE_MARGIN.right;
const CURVE_PLOT_H = CURVE_H - CURVE_MARGIN.top - CURVE_MARGIN.bottom;
const curveSx = (dbfs) => CURVE_MARGIN.left + (dbfs - CURVE_X_DOMAIN[0]) / (CURVE_X_DOMAIN[1] - CURVE_X_DOMAIN[0]) * CURVE_PLOT_W;
const curveSy = (out)  => CURVE_MARGIN.top + CURVE_PLOT_H - (out - CURVE_Y_DOMAIN[0]) / (CURVE_Y_DOMAIN[1] - CURVE_Y_DOMAIN[0]) * CURVE_PLOT_H;

const FFT_SIZE = 1024;
const SAMPLE_INTERVAL_MS = 150;
const MIN_SPAN = 10; // floor for the auto-scaled range, so a flat/quiet
                      // stretch doesn't get blown up into a jittery-looking band
const THERMO_MAX = 100; // fixed full-scale for the live-value gauge — unlike
                         // the graph, a thermometer's scale doesn't wander

function readLevel(analyser, buffer, multiplier, offset) {
  analyser.getByteTimeDomainData(buffer);
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    const norm = (buffer[i] - 128) / 128;
    sumSquares += norm * norm;
  }
  const rms = Math.sqrt(sumSquares / buffer.length);
  const dBFS = 20 * Math.log10(rms || 1e-8);
  return Math.max(0, Math.round((dBFS * multiplier + offset) * 10) / 10);
}

export default function DecibelMeter() {
  const canvasRef   = useRef(null);
  const curveSvgRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const bufferRef   = useRef(null);
  const streamRef   = useRef(null);
  const intervalRef = useRef(null);
  // Kept as a ref (not state) since it's written many times a second — only
  // the current reading and the canvas actually need to re-render on change.
  const historyRef  = useRef([]);

  const [active,       setActive]       = useState(false);
  const [error,        setError]        = useState(null);
  const [level,        setLevel]        = useState(0);
  const [avg,          setAvg]          = useState(null);
  const [liveHidden,   setLiveHidden]   = useState(false);
  const [avgHidden,    setAvgHidden]    = useState(false);
  const [thermoHidden, setThermoHidden] = useState(false);
  const [settings,     setSettingsState] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // tick() runs inside a long-lived setInterval started once in startMic —
  // it needs whatever settings are current at sample time, not whichever
  // were in effect when that interval was created, so it reads this ref
  // rather than closing over the `settings` state directly.
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const updateSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettingsState(next);
    saveSettings(next);
  };

  // Maps a pointer event's screen position to a (dBFS, displayed-dB) point
  // in the curve editor's own data space, via the SVG's screen CTM — this
  // accounts for whatever CSS scaling the viewBox is actually rendered at,
  // rather than assuming the SVG's pixel size matches its viewBox.
  const curveClientToData = (clientX, clientY) => {
    const svg = curveSvgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    const rawX = CURVE_X_DOMAIN[0] + (loc.x - CURVE_MARGIN.left) / CURVE_PLOT_W * (CURVE_X_DOMAIN[1] - CURVE_X_DOMAIN[0]);
    const rawY = CURVE_Y_DOMAIN[0] + (CURVE_PLOT_H - (loc.y - CURVE_MARGIN.top)) / CURVE_PLOT_H * (CURVE_Y_DOMAIN[1] - CURVE_Y_DOMAIN[0]);
    return {
      x: Math.max(CURVE_X_DOMAIN[0], Math.min(CURVE_X_DOMAIN[1], Math.round(rawX))),
      y: Math.max(CURVE_Y_DOMAIN[0], Math.min(CURVE_Y_DOMAIN[1], Math.round(rawY))),
    };
  };

  // Drags one handle (the other stays put for the duration of this one
  // gesture, so it's safe to capture once rather than re-read on every
  // move); recomputes multiplier/offset from the two points on every move
  // for live visual feedback, but only persists once the drag ends.
  const startCurveDrag = (which) => (e) => {
    // React nulls out a SyntheticEvent's currentTarget once the handler that
    // received it returns, so it can't be read later from onMove/onUp —
    // those fire from native listeners after this handler has already
    // returned. Grab the real DOM element once, up front, instead.
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const other = which === "p1" ? settings.p2 : settings.p1;
    let dragged = which === "p1" ? settings.p1 : settings.p2;

    const pointsFor = (point) => {
      const p1 = which === "p1" ? point : other;
      const p2 = which === "p2" ? point : other;
      return { p1, p2 };
    };
    const applyMove = (point) => {
      dragged = point;
      const { p1, p2 } = pointsFor(point);
      if (p2.x === p1.x) return; // vertical segment — undefined slope, ignore this move
      const multiplier = (p2.y - p1.y) / (p2.x - p1.x);
      const offset = p1.y - multiplier * p1.x;
      setSettingsState(s => ({ ...s, p1, p2, multiplier, offset }));
    };

    const onMove = (ev) => applyMove(curveClientToData(ev.clientX, ev.clientY));
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      const { p1, p2 } = pointsFor(dragged);
      if (p2.x === p1.x) return;
      const multiplier = (p2.y - p1.y) / (p2.x - p1.x);
      const offset = p1.y - multiplier * p1.x;
      saveSettings({ multiplier, offset, p1, p2 });
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    if (!w || !h) return;

    // draw() is also called from the always-on interval below (created once
    // on mount), so it needs the current window setting via the ref, not a
    // value closed over at that interval's creation time.
    const windowMs = settingsRef.current.windowSeconds * 1000;
    const now = performance.now();
    const windowStart = now - windowMs;
    // Drop anything that's scrolled out of the window as we go, so the
    // buffer doesn't grow forever across a long session.
    const points = historyRef.current.filter(p => p.t >= windowStart);
    historyRef.current = points;
    if (points.length < 2) { setAvg(null); return; }

    let min = Infinity, max = -Infinity;
    for (const p of points) { if (p.v < min) min = p.v; if (p.v > max) max = p.v; }
    if (max - min < MIN_SPAN) {
      const mid = (max + min) / 2;
      min = mid - MIN_SPAN / 2;
      max = mid + MIN_SPAN / 2;
    }
    const pad = (max - min) * 0.15;
    min = Math.max(0, min - pad); // readings are floored at 0 — don't scale past that
    max += pad;

    const x = (t) => ((t - windowStart) / windowMs) * w;
    const y = (v) => h - ((v - min) / (max - min)) * h;
    const cs = getComputedStyle(canvas);
    const accent = cs.getPropertyValue("--accent").trim() || "#5b8dee";
    const warn   = cs.getPropertyValue("--warn").trim() || "#facc15";

    // Scale reference lines (top/bottom of the auto-scaled range).
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "10px Segoe UI, sans-serif";
    ctx.textBaseline = "top";
    [max, min].forEach(v => {
      const yy = y(v);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke();
      ctx.fillText(`${Math.round(v)}`, 4, Math.min(yy + 2, h - 11));
    });

    // Average of what's currently in view — a dashed line in its own color
    // so it reads as a computed stat, not another scale gridline. The
    // number itself is pushed to state and shown as the big overlay on the
    // graph instead of being labeled here too, which would risk overlapping
    // that overlay whenever the average sits near the top of the range.
    const avgValue = points.reduce((sum, p) => sum + p.v, 0) / points.length;
    setAvg(avgValue);
    const avgY = y(avgValue);
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = warn;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, avgY); ctx.lineTo(w, avgY); ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(x(points[0].t), h);
    points.forEach(p => ctx.lineTo(x(p.t), y(p.v)));
    ctx.lineTo(x(points[points.length - 1].t), h);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    points.forEach((p, i) => {
      const px = x(p.t), py = y(p.v);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  // Just samples and records — the separate always-on draw interval below
  // (which also has to keep running while the mic is off, so the graph
  // still visibly scrolls old readings away) is what actually repaints.
  const tick = () => {
    const analyser = analyserRef.current, buffer = bufferRef.current;
    if (!analyser || !buffer) return;
    const { multiplier, offset } = settingsRef.current;
    const v = readLevel(analyser, buffer, multiplier, offset);
    setLevel(v);
    historyRef.current.push({ t: performance.now(), v });
  };

  const stopMic = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    analyserRef.current = null;
    setActive(false);
  };

  const startMic = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      bufferRef.current = new Uint8Array(analyser.fftSize);
      setActive(true);
      intervalRef.current = setInterval(tick, SAMPLE_INTERVAL_MS);
    } catch (err) {
      setError(err.message || "Microphone access denied");
    }
  };

  const reset = () => {
    historyRef.current = [];
    draw();
  };

  // Auto-start on mount, matching the camera pane's behavior.
  useEffect(() => { startMic(); return stopMic; }, []); // eslint-disable-line

  // Redraw (auto-scaled to whatever's still in the window) even while idle,
  // so the graph keeps scrolling and old readings age out visually.
  useEffect(() => {
    const id = setInterval(draw, SAMPLE_INTERVAL_MS);
    const ro = new ResizeObserver(draw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => { clearInterval(id); ro.disconnect(); };
  }, []);

  return (
    <div className="card decibel-meter" tabIndex={-1}>
      <div className="card-body decibel-body">
        {/* A slim, always-in-place strip — its own colored fill toggles
            invisible on click (the bar's outline and 0/100 labels stay put
            as the click target), rather than a dedicated readout row like
            it used to be. */}
        <div
          className="decibel-thermo-row"
          onClick={() => setThermoHidden(h => !h)}
          title={thermoHidden ? "Click to show" : "Click to hide"}
        >
          <span className="decibel-thermo-label">0</span>
          <div className={`decibel-thermo ${thermoHidden ? "decibel-thermo--hidden" : ""}`}>
            <div className="decibel-thermo-gradient" />
            <div
              className="decibel-thermo-mask"
              style={{ left: `${Math.max(0, Math.min(100, (active ? level : 0) / THERMO_MAX * 100))}%` }}
            />
          </div>
          <span className="decibel-thermo-label">{THERMO_MAX}</span>
        </div>

        {/* Both numbers live on top of the time graph itself now, pinned to
            its left and right edges — each toggles only itself, since they
            now share one surface instead of each having its own graph to
            click. */}
        <div className="decibel-graph-wrap">
          <canvas ref={canvasRef} className="decibel-canvas" />

          <div
            className="decibel-graph-value decibel-graph-value--live"
            onClick={() => setLiveHidden(h => !h)}
            title={liveHidden ? "Click to show" : "Click to hide"}
          >
            <span className={`decibel-value ${liveHidden ? "decibel-value--hidden" : ""}`}>
              {active ? Math.round(level) : "—"}
            </span>
            <span className={`decibel-unit ${liveHidden ? "decibel-value--hidden" : ""}`}>dB</span>
          </div>

          <div
            className="decibel-graph-value decibel-graph-value--avg"
            onClick={() => setAvgHidden(h => !h)}
            title={avgHidden ? "Click to show" : "Click to hide"}
          >
            <span className={`decibel-value decibel-value--avg ${avgHidden ? "decibel-value--hidden" : ""}`}>
              {avg != null ? Math.round(avg) : "—"}
            </span>
            <span className={`decibel-unit ${avgHidden ? "decibel-value--hidden" : ""}`}>avg</span>
          </div>

          {!active && (
            <div className="decibel-placeholder">
              {error ? (
                <span className="decibel-error">{error}</span>
              ) : (
                <span onClick={startMic} title="Start listening">🎙</span>
              )}
            </div>
          )}
        </div>

        <div className="decibel-controls">
          <button
            className={`decibel-btn ${active ? "decibel-btn-danger" : ""}`}
            onClick={active ? stopMic : startMic}
            title={active ? "Stop listening" : "Start listening"}
          >{active ? "■" : "🎙"}</button>
          <button className="decibel-btn" onClick={reset} title="Clear the graph">↺</button>
          <button className="decibel-btn" onClick={() => setSettingsOpen(true)} title="Calibration settings">⚙</button>
        </div>
      </div>

      {settingsOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSettingsOpen(false)}>
          <div className="modal decibel-settings-modal">
            <h2>Decibel calibration</h2>
            <p className="decibel-settings-hint">
              There's no way to get a truly calibrated reading from a browser mic, so tune
              this by ear: drag either end of the line to map the mic's raw input (x) onto
              a displayed value (y). Raise the right end if silence isn't reading near 0;
              tilt the line to stretch or compress the swing between quiet and loud.
            </p>

            <svg
              ref={curveSvgRef}
              viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
              className="decibel-curve-svg"
            >
              <rect
                x={CURVE_MARGIN.left} y={CURVE_MARGIN.top}
                width={CURVE_PLOT_W} height={CURVE_PLOT_H}
                className="decibel-curve-plot-bg"
              />
              <text x={CURVE_MARGIN.left} y={CURVE_H} className="decibel-curve-axis-label">{CURVE_X_DOMAIN[0]}</text>
              <text x={CURVE_W - CURVE_MARGIN.right} y={CURVE_H} textAnchor="end" className="decibel-curve-axis-label">{CURVE_X_DOMAIN[1]} (raw)</text>
              <text x={CURVE_MARGIN.left - 4} y={curveSy(CURVE_Y_DOMAIN[1]) + 8} textAnchor="end" className="decibel-curve-axis-label">{CURVE_Y_DOMAIN[1]}</text>
              <text x={CURVE_MARGIN.left - 4} y={curveSy(CURVE_Y_DOMAIN[0])} textAnchor="end" className="decibel-curve-axis-label">{CURVE_Y_DOMAIN[0]}</text>
              <line
                x1={curveSx(settings.p1.x)} y1={curveSy(settings.p1.y)}
                x2={curveSx(settings.p2.x)} y2={curveSy(settings.p2.y)}
                className="decibel-curve-line"
              />
              {[["p1", settings.p1], ["p2", settings.p2]].map(([which, p]) => (
                <circle
                  key={which}
                  cx={curveSx(p.x)} cy={curveSy(p.y)} r="7"
                  className="decibel-curve-handle"
                  onPointerDown={startCurveDrag(which)}
                />
              ))}
            </svg>

            <div className="decibel-curve-formula">
              y = {settings.multiplier.toFixed(2)}x {settings.offset >= 0 ? "+" : "−"} {Math.abs(settings.offset).toFixed(1)}
            </div>

            <div className="decibel-settings-row">
              <label>Graph window</label>
              <input
                type="number" min="10" max="600" step="5"
                value={settings.windowSeconds}
                onChange={e => updateSettings({ windowSeconds: Math.max(10, parseInt(e.target.value, 10) || 60) })}
              />
              <span>s</span>
            </div>

            <div className="decibel-settings-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => updateSettings(DEFAULT_SETTINGS)}>Reset to default</button>
              <button className="btn btn-primary btn-sm" onClick={() => setSettingsOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
