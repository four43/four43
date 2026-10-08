// Tiny WebAudio synth for the tractor, the animals and the music (spec section 8.2). Everything is generated, except the animal calls
// a parent recorded (E-2: audio/animals/<type>.mp3, embedded by build.py as window.__ANIMALS__); a type with no recording uses the synth.
// R-8: every sound is soft and friendly. The loops (engine, gravel, skid, spray) are built once and only have their gains changed.
const PENTA = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25]; // C major pentatonic, two octaves
const TUNE = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 5, 7, 5, 4, 2]; // 16 steps, indexes into PENTA
const BPM = 110, STEP = 60 / BPM / 2, AHEAD = 0.4;

export class Sound {
  constructor() { this.ctx = null; this.master = null; this.muted = false; this.loops = null; this.musicTimer = 0; this.nextNote = 0; this.step = 0; this.clips = {}; this.tempo = 1; }
  // E-2: decode the recorded animal calls once, after unlock (never mid-drive); { type: [dataUrl, ...] }
  loadClips(src = (typeof window !== 'undefined' && window.__ANIMALS__) || {}) {
    if (!this.ctx) return Promise.resolve();
    return Promise.all(Object.entries(src).map(async ([type, urls]) => {
      if (this.clips[type]) return;
      this.clips[type] = (await Promise.all(urls.map(async u => { try { const bin = Uint8Array.from(atob(u.split(',')[1]), c => c.charCodeAt(0)); return await this.ctx.decodeAudioData(bin.buffer); } catch (e) { console.warn('sound: animal clip', type, e); return null; } }))).filter(Boolean);
    }));
  }
  clip(buf, when, vol = 1) { const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; g.gain.value = vol; s.connect(g); g.connect(this.master); s.start(c.currentTime + when); s.onended = () => { s.disconnect(); g.disconnect(); }; }
  unlock() {
    if (!this.ctx) {
      try {
        const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.55; const lim = this.ctx.createDynamicsCompressor(); // R-8: a soft limiter so nothing ever gets loud
        lim.threshold.value = -14; lim.knee.value = 24; lim.ratio.value = 4; lim.attack.value = 0.005; lim.release.value = 0.2;
        this.master.connect(lim); lim.connect(this.ctx.destination);
        this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0; this.musicBus.connect(this.master);
        this.buildLoops();
      } catch (e) { console.warn('sound: no audio', e); this.ctx = null; return Promise.resolve(); }
    }
    return this.ctx.state !== 'running' ? Promise.resolve(this.ctx.resume?.()).catch(e => console.warn('sound: resume', e)) : Promise.resolve(); // D-3: iOS refuses outside a gesture; the next gesture tries again
  }
  // D-1: the page is hidden: stop every sound (the loops keep their gains, so they would drone on in a background tab); unlock() resumes
  suspend() { if (this.ctx?.state === 'running') Promise.resolve(this.ctx.suspend()).catch(e => console.warn('sound: suspend', e)); }
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
    set('cg', crunch.g.gain, this.muted ? 0 : surface === 'mud' ? 0 : s * (grass ? 0.025 : 0.0625), 0.1, 0.001); // S-2: 1/4 of version 1.9 (review 3: the drive woosh was too loud)
  }
  skid(amount) { // same dedupe as engine(): no write when nothing audible changes
    if (!this.loops || this.ctx.state !== 'running') return;
    const v = this.muted ? 0 : amount * 0.3, last = this.last || (this.last = {});
    if (Math.abs(v - (last.sk ?? -1e9)) < 0.003) return; last.sk = v; this.loops.skid.g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
  spray(on) { if (this.loops && this.ctx.state === 'running') this.ramp(this.loops.spray.g.gain, on ? 0.05 : 0, on ? 0.05 : 0.15); }
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
  oink(vol = 0.5, w = 0) { if (!this.ok) return; const p = 0.9 + Math.random() * 0.25; this.voice(190 * p, 120 * p, 0.16, vol, [520, 1150], w); this.voice(170 * p, 110 * p, 0.13, vol * 0.8, [480, 1050], w + 0.2); }
  bark(w = 0) { if (!this.ok) return; this.voice(420, 260, 0.1, 0.5, [900, 1800], w); this.noise(0.08, 0.2, 1500, w); this.voice(440, 270, 0.1, 0.45, [900, 1800], w + 0.16); }
  // one call of this animal, `w` s from now (E-1: the riders sing one after another): a recorded call when there is one (E-2), else the synth
  animal(type, w = 0) {
    if (!this.ok) return;
    const rec = this.clips[type]; if (rec?.length) { this.clip(rec[Math.floor(Math.random() * rec.length)], w); return; }
    ({
      pig: () => this.oink(0.6, w),
      cow: () => this.voice(150, 110, 0.9, 0.5, [400, 900], w),
      sheep: () => { for (let i = 0; i < 4; i++) this.voice(420, 400, 0.12, 0.35, [700, 1500], w + i * 0.1); },
      chicken: () => { this.voice(600, 900, 0.08, 0.35, [1200, 2400], w); this.voice(900, 500, 0.25, 0.35, [1200, 2400], w + 0.1); },
      chick: () => this.voice(2200, 2600, 0.08, 0.25, [2500, 3500], w),
      duck: () => { this.voice(500, 380, 0.15, 0.45, [900, 1800], w); this.voice(480, 360, 0.15, 0.4, [900, 1800], w + 0.2); },
      bunny: () => this.boing(0.3, w), dog: () => this.bark(w),
    }[type] || (() => {}))();
  }
  boing(v = 0.5, w = 0) { if (this.ok) this.tone(180, 720, 0.35, v, 'triangle', w); }
  plop() { if (this.ok) { this.tone(500, 160, 0.12, 0.5); this.noise(0.05, 0.2, 400); } }
  whee() { if (this.ok) this.tone(400, 1400, 0.6, 0.3, 'triangle'); }
  // S-7: a bulb horn, "HONK-honk": two reedy notes (a sawtooth and a square a little apart, through a horn-like formant), each with a small pitch drop. M-8: v 0.4 for an other tractor's horn
  horn(v = 1) { if (!this.ok) return; this.honk(370, 335, 0.3, 0.5 * v, 0); this.honk(330, 300, 0.25, 0.42 * v, 0.36); }
  honk(f0, f1, dur, vol, when) {
    const c = this.ctx, t = c.currentTime + when, g = c.createGain(), lp = c.createBiquadFilter(), bp = c.createBiquadFilter(), mix = c.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 1.2; bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.4; mix.gain.value = 0.6;
    for (const [type, k] of [['sawtooth', 1], ['square', 1.006]]) {
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0 * k * 0.94, t); o.frequency.linearRampToValueAtTime(f0 * k, t + 0.04); // the squeeze: a quick rise
      o.frequency.exponentialRampToValueAtTime(f1 * k, t + dur); o.connect(lp); o.connect(bp); o.start(t); o.stop(t + dur + 0.05);
    }
    lp.connect(g); bp.connect(mix); mix.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.025); g.gain.setValueAtTime(vol, t + dur - 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  // E-6: a golden animal landed: a bright rising fanfare, then bells
  fanfare() { if (!this.ok) return; [523, 659, 784, 1047].forEach((f, i) => { this.tone(f, f, i === 3 ? 0.6 : 0.16, 0.22, 'square', i * 0.14); this.tone(f * 2, f * 2, 0.3, 0.06, 'sine', i * 0.14); }); this.bells(0.7); }
  bells(w = 0) { if (this.ok) [1319, 1568, 1976, 2637].forEach((f, i) => this.tone(f, f, 0.8, 0.25, 'sine', w + i * 0.12)); }
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
  // T-34: a bush: a soft leafy pop, no crunch
  bushPop() { if (this.ok) { this.tone(600, 1200, 0.08, 0.2, 'sine'); for (let i = 0; i < 3; i++) this.noise(0.05, 0.12, 4000 + Math.random() * 2000, i * 0.05, 3); } }
  cheer() { if (this.ok) for (let i = 0; i < 10; i++) this.voice(500 + Math.random() * 500, 700 + Math.random() * 600, 0.4, 0.12, [900, 2400], Math.random() * 0.5); }
  // S-5: a light 16-step loop, scheduled a little ahead of the clock
  // E-5: a slower, softer tune at bedtime (tempo 0.5); 1 is the normal tune
  lullaby(on) { this.tempo = on ? 0.5 : 1; }
  music(on) {
    if (!this.ctx) return;
    this.ramp(this.musicBus.gain, on ? 1 : 0, 0.3);
    if (on && !this.musicTimer) { this.nextNote = this.ctx.currentTime + 0.1; this.musicTimer = setInterval(() => this.schedule(), 100); }
    if (!on && this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = 0; }
  }
  schedule() {
    if (this.ctx.state !== 'running') { this.nextNote = this.ctx.currentTime + 0.1; return; }
    while (this.nextNote < this.ctx.currentTime + AHEAD) {
      const f = PENTA[TUNE[this.step % 16]] / (this.tempo < 1 ? 2 : 1), st = STEP / this.tempo; this.tone(f, f, st * 1.6, this.tempo < 1 ? 0.045 : 0.06, 'triangle', this.nextNote - this.ctx.currentTime, this.musicBus);
      this.nextNote += st; this.step++;
    }
  }
}
