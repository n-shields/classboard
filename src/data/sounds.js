// Tiny synthesized feedback sounds (no audio assets to load) for gem
// adjustments — a low click when points are taken away, a rising ding when
// points are awarded.
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
