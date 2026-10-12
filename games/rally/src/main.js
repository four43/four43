import R from '@dimforge/rapier3d-compat';
import { Sim, DT } from './sim.js';
import { shift } from './drivetrain.js';
import { Renderer } from './render.js';
import { Controls, Hud } from './ui.js';
import { CARS } from './cars.js';
import { PadWorld } from './world/padWorld.js';
import { TrackWorld, pointAt } from './world/trackWorld.js';
import { generateTrack } from './gen/track.js';
import { Game } from './game/game.js';
import { MODES } from './game/modes.js';
import { makeBests, bestKey } from './game/bests.js';
import { installEngineHook } from 'lion-hawk/view';
import { Menus, GameHud } from './menus.js';

const SAVE_KEY = 'rally-sim-settings';
const SETTINGS_V = 4;
const randomSeed = () => Math.random().toString(36).slice(2, 7);
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { /* storage unavailable */ }
  if ((s.v || 1) < 2) delete s.assist; // round 2 made Sim the default (spec R2-1)
  return s;
}
function saveSettings(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }
const DRIVING = new Set(['ready', 'countdown', 'running']);
const NO_INPUT = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };

async function start() {
  await R.init();
  const root = document.body;
  const padMode = new URLSearchParams(location.search).has('pad'); // the test pad is a hidden debug world (?pad)
  const settings = { car: 'awd', surface: 'gravel', assist: false, gearbox: 'auto', mode: 'freeDrive', world: 'loop', seed: randomSeed(),
    theme: 'summer', density: 'mild', style: 'twisty', units: 'mph', ...loadSettings(), v: SETTINGS_V };
  if (!MODES[settings.mode]) settings.mode = 'freeDrive';
  if (settings.world === 'pad') settings.world = 'loop'; // settings v4: the pad left the menus
  const save = () => saveSettings(settings);
  const lengthText = (m) => settings.units === 'mph' ? `${(m / 1609.344).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`;

  const sim = new Sim(R, { car: settings.car, surface: settings.surface, assist: settings.assist });
  sim.car.autoShift = settings.gearbox === 'auto';
  const view = new Renderer(document.getElementById('view'));
  view.setWorld(sim.world); view.setSurface(settings.surface); view.setCar(sim.car);
  const controls = new Controls(root), hud = new Hud(root), ghud = new GameHud();
  hud.setUnits(settings.units);
  const bests = makeBests(localStorage);
  const game = new Game(sim, { bests });
  const mode = () => MODES[settings.mode];

  // Swap worlds: Sim rebuilds physics and a fresh car at the spawn, the renderer its visuals.
  const setWorld = (world) => {
    sim.setWorld(world); sim.car.autoShift = settings.gearbox === 'auto';
    view.setCar(sim.car);
    document.body.classList.toggle('onTrack', world.kind !== 'pad');
    showSeed();
    return view.setWorld(world);
  };
  const setCar = (id) => { sim.setCar(id); sim.car.autoShift = settings.gearbox === 'auto'; view.setCar(sim.car); };

  const toast = document.getElementById('toast'), seedChip = document.getElementById('seedChip');
  const say = (text, ms) => { toast.textContent = text; toast.hidden = false; if (ms) setTimeout(() => { toast.hidden = true; }, ms); };
  function showSeed() {
    const t = sim.world.track;
    seedChip.hidden = !t;
    if (t) seedChip.textContent = `${t.kind === 'loop' ? 'Loop' : 'Stage'} · ${t.seed} · ${lengthText(t.layout.length)}`;
  }

  // Build the track the settings ask for, unless it's the one already built. Resolves true when
  // the world holds it. A failed seed says so and leaves the current world in place.
  let builtKey = null, loadSeq = 0;
  const loadTrack = async () => {
    const opts = { kind: mode().kind ?? settings.world, theme: settings.theme, density: settings.density, style: settings.style };
    const key = JSON.stringify([settings.seed, opts]);
    if (key === builtKey && sim.world.kind === 'track') return true;
    const seq = ++loadSeq;
    game.loading();
    say('Building the track…');
    await new Promise(requestAnimationFrame); // let the toast paint before the heavy lifting
    if (seq !== loadSeq) return false;         // a newer request took over
    try {
      const track = generateTrack(settings.seed, opts);
      await setWorld(new TrackWorld(track));
      builtKey = key; toast.hidden = true;
      return true;
    } catch (err) {
      console.error(err);
      say(`Couldn't build that track (${err.message}). Try another seed.`, 5000);
      return false;
    }
  };

  // Screens (spec tracks T-20, T-26).
  const sheet = document.getElementById('sheet');
  const updateBest = () => {
    const m = mode();
    if (!m.clock || !sim.world.track) { menus.setBest(null); return; }
    const b = bests.get(bestKey(m.id, sim.world.track, settings.car));
    menus.setBest({ label: m.laps ? 'Best lap' : 'Best', time: b ? (m.laps ? b.lap : b.time) : null });
  };
  const toTitle = async () => {
    menus.setScreen('title'); menus.reflect(); ghud.reset();
    view.orbit = true; sheet.hidden = true;
    const seq = loadSeq;
    await loadTrack();
    if (seq + 1 < loadSeq) return; // superseded by a newer change
    game.setMode(mode(), settings.car);
    game.title();
    updateBest();
  };
  const play = () => {
    menus.setScreen('play'); ghud.reset();
    view.orbit = false; sheet.hidden = true;
    document.activeElement?.blur?.();
  };
  const drive = async () => {
    if (game.state !== 'title') return;
    play();
    game.setMode(mode(), settings.car);
    game.begin();
  };
  const restart = () => { menus.hidePause(); menus.hideResults(); ghud.reset(); sheet.hidden = true; game.restart(); };
  const pause = () => {
    if (!DRIVING.has(game.state)) return;
    game.pause(); menus.showPause(game);
  };
  const resume = () => {
    menus.hidePause(); sheet.hidden = true;
    game.resume(); last = performance.now();
    document.activeElement?.blur?.();
  };
  const menus = new Menus(settings, {
    change(k, v) {
      if (String(settings[k]) === v) return;
      settings[k] = v; save();
      if (k === 'car') setCar(v);
      toTitle();
    },
    seed(text) { settings.seed = text.trim() || randomSeed(); save(); toTitle(); },
    drive, resume, restart, quit: toTitle,
    settings: () => { sheet.hidden = false; },
    retry: restart,
    async newSeed() {
      settings.seed = randomSeed(); save();
      menus.hideResults(); ghud.reset();
      if (await loadTrack()) { game.setMode(mode(), settings.car); game.begin(); }
    },
  });
  game.on((e) => {
    ghud.event(e);
    if (e.type === 'finish') setTimeout(() => { if (game.state === 'finished') menus.showResults(game.result); }, 1500);
  });

  // Settings sheet: the driving options.
  const reflect = () => {
    for (const el of sheet.querySelectorAll('[data-set]')) {
      const [k, v] = el.dataset.set.split(':');
      el.setAttribute('aria-pressed', String(String(settings[k]) === v));
    }
    document.body.classList.toggle('manual', settings.gearbox === 'manual');
  };
  sheet.addEventListener('click', (e) => {
    const el = e.target.closest('[data-set]'); if (!el) return;
    const [k, v] = el.dataset.set.split(':');
    if (k === 'surface') { settings.surface = v; sim.setSurface(v); view.setSurface(v); }
    if (k === 'assist') { settings.assist = v === 'true'; sim.setAssist(settings.assist); }
    if (k === 'gearbox') settings.gearbox = v;
    if (k === 'units') { settings.units = v; hud.setUnits(v); showSeed(); }
    sim.car.autoShift = settings.gearbox === 'auto';
    save(); reflect();
  });
  document.getElementById('menuBtn').addEventListener('click', () => { sheet.hidden = !sheet.hidden; });
  document.getElementById('closeSheet').addEventListener('click', () => { sheet.hidden = true; });
  document.getElementById('pauseBtn').addEventListener('click', pause);
  const act = (ev) => controls.events.push(ev);
  // Reset: tap = back onto the road (on a track), hold = restart.
  const resetBtn = document.getElementById('resetBtn');
  let holdTimer = 0, held = false;
  resetBtn.addEventListener('pointerdown', () => { held = false; holdTimer = setTimeout(() => { held = true; act('resetAll'); }, 600); });
  resetBtn.addEventListener('pointerup', () => clearTimeout(holdTimer));
  resetBtn.addEventListener('pointerleave', () => clearTimeout(holdTimer));
  resetBtn.addEventListener('click', () => { if (!held) act('reset'); });
  document.getElementById('camBtn').addEventListener('click', () => act('camera'));
  document.getElementById('dbgBtn').addEventListener('click', () => act('debug'));
  document.getElementById('upBtn').addEventListener('pointerdown', () => act('shiftUp'));
  document.getElementById('dnBtn').addEventListener('pointerdown', () => act('shiftDown'));
  // Leaving the page mid-run pauses it (iOS app switch, tab change).
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && game.timed) pause(); });
  reflect();

  const resize = () => view.resize(innerWidth, innerHeight);
  addEventListener('resize', resize); resize();

  let debugPaused = false, acc = 0, last = performance.now();
  const handleEvents = () => {
    for (const ev of controls.events.splice(0)) {
      if (ev === 'pause') {
        if (!sheet.hidden) sheet.hidden = true;
        else if (game.state === 'paused') resume();
        else pause();
        continue;
      }
      if (ev === 'confirm') {
        if (!sheet.hidden) continue;
        if (game.state === 'title') drive();
        else if (!menus.resultsCard.hidden) restart();
        continue;
      }
      if (ev === 'camera') view.camMode = (view.camMode + 1) % 3;
      if (ev === 'debug') hud.debug.hidden = !hud.debug.hidden;
      if (game.state !== 'running' && game.state !== 'finished') continue; // menus, countdown: no resets or shifts
      if (ev === 'resetAll') { if (sim.world.track) restart(); else sim.resetCar(); }
      else if (ev === 'reset') {
        if (!sim.world.recover) sim.resetCar();
        else { const p = sim.car.body.translation(), r = sim.world.recover(p.x, p.z); sim.car.reset(r, r.yaw); }
      }
      if (ev === 'shiftUp' || ev === 'shiftDown') {
        if (settings.gearbox === 'auto') { settings.gearbox = 'manual'; sim.car.autoShift = false; save(); reflect(); }
        shift(sim.car.dt, ev === 'shiftUp' ? 1 : -1);
      }
    }
  };
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const inp = controls.update(dt);
    // The driver drives from Ready on (revving on the line); menus get no input; after a stage
    // finish the game drives.
    if (DRIVING.has(game.state)) Object.assign(sim.car.input, inp);
    else if (game.state !== 'finished') Object.assign(sim.car.input, NO_INPUT);
    handleEvents();
    if (!debugPaused && game.state !== 'paused') {
      acc += dt;
      let n = 0;
      while (acc >= DT && n < 12) { game.step(); sim.step(); acc -= DT; n++; }
      if (n === 12) acc = 0; // drop time rather than spiral on a slow device
    }
    view.sync(sim); view.updateCamera(sim, dt); hud.update(sim.car); ghud.update(game); view.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const params = new URLSearchParams(location.search);
  if (padMode) {
    document.body.classList.remove('onTrack'); showSeed();
    play(); game.setMode(MODES.freeDrive, settings.car); game.begin();
  } else await toTitle();
  document.getElementById('loading').remove();

  // Debug hooks (console / Playwright / ?debug=<screen>&mode=stage on a phone): jump straight to
  // any state or screen and fire HUD events without driving there.
  const runTo = (pred, maxSteps = 4000) => { // step the game + physics until pred() (≤ ~17 s of sim)
    for (let i = 0; i < maxSteps && !pred(); i++) { if (DRIVING.has(game.state)) Object.assign(sim.car.input, NO_INPUT); game.step(); sim.step(); }
    return pred();
  };
  const startRun = async () => { if (game.state === 'title' || game.state === 'loading') { await toTitle(); await drive(); } };
  const coursePose = (p) => {
    const t = sim.world.track, pt = pointAt(t.layout, t.roadside.gates[0].s + p);
    return { x: pt.x, y: pt.road(t.terrain.road) + 0.6, z: pt.z, yaw: pt.yaw, s: pt.s };
  };
  const debug = {
    // name: title | loading | ready | countdown | running | paused | results | settings
    // opts: { mode, n (countdown light 3..1), time, best, splits } — mode switches first via the title.
    async screen(name, opts = {}) {
      if (opts.mode && opts.mode !== settings.mode) { settings.mode = opts.mode; await toTitle(); }
      menus.hidePause(); menus.hideResults(); sheet.hidden = true;
      switch (name) {
        case 'title': await toTitle(); break;
        case 'loading': await toTitle(); game.loading(); say('Building the track…'); break;
        case 'settings': sheet.hidden = false; break;
        case 'ready': await toTitle(); await drive(); break;
        case 'countdown': await toTitle(); await drive(); runTo(() => game.state === 'countdown' && game.countN === (opts.n ?? 3)); break;
        case 'running': await startRun(); runTo(() => game.state === 'running'); break;
        case 'paused': await startRun(); runTo(() => game.state === 'running'); pause(); break;
        case 'results': await startRun(); runTo(() => game.state === 'running'); debug.finish(opts); menus.showResults(game.result); break;
        default: throw new Error(`unknown screen ${name}`);
      }
      return game.state;
    },
    // Stage finish now: time (s), best (previous best time or null), splits (s) default to fakes.
    finish({ time = 163.42, best = 165, splits } = {}) {
      const n = game.progress?.cps.length ?? 3;
      game.time = time;
      game.splits = splits ?? Array.from({ length: n }, (_, i) => (time * (i + 1)) / (n + 1));
      game.best = best === null ? null : { time: best, splits: game.splits.map((t, i) => t + (i % 2 ? 0.4 : -0.3)) };
      game.handle({ type: 'finish' });
    },
    split(index = 0, delta = -0.42) { game.emit({ type: 'split', index, of: game.progress?.cps.length ?? 10, time: 30 * (index + 1), delta }); },
    lap(valid = true) { game.handle({ type: 'line', valid }); },
    missed(index = 1) { game.handle({ type: 'missed', index }); },
    blocked(index = 1) { game.handle({ type: 'blocked', index }); },
    count(n = 3) { ghud.event({ type: 'count', n }); },
    // Put the car at course position p (m from the start line), facing along the road, stopped;
    // progress follows without crediting anything in between.
    teleport(p) {
      const pose = coursePose(p);
      sim.car.reset(pose, pose.yaw);
      if (game.progress) { game.progress.p = p + game.progress.base; game.progress.s = pose.s; }
      return pose;
    },
    // Stage: every checkpoint credited, the car d m before the finish. Time attack: d m before the
    // line with the lap's checkpoints credited.
    nearFinish(d = 40) {
      const P = game.progress; if (!P) return null;
      P.started = true; P.next = P.cps.length;
      if (game.mode.clock === 'line') game.clockOn = true;
      return debug.teleport(P.lapLength - d);
    },
    state: () => ({ state: game.state, mode: game.mode.id, time: game.time, lapTime: game.lapTime, laps: game.laps.length,
      p: game.progress?.p, next: game.progress?.next, missed: game.progress?.missed }),
  };

  // Debug hook for Playwright.
  window.rally = {
    sim, view, controls, CARS, setWorld, settings, game, menus, MODES, debug,
    drive, toTitle, pause, resume, restart,
    // Change settings and go to the title with that track, e.g.
    // rally.loadTrack({ mode: 'stage', seed: 'abc', theme: 'winter' }) or ({ mode: 'freeDrive', world: 'loop' }).
    loadTrack(opts) { Object.assign(settings, opts); if (opts.car) setCar(opts.car); return toTitle(); },
    debugPause() { debugPaused = true; }, debugResume() { debugPaused = false; last = performance.now(); },
    stepN(n) { for (let i = 0; i < n; i++) { if (DRIVING.has(game.state)) Object.assign(sim.car.input, controls.out); game.step(); sim.step(); } },
    render() { view.sync(sim); view.updateCamera(sim, 1 / 60); hud.update(sim.car); ghud.update(game); view.render(); },
    state() { return { ...sim.car.telemetry(), game: game.state, time: game.time, lapTime: game.lapTime }; },
  };
  installEngineHook({
    stepN: window.rally.stepN, render: window.rally.render, state: () => window.rally.state(),
    debug: { get rally() { return window.rally; } },
  }, { game: 'rally' });
  if (params.get('debug')) debug.screen(params.get('debug'), { mode: params.get('mode') || undefined, n: Number(params.get('n')) || undefined });
}
start();
