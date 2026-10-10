import R from '@dimforge/rapier3d-compat';
import { Sim, DT } from './sim.js';
import { shift } from './drivetrain.js';
import { Renderer } from './render.js';
import { Controls, Hud } from './ui.js';
import { CARS } from './cars.js';
import { PadWorld } from './world/padWorld.js';
import { TrackWorld } from './world/trackWorld.js';
import { generateTrack } from './gen/track.js';

const SAVE_KEY = 'rally-sim-settings';
const SETTINGS_V = 3;
const randomSeed = () => Math.random().toString(36).slice(2, 7);
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { /* storage unavailable */ }
  if ((s.v || 1) < 2) delete s.assist; // round 2 made Sim the default (spec R2-1)
  return s;
}
function saveSettings(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

async function start() {
  await R.init();
  const root = document.body;
  const settings = { car: 'awd', surface: 'gravel', assist: false, gearbox: 'auto', world: 'pad', seed: randomSeed(),
    theme: 'summer', density: 'mild', style: 'twisty', units: 'mph', ...loadSettings(), v: SETTINGS_V };
  const lengthText = (m) => settings.units === 'mph' ? `${(m / 1609.344).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`;
  const sim = new Sim(R, { car: settings.car, surface: settings.surface, assist: settings.assist });
  sim.car.autoShift = settings.gearbox === 'auto';
  const view = new Renderer(document.getElementById('view'));
  view.setWorld(sim.world); view.setSurface(settings.surface); view.setCar(sim.car);
  const controls = new Controls(root), hud = new Hud(root);
  hud.setUnits(settings.units);
  // Swap worlds: Sim rebuilds physics and a fresh car at the spawn, the renderer its visuals.
  const setWorld = (world) => {
    sim.setWorld(world); sim.car.autoShift = settings.gearbox === 'auto';
    view.setCar(sim.car);
    return view.setWorld(world);
  };
  // Build the world the settings ask for: the test pad, or a track generated from the seed.
  const toast = document.getElementById('toast'), seedChip = document.getElementById('seedChip');
  let chipTrack = null;
  const showSeed = () => {
    if (chipTrack) seedChip.textContent = `${settings.world === 'loop' ? 'Loop' : 'Stage'} · ${settings.seed} · ${lengthText(chipTrack.layout.length)}`;
  };
  const loadWorld = async () => {
    const onTrack = settings.world !== 'pad';
    document.body.classList.toggle('onTrack', onTrack);
    seedChip.hidden = !onTrack;
    if (!onTrack) { await setWorld(new PadWorld({ surface: settings.surface })); view.setSurface(settings.surface); return; }
    toast.textContent = 'Building the track…'; toast.hidden = false;
    await new Promise(requestAnimationFrame); // let the toast paint before the heavy lifting
    try {
      const track = generateTrack(settings.seed, { kind: settings.world, theme: settings.theme, density: settings.density, style: settings.style });
      await setWorld(new TrackWorld(track));
      chipTrack = track; showSeed();
      toast.hidden = true;
    } catch (err) {
      // A seed the generator can't build shouldn't strand the game: say so and drop to the pad.
      console.error(err);
      settings.world = 'pad'; saveSettings(settings); reflect();
      await loadWorld();
      toast.textContent = `Couldn't build that track (${err.message}). Back on the test pad.`; toast.hidden = false;
      setTimeout(() => { toast.hidden = true; }, 5000);
    }
  };

  // Settings sheet: segmented choices.
  const sheet = document.getElementById('sheet');
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
    if (k === 'car' && v !== settings.car) { settings.car = v; sim.setCar(v); view.setCar(sim.car); }
    if (k === 'surface') { settings.surface = v; sim.setSurface(v); view.setSurface(v); }
    if (k === 'assist') { settings.assist = v === 'true'; sim.setAssist(settings.assist); }
    if (k === 'gearbox') settings.gearbox = v;
    if (k === 'units') { settings.units = v; hud.setUnits(v); showSeed(); }
    sim.car.autoShift = settings.gearbox === 'auto';
    const regen = ['world', 'theme', 'density', 'style'].includes(k) && settings[k] !== v;
    if (regen) settings[k] = v;
    saveSettings(settings); reflect();
    if (regen) loadWorld();
  });
  const seedInput = document.getElementById('seedInput');
  seedInput.value = settings.seed;
  document.getElementById('diceBtn').addEventListener('click', () => { seedInput.value = randomSeed(); });
  document.getElementById('seedForm').addEventListener('submit', (e) => {
    e.preventDefault();
    settings.seed = seedInput.value.trim() || randomSeed(); seedInput.value = settings.seed;
    saveSettings(settings); loadWorld(); seedInput.blur();
  });
  document.getElementById('menuBtn').addEventListener('click', () => { sheet.hidden = !sheet.hidden; });
  document.getElementById('closeSheet').addEventListener('click', () => { sheet.hidden = true; });
  const act = (ev) => controls.events.push(ev);
  // Reset: tap = back onto the road (on a track), hold = restart the whole track.
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
  reflect();

  const resize = () => view.resize(innerWidth, innerHeight);
  addEventListener('resize', resize); resize();

  let paused = false, acc = 0, last = performance.now();
  const handleEvents = () => {
    for (const ev of controls.events.splice(0)) {
      if (ev === 'resetAll' || (ev === 'reset' && !sim.world.recover)) sim.resetCar();
      else if (ev === 'reset') { const p = sim.car.body.translation(), r = sim.world.recover(p.x, p.z); sim.car.reset(r, r.yaw); }
      if (ev === 'camera') view.camMode = (view.camMode + 1) % 3;
      if (ev === 'debug') { hud.debug.hidden = !hud.debug.hidden; }
      if (ev === 'shiftUp' || ev === 'shiftDown') {
        if (settings.gearbox === 'auto') { settings.gearbox = 'manual'; sim.car.autoShift = false; saveSettings(settings); reflect(); }
        shift(sim.car.dt, ev === 'shiftUp' ? 1 : -1);
      }
    }
  };
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const inp = controls.update(dt);
    Object.assign(sim.car.input, inp);
    handleEvents();
    if (!paused) {
      acc += dt;
      let n = 0;
      while (acc >= DT && n < 12) { sim.step(); acc -= DT; n++; }
      if (n === 12) acc = 0; // drop time rather than spiral on a slow device
    }
    view.sync(sim); view.updateCamera(sim, dt); hud.update(sim.car); view.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  if (settings.world !== 'pad') await loadWorld();
  else document.body.classList.remove('onTrack');
  document.getElementById('loading').remove();

  // Debug hook for Playwright.
  window.rally = {
    sim, view, controls, CARS, setWorld, settings,
    // Load a world by settings, e.g. rally.loadTrack({ world: 'stage', seed: 'abc', theme: 'winter' }).
    loadTrack(opts) { Object.assign(settings, opts); seedInput.value = settings.seed; reflect(); return loadWorld(); },
    pause() { paused = true; }, resume() { paused = false; last = performance.now(); },
    stepN(n) { for (let i = 0; i < n; i++) { Object.assign(sim.car.input, controls.out); sim.step(); } },
    render() { view.sync(sim); view.updateCamera(sim, 1 / 60); hud.update(sim.car); view.render(); },
    state() { return sim.car.telemetry(); },
  };
}
start();
