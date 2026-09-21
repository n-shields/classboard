// Gathers every classboard_-prefixed localStorage key — the same sweep
// Export/Import already relies on to capture everything, custom hotkey
// sounds included (see data/customSounds) — into one plain object.
export function collectData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith("classboard_")) continue;
    const v = localStorage.getItem(k);
    if (v !== null) try { data[k] = JSON.parse(v); } catch (_) { data[k] = v; }
  }
  return data;
}

// Downloads a dated JSON snapshot of collectData() — the same file the
// toolbar's "↓ Export" button produces, shared here so an auto-export
// reminder (see RemindersWidget) can trigger the identical download.
export function doExport() {
  const data = collectData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `classboard-${new Date().toISOString().slice(0, 10)}.json`;
  // Some browsers only reliably trigger a download from a click on an
  // element that's actually in the document — a detached <a> can silently
  // no-op, which matters more here than for the toolbar's own Export button
  // since this fires unattended, with no one around to notice it didn't.
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
