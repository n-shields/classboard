export const DEFAULT_SCHEDULES = {
  Normal: [
    { id: 1, label: "Period 1", start: "07:45", end: "08:35" },
    { id: 2, label: "Period 2", start: "08:39", end: "09:29" },
    { id: 3, label: "Period 3", start: "09:33", end: "10:23" },
    { id: 4, label: "Period 4", start: "10:27", end: "11:17" },
    { id: "L", label: "Lunch",    start: "11:17", end: "11:52" },
    { id: 5, label: "Period 5", start: "11:52", end: "12:42" },
    { id: 6, label: "Period 6", start: "12:46", end: "13:36" },
    { id: 7, label: "Period 7", start: "13:40", end: "14:30" },
  ],
  Wednesday: [
    { id: 1, label: "Period 1", start: "07:45", end: "08:25" },
    { id: 2, label: "Period 2", start: "08:29", end: "09:09" },
    { id: 3, label: "Period 3", start: "09:13", end: "09:53" },
    { id: 4, label: "Period 4", start: "09:57", end: "10:37" },
    { id: "L", label: "Lunch",    start: "10:37", end: "11:07" },
    { id: 5, label: "Period 5", start: "11:07", end: "11:47" },
    { id: 6, label: "Period 6", start: "11:51", end: "12:31" },
    { id: 7, label: "Period 7", start: "12:35", end: "13:15" },
  ],
  "Half Day": [
    { id: 1, label: "Period 1", start: "07:45", end: "08:12" },
    { id: 2, label: "Period 2", start: "08:15", end: "08:42" },
    { id: 3, label: "Period 3", start: "08:45", end: "09:12" },
    { id: 4, label: "Period 4", start: "09:15", end: "09:42" },
    { id: "L", label: "Lunch",    start: "09:42", end: "10:07" },
    { id: 5, label: "Period 5", start: "10:07", end: "10:34" },
    { id: 6, label: "Period 6", start: "10:37", end: "11:04" },
    { id: 7, label: "Period 7", start: "11:07", end: "11:34" },
  ],
};

export const DEFAULT_SCHEDULE_DAYS = {
  Normal: [1, 2, 4, 5],   // Mon, Tue, Thu, Fri
  Wednesday: [3],          // Wed
  "Half Day": [],
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
