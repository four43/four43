// Pig Pens' engine browser entry (lion-hawk 2e P6, src/main.js since P9): Rapier first (#6), then boot the sim
// half with the view half and the devices. boot's seed 1 is today's default farm; ?seed= and ?lh-test win inside boot (#58).
import R from '@dimforge/rapier3d-compat';
import { boot } from 'lion-hawk/view';
import { pigPensGame } from './game.sim.js';
import { pigPensView } from './game.view.js';
import { devices } from './devices.js';

const $ = id => document.getElementById(id);

async function start() {
  await R.init();
  const q = new URLSearchParams(location.search);
  const { engine } = boot(pigPensGame(), pigPensView({ tilt: q.get('tilt') !== '0' }), {
    args: { pigs: +q.get('pigs') || 48 }, seed: 1, devices: devices(document),
  });
  const failed = window.engine?.errors?.[0]; if (failed) throw new Error(failed.message); // the view half could not start (WebGL)
  $('loading')?.remove();
}
start().catch(err => { const l = $('loading'); if (l) l.textContent = 'Could not start: ' + err.message; console.error(err); });
