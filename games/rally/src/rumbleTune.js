// The ?rumble tuning panel (rally-spec R9-5): the game runs as usual with a panel beside it. A section per channel with a slider
// per parameter, a mute, its live levels and Reset; the four outputs on top with the aid's state and the pad's effects (does it
// have trigger motors). Edits go straight into the mixer's params (the channels read them every frame) and save to storage on
// change; Export gives the JSON for src/defs/rumble.js. View-only: it never touches the sim. Desktop only.
import { PARAMS, RANGES } from './defs/rumble.js';
import { CHANNELS } from './rumble/index.js';

const CSS = `
#rumbleTune { position: fixed; top: 0; right: 0; bottom: 0; width: 340px; z-index: 99999; overflow-y: auto; pointer-events: auto;
  background: rgba(20, 30, 34, 0.94); color: #e8eeec; font: 13px/1.35 system-ui, sans-serif; padding: 10px 12px; box-sizing: border-box;
  -webkit-user-select: auto; user-select: auto; touch-action: auto; }
#rumbleTune h1 { font-size: 16px; margin: 0 0 6px; } #rumbleTune h2 { font-size: 14px; margin: 0; flex: 1; }
#rumbleTune section { border-top: 1px solid #3a4a50; padding: 8px 0; }
#rumbleTune .head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
#rumbleTune .row { display: grid; grid-template-columns: 82px 1fr 52px; gap: 6px; align-items: center; }
#rumbleTune .row input { width: 100%; } #rumbleTune .row output { text-align: right; font-variant-numeric: tabular-nums; }
#rumbleTune details { margin: 4px 0 0 6px; } #rumbleTune summary { cursor: pointer; color: #a9b4b0; }
#rumbleTune .meters { display: grid; grid-template-columns: 46px 1fr; gap: 2px 6px; align-items: center; margin: 4px 0; }
#rumbleTune .bar { height: 8px; background: #2b3a40; border-radius: 2px; overflow: hidden; }
#rumbleTune .bar > i { display: block; height: 100%; width: 0; background: #e0a43a; }
#rumbleTune .dim { color: #a9b4b0; } #rumbleTune button { font: inherit; padding: 2px 8px; }
#rumbleTune textarea { width: 100%; height: 160px; font: 11px monospace; }
`;
const MOTORS = ['strong', 'weak', 'left', 'right'];

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
    const box = el('div', { className: 'meters' }), bars = {};
    for (const m of names) { const i = el('i'); bars[m] = i; box.append(el('span', { className: 'dim', textContent: m }), el('div', { className: 'bar' }, [i])); }
    return { box, bars };
  };
  const fill = (bars, l) => { for (const m in bars) bars[m].style.width = `${Math.round(100 * Math.min(1, l[m] ?? 0))}%`; };

  function slider(obj, k) {
    const [min, max, step] = RANGES[k];
    const input = el('input', { type: 'range', min, max, step, value: obj[k] }), out = el('output', { textContent: obj[k] });
    input.addEventListener('input', () => { obj[k] = Number(input.value); out.textContent = input.value; save(); });
    sliders.push({ obj, k, input, out });
    return el('div', { className: 'row' }, [el('span', { textContent: k }), input, out]);
  }
  // A params object's sliders; nested objects (surfaces, brake/traction) fold into <details>.
  function group(obj, box) {
    for (const k in obj) {
      if (typeof obj[k] === 'object') { const d = el('details', {}, [el('summary', { textContent: k })]); group(obj[k], d); box.append(d); }
      else box.append(slider(obj, k));
    }
  }
  const copyInto = (dst, src) => { for (const k in src) { if (typeof src[k] === 'object') copyInto(dst[k], src[k]); else dst[k] = src[k]; } };
  const refresh = () => { for (const s of sliders) { s.input.value = s.obj[s.k]; s.out.textContent = s.obj[s.k]; } };

  // The outputs, the aid's state, the pad's effects.
  const outs = meters(MOTORS), info = el('div', { className: 'dim' }), sends = el('div', { className: 'dim' });
  root.append(el('h1', { textContent: 'Rumble tuning' }), outs.box, info, sends);

  const chanMeters = {};
  const used = { engine: ['weak'], suspension: ['strong', 'weak'], body: ['strong', 'weak'], aid: ['left', 'right'] };
  for (const ch of CHANNELS) {
    const mute = el('input', { type: 'checkbox' }), reset = el('button', { textContent: 'Reset' });
    mute.addEventListener('change', () => { rumble.mute[ch] = mute.checked; });
    reset.addEventListener('click', () => { copyInto(P[ch], PARAMS[ch]); refresh(); save(); });
    const m = meters(used[ch]); chanMeters[ch] = m.bars;
    const sec = el('section', {}, [el('div', { className: 'head' }, [el('h2', { textContent: ch }), el('label', {}, [mute, ' mute']), reset]), m.box]);
    group(P[ch], sec);
    root.append(sec);
  }
  const mix = el('section', {}, [el('div', { className: 'head' }, [el('h2', { textContent: 'mix' })])]);
  group(P.mix, mix);
  // the write budget (R9-4): how often effects go to the pad; a Bluetooth pad queues writes it can't keep up with
  const send = el('section', {}, [el('div', { className: 'head' }, [el('h2', { textContent: 'send' })])]);
  group(P.send, send);
  const text = el('textarea', { readOnly: true, hidden: true });
  const exp = el('button', { textContent: 'Export' });
  exp.addEventListener('click', () => { text.hidden = false; text.value = `export const PARAMS = ${JSON.stringify(P, null, 2)};`; text.select(); });
  root.append(mix, send, el('section', {}, [exp, text]));
  doc.head.append(style); doc.body.append(root);

  let raf = 0;
  const rate = { t: 0, w: 0, n: 0 };
  const tick = () => {
    fill(outs.bars, rumble.out);
    for (const ch of CHANNELS) fill(chanMeters[ch], rumble.levels[ch]);
    const a = rumble.aid(), list = pads() ?? [];
    const fx = list.map(p => { const v = p?.vibrationActuator; if (!v) return 'no actuator'; try { return v.effects ? Array.from(v.effects).join(', ') : 'effects not listed (trigger-rumble tried)'; } catch { return 'effects unreadable'; } });
    info.textContent = `brake: ${a.brake.locked ? 'PULSE' : a.brake.near ? 'near' : '–'} · traction: ${a.traction.locked ? 'PULSE' : a.traction.near ? 'near' : '–'} · pads: ${fx.length ? fx.join(' | ') : 'none paired (press a button)'}`;
    // the writes (rumbleOut's stats, through the stage view's seam): per second, and how they ended
    const st = doc.defaultView.__rallyView?.rumble?.(), t = performance.now();
    if (st && t - rate.t >= 1000) { rate.n = st.writes - rate.w; rate.w = st.writes; rate.t = t; }
    sends.textContent = st ? `writes ${rate.n}/s (total ${st.writes}: ${st.complete} complete, ${st.preempted} replaced, ${st.rejected} rejected) · pads ${st.pads} · ${st.live ? 'playing' : 'quiet'}${st.lastError ? ` · last error ${st.lastError}` : ''}` : 'writes: no stage yet';
    raf = doc.defaultView.requestAnimationFrame(tick);
  };
  tick();
  return { dispose() { doc.defaultView.cancelAnimationFrame(raf); root.remove(); style.remove(); } };
}
