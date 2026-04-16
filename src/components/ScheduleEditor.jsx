import { useState, useRef, useEffect } from "react";
import "./ScheduleEditor.css";

const DAY_LABELS = [
  { idx: 1, label: "Mo" },
  { idx: 2, label: "Tu" },
  { idx: 3, label: "We" },
  { idx: 4, label: "Th" },
  { idx: 5, label: "Fr" },
  { idx: 6, label: "Sa" },
  { idx: 0, label: "Su" },
];

export default function ScheduleEditor({
  schedules, onChange, onClose,
  scheduleDays, onScheduleDaysChange,
  scheduleType, onScheduleTypeChange,
}) {
  const [draft, setDraft]         = useState(() => JSON.parse(JSON.stringify(schedules)));
  const [draftDays, setDraftDays] = useState(() => JSON.parse(JSON.stringify(scheduleDays || {})));
  const initTab = scheduleType || Object.keys(schedules)[0] || "Regular";
  const [activeTab, setActiveTab]     = useState(initTab);
  const [tabNameEdit, setTabNameEdit] = useState(initTab);
  const tabNameOrigRef    = useRef(initTab);
  const overlayMouseDown  = useRef(false);

  // Sync name input when user clicks a different tab
  useEffect(() => {
    setTabNameEdit(activeTab);
    tabNameOrigRef.current = activeTab;
  }, [activeTab]);

  const scheduleNames = Object.keys(draft);

  const update = (updater) => {
    setDraft(prev => {
      const next = updater(JSON.parse(JSON.stringify(prev)));
      onChange(next);
      return next;
    });
  };

  const updateDays = (updater) => {
    setDraftDays(prev => {
      const next = updater(JSON.parse(JSON.stringify(prev)));
      onScheduleDaysChange(next);
      return next;
    });
  };

  const updatePeriod = (type, index, field, value) => {
    if (field === "label") {
      const oldLabel = draft[type][index].label;
      update(d => {
        Object.values(d).forEach(periods =>
          periods.forEach(p => { if (p.label === oldLabel) p.label = value; })
        );
        return d;
      });
    } else {
      update(d => { d[type][index][field] = value; return d; });
    }
  };

  const addPeriod = (type) =>
    update(d => {
      const last = d[type][d[type].length - 1];
      d[type].push({
        id: d[type].length + 1,
        label: `Period ${d[type].length + 1}`,
        start: last?.end || "08:00",
        end: "09:00",
      });
      return d;
    });

  const removePeriod = (type, index) =>
    update(d => { d[type].splice(index, 1); return d; });

  const renameSchedule = (oldName, newName) => {
    update(d => Object.fromEntries(Object.entries(d).map(([k, v]) => [k === oldName ? newName : k, v])));
    updateDays(d => Object.fromEntries(Object.entries(d).map(([k, v]) => [k === oldName ? newName : k, v])));
    setActiveTab(newName);
    if (scheduleType === oldName) onScheduleTypeChange?.(newName);
  };

  const addSchedule = () => {
    let name = "New Schedule";
    let i = 2;
    while (Object.keys(draft).includes(name)) name = `New Schedule ${i++}`;
    update(d => { d[name] = [{ id: 1, label: "Period 1", start: "08:00", end: "09:00" }]; return d; });
    updateDays(d => { d[name] = []; return d; });
    setActiveTab(name);
  };

  const deleteSchedule = (name) => {
    const names = Object.keys(draft);
    if (names.length <= 1) return;
    update(d => { const nd = { ...d }; delete nd[name]; return nd; });
    updateDays(d => { const nd = { ...d }; delete nd[name]; return nd; });
    const remaining = names.filter(n => n !== name);
    if (activeTab === name) setActiveTab(remaining[0]);
    if (scheduleType === name) onScheduleTypeChange?.(remaining[0]);
  };

  const handleTabNameBlur = () => {
    const trimmed = tabNameEdit.trim();
    const original = tabNameOrigRef.current;
    if (!trimmed || trimmed === original) { setTabNameEdit(original); return; }
    // Reject if name already exists (for a different tab)
    if (Object.keys(draft).filter(k => k !== original).includes(trimmed)) { setTabNameEdit(original); return; }
    renameSchedule(original, trimmed);
    tabNameOrigRef.current = trimmed;
  };

  const activePeriods = draft[activeTab] || [];

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { overlayMouseDown.current = e.target === e.currentTarget; }}
      onClick={e => { if (e.target === e.currentTarget && overlayMouseDown.current) onClose(); }}
    >
      <div className="modal schedule-editor">
        <h2>Edit Bell Schedules</h2>

        <div className="schedule-tabs">
          {scheduleNames.map(t => (
            <button
              key={t}
              className={`btn btn-sm ${activeTab === t ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActiveTab(t)}
            >{t}</button>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={addSchedule}>+ New</button>
        </div>

        <div className="schedule-tab-name-row">
          <span className="days-label">Name:</span>
          <input
            className="schedule-tab-input"
            value={tabNameEdit}
            onChange={e => setTabNameEdit(e.target.value)}
            onBlur={handleTabNameBlur}
            onKeyDown={e => {
              if (e.key === "Enter") e.target.blur();
              if (e.key === "Escape") { setTabNameEdit(tabNameOrigRef.current); e.target.blur(); }
            }}
          />
          {scheduleNames.length > 1 && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => deleteSchedule(activeTab)}
              title="Delete this schedule"
            >Delete</button>
          )}
        </div>

        {scheduleDays && (
          <div className="schedule-days">
            <span className="days-label">Use on:</span>
            {DAY_LABELS.map(({ idx, label }) => {
              const checked = draftDays[activeTab]?.includes(idx) ?? false;
              return (
                <label key={idx} className="day-checkbox">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      updateDays(d => {
                        const next = {};
                        Object.keys(d).forEach(k => { next[k] = (d[k] || []).filter(day => day !== idx); });
                        if (!checked) next[activeTab] = [...(next[activeTab] || []), idx].sort((a, b) => a - b);
                        return next;
                      });
                    }}
                  />
                  {label}
                </label>
              );
            })}
          </div>
        )}

        <table className="schedule-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Start</th>
              <th>End</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {activePeriods.map((p, i) => (
              <tr key={i}>
                <td>
                  <input
                    value={p.label}
                    onChange={e => updatePeriod(activeTab, i, "label", e.target.value)}
                    style={{ width: "120px" }}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    value={p.start}
                    onChange={e => updatePeriod(activeTab, i, "start", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    value={p.end}
                    onChange={e => updatePeriod(activeTab, i, "end", e.target.value)}
                  />
                </td>
                <td>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => removePeriod(activeTab, i)}
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => addPeriod(activeTab)}
        >+ Add Period</button>

        <div className="editor-footer">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
