// Title menu, pause menu, results card and the game HUD (spec tracks T-26). DOM only: main.js
// wires them to the Game and the settings.
import { HELP } from './game.view.js'; // the mode help moved to the engine path's title half (R6)
const $ = (id) => document.getElementById(id);

export const fmtTime = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
export const fmtDelta = (d) => `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`;
export const deltaClass = (d) => (d === null || d === undefined ? '' : d < 0 ? 'faster' : d > 0 ? 'slower' : '');

export class Menus {
  // on: { change(key, value), seed(text), drive, resume, restart, settings, quit, retry, newSeed }
  constructor(settings, on) {
    this.settings = settings; this.on = on;
    this.title = $('title'); this.pauseCard = $('pause'); this.resultsCard = $('results');
    this.title.addEventListener('click', (e) => {
      const el = e.target.closest('[data-title]'); if (!el) return;
      const [k, v] = el.dataset.title.split(':');
      on.change(k, v);
    });
    const seedInput = this.seedInput = $('seedInput');
    $('diceBtn').addEventListener('click', () => { seedInput.value = Math.random().toString(36).slice(2, 7); on.seed(seedInput.value); });
    $('seedForm').addEventListener('submit', (e) => { e.preventDefault(); seedInput.blur(); on.seed(seedInput.value); });
    const click = (id, f) => $(id).addEventListener('click', f);
    click('driveBtn', () => on.drive());
    click('resumeBtn', () => on.resume()); click('restartBtn', () => on.restart());
    click('setBtn', () => on.settings()); click('quitBtn', () => on.quit());
    click('retryBtn', () => on.retry()); click('newSeedBtn', () => on.newSeed()); click('menuBtn2', () => on.quit());
  }

  // 'title' or 'play'; pause and results are cards over play.
  setScreen(name) {
    document.body.classList.toggle('scr-title', name === 'title');
    document.body.classList.toggle('scr-play', name === 'play');
    if (name === 'title') { this.hidePause(); this.hideResults(); }
  }
  get menuOpen() { return !this.pauseCard.hidden || !this.resultsCard.hidden; }
  syncMenuOpen() { document.body.classList.toggle('menuOpen', this.menuOpen); }

  reflect() {
    const s = this.settings;
    for (const el of this.title.querySelectorAll('[data-title]')) {
      const [k, v] = el.dataset.title.split(':');
      el.setAttribute('aria-pressed', String(String(s[k]) === v));
    }
    this.title.classList.toggle('free', s.mode === 'freeDrive');
    $('modeHelp').textContent = HELP[s.mode];
    if (document.activeElement !== this.seedInput) this.seedInput.value = s.seed;
  }

  // best: null (free drive / no track), or { label, time } where time may be null (none yet).
  setBest(best) {
    const el = $('titleBest');
    if (!best) el.textContent = '';
    else if (best.time === null) el.textContent = 'No time set yet';
    else el.innerHTML = `${best.label} <b>${fmtTime(best.time)}</b>`;
  }

  showPause(game) {
    this.pauseCard.hidden = false;
    $('restartBtn').hidden = !game.track;
    const list = $('lapList');
    if (game.mode.laps && game.laps.length) {
      const best = Math.min(...game.laps.filter((l) => l.valid).map((l) => l.time));
      list.innerHTML = `<table class="times">${game.laps.map((l) => `<tr><td>Lap ${l.n}</td><td class="${l.valid ? '' : 'dim'}">${fmtTime(l.time)}${l.valid ? '' : ' (invalid)'}</td><td>${l.valid && l.time === best ? '<span class="newBest">Best</span>' : ''}</td></tr>`).join('')}</table>`;
    } else list.innerHTML = '';
    this.syncMenuOpen();
    $('resumeBtn').focus({ preventScroll: true });
  }
  hidePause() { this.pauseCard.hidden = true; this.syncMenuOpen(); }

  showResults(r) {
    this.resultsCard.hidden = false;
    $('resTime').textContent = fmtTime(r.time);
    const d = $('resDelta');
    if (r.isBest) d.innerHTML = `<span class="newBest">New best</span>${r.prev !== null ? ` <span class="faster">${fmtDelta(r.delta)}</span>` : ''}`;
    else d.innerHTML = `Best ${fmtTime(r.prev)} <span class="slower">${fmtDelta(r.delta)}</span>`;
    $('resSplits').innerHTML = r.splits.length ? `<table class="times">${r.splits.map((t, i) => {
      const ref = r.bestSplits[i], dd = ref != null ? t - ref : null;
      return `<tr><td>Split ${i + 1}</td><td>${fmtTime(t)}</td><td class="${deltaClass(dd)}">${dd !== null ? fmtDelta(dd) : ''}</td></tr>`;
    }).join('')}</table>` : '';
    this.syncMenuOpen();
    $('retryBtn').focus({ preventScroll: true });
  }
  hideResults() { this.resultsCard.hidden = true; this.syncMenuOpen(); }
}

// Timer, lap line, split pill, countdown lights and banners. With `now` (seconds, the engine clock) the hide timers are
// deadlines run by update() (#22: U-5, they follow engine time); without it, setTimeout as before (the old main.js).
export class GameHud {
  constructor({ now } = {}) {
    this.timer = $('timer'); this.lapLine = $('lapLine'); this.split = $('split');
    this.lights = $('lights'); this.lamps = [...this.lights.querySelectorAll('i')]; this.banner = $('banner');
    this.timers = {}; this.now = now ?? null;
  }
  later(name, ms, f) {
    if (this.now) { this.timers[name] = { at: this.now() + ms / 1000, f }; return; }
    clearTimeout(this.timers[name]); this.timers[name] = setTimeout(f, ms);
  }
  cancel(name) { if (this.now) delete this.timers[name]; else clearTimeout(this.timers[name]); }
  reset() {
    this.split.hidden = true; this.lights.hidden = true; this.banner.hidden = true; this.sticky = false;
    if (this.now) this.timers = {}; else for (const t of Object.values(this.timers)) clearTimeout(t);
  }
  say(text, kind = '', ms = 2500, sticky = false) {
    const b = this.banner;
    b.textContent = text; b.className = kind; b.hidden = false; this.sticky = sticky;
    if (sticky) this.cancel('banner');
    else this.later('banner', ms, () => { b.hidden = true; });
  }

  update(game) {
    if (this.now) { // due deadlines, in no particular order (each hides its own element)
      const t = this.now();
      for (const k in this.timers) { const d = this.timers[k]; if (t >= d.at) { delete this.timers[k]; d.f(); } }
    }
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
