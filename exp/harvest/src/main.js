// Harvest's browser entry: Rapier first, then boot the sim half with the view half and the devices. The farm's records (coins,
// levels, open fields) load from localStorage into the scene args and are saved back on each `progress` event. ?coins=N starts with
// N coins (debug); ?tune opens the tuning sliders (they go through the sim's `tune` command).
import { boot } from 'lion-hawk/view';
import { harvestGame, initPhysics } from './game.sim.js';
import { harvestView } from './game.view.js';
import { devices } from './devices.js';
import { rig } from './view/rig.js';
import { TUNE, TUNE_RANGE } from './defs/econ.js';

const KEY = 'harvest-progress';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch (e) { console.warn('saved farm ignored', e); return null; } };
const save = p => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { console.warn('farm not saved', e); } };

function tunePanel(doc, engine) {
  const box = doc.createElement('div'); box.id = 'tune';
  for (const [key, [lo, hi]] of Object.entries(TUNE_RANGE)) {
    const label = doc.createElement('label'), input = doc.createElement('input'), out = doc.createElement('output');
    input.type = 'range'; input.min = lo; input.max = hi; input.step = (hi - lo) / 100; input.value = TUNE[key]; out.value = TUNE[key];
    input.addEventListener('input', () => engine.command('tune', { key, value: +input.value }));
    label.append(key, input, out); box.appendChild(label);
  }
  engine.events.on(e => { if (e.type === 'tune') { const i = [...box.querySelectorAll('label')].find(l => l.firstChild.textContent === e.key); if (i) i.querySelector('output').value = e.value.toFixed(2); } });
  doc.body.appendChild(box);
}

async function start() {
  await initPhysics();
  const q = new URLSearchParams(location.search);
  const coins = q.has('coins') ? Number(q.get('coins')) : undefined;
  const { engine } = boot(harvestGame(), harvestView(), {
    canvas: document.getElementById('c'), seed: 1, scene: 'farm',
    args: { progress: load(), ...(Number.isFinite(coins) ? { coins } : {}) },
    devices: devices(document, { rig }),
  });
  const failed = window.engine?.errors?.[0]; if (failed) throw new Error(failed.message); // the view could not start (WebGL)
  engine.events.on(e => { if (e.type === 'progress') save(e.progress); });
  if (q.has('tune')) tunePanel(document, engine);
  // a swipe from the left edge or a stray back press must not leave the game
  history.pushState({ hv: 1 }, '', location.href); addEventListener('popstate', () => history.pushState({ hv: 1 }, '', location.href));
  document.getElementById('loading')?.remove();
}
start().catch(err => { const l = document.getElementById('loading'); if (l) l.textContent = 'Could not start: ' + err.message; console.error('Harvest could not start', err); });
