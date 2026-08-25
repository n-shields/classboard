import { useState, useRef, useEffect, Fragment } from "react";
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

function PeriodChip({ label, onRename, onDelete, autoEdit = false }) {
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(label);

  useEffect(() => { if (!editing) setDraft(label); }, [label]);

  const commit = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== label) onRename?.(trimmed);
    else setDraft(label);
  };

  return (
    <div
      className="period-chip"
      draggable={!editing}
      onDragStart={e => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ type: "pool", label }));
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      {editing ? (
        <input
          autoFocus
          className="period-chip-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") { setDraft(label); setEditing(false); }
          }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span
          onDoubleClick={() => { setDraft(label); setEditing(true); }}
          title="Double-click to rename"
        >{label}</span>
      )}
      {onDelete && (
        <button
          className="chip-x"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Delete this period completely"
        >🗑</button>
      )}
    </div>
  );
}

export default function ScheduleEditor({
  schedules, onChange, onClose,
  scheduleDays, onScheduleDaysChange,
  scheduleType, onScheduleTypeChange,
  periodNames, onPeriodNamesChange,
}) {
  const [draft, setDraft]           = useState(() => JSON.parse(JSON.stringify(schedules)));
  const [draftDays, setDraftDays]   = useState(() => JSON.parse(JSON.stringify(scheduleDays || {})));
  const [draftNames, setDraftNames] = useState(() => [...periodNames]);
  const initTab = scheduleType || Object.keys(schedules)[0] || "Regular";
  const [activeTab, setActiveTab]     = useState(initTab);
  const [tabNameEdit, setTabNameEdit] = useState(initTab);
  const tabNameOrigRef   = useRef(initTab);
  const overlayMouseDown = useRef(false);
  const [newChipId, setNewChipId] = useState(null);

  const [dropIdx, setDropIdx]               = useState(null);
  const [draggingRowIdx, setDraggingRowIdx] = useState(null);

  useEffect(() => {
    setTabNameEdit(activeTab);
    tabNameOrigRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (newChipId !== null) {
      const t = setTimeout(() => setNewChipId(null), 50);
      return () => clearTimeout(t);
    }
  }, [newChipId]);

  const scheduleNames = Object.keys(draft);
  const activePeriods = draft[activeTab] || [];
  const usedInActive  = new Set(activePeriods.map(p => p.label));
  const poolChips     = draftNames.filter(n => !usedInActive.has(n.label));

  // ── State updaters ────────────────────────────────────────────────────────
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

  const updateNames = (next) => {
    setDraftNames(next);
    onPeriodNamesChange(next);
  };

  // ── Period name pool ──────────────────────────────────────────────────────
  const addPeriodName = () => {
    let label = "New";
    let i = 2;
    while (draftNames.some(n => n.label === label)) label = `New ${i++}`;
    const id = Math.max(0, ...draftNames.map(n => n.id)) + 1;
    updateNames([...draftNames, { id, label }]);
    setNewChipId(id);
  };

  const deletePeriodName = (label) => {
    const usedIn = Object.entries(draft)
      .filter(([, periods]) => periods.some(p => p.label === label))
      .map(([name]) => name);

    if (usedIn.length > 0) {
      const ok = window.confirm(
        `"${label}" is used in ${usedIn.length} schedule${usedIn.length > 1 ? "s" : ""} (${usedIn.join(", ")}).\n\nDelete it everywhere?`
      );
      if (!ok) return;
      update(d => {
        Object.values(d).forEach(periods => {
          for (let i = periods.length - 1; i >= 0; i--) {
            if (periods[i].label === label) periods.splice(i, 1);
          }
        });
        return d;
      });
    }

    updateNames(draftNames.filter(n => n.label !== label));
  };

  const renamePeriodName = (oldLabel, newLabel) => {
    if (!newLabel || newLabel === oldLabel) return;
    if (draftNames.some(n => n.label === newLabel)) return;
    updateNames(draftNames.map(n => n.label === oldLabel ? { ...n, label: newLabel } : n));
    update(d => {
      Object.values(d).forEach(periods =>
        periods.forEach(p => { if (p.label === oldLabel) p.label = newLabel; })
      );
      return d;
    });
  };

  // ── Schedule rows ─────────────────────────────────────────────────────────
  const insertPeriod = (label, atIndex) => {
    update(d => {
      const periods = d[activeTab];
      const prev = atIndex > 0 ? periods[atIndex - 1] : null;
      const next = atIndex < periods.length ? periods[atIndex] : null;
      let start = prev?.end ?? next?.start ?? "08:00";
      let end   = next?.start ?? "09:00";
      if (start >= end) {
        const [h, m] = start.split(":").map(Number);
        const t = h * 60 + m + 50;
        end = `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
      }
      periods.splice(atIndex, 0, {
        id: Math.max(0, ...periods.map(p => p.id ?? 0)) + 1,
        label,
        start,
        end,
      });
      return d;
    });
  };

  const removePeriod = (index) => {
    update(d => { d[activeTab].splice(index, 1); return d; });
  };

  const movePeriod = (fromIndex, toIndex) => {
    if (toIndex === fromIndex || toIndex === fromIndex + 1) return;
    update(d => {
      const periods = [...d[activeTab]];
      const [item] = periods.splice(fromIndex, 1);
      periods.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, item);
      d[activeTab] = periods;
      return d;
    });
  };

  const updateTime = (index, field, value) => {
    update(d => { d[activeTab][index][field] = value; return d; });
  };

  // ── Schedule tabs ─────────────────────────────────────────────────────────
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
    update(d => { d[name] = []; return d; });
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
    if (Object.keys(draft).filter(k => k !== original).includes(trimmed)) { setTabNameEdit(original); return; }
    renameSchedule(original, trimmed);
    tabNameOrigRef.current = trimmed;
  };

  // ── Drag and drop ─────────────────────────────────────────────────────────
  const getInsertAt = (e, rowIndex) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? rowIndex : rowIndex + 1;
  };

  const handleDrop = (e, insertAt) => {
    e.preventDefault();
    e.stopPropagation();
    setDropIdx(null);
    setDraggingRowIdx(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (data.type === "pool") {
        insertPeriod(data.label, insertAt);
      } else if (data.type === "row") {
        movePeriod(data.index, insertAt);
      }
    } catch (_) {}
  };

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

        {/* Period name pool */}
        <div className="period-pool">
          <span className="days-label pool-label">Periods:</span>
          <div className="pool-chips">
            {poolChips.map(n => (
              <PeriodChip
                key={n.id}
                label={n.label}
                onRename={newLabel => renamePeriodName(n.label, newLabel)}
                onDelete={() => deletePeriodName(n.label)}
                autoEdit={n.id === newChipId}
              />
            ))}
            {poolChips.length === 0 && (
              <span className="pool-empty">All periods in use</span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={addPeriodName} title="Add new period name">+</button>
          </div>
        </div>

        {/* Schedule drop area */}
        <div
          className="schedule-drop-area"
          onDragOver={e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropIdx(activePeriods.length);
          }}
          onDrop={e => handleDrop(e, activePeriods.length)}
          onDragLeave={e => {
            if (!e.currentTarget.contains(e.relatedTarget)) setDropIdx(null);
          }}
        >
          {activePeriods.length === 0 && (
            <div className="schedule-drop-empty">
              Drag period names here to build your schedule
            </div>
          )}

          {activePeriods.map((p, i) => (
            <Fragment key={p.label}>
              {dropIdx === i && <div className="drop-indicator" />}
              <div
                className={`schedule-row${draggingRowIdx === i ? " dragging-source" : ""}`}
                draggable
                onDragStart={e => {
                  e.stopPropagation();
                  setDraggingRowIdx(i);
                  e.dataTransfer.setData("text/plain", JSON.stringify({ type: "row", index: i }));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                  setDropIdx(getInsertAt(e, i));
                }}
                onDrop={e => {
                  e.stopPropagation();
                  handleDrop(e, getInsertAt(e, i));
                }}
                onDragEnd={() => { setDropIdx(null); setDraggingRowIdx(null); }}
              >
                <span className="drag-handle" title="Drag to reorder">≡</span>
                <span className="row-chip">{p.label}</span>
                <input
                  type="time"
                  value={p.start}
                  onChange={e => updateTime(i, "start", e.target.value)}
                />
                <span className="time-sep">→</span>
                <input
                  type="time"
                  value={p.end}
                  onChange={e => updateTime(i, "end", e.target.value)}
                />
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => removePeriod(i)}
                  title="Remove from schedule"
                >✕</button>
              </div>
            </Fragment>
          ))}

          {dropIdx === activePeriods.length && <div className="drop-indicator" />}
        </div>

        <div className="editor-footer">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
