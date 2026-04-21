import { useState, useEffect, useRef, useCallback } from "react";
import { secondsUntilEnd, secondsUntilStart } from "../data/schedules";
import "./ClockWidget.css";

const MODES = ["Period", "Timer"];

const CLOCK_SETTINGS_KEY = "classboard_clock_settings";

export const FONT_SIZE_OPTIONS = [
  { key: "sm", label: "S",  clockStyle: "clamp(1.5rem, 3vw, 3rem)"    },
  { key: "md", label: "M",  clockStyle: "clamp(2.5rem, 5vw, 4.5rem)"  },
  { key: "lg", label: "L",  clockStyle: "clamp(3.5rem, 7vw, 6rem)"    },
  { key: "xl", label: "XL", clockStyle: "clamp(5rem, 10vw, 9rem)"     },
];

const DEFAULT_SHOW_SECS = { Period: true, Timer: true };

function loadClockSettings() {
  try {
    const s = localStorage.getItem(CLOCK_SETTINGS_KEY);
    if (s) return { fontSize: "md", use24h: true, timerSound: false, showSecsByMode: DEFAULT_SHOW_SECS, showSmallClock: true, ...JSON.parse(s) };
  } catch (_) {}
  return { fontSize: "md", use24h: true, timerSound: false, showSecsByMode: DEFAULT_SHOW_SECS, showSmallClock: true };
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
function splitSecs(total) {
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

export default function ClockWidget({
  currentPeriod, nextPeriod, collapsed, onToggle,
  onDisplayChange, onSettingsChange,
}) {
  const [mode, setMode] = useState("Period");
  const cycleMode = (dir) => setMode(m => MODES[(MODES.indexOf(m) + dir + MODES.length) % MODES.length]);
  const [now, setNow] = useState(new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsPanelRef = useRef(null);
  const gearBtnRef       = useRef(null);

  const initSettings = loadClockSettings();
  const [fontSize,        setFontSize]        = useState(initSettings.fontSize);
  const [use24h,          setUse24h]          = useState(initSettings.use24h);
  const [timerSound,      setTimerSound]      = useState(initSettings.timerSound);
  const [showSmallClock,  setShowSmallClock]  = useState(initSettings.showSmallClock ?? true);
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

  // Persist settings and notify parent whenever they change
  useEffect(() => {
    const settings = { fontSize, use24h, timerSound, showSecsByMode, showSmallClock };
    saveClockSettings(settings);
    onSettingsChange?.(settings);
  }, [fontSize, use24h, timerSound, showSecsByMode, showSmallClock]); // eslint-disable-line

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
    setTimerSecs(secs);
    setTimerInput(formatSeconds(secs));
    setTimerDone(false);
    setTimerRunning(true);
  }, []);

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

  const startTimer = () => {
    lastDurationRef.current = timerSecs;
    setTimerRunning(true);
    setTimerDone(false);
  };

  const restartTimer = () => {
    const secs = lastDurationRef.current;
    setTimerSecs(secs);
    setTimerInput(formatSeconds(secs));
    setTimerDone(false);
    setTimerRunning(true);
  };

  const toggleTimer = () => {
    if (timerDone) { restartTimer(); }
    else if (timerRunning) { setTimerRunning(false); }
    else { startTimer(); }
  };

  const resetTimer = () => {
    setTimerRunning(false);
    setTimerDone(false);
    const parts = timerInput.split(":").map(Number);
    const secs = parts.length === 3 ? parts[0]*3600+parts[1]*60+parts[2]
                 : parts.length === 2 ? parts[0]*60+parts[1] : parts[0]*60;
    setTimerSecs(secs);
  };

  useEffect(() => {
    if (!timerRunning) setTimerInput(formatSeconds(timerSecs));
  }, [timerSecs, timerRunning]);

  const periodRemaining = currentPeriod ? secondsUntilEnd(currentPeriod)   : null;
  const nextStarting    = nextPeriod    ? secondsUntilStart(nextPeriod)     : null;

  // Wall-clock parts (used in Clock mode and as small overlay in Period/Timer)
  const hours12  = now.getHours() % 12 || 12;
  const clockHh  = use24h ? pad(now.getHours()) : String(hours12);
  const clockMm  = pad(now.getMinutes());
  const clockHhMm = `${clockHh}:${clockMm}`;
  const clockSec  = pad(now.getSeconds());
  const toggleHourFormat = () => {
    const next = !use24h;
    setUse24h(next);
  };

  const fontSizeStyle = FONT_SIZE_OPTIONS.find(o => o.key === fontSize)?.clockStyle
    ?? FONT_SIZE_OPTIONS[1].clockStyle;

  // Build plain string for camera overlay (respects per-mode showSecs)
  const clockTimeStr = clockHhMm + (showSecsByMode.Clock ? `:${clockSec}` : "");
  let displayStr = clockTimeStr;
  if (mode === "Period") {
    if (currentPeriod && periodRemaining != null) {
      const { main, sec } = splitSecs(Math.max(0, periodRemaining));
      displayStr = main + (showSecsByMode.Period ? `:${sec}` : "");
    } else if (nextPeriod && nextStarting != null) {
      const { main, sec } = splitSecs(Math.max(0, nextStarting));
      displayStr = main + (showSecsByMode.Period ? `:${sec}` : "");
    }
  } else if (mode === "Timer") {
    const { main, sec } = splitSecs(timerSecs);
    displayStr = main + (showSecsByMode.Timer ? `:${sec}` : "");
  }
  useEffect(() => { onDisplayChange?.(displayStr); }, [displayStr]); // eslint-disable-line

  // Toggleable date+time for Timer mode — date + time on one line, click to toggle
  const TimerSmallClock = (
    <div
      className={`clock-small-toggle ${showSmallClock ? "clock-small-toggle--on" : "clock-small-toggle--off"}`}
      onClick={() => setShowSmallClock(v => !v)}
      title={showSmallClock ? "Click to hide time/date" : "Click to show time/date"}
    >
      <div className="clock-time-small">
        <span className="clock-hour-toggle" onClick={e => { e.stopPropagation(); toggleHourFormat(); }} title="Click to toggle 12/24h">{clockHh}</span>
        <span className="clock-min-toggle" onClick={e => { e.stopPropagation(); toggleSecs("Timer"); }} title={showSecsByMode.Timer ? "Click to hide seconds" : "Click to show seconds"}>:{clockMm}</span>
        <SecSpan sec={clockSec} show={showSecsByMode.Timer} onToggle={() => toggleSecs("Timer")} />
      </div>
    </div>
  );

  return (
    <div className={`card clock-widget ${collapsed ? "card--collapsed" : ""}`} tabIndex={-1}>
      <div className="card-body clock-body">
        {/* Mode cycle arrows — top right, appear on hover */}
        <div className="clock-mode-nav">
          <button className="clock-nav-btn" onClick={() => cycleMode(-1)} onMouseDown={e => e.preventDefault()} tabIndex={-1} title="Previous mode">‹</button>
          <span className="clock-mode-label">{mode}</span>
          <button className="clock-nav-btn" onClick={() => cycleMode(1)} onMouseDown={e => e.preventDefault()} tabIndex={-1} title="Next mode">›</button>
        </div>

        {/* Settings panel */}
        {settingsOpen && (
          <div className="clock-settings-panel" ref={settingsPanelRef}>
            <div className="clock-settings-row">
              <span className="clock-settings-label">Size</span>
              <div className="clock-settings-group">
                {FONT_SIZE_OPTIONS.map(o => (
                  <button
                    key={o.key}
                    className={`btn btn-sm ${fontSize === o.key ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setFontSize(o.key)}
                  >{o.label}</button>
                ))}
              </div>
            </div>
            <div className="clock-settings-row">
              <span className="clock-settings-label">Timer sound</span>
              <div className="clock-settings-group">
                <button className={`btn btn-sm ${timerSound ? "btn-primary" : "btn-ghost"}`}  onClick={() => setTimerSound(true)}>On</button>
                <button className={`btn btn-sm ${!timerSound ? "btn-primary" : "btn-ghost"}`} onClick={() => setTimerSound(false)}>Off</button>
              </div>
            </div>
          </div>
        )}
        {mode === "Period" && (() => {
          const rem = splitSecs(Math.max(0, periodRemaining ?? 0));
          const nxt = splitSecs(Math.max(0, nextStarting ?? 0));
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
          const t = splitSecs(timerSecs);
          return (
            <div className="clock-display timer-display">
              <div className={`clock-time ${timerDone ? "clock-warn" : ""}`} style={{ fontSize: fontSizeStyle }}>
                {timerRunning ? (
                  <>
                    <span className="clock-min-toggle" onClick={() => toggleSecs("Timer")} title={showSecsByMode.Timer ? "Click to hide seconds" : "Click to show seconds"}>{t.main}</span>
                    <SecSpan sec={t.sec} show={showSecsByMode.Timer} onToggle={() => toggleSecs("Timer")} />
                  </>
                ) : (
                  <input className="timer-input" value={timerInput}
                    style={{ fontSize: fontSizeStyle }}
                    onChange={e => setTimerInput(e.target.value)}
                    onBlur={handleTimerInputBlur}
                    onKeyDown={e => e.key === "Enter" && e.target.blur()}
                    spellCheck={false} />
                )}
              </div>
              <div className="timer-controls timer-controls--top">
                <button className={`btn btn-sm ${timerRunning ? "btn-danger" : "btn-primary"}`} onClick={toggleTimer}>
                  {timerRunning ? "Stop" : timerDone ? "Restart" : "Start"}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={resetTimer}>Reset</button>
              </div>
              <div className="timer-controls timer-controls--bottom">
                {[1, 2, 5, 10, 15].map(m => (
                  <button key={m} className="btn btn-ghost btn-sm" onClick={() => setPreset(m)}>{m}</button>
                ))}
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
