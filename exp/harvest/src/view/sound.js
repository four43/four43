// Harvest's sounds, synthesised with Web Audio on the engine's audio context (view.audio): an engine hum that follows the
// throttle, a rustle while the header cuts, coin blips while grain sells, a chime for the workshop and a fanfare for a purchase.
// Nothing loads; nothing plays before the first gesture unlocks the context. They go out on the engine's sfx bus.
export function createSound() {
  let ctx = null, out = null, hum = null, humGain = null, rustle = null, rustleGain = null, noise = null;
  const now = () => ctx.currentTime;
  // the engine's audio service makes and resumes the context inside a gesture; the loops start on its first unlock
  function attach(audio) {
    if (!audio) return;
    audio.onUnlock(() => {
      ctx = audio.ctx; out = ctx.createGain(); out.gain.value = 0.6; out.connect(audio.bus('sfx'));
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      loops();
    });
  }
  function loops() {
    if (hum || !ctx) return;
    hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 45;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    humGain = ctx.createGain(); humGain.gain.value = 0; hum.connect(lp).connect(humGain).connect(out); hum.start();
    rustle = ctx.createBufferSource(); rustle.buffer = noise; rustle.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7;
    rustleGain = ctx.createGain(); rustleGain.gain.value = 0; rustle.connect(bp).connect(rustleGain).connect(out); rustle.start();
  }
  const tone = (f, t0, dur, { type = 'triangle', vol = 0.25, to = null } = {}) => {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
  };
  return {
    attach,
    engine(load, speed, cutting) {
      if (!hum) return; const t = now();
      hum.frequency.setTargetAtTime(42 + load * 28 + speed * 3, t, 0.1); humGain.gain.setTargetAtTime(0.05 + load * 0.08, t, 0.15);
      rustleGain.gain.setTargetAtTime(cutting ? 0.07 : 0, t, 0.08);
    },
    coin() { if (ctx) { const t = now(); tone(1320, t, 0.12, { vol: 0.15, type: 'square' }); tone(1760, t + 0.06, 0.16, { vol: 0.12, type: 'square' }); } },
    chime(v = 0.25) { if (ctx) { const t = now(); [660, 880].forEach((f, k) => tone(f, t + k * 0.08, 0.3, { vol: v })); } },
    fanfare() { if (ctx) { const t = now(); [523, 659, 784, 1047].forEach((f, k) => tone(f, t + k * 0.09, 0.35, { vol: 0.22 })); } },
    full() { if (ctx) { const t = now(); tone(392, t, 0.25, { type: 'square', vol: 0.12 }); tone(392, t + 0.3, 0.35, { type: 'square', vol: 0.12 }); } },
    nope() { if (ctx) tone(220, now(), 0.2, { type: 'square', vol: 0.1, to: 160 }); },
  };
}
