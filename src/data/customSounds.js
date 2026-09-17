// Custom uploaded hotkey sounds. Stored as base64 data URLs directly in
// localStorage (under the classboard_ prefix that Export/Import already
// sweeps up — see collectData() in PeriodBar.jsx) rather than referencing
// the original file, so an uploaded clip keeps working from an exported
// backup even after the source file it came from is moved or deleted.
const STORAGE_KEY = "classboard_custom_sounds";

// A rough ceiling on one upload's stored (base64, ~33% larger than the raw
// file) size. localStorage is typically capped around 5-10MB total and
// shared with every other piece of app state, so this isn't meant to hold a
// real audio library — just a handful of short hotkey clips.
export const MAX_CUSTOM_SOUND_BYTES = 400 * 1024;

export function loadCustomSounds() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(stored)) return stored;
  } catch (_) {}
  return [];
}

export function saveCustomSounds(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addCustomSound(label, dataUrl) {
  const sound = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    dataUrl,
  };
  saveCustomSounds([...loadCustomSounds(), sound]);
  return sound;
}

export function removeCustomSound(id) {
  saveCustomSounds(loadCustomSounds().filter(s => s.id !== id));
}

export function playDataUrl(dataUrl) {
  try {
    new Audio(dataUrl).play().catch(() => {});
  } catch (_) {}
}
