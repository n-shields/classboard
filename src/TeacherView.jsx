import { useState, useEffect, useMemo, useCallback } from "react";
import ClockWidget from "./components/ClockWidget";
import RemindersWidget from "./components/RemindersWidget";
import TextPane from "./components/TextPane";
import StudentList from "./components/StudentList";
import TileLayout from "./components/TileLayout";
import { loadSchedules, detectCurrentPeriod, detectNextPeriod, loadActivePeriod, resolveActivePeriodIndex } from "./data/schedules";
import { loadPeriodData, savePeriodPatch, otherPeriodsWithRosters, deleteClassList } from "./data/periodData";
import { pagesForPane } from "./data/pages";
import { THEMES, applyTheme } from "./data/themes";
import { saveTeacherViewBounds, loadSeatingViewBounds, loadBoardViewBounds } from "./data/teacherView";
import { loadTeacherLayout, saveTeacherLayout } from "./data/teacherLayout";
import "./TeacherView.css";

const DEFAULT_COLLAPSED = { clock: false, reminders: false, notes: false };
const TILE_NAMES = { clock: "Timer", reminders: "Reminders", notes: "Notes" };

function loadScheduleType() {
  return localStorage.getItem("classboard_schedule_type") || "Regular";
}
function loadGlobalTheme() {
  return localStorage.getItem("classboard_global_theme") || "midnight";
}

// The teacher-only reminder list is separate from the main board's — it
// starts with just an attendance nudge, not "Warm Up"/"Clean-up".
const TEACHER_DEFAULT_REMINDERS = [
  { id: 1, text: "Attendance", edge: "start", minutes: 10, enabled: true },
];

const TEACHER_NOTES_PANE = "teacher-notes";
const FALLBACK_TEACHER_PAGE = { id: "fallback-teacher-notes", html: "", fontSize: 20 };
const FALLBACK_TEACHER_PANES = { [TEACHER_NOTES_PANE]: ["fallback-teacher-notes"] };

// A small companion window meant for a second, teacher-facing monitor —
// mirrors whatever the main board has stored (schedule, current period,
// reminders) by re-reading localStorage rather than sharing React state.
export default function TeacherView() {
  const [schedules, setSchedules]     = useState(loadSchedules);
  const [scheduleType, setScheduleType] = useState(loadScheduleType);
  const [periodData, setPeriodData]   = useState(loadPeriodData);
  const [globalTheme, setGlobalTheme] = useState(loadGlobalTheme);
  const [activePeriod, setActivePeriod] = useState(loadActivePeriod);
  const [now, setNow] = useState(() => new Date());
  const [studentsOpen, setStudentsOpen] = useState(false);
  const [layout, setLayout] = useState(loadTeacherLayout);
  const [collapsed, setCollapsed] = useState({ ...DEFAULT_COLLAPSED });
  const toggleCollapsed = useCallback((key) => setCollapsed(c => ({ ...c, [key]: !c[key] })), []);

  const handleLayoutChange = useCallback((updater) => {
    setLayout(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveTeacherLayout(next);
      return next;
    });
  }, []);

  // Re-read everything the main window might have changed, either on a
  // storage event (change made in the other window) or periodically as a
  // fallback (e.g. the minute rolling over into a new period).
  useEffect(() => {
    const reload = () => {
      setSchedules(loadSchedules());
      setScheduleType(loadScheduleType());
      setPeriodData(loadPeriodData());
      setGlobalTheme(loadGlobalTheme());
      setActivePeriod(loadActivePeriod());
    };
    const id = setInterval(() => { setNow(new Date()); reload(); }, 15_000);
    window.addEventListener("storage", reload);
    return () => { clearInterval(id); window.removeEventListener("storage", reload); };
  }, []);

  const periods = schedules[scheduleType] || [];

  // The Timer tile always tracks the real, live period/countdown — same as
  // the main board's own clock, which never follows a manually-pinned
  // period (a pinned period isn't necessarily happening right now, so its
  // start/end times would produce a meaningless countdown against the
  // actual wall clock).
  const clockIndex = useMemo(() => detectCurrentPeriod(periods), [periods, now]); // eslint-disable-line
  const clockNextIndex = useMemo(() => detectNextPeriod(periods), [periods, now]); // eslint-disable-line
  const clockPeriod = clockIndex >= 0 ? periods[clockIndex] : null;
  const clockNextPeriod = clockNextIndex >= 0 ? periods[clockNextIndex] : null;

  // Everything else (roster, reminders, notes) follows whichever period is
  // active on the main board — auto-detected in Auto mode, or the
  // manually-pinned period otherwise.
  const currentIndex = useMemo(() => resolveActivePeriodIndex(periods, activePeriod), [periods, now, activePeriod]); // eslint-disable-line
  const currentPeriod = currentIndex >= 0 ? periods[currentIndex] : null;
  const periodKey = currentPeriod ? currentPeriod.label : null;

  const currentNames     = periodKey ? (periodData[periodKey]?.names        ?? []) : [];
  const currentExcluded  = periodKey ? (periodData[periodKey]?.excludedNames ?? []) : [];
  const currentBirthdays = periodKey ? (periodData[periodKey]?.birthdays    ?? {}) : {};
  const currentColors    = periodKey ? (periodData[periodKey]?.colors       ?? {}) : {};
  const currentGems      = periodKey ? (periodData[periodKey]?.gems         ?? {}) : {};
  const currentJobs      = periodKey ? (periodData[periodKey]?.jobs         ?? {}) : {};
  const currentGemsLabel = periodKey ? (periodData[periodKey]?.gemsLabel    ?? "Gems") : "Gems";
  const currentSortMode  = periodKey ? (periodData[periodKey]?.sortMode     ?? "default") : "default";
  const otherPeriodOptions = useMemo(
    () => otherPeriodsWithRosters(periodData, periodKey),
    [periodData, periodKey],
  );

  const currentReminders = periodKey ? periodData[periodKey]?.teacherReminders : undefined;
  const currentTeacherPages = periodKey ? (periodData[periodKey]?.teacherPages ?? [FALLBACK_TEACHER_PAGE]) : [FALLBACK_TEACHER_PAGE];
  const currentTeacherPanes = periodKey ? (periodData[periodKey]?.teacherPanes ?? FALLBACK_TEACHER_PANES) : FALLBACK_TEACHER_PANES;
  const periodTheme = periodKey ? periodData[periodKey]?.theme : null;
  const currentTheme = periodTheme || globalTheme;
  const wheelColors = THEMES[currentTheme]?.wheelColors ?? [];

  useEffect(() => { applyTheme(currentTheme); }, [currentTheme]);

  // Remember this window's position/size so the next open lands in the same spot
  useEffect(() => {
    const save = () => saveTeacherViewBounds({
      left: window.screenX, top: window.screenY,
      width: window.outerWidth, height: window.outerHeight,
    });
    const id = setInterval(save, 2000);
    window.addEventListener("beforeunload", save);
    return () => { clearInterval(id); window.removeEventListener("beforeunload", save); };
  }, []);

  // "S" toggles the student list, as long as no other modal is up and the
  // user isn't typing (S is too common a letter to hijack from text fields).
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "s" && e.key !== "S") return;
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

  const handleRemindersChange = (reminders) => {
    const next = savePeriodPatch(periodKey, { teacherReminders: reminders });
    if (next) setPeriodData(next);
  };

  const handleNamesChange     = (names)         => { const next = savePeriodPatch(periodKey, { names });         if (next) setPeriodData(next); };
  const handleExcludedChange  = (excludedNames) => { const next = savePeriodPatch(periodKey, { excludedNames });  if (next) setPeriodData(next); };
  const handleBirthdaysChange = (birthdays)     => { const next = savePeriodPatch(periodKey, { birthdays });      if (next) setPeriodData(next); };
  const handleColorsChange    = (colors)        => { const next = savePeriodPatch(periodKey, { colors });        if (next) setPeriodData(next); };
  const handleGemsChange      = (gems)          => { const next = savePeriodPatch(periodKey, { gems });          if (next) setPeriodData(next); };
  const handleJobsChange      = (jobs)          => { const next = savePeriodPatch(periodKey, { jobs });          if (next) setPeriodData(next); };
  const handleGemsLabelChange = (gemsLabel)     => { const next = savePeriodPatch(periodKey, { gemsLabel });     if (next) setPeriodData(next); };
  const handleSortModeChange  = (sortMode)      => { const next = savePeriodPatch(periodKey, { sortMode });      if (next) setPeriodData(next); };

  const handleDeleteClassList = (label) => {
    setPeriodData(deleteClassList(periodData, label));
  };

  // Private, per-period notes — separate from the main board's Notes tile.
  const handleTeacherPagesChange = (pages) => {
    if (!periodKey) return;
    const pool = Array.isArray(periodData[periodKey]?.teacherPages) ? periodData[periodKey].teacherPages : [];
    const poolById = new Map(pool.map(p => [p.id, p]));
    for (const p of pages) poolById.set(p.id, p);
    const teacherPanes = { [TEACHER_NOTES_PANE]: pages.map(p => p.id) };
    const referenced = new Set(teacherPanes[TEACHER_NOTES_PANE]);
    const teacherPages = [...poolById.values()].filter(p => referenced.has(p.id));
    const next = savePeriodPatch(periodKey, { teacherPages, teacherPanes });
    if (next) setPeriodData(next);
  };

  const currentTeacherNotesPages = pagesForPane(currentTeacherPages, currentTeacherPanes, TEACHER_NOTES_PANE);

  const tiles = {
    clock: (
      <ClockWidget
        currentPeriod={clockPeriod}
        nextPeriod={clockNextPeriod}
        collapsed={collapsed.clock}
        onToggle={() => toggleCollapsed("clock")}
      />
    ),
    reminders: (
      <RemindersWidget
        currentPeriod={clockPeriod}
        reminders={currentReminders}
        onRemindersChange={handleRemindersChange}
        collapsed={collapsed.reminders}
        defaultReminders={TEACHER_DEFAULT_REMINDERS}
        scope="teacher"
        names={currentNames}
        birthdays={currentBirthdays}
      />
    ),
    notes: (
      <TextPane
        key={`teacher-notes-${periodKey}`}
        kind="Notes"
        defaultFontSize={20}
        pages={currentTeacherNotesPages}
        onPagesChange={handleTeacherPagesChange}
        periodLabel={currentPeriod?.label}
      />
    ),
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

  // Opens a second, ordinary board window — synced through localStorage the
  // same way this Teacher View already is — so the teacher can switch its
  // own period selector to a different period and edit that period's board/
  // notes/roster without touching whatever's actually being projected in
  // the primary window.
  const openBoardView = () => {
    const bounds = loadBoardViewBounds();
    const width  = bounds?.width  || 1100;
    const height = bounds?.height || 760;
    const left   = Number.isFinite(bounds?.left) ? bounds.left : window.screenX + 40;
    const top    = Number.isFinite(bounds?.top)  ? bounds.top  : window.screenY + 40;
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    url.searchParams.delete("s");
    const popup = window.open(url.toString(), "classboard-board-view", `width=${width},height=${height},left=${left},top=${top}`);
    popup?.focus();
  };

  return (
    <div className="teacher-view">
      <div className="teacher-view-header">
        <span className="teacher-view-title">Teacher View</span>
        <span className="teacher-view-period">{currentPeriod ? currentPeriod.label : "No class in session"}</span>
        <button
          className="btn btn-ghost btn-sm teacher-view-students-btn"
          onClick={() => setStudentsOpen(true)}
          title="Edit the student list"
        >👥 Students</button>
        <button
          className="btn btn-ghost btn-sm teacher-view-header-btn"
          onClick={openSeatingView}
          title="Open the seating chart in its own window"
        >⊞ Seats</button>
        <button
          className="btn btn-ghost btn-sm teacher-view-header-btn"
          onClick={openBoardView}
          title="Open a synced board window to browse and edit another period's content"
        >🖥 Board</button>
      </div>
      <div className="teacher-view-body">
        <TileLayout
          layout={layout}
          onLayoutChange={handleLayoutChange}
          tiles={tiles}
          isCollapsed={id => collapsed[id] || false}
          onToggle={id => { if (id in DEFAULT_COLLAPSED) toggleCollapsed(id); }}
          tileNames={TILE_NAMES}
        />
      </div>

      {studentsOpen && (
        <StudentList
          names={currentNames}
          onNamesChange={handleNamesChange}
          excludedNames={currentExcluded}
          onExcludedNamesChange={handleExcludedChange}
          birthdays={currentBirthdays}
          onBirthdaysChange={handleBirthdaysChange}
          colors={currentColors}
          onColorsChange={handleColorsChange}
          wheelColors={wheelColors}
          gems={currentGems}
          onGemsChange={handleGemsChange}
          gemsLabel={currentGemsLabel}
          onGemsLabelChange={handleGemsLabelChange}
          jobs={currentJobs}
          onJobsChange={handleJobsChange}
          sortMode={currentSortMode}
          onSortModeChange={handleSortModeChange}
          otherPeriods={otherPeriodOptions}
          onDeleteClassList={handleDeleteClassList}
          periodLabel={currentPeriod?.label}
          onClose={() => setStudentsOpen(false)}
        />
      )}
    </div>
  );
}
