import { useState, useEffect, useRef, useMemo } from "react";
import { doExport } from "../data/exportData";
import { loadAutoExportReminders, saveAutoExportReminders } from "../data/autoExportReminders";
import "./RemindersWidget.css";

const DISMISS_KEY_BASE = "classboard_reminders_dismissed";

const DEFAULT_REMINDERS = [
  { id: 1, text: "Warm Up",  edge: "start", minutes: 10, enabled: true },
  { id: 2, text: "Clean-up", edge: "end",   minutes: 10, enabled: true },
];

const EDGES = ["start", "end", "untilClosed", "time", "autoExport"];
const BIRTHDAY_KINDS = ["today", "weekend"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// "YYYY-MM-DD" -> "MM-DD", for comparing a stored birthday against a date
// regardless of birth year.
function monthDay(dateStr) {
  return dateStr ? dateStr.slice(5) : null;
}
function monthDayOf(date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function namesBornOn(names, birthdays, targetMonthDay) {
  return names.filter(n => monthDay(birthdays[n]) === targetMonthDay);
}
function joinNames(list) {
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}
// The upcoming (or current, if today's one of them) Saturday/Sunday.
function upcomingWeekend(now) {
  const daysUntilSat = (6 - now.getDay() + 7) % 7;
  const sat = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSat);
  const sun = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + 1);
  return [sat, sun];
}

// Coerce a stored/imported list into clean reminder objects with unique ids.
function normalizeReminders(list, defaults = DEFAULT_REMINDERS) {
  if (!Array.isArray(list)) return defaults.map(r => ({ ...r }));
  const seen = new Set();
  return list
    .filter(r => r && typeof r.text === "string")
    .map((r, i) => {
      let id = Number.isFinite(r.id) ? r.id : i + 1;
      while (seen.has(id)) id++;
      seen.add(id);
      // Earlier versions stored which birthday kind a row was as its own
      // trigger edge (always fired at a fixed clock time) — migrate that
      // shape forward into { edge: "time", birthday: "today"|"weekend" },
      // which fires identically, so an already-saved reminder keeps
      // working exactly as before under the new, shared trigger model.
      let edge = r.edge;
      let birthday = BIRTHDAY_KINDS.includes(r.birthday) ? r.birthday : undefined;
      if (edge === "birthdayToday") { edge = "time"; birthday = "today"; }
      else if (edge === "birthdayWeekend") { edge = "time"; birthday = "weekend"; }
      return {
        id,
        text: r.text,
        edge: EDGES.includes(edge) ? edge : "start",
        minutes: Math.max(1, Math.min(120, parseInt(r.minutes, 10) || 5)),
        time: TIME_RE.test(r.time) ? r.time : "12:00",
        enabled: r.enabled !== false,
        ...(birthday ? { birthday } : {}),
      };
    });
}

// Whether a reminder's trigger window is open right now — shared by freely
// composed reminders and both birthday kinds alike, which differ only in
// what additionally has to be true (an actual birthday match) and what
// text they show once triggered (see the `active` loop below).
function windowActive(r, sinceStart, untilEnd, now) {
  if (r.edge === "start") return sinceStart >= 0 && sinceStart < r.minutes;
  if (r.edge === "end") return untilEnd > 0 && untilEnd <= r.minutes;
  if (r.edge === "untilClosed") return sinceStart >= 0 && untilEnd > 0;
  if (r.edge === "time") {
    const sinceTime = (now - timeToday(r.time, now)) / 60000;
    return sinceTime >= 0 && sinceTime < r.minutes;
  }
  return false;
}

// A "HH:MM" time on today's date, relative to `now`
function timeToday(hhmm, now) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

// Identifies one class sitting (date + period). Dismissals are scoped to this;
// they clear on their own when the period changes or the day rolls over.
function sittingKey(period, when) {
  if (!period) return null;
  return `${when.toDateString()}|${period.label}|${period.start}`;
}

// `scope` keeps the main board's reminders and the teacher-only view's
// reminders — which can be open in two separate windows at once — from
// clobbering each other's dismiss state.
function dismissKeyFor(scope) {
  return scope === "main" ? DISMISS_KEY_BASE : `${DISMISS_KEY_BASE}_${scope}`;
}

function loadDismissed(scope) {
  try {
    const s = JSON.parse(localStorage.getItem(dismissKeyFor(scope)) || "null");
    if (s && typeof s.key === "string" && Array.isArray(s.ids)) return s;
  } catch (_) {}
  return { key: null, ids: [] };
}

function saveDismissed(rec, scope) {
  try { localStorage.setItem(dismissKeyFor(scope), JSON.stringify(rec)); } catch (_) {}
}

// One row in the "Show birthdays" section — same First/Last/At time/Until
// closed + minutes controls as a freely-composed reminder row (see
// windowActive), just with a fixed, non-editable label instead of a text
// field and no kind-select entry for autoExport (birthdays can't be that).
function BirthdayRow({ label, row, enabled, onChange }) {
  return (
    <div className={`reminders-edit-row ${!enabled ? "reminders-edit-row--off" : ""}`}>
      <input
        type="checkbox"
        className="reminders-edit-toggle"
        checked={enabled}
        onChange={e => onChange({ enabled: e.target.checked })}
        title={enabled ? "Turn this reminder off" : "Turn this reminder on"}
      />
      <span className="reminders-edit-auto-text">{label}</span>
      <select value={row.edge} onChange={e => onChange({ edge: e.target.value })}>
        <option value="start">First</option>
        <option value="end">Last</option>
        <option value="time">At time</option>
        <option value="untilClosed">Until closed</option>
      </select>
      {row.edge === "time" && (
        <input
          className="reminders-edit-time"
          type="time"
          value={row.time}
          onChange={e => onChange({ time: e.target.value })}
        />
      )}
      {row.edge !== "untilClosed" && (
        <>
          <input
            className="reminders-edit-mins"
            type="number" min="1" max="120"
            value={row.minutes}
            onChange={e => onChange({ minutes: e.target.value })}
          />
          <span className="reminders-edit-unit">min</span>
        </>
      )}
    </div>
  );
}

export default function RemindersWidget({
  currentPeriod, reminders: remindersProp, onRemindersChange, collapsed,
  defaultReminders = DEFAULT_REMINDERS, scope = "main",
  names = [], birthdays = {},
}) {
  const periodReminders = useMemo(() => normalizeReminders(remindersProp, defaultReminders), [remindersProp, defaultReminders]);
  // Auto-export reminders are global (see data/autoExportReminders), and
  // only surfaced in Teacher View — the one window that's more likely to
  // still be open near the end of the day (see openBoardView's own comment
  // for the same reasoning). Merging them into `reminders` here, rather
  // than keeping a separate UI, is what makes them show up as just another
  // option in the same editor list.
  const [rawAutoExport, setRawAutoExport] = useState(() => (scope === "teacher" ? loadAutoExportReminders() : []));
  useEffect(() => {
    if (scope !== "teacher") return;
    const reload = () => setRawAutoExport(loadAutoExportReminders());
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, [scope]);
  const autoExportReminders = useMemo(() => normalizeReminders(rawAutoExport, []), [rawAutoExport]);
  const reminders = useMemo(() => [...periodReminders, ...autoExportReminders], [periodReminders, autoExportReminders]);
  const [now, setNow] = useState(() => new Date());
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const overlayMouseDown = useRef(false);

  const key = sittingKey(currentPeriod, now);
  const [dismissedRec, setDismissedRec] = useState(() => loadDismissed(scope));
  // Dismissals only count for the class sitting they were made in; a stale
  // record is simply ignored, so it clears itself when the period rolls over.
  const dismissedIds = dismissedRec.key === key ? dismissedRec.ids : [];
  // A brief on-screen confirmation once an auto-export reminder actually
  // fires — separate from the period-scoped `active` messages below, since
  // this can happen with no class in session at all (see the effect below).
  const [exportFlash, setExportFlash] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(id);
  }, []);

  // Auto-export doesn't wait for a class period to be "current" the way
  // every other reminder kind does — the whole point is firing near the end
  // of the school day, which can be after the last period's own window has
  // already closed. Guarded per (reminder id, calendar day) in localStorage
  // — not scoped to this window — so it survives a reload, and if two
  // Teacher View windows somehow both have this open, only the first to
  // notice claims it.
  useEffect(() => {
    const today = now.toDateString();
    for (const r of reminders) {
      if (r.edge !== "autoExport" || r.enabled === false) continue;
      const sinceTime = (now - timeToday(r.time, now)) / 60000;
      if (sinceTime < 0 || sinceTime >= r.minutes) continue;
      const doneKey = `classboard_auto_export_done_${r.id}`;
      if (localStorage.getItem(doneKey) === today) continue;
      localStorage.setItem(doneKey, today);
      doExport();
      setExportFlash({ id: r.id, text: r.text || "Data exported" });
    }
  }, [reminders, now]);

  // Fade the confirmation on its own, rather than requiring a click —
  // there's no class necessarily even in session to dismiss it.
  useEffect(() => {
    if (!exportFlash) return;
    const id = setTimeout(() => setExportFlash(null), 10_000);
    return () => clearTimeout(id);
  }, [exportFlash]);

  const dismiss = (id) => {
    const rec = { key, ids: [...dismissedIds, id] };
    setDismissedRec(rec);
    saveDismissed(rec, scope);
  };

  const active = [];
  if (currentPeriod) {
    const sinceStart = (now - timeToday(currentPeriod.start, now)) / 60000;
    const untilEnd   = (timeToday(currentPeriod.end, now) - now) / 60000;
    for (const r of reminders) {
      if (r.enabled === false || dismissedIds.includes(r.id)) continue;
      if (!windowActive(r, sinceStart, untilEnd, now)) continue;
      if (r.birthday === "today") {
        const today = namesBornOn(names, birthdays, monthDayOf(now));
        if (today.length) active.push({ ...r, text: `🎂 Happy Birthday, ${joinNames(today)}!` });
      } else if (r.birthday === "weekend") {
        const [sat, sun] = upcomingWeekend(now);
        const parts = [
          ...namesBornOn(names, birthdays, monthDayOf(sat)).map(n => `${n} (Sat)`),
          ...namesBornOn(names, birthdays, monthDayOf(sun)).map(n => `${n} (Sun)`),
        ];
        if (parts.length) active.push({ ...r, text: `🎂 Birthdays this weekend: ${parts.join(", ")}` });
      } else {
        active.push(r);
      }
    }
  }

  const openEdit = () => {
    setDraft(reminders.map(r => ({ ...r })));
    setEditOpen(true);
  };
  const updateDraft = (i, field, value) =>
    setDraft(d => d.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const removeDraft = (i) => setDraft(d => d.filter((_, idx) => idx !== i));
  const nextDraftId = (d) => Math.max(0, ...d.map(r => (typeof r.id === "number" ? r.id : 0))) + 1;
  const addDraft = () =>
    setDraft(d => [...d, { id: nextDraftId(d), text: "", edge: "start", minutes: 5, time: "12:00", enabled: true }]);

  // Announcing birthdays is a yes/no preference, not really a message to
  // compose — so it gets its own checkbox instead of making the teacher add
  // a row and find "Birthday today" in the kind dropdown. Checking it
  // reveals the two birthday-specific reminders (today / this weekend),
  // each with its own enable checkbox and the exact same First/Last/At
  // time/Until closed + minutes controls a freely-composed reminder gets
  // (see windowActive) — still just the two underlying rows this widget
  // already knew about (identified by `birthday: "today"|"weekend"`, not
  // by their own dedicated edge), only edited through this dedicated
  // section instead of the generic list + kind dropdown.
  const todayRow    = draft ? draft.find(r => r.birthday === "today")    : null;
  const weekendRow  = draft ? draft.find(r => r.birthday === "weekend") : null;
  const todayEnabled   = !!todayRow   && todayRow.enabled   !== false;
  const weekendEnabled = !!weekendRow && weekendRow.enabled !== false;
  // The master checkbox reflects (and drives) whether either is on, rather
  // than tracking its own separate open/closed state — so it can't say
  // "showing birthdays" while both underlying reminders are actually off.
  const birthdaysShown = todayEnabled || weekendEnabled;

  const setBirthdayRow = (kind, patch) => {
    setDraft(d => {
      const idx = d.findIndex(r => r.birthday === kind);
      if (idx >= 0) return d.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      return [...d, {
        id: nextDraftId(d),
        text: kind === "today" ? "Birthday today" : "Birthdays this weekend",
        edge: "start",
        minutes: 10,
        time: "12:00",
        enabled: true,
        birthday: kind,
        ...patch,
      }];
    });
  };

  const toggleBirthdaysSection = (checked) => {
    if (checked) {
      // Turning the section on for the first time defaults to "today" only
      // — "this weekend" stays off until the teacher opts in below.
      if (!todayEnabled && !weekendEnabled) setBirthdayRow("today", { enabled: true });
    } else {
      // Collapsing disables both rather than removing them, so their
      // settings survive being turned back on later.
      if (todayRow)   setBirthdayRow("today",   { enabled: false });
      if (weekendRow) setBirthdayRow("weekend", { enabled: false });
    }
  };

  // The generic list below only shows reminders the teacher composes
  // freely — birthday rows are edited exclusively through the dedicated
  // section above it. Keeps each row's real index (not its position in
  // this filtered view) for updateDraft/removeDraft, since those still
  // address the full draft array.
  const genericRows = draft
    ? draft.map((r, i) => ({ r, i })).filter(({ r }) => !r.birthday)
    : [];

  // Auto-export rows are split back out and saved to their own, global
  // store instead of going through onRemindersChange (which persists into
  // whichever period is currently active — the wrong place for something
  // meant to survive past that period, or fire with none active at all).
  const saveEdit = () => {
    const periodRows = [];
    const autoExportRows = [];
    for (const r of draft) {
      const text = (r.text || "").trim();
      const cleanedRow = {
        id: r.id,
        text,
        edge: EDGES.includes(r.edge) ? r.edge : "start",
        minutes: Math.max(1, Math.min(120, parseInt(r.minutes, 10) || 5)),
        time: TIME_RE.test(r.time) ? r.time : "12:00",
        enabled: r.enabled !== false,
        ...(BIRTHDAY_KINDS.includes(r.birthday) ? { birthday: r.birthday } : {}),
      };
      if (r.edge === "autoExport") autoExportRows.push({ ...cleanedRow, text: text || "Data exported" });
      else if (text) periodRows.push(cleanedRow);
    }
    onRemindersChange?.(periodRows);
    if (scope === "teacher") {
      saveAutoExportReminders(autoExportRows);
      setRawAutoExport(autoExportRows);
    }
    setEditOpen(false);
  };

  // The export confirmation stands alone — it can fire with no class in
  // session at all, so it's shown alongside (not gated behind) the
  // period-scoped `active` messages, with its own dismiss that just clears
  // the flash instead of touching the per-sitting dismissed record.
  const displayMessages = exportFlash
    ? [...active, { id: `export-${exportFlash.id}`, edge: "autoExport", text: `📤 ${exportFlash.text}`, isFlash: true }]
    : active;

  return (
    <div className={`card reminders-widget ${collapsed ? "card--collapsed" : ""} ${displayMessages.length ? "reminders-widget--active" : ""}`} tabIndex={-1}>
      <div className="card-body reminders-body">
        {displayMessages.length > 0 ? (
          <div className="reminders-messages" data-count={Math.min(displayMessages.length, 4)}>
            {displayMessages.map(r => (
              <div key={r.id} className={`reminders-message reminders-message--${r.edge}`}>
                <span className="reminders-message-text">{r.text}</span>
                <button
                  className="reminders-dismiss"
                  onClick={() => (r.isFlash ? setExportFlash(null) : dismiss(r.id))}
                  title="Dismiss"
                >✕</button>
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
            <div className="reminders-edit-birthday-section">
              <div className="reminders-edit-birthday">
                <label className="reminders-edit-birthday-label">
                  <input
                    type="checkbox"
                    checked={birthdaysShown}
                    onChange={e => toggleBirthdaysSection(e.target.checked)}
                  />
                  🎂 Show birthdays
                </label>
              </div>
              {birthdaysShown && (
              <div className="reminders-edit-birthday-options">
                <BirthdayRow
                  label="Today"
                  row={todayRow ?? { edge: "start", minutes: 10, time: "12:00" }}
                  enabled={todayEnabled}
                  onChange={patch => setBirthdayRow("today", patch)}
                />
                <BirthdayRow
                  label="This weekend"
                  row={weekendRow ?? { edge: "start", minutes: 10, time: "12:00" }}
                  enabled={weekendEnabled}
                  onChange={patch => setBirthdayRow("weekend", patch)}
                />
              </div>
              )}
            </div>
            <div className="reminders-edit-list">
              {genericRows.map(({ r, i }) => (
                // Index into the full draft array, not position in this
                // filtered view — updateDraft/removeDraft still address it
                // by its real slot, and period-scoped/auto-export rows are
                // two separately-numbered id sequences merged into one
                // list, so ids alone can collide as a key here.
                <div key={i} className={`reminders-edit-row ${r.enabled === false ? "reminders-edit-row--off" : ""}`}>
                  <input
                    type="checkbox"
                    className="reminders-edit-toggle"
                    checked={r.enabled !== false}
                    onChange={e => updateDraft(i, "enabled", e.target.checked)}
                    title={r.enabled === false ? "Turn this reminder on" : "Turn this reminder off"}
                  />
                  {r.edge === "autoExport" ? (
                    <span className="reminders-edit-auto-text">📤 Auto: export data</span>
                  ) : (
                    <input
                      className="reminders-edit-text"
                      value={r.text}
                      onChange={e => updateDraft(i, "text", e.target.value)}
                      placeholder="Message"
                    />
                  )}
                  <select
                    value={r.edge}
                    onChange={e => {
                      const edge = e.target.value;
                      updateDraft(i, "edge", edge);
                      // Auto-export generates its own message at trigger
                      // time, but still needs *some* stored text or saving
                      // would drop it (empty-text reminders are treated as
                      // deleted).
                      if (!r.text && edge === "autoExport") {
                        updateDraft(i, "text", "Data exported");
                      }
                    }}
                  >
                    <option value="start">First</option>
                    <option value="end">Last</option>
                    <option value="time">At time</option>
                    <option value="untilClosed">Until closed</option>
                    {/* Global, not per-period (see autoExportReminders.js) —
                        only meaningful, and only savable, from Teacher View. */}
                    {scope === "teacher" && <option value="autoExport">📤 Auto-export data</option>}
                  </select>
                  {(r.edge === "time" || r.edge === "autoExport") && (
                    <input
                      className="reminders-edit-time"
                      type="time"
                      value={r.time}
                      onChange={e => updateDraft(i, "time", e.target.value)}
                    />
                  )}
                  {r.edge !== "untilClosed" && (
                    <>
                      <input
                        className="reminders-edit-mins"
                        type="number" min="1" max="120"
                        value={r.minutes}
                        onChange={e => updateDraft(i, "minutes", e.target.value)}
                      />
                      <span className="reminders-edit-unit">min</span>
                    </>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => removeDraft(i)} title="Remove">✕</button>
                </div>
              ))}
              {genericRows.length === 0 && <div className="reminders-edit-empty">No reminders yet.</div>}
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
