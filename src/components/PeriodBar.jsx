import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import ScheduleEditor from "./ScheduleEditor";
import StudentList from "./StudentList";
import LayoutTool from "./LayoutTool";
import { THEMES, THEME_KEYS, hasDarkText } from "../data/themes";
import { loadTeacherViewBounds, loadSeatingViewBounds, loadStudentsViewBounds } from "../data/teacherView";
import PeriodMenu from "./PeriodMenu";
import { usePeriodMenuEdge } from "../data/periodMenu";
import { playClick, playDing } from "../data/sounds";
import { loadSoundHotkeys, soundById } from "../data/soundHotkeys";
import {
  isFileSystemAccessSupported, pickAutosaveFolder, loadAutosaveHandle, clearAutosaveHandle,
  hasReadWritePermission, requestReadWritePermission, timestampedFilename, writeSnapshot,
  loadAutosaveOptions, saveAutosaveOptions, localDateKey, loadLastEndOfDaySave, markEndOfDaySave,
  dayEndTime, toMinutes,
} from "../data/autosave";
import { getScheduleForToday } from "../data/schedules";
import { GEMS_REPEAT_MS, gemsStep } from "../data/gems";
import { collectData, doExport, IMPORT_URL_KEY, directDownloadUrl, isUnfetchableHost, loadLastBackup, markBackedUp, BACKUP_EVENT } from "../data/exportData";
import { CHALLENGE_LIST_CLOSE_MS as STUDENTS_AUTO_CLOSE_MS } from "../data/noiseChallenge";

import "./PeriodBar.css";

// Just the time for a backup made today; the date too for an older one, so
// a backup that stopped happening days ago doesn't pass for today's.
function formatBackupTime(at) {
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (at.toDateString() === new Date().toDateString()) return time;
  return `${at.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

export default function PeriodBar({
  schedules, onSchedulesChange,
  scheduleType, onScheduleTypeChange,
  scheduleDays, onScheduleDaysChange,
  periodNames, onPeriodNamesChange,
  currentPeriodIndex, nextPeriodIndex, onPeriodSelect,
  offSchedulePeriodLabel, onOffSchedulePeriodSelect,
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
  openStudentsSignal, gemsBoostAnimation,
}) {
  const [editorOpen,    setEditorOpen]    = useState(false);
  const [studentsOpen,  setStudentsOpen]  = useState(false);
  const [layoutToolOpen, setLayoutToolOpen] = useState(false);
  const [soundHotkeys, setSoundHotkeys] = useState(loadSoundHotkeys);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [themeMenuRect, setThemeMenuRect] = useState(null);
  const [visible,       setVisible]       = useState(false);
  const [menuEdge, setMenuEdge] = usePeriodMenuEdge("classboard_period_menu_edge");
  const [isFullscreen,  setIsFullscreen]  = useState(false);
  // "off": no folder chosen. "on": chosen and writable. "needs-permission":
  // a folder was chosen in an earlier session but the browser hasn't
  // (re-)granted write access yet this session — needs one click to redo,
  // not a fresh folder pick.
  const [autosaveStatus, setAutosaveStatus] = useState("off");
  const [autosaveFolderName, setAutosaveFolderName] = useState(null);
  const [lastAutosaveAt, setLastAutosaveAt] = useState(null);
  const autosaveHandleRef = useRef(null);
  const [autosaveOptions, setAutosaveOptions] = useState(loadAutosaveOptions);
  const [autosaveMenuOpen, setAutosaveMenuOpen] = useState(false);
  // Snapshots waiting on "Ask before saving" — each holds the data as it was
  // when it came due, so answering late still saves that moment's board.
  const [pendingSaves, setPendingSaves] = useState([]);
  // Last Export or auto-save snapshot, from any window of this board.
  const [lastBackup, setLastBackup] = useState(loadLastBackup);
  useEffect(() => {
    const refresh = () => setLastBackup(loadLastBackup());
    window.addEventListener(BACKUP_EVENT, refresh);
    window.addEventListener("storage", refresh);
    // Re-render now and then so a backup from yesterday shows its date once midnight passes.
    const tick = setInterval(refresh, 60_000);
    return () => { clearInterval(tick); window.removeEventListener(BACKUP_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const fileRef   = useRef(null);
  const hideTimer = useRef(null);
  const themeMenuRef = useRef(null);
  const themeBtnRef = useRef(null);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Lets something outside this (otherwise self-contained) student-list
  // toggle force it open — currently just a won Noise Challenge. Skips the
  // very first run so the initial value of the signal (however it's seeded)
  // never force-opens the list on mount.
  //
  // A list opened this way closes itself again after STUDENTS_AUTO_CLOSE_MS
  // (the celebration is a brief announcement), unless someone starts using
  // it first — a click inside it, or a +/- adjustment — or it was already
  // open on its own before the signal arrived, in which case it's left
  // alone. A repeat signal while still auto-opened restarts the countdown.
  // The student list's own popup window (see the Space shortcut below).
  // While it's open, the things that would otherwise pop the overlay list
  // up (+/-, a Noise Challenge) leave the board alone — it's already showing.
  const studentsWindowRef = useRef(null);
  // Read when the window opens, from a keydown handler bound only once.
  const periodLabelRef = useRef(periodLabel);
  useEffect(() => { periodLabelRef.current = periodLabel; }, [periodLabel]);
  const studentsWindowOpen = () => !!studentsWindowRef.current && !studentsWindowRef.current.closed;
  const openStudentsWindow = () => {
    const bounds = loadStudentsViewBounds();
    const width  = bounds?.width  || 1000;
    const height = bounds?.height || 750;
    const left   = Number.isFinite(bounds?.left) ? bounds.left : window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top    = Number.isFinite(bounds?.top)  ? bounds.top  : window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    const url = new URL(window.location.href);
    url.searchParams.set("view", "students");
    url.searchParams.delete("s");
    // Show this board's own period (a Clone window can be on a different
    // one than the main board), and give each board its own students
    // window so a Clone's Space doesn't retarget the main board's.
    url.searchParams.set("period", periodLabelRef.current ?? "");
    const name = window.opener ? `classboard-students-view-${window.name}` : "classboard-students-view";
    studentsWindowRef.current = window.open(url.toString(), name, `width=${width},height=${height},left=${left},top=${top}`);
    studentsWindowRef.current?.focus();
  };

  const openStudentsSignalRef = useRef(openStudentsSignal);
  const studentsOpenRef = useRef(studentsOpen);
  useEffect(() => { studentsOpenRef.current = studentsOpen; }, [studentsOpen]);
  const autoCloseTimerRef = useRef(null);
  const cancelStudentsAutoClose = () => {
    if (autoCloseTimerRef.current) { clearTimeout(autoCloseTimerRef.current); autoCloseTimerRef.current = null; }
  };
  useEffect(() => {
    if (openStudentsSignalRef.current === openStudentsSignal) return;
    openStudentsSignalRef.current = openStudentsSignal;
    if (studentsWindowOpen()) return;
    const openedByUser = studentsOpenRef.current && !autoCloseTimerRef.current;
    if (!openedByUser) {
      cancelStudentsAutoClose();
      autoCloseTimerRef.current = setTimeout(() => {
        autoCloseTimerRef.current = null;
        setStudentsOpen(false);
      }, STUDENTS_AUTO_CLOSE_MS);
    }
    setStudentsOpen(true);
  }, [openStudentsSignal]);
  // Closed by hand (or any other path) — nothing left to auto-close.
  useEffect(() => { if (!studentsOpen) cancelStudentsAutoClose(); }, [studentsOpen]);
  useEffect(() => {
    if (!studentsOpen) return;
    const onPointerDown = (e) => {
      if (autoCloseTimerRef.current && e.target.closest?.(".student-modal")) cancelStudentsAutoClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [studentsOpen]);
  useEffect(() => cancelStudentsAutoClose, []);

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

  const turnOffAutosave = async () => {
    await clearAutosaveHandle().catch(() => {});
    autosaveHandleRef.current = null;
    setAutosaveFolderName(null);
    setLastAutosaveAt(null);
    setAutosaveStatus("off");
    setPendingSaves([]);
  };

  const resumeAutosave = async () => {
    if (!autosaveHandleRef.current) return false;
    const granted = await requestReadWritePermission(autosaveHandleRef.current).catch(() => false);
    if (granted) setAutosaveStatus("on");
    return granted;
  };

  const chooseAutosaveFolder = async () => {
    try {
      const handle = await pickAutosaveFolder();
      autosaveHandleRef.current = handle;
      setAutosaveFolderName(handle.name);
      setAutosaveStatus("on");
    } catch (_) {
      // User canceled the folder picker — leave things as they were.
    }
  };

  const updateAutosaveOptions = (patch) => {
    setAutosaveOptions(o => {
      const next = { ...o, ...patch };
      saveAutosaveOptions(next);
      return next;
    });
  };

  const writeAutosave = async (label, data) => {
    try {
      await writeSnapshot(autosaveHandleRef.current, timestampedFilename(label), data);
      setLastAutosaveAt(new Date());
      markBackedUp("Auto-saved");
      return true;
    } catch {
      // Quiet by design — most likely permission was revoked outside the
      // app; stop trying silently until the teacher re-enables it.
      setAutosaveStatus("needs-permission");
      return false;
    }
  };

  // A snapshot came due: save it now, or (Ask before saving) queue it up
  // for the teacher to confirm. Only the main board saves — a cloned board
  // window would otherwise write a duplicate of every snapshot.
  const autosaveStatusRef = useRef(autosaveStatus);
  const autosaveOptionsRef = useRef(autosaveOptions);
  useEffect(() => { autosaveStatusRef.current = autosaveStatus; }, [autosaveStatus]);
  useEffect(() => { autosaveOptionsRef.current = autosaveOptions; }, [autosaveOptions]);
  const snapshotDue = (label, reason) => {
    if (window.opener || !autosaveHandleRef.current) return;
    const data = collectData();
    if (autosaveOptionsRef.current.ask) {
      setPendingSaves(q => [...q, { label, reason, data }]);
    } else if (autosaveStatusRef.current === "on") {
      writeAutosave(label, data);
    }
  };

  const answerPendingSave = async (save) => {
    const [first] = pendingSaves;
    setPendingSaves(q => q.slice(1));
    if (!save || !first) return;
    // The Save click is a user gesture, so a lapsed permission can be
    // re-granted right here instead of the save quietly failing.
    if (autosaveStatus !== "on" && !(await resumeAutosave())) return;
    await writeAutosave(first.label, first.data);
  };

  // End of day: once the last period of today's schedule has ended, save
  // once for the day. Once schedules have weekdays assigned, days with none
  // (weekends, say) are skipped; with none assigned at all, every day counts.
  const periodsForDayRef = useRef([]);
  useEffect(() => { periodsForDayRef.current = schedules[scheduleType] || []; }, [schedules, scheduleType]);
  const scheduleDaysRef = useRef(scheduleDays);
  useEffect(() => { scheduleDaysRef.current = scheduleDays; }, [scheduleDays]);
  useEffect(() => {
    if (!autosaveOptions.endOfDay) return;
    const check = () => {
      if (autosaveStatusRef.current === "off") return;
      const days = scheduleDaysRef.current || {};
      const anyDaysAssigned = Object.values(days).some(d => Array.isArray(d) && d.length);
      if (anyDaysAssigned && !getScheduleForToday(days)) return;
      const end = dayEndTime(periodsForDayRef.current);
      if (!end) return;
      const now = new Date();
      if (now.getHours() * 60 + now.getMinutes() < toMinutes(end)) return;
      const today = localDateKey(now);
      if (loadLastEndOfDaySave() === today) return;
      markEndOfDaySave(today);
      snapshotDue("end-of-day", "day");
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [autosaveOptions.endOfDay, autosaveStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep an open students window on this board's period as it changes.
  useEffect(() => {
    if (!studentsWindowOpen()) return;
    studentsWindowRef.current.postMessage({ type: "classboard-students-period", label: periodLabel ?? "" }, window.location.origin);
  }, [periodLabel]);

  // Snapshot the period being left, whenever the active period changes —
  // whether from its scheduled end time passing or a manual switch, both of
  // which show up here identically as `periodLabel` changing.
  const prevPeriodLabelRef = useRef(periodLabel);
  useEffect(() => {
    const prev = prevPeriodLabelRef.current;
    prevPeriodLabelRef.current = periodLabel;
    if (!prev || prev === periodLabel) return;
    if (!autosaveOptionsRef.current.afterClass) return;
    snapshotDue(prev, "class");
  }, [periodLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Space opens the student list in its own popup window (StudentsView) —
  // or closes it again — as long as no other modal is up and the user isn't
  // typing in a field or focused on a button. If the overlay list is up
  // instead (opened by a Noise Challenge), Space closes that.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== " " && e.code !== "Space") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) return;
      const overlay = document.querySelector(".modal-overlay");
      if (overlay && !overlay.querySelector(".student-modal")) return;
      e.preventDefault();
      if (studentsOpenRef.current) { setStudentsOpen(false); return; }
      if (studentsWindowOpen()) { studentsWindowRef.current.close(); return; }
      openStudentsWindow();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Keyboard shortcuts, active whenever no text field has focus:
  //   ←/→ and ↑/↓  cycle the active period (wraps; disables auto-detect,
  //                same as clicking a period button)
  //   +/- (or =/-) give or take a step (1% of each student's own total, min 1 — see gemsStep) from every student, 10 steps with Shift
  //                held — held keys repeat at a fixed rate via our own timer
  //                rather than relying on the browser's OS-driven key-repeat,
  //                which varies and starts after a delay. Applying a delta
  //                opens the students window (or brings it to the front),
  //                which stays open until the teacher closes it (Space).
  //   a            toggles auto-detect period
  //   Tab          toggles compact mode (handled in App — see data/compactLayout)
  //   (custom)     plays a sound effect — assigned from Teacher View's
  //                "🔊 Hotkeys" button, see soundHotkeys / HotkeysEditor
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
      // `delta` is ±1 (±10 with Shift), scaled per student by gemsStep.
      for (const name of namesRef.current) {
        const current = next[name] || 0;
        next[name] = Math.max(0, current + Math.sign(delta) * gemsStep(current, Math.abs(delta)));
      }
      handler(next);
      if (delta > 0) playDing(); else playClick();
      // A deliberate adjustment means someone's using the list now.
      if (autoCloseTimerRef.current) { clearTimeout(autoCloseTimerRef.current); autoCloseTimerRef.current = null; }
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
      // Show the points in the students window — opened if need be, else
      // brought to the front — unless the list is already up as an overlay
      // here. Either takes focus, so the board stops its own repeat (blur)
      // and further presses land in that window, which handles +/- itself.
      if (!studentsOpenRef.current) {
        if (studentsWindowOpen()) studentsWindowRef.current.focus();
        else openStudentsWindow();
      }
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

  // Hotkeys are now assigned from Teacher View's own "🔊 Hotkeys" button (a
  // separate window) rather than here — reload on a storage event so a
  // change made there takes effect on this board without a reload.
  useEffect(() => {
    const reload = () => setSoundHotkeys(loadSoundHotkeys());
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, []);

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

  // The theme menu is portaled to <body>, outside .period-toolbar's own DOM
  // subtree — so without this, moving the mouse from the trigger button down
  // into the dropdown reads as leaving the toolbar, hiding it out from under
  // the still-open menu. Closing the menu whenever the toolbar itself hides
  // keeps the two in sync (its own onMouseEnter/onMouseLeave below reuse
  // show/scheduleHide so hovering the dropdown counts as still hovering the
  // toolbar in the first place).
  useEffect(() => {
    if (!visible) setThemeMenuOpen(false);
  }, [visible]);

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

  // Shared by file and URL import: the classboard_ entries of an exported
  // snapshot (throwing if it isn't one), then writing them back into
  // localStorage and letting App reload.
  const parseImport = (text) => {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("not a Classboard export");
    const entries = Object.entries(data).filter(([k, v]) => k.startsWith("classboard_") && v != null);
    if (!entries.length) throw new Error("no Classboard data found in it");
    return entries;
  };
  const applyImport = (entries) => {
    entries.forEach(([k, v]) => localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)));
    onImport?.();
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        applyImport(parseImport(ev.target.result));
      } catch (err) {
        alert("Could not read file: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  const handleImportUrl = async () => {
    const entered = window.prompt("Import Classboard data from a JSON file at this URL:", localStorage.getItem(IMPORT_URL_KEY) || "");
    if (!entered?.trim()) return;
    localStorage.setItem(IMPORT_URL_KEY, entered.trim());
    if (isUnfetchableHost(entered.trim())) {
      alert("Google Drive and OneDrive don't allow other web pages to download their files, so Classboard can't import from those links.\n\nInstead, put the file in a GitHub Gist (gist.github.com — paste the JSON, create it, then use its link), a GitHub repo, or Dropbox, and import from that link.");
      return;
    }
    const url = directDownloadUrl(entered.trim());
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`the server answered ${res.status} ${res.statusText}`);
      const text = await res.text();
      // A share link that points at a viewer/sign-in page (or a 404 page)
      // comes back as HTML rather than the file — say so plainly instead of
      // surfacing JSON.parse's "Unexpected token '<'".
      if (/^\s*</.test(text)) {
        alert(`That address returned a web page, not the JSON file itself:\n${url}\n\nUse a link that downloads the raw file — e.g. the "Raw" button's link on GitHub, or a Gist's link. If it's a GitHub Pages address, check the file path (a missing file shows a 404 page).`);
        return;
      }
      const entries = parseImport(text);
      if (!window.confirm("Replace this board's data with the imported file?")) return;
      applyImport(entries);
    } catch (err) {
      // A TypeError from fetch is almost always CORS or a bad address —
      // the browser hides which, so say both.
      alert(err instanceof TypeError
        ? "Couldn't download that URL. Check the address, and that the site allows downloads from other pages (GitHub, Gist, and Dropbox links do)."
        : "Could not import from that URL: " + err.message);
    }
  };

  // Same menu (and same props) wherever it's docked — see PeriodMenu.
  const periodMenuProps = {
    schedules, scheduleType,
    currentPeriodIndex, nextPeriodIndex, autoMode,
    onPeriodSelect,
    offSchedulePeriodLabel, onOffSchedulePeriodSelect,
    edge: menuEdge, onEdgeChange: setMenuEdge,
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
                onMouseEnter={show}
                onMouseLeave={scheduleHide}
              >
                {THEME_KEYS.flatMap((key, i) => {
                  const nodes = [];
                  // A row of same-size circles alone doesn't say which
                  // themes are dark-background vs light — label each group
                  // instead of just dividing them.
                  if (i === 0) {
                    nodes.push(<div key="label-dark" className="tb-theme-menu-label">Dark</div>);
                  } else if (hasDarkText(key) && !hasDarkText(THEME_KEYS[i - 1])) {
                    nodes.push(<div key={`div-${key}`} className="tb-theme-menu-divider" />);
                    nodes.push(<div key="label-light" className="tb-theme-menu-label">Light</div>);
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
            <button
              className="btn btn-ghost btn-sm tb-btn"
              onClick={() => studentsWindowOpen() ? studentsWindowRef.current.focus() : openStudentsWindow()}
              title="Open the student list in its own window (Space)"
            >
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
          <span
            className={`tb-last-backup ${lastBackup ? "" : "tb-last-backup--never"}`}
            style={{ marginLeft: "auto" }}
            title={lastBackup ? `${lastBackup.how} ${lastBackup.at.toLocaleString()}` : "No Export or auto-save has happened on this computer yet"}
          >
            {lastBackup ? `Last backed up ${formatBackupTime(lastBackup.at)}` : "Not backed up yet"}
          </span>
          <button className="btn btn-ghost btn-sm tb-btn ei-btn" onClick={doExport} title="Export all data">↓ Export</button>
          <button className="btn btn-ghost btn-sm tb-btn ei-btn" onClick={() => fileRef.current.click()} title="Import data">↑ Import</button>
          <button className="btn btn-ghost btn-sm tb-btn ei-btn" onClick={handleImportUrl} title="Import data from a JSON file at a web address">🔗 Import URL</button>
          {isFileSystemAccessSupported() && (
            <button
              className={`btn btn-sm tb-btn ei-btn ${autosaveStatus === "on" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setAutosaveMenuOpen(true)}
              title={
                autosaveStatus === "on"
                  ? `Auto-saving to "${autosaveFolderName}"${lastAutosaveAt ? ` — last saved ${lastAutosaveAt.toLocaleTimeString()}` : ""}. Click for options.`
                  : autosaveStatus === "needs-permission"
                  ? `Auto-save to "${autosaveFolderName}" needs permission again — click to resume`
                  : "Auto-save dated snapshots to a folder — click to set up"
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
        {/* Period menu docked to the top: a row right under the toolbar,
            shown and hidden with it. */}
        {menuEdge === "top" && <div className="period-toolbar-periods"><PeriodMenu {...periodMenuProps} inline /></div>}
      </div>

      {/* Docked to any other edge: an invisible hover zone along that edge
          slides the period menu out from it, so the top toolbar doesn't
          have to grow with the schedule's period count. */}
      {menuEdge !== "top" && <PeriodMenu {...periodMenuProps} />}

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
          boostAnimation={gemsBoostAnimation}
          wheelColors={wheelColors}
          otherPeriods={otherPeriods}
          onDeleteClassList={onDeleteClassList}
          periodLabel={periodLabel}
          onClose={() => setStudentsOpen(false)}
          simple
        />
      )}

      {autosaveMenuOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAutosaveMenuOpen(false)}>
          <div className="modal autosave-modal">
            <h2>Auto-save</h2>
            <p className="autosave-hint">Saves a dated snapshot of all the board's data into a folder on this computer.</p>
            <div className="autosave-folder">
              {autosaveStatus === "off" ? (
                <>
                  <span>No folder chosen</span>
                  <button className="btn btn-primary btn-sm" onClick={chooseAutosaveFolder}>Choose folder…</button>
                </>
              ) : (
                <>
                  <span>📁 <strong>{autosaveFolderName}</strong>{autosaveStatus === "needs-permission" && " — needs permission"}</span>
                  {autosaveStatus === "needs-permission" && <button className="btn btn-primary btn-sm" onClick={resumeAutosave}>Allow</button>}
                  <button className="btn btn-ghost btn-sm" onClick={chooseAutosaveFolder}>Change…</button>
                  <button className="btn btn-danger btn-sm" onClick={turnOffAutosave}>Turn off</button>
                </>
              )}
            </div>
            <label className="autosave-check">
              <input type="checkbox" checked={autosaveOptions.afterClass} onChange={e => updateAutosaveOptions({ afterClass: e.target.checked })} />
              <span>At the end of each class <span className="autosave-hint">— whenever the period changes</span></span>
            </label>
            <label className="autosave-check">
              <input type="checkbox" checked={autosaveOptions.endOfDay} onChange={e => updateAutosaveOptions({ endOfDay: e.target.checked })} />
              <span>At the end of the day <span className="autosave-hint">— once the last period{dayEndTime(schedules[scheduleType]) ? ` (${dayEndTime(schedules[scheduleType])})` : ""} is over</span></span>
            </label>
            <label className="autosave-check">
              <input type="checkbox" checked={autosaveOptions.ask} onChange={e => updateAutosaveOptions({ ask: e.target.checked })} />
              <span>Ask before saving</span>
            </label>
            <div className="autosave-actions">
              <span className="autosave-hint">{lastAutosaveAt ? `Last saved ${lastAutosaveAt.toLocaleTimeString()}` : ""}</span>
              <button className="btn btn-primary btn-sm" onClick={() => setAutosaveMenuOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {pendingSaves.length > 0 && !autosaveMenuOpen && (
        <div className="modal-overlay">
          <div className="modal autosave-modal">
            <h2>Save a snapshot?</h2>
            <p>
              {pendingSaves[0].reason === "day" ? "The school day is over." : <><strong>{pendingSaves[0].label}</strong> just ended.</>}
              {" "}Save a snapshot to <strong>{autosaveFolderName}</strong>?
            </p>
            <div className="autosave-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => answerPendingSave(false)}>Skip</button>
              <button className="btn btn-primary btn-sm" onClick={() => answerPendingSave(true)} autoFocus>Save</button>
            </div>
          </div>
        </div>
      )}

      {layoutToolOpen && (
        <LayoutTool
          layout={layout}
          onLayoutChange={onLayoutChange}
          onClose={() => setLayoutToolOpen(false)}
        />
      )}

    </>
  );
}
