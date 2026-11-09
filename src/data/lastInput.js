// When the teacher last typed, clicked, touched or moved the mouse in any
// classboard window (the board, Students, seating chart, Teacher View,
// Clones), so the board can tell nobody has used it for a while. Windows
// share it through localStorage, written at most every SHARE_MS. The key has
// a hyphen, not an underscore, so it stays out of exports.
const KEY = "classboard-last-input";
const SHARE_MS = 15_000;
const EVENTS = ["keydown", "pointerdown", "pointermove", "wheel", "touchstart"];

let last = Date.now();
let lastShared = 0;

function onInput() {
  last = Date.now();
  if (last - lastShared < SHARE_MS) return;
  lastShared = last;
  try { localStorage.setItem(KEY, String(last)); } catch (_) {}
}

function onStorage(e) {
  if (e.key !== KEY) return;
  const t = Number(e.newValue);
  if (t > last) last = t;
}

export function trackInput() {
  EVENTS.forEach(type => window.addEventListener(type, onInput, { capture: true, passive: true }));
  window.addEventListener("storage", onStorage);
}

export const msSinceInput = () => Date.now() - last;
