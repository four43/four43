// Rally's browser entry (lion-hawk 2c-rally R5, R8):
// Rapier first (#6), then boot the sim half with the view half and the devices. Settings and bests live in
// localStorage here, never in the sim half (#24).
import R from '@dimforge/rapier3d-compat';
import { boot } from 'lion-hawk/view';
import { rallyGame } from './game.sim.js';
import { rallyView } from './game.view.js';
import { devices } from './devices.js';
import { makeBests, memoryStore } from './game/bests.js';
import { normalizeSettings } from './game/settings.js';

const SAVE_KEY = 'rally-sim-settings';
const storage = (() => { try { return globalThis.localStorage ?? null; } catch { return null; } })(); // blocked storage throws on access
const load = () => { try { return JSON.parse(storage?.getItem(SAVE_KEY)) || {}; } catch { return {}; } };
const save = s => { try { storage?.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };

async function start() {
  await R.init();
  const q = new URLSearchParams(location.search);
  // #35: a random engine seed so first visits get different tracks; ?seed= and ?lh-test still win inside boot.
  const { engine } = boot(rallyGame({ bests: makeBests(storage ?? memoryStore()) }), rallyView({ save }), {
    args: { settings: normalizeSettings(load()), pad: q.has('pad') },
    seed: (Math.random() * 2 ** 32) >>> 0,
    devices: devices(document),
  });
  document.getElementById('loading')?.remove();
  const debug = () => engine.game.debug(engine);
  // ?debug=<screen>&mode=&n= on a phone: jump straight to a screen (the stage presets).
  if (q.get('debug')) debug().screen(q.get('debug'), { mode: q.get('mode') || undefined, n: Number(q.get('n')) || undefined });
}
start();
