// The "." key pauses and resumes whatever is counting down (the timer, a Noise
// Challenge) as one, so the two can't end up flipped opposite each other: if
// anything is running it all pauses; otherwise what the last press paused
// resumes. A timer stopped by hand beforehand stays stopped, unless nothing
// else is left to resume.
const pausables = new Map(); // name -> { isRunning, isPaused, pause, resume }
let lastPaused = [];

function onKeyDown(e) {
  if (e.key !== "." || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const target = e.target;
  if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
  if (document.querySelector(".modal-overlay")) return;

  const running = [...pausables].filter(([, p]) => p.isRunning());
  if (running.length) {
    running.forEach(([, p]) => p.pause());
    lastPaused = running.map(([name]) => name);
    return;
  }
  const paused = [...pausables].filter(([, p]) => p.isPaused());
  const fromLastPress = paused.filter(([name]) => lastPaused.includes(name));
  (fromLastPress.length ? fromLastPress : paused).forEach(([, p]) => p.resume());
  lastPaused = [];
}

/** Returns a function that unregisters it. */
export function registerPausable(name, pausable) {
  if (!pausables.size) window.addEventListener("keydown", onKeyDown);
  pausables.set(name, pausable);
  return () => {
    pausables.delete(name);
    if (!pausables.size) window.removeEventListener("keydown", onKeyDown);
  };
}
