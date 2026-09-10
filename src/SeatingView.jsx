import { useState, useEffect, useMemo } from "react";
import SeatingChart from "./components/SeatingChart";
import { loadSchedules, resolveActivePeriodIndex, loadActivePeriod } from "./data/schedules";
import { loadPeriodData } from "./data/periodData";
import { applyTheme } from "./data/themes";
import { saveSeatingViewBounds } from "./data/teacherView";

function loadScheduleType() {
  return localStorage.getItem("classboard_schedule_type") || "Regular";
}
function loadGlobalTheme() {
  return localStorage.getItem("classboard_global_theme") || "midnight";
}

// A popup window for the seating chart, so it no longer has to take over
// whichever main-board tile happens to be largest. Mirrors the main board's
// currently-active period (see data/schedules.js: resolveActivePeriodIndex)
// by re-reading localStorage, the same way Teacher View does.
export default function SeatingView() {
  const [schedules, setSchedules]     = useState(loadSchedules);
  const [scheduleType, setScheduleType] = useState(loadScheduleType);
  const [periodData, setPeriodData]   = useState(loadPeriodData);
  const [globalTheme, setGlobalTheme] = useState(loadGlobalTheme);
  const [activePeriod, setActivePeriod] = useState(loadActivePeriod);
  const [now, setNow] = useState(() => new Date());

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
  const currentIndex = useMemo(() => resolveActivePeriodIndex(periods, activePeriod), [periods, now, activePeriod]); // eslint-disable-line
  const currentPeriod = currentIndex >= 0 ? periods[currentIndex] : null;
  const periodKey = currentPeriod ? currentPeriod.label : null;

  const currentNames = periodKey ? (periodData[periodKey]?.names ?? []) : [];

  const periodTheme  = periodKey ? periodData[periodKey]?.theme : null;
  const currentTheme = periodTheme || globalTheme;
  useEffect(() => { applyTheme(currentTheme); }, [currentTheme]);

  // Remember this window's position/size so the next open lands in the same spot
  useEffect(() => {
    const save = () => saveSeatingViewBounds({
      left: window.screenX, top: window.screenY,
      width: window.outerWidth, height: window.outerHeight,
    });
    const id = setInterval(save, 2000);
    window.addEventListener("beforeunload", save);
    return () => { clearInterval(id); window.removeEventListener("beforeunload", save); };
  }, []);

  return (
    <SeatingChart
      names={currentNames}
      periodLabel={currentPeriod?.label}
      periodKey={periodKey}
      onClose={() => window.close()}
    />
  );
}
