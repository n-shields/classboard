import { useState, useEffect, useMemo } from "react";
import SeatingChart from "./components/SeatingChart";
import PeriodMenu from "./components/PeriodMenu";
import { usePeriodMenuEdge } from "./data/periodMenu";
import { loadSchedules, resolveActivePeriod, resolveActivePeriodIndex, loadActivePeriod, saveActivePeriod, detectCurrentPeriod, detectNextPeriod } from "./data/schedules";
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
// currently-active period (see data/schedules.js: resolveActivePeriod)
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
  const currentPeriod = useMemo(() => resolveActivePeriod(periods, activePeriod, schedules), [periods, now, activePeriod, schedules]); // eslint-disable-line
  const periodKey = currentPeriod ? currentPeriod.label : null;

  // The same slide-out period menu as the main board. Picking a period here
  // writes the shared active-period key, which the main board listens for
  // and follows — so this switches the whole board, not just this window
  // (and still works with no board window open at all).
  const [menuEdge, setMenuEdge] = usePeriodMenuEdge("classboard_seating_period_menu_edge");
  const currentPeriodIndex = useMemo(() => resolveActivePeriodIndex(periods, activePeriod), [periods, now, activePeriod]); // eslint-disable-line
  const nextPeriodIndex    = useMemo(() => detectNextPeriod(periods), [periods, now]); // eslint-disable-line
  const autoMode = activePeriod?.autoMode !== false;
  const offSchedulePeriodLabel = !autoMode && currentPeriodIndex === -1 ? activePeriod?.label ?? null : null;
  const pickPeriod = (label, isScheduledNow) => {
    // Same rule as the board: picking whatever's scheduled right now means Auto.
    const next = { autoMode: isScheduledNow, label };
    saveActivePeriod(next.autoMode, next.label);
    setActivePeriod(next);
  };

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
    <>
      <SeatingChart
        names={currentNames}
        periodLabel={currentPeriod?.label}
        periodKey={periodKey}
        onClose={() => window.close()}
      />
      <PeriodMenu
        schedules={schedules}
        scheduleType={scheduleType}
        currentPeriodIndex={currentPeriodIndex}
        nextPeriodIndex={nextPeriodIndex}
        autoMode={autoMode}
        onPeriodSelect={i => {
          const scheduled = detectCurrentPeriod(periods);
          pickPeriod(periods[i]?.label, scheduled >= 0 && i === scheduled);
        }}
        offSchedulePeriodLabel={offSchedulePeriodLabel}
        onOffSchedulePeriodSelect={p => pickPeriod(p.label, false)}
        edge={menuEdge}
        onEdgeChange={setMenuEdge}
      />
    </>
  );
}
