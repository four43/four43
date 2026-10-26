// The ?rumble tuning panel (rally-spec R9-5): the game runs as usual with a panel beside it. A section per channel with a few
// plain-language sliders (LAYOUT), a mute, its live levels and Reset; every other parameter under Advanced. The four outputs on
// top with the aid's state, the pad's effects and the writes. Edits go straight into the mixer's params (the channels read them every frame) and save to storage on
// change; Export gives the JSON for src/defs/rumble.js. View-only: it never touches the sim. Desktop only.
import { PARAMS, RANGES } from './defs/rumble.js';
import { CHANNELS } from './rumble/index.js';

// Class names are rt-*: the game's own stylesheet has .bar (the HUD's top bars, position: fixed).
const CSS = `
#rumbleTune { position: fixed; top: 0; right: 0; bottom: 0; width: 380px; z-index: 99999; overflow-y: auto; pointer-events: auto;
  background: rgba(20, 30, 34, 0.94); color: #e8eeec; font: 13px/1.35 system-ui, sans-serif; padding: 10px 12px; box-sizing: border-box;
  -webkit-user-select: auto; user-select: auto; touch-action: auto; }
#rumbleTune h1 { font-size: 16px; margin: 0 0 6px; } #rumbleTune h2 { font-size: 14px; margin: 0; flex: 1; }
#rumbleTune section { border-top: 1px solid #3a4a50; padding: 8px 0; }
#rumbleTune .head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
#rumbleTune .row { display: grid; grid-template-columns: 128px 1fr 64px; gap: 0 6px; align-items: center; margin-top: 4px; }
#rumbleTune .row .help { grid-column: 1 / -1; font-size: 11px; color: #a9b4b0; margin-top: -2px; }
#rumbleTune .row.adv span:first-child { font-family: monospace; font-size: 11px; color: #a9b4b0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#rumbleTune .row input { width: 100%; } #rumbleTune .row output { text-align: right; font-variant-numeric: tabular-nums; }
#rumbleTune details { margin: 4px 0 0 6px; } #rumbleTune summary { cursor: pointer; color: #a9b4b0; }
#rumbleTune .rt-meters { display: grid; grid-template-columns: 46px 1fr; gap: 2px 6px; align-items: center; margin: 4px 0; }
#rumbleTune .rt-bar { height: 8px; background: #2b3a40; border-radius: 2px; overflow: hidden; }
#rumbleTune .rt-bar > i { display: block; height: 100%; width: 0; background: #e0a43a; }
#rumbleTune .dim { color: #a9b4b0; }
#rumbleTune button { font: inherit; padding: 2px 10px; color: #e8eeec; background: #3a4a50; border: 1px solid #5a6c72; border-radius: 3px; cursor: pointer; }
#rumbleTune button:hover { background: #4a5c62; }
#rumbleTune textarea { width: 100%; height: 160px; font: 11px monospace; color: #e8eeec; background: #142024; border: 1px solid #3a4a50; }
`;
const MOTORS = ['strong', 'weak', 'left']; // the right trigger is unused (rally-spec R9-1)

// The plain sliders per channel: [path in the channel's params, label, help, invert]. invert: the slider's right end is
// the parameter's low end, so right is always "more" of what the label says. Everything else is under Advanced.
const LAYOUT = {
  engine: { title: 'Engine', simple: [
    ['idle', 'Idle hum', 'how much you feel the engine at rest'],
    ['redline', 'Revving hum', 'how much it builds toward the redline'],
    ['limiterAmp', 'Rev limiter', 'buzz when you hit the limiter'],
  ] },
  suspension: { title: 'Road', simple: [
    ['gain', 'Road texture', 'overall strength of the surface bumps'],
    ['hz', 'Smooth at speed', 'right: bumps fade out sooner as you go faster', true],
    ['joltFull', 'Big hits', 'landings and potholes: right hits harder', true],
    ['joltOn', 'Big hit threshold', 'how big a bump must be to count as a hit'],
  ], surfaces: 'rough' },
  body: { title: 'Impacts', simple: [
    ['dvFull', 'Impact strength', 'right: collisions reach full strength sooner', true],
    ['dvOn', 'Ignore light taps', 'the smallest knock that is felt'],
    ['decay', 'Impact length', 'how long a hit rumbles'],
  ] },
  aid: { title: 'Brake aid (left trigger)', simple: [
    ['pedal', 'Pedal needed', 'how far you press before the aid listens'],
    ['brake.near', 'Brake: warning at', 'how close to locking the warning starts (1 = the limit)'],
    ['brake.nearAmp', 'Brake: warning', 'strength of the warning before a lock'],
    ['brake.amp', 'Brake: ABS pulses', 'strength of the pulses once a wheel locks'],
    ['brake.pulseHz', 'Brake: ABS speed', 'pulses per second'],
  ] },
};
const SURFACE_HELP = 'bump height on this surface';
// How a value reads: [suffix, scale]; by the parameter's own name
const UNIT = { hz: ['Hz'], splitHz: ['Hz'], limiterHz: ['Hz'], pulseHz: ['Hz'], decay: ['s'], kickLen: ['s'], release: ['s'],
  dvOn: ['m/s'], dvFull: ['m/s'], joltOn: ['m/s'], joltFull: ['m/s'], rough: ['mm', 1000], full: ['mm', 1000], spacing: ['m'], width: ['m'],
  minMs: ['ms'], keepMs: ['ms'], durMs: ['ms'] };
const get = (o, path) => path.split('.').reduce((x, k) => x[k], o);
// every leaf path of a params object
const leaves = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? leaves(v, `${pre}${k}.`) : [`${pre}${k}`]));

// rumble: the mixer (src/rumble/index.js); storage/key: where the params save; pads(): seat 0's live pads
export function rumbleTune(doc, { rumble, storage, key, pads = () => [] }) {
  const P = rumble.params;
  const el = (tag, props = {}, kids = []) => { const e = Object.assign(doc.createElement(tag), props); for (const k of kids) e.append(k); return e; };
  const style = el('style', { textContent: CSS });
  const root = el('div', { id: 'rumbleTune' });
  // Keys typed into the panel (arrows on a slider) must not drive the car.
  for (const t of ['keydown', 'keyup']) root.addEventListener(t, e => e.stopPropagation());
  const save = () => { try { storage?.setItem(key, JSON.stringify(P)); } catch { /* storage unavailable */ } };
  const sliders = []; // { obj, k, input, out } to refresh after a reset

  const meters = (names) => {
    const box = el('div', { className: 'rt-meters' }), bars = {};
    for (const m of names) { const i = el('i'); bars[m] = i; box.append(el('span', { className: 'dim', textContent: m }), el('div', { className: 'rt-bar' }, [i])); }
    return { box, bars };
  };
  const fill = (bars, l) => { for (const m in bars) bars[m].style.width = `${Math.round(100 * Math.min(1, l[m] ?? 0))}%`; };

  // A slider for params[path] (path inside one channel's object). label/help: plain words, or the path itself (Advanced);
  // invert: right is the parameter's low end. The value shows in its own units; hover the label for the parameter's name.
  function slider(obj, path, label = path, help = '', invert = false) {
    const parts = path.split('.'), k = parts.at(-1), owner = parts.length > 1 ? get(obj, parts.slice(0, -1).join('.')) : obj;
    const [min, max, step] = RANGES[k], [unit = '', scale = 1] = UNIT[k] ?? [];
    const digits = Math.max(0, -Math.floor(Math.log10(step * scale) + 1e-9));
    const show = v => `${(v * scale).toFixed(digits)}${unit ? ` ${unit}` : ''}`;
    const toInput = v => (invert ? min + max - v : v), fromInput = v => +(invert ? min + max - v : v).toFixed(10);
    const input = el('input', { type: 'range', min, max, step, value: toInput(owner[k]) }), out = el('output', { textContent: show(owner[k]) });
    input.addEventListener('input', () => { owner[k] = fromInput(Number(input.value)); out.textContent = show(owner[k]); save(); });
    sliders.push(() => { input.value = toInput(owner[k]); out.textContent = show(owner[k]); });
    const kids = [el('span', { textContent: label, title: path }), input, out];
    if (help) kids.push(el('div', { className: 'help', textContent: help }));
    return el('div', { className: help ? 'row' : 'row adv' }, kids); // adv: a raw parameter, named as in the code
  }
  const copyInto = (dst, src) => { for (const k in src) { if (typeof src[k] === 'object') copyInto(dst[k], src[k]); else dst[k] = src[k]; } };
  const refresh = () => { for (const r of sliders) r(); };
  const fold = (title, kids) => el('details', {}, [el('summary', { textContent: title }), ...kids]);

  // The outputs, the aid's state, the pad's effects.
  const outs = meters(MOTORS), info = el('div', { className: 'dim' }), sends = el('div', { className: 'dim' });
  root.append(el('h1', { textContent: 'Rumble tuning' }), outs.box, info, sends);

  const chanMeters = {};
  const used = { engine: ['weak'], suspension: ['strong', 'weak'], body: ['strong', 'weak'], aid: ['left'] };
  for (const ch of CHANNELS) {
    const mute = el('input', { type: 'checkbox' }), reset = el('button', { textContent: 'Reset' });
    mute.addEventListener('change', () => { rumble.mute[ch] = mute.checked; });
    reset.addEventListener('click', () => { copyInto(P[ch], PARAMS[ch]); refresh(); save(); });
    const m = meters(used[ch]); chanMeters[ch] = m.bars;
    const L = LAYOUT[ch], sec = el('section', {}, [el('div', { className: 'head' }, [el('h2', { textContent: L.title }), el('label', {}, [mute, ' mute']), reset]), m.box]);
    for (const [path, label, help, invert] of L.simple) sec.append(slider(P[ch], path, label, help, invert));
    const shown = new Set(L.simple.map(r => r[0]));
    if (L.surfaces) {
      const names = Object.keys(P[ch].surfaces);
      sec.append(fold('Surfaces', names.map(n => slider(P[ch], `surfaces.${n}.${L.surfaces}`, n[0].toUpperCase() + n.slice(1), SURFACE_HELP))));
      for (const n of names) shown.add(`surfaces.${n}.${L.surfaces}`);
    }
    const rest = leaves(P[ch]).filter(path => !shown.has(path));
    if (rest.length) sec.append(fold('Advanced', rest.map(path => slider(P[ch], path))));
    root.append(sec);
  }
  // The mix's soft clip and the write budget (R9-4: how often effects go to the pad; a Bluetooth pad queues what it can't keep up with).
  const adv = el('section', {}, [fold('Advanced: mix and send', [...leaves(P.mix).map(p => slider(P.mix, p, `mix.${p}`)), ...leaves(P.send).map(p => slider(P.send, p, `send.${p}`))])]);
  const text = el('textarea', { readOnly: true, hidden: true });
  const exp = el('button', { textContent: 'Export' });
  exp.addEventListener('click', () => { text.hidden = false; text.value = `export const PARAMS = ${JSON.stringify(P, null, 2)};`; text.select(); });
  root.append(adv, el('section', {}, [exp, text]));
  doc.head.append(style); doc.body.append(root);

  let raf = 0;
  const rate = { t: 0, w: 0, n: 0 };
  const tick = () => {
    fill(outs.bars, rumble.out);
    for (const ch of CHANNELS) fill(chanMeters[ch], rumble.levels[ch]);
    const st = doc.defaultView.__rallyView?.rumble?.(), a = rumble.aid(), list = pads() ?? [];
    const fx = list.map(p => { const v = p?.vibrationActuator; if (!v) return 'no actuator'; try { return `lists ${v.effects ? Array.from(v.effects).join(', ') : 'nothing'}`; } catch { return 'effects unreadable'; } });
    const mode = st ? (st.triggers ? 'sending trigger-rumble' : 'trigger-rumble rejected: dual-rumble') : '';
    info.textContent = `brake: ${a.brake.locked ? 'PULSE' : a.brake.near ? 'near' : '–'} · pads: ${fx.length ? fx.join(' | ') : 'none paired (press a button)'}${mode ? ` · ${mode}` : ''}`;
    // the writes (rumbleOut's stats, through the stage view's seam): per second, and how they ended
    const t = performance.now();
    if (st && t - rate.t >= 1000) { rate.n = st.writes - rate.w; rate.w = st.writes; rate.t = t; }
    sends.textContent = st ? `writes ${rate.n}/s (total ${st.writes}: ${st.complete} complete, ${st.preempted} replaced, ${st.rejected} rejected) · pads ${st.pads} · ${st.live ? 'playing' : 'quiet'}${st.lastError ? ` · last error ${st.lastError}` : ''}` : 'writes: no stage yet';
    raf = doc.defaultView.requestAnimationFrame(tick);
  };
  tick();
  return { dispose() { doc.defaultView.cancelAnimationFrame(raf); root.remove(); style.remove(); } };
}
