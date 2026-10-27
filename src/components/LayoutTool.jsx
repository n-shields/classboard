import { useState, useEffect } from "react";
import { TILE_IDS, COMBINABLE_IDS, collectLeaves, removeLeaf, combineLegacyClock, restoreTile } from "../data/layout";
import { BUILTIN_PRESETS, loadSavedLayouts, saveSavedLayouts } from "../data/layoutPresets";
import "./LayoutTool.css";

const TILE_LABELS = {
  date: "Clock", clock: "Period countdown", timer: "Timer", stopwatch: "Stopwatch", notes: "Notes", text: "Board",
  camera: "Camera", wheel: "Names", prize: "Goals", reminders: "Reminders",
  decibel: "Noise", captions: "Captions",
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
      // Back where it last was — or, failing that, Period/Timer/Stopwatch
      // join the pane already showing one of them (switched with its ‹ ›
      // arrows) rather than getting a tile each; see restoreTile.
      return restoreTile(prev, id);
    });
  };

  const applyTree = (tree) => onLayoutChange(() => combineLegacyClock(JSON.parse(JSON.stringify(tree))));

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
          {TILE_IDS.filter(id => !COMBINABLE_IDS.includes(id)).map(id => (
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

        <div className="layout-tool-section-label">Countdowns &amp; timers</div>
        <div className="layout-tool-hint">Shown together in one pane — switch with its ‹ › arrows, or drag its ⠿ grip to move the one showing into its own pane.</div>
        <div className="layout-tool-checkboxes">
          {COMBINABLE_IDS.map(id => (
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
