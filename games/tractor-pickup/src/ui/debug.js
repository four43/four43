// Debug tools (D-5): the ?tune panel (feel constants as sliders) and the ?fps meter (X-4 stutter hunting).
import { TUNE, TUNE_POWERS } from '../sim/tune.js';
import { CAM } from '../view/rig.js';

// The view's own rows: the chase camera (CAM) is the view's, so these sliders write it directly
const VIEW_ROWS = [['cam dist', 'distance', 4, 20, 0.5], ['cam height', 'height', 4, 22, 0.5], ['cam ahead', 'lookAhead', 2, 24, 0.5]]; // the engine chase rig's opts

// ?tune (lion-hawk 2g G4b): the sim rows (sim/tune.js) only ask: a slider calls send(id, value) and the power picker send('power',
// name); the reset button calls reset(). What a sim row shows comes back through shown(key, value) (the `tune` event: the value the
// sim wrote, after clamping) or refresh() (read(id): the table's getter). power() → the tractor's preset name for the picker; values()
// → every sim row, for the console line the values are copied out of. Returns { el, shown, refresh, enable }.
export function buildTunePanel({ doc = document, read, send, reset, power, values }) {
  const el = doc.createElement('div'); el.id = 'tune'; doc.body.appendChild(el);
  const head = doc.createElement('button'); head.textContent = 'tune'; head.id = 'tuneToggle'; el.appendChild(head);
  const body = doc.createElement('div'); body.hidden = true; el.appendChild(body);
  head.onclick = () => { body.hidden = !body.hidden; };
  const section = text => { const h = doc.createElement('h4'); h.textContent = text; h.style.margin = '8px 0 2px'; body.appendChild(h); };
  const slider = (name, id, min, max, step, value) => {
    const l = doc.createElement('label'); l.innerHTML = `<span></span><input type=range min=${min} max=${max} step=${step}><output></output>`;
    l.querySelector('span').textContent = name; const i = l.querySelector('input'), o = l.querySelector('output');
    i.dataset.tune = id; i.value = value; o.textContent = value; body.appendChild(l); return { i, o };
  };
  const show = (row, v) => { row.i.value = v; row.o.textContent = +v.toFixed(4); };
  section('sim (a tune command)');
  const rows = new Map(TUNE.map(r => {
    const row = slider(r.label, r.id, r.min, r.max, r.step, read(r.id));
    row.i.oninput = () => send(r.id, +row.i.value); // the sim writes it; shown() puts back what it wrote
    return [r.id, row];
  }));
  const sel = doc.createElement('select'); sel.innerHTML = TUNE_POWERS.map(k => `<option>${k}</option>`).join(''); sel.value = power();
  sel.onchange = () => send('power', sel.value); body.appendChild(sel);
  if (reset) { const r = doc.createElement('button'); r.textContent = 'reset props and trees'; r.onclick = reset; body.appendChild(r); }
  section('view (camera)');
  for (const [name, key, min, max, step] of VIEW_ROWS) {
    const row = slider(name, 'CAM.' + key, min, max, step, CAM[key]);
    row.i.oninput = () => { CAM[key] = +row.i.value; show(row, CAM[key]); console.log('tune', JSON.stringify({ key: 'CAM.' + key, value: CAM[key], CAM })); };
  }
  const refresh = () => { for (const [id, row] of rows) show(row, read(id)); sel.value = power(); };
  let on = true;
  return {
    el, refresh,
    shown(key, value) {
      if (key === 'power') refresh(); else if (rows.has(key)) show(rows.get(key), value); // another preset: its rows read again
      console.log('tune', JSON.stringify({ key, value, power: power(), values: values() }));
    },
    enable(yes) { if (on === yes) return; on = yes; el.hidden = !yes; if (!yes) body.hidden = true; }, // a guest cannot tune (game/commands.js)
  };
}

// ?fps: a small corner readout of frames per second (now, and the lowest over the last 5 s), draw calls and triangles.
// X-4, B-1: a long gap between two frames is caused by the frame BEFORE it (its sim and draw) or by time outside the game between them
// (GC, a GPU or compositor wait). So each hitch line shows the previous frame's work, its steps and events, new shader programs it
// compiled, whether speech was talking, Rapier's share of the sim, and `idle`: the time from the end of that frame to the start of this one.
export function createFpsMeter(renderer) {
  const el = Object.assign(document.createElement('div'), { id: 'fps' });
  el.style.cssText = 'position:fixed;right:6px;top:6px;z-index:99;font:12px/1.3 monospace;color:#fff;background:rgba(0,0,0,.55);padding:3px 6px;border-radius:4px;pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  const win = [], hitches = [], cur = { evs: new Set(), steps: 0, world: 0 }, prev = { sim: 0, draw: 0, steps: 0, world: 0, evs: '', compiled: 0, speech: false, end: 0 };
  let shown = 0, clock = 0, start = 0, longTasks = 0;
  const programs = () => renderer.info.programs?.length ?? 0;
  const log = line => { hitches.push(line); if (hitches.length > 6) hitches.shift(); console.log('hitch', line); };
  try { if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) new PerformanceObserver(l => { for (const e of l.getEntries()) { longTasks++; console.log('longtask', e.duration.toFixed(0) + 'ms'); } }).observe({ type: 'longtask' }); }
  catch (e) { console.warn('fps: no longtask observer', e); }
  return {
    begin(now) { start = now; }, // rAF time at the start of this frame
    event(type) { cur.evs.add(type); },
    step() { cur.steps++; },
    worldMs(ms) { cur.world += ms; }, // Rapier World.step time from the engine's timer hook (#106, world.stats)
    tick(dt, gap, simMs, drawMs, dist, programsBefore) {
      clock += dt; win.push(dt); if (win.length > 300) win.shift();
      if (gap > 50) log(`${clock.toFixed(1)}s gap ${gap.toFixed(0)}ms | before: sim ${prev.sim.toFixed(1)} (rapier ${prev.world.toFixed(1)}, ${prev.steps} steps) draw ${prev.draw.toFixed(1)}${prev.compiled ? ` +${prev.compiled} shaders` : ''}${prev.speech ? ' speech' : ''} [${prev.evs}] | idle ${(start - prev.end).toFixed(0)}ms${longTasks ? ` longtasks ${longTasks}` : ''} | now: ${cur.steps} steps | ${dist.toFixed(0)}m`);
      prev.sim = simMs; prev.draw = drawMs; prev.steps = cur.steps; prev.world = cur.world; prev.evs = [...cur.evs].join(','); prev.compiled = programs() - programsBefore;
      prev.speech = !!globalThis.speechSynthesis?.speaking; prev.end = performance.now();
      cur.evs.clear(); cur.steps = 0; cur.world = 0; longTasks = 0;
      if ((shown += dt) < 0.5) return; shown = 0;
      const avg = win.reduce((a, b) => a + b, 0) / win.length, worst = Math.max(...win), i = renderer.info.render;
      el.textContent = `${(1 / dt).toFixed(0)} fps (avg ${(1 / avg).toFixed(0)}, min ${(1 / worst).toFixed(0)})\n${i.calls} draws, ${(i.triangles / 1000).toFixed(0)}k tris, ${programs()} shaders` + (hitches.length ? '\nlong frames:\n' + hitches.join('\n') : '');
    },
    programs,
  };
}
