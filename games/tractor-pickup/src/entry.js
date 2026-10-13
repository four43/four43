// Tractor Pickup's engine browser entry (lion-hawk 2g G1; built only for tests until G7 makes it src/main.js): Rapier first (#6),
// then boot the sim half with the view half and the devices. The stored records are the farm's args (#84). #35: a random
// engine seed per visit; ?seed= and ?lh-test win inside boot.
import R from '@dimforge/rapier3d-compat';
import { boot } from 'lion-hawk/view';
import { tractorGame } from './game.sim.js';
import { tractorView } from './game.view.js';
import { devices } from './devices.js';
import { rig } from './view/rig.js';
import { hudMarkup } from './view/hud.js';
import { load } from './ui/store.js';
import { TYPES } from './sim/herd.js';
import { DEFAULT_SETTINGS, seedParam, powerParam, clampSettings, clampProgress, emptyProgress } from './sim/progress.js';
import { clampBedtime } from './sim/bedtime.js';

// X-15: no storage content may stop the game starting (main.js's safe)
const safe = (fn, fallback) => { try { return fn(); } catch (e) { console.warn('saved data ignored', e); return fallback(); } };

async function start() {
  await R.init();
  const q = new URLSearchParams(location.search), sandbox = q.has('sandbox');
  const settings = safe(() => clampSettings(load('tp-settings', DEFAULT_SETTINGS)), () => clampSettings({})), progress = safe(() => clampProgress(load('tp-progress', null), Object.keys(TYPES)), emptyProgress);
  const bed = safe(() => clampBedtime(load('tp-bedtime', null)), () => clampBedtime(null));
  if (!sandbox) hudMarkup(document); // the drive buttons, the gear and the red X: game markup, adopted at boot's first UI sync
  const { engine } = boot(tractorGame(), tractorView({ tune: q.has('tune'), fps: q.has('fps'), sandbox }), {
    seed: (Math.random() * 2 ** 32) >>> 0, scene: sandbox ? 'sandbox' : 'farm',
    args: { seed: seedParam(q.get('seed')) ?? undefined, power: powerParam(q.get('power'), settings.power), progress, settings, bed },
    devices: devices(document, { rig }),
  });
  const failed = window.engine?.errors?.[0]; if (failed) throw new Error(failed.message); // the view half could not start (WebGL)
  // F-11, A-7: with no start screen the first touch or key starts the trip (the farm also starts on the first stick move)
  const first = () => { removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); if (engine.scene.state?.game?.mode === 'drive') engine.command('play', {}); };
  if (!sandbox) { addEventListener('pointerdown', first, true); addEventListener('keydown', first, true); }
}
start().catch(err => console.error('Tractor Pickup could not start', err));
