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

export function playClick() {
  tone({ type: "square", freqStart: 220, freqEnd: 140, duration: 0.05, gain: 0.12 });
}

export function playDing() {
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
