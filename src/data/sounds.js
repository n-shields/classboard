// Tiny synthesized sounds (no audio assets to load) — a low click and a
// rising ding for gem adjustments, plus a clap/quack pair of hotkey sound
// effects.
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
