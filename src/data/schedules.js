export const DEFAULT_SCHEDULES = {
  Normal: [
    { id: 1, label: "Period 1", start: "08:00", end: "09:30" },
    { id: 2, label: "Period 2", start: "09:35", end: "11:05" },
    { id: 3, label: "Period 3", start: "12:00", end: "13:30" },
  ],
};

export const DEFAULT_SCHEDULE_DAYS = {
  Normal: [],
};

export function loadScheduleDays() {
  try {
    const saved = localStorage.getItem("classboard_schedule_days");
    if (saved) return JSON.parse(saved);
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_SCHEDULE_DAYS));
}

export function saveScheduleDays(days) {
  localStorage.setItem("classboard_schedule_days", JSON.stringify(days));
}

/** Returns the schedule name whose days include today, or null */
export function getScheduleForToday(scheduleDays) {
  const today = new Date().getDay();
  for (const [name, days] of Object.entries(scheduleDays)) {
    if (Array.isArray(days) && days.includes(today)) return name;
  }
  return null;
}

export function loadSchedules() {
  try {
    const saved = localStorage.getItem("classboard_schedules");
    if (saved) return JSON.parse(saved);
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_SCHEDULES));
}

export function saveSchedules(schedules) {
  localStorage.setItem("classboard_schedules", JSON.stringify(schedules));
}

/** Returns the period index whose time range contains the current time, or -1 */
export function detectCurrentPeriod(periods) {
  const now = new Date();
  const hhmm = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < periods.length; i++) {
    const [sh, sm] = periods[i].start.split(":").map(Number);
    const [eh, em] = periods[i].end.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (hhmm >= start && hhmm < end) return i;
  }
  return -1;
}

/** Seconds remaining until end of the given period */
export function secondsUntilEnd(period) {
  const now = new Date();
  const [eh, em] = period.end.split(":").map(Number);
  const endDate = new Date(now);
  endDate.setHours(eh, em, 0, 0);
  return Math.max(0, Math.round((endDate - now) / 1000));
}

/** Returns the index of the next period that hasn't started yet, or -1 */
export function detectNextPeriod(periods) {
  const now = new Date();
  const hhmm = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < periods.length; i++) {
    const [sh, sm] = periods[i].start.split(":").map(Number);
    if (sh * 60 + sm > hhmm) return i;
  }
  return -1;
}

/** Seconds until the given period starts */
export function secondsUntilStart(period) {
  const now = new Date();
  const [sh, sm] = period.start.split(":").map(Number);
  const startDate = new Date(now);
  startDate.setHours(sh, sm, 0, 0);
  return Math.max(0, Math.round((startDate - now) / 1000));
}
