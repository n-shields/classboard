import { useState, useEffect, useRef } from "react";
import FontSizeAdjuster from "./FontSizeAdjuster";
import { usePeriodFontScale } from "../data/fontScale";
import "./DateWidget.css";

const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const DATE_FORMAT_KEY = "classboard_date_format";
const DATE_WIDGET_KEY = "classboard_date_widget";
const FORMATS = ["long", "mdy", "dmy"];

function pad(n) { return String(n).padStart(2, "0"); }

function loadFormat() {
  return FORMATS.includes(localStorage.getItem(DATE_FORMAT_KEY))
    ? localStorage.getItem(DATE_FORMAT_KEY) : "mdy";
}

const DEFAULT_FONT_SIZES = { time: 3.5, day: 0.85, date: 1.2 };

function loadWidgetSettings() {
  try {
    return { showTime: true, showDate: true, use24h: false, showSecs: true,
      fontSizes: { ...DEFAULT_FONT_SIZES },
      ...JSON.parse(localStorage.getItem(DATE_WIDGET_KEY) || "{}") };
  } catch (_) { return { showTime: true, showDate: true, use24h: false, showSecs: true, fontSizes: { ...DEFAULT_FONT_SIZES } }; }
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
  // Each period's own; the saved fontSizes are only what a period starts from.
  const [savedFontSizes] = useState(() => ({ ...DEFAULT_FONT_SIZES, ...init.fontSizes }));
  const scales = {
    time: usePeriodFontScale("date:time", savedFontSizes.time / DEFAULT_FONT_SIZES.time),
    day:  usePeriodFontScale("date:day",  savedFontSizes.day  / DEFAULT_FONT_SIZES.day),
    date: usePeriodFontScale("date:date", savedFontSizes.date / DEFAULT_FONT_SIZES.date),
  };
  const fontSizes = Object.fromEntries(Object.entries(scales).map(([k, [s]]) => [k, s * DEFAULT_FONT_SIZES[k]]));

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    saveWidgetSettings({ showTime, showDate, use24h, showSecs, fontSizes: savedFontSizes });
  }, [showTime, showDate, use24h, showSecs]); // eslint-disable-line react-hooks/exhaustive-deps

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
            { label: "Time", key: "time" },
            { label: "Day",  key: "day"  },
            { label: "Date", key: "date" },
          ].map(({ label, key }) => (
            <div key={key} className="date-settings-row">
              <span className="date-settings-label">{label}</span>
              <FontSizeAdjuster
                scale={scales[key][0]}
                onChange={scales[key][1]}
              />
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
