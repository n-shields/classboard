import { useState, useEffect } from "react";
import { COST_MODES, PRIZES_KEY, loadPrizes, savePrizes, makePrize, prizeCost } from "../data/prizes";
import "./PrizeMenu.css";

// The prize menu, opened from the Students list's 🏆 button. Costs are
// worked out from this period's class total (the sum of every listed
// student's points), so the same menu prices itself per class. ✎ switches
// to editing the prizes themselves.
export default function PrizeMenu({ names, gems, gemsLabel = "Gems", onClose }) {
  const [prizes, setPrizes] = useState(loadPrizes);
  const [editing, setEditing] = useState(false);

  // Another window (Teacher View, the students window...) may edit the menu.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === PRIZES_KEY) setPrizes(loadPrizes()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = (next) => { setPrizes(next); savePrizes(next); };
  const patchPrize = (id, patch) => update(prizes.map(p => (p.id === id ? { ...p, ...patch } : p)));
  const removePrize = (id) => update(prizes.filter(p => p.id !== id));
  const addPrize = () => { update([...prizes, makePrize()]); setEditing(true); };
  // Blank names are only left behind once editing's done.
  const finishEditing = () => { update(prizes.filter(p => p.name.trim())); setEditing(false); };

  const classTotal = names.reduce((sum, n) => sum + (Number(gems[n]) || 0), 0);
  const unit = gemsLabel.toLowerCase();

  return (
    <div className="modal-overlay prize-overlay" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal prize-modal">
        <div className="prize-header">
          <h2>🏆 Prizes</h2>
          <span className="prize-total">Class total: <strong>{classTotal}</strong> {unit}</span>
          <button
            className={`btn btn-sm ${editing ? "btn-primary" : "btn-ghost"}`}
            onClick={() => (editing ? finishEditing() : setEditing(true))}
            title={editing ? "Done editing" : "Edit prizes"}
          >{editing ? "Done" : "✎ Edit"}</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        {prizes.length === 0 && !editing && (
          <p className="prize-empty">No prizes yet — click ✎ Edit to add some.</p>
        )}

        {!editing ? (
          <ul className="prize-list">
            {[...prizes]
              .map(p => ({ ...p, cost: prizeCost(p, classTotal) }))
              .sort((a, b) => a.cost - b.cost)
              .map(p => (
                <li key={p.id} className="prize-row">
                  <span className="prize-name">{p.name}</span>
                  <span className="prize-cost">{p.cost} {unit}</span>
                </li>
              ))}
          </ul>
        ) : (
          <div className="prize-edit-list">
            {prizes.map(p => (
              <div key={p.id} className="prize-edit-row">
                <input
                  className="prize-edit-name"
                  value={p.name}
                  autoFocus={!p.name}
                  placeholder="Prize name"
                  onChange={e => patchPrize(p.id, { name: e.target.value })}
                />
                <select value={p.mode} onChange={e => patchPrize(p.id, { mode: e.target.value })} title="How the cost is worked out">
                  {Object.entries(COST_MODES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                {p.mode !== "fixed" && (
                  <label className="prize-edit-num" title={`Percent of the class's total ${unit}`}>
                    <input
                      type="number" min="0" max="100" step="any"
                      value={p.percent}
                      onChange={e => patchPrize(p.id, { percent: e.target.value === "" ? "" : Number(e.target.value) })}
                    />%
                  </label>
                )}
                {p.mode !== "percent" && (
                  <label className="prize-edit-num" title={`A fixed number of ${unit}`}>
                    <input
                      type="number" min="0" step="1"
                      value={p.fixed}
                      onChange={e => patchPrize(p.id, { fixed: e.target.value === "" ? "" : Number(e.target.value) })}
                    />{unit}
                  </label>
                )}
                <span className="prize-edit-cost" title="Cost for this class right now">= {prizeCost(p, classTotal)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => removePrize(p.id)} title="Remove this prize">🗑</button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm prize-add-btn" onClick={addPrize}>+ Add prize</button>
          </div>
        )}
      </div>
    </div>
  );
}
