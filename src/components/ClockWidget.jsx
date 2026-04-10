import { useState, useEffect, useRef, useCallback } from "react";
import { secondsUntilEnd, secondsUntilStart } from "../data/schedules";
import "./ClockWidget.css";

const MODES = ["Clock", "Period", "Timer"];

function pad(n) { return String(n).padStart(2, "0"); }

function formatSeconds(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

export default function ClockWidget({ currentPeriod, nextPeriod, collapsed, onToggle }) {
  const [mode, setMode] = useState("Clock");
  const [now, setNow] = useState(new Date());

  // Timer state
  const [timerSecs, setTimerSecs] = useState(10 * 60);
  const [timerInput, setTimerInput] = useState("10:00");
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone, setTimerDone] = useState(false);
  const timerRef = useRef(null);

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

  const periodRemaining = currentPeriod ? secondsUntilEnd(currentPeriod) : null;
  const nextStarting    = nextPeriod    ? secondsUntilStart(nextPeriod)   : null;

  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const dateStr = now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className={`card clock-widget ${collapsed ? "card--collapsed" : ""}`}>
      <div className="card-header">
        <span className="header-toggle" onClick={onToggle}>
          <span className="header-chevron">{collapsed ? "▶" : "▼"}</span>Clock
        </span>
        {!collapsed && (
          <div className="clock-mode-tabs">
            {MODES.map(m => (
              <button key={m} className={`btn btn-sm ${mode === m ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
        )}
      </div>

      <div className="card-body clock-body">
        {mode === "Clock" && (
          <div className="clock-display">
            <div className="clock-time">{timeStr}</div>
            <div className="clock-date">{dateStr}</div>
          </div>
        )}

        {mode === "Period" && (
          <div className="clock-display">
            {currentPeriod ? (
              <>
                <div className="clock-label">{currentPeriod.label}</div>
                <div className={`clock-time ${periodRemaining < 120 ? "clock-warn" : ""}`}>
                  {formatSeconds(periodRemaining)}
                </div>
                <div className="clock-sublabel">remaining</div>
              </>
            ) : nextPeriod ? (
              <>
                <div className="clock-label clock-between">Next: {nextPeriod.label}</div>
                <div className="clock-time clock-next">
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
            <div className={`clock-time ${timerDone ? "clock-warn" : ""}`}>
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
