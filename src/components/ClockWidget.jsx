import { useState, useEffect, useRef, useCallback } from "react";
import { secondsUntilEnd, secondsUntilStart } from "../data/schedules";
import "./ClockWidget.css";

const MODES = ["Clock", "Period", "Timer"];

const CLOCK_SETTINGS_KEY = "classboard_clock_settings";

export const FONT_SIZE_OPTIONS = [
  { key: "sm", label: "S",  clockStyle: "clamp(1.5rem, 3vw, 3rem)"    },
  { key: "md", label: "M",  clockStyle: "clamp(2.5rem, 5vw, 4.5rem)"  },
  { key: "lg", label: "L",  clockStyle: "clamp(3.5rem, 7vw, 6rem)"    },
  { key: "xl", label: "XL", clockStyle: "clamp(5rem, 10vw, 9rem)"     },
];

function loadClockSettings() {
  try {
    const s = localStorage.getItem(CLOCK_SETTINGS_KEY);
    if (s) return { fontSize: "md", use24h: true, timerSound: false, ...JSON.parse(s) };
  } catch (_) {}
  return { fontSize: "md", use24h: true, timerSound: false };
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

export default function ClockWidget({
  currentPeriod, nextPeriod, collapsed, onToggle,
  onDisplayChange, onSettingsChange,
}) {
  const [mode, setMode] = useState("Clock");
  const [now, setNow] = useState(new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const initSettings = loadClockSettings();
  const [fontSize,    setFontSize]    = useState(initSettings.fontSize);
  const [use24h,      setUse24h]      = useState(initSettings.use24h);
  const [timerSound,  setTimerSound]  = useState(initSettings.timerSound);

  // Timer state
  const [timerSecs,    setTimerSecs]    = useState(10 * 60);
  const [timerInput,   setTimerInput]   = useState("10:00");
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone,    setTimerDone]    = useState(false);
  const timerRef = useRef(null);

  // Persist settings and notify parent whenever they change
  useEffect(() => {
    const settings = { fontSize, use24h, timerSound };
    saveClockSettings(settings);
    onSettingsChange?.(settings);
  }, [fontSize, use24h, timerSound]); // eslint-disable-line

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
    setTimerSecs(secs);
    setTimerInput(formatSeconds(secs));
    setTimerRunning(false);
    setTimerDone(false);
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

  const toggleTimer = () => {
    if (timerDone) { setTimerDone(false); setTimerRunning(true); }
    else setTimerRunning(r => !r);
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

  // Time string respects 12/24h setting
  const hours12 = now.getHours() % 12 || 12;
  const ampm    = now.getHours() < 12 ? " AM" : " PM";
  const timeStr = use24h
    ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    : `${hours12}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${ampm}`;

  const dateStr = now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  const fontSizeStyle = FONT_SIZE_OPTIONS.find(o => o.key === fontSize)?.clockStyle
    ?? FONT_SIZE_OPTIONS[1].clockStyle;

  // Compute display string for camera overlay
  let displayStr = timeStr;
  if (mode === "Period") {
    if (currentPeriod && periodRemaining != null) displayStr = formatSeconds(Math.max(0, periodRemaining));
    else if (nextPeriod && nextStarting != null)  displayStr = formatSeconds(Math.max(0, nextStarting));
  } else if (mode === "Timer") {
    displayStr = formatSeconds(timerSecs);
  }
  useEffect(() => { onDisplayChange?.(displayStr); }, [displayStr]); // eslint-disable-line

  return (
    <div className={`card clock-widget ${collapsed ? "card--collapsed" : ""}`} tabIndex={-1}>
      <div className="card-header" onClick={onToggle}>
        <span className="header-toggle">
          <span className="header-chevron">{collapsed ? "▶" : "▼"}</span>Clock
        </span>
        {!collapsed && (
          <div className="clock-header-right" onClick={e => e.stopPropagation()}>
            <div className="clock-mode-tabs">
              {MODES.map(m => (
                <button key={m} className={`btn btn-sm ${mode === m ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode(m)}>{m}</button>
              ))}
            </div>
            <button
              className={`btn btn-ghost btn-sm clock-settings-btn ${settingsOpen ? "btn-primary" : ""}`}
              onClick={() => setSettingsOpen(o => !o)}
              title="Clock settings"
            >⚙</button>
          </div>
        )}
      </div>

      {settingsOpen && !collapsed && (
        <div className="clock-settings-panel">
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
            <span className="clock-settings-label">Format</span>
            <div className="clock-settings-group">
              <button className={`btn btn-sm ${use24h ? "btn-primary" : "btn-ghost"}`}  onClick={() => setUse24h(true)}>24h</button>
              <button className={`btn btn-sm ${!use24h ? "btn-primary" : "btn-ghost"}`} onClick={() => setUse24h(false)}>12h</button>
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

      <div className="card-body clock-body">
        {mode === "Clock" && (
          <div className="clock-display">
            <div className="clock-time" style={{ fontSize: fontSizeStyle }}>{timeStr}</div>
            <div className="clock-date">{dateStr}</div>
          </div>
        )}

        {mode === "Period" && (
          <div className="clock-display">
            {currentPeriod ? (
              <>
                <div className="clock-label">{currentPeriod.label}</div>
                <div className={`clock-time ${periodRemaining < 120 ? "clock-warn" : ""}`} style={{ fontSize: fontSizeStyle }}>
                  {formatSeconds(periodRemaining)}
                </div>
                <div className="clock-sublabel">remaining</div>
              </>
            ) : nextPeriod ? (
              <>
                <div className="clock-label clock-between">Next: {nextPeriod.label}</div>
                <div className="clock-time clock-next" style={{ fontSize: fontSizeStyle }}>
                  {formatSeconds(nextStarting)}
                </div>
                <div className="clock-sublabel">until start</div>
              </>
            ) : (
              <div className="clock-noperiod">School day complete</div>
            )}
            <div className="clock-time-small">{timeStr}</div>
          </div>
        )}

        {mode === "Timer" && (
          <div className="clock-display timer-display">
            <div className={`clock-time ${timerDone ? "clock-warn" : ""}`} style={{ fontSize: fontSizeStyle }}>
              {timerRunning
                ? formatSeconds(timerSecs)
                : <input className="timer-input" value={timerInput}
                    onChange={e => setTimerInput(e.target.value)}
                    onBlur={handleTimerInputBlur}
                    onKeyDown={e => e.key === "Enter" && e.target.blur()}
                    spellCheck={false} />}
            </div>
            {timerDone && <div className="clock-label" style={{ color: "var(--warn)" }}>Time's up!</div>}
            <div className="timer-controls">
              <button className="btn btn-ghost btn-sm" onClick={() => setPreset(10)}>10 min</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreset(15)}>15 min</button>
              <button className={`btn btn-sm ${timerRunning ? "btn-danger" : "btn-primary"}`} onClick={toggleTimer}>
                {timerRunning ? "Stop" : timerDone ? "Restart" : "Start"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={resetTimer}>Reset</button>
            </div>
            <div className="clock-time-small">{timeStr}</div>
          </div>
        )}
      </div>
    </div>
  );
}
