// Rally's browser half (lion-hawk 2c-rally R5, [S-1]): view halves over the sim half's scenes. All content comes from
// engine.scene.state (the stage state, #28). R5: the stage half (renderer, camera, HUD, toast, seed chip, body
// classes, settings save); R6: the title/pause/results/settings halves (field note #18, replacing the removed Menus: the engine owns the
// adopted controls, these halves own the cards around them).
import { defineView } from 'lion-hawk/view';
import { Renderer } from './render.js';
import { Hud } from './ui.js';
import { GameHud, fmtTime, fmtDelta, deltaClass } from './menus.js';

export const HELP = {
  freeDrive: 'Drive at your own pace: no clock. Knock the markers over, try the jumps.',
  stage: 'Point to point against the clock: 3-2-1-Go, a split every 250 m, beat your best.',
  timeAttack: 'Hot laps with a flying start: the clock starts at the line, and the laps go on until you stop.',
};

let renderer = null; // one WebGL renderer per page, made on the first enter on #view

const lengthText = (m, units) => units === 'mph' ? `${(m / 1609.344).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`;
const BUILDING = 'Building the track…';
const STAGE_CLASSES = ['scr-title', 'scr-play', 'menuOpen', 'onTrack', 'manual'];

// Lap table for the pause card (lap modes), split table for the results card: the removed Menus' markup.
function lapTable(s) {
  if (!s.mode?.laps || !s.laps.length) return '';
  const best = Math.min(...s.laps.filter(l => l.valid).map(l => l.time));
  return `<table class="times">${s.laps.map(l => `<tr><td>Lap ${l.n}</td><td class="${l.valid ? '' : 'dim'}">${fmtTime(l.time)}${l.valid ? '' : ' (invalid)'}</td><td>${l.valid && l.time === best ? '<span class="newBest">Best</span>' : ''}</td></tr>`).join('')}</table>`;
}
function splitTable(r) {
  return r.splits.length ? `<table class="times">${r.splits.map((t, i) => {
    const ref = r.bestSplits?.[i], dd = ref != null ? t - ref : null;
    return `<tr><td>Split ${i + 1}</td><td>${fmtTime(t)}</td><td class="${deltaClass(dd)}">${dd !== null ? fmtDelta(dd) : ''}</td></tr>`;
  }).join('')}</table>` : '';
}

// Focus a card's main button once the engine has enabled it: an overlay half enters before the UI sync that adopts
// and enables its controls, so the first frame(s) may still see it disabled.
function focuser(id) {
  let want = false;
  return {
    arm() { want = true; },
    disarm() { want = false; },
    run(doc) {
      if (!want) return;
      const el = doc.querySelector(`[data-testid="${id}"]`);
      if (!el || el.disabled) return;
      el.focus({ preventScroll: true }); want = doc.activeElement !== el;
    },
  };
}

// The title, pause, results and settings halves: they show and fill the cards; the controls inside are the engine's.
function overlayHalves() {
  let seedForm = null;
  const title = {
    seen: null,
    enter(engine, view) {
      const doc = view.doc;
      this.seen = { mode: null, best: undefined };
      // Go submits the seed form: never navigate; blurring the field fires its change, which the adopted field commits.
      seedForm = { el: doc.getElementById('seedForm'), on: ev => { ev.preventDefault(); doc.getElementById('seedInput')?.blur(); } };
      seedForm.el?.addEventListener('submit', seedForm.on);
    },
    exit(engine, view) {
      seedForm?.el?.removeEventListener('submit', seedForm.on); seedForm = null; this.seen = null;
      view.doc.activeElement?.blur?.(); // the removed play(): a focused title button must not keep Space/Enter
    },
    frame(engine, alpha, view) {
      const s = engine.scene.state, doc = view.doc, seen = this.seen; if (!seen || !s.settings) return;
      const mode = s.settings.mode;
      if (mode !== seen.mode) {
        seen.mode = mode;
        doc.getElementById('title').classList.toggle('free', mode === 'freeDrive');
        doc.getElementById('modeHelp').textContent = HELP[mode] ?? '';
      }
      const b = s.titleBest, key = b ? `${b.label}|${b.time}` : '';
      if (key !== seen.best) {
        seen.best = key;
        const el = doc.getElementById('titleBest');
        if (!b) el.textContent = '';
        else if (b.time === null) el.textContent = 'No time set yet';
        else el.innerHTML = `${b.label} <b>${fmtTime(b.time)}</b>`;
      }
    },
  };

  const resume = focuser('pause.resume');
  const pause = {
    enter(engine, view) {
      const s = engine.scene.state, doc = view.doc;
      doc.getElementById('pause').hidden = false;
      doc.getElementById('restartBtn').hidden = !s.world?.track;
      doc.getElementById('lapList').innerHTML = lapTable(s); // paused: the laps don't change while the card is up
      resume.arm(); resume.run(doc);
    },
    exit(engine, view) { view.doc.getElementById('pause').hidden = true; resume.disarm(); },
    frame(engine, alpha, view) { resume.run(view.doc); },
  };

  const retry = focuser('results.retry');
  let shown = null; // the result the card shows
  const results = {
    enter(engine, view) { view.doc.getElementById('results').hidden = false; shown = null; retry.arm(); results.frame(engine, 0, view); },
    exit(engine, view) { view.doc.getElementById('results').hidden = true; shown = null; retry.disarm(); },
    frame(engine, alpha, view) {
      const r = engine.scene.state.result, doc = view.doc;
      if (r && r !== shown) {
        shown = r;
        doc.getElementById('resTime').textContent = fmtTime(r.time);
        doc.getElementById('resDelta').innerHTML = r.isBest
          ? `<span class="newBest">New best</span>${r.prev !== null ? ` <span class="faster">${fmtDelta(r.delta)}</span>` : ''}`
          : `Best ${fmtTime(r.prev)} <span class="slower">${fmtDelta(r.delta)}</span>`;
        doc.getElementById('resSplits').innerHTML = splitTable(r);
      }
      retry.run(doc);
    },
  };

  const settings = {
    enter(engine, view) { view.doc.getElementById('sheet').hidden = false; },
    exit(engine, view) { view.doc.getElementById('sheet').hidden = true; },
  };
  return { title, pause, results, settings };
}

export function rallyView({ save = () => {} } = {}) {
  let hud = null, ghud = null, els = null, off = null, unlisten = null;
  let seen = null, toast = null; // per enter: what the view last reflected; the toast { text, until } (engine time)
  let cur = null; // the stage state the GameHud adapter reads
  // GameHud reads Game's fields; the stage state has them under the same names except phase (#22: engine clock).
  const hudGame = {
    get timed() { return !!(cur.mode?.clock && cur.world?.track); }, get state() { return cur.phase; },
    get mode() { return cur.mode; }, get time() { return cur.time; }, get lapTime() { return cur.lapTime; },
    get clockOn() { return cur.clockOn; }, get laps() { return cur.laps; }, get best() { return cur.best; },
  };
  const cls = (doc, name, on) => { if (doc.body.classList.contains(name) !== on) doc.body.classList.toggle(name, on); };

  function showSeed(s) {
    const t = s.world.track, chip = els.seedChip;
    chip.hidden = !t;
    if (t) {
      const text = `${t.kind === 'loop' ? 'Loop' : 'Stage'} · ${t.seed} · ${lengthText(t.layout.length, s.settings.units)}`;
      if (chip.textContent !== text) chip.textContent = text;
    }
  }

  const stage = {
    enter(engine, view) {
      const doc = view.doc, win = doc.defaultView;
      renderer ??= new Renderer(doc.getElementById('view'));
      hud ??= new Hud(doc.body);
      ghud ??= new GameHud({ now: () => engine.time.sim });
      els ??= { toast: doc.getElementById('toast'), seedChip: doc.getElementById('seedChip') };
      seen = { s: null, worldRev: -1, carRev: -1, settingsRev: -1, surface: null, units: null };
      toast = null; ghud.reset();
      unlisten = engine.events.on(e => {
        if (e.type === 'toast') toast = { text: e.text, until: e.seconds == null ? null : engine.time.sim + e.seconds };
        else if (e.type === 'state' && (e.state === 'title' || e.state === 'loading' || e.state === 'ready')) ghud.reset();
        ghud.event(e);
      });
      const resize = () => renderer.resize(win.innerWidth, win.innerHeight);
      // Leaving the page mid-run pauses it (iOS app switch, tab change): through the Pause chip, so its `when` decides.
      const hidden = () => {
        if (doc.visibilityState !== 'hidden') return;
        try { engine.ui.tap('stage.pause'); } catch (err) { if (!/is disabled|is covered|no control/.test(err.message)) throw err; }
      };
      win.addEventListener('resize', resize); doc.addEventListener('visibilitychange', hidden);
      off = () => { win.removeEventListener('resize', resize); doc.removeEventListener('visibilitychange', hidden); };
      resize();
    },
    exit(engine, view) {
      unlisten?.(); unlisten = null; off?.(); off = null; seen = null; cur = null; toast = null;
      for (const c of STAGE_CLASSES) view.doc.body.classList.remove(c);
      if (els) els.toast.hidden = true;
    },
    frame(engine, alpha, view) {
      const s = engine.scene.state, doc = view.doc; if (!s.sim || !seen) return;
      cur = s;
      const newWorld = s !== seen.s || s.worldRev !== seen.worldRev;
      if (newWorld || s.carRev !== seen.carRev) {
        renderer.setCar(s.sim.car);
        if (newWorld) { view.wait(renderer.setWorld(s.world)); seen.surface = null; seen.units = null; }
        if (s !== seen.s) seen.settingsRev = s.settingsRev; // a new stage (enter/jump) is not a settings change
        seen.s = s; seen.worldRev = s.worldRev; seen.carRev = s.carRev;
        cls(doc, 'onTrack', s.world.kind !== 'pad');
      }
      const st = s.settings;
      if (st.surface !== seen.surface) { seen.surface = st.surface; if (s.world.kind === 'pad') renderer.setSurface(st.surface); } // the surface option is pad-only
      if (st.units !== seen.units) { seen.units = st.units; hud.setUnits(st.units); showSeed(s); }
      if (s.settingsRev !== seen.settingsRev) { seen.settingsRev = s.settingsRev; save(st); }

      const ov = engine.scene.overlays, titleOpen = ov.includes('title');
      renderer.orbit = titleOpen;
      renderer.camMode = s.cam;
      hud.debug.hidden = !s.wheels;
      cls(doc, 'scr-title', titleOpen); cls(doc, 'scr-play', !titleOpen);
      cls(doc, 'menuOpen', ov.includes('pause') || ov.includes('results'));
      cls(doc, 'manual', st.gearbox === 'manual');

      // Toast: while loading, or an event's text until its engine-time deadline (#22).
      const now = engine.time.sim;
      const text = s.phase === 'loading' ? BUILDING : toast && toast.text !== BUILDING && (toast.until === null || now < toast.until) ? toast.text : null;
      if (toast && toast.until !== null && now >= toast.until) toast = null;
      els.toast.hidden = text === null;
      if (text !== null && els.toast.textContent !== text) els.toast.textContent = text;

      renderer.sync(s.sim);
      renderer.updateCamera(s.sim, Math.min(0.1, view.dt)); // #19: 0 for hook renders (no camera motion, no snap)
      hud.update(s.sim.car);
      ghud.update(hudGame);
      renderer.render();
    },
  };
  return defineView({ scenes: { stage, ...overlayHalves() } });
}
