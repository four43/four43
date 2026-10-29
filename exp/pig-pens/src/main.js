// Pig Pens' engine browser entry (lion-hawk 2e P6; phase 3k): Rapier first (#6), then boot the sim half with the view half
// and the devices. boot's seed 1 is today's default farm; ?seed= and ?lh-test win inside boot (#58). ?shading picks the
// compiler tier (lambert by default, D5), ?tilt=0 turns the tilt-shift off, ?fps times the Rapier step (#106),
// ?debug=dof opens the depth-of-field panel (view/dofPanel.js).
import { boot } from 'lion-hawk/view';
import { pigPensGame, initPhysics } from './game.sim.js';
import { pigPensView } from './game.view.js';
import { devices, useSeats } from './devices.js';

const $ = id => document.getElementById(id);

async function start() {
  await initPhysics();
  const q = new URLSearchParams(location.search), canvas = $('c');
  const shading = ['physical', 'standard', 'lambert'].includes(q.get('shading')) ? q.get('shading') : 'lambert';
  const { view } = boot(pigPensGame(), pigPensView({ tilt: q.get('tilt') !== '0', shading }), {
    // rounds: a number per page for the vet's rounds and who comes to say hello (sim.js), so they differ each visit;
    // ?seed= keeps them as that seed's (0), like the rest of the farm
    canvas, args: { pigs: +q.get('pigs') || 22, rounds: q.has('seed') ? 0 : (Math.random() * 2 ** 31) >>> 0 }, seed: 1, devices: devices(document),
    timer: q.has('fps') ? () => performance.now() : undefined,
  });
  useSeats(view, document); // lion-hawk C-5, C-10: keys through the 'farm' context
  // ?tune=coldChance=1,earInterval=30: the sickness values (sickness.js SICK), through the sim's `tune` command
  for (const kv of (q.get('tune') ?? '').split(',').filter(Boolean)) { const [key, value] = kv.split('='); window.engine?.command('tune', { key, value }); }
  const failed = window.engine?.errors?.[0]; if (failed) throw new Error(failed.message); // the view could not start (WebGL)
}
start().catch(err => { const l = $('loading'); if (l) l.textContent = 'Could not start: ' + err.message; console.error(err); });
