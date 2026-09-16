import { useState, useEffect, useRef } from "react";
import { SOUND_PRESETS, soundById } from "../data/soundHotkeys";
import "./HotkeysEditor.css";

// Keys already meaningful elsewhere in the app — not enforced (a teacher
// might genuinely want to layer a sound on top of one of these), just
// flagged so an assignment doesn't silently double up with something else.
const RESERVED_KEYS = new Set([
  "a", "arrowleft", "arrowright", "arrowup", "arrowdown",
  "+", "=", "-", "_", " ", "escape",
  "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "p", "t", "r",
]);

function keyLabel(key) {
  if (!key) return "—";
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}

export default function HotkeysEditor({ hotkeys, onChange, onClose }) {
  const [draft, setDraft] = useState(() => Object.entries(hotkeys).map(([key, soundId]) => ({ key, soundId })));
  const [recordingIndex, setRecordingIndex] = useState(null);
  const overlayMouseDown = useRef(false);

  // Capture the next keydown anywhere as the key for the row being recorded,
  // instead of a free-text field — guarantees whatever's stored is exactly
  // what a real keydown's e.key will be, and sidesteps having to explain key
  // names (a plain "a" vs "ArrowLeft" vs " ") to type in by hand.
  useEffect(() => {
    if (recordingIndex === null) return;
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setRecordingIndex(null); return; }
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return; // wait for a real key
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      setDraft(d => d.map((row, i) => i === recordingIndex ? { ...row, key } : row));
      setRecordingIndex(null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recordingIndex]);

  const addRow = () => setDraft(d => [...d, { key: "", soundId: SOUND_PRESETS[0].id }]);
  const removeRow = (i) => setDraft(d => d.filter((_, idx) => idx !== i));
  const updateSound = (i, soundId) => setDraft(d => d.map((row, idx) => idx === i ? { ...row, soundId } : row));

  const save = () => {
    const map = {};
    for (const row of draft) {
      if (!row.key) continue;
      map[row.key] = row.soundId; // later duplicate rows win, matching how the list reads top-to-bottom
    }
    onChange(map);
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { overlayMouseDown.current = e.target === e.currentTarget; }}
      onClick={e => { if (e.target === e.currentTarget && overlayMouseDown.current) onClose(); }}
    >
      <div className="modal hotkeys-modal">
        <h2>Sound Hotkeys</h2>
        <p className="hotkeys-hint">
          Assign a preset sound to any key, pressed with no text field focused. Click a key
          button and press the key you want to use.
        </p>
        <div className="hotkeys-list">
          {draft.map((row, i) => {
            const dupKey = row.key && draft.some((r, j) => j !== i && r.key === row.key);
            const reserved = row.key && RESERVED_KEYS.has(row.key.toLowerCase());
            return (
              <div key={i} className="hotkeys-row">
                <button
                  className={`btn btn-sm hotkeys-key-btn ${recordingIndex === i ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setRecordingIndex(i)}
                >
                  {recordingIndex === i ? "Press a key…" : keyLabel(row.key)}
                </button>
                <select
                  className="hotkeys-sound-select"
                  value={row.soundId}
                  onChange={e => updateSound(i, e.target.value)}
                >
                  {SOUND_PRESETS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => soundById(row.soundId)?.play()}
                  title="Preview this sound"
                >▶</button>
                <button className="btn btn-danger btn-sm" onClick={() => removeRow(i)} title="Remove">✕</button>
                {dupKey && <span className="hotkeys-warning">used twice above</span>}
                {!dupKey && reserved && <span className="hotkeys-warning">already used elsewhere</span>}
              </div>
            );
          })}
          {draft.length === 0 && <div className="hotkeys-empty">No sound hotkeys yet.</div>}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={addRow}>+ Add hotkey</button>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
