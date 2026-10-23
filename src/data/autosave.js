// Quiet per-period auto-save via the File System Access API — once a
// folder is picked (one browser permission prompt), snapshots write
// straight into it with no further prompts and no visible downloads.
// Chromium-only (Chrome/Edge); unsupported browsers just don't get the
// button (see isFileSystemAccessSupported).
const DB_NAME = "classboard_autosave";
const STORE = "handles";
const HANDLE_KEY = "dir";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(fn) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      fn(tx.objectStore(STORE));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function isFileSystemAccessSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function saveAutosaveHandle(handle) {
  await withStore(store => store.put(handle, HANDLE_KEY));
}

export async function loadAutosaveHandle() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function clearAutosaveHandle() {
  await withStore(store => store.delete(HANDLE_KEY));
}

export async function pickAutosaveFolder() {
  const handle = await window.showDirectoryPicker({ id: "classboard-autosave", mode: "readwrite" });
  await saveAutosaveHandle(handle);
  return handle;
}

// `queryPermission` never prompts, so it's safe to call outside a user
// gesture (e.g. on load); `requestPermission` may prompt and needs one.
export async function hasReadWritePermission(handle) {
  return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
}
export async function requestReadWritePermission(handle) {
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

// When to save, and whether to ask first. afterClass on its own is how
// auto-save always worked, so it's the default.
const OPTIONS_KEY = "classboard_autosave_options";
const LAST_DAY_KEY = "classboard_autosave_last_day";
export const DEFAULT_AUTOSAVE_OPTIONS = { afterClass: true, endOfDay: false, ask: false };

export function loadAutosaveOptions() {
  try {
    const stored = JSON.parse(localStorage.getItem(OPTIONS_KEY) || "null");
    if (stored && typeof stored === "object") return { ...DEFAULT_AUTOSAVE_OPTIONS, ...stored };
  } catch {
    // Unreadable — fall back to the defaults.
  }
  return { ...DEFAULT_AUTOSAVE_OPTIONS };
}

export function saveAutosaveOptions(options) {
  localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
}

/** Today as YYYY-MM-DD in local time — the end-of-day save's once-a-day marker. */
export function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function loadLastEndOfDaySave() {
  return localStorage.getItem(LAST_DAY_KEY);
}
export function markEndOfDaySave(day = localDateKey()) {
  localStorage.setItem(LAST_DAY_KEY, day);
}

/** "HH:MM" end of the schedule's last period, or null for an empty one. */
export function dayEndTime(periods) {
  const ends = (periods || []).map(p => p.end).filter(e => /^\d{1,2}:\d{2}$/.test(e || ""));
  if (!ends.length) return null;
  return ends.reduce((a, b) => (toMinutes(b) > toMinutes(a) ? b : a));
}
export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function pad(n) { return String(n).padStart(2, "0"); }

export function timestampedFilename(periodLabel) {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const safeLabel = periodLabel ? periodLabel.replace(/[\\/:*?"<>|]/g, "-") : "board";
  return `classboard-${safeLabel}-${stamp}.json`;
}

export async function writeSnapshot(dirHandle, filename, dataObj) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(dataObj, null, 2));
  await writable.close();
}
