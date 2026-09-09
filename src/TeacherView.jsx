import { useState, useEffect, useMemo } from "react";
import RemindersWidget from "./components/RemindersWidget";
import { loadSchedules, detectCurrentPeriod } from "./data/schedules";
import { loadPeriodData, savePeriodPatch } from "./data/periodData";
import { applyTheme } from "./data/themes";
import { saveTeacherViewBounds } from "./data/teacherView";
import "./TeacherView.css";

function loadScheduleType() {
  return localStorage.getItem("classboard_schedule_type") || "Regular";
}
function loadGlobalTheme() {
  return localStorage.getItem("classboard_global_theme") || "midnight";
}

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
  const currentPeriod = currentIndex >= 0 ? periods[currentIndex] : null;
  const periodKey = currentPeriod ? currentPeriod.label : null;

  const currentReminders = periodKey ? periodData[periodKey]?.reminders : undefined;
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
    const next = savePeriodPatch(periodKey, { reminders });
    if (next) setPeriodData(next);
  };

  return (
    <div className="teacher-view">
      <div className="teacher-view-header">
        <span className="teacher-view-title">Teacher View</span>
        <span className="teacher-view-period">{currentPeriod ? currentPeriod.label : "No class in session"}</span>
      </div>
      <div className="teacher-view-body">
        <RemindersWidget
          currentPeriod={currentPeriod}
          reminders={currentReminders}
          onRemindersChange={handleRemindersChange}
          collapsed={false}
        />
      </div>
    </div>
  );
}
