import { useState, useEffect, useRef } from "react";
import "./DateWidget.css";

const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const DATE_FORMAT_KEY = "classboard_date_format";
const DATE_WIDGET_KEY = "classboard_date_widget";
const FORMATS = ["long", "mdy", "dmy"];

function pad(n) { return String(n).padStart(2, "0"); }

function loadFormat() {
  return FORMATS.includes(localStorage.getItem(DATE_FORMAT_KEY))
    ? localStorage.getItem(DATE_FORMAT_KEY) : "long";
}

const DEFAULT_FONT_SIZES = { time: 3.5, day: 0.85, date: 1.2 };

function loadWidgetSettings() {
  try {
    return { showTime: true, showDate: true, use24h: true, showSecs: true,
      fontSizes: { ...DEFAULT_FONT_SIZES },
      ...JSON.parse(localStorage.getItem(DATE_WIDGET_KEY) || "{}") };
  } catch (_) { return { showTime: true, showDate: true, use24h: true, showSecs: true, fontSizes: { ...DEFAULT_FONT_SIZES } }; }
}

function saveWidgetSettings(s) {
  try { localStorage.setItem(DATE_WIDGET_KEY, JSON.stringify(s)); } catch (_) {}
}

function formatDate(now, fmt) {
  const m  = now.getMonth() + 1;
  const d  = now.getDate();
  const yy = String(now.getFullYear()).slice(2);
  if (fmt === "mdy") return `${m}/${d}/${yy}`;
  if (fmt === "dmy") return `${d}/${m}/${yy}`;
  return `${MONTHS[now.getMonth()]} ${d}, ${now.getFullYear()}`;
}

export default function DateWidget() {
  const [now,          setNow]          = useState(new Date());
  const [format,       setFormat]       = useState(loadFormat);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearBtnRef     = useRef(null);
  const settingsPanelRef = useRef(null);

  const init = loadWidgetSettings();
  const [showTime,  setShowTime]  = useState(init.showTime);
  const [showDate,  setShowDate]  = useState(init.showDate);
  const [use24h,    setUse24h]    = useState(init.use24h);
  const [showSecs,  setShowSecs]  = useState(init.showSecs);
  const [fontSizes, setFontSizes] = useState(() => ({ ...DEFAULT_FONT_SIZES, ...init.fontSizes }));

  const adjustFont = (key, delta, min, max) => {
    setFontSizes(fs => {
      const next = { ...fs, [key]: Math.max(min, Math.min(max, Math.round((fs[key] + delta) * 100) / 100)) };
      saveWidgetSettings({ showTime, showDate, use24h, showSecs, fontSizes: next });
      return next;
    });
  };

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    saveWidgetSettings({ showTime, showDate, use24h, showSecs, fontSizes });
  }, [showTime, showDate, use24h, showSecs, fontSizes]);

  // Close settings on click outside
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e) => {
      if (settingsPanelRef.current?.contains(e.target) || gearBtnRef.current?.contains(e.target)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [settingsOpen]);

  const cycleFormat = () => {
    setFormat(f => {
      const next = FORMATS[(FORMATS.indexOf(f) + 1) % FORMATS.length];
      localStorage.setItem(DATE_FORMAT_KEY, next);
      return next;
    });
  };

  const hours12 = now.getHours() % 12 || 12;
  const hh   = use24h ? pad(now.getHours()) : String(hours12);
  const mm   = pad(now.getMinutes());
  const ss   = pad(now.getSeconds());
  const ampm = use24h ? null : (now.getHours() < 12 ? "AM" : "PM");

  return (
    <div className="card date-widget">
      <div className="date-display">

        {showTime ? (
          <div className="date-section-wrap">
            <div className="date-time" style={{ fontSize: `${fontSizes.time}rem` }}>
              <span className="date-time-hh" onClick={() => setUse24h(v => !v)} title="Click to toggle 12/24h">{hh}</span>
              <span className="date-time-mm" onClick={() => setShowSecs(v => !v)} title="Click to toggle seconds">:{mm}</span>
              {showSecs && <span className="date-time-ss" onClick={() => setShowSecs(false)} title="Click to hide seconds">:{ss}</span>}
              {ampm && <span className="date-time-ampm">{ampm}</span>}
            </div>
            <button className="date-hide-btn" onClick={() => setShowTime(false)} title="Hide time">✕</button>
          </div>
        ) : (
          <div className="date-restore-btn" onClick={() => setShowTime(true)} title="Show time">🕒</div>
        )}

        {showDate ? (
          <div className="date-section-wrap">
            <div className="date-bottom">
              <div className="date-day" style={{ fontSize: `${fontSizes.day}rem` }}>{DAYS[now.getDay()]}</div>
              <div className="date-md" style={{ fontSize: `${fontSizes.date}rem` }} onClick={cycleFormat} title="Click to change date format">
                {formatDate(now, format)}
              </div>
            </div>
            <button className="date-hide-btn" onClick={() => setShowDate(false)} title="Hide date">✕</button>
          </div>
        ) : (
          <div className="date-restore-btn" onClick={() => setShowDate(true)} title="Show date">📅</div>
        )}

      </div>

      {/* Settings panel */}
      {settingsOpen && (
        <div className="date-settings-panel" ref={settingsPanelRef}>
          {[
            { label: "Time",  key: "time",  step: 0.5, min: 1,   max: 10  },
            { label: "Day",   key: "day",   step: 0.1, min: 0.4, max: 3   },
            { label: "Date",  key: "date",  step: 0.15, min: 0.4, max: 3  },
          ].map(({ label, key, step, min, max }) => (
            <div key={key} className="date-settings-row">
              <span className="date-settings-label">{label}</span>
              <div className="date-settings-group">
                <button className="btn btn-ghost btn-sm" onClick={() => adjustFont(key, -step, min, max)}>A−</button>
                <span className="date-settings-size">{fontSizes[key].toFixed(key === "time" ? 1 : 2)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => adjustFont(key, +step, min, max)}>A+</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gear button */}
      <button
        ref={gearBtnRef}
        className={`date-gear-btn ${settingsOpen ? "date-gear-btn--active" : ""}`}
        onClick={() => setSettingsOpen(o => !o)}
        onMouseDown={e => e.preventDefault()}
        tabIndex={-1}
        title="Clock settings"
      >⚙</button>
    </div>
  );
}
