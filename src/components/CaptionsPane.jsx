import { useState, useRef, useEffect } from "react";
import "./CaptionsPane.css";

// The Web Speech API's SpeechRecognition — built into Chrome/Edge, no key
// needed — but it streams audio to the browser vendor's own servers for
// transcription rather than running on-device, so this needs a network
// connection and isn't available in Safari/Firefox.
function getRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

const DEFAULT_SETTINGS = { lang: "en-US", fontSize: 28 };
const CAPTIONS_SETTINGS_KEY = "classboard_captions_settings";
function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(CAPTIONS_SETTINGS_KEY) || "{}") }; }
  catch (_) { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) {
  try { localStorage.setItem(CAPTIONS_SETTINGS_KEY, JSON.stringify(s)); } catch (_) {}
}

// How many finalized lines stay on screen before the oldest scrolls away —
// this is meant to read like live captions, not accumulate a full
// transcript of the class period.
const MAX_SEGMENTS = 8;

// SpeechRecognition's error codes (https://wicg.github.io/speech-api/#speechreco-error)
// are terse single words — shown as-is, "network" reads like a stray debug
// string rather than something a teacher can act on.
const ERROR_MESSAGES = {
  network: "Can't reach the speech recognition service — check the internet connection (some school networks block it).",
  "audio-capture": "No microphone found.",
  "not-allowed": "Microphone access denied.",
  "service-not-allowed": "The browser blocked speech recognition — check its site permissions.",
  "language-not-supported": "That language isn't supported for captions.",
  "bad-grammar": "Speech recognition failed to start.",
};

const LANGUAGES = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "zh-CN", label: "Chinese (Mandarin)" },
  { code: "vi-VN", label: "Vietnamese" },
  { code: "ar-SA", label: "Arabic" },
  { code: "ru-RU", label: "Russian" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "hi-IN", label: "Hindi" },
];

export default function CaptionsPane() {
  const recognitionRef = useRef(null);
  // Whether the person actually wants this running — checked in onend to
  // decide whether a stop was intentional or just the browser's own
  // silence timeout, which continuous mode doesn't actually prevent.
  const activeRef = useRef(false);
  const restartTimerRef = useRef(null);
  const bodyRef = useRef(null);

  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);
  const [segments, setSegments] = useState([]);
  const [interim, setInterim] = useState("");
  const [settings, setSettingsState] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const supported = !!getRecognitionCtor();

  const stop = () => {
    activeRef.current = false;
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setActive(false);
    setInterim("");
  };

  const start = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { setError("Live captions aren't supported in this browser"); return; }
    setError(null);

    const recognition = new Ctor();
    recognition.lang = settingsRef.current.lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (e) => {
      let interimText = "";
      const newFinal = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) newFinal.push(result[0].transcript.trim());
        else interimText += result[0].transcript;
      }
      if (newFinal.length) setSegments(prev => [...prev, ...newFinal].slice(-MAX_SEGMENTS));
      setInterim(interimText);
    };

    recognition.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // not fatal — onend will restart it
      // Everything else is worth stopping for rather than silently retrying
      // every 250ms (which, for something persistent like a blocked
      // network, just means it spends the rest of class re-failing and
      // showing nothing useful) — the person can hit start again once
      // whatever it was is actually fixed.
      setError(ERROR_MESSAGES[e.error] || `Captions stopped (${e.error})`);
      activeRef.current = false;
      setActive(false);
    };

    // Chrome stops recognition after a stretch of silence even in
    // continuous mode, so "continuous" captioning means restarting it
    // ourselves — but only when the person hasn't actually asked it to stop.
    recognition.onend = () => {
      if (!activeRef.current) return;
      restartTimerRef.current = setTimeout(() => {
        try { recognition.start(); } catch (_) {}
      }, 250);
    };

    recognitionRef.current = recognition;
    activeRef.current = true;
    try {
      recognition.start();
      setActive(true);
    } catch (err) {
      setError(err.message || "Couldn't start live captions");
      activeRef.current = false;
    }
  };

  const clear = () => { setSegments([]); setInterim(""); };

  const updateSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettingsState(next);
    saveSettings(next);
    // A language change only takes effect on a fresh recognition instance.
    if (patch.lang && activeRef.current) {
      stop();
      setTimeout(start, 150);
    }
  };

  // Auto-start on mount, matching the camera/decibel panes' behavior.
  useEffect(() => { if (supported) start(); return stop; }, []); // eslint-disable-line

  // Keep the newest line in view as the transcript grows.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [segments, interim]);

  const hasText = segments.length > 0 || !!interim;

  return (
    <div className="card captions-pane" tabIndex={-1}>
      <div className="card-body captions-body" ref={bodyRef}>
        {!supported ? (
          <div className="captions-placeholder">
            <span className="captions-error">Live captions aren't supported in this browser — try Chrome or Edge.</span>
          </div>
        ) : error ? (
          <div className="captions-placeholder">
            <span className="captions-error">{error}</span>
          </div>
        ) : !hasText ? (
          <div className="captions-placeholder">
            <span>{active ? "Listening…" : "Click 💬 to start captions"}</span>
          </div>
        ) : (
          <p className="captions-text" style={{ fontSize: `${settings.fontSize}px` }}>
            {segments.join(" ")}
            {segments.length > 0 && interim ? " " : ""}
            <span className="captions-interim">{interim}</span>
          </p>
        )}
      </div>

      <div className="captions-controls">
        <button
          className={`captions-btn ${active ? "captions-btn-danger" : ""}`}
          onClick={active ? stop : start}
          disabled={!supported}
          title={active ? "Stop captions" : "Start captions"}
        >{active ? "■" : "💬"}</button>
        <button className="captions-btn" onClick={clear} title="Clear transcript">↺</button>
        <button className="captions-btn" onClick={() => setSettingsOpen(true)} title="Caption settings">⚙</button>
      </div>

      {settingsOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSettingsOpen(false)}>
          <div className="modal captions-settings-modal">
            <h2>Caption settings</h2>
            <p className="captions-settings-hint">
              Live captions send audio to the browser's own speech service to transcribe
              it (there's no offline option), so this needs an internet connection.
            </p>
            <div className="captions-settings-row">
              <label>Language</label>
              <select value={settings.lang} onChange={e => updateSettings({ lang: e.target.value })}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <div className="captions-settings-row">
              <label>Font size</label>
              <input
                type="number" min="14" max="72" step="2"
                value={settings.fontSize}
                onChange={e => updateSettings({ fontSize: Math.max(14, parseInt(e.target.value, 10) || 28) })}
              />
              <span>px</span>
            </div>
            <div className="captions-settings-actions">
              <button className="btn btn-primary btn-sm" onClick={() => setSettingsOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
