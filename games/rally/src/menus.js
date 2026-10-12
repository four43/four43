// Time formatters and the game HUD (spec tracks T-26). DOM only: game.view.js feeds the HUD from the stage state; the
// title, pause and results cards live in game.view.js.
const $ = (id) => document.getElementById(id);

export const fmtTime = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
export const fmtDelta = (d) => `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`;
export const deltaClass = (d) => (d === null || d === undefined ? '' : d < 0 ? 'faster' : d > 0 ? 'slower' : '');

// Timer, lap line, split pill, countdown lights and banners. The hide timers are deadlines on `now` (seconds, the engine
// clock), run by update() (#22: U-5).
export class GameHud {
  constructor({ now }) {
    this.timer = $('timer'); this.lapLine = $('lapLine'); this.split = $('split');
    this.lights = $('lights'); this.lamps = [...this.lights.querySelectorAll('i')]; this.banner = $('banner');
    this.timers = {}; this.now = now;
  }
  later(name, ms, f) {
    this.timers[name] = { at: this.now() + ms / 1000, f };
  }
  cancel(name) { delete this.timers[name]; }
  reset() {
    this.split.hidden = true; this.lights.hidden = true; this.banner.hidden = true; this.sticky = false;
    this.timers = {};
  }
  say(text, kind = '', ms = 2500, sticky = false) {
    const b = this.banner;
    b.textContent = text; b.className = kind; b.hidden = false; this.sticky = sticky;
    if (sticky) this.cancel('banner');
    else this.later('banner', ms, () => { b.hidden = true; });
  }

  update(game) {
    const t = this.now(); // due deadlines, in no particular order (each hides its own element)
    for (const k in this.timers) { const d = this.timers[k]; if (t >= d.at) { delete this.timers[k]; d.f(); } }
    const timed = game.timed && game.state !== 'title' && game.state !== 'loading';
    if (timed !== this.wasTimed) { this.wasTimed = timed; document.body.classList.toggle('timed', timed); }
    this.timer.hidden = !timed;
    this.lapLine.hidden = !timed;
    if (!timed) return;
    const laps = game.mode.laps;
    const text = fmtTime(laps ? game.lapTime : game.time);
    if (this.timer.textContent !== text) this.timer.textContent = text;
    let line = '';
    if (laps) {
      if (!game.clockOn) line = 'Run-up: the clock starts at the line';
      else {
        const last = game.laps.at(-1);
        line = `Lap ${game.laps.length + 1}${last ? ` · Last ${fmtTime(last.time)}` : ''}${game.best ? ` · Best ${fmtTime(game.best.lap)}` : ''}`;
      }
    } else if (game.best) line = `Best ${fmtTime(game.best.time)}`;
    this.lapLine.hidden = !line;
    if (this.lapLine.textContent !== line) this.lapLine.textContent = line;
  }

  event(e) {
    switch (e.type) {
      case 'count':
        this.lights.hidden = false;
        this.lights.classList.toggle('go', e.n === 0);
        this.lamps.forEach((l, i) => l.classList.toggle('on', e.n > 0 && i < 4 - e.n));
        if (e.n === 0) this.later('lights', 1000, () => { this.lights.hidden = true; });
        break;
      case 'split': {
        const s = this.split;
        s.textContent = `Split ${e.index + 1}/${e.of}  ${e.delta !== null ? fmtDelta(e.delta) : fmtTime(e.time)}`;
        s.className = deltaClass(e.delta); s.hidden = false;
        this.later('split', 3000, () => { s.hidden = true; });
        if (this.sticky) { this.banner.hidden = true; this.sticky = false; }
        break;
      }
      case 'missed': this.say('Missed a checkpoint: go back', 'warn', 0, true); break;
      case 'blocked': this.say(`Missed checkpoint ${e.index + 1}: go back`, 'warn', 0, true); break;
      case 'lap':
        if (this.sticky) this.sticky = false;
        if (!e.valid) this.say(`Lap ${e.n} invalid: missed a checkpoint`, 'warn');
        else if (e.isBest) this.say(`Best lap ${fmtTime(e.time)}${e.prev !== null ? `  ${fmtDelta(e.delta)}` : ''}`, 'good');
        else this.say(`Lap ${e.n} ${fmtTime(e.time)}  ${fmtDelta(e.delta)}`);
        break;
      case 'state':
        if (e.state === 'finished') { this.split.hidden = true; this.banner.hidden = true; }
        break;
    }
  }
}
