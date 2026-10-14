// Pig Pens' engine browser entry (lion-hawk 2e P6; phase 3k): Rapier first (#6), then boot the sim half with the view half
// and the devices. boot's seed 1 is today's default farm; ?seed= and ?lh-test win inside boot (#58). ?shading picks the
// compiler tier (lambert by default, D5), ?tilt=0 turns the tilt-shift off, ?fps times the Rapier step (#106).
import { boot } from 'lion-hawk/view';
import { pigPensGame, initPhysics } from './game.sim.js';
import { pigPensView } from './game.view.js';
import { devices } from './devices.js';

const $ = id => document.getElementById(id);

async function start() {
  await initPhysics();
  const q = new URLSearchParams(location.search), canvas = $('c');
  const shading = ['physical', 'standard', 'lambert'].includes(q.get('shading')) ? q.get('shading') : 'lambert';
  boot(pigPensGame(), pigPensView({ tilt: q.get('tilt') !== '0', shading }), {
    canvas, args: { pigs: +q.get('pigs') || 48 }, seed: 1, devices: devices(document),
    timer: q.has('fps') ? () => performance.now() : undefined,
  });
  const failed = window.engine?.errors?.[0]; if (failed) throw new Error(failed.message); // the view could not start (WebGL)
}
start().catch(err => { const l = $('loading'); if (l) l.textContent = 'Could not start: ' + err.message; console.error(err); });
