import { useState } from "react";
import WarningMeter from "./WarningMeter";
import "./ProgressWidget.css";

const DEFAULTS = { count: 0, maxSteps: 10, goalName: "Class Prize" };

export default function ProgressWidget({ data, onChange, collapsed, onToggle }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftSteps, setDraftSteps] = useState("");

  const { count = 0, maxSteps = 10, goalName = "Class Prize" } = data ?? DEFAULTS;
  const isFull = count >= maxSteps;

  const set = (patch) => onChange({ ...DEFAULTS, ...data, ...patch });

  const increment = () => { if (!isFull) set({ count: count + 1 }); };
  const decrement = () => { if (count > 0) set({ count: count - 1 }); };

  const openSettings = () => {
    setDraftName(goalName);
    setDraftSteps(String(maxSteps));
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    const steps = Math.max(1, Math.min(50, parseInt(draftSteps) || maxSteps));
    set({ goalName: draftName.trim() || goalName, maxSteps: steps, count: Math.min(count, steps) });
    setSettingsOpen(false);
  };

  const cells = Array.from({ length: maxSteps }, (_, i) => i < count);

  return (
    <div className={`card progress-widget ${isFull ? "pw-full" : ""} ${collapsed ? "card--collapsed" : ""}`}>
      <div className="card-header">
        <span className="header-toggle pw-title" onClick={onToggle}>
          <span className="header-chevron">{collapsed ? "▶" : "▼"}</span>
          {goalName}
        </span>
        {!collapsed && (
          <div style={{ display: "flex", gap: 6 }}>
            {isFull && <span className="pw-badge">🎉</span>}
            <button className="btn btn-ghost btn-sm" onClick={openSettings} title="Settings">⚙</button>
          </div>
        )}
      </div>

      <div className="card-body pw-body">
        <div className="pw-cells" style={{ "--cols": Math.min(maxSteps, 10) }}>
          {cells.map((filled, i) => (
            <div key={i} className={`pw-cell ${filled ? "pw-cell-on" : ""} ${isFull ? "pw-cell-full" : ""}`} />
          ))}
        </div>

        <div className="pw-controls">
          <button
            className="btn pw-btn pw-minus"
            onClick={decrement}
            disabled={count === 0}
          >−</button>
          <span className="pw-count">{count}<span className="pw-max">/{maxSteps}</span></span>
          <button
            className="btn pw-btn pw-plus"
            onClick={increment}
            disabled={isFull}
          >+</button>
        </div>

        {isFull && (
          <div className="pw-celebration">🏆 Goal Reached!</div>
        )}

        <div className="pw-warning-row">
          <WarningMeter />
        </div>
      </div>

      {settingsOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSettingsOpen(false)}>
          <div className="modal" style={{ minWidth: 280 }}>
            <h2>Prize Settings</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              <label style={{ fontSize: "0.85rem" }}>
                Goal name
                <input
                  style={{ display: "block", width: "100%", marginTop: 4 }}
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveSettings()}
                />
              </label>
              <label style={{ fontSize: "0.85rem" }}>
                Steps until prize (1–50)
                <input
                  type="number"
                  min="1"
                  max="50"
                  style={{ display: "block", width: "100%", marginTop: 4 }}
                  value={draftSteps}
                  onChange={e => setDraftSteps(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveSettings()}
                />
              </label>
              <button
                className="btn btn-danger btn-sm"
                style={{ alignSelf: "flex-start" }}
                onClick={() => { set({ count: 0 }); setSettingsOpen(false); }}
              >Reset Progress</button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setSettingsOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSettings}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
