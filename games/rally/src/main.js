// Rally's browser entry (lion-hawk 2c-rally R5, R8):
// Rapier first (#6), injected where the game is defined (D9), then boot the sim half with the view half and the devices. Settings and bests live in
// localStorage here, never in the sim half (#24).
import R from '@dimforge/rapier3d-compat';
import { defineGame } from 'lion-hawk/sim';
import { boot } from 'lion-hawk/view';
import { rallySpec, rallyPhysics } from './game.sim.js';
import { rallyView } from './game.view.js';
import { devices, useSeats } from './devices.js';
import { makeBests, memoryStore } from './game/bests.js';
import { normalizeSettings } from './game/settings.js';
import { createRumble } from './rumble/index.js';
import { tuneParams } from './defs/rumble.js';

const SAVE_KEY = 'rally-sim-settings';
const TUNE_KEY = 'rally-rumble-tune'; // the ?rumble panel's params (rally-spec R9-5)
const storage = (() => { try { return globalThis.localStorage ?? null; } catch { return null; } })(); // blocked storage throws on access
const load = () => { try { return JSON.parse(storage?.getItem(SAVE_KEY)) || {}; } catch { return {}; } };
const save = s => { try { storage?.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };
const rumbleTune = () => { try { return JSON.parse(storage?.getItem(TUNE_KEY)) || undefined; } catch { return undefined; } };

async function start() {
  const q = new URLSearchParams(location.search);
  await R.init();
  const rumble = createRumble(tuneParams(rumbleTune())); // the panel's saved params over the defaults, with or without ?rumble
  // #35: a random engine seed so first visits get different tracks; ?seed= and ?lh-test still win inside boot.
  const { engine, view } = boot(defineGame({ ...rallySpec({ bests: makeBests(storage ?? memoryStore()) }), physics: rallyPhysics(R) }), rallyView({ save, rumble }), {
    args: { settings: normalizeSettings(load()), pad: q.has('pad') },
    seed: (Math.random() * 2 ** 32) >>> 0,
    devices: devices(document), canvas: document.getElementById('view'),
  });
  useSeats(view, document); // lion-hawk C-5, C-10: one player; keys, every pad and touch through the 'drive' context (rally-spec R8-1)
  // ?rumble: the rumble tuning panel beside the game (rally-spec R9-5).
  if (q.has('rumble')) (await import('./rumbleTune.js')).rumbleTune(document, { rumble, storage, key: TUNE_KEY, pads: () => view.localPlayers[0]?.pads });
  const debug = () => engine.game.debug(engine);
  // ?debug=<screen>&mode=&n= on a phone: jump straight to a screen (the stage presets).
  if (q.get('debug')) debug().screen(q.get('debug'), { mode: q.get('mode') || undefined, n: Number(q.get('n')) || undefined });
}
start();
