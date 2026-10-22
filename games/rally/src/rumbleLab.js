// The rumble lab (?rumble, rally-spec R7): feel every scenario's candidate patterns on a real pad and pick one each. It
// drives the game's own mixer (src/rumble.js) with made-up wheels, so what you feel here is what the game plays. Picks
// save to storage, and the game reads them on its next load; Export gives the JSON for src/defs/rumble.js PICKS.
// Pad: D-pad up/down picks a scenario, left/right its option, hold A (or Space, or the Hold button) to feel it.
import { SCENARIOS, PICKS } from './defs/rumble.js';
import { createRumble, DETECT } from './rumble.js';
import { rumbleOut } from './rumbleOut.js';
import { surfaceOfKey } from './surface.js';

const MATERIAL = { tarmac: 'tarmac', dirt: 'hardpack', gravel: 'gravel', grass: 'grass', sand: 'sand', mud: 'mud', snow: 'packed', ice: 'ice' };
const KEYS = Object.keys(SCENARIOS), SURFACES = KEYS.filter(k => SCENARIOS[k].kind === 'surface');
const OPTS = k => Object.keys(SCENARIOS[k].options);
const NO_SURFACE = { id: null, kp: 0.15, ap: 0.15 }; // touching the ground, but nothing the mixer has a texture for

// Wheels for the mixer: a surface (or none), a speed (m/s), and how deep into each event (0..1; null = not happening).
// slip: the foot brake's −κ/kp directly (1 = the tyre's peak), for the threshold-braking step; handbrake: rears locked.
// impact: a suspension hit's severity (0..1 → the wheels' jolt); jolt: the jolt in m/s directly; air: all wheels off the ground.
export function fakeCar({ surface = null, speed = 0, slide = null, spin = null, brake = null, lock = null, slip = null, handbrake = false,
  impact = null, jolt = null, air = false }) {
  const surf = surface ? surfaceOfKey(MATERIAL[surface]) : NO_SURFACE;
  const at = (d, D) => (d == null ? 0 : D.on + d * (D.full - D.on));
  const braking = brake != null || lock != null || slip != null, bslip = slip ?? (lock != null ? at(lock, DETECT.lock) : at(brake, DETECT.brake));
  return {
    speed, out: { throttle: spin != null ? 1 : 0 }, input: { brake: braking ? 1 : 0, handbrake: handbrake ? 1 : 0 },
    wheels: [0, 1, 2, 3].map(i => ({
      contact: !air, front: i < 2, surf, drive: spin != null ? 100 : 0,
      jolt: jolt ?? (impact != null ? DETECT.impact.on + impact * (DETECT.impact.full - DETECT.impact.on) : 0),
      alpha: i >= 2 ? at(slide, DETECT.slide) * surf.ap : 0,
      kappa: spin != null ? at(spin, DETECT.spin) * surf.kp : handbrake && i >= 2 ? -4 * surf.kp : braking ? -bslip * surf.kp : 0,
    })),
  };
}

// The stage sequence: [seconds, label, (t 0..1) → fakeCar args]. Transitions are what single scenarios can't show.
const SEQUENCE = [
  [1.2, 'Launch on gravel: wheelspin', t => ({ surface: 'gravel', speed: 2 + 8 * t, spin: 0.7 - 0.5 * t })],
  [2.0, 'Gravel, building speed', t => ({ surface: 'gravel', speed: 10 + 14 * t })],
  [1.8, 'Slide', t => ({ surface: 'gravel', speed: 24, slide: Math.sin(Math.PI * t) })],
  [1.5, 'Gravel', () => ({ surface: 'gravel', speed: 24 })],
  [2.0, 'Tarmac', () => ({ surface: 'tarmac', speed: 26 })],
  // Threshold braking: squeeze up to the limit, hold it, overdo it (lock), release, squeeze back to the limit.
  [3.0, 'Threshold braking: squeeze, hold, lock, release, squeeze', t => ({ surface: 'tarmac', speed: 26 - 16 * t,
    slip: t < 0.2 ? 0.5 + 2.4 * t : t < 0.45 ? 0.95 : t < 0.65 ? 1.6 : t < 0.75 ? 0.6 : t < 0.85 ? 0.6 + 3.5 * (t - 0.75) : 0.95 })],
  // Lumpy grass: bumps of mixed size about three times a second (the jolt is a decaying peak, as the car's is).
  [2.0, 'Off into lumpy grass', t => ({ surface: 'grass', speed: 12, jolt: bump(t * 2) })],
  [1.6, 'A jump: in the air, then the landing', t => (t < 0.6 ? { surface: 'grass', speed: 18, air: true } : { surface: 'grass', speed: 17, jolt: t < 0.62 ? 5 : 0 })],
  [1.5, 'Snow', () => ({ surface: 'snow', speed: 15 })],
  [1.5, 'Ice', () => ({ surface: 'ice', speed: 15 })],
];
function bump(sec) { // a few lumps a second, sizes 1.4–3.4 m/s
  const k = Math.floor(sec * 3), ph = sec * 3 - k;
  return ph < 0.06 ? 1.4 + 2 * ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1 : 0;
}
const SEQ_LEN = SEQUENCE.reduce((a, s) => a + s[0], 0);

const CSS = `
html, body { overflow: auto !important; background: var(--panel-solid, #22333a) !important; height: auto !important; touch-action: auto !important; }
body { background: var(--panel-solid, #22333a); -webkit-user-select: auto; user-select: auto; }
body > :not(#lab) { display: none !important; }
#lab { max-width: 980px; margin: 0 auto; padding: 16px; font-size: 16px; }
#lab h1 { margin: 0 0 4px; font-size: 28px; } #lab h2 { margin: 22px 0 8px; font-size: 19px; color: var(--dim, #a9b4b0); font-weight: 600; }
#lab p { margin: 4px 0; color: var(--dim, #a9b4b0); line-height: 1.4; }
#lab .lab-top { position: sticky; top: 0; z-index: 2; background: var(--panel-solid, #22333a); padding: 8px 0 10px; border-bottom: 1px solid #ffffff22; }
#lab .lab-row { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; margin-top: 8px; }
#lab label { display: inline-flex; gap: 8px; align-items: center; }
#lab input[type=range] { width: 150px; accent-color: var(--amber, #f2b43c); }
#lab .lab-meter { display: grid; grid-template-columns: 56px 1fr 44px; gap: 6px; align-items: center; width: min(360px, 100%); }
#lab .lab-meter i { display: block; height: 12px; border-radius: 6px; background: #ffffff1a; overflow: hidden; }
#lab .lab-meter b { display: block; height: 100%; width: 0; background: var(--amber, #f2b43c); }
#lab .lab-chip { padding: 2px 9px; border-radius: 10px; background: #ffffff14; color: var(--dim, #a9b4b0); font-size: 14px; }
#lab .lab-chip.lab-on { background: var(--go, #6cc784); color: #10221a; }
#lab .lab-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 10px; }
#lab .lab-card { padding: 10px 12px; border-radius: 10px; background: #ffffff0d; border: 2px solid transparent; }
#lab .lab-card.lab-sel { border-color: var(--amber, #f2b43c); }
#lab .lab-card.lab-playing { background: #f2b43c22; }
#lab .lab-card h3 { margin: 0 0 6px; font-size: 18px; display: flex; justify-content: space-between; align-items: center; }
#lab .lab-opts { display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px; }
#lab button { padding: 6px 14px; border-radius: 8px; border: 0; background: #ffffff1f; cursor: pointer; touch-action: none; }
#lab button.lab-hold { background: var(--amber, #f2b43c); color: #1d1a12; font-weight: 700; }
#lab textarea { width: 100%; height: 150px; font: 13px/1.35 ui-monospace, monospace; background: #0003; color: inherit; border: 1px solid #ffffff22; border-radius: 8px; padding: 8px; box-sizing: border-box; }
`;

function loadPicks(storage, key) {
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(key)) || {}; } catch { saved = {}; }
  return Object.fromEntries(KEYS.map(k => {
    const p = saved[k], option = OPTS(k).includes(p?.option) ? p.option : PICKS[k].option;
    return [k, { option, gain: Number.isFinite(p?.gain) ? p.gain : PICKS[k].gain }];
  }).concat([['road', { gain: Number.isFinite(saved.road?.gain) ? saved.road.gain : PICKS.road.gain }]]));
}

export function rumbleLab(doc, { storage = null, key = 'rally-rumble-picks', getGamepads } = {}) {
  const win = doc.defaultView, picks = loadPicks(storage, key);
  const mix = createRumble(picks), pads = rumbleOut({ getGamepads });
  const getPads = getGamepads ?? (() => win.navigator.getGamepads?.() ?? []);
  const ui = { speed: 70, depth: 0.5, under: 'gravel', sel: 'gravel', holds: new Set(), seq: -1, padPrev: [] };

  const style = doc.createElement('style'); style.textContent = CSS; doc.head.append(style);
  const root = doc.createElement('div'); root.id = 'lab'; doc.body.append(root);
  doc.title = 'Rally rumble lab';
  const card = k => {
    const S = SCENARIOS[k];
    return `<div class="lab-card" data-k="${k}"><h3>${S.label}<button data-hold="${k}">Hold</button></h3><div class="lab-opts">${OPTS(k).map(o =>
      `<label><input type="radio" name="${k}" value="${o}"> <b>${o}</b> ${S.options[o].desc}</label>`).join('')}</div>
      <label>Gain <input type="range" min="0" max="1.5" step="0.05" data-gain="${k}"> <span data-gv="${k}"></span></label></div>`;
  };
  root.innerHTML = `
    <div class="lab-top"><h1>Rumble lab</h1>
      <p id="padInfo">Press a button on the pad so the browser shows it.</p>
      <div class="lab-row">
        <div class="lab-meter"><span>Strong</span><i><b id="mS"></b></i><span id="vS">0</span></div>
        <div class="lab-meter"><span>Weak</span><i><b id="mW"></b></i><span id="vW">0</span></div>
      </div>
      <div class="lab-row"><span class="lab-chip" id="cSlide">slide</span><span class="lab-chip" id="cSpin">wheelspin</span><span class="lab-chip" id="cBrake">brake limit</span><span class="lab-chip" id="cLock">lock-up</span><span class="lab-chip" id="cImpact">impact</span><span class="lab-chip" id="cLanding">landing</span>
        <span id="seqInfo"></span></div>
    </div>
    <p>Hold a scenario's button (or select a card and hold A or Space) to feel it. On the pad, D-pad up/down selects a card and left/right changes its option. Picks save as you go, and the game uses them the next time it loads.</p>
    <div class="lab-row">
      <label>Speed <input type="range" id="speed" min="0" max="160" step="5"> <span id="speedV"></span> km/h</label>
      <label>Event depth <input type="range" id="depth" min="0" max="1" step="0.05"> <span id="depthV"></span></label>
      <label>Road noise (all surfaces) <input type="range" id="road" min="0" max="1.5" step="0.05"> <span id="roadV"></span></label>
      <label>Under events <select id="under"><option value="">No surface</option>${SURFACES.map(k => `<option value="${k}">${SCENARIOS[k].label}</option>`).join('')}</select></label>
    </div>
    <h2>Surfaces (level follows speed)</h2><div class="lab-grid">${SURFACES.map(card).join('')}</div>
    <h2>Events (level follows event depth)</h2><div class="lab-grid">${KEYS.filter(k => !SURFACES.includes(k)).map(card).join('')}</div>
    <h2>Sequence</h2><p>A short stage: launch wheelspin, gravel, a slide, tarmac, threshold braking (to the limit, a lock, release, back to the limit), lumpy grass, a jump landing, snow, ice (${SEQ_LEN.toFixed(1)} s), with the current picks.</p>
    <div class="lab-row"><button id="seq">Play sequence</button></div>
    <h2>Export</h2><p>Paste this into <code>PICKS</code> in <code>src/defs/rumble.js</code> (or send it to Claude) to make these picks the defaults.</p>
    <textarea id="out" readonly></textarea>
    <div class="lab-row"><button id="copy">Copy</button><button id="reset">Reset to defaults</button></div>`;
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];

  function save() {
    try { storage?.setItem(key, JSON.stringify(picks)); } catch { /* storage unavailable: picks last for this visit */ }
    $('#out').value = '{\n' + `  road: { gain: ${picks.road.gain} },\n` + KEYS.map(k => `  ${k}: { option: '${picks[k].option}', gain: ${picks[k].gain} },`).join('\n') + '\n}';
  }
  function sync() {
    for (const k of KEYS) {
      root.querySelector(`input[name="${k}"][value="${picks[k].option}"]`).checked = true;
      $(`[data-gain="${k}"]`).value = picks[k].gain; $(`[data-gv="${k}"]`).textContent = picks[k].gain.toFixed(2);
    }
    for (const c of $$('.lab-card')) c.classList.toggle('lab-sel', c.dataset.k === ui.sel);
    $('#speed').value = ui.speed; $('#speedV').textContent = ui.speed; $('#depth').value = ui.depth; $('#depthV').textContent = ui.depth.toFixed(2);
    $('#under').value = ui.under; $('#road').value = picks.road.gain; $('#roadV').textContent = `×${picks.road.gain.toFixed(2)}`;
    save();
  }
  const select = k => { ui.sel = k; sync(); root.querySelector(`.lab-card[data-k="${k}"]`)?.scrollIntoView({ block: 'nearest' }); };

  root.addEventListener('change', ev => {
    const t = ev.target;
    if (t.type === 'radio') { picks[t.name].option = t.value; ui.sel = t.name; }
    else if (t.id === 'under') ui.under = t.value;
    sync();
  });
  root.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.gain) picks[t.dataset.gain].gain = +t.value;
    else if (t.id === 'speed') ui.speed = +t.value;
    else if (t.id === 'depth') ui.depth = +t.value;
    else if (t.id === 'road') picks.road.gain = +t.value;
    sync();
  });
  root.addEventListener('pointerdown', ev => {
    const c = ev.target.closest('.lab-card'); if (c && ev.target.type !== 'range') { ui.sel = c.dataset.k; sync(); }
    const h = ev.target.dataset?.hold; if (!h) return;
    ev.preventDefault(); ev.target.setPointerCapture?.(ev.pointerId);
    ui.holds.add('ptr:' + h);
    const up = () => { ui.holds.delete('ptr:' + h); ev.target.removeEventListener('pointerup', up); ev.target.removeEventListener('pointercancel', up); };
    ev.target.addEventListener('pointerup', up); ev.target.addEventListener('pointercancel', up);
  });
  win.addEventListener('keydown', ev => { if (ev.key === ' ' && ev.target.tagName !== 'TEXTAREA') { ev.preventDefault(); ui.holds.add('key'); } });
  win.addEventListener('keyup', ev => { if (ev.key === ' ') ui.holds.delete('key'); });
  win.addEventListener('blur', () => ui.holds.clear());
  $('#seq').addEventListener('click', () => { ui.seq = ui.seq < 0 ? 0 : -1; });
  $('#copy').addEventListener('click', () => { $('#out').select(); win.navigator.clipboard?.writeText($('#out').value); });
  $('#reset').addEventListener('click', () => { for (const k of [...KEYS, 'road']) picks[k] = { ...PICKS[k] }; sync(); });

  // The pad: D-pad navigation (edges), A held plays the selected card.
  function readPad() {
    const pad = [...getPads()].find(Boolean);
    const info = !pad ? 'Press a button on the pad so the browser shows it.'
      : `${pad.id}: ${pad.vibrationActuator?.playEffect ? 'rumble supported' : 'this browser exposes no rumble for this pad'}`;
    if ($('#padInfo').textContent !== info) $('#padInfo').textContent = info;
    if (!pad) return;
    const down = i => !!pad.buttons[i]?.pressed, edge = i => down(i) && !ui.padPrev[i];
    const at = KEYS.indexOf(ui.sel);
    if (edge(12)) select(KEYS[(at + KEYS.length - 1) % KEYS.length]);
    if (edge(13)) select(KEYS[(at + 1) % KEYS.length]);
    if (edge(14) || edge(15)) { const o = OPTS(ui.sel), i = o.indexOf(picks[ui.sel].option); picks[ui.sel].option = o[(i + o.length + (edge(15) ? 1 : -1)) % o.length]; sync(); }
    if (down(0)) ui.holds.add('pad'); else ui.holds.delete('pad');
    ui.padPrev = pad.buttons.map(b => b.pressed);
  }

  // What's playing this frame → fakeCar args.
  function scene(dt) {
    if (ui.seq >= 0) {
      ui.seq += dt;
      if (ui.seq >= SEQ_LEN) { ui.seq = -1; return null; }
      let t = ui.seq;
      for (const [len, label, f] of SEQUENCE) { if (t < len) return { args: f(t / len), label }; t -= len; }
    }
    ui.holdT = ui.holds.size ? (ui.holdT ?? -dt) + dt : -1;
    if (!ui.holds.size) return null;
    const ptr = [...ui.holds].find(h => h.startsWith('ptr:')), k = ptr ? ptr.slice(4) : ui.sel, v = ui.speed / 3.6;
    if (SCENARIOS[k].kind === 'surface') return { k, args: { surface: k, speed: v } };
    if (k === 'landing') { // a flight of 0.2–0.7 s (by the depth slider), then the touchdown
      const flight = DETECT.landing.air + ui.depth * (DETECT.landing.airFull - DETECT.landing.air);
      return { k, args: ui.holdT < flight ? { surface: ui.under || null, speed: v, air: true } : { surface: ui.under || null, speed: v, jolt: ui.holdT < flight + 0.03 ? 1.3 + 2.2 * ui.depth : 0 } };
    }
    if (k === 'impact') return { k, args: { surface: ui.under || null, speed: v, impact: ui.holdT < 0.03 ? ui.depth : null } }; // one hit per press
    return { k, args: { surface: ui.under || null, speed: Math.max(v, DETECT.slide.v + 1), [k]: ui.depth } };
  }

  let last = win.performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    readPad();
    const sc = scene(dt), m = mix.update(fakeCar(sc ? sc.args : { speed: 0 }), dt); // idle still updates, so the event latches reset
    pads.send(m);
    $('#mS').style.width = `${m.strong * 100}%`; $('#mW').style.width = `${m.weak * 100}%`;
    $('#vS').textContent = m.strong.toFixed(2); $('#vW').textContent = m.weak.toFixed(2);
    const a = mix.active();
    $('#cSlide').classList.toggle('lab-on', a.slide); $('#cSpin').classList.toggle('lab-on', a.spin); $('#cBrake').classList.toggle('lab-on', a.brake); $('#cLock').classList.toggle('lab-on', a.lock); $('#cImpact').classList.toggle('lab-on', a.impact); $('#cLanding').classList.toggle('lab-on', a.landing);
    $('#seqInfo').textContent = ui.seq >= 0 && sc ? `▶ ${sc.label}` : '';
    $('#seq').textContent = ui.seq >= 0 ? 'Stop' : 'Play sequence';
    for (const c of $$('.lab-card')) c.classList.toggle('lab-playing', !!sc && c.dataset.k === sc.k);
    win.requestAnimationFrame(frame);
  }
  sync();
  win.requestAnimationFrame(frame);
  win.addEventListener('pagehide', () => pads.kill());
  return { picks, ui };
}
