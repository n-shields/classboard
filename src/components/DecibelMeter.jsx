import { useState, useRef, useEffect } from "react";
import "./DecibelMeter.css";
import { playChallengeWin, playChallengeLose } from "../data/sounds";

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
const CURVE_Y_DOMAIN = [0, 100]; // displayed 0–100 noise level, matches THERMO_MAX below
// During a challenge the pane's background tints from green (average well
// under target) to red (average at or over it) — CHALLENGE_TINT_SPAN is how
// many dB below the target counts as "fully green".
const CHALLENGE_TINT_SPAN = 20;
function challengeTint(avg, targetDb) {
  const closeness = Math.max(0, Math.min(1, 1 - (targetDb - avg) / CHALLENGE_TINT_SPAN));
  const hue = 120 * (1 - closeness); // 120 = green → 0 = red
  return `hsla(${hue}, 75%, 45%, 0.35)`;
}

// reward is given to everyone on a win, cost taken from everyone on a loss
// (0 = no penalty); playSound plays the win/lose sting (and the per-point
// ticks) at the end; autoRepeat starts the next round as soon as one ends.
// targetDb is the max average on the 0–100 scale; targetLevel the max
// level (0–3) used instead when the meter is showing levels.
const DEFAULT_CHALLENGE_DRAFT = { durationMin: 5, targetDb: 60, targetLevel: 1, reward: 5, cost: 0, playSound: true, autoRepeat: false };

// Optional "levels" display (common classroom noise scales — 0–3, 0–5 or
// 0–10): the 0–100 reading is partitioned by N ascending thresholds — below
// the first is level 0, at/above the last is level N — each drawn in its own
// color. Each scale keeps its own thresholds (0–3's under the original
// levelThresholds key, so older saved settings carry over).
const LEVEL_SCALES = { levels: 3, levels5: 5, levels10: 10 }; // settings.scale → top level
const levelThresholdsKey = (max) => (max === 3 ? "levelThresholds" : `levelThresholds${max}`);
// An even split of 0–100 into max+1 bands (0–3 → 25/50/75).
const defaultLevelThresholds = (max) => Array.from({ length: max }, (_, i) => Math.round(100 * (i + 1) / (max + 1)));
const validLevelThresholds = (t, max) =>
  Array.isArray(t) && t.length === max && t.every((v, i) => v > 0 && v < 100 && (i === 0 || v > t[i - 1]));
// Green → yellow → orange → red: exactly those four for 0–3, blended evenly
// along the same path for the longer scales.
const LEVEL_ANCHORS = ["#22c55e", "#eab308", "#f97316", "#ef4444"];
function levelColors(max) {
  if (max === LEVEL_ANCHORS.length - 1) return LEVEL_ANCHORS;
  const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return Array.from({ length: max + 1 }, (_, lvl) => {
    const pos = lvl / max * (LEVEL_ANCHORS.length - 1);
    const k = Math.min(LEVEL_ANCHORS.length - 2, Math.floor(pos));
    const f = pos - k;
    const [a, b] = [rgb(LEVEL_ANCHORS[k]), rgb(LEVEL_ANCHORS[k + 1])];
    return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * f)).join(", ")})`;
  });
}
function levelOf(v, thresholds) {
  return thresholds.filter(t => v >= t).length;
}
// The 0–100 value a level tops out just below (the top level runs to the end).
function levelUpperBound(level, thresholds) {
  return level < thresholds.length ? thresholds[level] : 100;
}
// How long a challenge's reward/cost takes to count onto the points.
const CHALLENGE_COUNT_MS = 2000;
const DEFAULT_SETTINGS = {
  multiplier: 1, offset: 50,
  p1: { x: -50, y: 0 },
  p2: { x: 0, y: 50 },
  windowSeconds: 60,
  avgWindowSeconds: 60, // independent of windowSeconds — the average can
                         // run over a shorter/longer span than the graph
                         // actually plots (e.g. "last 10s" vs. "last 5min")
  // Which readouts are toggled invisible, and the Noise Challenge setup's
  // last-used values — persisted alongside the calibration so they survive
  // the pane being remounted (redocked/moved) and ride along in Export.
  liveHidden: false, avgHidden: false, thermoHidden: false, graphHidden: false,
  challengeDraft: DEFAULT_CHALLENGE_DRAFT,
  scale: "100", // "100" (0–100) | a LEVEL_SCALES key ("levels" = 0–3, "levels5", "levels10")
  ...Object.fromEntries(Object.values(LEVEL_SCALES).map(max => [levelThresholdsKey(max), defaultLevelThresholds(max)])),
};
const DECIBEL_SETTINGS_KEY = "classboard_decibel_settings";
function loadSettings() {
  try {
    const raw = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(DECIBEL_SETTINGS_KEY) || "{}") };
    raw.challengeDraft = { ...DEFAULT_CHALLENGE_DRAFT, ...raw.challengeDraft };
    for (const max of Object.values(LEVEL_SCALES)) {
      const key = levelThresholdsKey(max);
      if (!validLevelThresholds(raw[key], max)) raw[key] = defaultLevelThresholds(max);
    }
    if (raw.scale !== "100" && !LEVEL_SCALES[raw.scale]) raw.scale = "100";
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
// The live reading is the loudest sample seen within each 250ms window, not
// just whatever single sample happened to land on a tick — FAST_SAMPLE_MS is
// how often the analyser is actually polled to catch that peak, well inside
// PEAK_WINDOW_MS, which is the cadence the displayed value/history/challenge
// tally actually update at.
const FAST_SAMPLE_MS = 30;
const PEAK_WINDOW_MS = 250;
const MIN_SPAN = 10; // floor for the auto-scaled range, so a flat/quiet
                      // stretch doesn't get blown up into a jittery-looking band
const THERMO_MAX = 100; // fixed full-scale for the live-value gauge — unlike
                         // the graph, a thermometer's scale doesn't wander

function formatCountdown(endAt) {
  const remainingSec = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
  const m = Math.floor(remainingSec / 60);
  const s = remainingSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Auto-calibrate: records the quietest and loudest raw (dBFS) readings
// seen while it runs, then fits the line so the quietest maps to the
// bottom of the 0–100 scale and the loudest to the top. Needs at least CAL_MIN_RANGE of raw swing to be
// meaningful (otherwise the line would come out absurdly steep).
const CAL_QUIET = CURVE_Y_DOMAIN[0];
const CAL_LOUD = CURVE_Y_DOMAIN[1];
const CAL_MIN_RANGE = 6;

function readDbfs(analyser, buffer) {
  analyser.getByteTimeDomainData(buffer);
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    const norm = (buffer[i] - 128) / 128;
    sumSquares += norm * norm;
  }
  const rms = Math.sqrt(sumSquares / buffer.length);
  return 20 * Math.log10(rms || 1e-8);
}

function toLevel(dBFS, multiplier, offset) {
  // Clamped to the meter's 0–100 scale at both ends.
  return Math.max(0, Math.min(THERMO_MAX, Math.round((dBFS * multiplier + offset) * 10) / 10));
}

// A 0–100 bar split into the four level bands, with a draggable handle on
// each of the three boundaries (each confined between its neighbors, so the
// order can't flip). Arrow keys nudge a focused handle by 1.
function LevelPartitionBar({ thresholds, colors, onChange }) {
  const trackRef = useRef(null);
  const limitsFor = (i) => [
    (i === 0 ? 0 : thresholds[i - 1]) + 1,
    (i === thresholds.length - 1 ? 100 : thresholds[i + 1]) - 1,
  ];
  const setAt = (i, v) => {
    const [lo, hi] = limitsFor(i);
    const next = thresholds.slice();
    next[i] = Math.max(lo, Math.min(hi, Math.round(v)));
    if (next[i] !== thresholds[i]) onChange(next);
  };
  const startDrag = (i) => (e) => {
    e.preventDefault();
    const target = e.currentTarget; // see startCurveDrag on why this is grabbed up front
    target.setPointerCapture(e.pointerId);
    target.focus();
    // Neighbors stay put for this gesture, so the limits and the base array
    // can be captured once rather than re-read on every move.
    const [lo, hi] = limitsFor(i);
    const base = thresholds.slice();
    const onMove = (ev) => {
      const rect = trackRef.current.getBoundingClientRect();
      const v = Math.round((ev.clientX - rect.left) / rect.width * 100);
      const next = base.slice();
      next[i] = Math.max(lo, Math.min(hi, v));
      onChange(next);
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  };
  const bounds = [0, ...thresholds, 100];
  return (
    <div className="level-bar" ref={trackRef}>
      {colors.map((color, lvl) => (
        <div
          key={lvl}
          className={`level-bar-seg ${lvl === 0 ? "level-bar-seg--first" : ""} ${lvl === colors.length - 1 ? "level-bar-seg--last" : ""}`}
          style={{ left: `${bounds[lvl]}%`, width: `${bounds[lvl + 1] - bounds[lvl]}%`, background: color }}
        >{lvl}</div>
      ))}
      {thresholds.map((t, i) => (
        <div
          key={i}
          className="level-bar-handle"
          style={{ left: `${t}%` }}
          role="slider"
          tabIndex={0}
          aria-label={`Start of level ${i + 1}`}
          aria-valuemin={limitsFor(i)[0]}
          aria-valuemax={limitsFor(i)[1]}
          aria-valuenow={t}
          title={`Level ${i + 1} starts at ${t}`}
          onPointerDown={startDrag(i)}
          onKeyDown={e => {
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setAt(i, t - 1); }
            if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setAt(i, t + 1); }
          }}
        >
          <span className="level-bar-handle-value">{t}</span>
        </div>
      ))}
    </div>
  );
}

export default function DecibelMeter({ onChallengeResult, pointsLabel = "Gems" }) {
  const canvasRef   = useRef(null);
  const curveSvgRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const bufferRef   = useRef(null);
  const streamRef   = useRef(null);
  const intervalRef = useRef(null); // the fast analyser-polling loop
  const commitIntervalRef = useRef(null); // the 250ms "land the window's peak" loop
  // Whether *we* currently want the mic running — separate from the `active`
  // state, which only updates on a render. Set true at the start of
  // startMic, false at the start of stopMic; checked from the track's own
  // onended handler (see startMic) to tell "the user/unmount asked for this"
  // apart from "the mic died out from under us and should try to reconnect".
  const wantActiveRef = useRef(false);
  // An auto-repeat round waiting for the previous round's points to finish
  // counting on — cleared by cancel, a manual start, or the mic stopping.
  const repeatTimerRef = useRef(null);
  const clearRepeatTimer = () => {
    if (repeatTimerRef.current) { clearTimeout(repeatTimerRef.current); repeatTimerRef.current = null; }
  };
  // The loudest sample seen since the last commit — reset to 0 (toLevel's
  // own floor) each time commitPeak lands it as the actual reading.
  const peakRef = useRef(0);
  // Same idea in raw dBFS, only tracked while auto-calibrating — each
  // committed window's loudest raw sample feeds the calibration's min/max
  // (so a single 30ms dropout between words can't pass for "quiet").
  const rawPeakRef = useRef(-Infinity);
  const calRef = useRef(null); // { min, max } raw dBFS while auto-calibrating | null
  const [calibration, setCalibration] = useState(null); // { min, max } | null — mirrors calRef for display
  const [calMessage, setCalMessage] = useState(null);
  // Kept as a ref (not state) since it's written many times a second — only
  // the current reading and the canvas actually need to re-render on change.
  const historyRef  = useRef([]);

  const [active,       setActive]       = useState(false);
  const [error,        setError]        = useState(null);
  const [level,        setLevel]        = useState(0);
  const [avg,          setAvg]          = useState(null);
  const [settings,     setSettingsState] = useState(loadSettings);
  const { liveHidden, avgHidden, thermoHidden, graphHidden, challengeDraft } = settings;
  const levelMax = LEVEL_SCALES[settings.scale] ?? null;
  const levelsMode = levelMax != null;
  const thresholds = levelsMode ? settings[levelThresholdsKey(levelMax)] : null;
  const colors = levelsMode ? levelColors(levelMax) : null;
  // The challenge target level, kept within the current scale (a draft saved
  // as, say, level 7 on 0–10 reads as 3 once switched to 0–3).
  const draftTargetLevel = levelsMode ? Math.min(challengeDraft.targetLevel, levelMax) : null;
  // A 0–100 reading as displayed: rounded, or its 0–3 level (and color).
  const fmtValue = (v) => (levelsMode ? levelOf(v, thresholds) : Math.round(v));
  const valueColor = (v) => (levelsMode && v != null ? colors[levelOf(v, thresholds)] : undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // tick() runs inside a long-lived setInterval started once in startMic —
  // it needs whatever settings are current at sample time, not whichever
  // were in effect when that interval was created, so it reads this ref
  // rather than closing over the `settings` state directly.
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Noise Challenge: keep the actual running state (target/deadline/running
  // sum) in a ref, mutated directly inside tick() — same reasoning as
  // historyRef, it's written many times a second and only needs to drive a
  // render when something a person actually looks at changes. challengeUI
  // mirrors just the static parts (deadline/target/reward) for rendering the
  // countdown; challengeResult is the brief win/lose banner shown once it ends.
  // targetLevel/thresholds are set (and targetDb is that level's upper
  // bound) only for a challenge started while showing levels; null otherwise.
  const challengeRef = useRef(null); // { endAt, durationMin, targetDb, targetLevel, thresholds, reward, cost, playSound, autoRepeat, sum, count } | null
  const [challengeUI, setChallengeUI] = useState(null); // { endAt, targetDb, targetLevel, reward, cost, autoRepeat } | null
  const [challengeResult, setChallengeResult] = useState(null); // { won, avg, avgLevel, targetDb, targetLevel, reward, cost, repeating } | null
  const [challengeSetupOpen, setChallengeSetupOpen] = useState(false);
  // The running challenge's own average (sum/count since it started) — what
  // it's actually judged on, so it's what the avg overlay shows and what
  // drives the background tint while a challenge is on.
  const [challengeAvg, setChallengeAvg] = useState(null);
  // tick() also needs the latest onChallengeResult without re-subscribing —
  // same stale-closure concern as settingsRef.
  const onChallengeResultRef = useRef(onChallengeResult);
  useEffect(() => { onChallengeResultRef.current = onChallengeResult; }, [onChallengeResult]);

  // Always merges into the latest settings (functional update), so a save
  // from one control can never clobber a field another control just changed.
  // `patch` may be an object or a function of the current settings.
  const updateSettings = (patch) => {
    setSettingsState(s => {
      const next = { ...s, ...(typeof patch === "function" ? patch(s) : patch) };
      saveSettings(next);
      return next;
    });
  };
  const toggleSetting = (key) => updateSettings(s => ({ [key]: !s[key] }));
  const setChallengeDraft = (fn) => updateSettings(s => ({ challengeDraft: fn(s.challengeDraft) }));

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
      updateSettings({ multiplier, offset, p1, p2 });
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
    // on mount), so it needs the current window settings via the ref, not a
    // value closed over at that interval's creation time.
    const windowMs = settingsRef.current.windowSeconds * 1000;
    // While a challenge runs, the average spans the whole challenge (its
    // history was cleared when it began) rather than the usual setting, so
    // the dashed line matches the number the challenge is judged on.
    const avgWindowMs = challengeRef.current
      ? challengeRef.current.durationMin * 60_000
      : settingsRef.current.avgWindowSeconds * 1000;
    const now = performance.now();
    const windowStart = now - windowMs;
    // The average runs over its own independent span, which can be longer
    // than what the graph actually plots (e.g. a 5-minute average behind a
    // 60-second graph) — retain whichever span is longer so trimming for
    // one doesn't quietly throw away history the other still needs, then
    // filter each from that down to what it actually wants.
    historyRef.current = historyRef.current.filter(p => p.t >= now - Math.max(windowMs, avgWindowMs));
    const points = historyRef.current.filter(p => p.t >= windowStart);
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

    // Showing levels: a faint dotted line, in the next level's color, at
    // each boundary that falls inside the graph's current range.
    const drawMax = LEVEL_SCALES[settingsRef.current.scale];
    if (drawMax) {
      const lineColors = levelColors(drawMax);
      settingsRef.current[levelThresholdsKey(drawMax)].forEach((t, i) => {
        if (t <= min || t >= max) return;
        const yy = y(t);
        ctx.save();
        ctx.strokeStyle = lineColors[i + 1];
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke();
        ctx.restore();
      });
    }

    // The average has its own window (see avgWindowMs above), independent
    // of what the graph itself plots — a dashed line in its own color so it
    // reads as a computed stat, not another scale gridline. The number
    // itself is pushed to state and shown as the big overlay on the graph
    // instead of being labeled here too, which would risk overlapping that
    // overlay whenever it sits near the top of the range.
    const avgPoints = historyRef.current.filter(p => p.t >= now - avgWindowMs);
    if (avgPoints.length > 0) {
      const avgValue = avgPoints.reduce((sum, p) => sum + p.v, 0) / avgPoints.length;
      setAvg(avgValue);
      // A longer average window can land outside the graph's own (shorter,
      // auto-scaled) visible range — clamp so the line still sticks to
      // whichever edge it overshot instead of drawing off-canvas.
      const avgY = Math.max(0, Math.min(h, y(avgValue)));
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = warn;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, avgY); ctx.lineTo(w, avgY); ctx.stroke();
      ctx.restore();
    } else {
      setAvg(null);
    }

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

  // Polls far more often than the reading actually updates, purely to track
  // the loudest sample within the current window — a brief spike shouldn't
  // get missed just because it landed between two 250ms commits.
  const sampleFast = () => {
    const analyser = analyserRef.current, buffer = bufferRef.current;
    if (!analyser || !buffer) return;
    // Browsers can suspend an AudioContext on their own — power-saving
    // heuristics, a visibility change, etc. — without erroring or ending
    // the track; the analyser just quietly keeps reporting stale/silent
    // data forever. Nudge it back awake on every poll rather than needing
    // anything to notice and ask — this is the most likely explanation for
    // the meter going dead mid-session with nothing else obviously wrong.
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    const { multiplier, offset } = settingsRef.current;
    const raw = readDbfs(analyser, buffer);
    const v = toLevel(raw, multiplier, offset);
    if (v > peakRef.current) peakRef.current = v;
    if (calRef.current && raw > rawPeakRef.current) rawPeakRef.current = raw;
  };

  // Lands the window's peak as *the* reading — this, not sampleFast, is
  // what actually updates the displayed value, the graph's history, and the
  // challenge tally. The separate always-on draw interval below (which also
  // has to keep running while the mic is off, so the graph still visibly
  // scrolls old readings away) is what actually repaints from it.
  const commitPeak = () => {
    if (!analyserRef.current) return;
    const v = peakRef.current;
    peakRef.current = 0;
    setLevel(v);
    historyRef.current.push({ t: performance.now(), v });

    const cal = calRef.current;
    if (cal && rawPeakRef.current > -Infinity) {
      const raw = Math.max(CURVE_X_DOMAIN[0], Math.min(CURVE_X_DOMAIN[1], rawPeakRef.current));
      cal.min = Math.min(cal.min, raw);
      cal.max = Math.max(cal.max, raw);
      setCalibration({ min: cal.min, max: cal.max });
    }
    rawPeakRef.current = -Infinity;

    const c = challengeRef.current;
    if (c) {
      c.sum += v;
      c.count += 1;
      setChallengeAvg(c.sum / c.count);
      if (performance.now() >= c.endAt) finalizeChallenge(c);
    }
  };

  const finalizeChallenge = (c) => {
    challengeRef.current = null;
    setChallengeUI(null);
    setChallengeAvg(null);
    const finalAvg = c.count > 0 ? c.sum / c.count : 0;
    const avgLevel = c.targetLevel != null ? levelOf(finalAvg, c.thresholds) : null;
    const won = c.targetLevel != null ? avgLevel <= c.targetLevel : finalAvg <= c.targetDb;
    const delta = won ? c.reward : -c.cost;
    if (c.playSound) { if (won) playChallengeWin(); else playChallengeLose(); }
    setChallengeResult({ won, avg: finalAvg, avgLevel, targetDb: c.targetDb, targetLevel: c.targetLevel, reward: c.reward, cost: c.cost, repeating: c.autoRepeat });
    if (delta !== 0) onChallengeResultRef.current?.(delta, CHALLENGE_COUNT_MS, c.playSound);
    // Next round runs on the same terms it just finished with (not whatever
    // the setup form has since been edited to), but only once this round's
    // points have finished counting on (plus a short beat), and only if the
    // mic is still live by then.
    if (c.autoRepeat) {
      const wait = delta !== 0 ? CHALLENGE_COUNT_MS + 500 : 0;
      repeatTimerRef.current = setTimeout(() => {
        repeatTimerRef.current = null;
        if (analyserRef.current) beginChallenge(c, { keepResult: true });
      }, wait);
    }
  };

  const beginChallenge = ({ durationMin, targetDb, targetLevel = null, thresholds = null, reward, cost, playSound, autoRepeat }, { keepResult = false } = {}) => {
    const endAt = performance.now() + Math.max(0.5, durationMin) * 60_000;
    const c = { endAt, durationMin, targetDb, targetLevel, thresholds, reward, cost, playSound, autoRepeat, sum: 0, count: 0 };
    challengeRef.current = c;
    setChallengeUI({ endAt, targetDb, targetLevel, reward, cost, autoRepeat });
    setChallengeAvg(null);
    // Every round starts from a clean slate — clear the history too, so the
    // graph and its dashed average line don't carry over pre-challenge noise.
    reset();
    if (!keepResult) setChallengeResult(null);
  };

  // Starting a challenge wakes the mic if it was paused — only bails if the
  // mic genuinely can't start (denied/unavailable; startMic shows why).
  const startChallenge = async () => {
    clearRepeatTimer();
    setChallengeSetupOpen(false);
    if (!analyserRef.current) {
      await startMic();
      if (!analyserRef.current) return;
    }
    // Showing levels: the target is a level, judged against the partition
    // as it stands right now (auto-repeat rounds keep these same terms).
    beginChallenge(levelsMode
      ? { ...challengeDraft, targetLevel: draftTargetLevel, thresholds: thresholds.slice(), targetDb: levelUpperBound(draftTargetLevel, thresholds) }
      : { ...challengeDraft, targetLevel: null, thresholds: null });
  };

  const cancelChallenge = () => {
    clearRepeatTimer();
    challengeRef.current = null;
    setChallengeUI(null);
    setChallengeAvg(null);
    setChallengeSetupOpen(false);
  };

  const startCalibration = async () => {
    setCalMessage(null);
    if (!analyserRef.current) {
      await startMic();
      if (!analyserRef.current) return;
    }
    calRef.current = { min: Infinity, max: -Infinity };
    rawPeakRef.current = -Infinity;
    setCalibration({ min: Infinity, max: -Infinity });
  };

  const cancelCalibration = () => {
    calRef.current = null;
    setCalibration(null);
  };

  const finishCalibration = () => {
    const cal = calRef.current;
    cancelCalibration();
    if (!cal || !(cal.max - cal.min >= CAL_MIN_RANGE)) {
      setCalMessage("Not enough difference between quiet and loud — try again with both.");
      return;
    }
    const p1 = { x: Math.round(cal.min), y: CAL_QUIET };
    const p2 = { x: Math.round(cal.max), y: CAL_LOUD };
    const multiplier = (p2.y - p1.y) / (p2.x - p1.x);
    const offset = p1.y - multiplier * p1.x;
    updateSettings({ multiplier, offset, p1, p2 });
    setCalMessage(`Calibrated: raw ${p1.x} → ${CAL_QUIET}, raw ${p2.x} → ${CAL_LOUD}.`);
  };

  // Leaving the settings window abandons an unfinished calibration rather
  // than leaving it silently running where nothing shows it.
  const closeSettings = () => {
    cancelCalibration();
    setCalMessage(null);
    setSettingsOpen(false);
  };

  const stopMic = () => {
    wantActiveRef.current = false;
    cancelCalibration();
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (commitIntervalRef.current) { clearInterval(commitIntervalRef.current); commitIntervalRef.current = null; }
    peakRef.current = 0;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    analyserRef.current = null;
    setActive(false);
    // A challenge can't be fairly judged without samples coming in.
    clearRepeatTimer();
    if (challengeRef.current) { challengeRef.current = null; setChallengeUI(null); setChallengeAvg(null); }
  };

  const startMic = async () => {
    setError(null);
    wantActiveRef.current = true;
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
      peakRef.current = 0;
      setActive(true);
      intervalRef.current = setInterval(sampleFast, FAST_SAMPLE_MS);
      commitIntervalRef.current = setInterval(commitPeak, PEAK_WINDOW_MS);

      // The track can end on its own — device unplugged, the OS or another
      // app reclaimed it, a Bluetooth mic dropping out, etc. — without
      // getUserMedia or the analyser ever throwing; the meter just goes
      // quietly dead. Notice that specifically and try to reconnect, rather
      // than needing a full page reload to come back (this is the other
      // likely explanation for "cuts out and won't come back").
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.onended = () => {
          if (!wantActiveRef.current) return; // stopMic() (button click or unmount) already handled this
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
          if (commitIntervalRef.current) { clearInterval(commitIntervalRef.current); commitIntervalRef.current = null; }
          analyserRef.current = null;
          if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (_) {} audioCtxRef.current = null; }
          streamRef.current = null;
          setActive(false);
          setError("Microphone connection was lost — reconnecting…");
          setTimeout(() => { if (wantActiveRef.current) startMic(); }, 500);
        };
      }
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
  // so the graph keeps scrolling and old readings age out visually. No need
  // to redraw any faster than the data itself actually changes (PEAK_WINDOW_MS).
  useEffect(() => {
    const id = setInterval(draw, PEAK_WINDOW_MS);
    const ro = new ResizeObserver(draw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => { clearInterval(id); ro.disconnect(); };
  }, []);

  // The win/lose banner is a brief announcement, not a permanent readout.
  useEffect(() => {
    if (!challengeResult) return;
    const id = setTimeout(() => setChallengeResult(null), 6000);
    return () => clearTimeout(id);
  }, [challengeResult]);

  return (
    <div
      className="card decibel-meter"
      tabIndex={-1}
      style={challengeUI && challengeAvg != null
        ? { boxShadow: `inset 0 0 0 100vmax ${challengeTint(challengeAvg, challengeUI.targetDb)}` }
        : undefined}
    >
      <div className="card-body decibel-body">
        {/* A slim, always-in-place strip — its own colored fill toggles
            invisible on click (the bar's outline and 0/100 labels stay put
            as the click target), rather than a dedicated readout row like
            it used to be. */}
        <div
          className="decibel-thermo-row"
          onClick={() => toggleSetting("thermoHidden")}
          title={thermoHidden ? "Click to show" : "Click to hide"}
        >
          <span className="decibel-thermo-label">0</span>
          {/* The bar itself clips its gradient/mask to its own rounded shape
              (overflow: hidden), so the badge is a sibling of it rather than
              a child — otherwise it'd get clipped to the bar's own 12px
              height along with everything else in there. */}
          <div className="decibel-thermo-track">
            <div className={`decibel-thermo ${thermoHidden ? "decibel-thermo--hidden" : ""}`}>
              <div
                className="decibel-thermo-gradient"
                // Showing levels: hard-edged bands at the thresholds instead
                // of the smooth 0–100 gradient.
                style={levelsMode ? {
                  background: `linear-gradient(to right, ${colors.map((c, i) => {
                    const b = [0, ...thresholds, 100];
                    return `${c} ${b[i]}% ${b[i + 1]}%`;
                  }).join(", ")})`,
                } : undefined}
              />
              <div
                className="decibel-thermo-mask"
                style={{ left: `${Math.max(0, Math.min(100, (active ? level : 0) / THERMO_MAX * 100))}%` }}
              />
            </div>

            {challengeUI && (
              <div
                className="decibel-challenge-badge"
                onClick={e => { e.stopPropagation(); setChallengeSetupOpen(true); }}
                title="Noise Challenge in progress — click for details"
              >
                🎯 {formatCountdown(challengeUI.endAt)} · {challengeUI.targetLevel != null ? `≤ level ${challengeUI.targetLevel}` : `≤${challengeUI.targetDb} avg`}{challengeUI.autoRepeat && " · 🔁"}
                <button
                  className="decibel-challenge-cancel"
                  onClick={e => { e.stopPropagation(); cancelChallenge(); }}
                  title="Cancel challenge"
                  aria-label="Cancel challenge"
                >✕</button>
              </div>
            )}
          </div>
          <span className="decibel-thermo-label">{levelsMode ? levelMax : THERMO_MAX}</span>
        </div>

        {/* Both numbers live on top of the time graph itself now, pinned to
            its left and right edges — each toggles only itself. Clicking
            the graph anywhere else toggles the plotted graph itself, so
            every child that has its own click behavior has to stop the
            click from also reaching this wrapper. */}
        <div
          className="decibel-graph-wrap"
          onClick={() => toggleSetting("graphHidden")}
          title={graphHidden ? "Click to show the graph" : "Click to hide the graph"}
        >
          <canvas ref={canvasRef} className={`decibel-canvas ${graphHidden ? "decibel-canvas--hidden" : ""}`} />

          <div
            className="decibel-graph-value decibel-graph-value--live"
            onClick={e => { e.stopPropagation(); toggleSetting("liveHidden"); }}
            title={liveHidden ? "Click to show" : "Click to hide"}
          >
            <span
              className={`decibel-value ${liveHidden ? "decibel-value--hidden" : ""}`}
              style={{ color: active ? valueColor(level) : undefined }}
            >
              {active ? fmtValue(level) : "—"}
            </span>
            <span className={`decibel-unit ${liveHidden ? "decibel-value--hidden" : ""}`}>now</span>
          </div>

          <div
            className="decibel-graph-value decibel-graph-value--avg"
            onClick={e => { e.stopPropagation(); toggleSetting("avgHidden"); }}
            title={avgHidden ? "Click to show" : "Click to hide"}
          >
            {(() => {
              const shown = challengeUI ? challengeAvg : avg;
              return (
                <span
                  className={`decibel-value ${avgHidden ? "decibel-value--hidden" : ""}`}
                  style={{ color: valueColor(shown) }}
                >
                  {shown != null ? fmtValue(shown) : "—"}
                </span>
              );
            })()}
            <span className={`decibel-unit ${avgHidden ? "decibel-value--hidden" : ""}`}>avg</span>
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

          {challengeResult && (
            <div className={`decibel-challenge-result ${challengeResult.won ? "decibel-challenge-result--won" : ""}`}>
              {(() => {
                const r = challengeResult;
                const byLevel = r.targetLevel != null;
                const avgText = byLevel ? `average level ${r.avgLevel}` : `average ${Math.round(r.avg)}`;
                const target = byLevel ? r.targetLevel : r.targetDb;
                return r.won
                  ? `🎉 Challenge won! ${avgText[0].toUpperCase()}${avgText.slice(1)} ≤ ${target} — +${r.reward} awarded`
                  : `Challenge lost — ${avgText} was over ${target}${r.cost > 0 ? ` — −${r.cost} taken` : ""}`;
              })()}
              {challengeResult.repeating && " · next round coming up"}
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
          <button
            className="decibel-btn"
            onClick={() => setChallengeSetupOpen(true)}
            title={challengeUI ? "Noise Challenge in progress" : "Start a Noise Challenge"}
          >★</button>
        </div>
      </div>

      {settingsOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeSettings()}>
          <div className="modal decibel-settings-modal">
            <h2>Noise meter calibration</h2>
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

            <div className="decibel-calibrate">
              <button
                className={`btn btn-sm ${calibration ? "btn-danger" : "btn-ghost"}`}
                onClick={calibration ? finishCalibration : startCalibration}
                title={calibration
                  ? "Stop listening and fit the line to the quietest/loudest levels heard"
                  : "Listen for the room's quietest and loudest levels, then press again to apply"}
              >
                {calibration ? "■ Stop & apply" : "Auto-calibrate"}
              </button>
              {calibration && (
                <span className="decibel-calibrate-status">
                  Listening… quiet {Number.isFinite(calibration.min) ? Math.round(calibration.min) : "—"}
                  {" · "}loud {Number.isFinite(calibration.max) ? Math.round(calibration.max) : "—"} raw
                </span>
              )}
              {!calibration && calMessage && <span className="decibel-calibrate-status">{calMessage}</span>}
            </div>

            <div className="decibel-settings-row">
              <label>Display</label>
              <select value={settings.scale} onChange={e => updateSettings({ scale: e.target.value })}>
                <option value="100">0–100</option>
                <option value="levels">0–3 levels</option>
                <option value="levels5">0–5 levels</option>
                <option value="levels10">0–10 levels</option>
              </select>
            </div>
            {levelsMode && (
              <LevelPartitionBar
                thresholds={thresholds}
                colors={colors}
                onChange={next => updateSettings({ [levelThresholdsKey(levelMax)]: next })}
              />
            )}

            <div className="decibel-settings-row">
              <label>Graph window</label>
              <input
                type="number" min="10" max="600" step="5"
                value={settings.windowSeconds}
                onChange={e => updateSettings({ windowSeconds: Math.max(10, parseInt(e.target.value, 10) || 60) })}
              />
              <span>s</span>
            </div>

            <div className="decibel-settings-row">
              <label>Average period</label>
              <input
                type="number" min="5" max="1800" step="5"
                value={settings.avgWindowSeconds}
                onChange={e => updateSettings({ avgWindowSeconds: Math.max(5, parseInt(e.target.value, 10) || 60) })}
              />
              <span>s</span>
            </div>

            <div className="decibel-settings-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => updateSettings(DEFAULT_SETTINGS)}>Reset to default</button>
              <button className="btn btn-primary btn-sm" onClick={closeSettings}>Done</button>
            </div>
          </div>
        </div>
      )}

      {challengeSetupOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setChallengeSetupOpen(false)}>
          <div className="modal decibel-challenge-modal">
            {challengeUI ? (
              <>
                <h2>Noise Challenge in progress</h2>
                <p className="decibel-settings-hint">
                  {formatCountdown(challengeUI.endAt)} left — keep the average at or under{" "}
                  <strong>{challengeUI.targetLevel != null ? `level ${challengeUI.targetLevel}` : challengeUI.targetDb}</strong> to win <strong>+{challengeUI.reward}</strong> for everyone
                  {challengeUI.cost > 0 && <> (or lose <strong>−{challengeUI.cost}</strong> if it's over)</>}.
                  {challengeUI.autoRepeat && " Repeats automatically until cancelled."}
                </p>
                <div className="decibel-settings-actions">
                  <button className="btn btn-danger btn-sm" onClick={cancelChallenge}>Cancel challenge</button>
                  <button className="btn btn-primary btn-sm" onClick={() => setChallengeSetupOpen(false)}>Done</button>
                </div>
              </>
            ) : (
              <>
                <h2>Start Noise Challenge</h2>
                <div className="decibel-settings-row">
                  <label>Duration</label>
                  <input
                    type="number" min="0.5" max="120" step="0.5"
                    value={challengeDraft.durationMin}
                    onChange={e => setChallengeDraft(d => ({ ...d, durationMin: Math.max(0.5, parseFloat(e.target.value) || 5) }))}
                  />
                  <span>min</span>
                </div>
                {levelsMode ? (
                  <div className="decibel-settings-row">
                    <label>Max average level</label>
                    <select
                      value={draftTargetLevel}
                      onChange={e => setChallengeDraft(d => ({ ...d, targetLevel: parseInt(e.target.value, 10) }))}
                    >
                      {colors.map((_, lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                    </select>
                    <span className="decibel-level-swatch" style={{ background: colors[draftTargetLevel] }} />
                  </div>
                ) : (
                  <div className="decibel-settings-row">
                    <label>Max average</label>
                    <input
                      type="number" min="0" max="100" step="1"
                      value={challengeDraft.targetDb}
                      onChange={e => setChallengeDraft(d => ({ ...d, targetDb: parseFloat(e.target.value) || 0 }))}
                    />
                    <span>/ 100</span>
                  </div>
                )}
                <div className="decibel-settings-row">
                  <label>Reward</label>
                  <input
                    type="number" min="1" max="100" step="1"
                    value={challengeDraft.reward}
                    onChange={e => setChallengeDraft(d => ({ ...d, reward: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                  />
                  <span>{pointsLabel} each</span>
                </div>
                <div className="decibel-settings-row">
                  <label>Cost</label>
                  <input
                    type="number" min="0" max="100" step="1"
                    value={challengeDraft.cost}
                    onChange={e => setChallengeDraft(d => ({ ...d, cost: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                  />
                  <span>{pointsLabel} each if lost</span>
                </div>
                <label className="decibel-settings-check">
                  <input
                    type="checkbox"
                    checked={challengeDraft.playSound}
                    onChange={e => setChallengeDraft(d => ({ ...d, playSound: e.target.checked }))}
                  />
                  Play sound at end
                </label>
                <label className="decibel-settings-check">
                  <input
                    type="checkbox"
                    checked={challengeDraft.autoRepeat}
                    onChange={e => setChallengeDraft(d => ({ ...d, autoRepeat: e.target.checked }))}
                  />
                  Auto-repeat — start a new round as soon as one ends
                </label>
                <div className="decibel-settings-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setChallengeSetupOpen(false)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={startChallenge}>
                    Start
                  </button>
                </div>
                {!active && <p className="decibel-settings-hint decibel-settings-hint--warn">The microphone is paused — it'll start listening when the challenge starts.</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
