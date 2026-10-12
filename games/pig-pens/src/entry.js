// Pig Pens' engine browser entry (lion-hawk 2e P6; becomes src/main.js in P9): Rapier first (#6), then boot the sim
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
  // a thin alias for old scripts until P10 (D-5); window.engine is the hook
  window.piggies = { get engine() { return engine; }, get sim() { return engine.scene.state.sim; }, stepN: n => engine.stepN(n), render: () => engine.render(0) };
}
start().catch(err => { const l = $('loading'); if (l) l.textContent = 'Could not start: ' + err.message; console.error(err); });
