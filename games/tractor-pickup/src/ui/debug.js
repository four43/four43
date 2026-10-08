// Debug tools (D-5): the ?tune panel (feel constants as sliders) and the ?fps meter (X-4 stutter hunting).
import { POWER, TP } from '../sim/tractor.js';
import { TR } from '../sim/hitch.js';
import { TREE } from '../sim/trees.js';
import { CAM } from '../render/camera.js';
import { PILOT } from '../sim/pilot.js';

export function buildTunePanel(game) {
  const el = document.createElement('div'); el.id = 'tune'; document.body.appendChild(el);
  const head = document.createElement('button'); head.textContent = 'tune'; head.id = 'tuneToggle'; el.appendChild(head);
  const body = document.createElement('div'); body.hidden = true; el.appendChild(body);
  head.onclick = () => { body.hidden = !body.hidden; };
  const t = game.tractor, rows = [
    ['vmax', () => t.P.vmax, v => t.P.vmax = v, 3, 15, 0.5], ['force', () => t.P.force, v => t.P.force = v, 2000, 15000, 100],
    ['rearSide', () => t.P.rearSide, v => t.P.rearSide = v, 0.2, 1.2, 0.01], ['slideMax', () => t.P.slideMax, v => t.P.slideMax = v, 0.2, 1.2, 0.01],
    ['loose', () => t.P.loose, v => t.P.loose = v, 0, 0.3, 0.005],
    ['cam dist', () => CAM.D, v => CAM.D = v, 4, 20, 0.5], ['cam height', () => CAM.H, v => CAM.H = v, 4, 22, 0.5], ['cam ahead', () => CAM.AHEAD, v => CAM.AHEAD = v, 2, 24, 0.5],
    ['reverse cone deg', () => PILOT.revCone * 180 / Math.PI, v => PILOT.revCone = v * Math.PI / 180, 0, 80, 1],
    ['full speed err deg', () => PILOT.fullErr * 180 / Math.PI, v => PILOT.fullErr = v * Math.PI / 180, 5, 80, 1], ['crawl err deg', () => PILOT.crawlErr * 180 / Math.PI, v => PILOT.crawlErr = v * Math.PI / 180, 30, 180, 1],
    ['crawl', () => PILOT.crawl, v => PILOT.crawl = v, 0, 1, 0.05], ['pilot gain', () => PILOT.gain, v => PILOT.gain = v, 0.5, 6, 0.1], ['reverse force', () => TP.revForce, v => TP.revForce = v, 2000, 15000, 100], ['turn help', () => TP.turnHelp, v => TP.turnHelp = v, 0, 12, 0.5], ['help below m/s', () => PILOT.helpSpeed, v => PILOT.helpSpeed = v, 0, 8, 0.5],
    ['slip', () => TP.slip, v => TP.slip = v, 0.5, 6, 0.1], ['steerMax', () => TP.steerMax, v => TP.steerMax = v, 0.3, 0.9, 0.01],
    ['tree break speed', () => TREE.breakSpeed, v => TREE.breakSpeed = v, 1, 10, 0.5],
    ['stiffness (reload)', () => TP.stiffness, v => TP.stiffness = v, 8, 40, 1], ['trailer limitBeta', () => TR.limitBeta, v => TR.limitBeta = v, 0.1, 2, 0.05],
  ];
  for (const [name, get, set, min, max, step] of rows) {
    const l = document.createElement('label'); l.innerHTML = `<span>${name}</span><input type=range min=${min} max=${max} step=${step} value=${get()}><output>${get()}</output>`;
    const i = l.querySelector('input'), o = l.querySelector('output');
    i.oninput = () => { set(+i.value); o.textContent = i.value; console.log('tune', JSON.stringify({ P: t.P, TP: { slip: TP.slip, steerMax: TP.steerMax, stiffness: TP.stiffness }, limitBeta: TR.limitBeta })); };
    body.appendChild(l);
  }
  const sel = document.createElement('select'); sel.innerHTML = Object.keys(POWER).map(k => `<option ${k === t.power ? 'selected' : ''}>${k}</option>`).join('');
  sel.onchange = () => t.setPower(sel.value); body.appendChild(sel);
  if (game.trees) { const r = document.createElement('button'); r.textContent = 'reset props and trees'; r.onclick = () => { game.yardProps.reset(); game.trees.reset(); }; body.appendChild(r); }
}

// ?fps: a small corner readout of frames per second (now, and the lowest over the last 5 s), draw calls and triangles
export function createFpsMeter(renderer) {
  const el = Object.assign(document.createElement('div'), { id: 'fps' });
  el.style.cssText = 'position:fixed;right:6px;top:6px;z-index:99;font:12px/1.3 monospace;color:#fff;background:rgba(0,0,0,.55);padding:3px 6px;border-radius:4px;pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  // X-4: every frame longer than 50 ms is logged with what took the time: the sim steps and their events, the render call, the distance
  // from the barn. Both small on a long frame: the time went outside the game (GC, the GPU, the browser).
  const win = [], hitches = [], evs = new Set(); let shown = 0, clock = 0;
  return {
    event(type) { evs.add(type); },
    tick(dt, gap, simMs, renderMs, dist) {
      clock += dt; win.push(dt); if (win.length > 300) win.shift();
      if (gap > 50) { hitches.push(`${clock.toFixed(1)}s ${gap.toFixed(0)}ms sim ${simMs.toFixed(1)} draw ${renderMs.toFixed(1)} ${dist.toFixed(0)}m ${[...evs].join(',')}`); if (hitches.length > 6) hitches.shift(); console.log('hitch', hitches.at(-1)); }
      evs.clear();
      if ((shown += dt) < 0.5) return; shown = 0;
      const avg = win.reduce((a, b) => a + b, 0) / win.length, worst = Math.max(...win), i = renderer.info.render;
      el.textContent = `${(1 / dt).toFixed(0)} fps (avg ${(1 / avg).toFixed(0)}, min ${(1 / worst).toFixed(0)})\n${i.calls} draws, ${(i.triangles / 1000).toFixed(0)}k tris` + (hitches.length ? '\nlong frames:\n' + hitches.join('\n') : '');
    },
  };
}
