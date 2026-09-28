// Tiny synthesized sounds (no audio assets to load) — a low click and a
// rising ding for gem adjustments, plus a small catalog of preset sound
// effects assignable to hotkeys (see data/soundHotkeys.js).
let audioCtx = null;
function getCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone({ type, freqStart, freqEnd, duration, gain }) {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);
    }
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gainNode).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

// Mutes just the two point-adjustment sounds below (playClick/playDing) —
// the preset sound effects further down (assignable to hotkeys) are a
// separate, deliberate choice each time, not tied to this. Read fresh on
// every play rather than cached, since the two call sites (here and
// PeriodBar's global +/- shortcut) aren't otherwise wired to react to a
// change made from the student list's own mute button.
const GEMS_MUTED_KEY = "classboard_gems_sound_muted";
export function isGemsSoundMuted() {
  try { return localStorage.getItem(GEMS_MUTED_KEY) === "1"; } catch (_) { return false; }
}
export function setGemsSoundMuted(muted) {
  try { localStorage.setItem(GEMS_MUTED_KEY, muted ? "1" : "0"); } catch (_) {}
}

export function playClick() {
  if (isGemsSoundMuted()) return;
  tone({ type: "square", freqStart: 220, freqEnd: 140, duration: 0.05, gain: 0.12 });
}

export function playDing() {
  if (isGemsSoundMuted()) return;
  tone({ type: "sine", freqStart: 880, freqEnd: 1568, duration: 0.32, gain: 0.18 });
}

// A short burst of filtered white noise — no oscillator produces a
// convincing clap on its own, since a real handclap is broadband noise, not
// a single pitch.
function noiseBurst({ duration, gain, filterFreq, filterQ = 1, filterType = "bandpass" }) {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    noise.connect(filter).connect(gainNode).connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + duration);
  } catch (_) {}
}

// A short, dry tick — a flapper clicking past a peg — used for the wheel's
// optional spinning sound as it crosses each segment. Tighter/higher than
// playClap's noise so a run of rapid repeats at full spin speed reads as
// distinct ticks rather than smearing into mush.
export function playTick() {
  noiseBurst({ duration: 0.02, gain: 0.22, filterFreq: 3200, filterQ: 2.2 });
}

// Three closely-spaced, slightly detuned noise bursts read as one clap
// rather than a single flat pop.
export function playClap() {
  noiseBurst({ duration: 0.08, gain: 0.5,  filterFreq: 1200, filterQ: 0.7 });
  setTimeout(() => noiseBurst({ duration: 0.07, gain: 0.4,  filterFreq: 1600, filterQ: 0.8 }), 15);
  setTimeout(() => noiseBurst({ duration: 0.09, gain: 0.35, filterFreq: 900,  filterQ: 0.6 }), 30);
}

// A duck quack is a nasal, buzzy tone with a fast pitch drop — approximated
// with a sawtooth (rich in the harmonics a sine lacks) through a falling
// low-pass filter for the "buzz" softening into a honk.
export function playQuack() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(340, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.18);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.18);
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    osc.connect(filter).connect(gainNode).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch (_) {}
}

// A harsh, sustained low buzz — a square wave (rich in odd harmonics, the
// "buzzy" part) with a slow tremolo (a second, slower oscillator modulating
// the gain) so it reads as a rattling buzzer rather than a flat tone.
export function playBuzzer() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const duration = 0.45;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    const tremolo = ctx.createOscillator();
    tremolo.type = "square";
    tremolo.frequency.setValueAtTime(28, ctx.currentTime);
    const tremoloGain = ctx.createGain();
    tremoloGain.gain.setValueAtTime(0.15, ctx.currentTime);
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.22, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.22, ctx.currentTime + duration - 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    tremolo.connect(tremoloGain).connect(gainNode.gain);
    osc.connect(gainNode).connect(ctx.destination);
    osc.start();
    tremolo.start();
    osc.stop(ctx.currentTime + duration);
    tremolo.stop(ctx.currentTime + duration);
  } catch (_) {}
}

// A bell: a fundamental sine plus a quieter overtone a twelfth above (a
// classic bell/chime interval), both with a sharp attack and a long
// exponential decay.
export function playBell() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const duration = 1.1;
    [
      { freq: 880,  gain: 0.28 },
      { freq: 2640, gain: 0.1  },
    ].forEach(({ freq, gain }) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(gain, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gainNode).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    });
  } catch (_) {}
}

// A coach's whistle: a quick rise to a high, piercing pitch, a brief hold,
// then a short fall — a sine kept clean (no distortion) since a real
// whistle is nearly a pure tone.
export function playWhistle() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(2200, t + 0.08);
    osc.frequency.setValueAtTime(2200, t + 0.3);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.42);
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
    gainNode.gain.setValueAtTime(0.25, t + 0.35);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + 0.44);
    osc.connect(gainNode).connect(ctx.destination);
    osc.start();
    osc.stop(t + 0.45);
  } catch (_) {}
}

// Noise Challenge outcome stings — played once when a challenge ends,
// regardless of the gems mute (like the hotkey presets, they're an
// announcement, not per-point feedback).

// A win: a quick rising major arpeggio (C-E-G) landing on a held high C,
// triangle waves for a bright but soft, toy-trumpet-ish fanfare.
export function playChallengeWin() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    [
      { freq: 523.25, at: 0,    dur: 0.14 },
      { freq: 659.25, at: 0.12, dur: 0.14 },
      { freq: 783.99, at: 0.24, dur: 0.14 },
      { freq: 1046.5, at: 0.36, dur: 0.7  },
    ].forEach(({ freq, at, dur }) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t0 + at);
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.0001, t0 + at);
      gainNode.gain.exponentialRampToValueAtTime(0.3, t0 + at + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gainNode).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur);
    });
  } catch (_) {}
}

// A loss: the classic "sad trombone" — three descending notes then a
// longer, sagging fourth, sawtooth through a low-pass for a brassy but
// not harsh tone.
export function playChallengeLose() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, t0);
    filter.connect(ctx.destination);
    [
      { freq: 293.66, at: 0,    dur: 0.3, sag: 1 },
      { freq: 277.18, at: 0.32, dur: 0.3, sag: 1 },
      { freq: 261.63, at: 0.64, dur: 0.3, sag: 1 },
      { freq: 246.94, at: 0.96, dur: 0.9, sag: 0.94 },
    ].forEach(({ freq, at, dur, sag }) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t0 + at);
      if (sag !== 1) osc.frequency.exponentialRampToValueAtTime(freq * sag, t0 + at + dur);
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.0001, t0 + at);
      gainNode.gain.exponentialRampToValueAtTime(0.2, t0 + at + 0.03);
      gainNode.gain.setValueAtTime(0.2, t0 + at + dur - 0.08);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gainNode).connect(filter);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur);
    });
  } catch (_) {}
}
