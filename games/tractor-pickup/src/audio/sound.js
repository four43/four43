// Tiny WebAudio synth for the tractor, the animals and the music (spec section 8.2). Everything is generated; no audio files.
// R-8: every sound is soft and friendly. The loops (engine, gravel, skid, spray) are built once and only have their gains changed.
const PENTA = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25]; // C major pentatonic, two octaves
const TUNE = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 5, 7, 5, 4, 2]; // 16 steps, indexes into PENTA
const BPM = 110, STEP = 60 / BPM / 2, AHEAD = 0.4;

export class Sound {
  constructor() { this.ctx = null; this.master = null; this.muted = false; this.loops = null; this.musicTimer = 0; this.nextNote = 0; this.step = 0; }
  unlock() {
    if (!this.ctx) {
      try {
        const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.55; const lim = this.ctx.createDynamicsCompressor(); // R-8: a soft limiter so nothing ever gets loud
        lim.threshold.value = -14; lim.knee.value = 24; lim.ratio.value = 4; lim.attack.value = 0.005; lim.release.value = 0.2;
        this.master.connect(lim); lim.connect(this.ctx.destination);
        this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0; this.musicBus.connect(this.master);
        this.buildLoops();
      } catch (e) { this.ctx = null; return Promise.resolve(); }
    }
    return this.ctx.state !== 'running' ? Promise.resolve(this.ctx.resume?.()).catch(() => {}) : Promise.resolve();
  }
  get ok() { return !!this.ctx && !this.muted && this.ctx.state === 'running'; }
  noiseBuffer() {
    if (!this._noise) { const c = this.ctx, n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this._noise = b; }
    return this._noise;
  }
  // the four looping sources: reused for the whole game (no per-frame nodes)
  buildLoops() {
    const c = this.ctx, mk = (freq, q) => {
      const s = c.createBufferSource(); s.buffer = this.noiseBuffer(); s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.master); s.start(); return { f, g };
    };
    const o = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = 18; o2.type = 'square'; o2.frequency.value = 9; lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2; g.gain.value = 0;
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master); o.start(); o2.start();
    this.loops = { eng: { o, o2, lp, g }, crunch: mk(2200, 0.7), skid: mk(1800, 2), spray: mk(4000, 0.8) };
  }
  ramp(param, v, tc = 0.08) { param.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, tc); }
  // S-1: the pulse rate (putt-putt) climbs from 18 to 58 pulses a second with speed; S-2: crunch on gravel, softer swish on grass, nothing in mud
  engine(level, speed, surface) {
    if (!this.loops || this.ctx.state !== 'running') return;
    const { eng, crunch } = this.loops, s = Math.max(0, Math.min(1, speed)), f = 18 + 40 * s, t = this.ctx.currentTime, last = this.last || (this.last = {}), grass = surface === 'grass';
    const set = (key, param, v, tc, eps) => { if (Math.abs(v - (last[key] ?? -1e9)) < eps) return; last[key] = v; param.setTargetAtTime(v, t, tc); }; // skip writes that change nothing you can hear
    set('f', eng.o.frequency, f, 0.1, 0.3); set('f2', eng.o2.frequency, f / 2, 0.1, 0.15); set('lp', eng.lp.frequency, 300 + level * 500, 0.1, 10);
    set('eg', eng.g.gain, this.muted ? 0 : 0.07 + 0.07 * level, 0.15, 0.003);
    set('cf', crunch.f.frequency, grass ? 900 : 2200, 0.1, 1);
    set('cg', crunch.g.gain, this.muted ? 0 : surface === 'mud' ? 0 : s * (grass ? 0.1 : 0.25), 0.1, 0.003);
  }
  skid(amount) { // same dedupe as engine(): no write when nothing audible changes
    if (!this.loops || this.ctx.state !== 'running') return;
    const v = this.muted ? 0 : amount * 0.3, last = this.last || (this.last = {});
    if (Math.abs(v - (last.sk ?? -1e9)) < 0.003) return; last.sk = v; this.loops.skid.g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
  spray(on) { if (this.loops && this.ctx.state === 'running') this.ramp(this.loops.spray.g.gain, on ? 0.2 : 0, on ? 0.05 : 0.15); }
  // voiced grunt: sawtooth through formant filters with a pitch glide
  voice(f0, f1, dur, vol, formants = [600, 1300], when = 0) {
    const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const sum = c.createGain();
    for (const f of formants) { const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = 5; o.connect(b); b.connect(sum); }
    sum.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  // a short burst of the shared noise, fading out
  noise(dur, vol, freq, when = 0, q = 1) {
    const c = this.ctx, t = c.currentTime + when, s = c.createBufferSource(); s.buffer = this.noiseBuffer();
    const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = freq; b.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(b); b.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  tone(f0, f1, dur, vol, type = 'sine', when = 0, bus = this.master) {
    const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  oink(vol = 0.5) { if (!this.ok) return; const p = 0.9 + Math.random() * 0.25; this.voice(190 * p, 120 * p, 0.16, vol, [520, 1150]); this.voice(170 * p, 110 * p, 0.13, vol * 0.8, [480, 1050], 0.2); }
  bark() { if (!this.ok) return; this.voice(420, 260, 0.1, 0.5, [900, 1800]); this.noise(0.08, 0.2, 1500); this.voice(440, 270, 0.1, 0.45, [900, 1800], 0.16); }
  animal(type) {
    if (!this.ok) return;
    ({
      pig: () => this.oink(0.6),
      cow: () => this.voice(150, 110, 0.9, 0.5, [400, 900]),
      sheep: () => { for (let i = 0; i < 4; i++) this.voice(420, 400, 0.12, 0.35, [700, 1500], i * 0.1); },
      chicken: () => { this.voice(600, 900, 0.08, 0.35, [1200, 2400]); this.voice(900, 500, 0.25, 0.35, [1200, 2400], 0.1); },
      chick: () => this.voice(2200, 2600, 0.08, 0.25, [2500, 3500]),
      duck: () => { this.voice(500, 380, 0.15, 0.45, [900, 1800]); this.voice(480, 360, 0.15, 0.4, [900, 1800], 0.2); },
      bunny: () => this.boing(0.3), dog: () => this.bark(),
    }[type] || (() => {}))();
  }
  boing(v = 0.5) { if (this.ok) this.tone(180, 720, 0.35, v, 'triangle'); }
  plop() { if (this.ok) { this.tone(500, 160, 0.12, 0.5); this.noise(0.05, 0.2, 400); } }
  whee() { if (this.ok) this.tone(400, 1400, 0.6, 0.3, 'triangle'); }
  horn() { if (!this.ok) return; for (const w of [0, 0.32]) { this.tone(392, 392, 0.24, 0.15, 'triangle', w); this.tone(494, 494, 0.24, 0.1, 'triangle', w); } }
  bells() { if (this.ok) [1319, 1568, 1976, 2637].forEach((f, i) => this.tone(f, f, 0.8, 0.25, 'sine', i * 0.12)); }
  squelch() { if (this.ok) { this.noise(0.2, 0.35, 300, 0, 2); this.tone(220, 90, 0.2, 0.25, 'sine', 0.05); } }
  // quick rising chime arpeggio with a little shimmer on top
  sparkle(vol = 0.5) {
    if (!this.ok) return;
    [1568, 2093, 2637, 3136, 4186].forEach((f, k) => this.tone(f, f * 1.003, 0.45, 0.16 * vol, 'triangle', k * 0.055));
    this.noise(0.3, 0.12 * vol, 7000, 0.05, 3);
  }
  squeaky() { if (this.ok) { this.tone(1800, 3200, 0.15, 0.25); this.sparkle(0.6); } }
  clunk() { if (this.ok) { this.tone(140, 70, 0.15, 0.3, 'triangle'); this.noise(0.08, 0.2, 800); } }
  // T-34 / R-8: a happy crunch-pop: woody crunch, a bright pop on top, then a few leaf rustles. Nothing low or loud.
  treePop() {
    if (!this.ok) return;
    this.noise(0.14, 0.4, 700, 0, 1.2); this.noise(0.1, 0.3, 1100, 0.04, 1.5);
    this.tone(260, 130, 0.12, 0.25, 'triangle');
    this.tone(700, 1500, 0.1, 0.3, 'sine', 0.06);
    for (let i = 0; i < 4; i++) this.noise(0.05, 0.14, 4500 + Math.random() * 2000, 0.14 + i * 0.07 + Math.random() * 0.03, 3);
  }
  cheer() { if (this.ok) for (let i = 0; i < 10; i++) this.voice(500 + Math.random() * 500, 700 + Math.random() * 600, 0.4, 0.12, [900, 2400], Math.random() * 0.5); }
  // S-5: a light 16-step loop, scheduled a little ahead of the clock
  music(on) {
    if (!this.ctx) return;
    this.ramp(this.musicBus.gain, on ? 1 : 0, 0.3);
    if (on && !this.musicTimer) { this.nextNote = this.ctx.currentTime + 0.1; this.musicTimer = setInterval(() => this.schedule(), 100); }
    if (!on && this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = 0; }
  }
  schedule() {
    if (this.ctx.state !== 'running') { this.nextNote = this.ctx.currentTime + 0.1; return; }
    while (this.nextNote < this.ctx.currentTime + AHEAD) {
      const f = PENTA[TUNE[this.step % 16]]; this.tone(f, f, STEP * 1.6, 0.06, 'triangle', this.nextNote - this.ctx.currentTime, this.musicBus);
      this.nextNote += STEP; this.step++;
    }
  }
}
