// Rally's browser half (lion-hawk 2c-rally R5, [S-1]): view halves over the sim half's scenes. All content comes from
// engine.scene.state (the stage state, #28). R5: the stage half (renderer, camera, HUD, toast, seed chip, body
// classes, settings save); R6 adds the title/pause/results/settings halves.
import { defineView } from 'lion-hawk/view';
import { Renderer } from './render.js';
import { Hud } from './ui.js';
import { GameHud } from './menus.js';

let renderer = null; // one WebGL renderer per page, made on the first enter on #view

const lengthText = (m, units) => units === 'mph' ? `${(m / 1609.344).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`;
const BUILDING = 'Building the track…';

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
    exit() { unlisten?.(); unlisten = null; off?.(); off = null; seen = null; cur = null; },
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
  return defineView({ scenes: { stage } });
}
