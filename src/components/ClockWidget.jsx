import { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext } from "react";
import { secondsUntilEnd, secondsUntilStart } from "../data/schedules";
import "./ClockWidget.css";

const MODES = ["Period", "Timer"]; // a pane's default (Teacher View's)

const CLOCK_SETTINGS_KEY = "classboard_clock_settings";

// Each mode's digits are this base size times its own scale, nudged with
// the A− / A+ buttons in its settings panel.
const BASE_FONT_SIZE = "clamp(2.5rem, 5vw, 4.5rem)";
const FONT_SCALE_STEP = 1.15;
const FONT_SCALE_MIN = 0.4;
const FONT_SCALE_MAX = 4;
// The scales the old fixed S/M/L/XL sizes came to, for carrying a saved
// pick over — and back again for the camera overlay, which still sizes its
// copy of the clock in those buckets.
const LEGACY_FONT_SCALES = { sm: 0.6, md: 1, lg: 1.35, xl: 2 };
function fontSizeKeyForScale(scale) {
  return scale < 0.8 ? "sm" : scale < 1.17 ? "md" : scale < 1.65 ? "lg" : "xl";
}

const DEFAULT_SHOW_SECS = { Period: true, Timer: true, Stopwatch: true };

function loadClockSettings() {
  const defaults = { use24h: true, timerSound: false, showSecsByMode: DEFAULT_SHOW_SECS, showSmallClock: true };
  try {
    const s = JSON.parse(localStorage.getItem(CLOCK_SETTINGS_KEY) || "null");
    if (s) {
      const legacy = LEGACY_FONT_SCALES[s.fontSize] ?? 1;
      return {
        ...defaults, ...s,
        fontScaleByMode: { Period: legacy, Timer: legacy, Stopwatch: legacy, ...s.fontScaleByMode },
      };
    }
  } catch (_) {}
  return { ...defaults, fontScaleByMode: { Period: 1, Timer: 1, Stopwatch: 1 } };
}

function formatStopwatch(ms) {
  return { ...splitSecs(Math.floor(ms / 1000)), hund: pad(Math.floor(ms / 10) % 100) };
}

function saveClockSettings(settings) {
  try { localStorage.setItem(CLOCK_SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
}

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.start();
    osc.stop(ctx.currentTime + 1.5);
  } catch (_) {}
}

function pad(n) { return String(n).padStart(2, "0"); }

function formatSeconds(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

// Split total seconds into { main: "M" or "MM" or "HH:MM", sec: "SS" }
// No leading zero on minutes when there are no hours (e.g. 9:45 not 09:45)
// When `round` is set (seconds hidden), round to the nearest minute instead
// of truncating, so e.g. 89s reads as "2" rather than "1".
function splitSecs(total, round = false) {
  if (round) total = Math.round(total / 60) * 60;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { main: h > 0 ? `${pad(h)}:${pad(m)}` : `${m}`, sec: pad(s) };
}

// Seconds span — only rendered when shown; click to hide
function SecSpan({ sec, show, onToggle }) {
  if (!show) return null;
  return (
    <span
      className="clock-secs"
      onClick={e => { e.stopPropagation(); onToggle(); }}
      title="Click to hide seconds"
    >:{sec}</span>
  );
}

const ClockCtx = createContext(null);

// The Period, Timer and Stopwatch panes can sit in separate tiles or share
// one (see COMBINABLE_IDS in data/layout), and get split apart or combined
// at will — so the timer, stopwatch, settings, and keyboard shortcuts live
// here, once per board, rather than in each pane, where combining or
// splitting would remount the pane and lose a running timer (or double up
// the shortcuts).
//
// `mode` is whichever mode was used last: what a combined pane shows, and
// what the camera overlay mirrors (via onDisplayChange).
export function ClockProvider({ currentPeriod, nextPeriod, onDisplayChange, onSettingsChange, onTimerTriggered, children }) {
  // Lets the board show a hidden Timer pane when a shortcut sets one going.
  const onTimerTriggeredRef = useRef(onTimerTriggered);
  onTimerTriggeredRef.current = onTimerTriggered;
  const [mode, setMode] = useState("Period");
  const [now, setNow] = useState(new Date());

  const initSettings = useMemo(loadClockSettings, []);
  const [fontScaleByMode, setFontScaleByMode] = useState(initSettings.fontScaleByMode);
  const [use24h,          setUse24h]          = useState(initSettings.use24h);
  const [timerSound,      setTimerSound]      = useState(initSettings.timerSound);
  const [showSmallClock]                      = useState(initSettings.showSmallClock ?? true);
  const [showSecsByMode,  setShowSecsByMode]  = useState({
    ...DEFAULT_SHOW_SECS,
    ...initSettings.showSecsByMode,
  });

  const toggleSecs = useCallback((modeName) => {
    setShowSecsByMode(prev => ({ ...prev, [modeName]: !prev[modeName] }));
  }, []);

  // Timer state
  const [timerSecs,    setTimerSecs]    = useState(10 * 60);
  const [timerInput,   setTimerInput]   = useState("10:00");
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone,    setTimerDone]    = useState(false);
  const timerRef       = useRef(null);
  const lastDurationRef = useRef(10 * 60);

  const adjustFontScale = useCallback((modeName, dir) => {
    setFontScaleByMode(prev => {
      const next = (prev[modeName] ?? 1) * (dir > 0 ? FONT_SCALE_STEP : 1 / FONT_SCALE_STEP);
      return { ...prev, [modeName]: Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, next)) };
    });
  }, []);

  // Stopwatch: timed from timestamps rather than counted ticks, so it stays
  // exact however the interval below drifts.
  const [swRunning, setSwRunning] = useState(false);
  const [swStartedAt, setSwStartedAt] = useState(0);
  const [swBanked, setSwBanked] = useState(0); // ms from earlier runs
  const [swNow, setSwNow] = useState(() => Date.now());
  const [swShowHundredths, setSwShowHundredths] = useState(initSettings.swShowHundredths ?? true);
  // Hundredths need a much faster refresh than whole seconds do — only
  // while they're actually on screen.
  const swFast = swShowHundredths && showSecsByMode.Stopwatch;
  useEffect(() => {
    if (!swRunning) return;
    const id = setInterval(() => setSwNow(Date.now()), swFast ? 30 : 200);
    return () => clearInterval(id);
  }, [swRunning, swFast]);
  const swElapsed = swBanked + (swRunning ? Math.max(0, swNow - swStartedAt) : 0);
  const toggleStopwatch = () => {
    const t = Date.now();
    setMode("Stopwatch");
    if (swRunning) { setSwBanked(b => b + (t - swStartedAt)); setSwRunning(false); }
    else { setSwStartedAt(t); setSwNow(t); setSwRunning(true); }
  };
  const resetStopwatch = () => {
    const t = Date.now();
    setSwBanked(0);
    setSwStartedAt(t);
    setSwNow(t);
  };

  // Persist settings and notify parent whenever they change. `fontSize`
  // (an S/M/L/XL bucket of the shown mode's scale) is for the camera overlay.
  useEffect(() => {
    const settings = { fontScaleByMode, use24h, timerSound, showSecsByMode, showSmallClock, swShowHundredths };
    saveClockSettings(settings);
    onSettingsChange?.({ ...settings, fontSize: fontSizeKeyForScale(fontScaleByMode[mode] ?? 1) });
  }, [fontScaleByMode, use24h, timerSound, showSecsByMode, showSmallClock, swShowHundredths, mode]); // eslint-disable-line

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Timer tick
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSecs(s => {
          if (s <= 1) {
            clearInterval(timerRef.current);
            setTimerRunning(false);
            setTimerDone(true);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [timerRunning]);

  // Sound on timer done
  useEffect(() => {
    if (timerDone && timerSound) playBeep();
  }, [timerDone]); // eslint-disable-line

  const setPreset = useCallback((minutes) => {
    const secs = minutes * 60;
    lastDurationRef.current = secs;
    setMode("Timer");
    setTimerSecs(secs);
    setTimerInput(formatSeconds(secs));
    setTimerDone(false);
    setTimerRunning(true);
  }, []);

  // Nudge the timer by a step that depends on how much time is left: under a
  // minute, nudge by 10s; otherwise by a full minute.
  const adjustTimer = useCallback((sign) => {
    setTimerSecs(s => {
      const step = s < 60 ? 10 : 60;
      const next = Math.max(0, s + sign * step);
      if (next > 0) setTimerDone(false);
      return next;
    });
  }, []);

  const startTimer = () => {
    lastDurationRef.current = timerSecs;
    setMode("Timer");
    setTimerRunning(true);
    setTimerDone(false);
  };

  const restartTimer = () => {
    const secs = lastDurationRef.current;
    setMode("Timer");
    setTimerSecs(secs);
    setTimerInput(formatSeconds(secs));
    setTimerDone(false);
    setTimerRunning(true);
  };

  const resetTimer = () => {
    setTimerRunning(false);
    setTimerDone(false);
    const parts = timerInput.split(":").map(Number);
    const secs = parts.length === 3 ? parts[0]*3600+parts[1]*60+parts[2]
                 : parts.length === 2 ? parts[0]*60+parts[1] : parts[0]*60;
    setTimerSecs(secs);
  };

  // Global shortcuts, active as long as focus isn't in a text field (notes
  // pane, board, inputs, etc.) and no modal is open:
  //   1-9    start a timer of that many minutes
  //   +/-    add/subtract time on the timer (10s under a minute, else 1min)
  //   space  pause the timer if running, start it if paused
  //   r      reset the timer back to its last-entered duration
  //   p/t    jump to Period / Timer mode (in a combined pane)
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (document.querySelector(".modal-overlay")) return;

      const timerKey = (e.key >= "1" && e.key <= "9") || ["+", "-", " ", "r", "R", "t", "T"].includes(e.key);
      if (timerKey) onTimerTriggeredRef.current?.();

      if (e.key >= "1" && e.key <= "9") {
        setPreset(Number(e.key));
        return;
      }
      if (e.key === "+" || e.key === "-") {
        setMode("Timer");
        adjustTimer(e.key === "+" ? 1 : -1);
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        setMode("Timer");
        if (timerDone) {
          restartTimer();
        } else if (timerRunning) {
          setTimerRunning(false);
        } else {
          setTimerSecs(s => { lastDurationRef.current = s; return s; });
          setTimerRunning(true);
          setTimerDone(false);
        }
        return;
      }
      switch (e.key.toLowerCase()) {
        case "p": setMode("Period"); break;
        case "t": setMode("Timer"); break;
        case "r": setMode("Timer"); resetTimer(); break;
        default: break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setPreset, adjustTimer, timerDone, timerRunning, timerInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTimerInputBlur = () => {
    const parts = timerInput.split(":").map(Number);
    let secs = 0;
    if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
    else secs = parts[0] * 60;
    if (!isNaN(secs) && secs > 0) { setTimerSecs(secs); setTimerInput(formatSeconds(secs)); }
    else setTimerInput(formatSeconds(timerSecs));
    setTimerRunning(false);
    setTimerDone(false);
  };

  const toggleTimer = () => {
    if (timerDone) { restartTimer(); }
    else if (timerRunning) { setTimerRunning(false); }
    else { startTimer(); }
  };

  useEffect(() => {
    if (!timerRunning) setTimerInput(formatSeconds(timerSecs));
  }, [timerSecs, timerRunning]);

  const periodRemaining = currentPeriod ? secondsUntilEnd(currentPeriod)   : null;
  const nextStarting    = nextPeriod    ? secondsUntilStart(nextPeriod)     : null;

  // Build plain string for camera overlay (respects per-mode showSecs)
  const clockHh = use24h ? pad(now.getHours()) : String(now.getHours() % 12 || 12);
  let displayStr = `${clockHh}:${pad(now.getMinutes())}`;
  if (mode === "Period") {
    if (currentPeriod && periodRemaining != null) {
      const { main, sec } = splitSecs(Math.max(0, periodRemaining), !showSecsByMode.Period);
      displayStr = main + (showSecsByMode.Period ? `:${sec}` : "");
    } else if (nextPeriod && nextStarting != null) {
      const { main, sec } = splitSecs(Math.max(0, nextStarting), !showSecsByMode.Period);
      displayStr = main + (showSecsByMode.Period ? `:${sec}` : "");
    }
  } else if (mode === "Timer") {
    const { main, sec } = splitSecs(timerSecs, !showSecsByMode.Timer);
    displayStr = main + (showSecsByMode.Timer ? `:${sec}` : "");
  } else if (mode === "Stopwatch") {
    const { main, sec } = formatStopwatch(swElapsed);
    displayStr = main + (showSecsByMode.Stopwatch ? `:${sec}` : "");
  }
  useEffect(() => { onDisplayChange?.(displayStr); }, [displayStr]); // eslint-disable-line

  const value = {
    mode, setMode,
    currentPeriod, nextPeriod, periodRemaining, nextStarting,
    fontScaleByMode, adjustFontScale, timerSound, setTimerSound,
    showSecsByMode, toggleSecs,
    timerSecs, timerInput, setTimerInput, timerRunning, timerDone,
    setPreset, toggleTimer, resetTimer, handleTimerInputBlur,
    swElapsed, swRunning, toggleStopwatch, resetStopwatch, swShowHundredths, setSwShowHundredths,
  };
  return <ClockCtx.Provider value={value}>{children}</ClockCtx.Provider>;
}

// One pane showing `modes` — "Period", "Timer" or "Stopwatch" on its own,
// or several when combined, switched with the ‹ › arrows. `onSplit(mode)` (combined
// panes only) pops that mode back out into a pane of its own.
export default function ClockWidget({ collapsed, modes = MODES, onSplit }) {
  const c = useContext(ClockCtx);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsPanelRef = useRef(null);
  const gearBtnRef       = useRef(null);

  const combined = modes.length > 1;
  const mode = modes.includes(c.mode) ? c.mode : modes[0];
  const cycleMode = (dir) => c.setMode(modes[(modes.indexOf(mode) + dir + modes.length) % modes.length]);
  // Split off whichever mode isn't showing, so what's on screen stays put.
  const splitMode = modes.find(m => m !== mode);

  // Close settings on click outside
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e) => {
      if (
        settingsPanelRef.current?.contains(e.target) ||
        gearBtnRef.current?.contains(e.target)
      ) return;
      setSettingsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [settingsOpen]);

  const { currentPeriod, nextPeriod, periodRemaining, nextStarting, showSecsByMode, toggleSecs } = c;
  const fontSizeStyle = `calc(${BASE_FONT_SIZE} * ${c.fontScaleByMode[mode] ?? 1})`;

  return (
    <div className={`card clock-widget ${collapsed ? "card--collapsed" : ""}`} tabIndex={-1}>
      <div className="card-body clock-body">
        {/* Mode label (plus cycle arrows and a split button when combined) —
            top right, appears on hover */}
        <div className="clock-mode-nav">
          {combined && <button className="clock-nav-btn" onClick={() => cycleMode(-1)} onMouseDown={e => e.preventDefault()} tabIndex={-1} title="Previous mode">‹</button>}
          <span className="clock-mode-label">{mode}</span>
          {combined && <button className="clock-nav-btn" onClick={() => cycleMode(1)} onMouseDown={e => e.preventDefault()} tabIndex={-1} title="Next mode">›</button>}
          {combined && onSplit && (
            <button
              className="clock-nav-btn"
              onClick={() => onSplit(splitMode)}
              onMouseDown={e => e.preventDefault()}
              tabIndex={-1}
              title={`Split ${splitMode} into its own pane`}
            >⇹</button>
          )}
        </div>

        {/* Settings panel — for whichever mode is showing: its own size,
            plus the sound option for Timer */}
        {settingsOpen && (
          <div className="clock-settings-panel" ref={settingsPanelRef}>
            <div className="clock-settings-row">
              <span className="clock-settings-label">Size</span>
              <div className="clock-settings-group">
                <button className="btn btn-sm btn-ghost" onClick={() => c.adjustFontScale(mode, -1)} title="Smaller" disabled={(c.fontScaleByMode[mode] ?? 1) <= FONT_SCALE_MIN + 1e-6}>A−</button>
                <button className="btn btn-sm btn-ghost" onClick={() => c.adjustFontScale(mode, 1)} title="Larger" disabled={(c.fontScaleByMode[mode] ?? 1) >= FONT_SCALE_MAX - 1e-6}>A+</button>
              </div>
            </div>
            {mode === "Timer" && (
              <div className="clock-settings-row">
                <span className="clock-settings-label">Timer sound</span>
                <div className="clock-settings-group">
                  <button className={`btn btn-sm ${c.timerSound ? "btn-primary" : "btn-ghost"}`}  onClick={() => c.setTimerSound(true)}>On</button>
                  <button className={`btn btn-sm ${!c.timerSound ? "btn-primary" : "btn-ghost"}`} onClick={() => c.setTimerSound(false)}>Off</button>
                </div>
              </div>
            )}
          </div>
        )}
        {mode === "Period" && (() => {
          const rem = splitSecs(Math.max(0, periodRemaining ?? 0), !showSecsByMode.Period);
          const nxt = splitSecs(Math.max(0, nextStarting ?? 0), !showSecsByMode.Period);
          return (
            <div className="clock-display">
              {currentPeriod ? (
                <>
                  <div className={`clock-time ${periodRemaining < 120 ? "clock-warn" : ""}`} style={{ fontSize: fontSizeStyle }}>
                    <span className="clock-min-toggle" onClick={() => toggleSecs("Period")} title={showSecsByMode.Period ? "Click to hide seconds" : "Click to show seconds"}>{rem.main}</span>
                    <SecSpan sec={rem.sec} show={showSecsByMode.Period} onToggle={() => toggleSecs("Period")} />
                    {!showSecsByMode.Period && <span className="clock-unit-label">min</span>}
                  </div>
                  <div className="clock-sublabel">remaining</div>
                </>
              ) : nextPeriod ? (
                <>
                  <div className="clock-label clock-between">Next: {nextPeriod.label}</div>
                  <div className="clock-time clock-next" style={{ fontSize: fontSizeStyle }}>
                    <span className="clock-min-toggle" onClick={() => toggleSecs("Period")} title={showSecsByMode.Period ? "Click to hide seconds" : "Click to show seconds"}>{nxt.main}</span>
                    <SecSpan sec={nxt.sec} show={showSecsByMode.Period} onToggle={() => toggleSecs("Period")} />
                    {!showSecsByMode.Period && <span className="clock-unit-label">min</span>}
                  </div>
                </>
              ) : (
                <div className="clock-noperiod">School day complete</div>
              )}
            </div>
          );
        })()}

        {mode === "Timer" && (() => {
          const t = splitSecs(c.timerSecs, !showSecsByMode.Timer);
          return (
            <div className="clock-display timer-display">
              <div className={`clock-time ${c.timerDone ? "clock-warn" : ""}`} style={{ fontSize: fontSizeStyle }}>
                {c.timerRunning ? (
                  <>
                    <span className="clock-min-toggle" onClick={() => toggleSecs("Timer")} title={showSecsByMode.Timer ? "Click to hide seconds" : "Click to show seconds"}>{t.main}</span>
                    <SecSpan sec={t.sec} show={showSecsByMode.Timer} onToggle={() => toggleSecs("Timer")} />
                  </>
                ) : (
                  <input className="timer-input" value={c.timerInput}
                    style={{ fontSize: fontSizeStyle }}
                    onChange={e => c.setTimerInput(e.target.value)}
                    onBlur={c.handleTimerInputBlur}
                    onKeyDown={e => e.key === "Enter" && e.target.blur()}
                    spellCheck={false} />
                )}
              </div>
              <div className="timer-controls timer-controls--top">
                <button className={`btn btn-sm ${c.timerRunning ? "btn-danger" : "btn-primary"}`} onClick={c.toggleTimer}>
                  {c.timerRunning ? "Stop" : c.timerDone ? "Restart" : "Start"}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={c.resetTimer}>Reset</button>
              </div>
              <div className="timer-controls timer-controls--bottom">
                {[1, 2, 5, 10, 15].map(m => (
                  <button key={m} className="btn btn-ghost btn-sm" onClick={() => c.setPreset(m)}>{m}</button>
                ))}
              </div>
            </div>
          );
        })()}

        {mode === "Stopwatch" && (() => {
          const t = formatStopwatch(c.swElapsed);
          const showSecs = showSecsByMode.Stopwatch;
          const showHund = showSecs && c.swShowHundredths;
          // Clicking the minutes brings back whatever's hidden — seconds
          // first, then hundredths — and, with everything showing, hides
          // the seconds as it does elsewhere. Clicking the seconds or the
          // hundredths hides just that part.
          const onMainClick = () => {
            if (showSecs && !c.swShowHundredths) c.setSwShowHundredths(true);
            else toggleSecs("Stopwatch");
          };
          return (
            <div className="clock-display timer-display">
              <div className="clock-time" style={{ fontSize: fontSizeStyle }}>
                <span className="clock-min-toggle" onClick={onMainClick} title={!showSecs ? "Click to show seconds" : !showHund ? "Click to show hundredths" : "Click to hide seconds"}>{t.main}</span>
                <SecSpan sec={t.sec} show={showSecs} onToggle={() => toggleSecs("Stopwatch")} />
                {showHund && (
                  <span
                    className="clock-secs clock-hundredths"
                    onClick={e => { e.stopPropagation(); c.setSwShowHundredths(false); }}
                    title="Click to hide hundredths"
                  >.{t.hund}</span>
                )}
                {!showSecsByMode.Stopwatch && <span className="clock-unit-label">min</span>}
              </div>
              <div className="timer-controls timer-controls--top">
                <button className={`btn btn-sm ${c.swRunning ? "btn-danger" : "btn-primary"}`} onClick={c.toggleStopwatch}>
                  {c.swRunning ? "Stop" : c.swElapsed > 0 ? "Resume" : "Start"}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={c.resetStopwatch}>Reset</button>
              </div>
            </div>
          );
        })()}

        {/* Settings gear — bottom right, appear on hover */}
        <button
          ref={gearBtnRef}
          className={`clock-gear-btn ${settingsOpen ? "clock-gear-btn--active" : ""}`}
          onClick={() => setSettingsOpen(o => !o)}
          onMouseDown={e => e.preventDefault()}
          tabIndex={-1}
          title="Clock settings"
        >⚙</button>
      </div>
    </div>
  );
}
