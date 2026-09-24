import { useState, useRef, useEffect } from "react";
import "./DecibelMeter.css";

// There's no way to get a calibrated, device-independent SPL reading out of
// a browser mic — every device's gain/sensitivity differs — so this reports
// a relative "dB" derived from the mic signal's own RMS level (dBFS) run
// through a user-adjustable linear transform (multiplier * dBFS + offset,
// i.e. y = mx + b — see the settings panel), rather than one baked-in
// offset, so it can be tuned by ear against whatever mic is actually in the
// room. It's a good louder/quieter indicator, not a calibrated measurement.
const DEFAULT_SETTINGS = { multiplier: 1, offset: 50 };
const DECIBEL_SETTINGS_KEY = "classboard_decibel_settings";
function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(DECIBEL_SETTINGS_KEY) || "{}") }; }
  catch (_) { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) {
  try { localStorage.setItem(DECIBEL_SETTINGS_KEY, JSON.stringify(s)); } catch (_) {}
}

const FFT_SIZE = 1024;
const SAMPLE_INTERVAL_MS = 150;
const WINDOW_MS = 60_000; // how much history the graph scrolls through
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

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    if (!w || !h) return;

    const now = performance.now();
    const windowStart = now - WINDOW_MS;
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

    const x = (t) => ((t - windowStart) / WINDOW_MS) * w;
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
        {/* The live number is overlaid directly on its own "graph" (the
            thermometer) rather than taking a separate row, so clicking
            either graph toggles that graph's number instead of needing its
            own dedicated readout row — saves the height that row used to
            cost. */}
        <div
          className="decibel-thermo-row"
          onClick={() => setLiveHidden(h => !h)}
          title={liveHidden ? "Click to show" : "Click to hide"}
        >
          <span className="decibel-thermo-label">0</span>
          <div className="decibel-thermo">
            <div className="decibel-thermo-gradient" />
            <div
              className="decibel-thermo-mask"
              style={{ left: `${Math.max(0, Math.min(100, (active ? level : 0) / THERMO_MAX * 100))}%` }}
            />
            <div className="decibel-thermo-overlay">
              <span className={`decibel-value ${liveHidden ? "decibel-value--hidden" : ""}`}>
                {active ? Math.round(level) : "—"}
              </span>
              <span className="decibel-unit">dB</span>
            </div>
          </div>
          <span className="decibel-thermo-label">{THERMO_MAX}</span>
        </div>

        <div
          className="decibel-graph-wrap"
          onClick={() => setAvgHidden(h => !h)}
          title={avgHidden ? "Click to show" : "Click to hide"}
        >
          <canvas ref={canvasRef} className="decibel-canvas" />
          <div className="decibel-graph-overlay">
            <span className={`decibel-value decibel-value--avg ${avgHidden ? "decibel-value--hidden" : ""}`}>
              {avg != null ? Math.round(avg) : "—"}
            </span>
            <span className="decibel-unit">avg</span>
          </div>
          {!active && (
            <div className="decibel-placeholder">
              {error ? (
                <span className="decibel-error">{error}</span>
              ) : (
                <span onClick={e => { e.stopPropagation(); startMic(); }} title="Start listening">🎙</span>
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
              these by ear: <strong>Offset</strong> shifts the baseline (raise it if silence
              isn't reading near 0), and <strong>Multiplier</strong> stretches the swing
              between quiet and loud.
            </p>
            <div className="decibel-settings-row">
              <label>Multiplier</label>
              <input
                type="number" min="0.1" max="10" step="0.1"
                value={settings.multiplier}
                onChange={e => updateSettings({ multiplier: Math.max(0.1, parseFloat(e.target.value) || 1) })}
              />
              <label>Offset</label>
              <input
                type="number" min="-200" max="200" step="1"
                value={settings.offset}
                onChange={e => updateSettings({ offset: parseFloat(e.target.value) || 0 })}
              />
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
