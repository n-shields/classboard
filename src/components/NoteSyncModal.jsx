import { useRef, useState } from "react";
import "./NoteSyncModal.css";

export default function NoteSyncModal({ currentLabel, allLabels, initialSelected, onSave, onClose }) {
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const overlayMouseDown = useRef(false);

  const toggle = (label) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const otherLabels = allLabels.filter(l => l !== currentLabel);

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { overlayMouseDown.current = e.target === e.currentTarget; }}
      onClick={e => { if (e.target === e.currentTarget && overlayMouseDown.current) onClose(); }}
    >
      <div className="modal note-sync-modal">
        <h2>Sync Notes — {currentLabel}</h2>
        <p className="note-sync-hint">
          Synced periods share the same notes. Editing this pane in one will update the other automatically.
        </p>

        {otherLabels.length === 0 ? (
          <p className="note-sync-empty">No other periods to sync with yet.</p>
        ) : (
          <div className="note-sync-list">
            {otherLabels.map(label => (
              <label key={label} className="note-sync-row">
                <input
                  type="checkbox"
                  checked={selected.has(label)}
                  onChange={() => toggle(label)}
                />
                {label}
              </label>
            ))}
          </div>
        )}

        <div className="editor-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave([...selected])}>Save</button>
        </div>
      </div>
    </div>
  );
}
