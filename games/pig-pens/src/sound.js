// Tiny WebAudio synth for farm noises. Everything is generated; no audio files.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.lastOink = 0; this.oinks = 0; }
  unlock() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination); } catch (e) { return; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  get ok() { return this.ctx && !this.muted && this.ctx.state === 'running'; }
  // voiced grunt: sawtooth through two formant filters with a pitch glide
  voice(f0, f1, dur, vol, formants = [600, 1300], when = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const sum = c.createGain();
    for (const f of formants) { const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = 5; o.connect(b); b.connect(sum); }
    sum.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, vol, freq, when = 0, q = 1) {
    const c = this.ctx, t = c.currentTime + when, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = buf; const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = freq; b.Q.value = q;
    const g = c.createGain(); g.gain.value = vol; s.connect(b); b.connect(g); g.connect(this.master); s.start(t);
  }
  oink(vol = 0.5, pitch = 1) {
    if (!this.ok) return; const p = pitch * (0.9 + Math.random() * 0.25);
    this.voice(190 * p, 120 * p, 0.16, vol, [520, 1150]);
    if (Math.random() < 0.6) this.voice(170 * p, 110 * p, 0.13, vol * 0.8, [480, 1050], 0.2);
  }
  squeal() { if (!this.ok) return; this.voice(700, 1250, 0.18, 0.5, [1400, 2600]); this.voice(1250, 620, 0.35, 0.45, [1300, 2400], 0.17); }
  bark() { if (!this.ok) return; this.voice(420, 260, 0.1, 0.5, [900, 1800]); this.noise(0.08, 0.25, 1500); this.voice(440, 270, 0.1, 0.45, [900, 1800], 0.16); }
  whoosh() { if (!this.ok) return; this.noise(0.25, 0.25, 900, 0, 0.7); }
  munch() { if (!this.ok) return; for (let i = 0; i < 4; i++) this.noise(0.05, 0.4, 2200 + Math.random() * 800, i * 0.12, 2); }
  // a pig comes out sparkling clean: quick rising chime arpeggio with a little shimmer on top
  sparkle(vol = 0.5) {
    if (!this.ok) return; const c = this.ctx;
    [1568, 2093, 2637, 3136, 4186].forEach((f, k) => {
      const t = c.currentTime + k * 0.055 + Math.random() * 0.01, o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = f * (0.995 + Math.random() * 0.01);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.5);
    });
    this.noise(0.3, 0.12 * vol, 7000, 0.05, 3);
  }
  bell() {
    if (!this.ok) return; const c = this.ctx;
    for (let k = 0; k < 4; k++) for (const [f, a] of [[880, 0.25], [1320, 0.12], [2210, 0.07]]) {
      const t = c.currentTime + k * 0.32, o = c.createOscillator(), g = c.createGain(); o.frequency.value = f;
      g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.3);
    }
  }
  hose(on) {
    if (!this.ctx) return; const c = this.ctx;
    if (!this.hoseSrc) {
      const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.6;
      this.hoseGain = c.createGain(); this.hoseGain.gain.value = 0; s.connect(f); f.connect(this.hoseGain); this.hoseGain.connect(this.master); s.start(); this.hoseSrc = s;
    }
    const t = c.currentTime; this.hoseGain.gain.cancelScheduledValues(t);
    this.hoseGain.gain.setTargetAtTime(on && !this.muted ? 0.16 : 0, t, on ? 0.05 : 0.12);
  }
  tone(type, f0, f1, dur, vol, when = 0) {
    const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  pop() { if (this.ok) this.tone('sine', 520, 880, 0.09, 0.2); }
  gate() { if (!this.ok) return; this.noise(0.12, 0.35, 380, 0, 1.5); this.tone('triangle', 180, 120, 0.12, 0.25, 0.02); }
  scatter() { if (!this.ok) return; for (let i = 0; i < 8; i++) this.noise(0.03, 0.18, 3500 + Math.random() * 2000, 0.25 + i * 0.03 + Math.random() * 0.04, 3); }
  horn() { if (!this.ok) return; this.tone('square', 392, 380, 0.45, 0.12); this.tone('square', 466, 455, 0.45, 0.1); }
  cluck(vol = 0.3, worried = false) { if (!this.ok) return; const p = worried ? 1.25 : 1; this.voice(520 * p, 380 * p, 0.07, vol, [900, 2100]); this.voice(560 * p, 400 * p, 0.06, vol * 0.8, [900, 2100], 0.12); }
  peep(vol = 0.25) { if (!this.ok) return; this.tone('sine', 2600, 3400, 0.08, vol); this.tone('sine', 2700, 3500, 0.07, vol * 0.8, 0.12); }
  crow(short = false) { if (!this.ok) return; const d = short ? 0.5 : 1.3; this.voice(520, 760, 0.18, 0.45, [900, 2000]); this.voice(760, 820, d * 0.5, 0.5, [1000, 2300], 0.2); this.voice(820, 430, d * 0.4, 0.45, [900, 2000], 0.2 + d * 0.5); }
  squawk() { if (!this.ok) return; this.voice(900, 1500, 0.15, 0.5, [1400, 2800]); this.noise(0.15, 0.2, 2500, 0.05); }
  flap() { if (!this.ok) return; for (let i = 0; i < 5; i++) this.noise(0.05, 0.25, 700, i * 0.07, 0.8); }
  yip() { if (!this.ok) return; this.voice(900, 1300, 0.08, 0.4, [1200, 2400]); this.voice(950, 1400, 0.08, 0.35, [1200, 2400], 0.14); }
  egg() { if (!this.ok) return; this.tone('sine', 660, 990, 0.08, 0.25); this.tone('sine', 990, 1320, 0.1, 0.22, 0.09); }
  engine(on) {
    if (!this.ctx) return; const c = this.ctx;
    if (!this.eng) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38;
      const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 19;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 2;
      const g = c.createGain(); g.gain.value = 0; o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master); o.start(); o2.start();
      this.eng = { o, o2, f, g };
    }
    this.eng.g.gain.setTargetAtTime(on && !this.muted ? 0.13 : 0, c.currentTime, 0.2);
  }
  engineLevel(load, speed) { if (!this.eng || !this.ctx) return; const t = this.ctx.currentTime, f = 34 + speed * 7 + load * 14; this.eng.o.frequency.setTargetAtTime(f, t, 0.1); this.eng.o2.frequency.setTargetAtTime(f / 2, t, 0.1); this.eng.f.frequency.setTargetAtTime(300 + load * 500, t, 0.1); if (this.muted) this.eng.g.gain.setTargetAtTime(0, t, 0.05); }
  event(ev, camera) {
    if (!this.ok) return;
    const now = performance.now();
    const d = ev.x !== undefined ? Math.hypot(ev.x - camera.position.x, ev.z - camera.position.z) : 0;
    const vol = Math.max(0.05, Math.min(0.6, 18 / (d + 10)));
    if (ev.type === 'squeal') this.squeal();
    else if (ev.type === 'cluck') { if (now - (this.lastCluck || 0) < 300) return; this.lastCluck = now; this.cluck(vol * 0.7, ev.worried); }
    else if (ev.type === 'peep') { if (now - (this.lastPeep || 0) < 250) return; this.lastPeep = now; this.peep(vol * 0.6); }
    else if (ev.type === 'crow') this.crow(ev.short);
    else if (ev.type === 'squawk') { if (now - (this.lastSquawk || 0) < 200) return; this.lastSquawk = now; this.squawk(); }
    else if (ev.type === 'flap') this.flap();
    else if (ev.type === 'yip' || ev.type === 'fox') this.yip();
    else if (ev.type === 'egg') this.egg();
    else if (ev.type === 'gate') this.gate();
    else if (ev.type === 'lay') this.cluck(vol, false);
    else if (ev.type === 'hatch') { this.peep(0.35); this.peep(0.3); }
    else if (ev.type === 'munch') this.munch();
    else if (ev.type === 'clean') { if (now - (this.lastSparkle || 0) < 150) return; this.lastSparkle = now; this.sparkle(Math.min(1, vol * 2)); }
    else if (ev.type === 'oink') { if (now - this.lastOink < (ev.zoom ? 120 : 250)) return; this.lastOink = now; this.oink(vol, ev.zoom ? 1.7 : ev.scared ? 1.35 : 1); }
  }
}
