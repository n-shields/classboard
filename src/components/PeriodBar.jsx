import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import ScheduleEditor from "./ScheduleEditor";
import StudentList from "./StudentList";
import LayoutTool from "./LayoutTool";
import HotkeysEditor from "./HotkeysEditor";
import { THEMES, THEME_KEYS, hasDarkText } from "../data/themes";
import { loadTeacherViewBounds, loadSeatingViewBounds } from "../data/teacherView";
import { playClick, playDing } from "../data/sounds";
import { loadSoundHotkeys, saveSoundHotkeys, soundById } from "../data/soundHotkeys";
import {
  isFileSystemAccessSupported, pickAutosaveFolder, loadAutosaveHandle, clearAutosaveHandle,
  hasReadWritePermission, requestReadWritePermission, timestampedFilename, writeSnapshot,
} from "../data/autosave";
import { GEMS_REPEAT_MS } from "../data/gems";
import "./PeriodBar.css";

function collectData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith("classboard_")) continue;
    const v = localStorage.getItem(k);
    if (v !== null) try { data[k] = JSON.parse(v); } catch (_) { data[k] = v; }
  }
  return data;
}

function doExport() {
  const data = collectData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `classboard-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PeriodBar({
  schedules, onSchedulesChange,
  scheduleType, onScheduleTypeChange,
  scheduleDays, onScheduleDaysChange,
  periodNames, onPeriodNamesChange,
  currentPeriodIndex, nextPeriodIndex, onPeriodSelect,
  autoMode, onAutoModeChange,
  currentTheme, onThemeChange,
  onImport,
  names = [], onNamesChange,
  excludedNames = [], onExcludedNamesChange,
  birthdays = {}, onBirthdaysChange,
  colors = {}, onColorsChange,
  gems = {}, onGemsChange,
  gemsLabel = "Gems", onGemsLabelChange,
  jobs = {}, onJobsChange,
  sortMode = "default", onSortModeChange,
  wheelColors = [],
  otherPeriods = [], onDeleteClassList,
  periodLabel,
  layout, onLayoutChange,
}) {
  const [editorOpen,    setEditorOpen]    = useState(false);
  const [studentsOpen,  setStudentsOpen]  = useState(false);
  const [layoutToolOpen, setLayoutToolOpen] = useState(false);
  const [hotkeysEditorOpen, setHotkeysEditorOpen] = useState(false);
  const [soundHotkeys, setSoundHotkeys] = useState(loadSoundHotkeys);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [themeMenuRect, setThemeMenuRect] = useState(null);
  const [visible,       setVisible]       = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [isFullscreen,  setIsFullscreen]  = useState(false);
  // "off": no folder chosen. "on": chosen and writable. "needs-permission":
  // a folder was chosen in an earlier session but the browser hasn't
  // (re-)granted write access yet this session — needs one click to redo,
  // not a fresh folder pick.
  const [autosaveStatus, setAutosaveStatus] = useState("off");
  const [autosaveFolderName, setAutosaveFolderName] = useState(null);
  const [lastAutosaveAt, setLastAutosaveAt] = useState(null);
  const autosaveHandleRef = useRef(null);
  const fileRef   = useRef(null);
  const hideTimer = useRef(null);
  const sidebarHideTimer = useRef(null);
  const themeMenuRef = useRef(null);
  const themeBtnRef = useRef(null);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Reload a folder picked in an earlier session. Only `queryPermission` is
  // called here (never `requestPermission`, which can prompt and needs a
  // fresh user gesture) so this never surprises the teacher on load.
  useEffect(() => {
    if (!isFileSystemAccessSupported()) return;
    (async () => {
      const handle = await loadAutosaveHandle().catch(() => null);
      if (!handle) return;
      autosaveHandleRef.current = handle;
      setAutosaveFolderName(handle.name);
      setAutosaveStatus((await hasReadWritePermission(handle).catch(() => false)) ? "on" : "needs-permission");
    })();
  }, []);

  const toggleAutosave = async () => {
    if (autosaveStatus === "on") {
      await clearAutosaveHandle().catch(() => {});
      autosaveHandleRef.current = null;
      setAutosaveFolderName(null);
      setLastAutosaveAt(null);
      setAutosaveStatus("off");
      return;
    }
    if (autosaveStatus === "needs-permission" && autosaveHandleRef.current) {
      const granted = await requestReadWritePermission(autosaveHandleRef.current).catch(() => false);
      if (granted) setAutosaveStatus("on");
      return;
    }
    try {
      const handle = await pickAutosaveFolder();
      autosaveHandleRef.current = handle;
      setAutosaveFolderName(handle.name);
      setAutosaveStatus("on");
    } catch (_) {
      // User canceled the folder picker — leave autosave off.
    }
  };

  // Snapshot the period being left, whenever the active period changes —
  // whether from its scheduled end time passing or a manual switch, both of
  // which show up here identically as `periodLabel` changing.
  const prevPeriodLabelRef = useRef(periodLabel);
  useEffect(() => {
    const prev = prevPeriodLabelRef.current;
    prevPeriodLabelRef.current = periodLabel;
    if (!prev || prev === periodLabel) return;
    if (autosaveStatus !== "on" || !autosaveHandleRef.current) return;
    (async () => {
      try {
        await writeSnapshot(autosaveHandleRef.current, timestampedFilename(prev), collectData());
        setLastAutosaveAt(new Date());
      } catch (_) {
        // Quiet by design — most likely permission was revoked outside the
        // app; stop trying silently until the teacher re-enables it.
        setAutosaveStatus("needs-permission");
      }
    })();
  }, [periodLabel, autosaveStatus]);

  // Space toggles the student list, as long as no other modal is up and the
  // user isn't typing in a field or focused on a button.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== " " && e.code !== "Space") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) return;
      const overlay = document.querySelector(".modal-overlay");
      if (overlay && !overlay.querySelector(".student-modal")) return;
      e.preventDefault();
      setStudentsOpen(o => !o);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Keyboard shortcuts, active whenever no text field has focus:
  //   ←/→ and ↑/↓  cycle the active period (wraps; disables auto-detect,
  //                same as clicking a period button)
  //   +/- (or =/-) give or take 1 gem from every student, or 10 with Shift
  //                held — held keys repeat at a fixed rate via our own timer
  //                rather than relying on the browser's OS-driven key-repeat,
  //                which varies and starts after a delay. Applying a delta
  //                opens the (real, central) student list, which then just
  //                stays open until the teacher closes it (Space, Escape, or
  //                clicking off).
  //   a            toggles auto-detect period
  //   (custom)     plays a sound effect — see soundHotkeys / HotkeysEditor,
  //                opened from the "🔊 Hotkeys" button
  const periods = schedules[scheduleType] || [];
  const namesRef = useRef(names);
  const gemsRef = useRef(gems);
  const onGemsChangeRef = useRef(onGemsChange);
  const autoModeRef = useRef(autoMode);
  const onAutoModeChangeRef = useRef(onAutoModeChange);
  const periodsRef = useRef(periods);
  const currentPeriodIndexRef = useRef(currentPeriodIndex);
  const onPeriodSelectRef = useRef(onPeriodSelect);
  const soundHotkeysRef = useRef(soundHotkeys);
  useEffect(() => { namesRef.current = names; }, [names]);
  useEffect(() => { gemsRef.current = gems; }, [gems]);
  useEffect(() => { onGemsChangeRef.current = onGemsChange; }, [onGemsChange]);
  useEffect(() => { autoModeRef.current = autoMode; }, [autoMode]);
  useEffect(() => { onAutoModeChangeRef.current = onAutoModeChange; }, [onAutoModeChange]);
  useEffect(() => { periodsRef.current = periods; }, [periods]);
  useEffect(() => { currentPeriodIndexRef.current = currentPeriodIndex; }, [currentPeriodIndex]);
  useEffect(() => { onPeriodSelectRef.current = onPeriodSelect; }, [onPeriodSelect]);
  useEffect(() => { soundHotkeysRef.current = soundHotkeys; }, [soundHotkeys]);

  useEffect(() => {
    // e.code (the physical key) rather than e.key, since holding Shift
    // changes e.key itself (e.g. "-" becomes "_") — using the physical key
    // plus e.shiftKey directly keeps ±1 vs ±10 correct regardless of
    // keyboard layout or which character shift actually produces.
    const gemsDeltaForKey = (e) => {
      const magnitude = e.shiftKey ? 10 : 1;
      if (e.code === "Equal" || e.key === "+" || e.key === "=") return magnitude;
      if (e.code === "Minus" || e.key === "-" || e.key === "_") return -magnitude;
      return 0;
    };
    const periodDeltaForKey = (key) => {
      if (key === "ArrowRight" || key === "ArrowDown") return 1;
      if (key === "ArrowLeft" || key === "ArrowUp") return -1;
      return 0;
    };
    const cyclePeriod = (delta) => {
      const periods = periodsRef.current;
      if (!periods.length) return;
      const current = currentPeriodIndexRef.current;
      const next = current === -1
        ? (delta > 0 ? 0 : periods.length - 1)
        : ((current + delta) % periods.length + periods.length) % periods.length;
      onPeriodSelectRef.current?.(next);
    };
    const applyDelta = (delta) => {
      const handler = onGemsChangeRef.current;
      if (!handler) return;
      const next = { ...gemsRef.current };
      for (const name of namesRef.current) next[name] = Math.max(0, (next[name] || 0) + delta);
      handler(next);
      if (delta > 0) playDing(); else playClick();
      setStudentsOpen(true);
    };
    // Tracks each held key's own repeat interval independently (not just the
    // most recent key) — pressing a second shortcut key before releasing the
    // first used to silently overwrite a single shared "held key" slot,
    // orphaning the first key's interval so it kept firing forever, since
    // its keyup could no longer match anything to stop.
    const heldTimers = new Map(); // key -> intervalId
    const stopKey = (key) => {
      const id = heldTimers.get(key);
      if (id) { clearInterval(id); heldTimers.delete(key); }
    };
    const stopAll = () => { heldTimers.forEach(id => clearInterval(id)); heldTimers.clear(); };
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key.toLowerCase() === "a") {
        if (e.repeat || document.querySelector(".modal-overlay")) return;
        e.preventDefault();
        onAutoModeChangeRef.current?.(!autoModeRef.current);
        return;
      }
      // Matches how HotkeysEditor stores a captured key: lowercased for a
      // plain character, as-is (e.g. "ArrowLeft") for anything longer.
      const soundKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const soundId = soundHotkeysRef.current[soundKey];
      if (soundId) {
        if (e.repeat || document.querySelector(".modal-overlay")) return;
        e.preventDefault();
        soundById(soundId)?.play();
        return;
      }
      const periodDelta = periodDeltaForKey(e.key);
      if (periodDelta) {
        if (e.repeat || document.querySelector(".modal-overlay")) return;
        e.preventDefault();
        cyclePeriod(periodDelta);
        return;
      }
      const delta = gemsDeltaForKey(e);
      if (!delta) return;
      const overlay = document.querySelector(".modal-overlay");
      if (overlay && !overlay.querySelector(".student-modal")) return;
      e.preventDefault();
      // Keyed by the physical key (e.code), not e.key — releasing/pressing
      // Shift mid-hold changes e.key (e.g. "-" <-> "_") without a keydown/
      // keyup pair for the still-held key itself, which would otherwise
      // orphan the interval under a key its matching keyup no longer reports.
      const holdKey = e.code || e.key;
      if (e.repeat || heldTimers.has(holdKey)) return; // we drive our own repeat, not the browser's
      applyDelta(delta);
      heldTimers.set(holdKey, setInterval(() => applyDelta(delta), GEMS_REPEAT_MS));
    };
    const onKeyUp = (e) => stopKey(e.code || e.key);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", stopAll);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stopAll);
      stopAll();
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  const handleSoundHotkeysChange = (map) => {
    setSoundHotkeys(map);
    saveSoundHotkeys(map);
  };

  // Close the theme dropdown on an outside click or Escape.
  useEffect(() => {
    if (!themeMenuOpen) return;
    const onMouseDown = (e) => {
      if (themeMenuRef.current?.contains(e.target) || themeBtnRef.current?.contains(e.target)) return;
      setThemeMenuOpen(false);
    };
    const onKeyDown = (e) => { if (e.key === "Escape") setThemeMenuOpen(false); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [themeMenuOpen]);

  const scheduleNames = Object.keys(schedules);

  const show = () => { clearTimeout(hideTimer.current); setVisible(true); };
  const scheduleHide = () => { hideTimer.current = setTimeout(() => setVisible(false), 300); };

  const showSidebar = () => { clearTimeout(sidebarHideTimer.current); setSidebarVisible(true); };
  const scheduleHideSidebar = () => { sidebarHideTimer.current = setTimeout(() => setSidebarVisible(false), 300); };

  const openTeacherView = () => {
    const bounds = loadTeacherViewBounds();
    // Floored (not just defaulted) so a size saved from before the student
    // list needed more room doesn't keep reopening too small. Width matters
    // because the full student-list row (checkbox, name, birthday, color,
    // gems, job, remove) needs real room — too narrow and the row wraps,
    // stranding just the remove button alone on a second line.
    const width  = Math.max(bounds?.width  || 720, 720);
    const height = Math.max(bounds?.height || 900, 900);
    const left   = Number.isFinite(bounds?.left) ? bounds.left : window.screenX + window.outerWidth;
    const top    = Number.isFinite(bounds?.top)  ? bounds.top  : window.screenY;
    const url = new URL(window.location.href);
    url.searchParams.set("view", "teacher");
    url.searchParams.delete("s");
    const popup = window.open(url.toString(), "classboard-teacher-view", `width=${width},height=${height},left=${left},top=${top}`);
    popup?.focus();
  };

  const openSeatingView = () => {
    const bounds = loadSeatingViewBounds();
    const width  = bounds?.width  || 1000;
    const height = bounds?.height || 700;
    const left   = Number.isFinite(bounds?.left) ? bounds.left : window.screenX + 40;
    const top    = Number.isFinite(bounds?.top)  ? bounds.top  : window.screenY + 40;
    const url = new URL(window.location.href);
    url.searchParams.set("view", "seating");
    url.searchParams.delete("s");
    const popup = window.open(url.toString(), "classboard-seating-view", `width=${width},height=${height},left=${left},top=${top}`);
    popup?.focus();
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        Object.entries(data).forEach(([k, v]) => {
          if (!k.startsWith("classboard_") || v == null) return;
          localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
        });
        onImport?.();
      } catch (err) {
        alert("Could not read file: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  return (
    <>
      {/* Invisible hover zone at very top of screen */}
      <div className="toolbar-trigger" onMouseEnter={show} onMouseLeave={scheduleHide} />

      <div
        className={`period-toolbar${visible ? " period-toolbar--visible" : ""}`}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      >
        <div className="period-toolbar-row">
          {/* Schedule selector */}
          <select
            className="tb-select"
            value={scheduleType}
            onChange={e => onScheduleTypeChange(e.target.value)}
          >
            {scheduleNames.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <button
            className={`btn btn-sm tb-btn ${autoMode ? "btn-primary" : "btn-ghost"}`}
            onClick={() => onAutoModeChange(!autoMode)}
            title="Auto-detect period from time (A)"
          >Auto</button>

          <button className="btn btn-ghost btn-sm tb-btn" onClick={() => setEditorOpen(true)}>Edit</button>
          <button className="btn btn-ghost btn-sm tb-btn" onClick={() => setLayoutToolOpen(true)} title="Show/hide panes, presets, and saved layouts">▦ Layout</button>
          <button className="btn btn-ghost btn-sm tb-btn" onClick={() => setHotkeysEditorOpen(true)} title="Assign sound effects to keyboard shortcuts">🔊 Hotkeys</button>

          <div className="tb-divider" />

          {/* Theme picker — the menu is portaled to <body> (positioned from
              the trigger's live rect) since the toolbar row's overflow-x:
              auto implicitly clips overflow-y too, cutting off anything
              that tries to drop down past the row's own height. */}
          <div className="tb-theme-picker">
            <button
              ref={themeBtnRef}
              className="tb-theme-trigger"
              onClick={() => {
                if (!themeMenuOpen) setThemeMenuRect(themeBtnRef.current?.getBoundingClientRect() ?? null);
                setThemeMenuOpen(v => !v);
              }}
              title={`Theme: ${THEMES[currentTheme]?.name}`}
            >
              <span className="tb-theme-swatch" style={{ background: THEMES[currentTheme]?.swatch }} />
              <span className="tb-theme-caret">▾</span>
            </button>
            {themeMenuOpen && themeMenuRect && createPortal(
              <div
                className="tb-theme-menu tb-theme-menu--swatches"
                ref={themeMenuRef}
                style={{ top: themeMenuRect.bottom + 4, left: themeMenuRect.left }}
              >
                {THEME_KEYS.flatMap((key, i) => {
                  const nodes = [];
                  if (i > 0 && hasDarkText(key) && !hasDarkText(THEME_KEYS[i - 1])) {
                    nodes.push(<div key={`div-${key}`} className="tb-theme-menu-divider" />);
                  }
                  nodes.push(
                    <button
                      key={key}
                      className={`tb-theme-option tb-theme-option--swatch ${key === currentTheme ? "tb-theme-option--active" : ""}`}
                      onClick={() => { onThemeChange(key); setThemeMenuOpen(false); }}
                      title={THEMES[key].name}
                      aria-label={THEMES[key].name}
                    >
                      <span className="tb-theme-swatch" style={{ background: THEMES[key].swatch }} />
                    </button>,
                  );
                  return nodes;
                })}
              </div>,
              document.body,
            )}
          </div>

          {/* Student list */}
          {onNamesChange && (
            <button className="btn btn-ghost btn-sm tb-btn" onClick={() => setStudentsOpen(true)} title="Edit the student list">
              👥 Students
            </button>
          )}

          {/* Seating chart — opens in its own popup window, like Teacher View */}
          <button className="btn btn-ghost btn-sm tb-btn" onClick={openSeatingView} title="Open the seating chart in its own window">⊞ Seats</button>

          {/* Teacher-only popup window, draggable to a second monitor */}
          <button className="btn btn-ghost btn-sm tb-btn" onClick={openTeacherView} title="Open a teacher-only window (drag it to another monitor)">
            🧑‍🏫 Teacher View
          </button>

          {/* Import / export — pinned right */}
          <button className="btn btn-ghost btn-sm tb-btn ei-btn" style={{ marginLeft: "auto" }} onClick={doExport} title="Export all data">↓ Export</button>
          <button className="btn btn-ghost btn-sm tb-btn ei-btn" onClick={() => fileRef.current.click()} title="Import data">↑ Import</button>
          {isFileSystemAccessSupported() && (
            <button
              className={`btn btn-sm tb-btn ei-btn ${autosaveStatus === "on" ? "btn-primary" : "btn-ghost"}`}
              onClick={toggleAutosave}
              title={
                autosaveStatus === "on"
                  ? `Auto-saving a dated snapshot to "${autosaveFolderName}" after each period${lastAutosaveAt ? ` — last saved ${lastAutosaveAt.toLocaleTimeString()}` : ""}. Click to turn off.`
                  : autosaveStatus === "needs-permission"
                  ? `Click to resume auto-saving to "${autosaveFolderName}"`
                  : "Pick a folder to quietly save a dated snapshot after each period"
              }
            >
              💾 Auto-save{autosaveStatus === "on" ? " ✓" : autosaveStatus === "needs-permission" ? " ⚠" : ""}
            </button>
          )}
          <button
            className={`btn btn-sm tb-btn ${isFullscreen ? "btn-primary" : "btn-ghost"}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            style={{ fontSize: "1rem", padding: "0 8px" }}
          >⛶</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
        </div>
      </div>

      {/* Invisible hover zone at the left edge — periods live in their own
          slide-out sidebar so the top toolbar doesn't have to grow with the
          schedule's period count. */}
      <div className="period-sidebar-trigger" onMouseEnter={showSidebar} onMouseLeave={scheduleHideSidebar} />

      <div
        className={`period-sidebar${sidebarVisible ? " period-sidebar--visible" : ""}`}
        onMouseEnter={showSidebar}
        onMouseLeave={scheduleHideSidebar}
      >
        {periods.map((p, i) => {
          const isActive = i === currentPeriodIndex;
          const isNext   = !isActive && autoMode && currentPeriodIndex === -1 && i === nextPeriodIndex;
          return (
            <button
              key={p.id ?? `${p.label}-${i}`}
              className={`btn btn-sm period-btn ${isActive ? "period-btn-active" : isNext ? "period-btn-next" : "btn-ghost"}`}
              onClick={() => onPeriodSelect(i)}
              title={`${p.start}–${p.end}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {editorOpen && (
        <ScheduleEditor
          schedules={schedules}
          onChange={onSchedulesChange}
          scheduleDays={scheduleDays}
          onScheduleDaysChange={onScheduleDaysChange}
          scheduleType={scheduleType}
          onScheduleTypeChange={onScheduleTypeChange}
          periodNames={periodNames}
          onPeriodNamesChange={onPeriodNamesChange}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {studentsOpen && (
        <StudentList
          names={names}
          onNamesChange={onNamesChange}
          excludedNames={excludedNames}
          onExcludedNamesChange={onExcludedNamesChange}
          birthdays={birthdays}
          onBirthdaysChange={onBirthdaysChange}
          colors={colors}
          onColorsChange={onColorsChange}
          gems={gems}
          onGemsChange={onGemsChange}
          gemsLabel={gemsLabel}
          onGemsLabelChange={onGemsLabelChange}
          jobs={jobs}
          onJobsChange={onJobsChange}
          sortMode={sortMode}
          onSortModeChange={onSortModeChange}
          wheelColors={wheelColors}
          otherPeriods={otherPeriods}
          onDeleteClassList={onDeleteClassList}
          periodLabel={periodLabel}
          onClose={() => setStudentsOpen(false)}
          simple
        />
      )}

      {layoutToolOpen && (
        <LayoutTool
          layout={layout}
          onLayoutChange={onLayoutChange}
          onClose={() => setLayoutToolOpen(false)}
        />
      )}

      {hotkeysEditorOpen && (
        <HotkeysEditor
          hotkeys={soundHotkeys}
          onChange={handleSoundHotkeysChange}
          onClose={() => setHotkeysEditorOpen(false)}
        />
      )}
    </>
  );
}
