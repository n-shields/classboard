import { useState, useEffect, useMemo } from "react";
import "./StudentList.css";

export default function StudentList({
  names,
  onNamesChange,
  excludedNames = [],
  onExcludedNamesChange,
  birthdays = {},
  onBirthdaysChange,
  colors = {},
  onColorsChange,
  otherPeriods = [],
  onDeleteClassList,
  periodLabel,
  onClose,
}) {
  const [draft, setDraft] = useState("");
  const [importFrom, setImportFrom] = useState(otherPeriods[0]?.label ?? "");

  useEffect(() => {
    if (!otherPeriods.some(p => p.label === importFrom)) {
      setImportFrom(otherPeriods[0]?.label ?? "");
    }
  }, [otherPeriods]); // eslint-disable-line

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const activeCount = useMemo(
    () => names.filter(n => !excludedNames.includes(n)).length,
    [names, excludedNames],
  );

  const setName = (idx, value) => {
    const old = names[idx];
    onNamesChange(names.map((n, i) => (i === idx ? value : n)));
    if (old !== value && excludedNames.includes(old)) {
      onExcludedNamesChange?.(excludedNames.map(n => (n === old ? value : n)));
    }
    if (old !== value && birthdays[old] !== undefined) {
      const next = { ...birthdays };
      delete next[old];
      next[value] = birthdays[old];
      onBirthdaysChange?.(next);
    }
    if (old !== value && colors[old] !== undefined) {
      const next = { ...colors };
      delete next[old];
      next[value] = colors[old];
      onColorsChange?.(next);
    }
  };

  const setBirthday = (name, value) => {
    const next = { ...birthdays };
    if (value) next[name] = value; else delete next[name];
    onBirthdaysChange?.(next);
  };

  const setColor = (name, value) => {
    const next = { ...colors };
    if (value) next[name] = value; else delete next[name];
    onColorsChange?.(next);
  };

  const removeAt = (idx) => {
    const removed = names[idx];
    onNamesChange(names.filter((_, i) => i !== idx));
    if (excludedNames.includes(removed)) {
      onExcludedNamesChange?.(excludedNames.filter(n => n !== removed));
    }
    if (birthdays[removed] !== undefined) {
      const next = { ...birthdays };
      delete next[removed];
      onBirthdaysChange?.(next);
    }
    if (colors[removed] !== undefined) {
      const next = { ...colors };
      delete next[removed];
      onColorsChange?.(next);
    }
  };

  const toggleExclude = (name) => {
    const next = excludedNames.includes(name)
      ? excludedNames.filter(n => n !== name)
      : [...excludedNames, name];
    onExcludedNamesChange?.(next);
  };

  // Drop blank / duplicate names and prune stale exclusions once editing settles.
  const cleanup = () => {
    const seen = new Set();
    const cleaned = [];
    for (const n of names) {
      const t = n.trim();
      if (t && !seen.has(t)) { seen.add(t); cleaned.push(t); }
    }
    const changed =
      cleaned.length !== names.length || cleaned.some((n, i) => n !== names[i]);
    if (changed) onNamesChange(cleaned);
    const ex = excludedNames.filter(n => seen.has(n));
    if (ex.length !== excludedNames.length) onExcludedNamesChange?.(ex);
    const staleBKeys = Object.keys(birthdays).filter(n => !seen.has(n));
    if (staleBKeys.length) {
      const next = { ...birthdays };
      for (const n of staleBKeys) delete next[n];
      onBirthdaysChange?.(next);
    }
    const staleCKeys = Object.keys(colors).filter(n => !seen.has(n));
    if (staleCKeys.length) {
      const next = { ...colors };
      for (const n of staleCKeys) delete next[n];
      onColorsChange?.(next);
    }
  };

  const importFromPeriod = () => {
    const src = otherPeriods.find(p => p.label === importFrom);
    if (!src) return;
    const existing = new Set(names.map(n => n.trim()));
    const toAdd = src.names.filter(n => !existing.has(n));
    if (!toAdd.length) return;
    onNamesChange([...names, ...toAdd]);
    const srcBirthdays = src.birthdays || {};
    const bAdditions = {};
    for (const n of toAdd) if (srcBirthdays[n]) bAdditions[n] = srcBirthdays[n];
    if (Object.keys(bAdditions).length) onBirthdaysChange?.({ ...birthdays, ...bAdditions });
    const srcColors = src.colors || {};
    const cAdditions = {};
    for (const n of toAdd) if (srcColors[n]) cAdditions[n] = srcColors[n];
    if (Object.keys(cAdditions).length) onColorsChange?.({ ...colors, ...cAdditions });
  };

  const deleteClassList = () => {
    const src = otherPeriods.find(p => p.label === importFrom);
    if (!src) return;
    const n = src.names.length;
    const ok = window.confirm(
      `Delete the saved class list for "${importFrom}" (${n} student${n === 1 ? "" : "s"})? This can't be undone.`
    );
    if (ok) onDeleteClassList?.(importFrom);
  };

  const addFromDraft = () => {
    const parts = draft.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    setDraft("");
    if (!parts.length) return;
    const existing = new Set(names.map(n => n.trim()));
    const toAdd = [];
    for (const p of parts) {
      if (!existing.has(p)) { existing.add(p); toAdd.push(p); }
    }
    if (toAdd.length) onNamesChange([...names, ...toAdd]);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal student-modal">
        <div className="student-modal-header">
          <h2>Students{periodLabel ? ` — ${periodLabel}` : ""}</h2>
          {names.length > 0 && (
            <span className="student-count">{activeCount} / {names.length} in wheel</span>
          )}
        </div>

        {otherPeriods.length > 0 && (
          <div className="student-import-row">
            <select
              className="tb-select student-import-select"
              value={importFrom}
              onChange={e => setImportFrom(e.target.value)}
            >
              {otherPeriods.map(p => (
                <option key={p.label} value={p.label}>{p.label} ({p.names.length})</option>
              ))}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={importFromPeriod}>
              Import list
            </button>
            <button
              className="btn btn-danger btn-sm student-delete-list-btn"
              onClick={deleteClassList}
              title="Delete this period's saved class list"
            >🗑</button>
          </div>
        )}

        {names.length > 0 && (
          <>
            <div className="student-list-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => onExcludedNamesChange?.([])}>
                All in wheel
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onExcludedNamesChange?.(names.slice())}>
                None
              </button>
            </div>
            <div className="student-list">
              {names.map((name, idx) => {
                const excluded = excludedNames.includes(name);
                return (
                  <div key={idx} className={`student-row ${excluded ? "student-row--excluded" : ""}`}>
                    <input
                      type="checkbox"
                      checked={!excluded}
                      onChange={() => toggleExclude(name)}
                      title={excluded ? "Add to wheel" : "Remove from wheel"}
                    />
                    <input
                      className="student-name-input"
                      value={name}
                      onChange={e => setName(idx, e.target.value)}
                      onBlur={cleanup}
                      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    />
                    <input
                      type="date"
                      className="student-birthday-input"
                      value={birthdays[name] || ""}
                      onChange={e => setBirthday(name, e.target.value)}
                      title="Birthday"
                    />
                    <input
                      type="color"
                      className="student-color-input"
                      value={colors[name] || "#888888"}
                      onChange={e => setColor(name, e.target.value)}
                      title="Wheel color"
                    />
                    <button
                      className="student-remove"
                      onClick={() => removeAt(idx)}
                      title="Remove student"
                    >×</button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <input
          className="student-add-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addFromDraft(); } }}
          onBlur={addFromDraft}
          placeholder="Add a student — type a name, or paste a list"
        />

        <div className="student-modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
