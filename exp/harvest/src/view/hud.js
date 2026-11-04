// The drive HUD (H-L4): the coin counter, the load bar (a segment per wagon, and n / max), the progress of the field being cut, the
// FULL banner with an arrow that points at the vehicle's sell point (the silo, the compost bins), the can't-cut hint, the field-done
// banner, a banner and an arrow to the field that sharper blades or a new vehicle can now cut, and coins that fly up to the counter when grain sells. DOM in #ui; it reads the sim, never writes it.
import { ZONES, SIGNS } from '../sim/layout.js';
import { SIGN } from '../defs/models.js';
import { VEHICLES } from '../defs/vehicles.js';
import { CROP, DONE_AT } from '../defs/econ.js';

// a coin count with thousands separators (later chapters pay in the millions)
export const num = n => Math.round(n).toLocaleString('en-US');
export const COIN_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="#f5c84c" stroke="#b07a12" stroke-width="4"/><circle cx="20" cy="20" r="10" fill="none" stroke="#fff3b0" stroke-width="3"/></svg>';
const ARROW_SVG = '<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M30 4 L54 34 H39 V56 H21 V34 H6 Z" fill="#f5c84c" stroke="#6b4428" stroke-width="5" stroke-linejoin="round"/></svg>';

export function createHud(root, { project }) {
  const doc = root.ownerDocument, el = (tag, cls, html) => { const x = doc.createElement(tag); if (cls) x.className = cls; if (html) x.innerHTML = html; return x; };
  const top = el('div', 'hv-top'); top.id = 'hud';
  const coins = el('div', 'hv-coins', COIN_SVG), coinN = el('span'); coins.appendChild(coinN); coins.dataset.testid = 'coins';
  const load = el('div', 'hv-load'), bars = el('div', 'hv-bars'), loadN = el('span', 'hv-loadn');
  load.append(bars, loadN);
  const field = el('div', 'hv-field'), fieldDot = el('i'), fieldN = el('span'), fieldBar = el('div', 'hv-fbar'), fieldFill = el('i');
  fieldBar.appendChild(fieldFill); field.append(fieldDot, fieldN, fieldBar); field.dataset.testid = 'field';
  const full = el('div', 'hv-full', '<b>FULL!</b> Go sell'), arrow = el('div', 'hv-arrow', ARROW_SVG);
  const tip = el('div', 'hv-full hv-tip'), done = el('div', 'hv-done');
  full.hidden = arrow.hidden = tip.hidden = done.hidden = true;
  top.append(coins, load, field); root.append(top, full, tip, done, arrow);
  let shownCoins = -1, target = 0, segs = [], caps = '', fly = [], fieldKey = null, tipKey = '', doneT = 0, guide = null;
  const sellAt = { x: 0, y: 3, z: 0 }; // the vehicle's sell zone, set each frame
  const pointAt = (p, toNdc) => { // the arrow at the top of the screen turns toward p on the screen (behind: it points down)
    const n = toNdc(p.x, p.y, p.z), a = n.behind ? Math.PI : Math.atan2(n.nx, n.ny);
    arrow.style.transform = `translateX(-50%) rotate(${a.toFixed(3)}rad)`;
  };
  const name = id => CROP[id].label;
  const guideTo = f => { guide = { f, ripe: f.ripe, x: SIGNS[f.id].x, y: SIGN.y, z: SIGNS[f.id].z }; };
  const banner = (title, sub) => { done.innerHTML = `<b>${title}</b><span>${sub}</span>`; done.hidden = false; doneT = 4.5; };

  function bins(load) {
    const key = load.bins.map(b => b.cap).join(',');
    if (key !== caps) {
      caps = key; bars.textContent = '';
      segs = load.bins.map(b => { const s = el('div', 'hv-seg'), f = el('i'); s.style.flexGrow = String(b.cap); s.appendChild(f); bars.appendChild(s); return f; });
    }
    load.bins.forEach((b, i) => { segs[i].style.transform = `scaleX(${(b.n / b.cap).toFixed(3)})`; });
  }
  return {
    // H-F5: a field done: a banner
    fieldDone(ev) { banner(`${name(ev.field)} field done!`, 'It grows back for another harvest'); },
    // H-H6: sharper blades: a banner, and the arrow guides to the field they now cut until the combine starts on it
    bought(ev, fields, vehicle) {
      if (ev.what !== 'blades') return;
      const f = fields.list.find(x => x.tough === ev.level && x.vehicle === vehicle); if (!f) return;
      banner(`${name(f.crop)} unlocked!`, `Your blades cut ${name(f.crop).toLowerCase()} now`);
      guideTo(f);
    },
    // H-V2: a new vehicle bought: a banner, and the arrow guides to its first field
    vehicle(ev, fields) {
      if (ev.how !== 'bought') return;
      const f = fields.list.find(x => x.vehicle === ev.vehicle && x.tough === 0);
      banner(`${VEHICLES[ev.vehicle].label} bought!`, f ? `Drive it out to the ${name(f.crop).toLowerCase()}` : '');
      if (f) guideTo(f);
    },
    // a sale: coins fly from the combine to the counter
    sold(ev, at) {
      const p = project(at), r = coins.getBoundingClientRect();
      for (let k = 0; k < Math.min(6, Math.ceil(ev.coins / 5)); k++) {
        const c = el('div', 'hv-fly', COIN_SVG); c.style.left = `${p.x + (k - 2.5) * 10}px`; c.style.top = `${p.y}px`; root.appendChild(c);
        fly.push(c);
        requestAnimationFrame(() => { c.style.transform = `translate(${r.left + r.width / 2 - p.x}px, ${r.top + r.height / 2 - p.y}px) scale(.6)`; c.style.opacity = '0.2'; });
        setTimeout(() => { c.remove(); fly = fly.filter(x => x !== c); }, 700 + k * 40);
      }
      coins.classList.remove('bump'); void coins.offsetWidth; coins.classList.add('bump');
    },
    frame(s, dt, toNdc) {
      const f = s.farm, r = s.rig;
      target = f.prog.coins;
      if (shownCoins < 0) shownCoins = target;
      if (shownCoins !== target) { const d = target - shownCoins; shownCoins = Math.abs(d) < 1 ? target : shownCoins + d * Math.min(1, dt * 8) + Math.sign(d); if (Math.sign(target - shownCoins) !== Math.sign(d)) shownCoins = target; }
      const txt = num(shownCoins); if (coinN.textContent !== txt) coinN.textContent = txt;
      bins(r.load);
      const lt = `${r.load.total()} / ${r.load.capacity()}`; if (loadN.textContent !== lt) loadN.textContent = lt;
      // the field last cut: its crop and how much is cut (done at DONE_AT, shown as 100 %)
      const a = r.cutField, pct = a ? Math.min(100, Math.floor(100 * f.fields.progress(a) / DONE_AT)) : 0, fk = a ? `${a.id}:${pct}:${a.done}` : '';
      if (fk !== fieldKey) {
        fieldKey = fk; field.hidden = !a;
        if (a) { fieldDot.style.background = CROP[a.crop].grain; fieldN.textContent = a.done ? `${name(a.crop)} field done` : `${name(a.crop)} field ${pct}%`; fieldFill.style.transform = `scaleX(${a.done ? 1 : pct / 100})`; }
      }
      if (guide && (guide.f.ripe < guide.ripe || r.load.full())) guide = null; // started on it (or must sell first)
      if (doneT > 0 && (doneT -= dt) <= 0) done.hidden = true;
      const isFull = r.load.full() && !r.selling;
      full.hidden = !isFull; arrow.hidden = !isFull && !guide;
      if (isFull) { const z = ZONES[VEHICLES[r.vehicle].sell]; sellAt.x = z.x; sellAt.z = z.z; pointAt(sellAt, toNdc); } else if (guide) pointAt(guide, toNdc);
      // H-H6: pushing through a crop too tough for the blades
      const b = !isFull && r.blocked, tk = b ? b.id : '';
      if (tk !== tipKey) { tipKey = tk; tip.hidden = !b; if (b) tip.innerHTML = b.vehicle !== r.vehicle ? `<b>Can't cut!</b> ${name(b.crop)} needs the ${VEHICLES[b.vehicle].label.toLowerCase()}` : `<b>Too tough!</b> ${name(b.crop)} needs blades ${b.tough}`; }
    },
    dispose() { top.remove(); full.remove(); tip.remove(); done.remove(); arrow.remove(); for (const c of fly) c.remove(); },
  };
}
