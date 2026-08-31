import { useState, useEffect, useRef } from "react";
import "./RemindersWidget.css";

const SETTINGS_KEY = "classboard_reminders";

const DEFAULT_REMINDERS = [
  { id: 1, text: "Attendance", edge: "start", minutes: 10, enabled: true },
  { id: 2, text: "Clean-up",   edge: "end",   minutes: 10, enabled: true },
];

function loadReminders() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (Array.isArray(s)) {
      return s
        .filter(r => r && typeof r.text === "string")
        .map(r => ({
          id: r.id,
          text: r.text,
          edge: r.edge === "end" ? "end" : "start",
          minutes: Math.max(1, Math.min(120, parseInt(r.minutes, 10) || 5)),
          enabled: r.enabled !== false,
        }));
    }
  } catch (_) {}
  return DEFAULT_REMINDERS.map(r => ({ ...r }));
}

function saveReminders(list) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(list)); } catch (_) {}
}

// A "HH:MM" time on today's date, relative to `now`
function timeToday(hhmm, now) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export default function RemindersWidget({ currentPeriod, collapsed }) {
  const [reminders, setReminders] = useState(loadReminders);
  const [now, setNow] = useState(() => new Date());
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const overlayMouseDown = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(id);
  }, []);

  const active = [];
  if (currentPeriod) {
    const sinceStart = (now - timeToday(currentPeriod.start, now)) / 60000;
    const untilEnd   = (timeToday(currentPeriod.end, now) - now) / 60000;
    for (const r of reminders) {
      if (r.enabled === false) continue;
      if (r.edge === "start" && sinceStart >= 0 && sinceStart < r.minutes) active.push(r);
      else if (r.edge === "end" && untilEnd > 0 && untilEnd <= r.minutes) active.push(r);
    }
  }

  const openEdit = () => {
    setDraft(reminders.map(r => ({ ...r })));
    setEditOpen(true);
  };
  const updateDraft = (i, field, value) =>
    setDraft(d => d.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const removeDraft = (i) => setDraft(d => d.filter((_, idx) => idx !== i));
  const addDraft = () =>
    setDraft(d => [...d, { id: Math.max(0, ...d.map(r => r.id)) + 1, text: "", edge: "start", minutes: 5, enabled: true }]);

  const saveEdit = () => {
    const cleaned = draft
      .map(r => ({
        id: r.id,
        text: r.text.trim(),
        edge: r.edge === "end" ? "end" : "start",
        minutes: Math.max(1, Math.min(120, parseInt(r.minutes, 10) || 5)),
        enabled: r.enabled !== false,
      }))
      .filter(r => r.text);
    setReminders(cleaned);
    saveReminders(cleaned);
    setEditOpen(false);
  };

  return (
    <div className={`card reminders-widget ${collapsed ? "card--collapsed" : ""} ${active.length ? "reminders-widget--active" : ""}`} tabIndex={-1}>
      <div className="card-body reminders-body">
        {active.length > 0 ? (
          <div className="reminders-messages">
            {active.map(r => (
              <div key={r.id} className={`reminders-message reminders-message--${r.edge}`}>
                {r.text}
              </div>
            ))}
          </div>
        ) : (
          <div className="reminders-idle">
            {currentPeriod ? "No reminder right now" : "Reminders"}
          </div>
        )}
        <button className="reminders-settings-btn" onClick={openEdit} title="Edit reminders">⚙</button>
      </div>

      {editOpen && (
        <div
          className="modal-overlay"
          onMouseDown={e => { overlayMouseDown.current = e.target === e.currentTarget; }}
          onClick={e => { if (e.target === e.currentTarget && overlayMouseDown.current) setEditOpen(false); }}
        >
          <div className="modal reminders-edit-modal">
            <h2>Reminders</h2>
            <p className="reminders-edit-hint">
              Show a message during the first or last few minutes of the class that's
              currently in session.
            </p>
            <div className="reminders-edit-list">
              {draft.map((r, i) => (
                <div key={r.id} className={`reminders-edit-row ${r.enabled === false ? "reminders-edit-row--off" : ""}`}>
                  <input
                    type="checkbox"
                    className="reminders-edit-toggle"
                    checked={r.enabled !== false}
                    onChange={e => updateDraft(i, "enabled", e.target.checked)}
                    title={r.enabled === false ? "Turn this reminder on" : "Turn this reminder off"}
                  />
                  <input
                    className="reminders-edit-text"
                    value={r.text}
                    onChange={e => updateDraft(i, "text", e.target.value)}
                    placeholder="Message"
                  />
                  <select value={r.edge} onChange={e => updateDraft(i, "edge", e.target.value)}>
                    <option value="start">First</option>
                    <option value="end">Last</option>
                  </select>
                  <input
                    className="reminders-edit-mins"
                    type="number" min="1" max="120"
                    value={r.minutes}
                    onChange={e => updateDraft(i, "minutes", e.target.value)}
                  />
                  <span className="reminders-edit-unit">min</span>
                  <button className="btn btn-danger btn-sm" onClick={() => removeDraft(i)} title="Remove">✕</button>
                </div>
              ))}
              {draft.length === 0 && <div className="reminders-edit-empty">No reminders yet.</div>}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={addDraft}>
              + Add reminder
            </button>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setEditOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
