import { useState, useEffect, useMemo, useRef } from "react";
import StudentList from "./components/StudentList";
import { loadSchedules, resolveActivePeriod, loadActivePeriod } from "./data/schedules";
import { loadPeriodData, savePeriodPatch, DEFAULT_NAMES } from "./data/periodData";
import { applyTheme, THEMES } from "./data/themes";
import { saveStudentsViewBounds } from "./data/teacherView";
import { GEMS_REPEAT_MS, gemsStep } from "./data/gems";
import { playClick, playDing } from "./data/sounds";

function loadScheduleType() {
  return localStorage.getItem("classboard_schedule_type") || "Regular";
}
function loadGlobalTheme() {
  return localStorage.getItem("classboard_global_theme") || "midnight";
}

// The board's quick student list in a popup window of its own (Space on the
// board opens and closes it), instead of an overlay covering the board. The
// list fills the window and sizes its text to fit (see StudentList's
// `windowed`), so resizing the window rescales it. Mirrors the board's
// active period and syncs both ways through localStorage, like Seating View.
export default function StudentsView() {
  const [schedules, setSchedules]     = useState(loadSchedules);
  const [scheduleType, setScheduleType] = useState(loadScheduleType);
  const [periodData, setPeriodData]   = useState(loadPeriodData);
  const [globalTheme, setGlobalTheme] = useState(loadGlobalTheme);
  const [activePeriod, setActivePeriod] = useState(loadActivePeriod);
  const [now, setNow] = useState(() => new Date());
  // The period of the board that opened this window ("" for none), which
  // it keeps updated as that board switches — so a Clone window's list
  // shows the Clone's period. Without one, follow the main board's.
  const [boardPeriod, setBoardPeriod] = useState(() => new URLSearchParams(window.location.search).get("period"));
  useEffect(() => {
    const onMessage = (e) => {
      if (e.source !== window.opener || e.data?.type !== "classboard-students-period") return;
      setBoardPeriod(e.data.label ?? "");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

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
  const currentPeriod = useMemo(() => {
    if (boardPeriod === null) return resolveActivePeriod(periods, activePeriod, schedules);
    if (!boardPeriod) return null;
    // (resolveActivePeriod falls back to the time-detected period if the
    // label isn't in any schedule, so check it found the right one.)
    const found = resolveActivePeriod(periods, { autoMode: false, label: boardPeriod }, schedules);
    return found?.label === boardPeriod ? found : { label: boardPeriod };
  }, [periods, now, activePeriod, schedules, boardPeriod]); // eslint-disable-line
  const periodKey = currentPeriod ? currentPeriod.label : null;
  const period = periodKey ? periodData[periodKey] : null;
  const names = period?.names ?? DEFAULT_NAMES;

  const periodTheme  = period?.theme;
  const currentTheme = periodTheme || globalTheme;
  useEffect(() => { applyTheme(currentTheme); }, [currentTheme]);

  useEffect(() => { document.title = `Students${periodKey ? ` — ${periodKey}` : ""}`; }, [periodKey]);

  // Remember this window's position/size so the next open lands in the same spot
  useEffect(() => {
    const save = () => saveStudentsViewBounds({
      left: window.screenX, top: window.screenY,
      width: window.outerWidth, height: window.outerHeight,
    });
    const id = setInterval(save, 2000);
    window.addEventListener("beforeunload", save);
    return () => { clearInterval(id); window.removeEventListener("beforeunload", save); };
  }, []);

  // Same rule as the board: a period's roster only becomes real data once
  // something's saved for it, so seed the shown (default) names alongside.
  const save = (patch) => {
    const seed = period?.names ? {} : { names };
    const next = savePeriodPatch(periodKey, { ...patch, ...seed });
    if (next) setPeriodData(next);
  };

  // Keys, while no field has focus: Space closes the window again (as it
  // opened it), and +/- (Shift for ±10) give or take from every student —
  // the board's own shortcut, which doesn't reach the board while this
  // window has focus. Held keys repeat at a fixed rate, as on the board.
  const latest = useRef({});
  latest.current = { names, gems: period?.gems ?? {}, save };
  useEffect(() => {
    const held = new Map();
    const apply = (delta) => {
      const { names, gems, save } = latest.current;
      const next = { ...gems };
      for (const name of names) {
        const current = next[name] || 0;
        next[name] = Math.max(0, current + Math.sign(delta) * gemsStep(current, Math.abs(delta)));
      }
      latest.current.gems = next;
      save({ gems: next });
      if (delta > 0) playDing(); else playClick();
    };
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName)) return;
      if (e.key === " " || e.code === "Space") { e.preventDefault(); window.close(); return; }
      const magnitude = e.shiftKey ? 10 : 1;
      const delta = e.code === "Equal" || e.key === "+" || e.key === "=" ? magnitude
        : e.code === "Minus" || e.key === "-" || e.key === "_" ? -magnitude : 0;
      if (!delta) return;
      e.preventDefault();
      const holdKey = e.code || e.key;
      if (e.repeat || held.has(holdKey)) return;
      apply(delta);
      held.set(holdKey, setInterval(() => apply(delta), GEMS_REPEAT_MS));
    };
    const stop = (e) => { const id = held.get(e.code || e.key); if (id) { clearInterval(id); held.delete(e.code || e.key); } };
    const stopAll = () => { held.forEach(id => clearInterval(id)); held.clear(); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", stop);
    window.addEventListener("blur", stopAll);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", stop);
      window.removeEventListener("blur", stopAll);
      stopAll();
    };
  }, []);

  return (
    <StudentList
      names={names}
      onNamesChange={n => save({ names: n })}
      excludedNames={period?.excludedNames ?? []}
      onExcludedNamesChange={excludedNames => save({ excludedNames })}
      birthdays={period?.birthdays ?? {}}
      onBirthdaysChange={birthdays => save({ birthdays })}
      colors={period?.colors ?? {}}
      onColorsChange={colors => save({ colors })}
      gems={period?.gems ?? {}}
      onGemsChange={gems => save({ gems })}
      gemsLabel={period?.gemsLabel ?? "Gems"}
      onGemsLabelChange={gemsLabel => save({ gemsLabel })}
      jobs={period?.jobs ?? {}}
      onJobsChange={jobs => save({ jobs })}
      sortMode={period?.sortMode ?? "default"}
      onSortModeChange={sortMode => save({ sortMode })}
      wheelColors={(THEMES[currentTheme] || THEMES.midnight).wheelColors}
      periodLabel={periodKey}
      onClose={() => window.close()}
      simple
      windowed
    />
  );
}
