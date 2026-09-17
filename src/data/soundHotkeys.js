import { playClap, playQuack, playBuzzer, playBell, playWhistle } from "./sounds";
import { loadCustomSounds, playDataUrl } from "./customSounds";

// The catalog of preset sound effects a hotkey can be assigned to (see
// HotkeysEditor). Adding a new preset here is all it takes to make it
// selectable — no other wiring needed.
export const SOUND_PRESETS = [
  { id: "clap",    label: "Clap",    play: playClap },
  { id: "quack",   label: "Quack",   play: playQuack },
  { id: "buzzer",  label: "Buzzer",  play: playBuzzer },
  { id: "bell",    label: "Bell",    play: playBell },
  { id: "whistle", label: "Whistle", play: playWhistle },
];

// Resolves either a built-in preset or a teacher-uploaded custom sound
// (see data/customSounds) — callers don't need to know which kind an id is.
export function soundById(id) {
  const preset = SOUND_PRESETS.find(s => s.id === id);
  if (preset) return preset;
  const custom = loadCustomSounds().find(s => s.id === id);
  if (custom) return { id: custom.id, label: custom.label, play: () => playDataUrl(custom.dataUrl) };
  return null;
}

const STORAGE_KEY = "classboard_sound_hotkeys";
// Matches the hotkeys this app shipped with before they became editable —
// changing this after the fact would silently alter existing teachers'
// setups, so this must stay { c: "clap", q: "quack" } specifically.
const DEFAULT_HOTKEYS = { c: "clap", q: "quack" };

export function loadSoundHotkeys() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) return stored;
  } catch (_) {}
  return { ...DEFAULT_HOTKEYS };
}

export function saveSoundHotkeys(map) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch (_) {}
}
