import { useState } from "react";
import "./ScheduleEditor.css";

const SCHEDULE_TYPES = ["Normal", "Wednesday", "Half Day"];

export default function ScheduleEditor({ schedules, onChange, onClose }) {
  const [draft, setDraft] = useState(JSON.parse(JSON.stringify(schedules)));
  const [activeTab, setActiveTab] = useState(SCHEDULE_TYPES[0]);

  // Update draft and immediately persist via onChange
  const update = (updater) => {
    setDraft(prev => {
      const next = updater(JSON.parse(JSON.stringify(prev)));
      onChange(next);
      return next;
    });
  };

  const updatePeriod = (type, index, field, value) =>
    update(d => { d[type][index][field] = value; return d; });

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

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal schedule-editor">
        <h2>Edit Bell Schedules</h2>

        <div className="schedule-tabs">
          {SCHEDULE_TYPES.map(t => (
            <button
              key={t}
              className={`btn btn-sm ${activeTab === t ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActiveTab(t)}
            >{t}</button>
          ))}
        </div>

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
            {draft[activeTab].map((p, i) => (
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
