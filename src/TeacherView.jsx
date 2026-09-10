import { useState, useEffect, useMemo } from "react";
import ClockWidget from "./components/ClockWidget";
import RemindersWidget from "./components/RemindersWidget";
import TextPane from "./components/TextPane";
import { loadSchedules, detectCurrentPeriod, detectNextPeriod } from "./data/schedules";
import { loadPeriodData, savePeriodPatch } from "./data/periodData";
import { pagesForPane } from "./data/pages";
import { applyTheme } from "./data/themes";
import { saveTeacherViewBounds } from "./data/teacherView";
import "./TeacherView.css";

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
  const [now, setNow] = useState(() => new Date());

  // Re-read everything the main window might have changed, either on a
  // storage event (change made in the other window) or periodically as a
  // fallback (e.g. the minute rolling over into a new period).
  useEffect(() => {
    const reload = () => {
      setSchedules(loadSchedules());
      setScheduleType(loadScheduleType());
      setPeriodData(loadPeriodData());
      setGlobalTheme(loadGlobalTheme());
    };
    const id = setInterval(() => { setNow(new Date()); reload(); }, 15_000);
    window.addEventListener("storage", reload);
    return () => { clearInterval(id); window.removeEventListener("storage", reload); };
  }, []);

  const periods = schedules[scheduleType] || [];
  const currentIndex = useMemo(() => detectCurrentPeriod(periods), [periods, now]); // eslint-disable-line
  const nextIndex = useMemo(() => detectNextPeriod(periods), [periods, now]); // eslint-disable-line
  const currentPeriod = currentIndex >= 0 ? periods[currentIndex] : null;
  const nextPeriod    = nextIndex    >= 0 ? periods[nextIndex]    : null;
  const periodKey = currentPeriod ? currentPeriod.label : null;

  const currentReminders = periodKey ? periodData[periodKey]?.teacherReminders : undefined;
  const currentTeacherPages = periodKey ? (periodData[periodKey]?.teacherPages ?? [FALLBACK_TEACHER_PAGE]) : [FALLBACK_TEACHER_PAGE];
  const currentTeacherPanes = periodKey ? (periodData[periodKey]?.teacherPanes ?? FALLBACK_TEACHER_PANES) : FALLBACK_TEACHER_PANES;
  const periodTheme = periodKey ? periodData[periodKey]?.theme : null;
  const currentTheme = periodTheme || globalTheme;

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

  const handleRemindersChange = (reminders) => {
    const next = savePeriodPatch(periodKey, { teacherReminders: reminders });
    if (next) setPeriodData(next);
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

  return (
    <div className="teacher-view">
      <div className="teacher-view-header">
        <span className="teacher-view-title">Teacher View</span>
        <span className="teacher-view-period">{currentPeriod ? currentPeriod.label : "No class in session"}</span>
      </div>
      <div className="teacher-view-body">
        <div className="teacher-view-clock">
          <ClockWidget
            currentPeriod={currentPeriod}
            nextPeriod={nextPeriod}
          />
        </div>
        <div className="teacher-view-reminders">
          <RemindersWidget
            currentPeriod={currentPeriod}
            reminders={currentReminders}
            onRemindersChange={handleRemindersChange}
            collapsed={false}
            defaultReminders={TEACHER_DEFAULT_REMINDERS}
            scope="teacher"
          />
        </div>
        <div className="teacher-view-notes">
          <TextPane
            key={`teacher-notes-${periodKey}`}
            paneId={TEACHER_NOTES_PANE}
            kind="Notes"
            defaultFontSize={20}
            pages={pagesForPane(currentTeacherPages, currentTeacherPanes, TEACHER_NOTES_PANE)}
            onPagesChange={handleTeacherPagesChange}
            periodLabel={currentPeriod?.label}
          />
        </div>
      </div>
    </div>
  );
}
