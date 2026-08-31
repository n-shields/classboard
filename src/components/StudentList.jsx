import { useState, useEffect, useMemo } from "react";
import "./StudentList.css";

export default function StudentList({
  names,
  onNamesChange,
  excludedNames = [],
  onExcludedNamesChange,
  periodLabel,
  onClose,
}) {
  const [draft, setDraft] = useState("");

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
  };

  const removeAt = (idx) => {
    const removed = names[idx];
    onNamesChange(names.filter((_, i) => i !== idx));
    if (excludedNames.includes(removed)) {
      onExcludedNamesChange?.(excludedNames.filter(n => n !== removed));
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
