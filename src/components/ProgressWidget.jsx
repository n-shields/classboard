import { useState, useRef } from "react";
import "./ProgressWidget.css";

const DEFAULT_BAR = { id: 1, title: "Class Prize", steps: 10, count: 0, color: "#facc15" };
const DEFAULT_COLOR = "#facc15";

function migrateBars(data) {
  if (!data) return [{ ...DEFAULT_BAR }];
  if (Array.isArray(data)) return data.map(b => ({ color: DEFAULT_COLOR, ...b }));
  // Migrate old format { count, maxSteps, goalName }
  return [{ id: 1, title: data.goalName || "Class Prize", steps: data.maxSteps || 10, count: data.count || 0, color: DEFAULT_COLOR }];
}

export default function ProgressWidget({ data, onChange, collapsed, onToggle }) {
  const bars = migrateBars(data);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const overlayMouseDown = useRef(false);

  const saveBars = (newBars) => onChange(newBars);

  // Click a cell: fill up to index, or unfill if already at exactly that index
  const handleCellClick = (barIdx, cellIdx) => {
    const bar = bars[barIdx];
    const newCount = bar.count === cellIdx + 1 ? cellIdx : cellIdx + 1;
    const newBars = bars.map((b, i) => i === barIdx ? { ...b, count: newCount } : b);
    saveBars(newBars);
  };

  const openEdit = () => {
    setDraft(JSON.parse(JSON.stringify(bars)));
    setEditOpen(true);
  };

  const addBar = () => {
    const nextId = Math.max(0, ...draft.map(b => b.id)) + 1;
    setDraft([...draft, { id: nextId, title: `Goal ${draft.length + 1}`, steps: 10, count: 0, color: DEFAULT_COLOR }]);
  };

  const updateDraft = (i, field, value) => {
    setDraft(d => d.map((b, idx) => idx === i ? { ...b, [field]: value } : b));
  };

  const removeDraft = (i) => {
    setDraft(d => d.filter((_, idx) => idx !== i));
  };

  const saveEdit = () => {
    const cleaned = draft
      .map(b => ({
        ...b,
        title: b.title.trim() || "Goal",
        steps: Math.max(1, Math.min(50, parseInt(b.steps) || 10)),
        count: Math.min(b.count, Math.max(1, Math.min(50, parseInt(b.steps) || 10))),
      }))
      .filter((_, i) => i === 0 || draft[i]); // keep at least one
    saveBars(cleaned.length ? cleaned : [{ ...DEFAULT_BAR }]);
    setEditOpen(false);
  };

  const anyFull = bars.some(b => b.count >= b.steps);
  const title = bars.length === 1 ? bars[0].title : "Progress";

  return (
    <div className={`card progress-widget ${anyFull ? "pw-full" : ""} ${collapsed ? "card--collapsed" : ""}`} tabIndex={-1}>
      <div className="card-body pw-body">
        {bars.map((bar, barIdx) => {
          const isFull = bar.count >= bar.steps;
          const color = bar.color || DEFAULT_COLOR;
          return (
            <div key={bar.id} className={`pw-bar ${isFull ? "pw-bar-full" : ""}`} style={{ "--bar-color": color }}>
              {bars.length > 1 && (
                <div className="pw-bar-title" style={{ color }}>{bar.title}</div>
              )}
              <div className="pw-cells" style={{ "--cols": Math.min(bar.steps, 10) }}>
                {Array.from({ length: bar.steps }, (_, i) => (
                  <div
                    key={i}
                    className={`pw-cell ${i < bar.count ? "pw-cell-on" : ""} ${isFull ? "pw-cell-full" : ""}`}
                    onClick={() => handleCellClick(barIdx, i)}
                    title={i < bar.count ? "Click to unfill" : "Click to fill"}
                  />
                ))}
              </div>
              {isFull && <div className="pw-celebration" style={{ color }}>🏆 {bar.title}!</div>}
            </div>
          );
        })}
      </div>
        <button className="pw-settings-btn" onClick={openEdit} title="Edit goals">⚙</button>

      {editOpen && (
        <div
          className="modal-overlay"
          onMouseDown={e => { overlayMouseDown.current = e.target === e.currentTarget; }}
          onClick={e => { if (e.target === e.currentTarget && overlayMouseDown.current) setEditOpen(false); }}
        >
          <div className="modal pw-edit-modal">
            <h2>Edit Goals</h2>
            <div className="pw-edit-list">
              {draft.map((bar, i) => (
                <div key={bar.id} className="pw-edit-row">
                  <input
                    className="pw-edit-color"
                    type="color"
                    value={bar.color || DEFAULT_COLOR}
                    onChange={e => updateDraft(i, "color", e.target.value)}
                    title="Bar color"
                  />
                  <input
                    className="pw-edit-title"
                    value={bar.title}
                    onChange={e => updateDraft(i, "title", e.target.value)}
                    placeholder="Goal name"
                  />
                  <input
                    className="pw-edit-steps"
                    type="number"
                    min="1"
                    max="50"
                    value={bar.steps}
                    onChange={e => updateDraft(i, "steps", e.target.value)}
                    title="Steps (1–50)"
                  />
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => updateDraft(i, "count", 0)}
                    title="Reset count"
                  >↺</button>
                  {draft.length > 1 && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => removeDraft(i)}
                      title="Remove"
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 10 }}
              onClick={addBar}
            >+ Add Goal</button>
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
