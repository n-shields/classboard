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

// Recorded clips bundled in public/sounds (all CC0 from Freesound — see
// public/sounds/CREDITS.md), listed apart from the synthesized presets above.
// Each Audio element is created once and rewound on replay; clips already
// bound to a hotkey are loaded up front (see the bottom of this file) so the
// first press plays instantly instead of waiting on a download.
const clipAudio = {};
function clipElement(file) {
  if (!clipAudio[file]) {
    clipAudio[file] = new Audio(`${import.meta.env.BASE_URL}sounds/${file}.mp3`);
    clipAudio[file].preload = "auto";
  }
  return clipAudio[file];
}
function playClip(file) {
  try {
    const audio = clipElement(file);
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch (_) {}
}
const clip = (id, label) => ({ id: `clip-${id}`, label, play: () => playClip(id) });
export const SOUND_CLIPS = [
  clip("cheer",          "Cheer (Yay!)"),
  clip("crowd-cheer",    "Crowd Cheer"),
  clip("applause",       "Applause"),
  clip("airhorn",        "Airhorn"),
  clip("duck-quack",     "Duck Quack"),
  clip("drum-roll",      "Drum Roll"),
  clip("rimshot",        "Rimshot"),
  clip("sad-trombone",   "Sad Trombone"),
  clip("slide-whistle",  "Slide Whistle"),
  clip("boing",          "Boing"),
  clip("tada",           "Ta-da!"),
  clip("crickets",       "Crickets"),
  clip("cash-register",  "Cash Register"),
  clip("gong",           "Gong"),
  clip("magic",          "Magic Sparkle"),
  clip("record-scratch", "Record Scratch"),
  clip("level-up",       "Level Up"),
  clip("wrong-answer",   "Wrong Answer"),
];

// Resolves either a built-in preset or a teacher-uploaded custom sound
// (see data/customSounds) — callers don't need to know which kind an id is.
export function soundById(id) {
  const preset = SOUND_PRESETS.find(s => s.id === id) || SOUND_CLIPS.find(s => s.id === id);
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
  preloadClips(map);
}

function preloadClips(map) {
  try {
    for (const id of Object.values(map)) {
      if (typeof id === "string" && id.startsWith("clip-")) clipElement(id.slice(5));
    }
  } catch (_) {}
}
if (typeof window !== "undefined") preloadClips(loadSoundHotkeys());
