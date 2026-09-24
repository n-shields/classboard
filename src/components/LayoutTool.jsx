import { useState, useEffect } from "react";
import { TILE_IDS, collectLeaves, insertLeaf, removeLeaf } from "../data/layout";
import { BUILTIN_PRESETS, loadSavedLayouts, saveSavedLayouts } from "../data/layoutPresets";
import "./LayoutTool.css";

const TILE_LABELS = {
  date: "Clock", clock: "Timer", notes: "Notes", text: "Board",
  camera: "Camera", wheel: "Names", prize: "Goals", reminders: "Reminders",
  decibel: "Decibel",
};

export default function LayoutTool({ layout, onLayoutChange, onClose }) {
  const [savedLayouts, setSavedLayouts] = useState(loadSavedLayouts);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shownIds = collectLeaves(layout);

  const toggleTile = (id) => {
    onLayoutChange(prev => {
      const leaves = collectLeaves(prev);
      if (leaves.has(id)) {
        if (leaves.size <= 1) return prev; // always leave at least one tile
        return removeLeaf(prev, id) ?? prev;
      }
      const anchor = [...leaves][0];
      return anchor ? insertLeaf(prev, anchor, id, "bottom") : prev;
    });
  };

  const applyTree = (tree) => onLayoutChange(() => JSON.parse(JSON.stringify(tree)));

  const saveCurrentAs = () => {
    const name = window.prompt("Name this layout:", "My Layout");
    if (!name) return;
    const next = { ...savedLayouts, [name]: layout };
    setSavedLayouts(next);
    saveSavedLayouts(next);
  };

  const deleteSaved = (name) => {
    const ok = window.confirm(`Delete the saved layout "${name}"? This can't be undone.`);
    if (!ok) return;
    const next = { ...savedLayouts };
    delete next[name];
    setSavedLayouts(next);
    saveSavedLayouts(next);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal layout-tool-modal">
        <h2>Layout</h2>

        <div className="layout-tool-section-label">Panes</div>
        <div className="layout-tool-checkboxes">
          {TILE_IDS.map(id => (
            <label key={id} className="layout-tool-checkbox">
              <input
                type="checkbox"
                checked={shownIds.has(id)}
                onChange={() => toggleTile(id)}
              />
              {TILE_LABELS[id] ?? id}
            </label>
          ))}
        </div>

        <div className="layout-tool-section-label">Presets</div>
        <div className="layout-tool-presets">
          {Object.entries(BUILTIN_PRESETS).map(([name, tree]) => (
            <button key={name} className="btn btn-ghost btn-sm" onClick={() => applyTree(tree)}>
              {name}
            </button>
          ))}
        </div>

        <div className="layout-tool-section-label">Saved layouts</div>
        <button className="btn btn-ghost btn-sm layout-tool-save-btn" onClick={saveCurrentAs}>
          💾 Save current as...
        </button>
        {Object.keys(savedLayouts).length > 0 && (
          <div className="layout-tool-saved-list">
            {Object.keys(savedLayouts).sort().map(name => (
              <div key={name} className="layout-tool-saved-row">
                <button className="layout-tool-saved-btn" onClick={() => applyTree(savedLayouts[name])}>
                  {name}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => deleteSaved(name)}
                  title={`Delete "${name}"`}
                >🗑</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
