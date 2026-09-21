import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { playClick, playDing } from "../data/sounds";
import { GEMS_REPEAT_MS } from "../data/gems";
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
  wheelColors = [],
  gems = {},
  onGemsChange,
  gemsLabel = "Gems",
  onGemsLabelChange,
  jobs = {},
  onJobsChange,
  otherPeriods = [],
  onDeleteClassList,
  periodLabel,
  onClose,
  simple = false,
  sortMode = "default",
  onSortModeChange,
}) {
  const [draft, setDraft] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [editingGemsLabel, setEditingGemsLabel] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  // Simple mode: highlights a student's whole row in their own color while
  // their name has focus, or right after clicking their points value (which
  // isn't itself focusable).
  const [activeIdx, setActiveIdx] = useState(null);
  // Simple mode has no visible color swatch — double-clicking the name
  // opens a hidden color input's native picker instead.
  const colorInputRefs = useRef({});
  // Clicking the points value highlights a row without the name field ever
  // gaining real DOM focus — but the +/- gems shortcuts key off which field
  // is actually focused (that's what keeps the global "every student"
  // shortcut from double-firing), so a plain highlight wouldn't route
  // keystrokes to just that student. Focusing the name input for real here
  // fixes that in one place, since onFocus already sets activeIdx too.
  const nameInputRefs = useRef({});
  // Simple mode (the board-facing view) sizes its text as large as the
  // roster and the modal's own size allow — see the useLayoutEffect below
  // (after sortedEntries) that binary-searches --student-font-size.
  const listRef = useRef(null);

  // Points aren't a real focusable element, so a click there needs its own
  // "clear" path too — anything outside the two activation spots drops it.
  useEffect(() => {
    if (!simple) return;
    const onMouseDown = (e) => {
      if (e.target.closest(".student-name-input") || e.target.closest(".student-gems-value")) return;
      setActiveIdx(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [simple]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const activeNames = useMemo(
    () => names.filter(n => !excludedNames.includes(n)),
    [names, excludedNames],
  );
  const activeCount = activeNames.length;
  // Simple mode (the board-facing quick view) always lays out in 2 columns
  // so a full class fits without scrolling as far.
  const useColumns = simple;

  // Default order is the raw (draggable) `names` array; the other modes
  // derive a display order but leave `names` itself untouched, so every
  // handler below can keep addressing students by their real index.
  const sortedEntries = useMemo(() => {
    const entries = names.map((name, idx) => ({ name, idx }));
    if (sortMode === "az") return entries.sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === "za") return entries.sort((a, b) => b.name.localeCompare(a.name));
    if (sortMode === "birthday") {
      const monthDay = (n) => (birthdays[n] ? birthdays[n].slice(5) : null); // "MM-DD"
      return entries.sort((a, b) => {
        const ma = monthDay(a.name), mb = monthDay(b.name);
        if (ma === null && mb === null) return a.idx - b.idx;
        if (ma === null) return 1;
        if (mb === null) return -1;
        return ma.localeCompare(mb);
      });
    }
    if (sortMode === "points") {
      return entries.sort((a, b) => (gems[b.name] || 0) - (gems[a.name] || 0) || a.idx - b.idx);
    }
    return entries;
  }, [names, sortMode, birthdays, gems]);

  // Binary-searches the largest --student-font-size that still lets every
  // row fit inside the list's own box without needing to scroll, so a small
  // class reads in huge letters across the room while a full one still fits
  // (and, as a safety net, still scrolls rather than silently clipping if
  // even the smallest size doesn't fit everyone). Recomputed on a
  // ResizeObserver (the modal itself resizing) and whenever row content
  // that affects layout changes.
  useLayoutEffect(() => {
    if (!simple) return;
    const el = listRef.current;
    if (!el) return;
    const fits = (remSize) => {
      el.style.setProperty("--student-font-size", `${remSize}rem`);
      return el.scrollHeight <= el.clientHeight + 1;
    };
    const compute = () => {
      if (!el.clientHeight) return; // not laid out yet — a pending resize will retry
      let lo = 0.8, hi = 6;
      if (!fits(lo)) { el.style.setProperty("--student-font-size", `${lo}rem`); return; }
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid; else hi = mid;
      }
      el.style.setProperty("--student-font-size", `${lo}rem`);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [simple, sortedEntries, gems, jobs, gemsLabel]);

  const reorderNames = (fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    const reordered = names.slice();
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    onNamesChange(reordered);
  };

  // A student's color swatch defaults to whatever color they'd currently get
  // on the wheel (same index-based cycling WheelOfNames uses), until the
  // teacher picks an explicit override.
  const defaultColorFor = (name) => {
    const idx = activeNames.indexOf(name);
    if (idx === -1 || wheelColors.length === 0) return "#888888";
    return wheelColors[idx % wheelColors.length];
  };

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
    if (old !== value && gems[old] !== undefined) {
      const next = { ...gems };
      delete next[old];
      next[value] = gems[old];
      onGemsChange?.(next);
    }
    if (old !== value && jobs[old] !== undefined) {
      const next = { ...jobs };
      delete next[old];
      next[value] = jobs[old];
      onJobsChange?.(next);
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

  const adjustGems = (name, delta) => {
    const current = gems[name] || 0;
    const next = Math.max(0, current + delta);
    onGemsChange?.({ ...gems, [name]: next });
    if (delta > 0) playDing(); else if (delta < 0) playClick();
  };

  const setGems = (name, value) => {
    const next = Math.max(0, Math.round(Number(value)) || 0);
    onGemsChange?.({ ...gems, [name]: next });
  };

  // Held +/- repeat for a single student's name field: the browser's own
  // OS-driven key-repeat is much faster than our target rate, so this
  // drives its own interval instead (matching the global shortcut in
  // PeriodBar). Keyed by key name so multiple held keys repeat independently.
  const heldTimersRef = useRef(new Map());
  const stopHeldKey = (key) => {
    const id = heldTimersRef.current.get(key);
    if (id) { clearInterval(id); heldTimersRef.current.delete(key); }
  };
  const stopAllHeldKeys = () => {
    heldTimersRef.current.forEach(id => clearInterval(id));
    heldTimersRef.current.clear();
  };
  useEffect(() => stopAllHeldKeys, []);

  const setJob = (name, value) => {
    const next = { ...jobs };
    if (value) next[name] = value; else delete next[name];
    onJobsChange?.(next);
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
    if (gems[removed] !== undefined) {
      const next = { ...gems };
      delete next[removed];
      onGemsChange?.(next);
    }
    if (jobs[removed] !== undefined) {
      const next = { ...jobs };
      delete next[removed];
      onJobsChange?.(next);
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
    const staleGKeys = Object.keys(gems).filter(n => !seen.has(n));
    if (staleGKeys.length) {
      const next = { ...gems };
      for (const n of staleGKeys) delete next[n];
      onGemsChange?.(next);
    }
    const staleJKeys = Object.keys(jobs).filter(n => !seen.has(n));
    if (staleJKeys.length) {
      const next = { ...jobs };
      for (const n of staleJKeys) delete next[n];
      onJobsChange?.(next);
    }
  };

  const importFromPeriod = (label) => {
    const src = otherPeriods.find(p => p.label === label);
    if (!src) return;
    const existing = new Set(names.map(n => n.trim()));
    const toAdd = src.names.filter(n => !existing.has(n));
    setImportOpen(false);
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
    const srcGems = src.gems || {};
    const gAdditions = {};
    for (const n of toAdd) if (srcGems[n]) gAdditions[n] = srcGems[n];
    if (Object.keys(gAdditions).length) onGemsChange?.({ ...gems, ...gAdditions });
    const srcJobs = src.jobs || {};
    const jAdditions = {};
    for (const n of toAdd) if (srcJobs[n]) jAdditions[n] = srcJobs[n];
    if (Object.keys(jAdditions).length) onJobsChange?.({ ...jobs, ...jAdditions });
  };

  const deleteClassList = (label) => {
    const src = otherPeriods.find(p => p.label === label);
    if (!src) return;
    const n = src.names.length;
    const ok = window.confirm(
      `Delete the saved class list for "${label}" (${n} student${n === 1 ? "" : "s"})? This can't be undone.`
    );
    if (ok) onDeleteClassList?.(label);
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
      <div className={`modal student-modal student-modal--full ${useColumns ? "student-modal--wide" : ""}`}>
        <div className="student-modal-header">
          <h2>Students{periodLabel ? ` — ${periodLabel}` : ""}</h2>
          {editingGemsLabel ? (
            <input
              className="student-gems-label-edit"
              autoFocus
              defaultValue={gemsLabel}
              onBlur={e => { onGemsLabelChange?.(e.target.value.trim() || "Gems"); setEditingGemsLabel(false); }}
              onKeyDown={e => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditingGemsLabel(false);
              }}
            />
          ) : (
            <span
              className="student-gems-label"
              onClick={() => setEditingGemsLabel(true)}
              title="Click to rename this currency"
            >{gemsLabel}</span>
          )}
          {!simple && names.length > 0 && (
            <span className="student-count">{activeCount} / {names.length} in wheel</span>
          )}
        </div>

        {names.length > 0 && (
          <>
            <div className="student-list-actions">
              {!simple && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => onExcludedNamesChange?.([])}>
                    All in wheel
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onExcludedNamesChange?.(names.slice())}>
                    None
                  </button>
                </>
              )}
              <select
                className="student-sort-select"
                value={sortMode}
                onChange={e => onSortModeChange?.(e.target.value)}
                title="Sort students"
              >
                <option value="default">Default order (drag to reorder)</option>
                <option value="az">A → Z</option>
                <option value="za">Z → A</option>
                <option value="birthday">Birthday</option>
                <option value="points">{gemsLabel} (high to low)</option>
              </select>
            </div>
            <div
              ref={listRef}
              className={`student-list ${useColumns ? "student-list--columns" : ""}`}
              // grid-auto-flow: column needs an explicit row-track count to
              // know when to wrap into the second column — without it,
              // every row would stack in the first column only.
              style={useColumns ? { gridTemplateRows: `repeat(${Math.max(1, Math.ceil(sortedEntries.length / 2))}, max-content)` } : undefined}
            >
              {sortedEntries.map(({ name, idx }) => {
                const excluded = excludedNames.includes(name);
                const draggableRow = sortMode === "default";
                return (
                  <div
                    key={idx}
                    className={`student-row ${excluded && !simple ? "student-row--excluded" : ""} ${dragOverIndex === idx ? "student-row--drag-over" : ""}`}
                    style={simple && activeIdx === idx ? { backgroundColor: colors[name] || defaultColorFor(name) } : undefined}
                    onDragOver={draggableRow ? (e) => { e.preventDefault(); setDragOverIndex(idx); } : undefined}
                    onDragLeave={draggableRow ? () => setDragOverIndex(i => (i === idx ? null : i)) : undefined}
                    onDrop={draggableRow ? (e) => {
                      e.preventDefault();
                      if (dragIndex !== null) reorderNames(dragIndex, idx);
                      setDragIndex(null);
                      setDragOverIndex(null);
                    } : undefined}
                  >
                    {draggableRow && (
                      <span
                        className="student-drag-handle"
                        draggable
                        onDragStart={() => setDragIndex(idx)}
                        onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                        title="Drag to reorder"
                      >⋮⋮</span>
                    )}
                    {!simple && (
                      <input
                        type="checkbox"
                        checked={!excluded}
                        onChange={() => toggleExclude(name)}
                        title={excluded ? "Add to wheel" : "Remove from wheel"}
                      />
                    )}
                    <input
                      className="student-name-input"
                      ref={el => { nameInputRefs.current[idx] = el; }}
                      value={name}
                      onChange={e => setName(idx, e.target.value)}
                      onFocus={simple ? () => setActiveIdx(idx) : undefined}
                      onBlur={e => { cleanup(e); if (simple) setActiveIdx(null); stopAllHeldKeys(); }}
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.currentTarget.blur(); return; }
                        // With this name field focused, +/- adjust just this
                        // student — the global shortcut (all students) is blocked
                        // while any field has focus, so this doesn't double up.
                        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                          const magnitude = e.shiftKey ? 10 : 1;
                          const delta = e.code === "Equal" || e.key === "+" || e.key === "=" ? magnitude
                            : e.code === "Minus" || e.key === "-" || e.key === "_" ? -magnitude : 0;
                          if (delta) {
                            e.preventDefault();
                            // Keyed by the physical key, not e.key — Shift
                            // changing mid-hold changes e.key (e.g. "-" <-> "_")
                            // without its own keydown/keyup pair, which would
                            // otherwise orphan the interval under a key its
                            // matching keyup no longer reports.
                            const holdKey = e.code || e.key;
                            if (e.repeat || heldTimersRef.current.has(holdKey)) return; // we drive our own repeat, not the browser's
                            adjustGems(name, delta);
                            heldTimersRef.current.set(holdKey, setInterval(() => adjustGems(name, delta), GEMS_REPEAT_MS));
                          }
                        }
                      }}
                      onKeyUp={e => stopHeldKey(e.code || e.key)}
                      onDoubleClick={simple ? () => colorInputRefs.current[idx]?.click() : undefined}
                      title={simple ? "Double-click to change color" : undefined}
                      style={simple ? { backgroundColor: colors[name] || defaultColorFor(name) } : undefined}
                    />
                    {simple && (
                      <input
                        type="color"
                        ref={el => { colorInputRefs.current[idx] = el; }}
                        value={colors[name] || defaultColorFor(name)}
                        onChange={e => setColor(name, e.target.value)}
                        tabIndex={-1}
                        aria-hidden="true"
                        style={{ position: "absolute", width: 0, height: 0, padding: 0, border: "none", opacity: 0, pointerEvents: "none" }}
                      />
                    )}
                    {!simple && (
                      <input
                        type="date"
                        className="student-birthday-input"
                        value={birthdays[name] || ""}
                        onChange={e => setBirthday(name, e.target.value)}
                        title="Birthday"
                      />
                    )}
                    {!simple && (
                      <input
                        type="color"
                        className="student-color-input"
                        value={colors[name] || defaultColorFor(name)}
                        onChange={e => setColor(name, e.target.value)}
                        title="Wheel color"
                      />
                    )}
                    <div className="student-gems" title={gemsLabel}>
                      {simple ? (
                        <span
                          className="student-gems-value"
                          onClick={() => nameInputRefs.current[idx]?.focus()}
                        >{gems[name] || 0}</span>
                      ) : (
                        <input
                          type="number"
                          className="student-gems-input"
                          min="0"
                          value={gems[name] || 0}
                          onChange={e => setGems(name, e.target.value)}
                          onFocus={e => e.target.select()}
                          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        />
                      )}
                    </div>
                    <input
                      className="student-job-input"
                      value={jobs[name] || ""}
                      onChange={e => setJob(name, e.target.value)}
                      onBlur={cleanup}
                      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      placeholder="Job"
                      title="Job"
                    />
                    {!simple && (
                      <button
                        className="student-remove"
                        onClick={() => removeAt(idx)}
                        title="Remove student"
                      >×</button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!simple && (
          <input
            className="student-add-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addFromDraft(); } }}
            onBlur={addFromDraft}
            placeholder="Add a student — type a name, or paste a list"
          />
        )}

        {!simple && otherPeriods.length > 0 && (
          <div className="student-import">
            <button
              className="btn btn-ghost btn-sm student-import-toggle"
              onClick={() => setImportOpen(o => !o)}
            >
              Import from another period {importOpen ? "▴" : "▾"}
            </button>
            {importOpen && (
              <div className="student-import-list">
                {otherPeriods.map(p => (
                  <div key={p.label} className="student-import-list-row">
                    <button
                      className="student-import-list-btn"
                      onClick={() => importFromPeriod(p.label)}
                      title={`Add ${p.label}'s roster to this list`}
                    >{p.label} ({p.names.length})</button>
                    <button
                      className="btn btn-danger btn-sm student-delete-list-btn"
                      onClick={() => deleteClassList(p.label)}
                      title={`Delete the saved class list for "${p.label}"`}
                    >🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
