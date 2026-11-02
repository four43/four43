// The shop card (H-U1, H-U2, H-V2), the view half of the sim's `shop` overlay: the vehicles to drive or buy, and the upgrades of the
// one being driven (rebuilt when it changes). The buttons are the sim's UI controls, adopted by slot (data-lh-slot), so the engine
// taps them and greys them out when they cannot be bought; this half only draws the levels, the values and the prices.
import { CROP, CROP_IDS } from '../defs/econ.js';
import { UPGRADE_IDS, VEHICLES, VEHICLE_IDS, costOf, upgrade } from '../defs/vehicles.js';
import { COIN_SVG } from './hud.js';

const ICONS = {
  speed: '<svg viewBox="0 0 48 48"><path d="M8 34 A18 18 0 1 1 40 34" fill="none" stroke="#3a7bd5" stroke-width="6" stroke-linecap="round"/><path d="M24 30 L34 16" stroke="#d84a3a" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="30" r="4" fill="#5a3820"/></svg>',
  width: '<svg viewBox="0 0 48 48"><rect x="4" y="26" width="40" height="10" rx="3" fill="#e8a21a"/><circle cx="24" cy="20" r="9" fill="none" stroke="#d84a3a" stroke-width="4"/><path d="M4 31 H44" stroke="#5a3820" stroke-width="2"/></svg>',
  bins: '<svg viewBox="0 0 48 48"><path d="M8 14 H40 L36 40 H12 Z" fill="#9aa4ad" stroke="#5a3820" stroke-width="3"/><path d="M11 22 Q24 12 37 22 L35 38 H13 Z" fill="#f5c84c"/></svg>',
  blades: '<svg viewBox="0 0 48 48"><path d="M6 30 L14 16 L18 30 L26 16 L30 30 L38 16 L42 30 Z" fill="#c3c9cf" stroke="#4f545a" stroke-width="3" stroke-linejoin="round"/><rect x="4" y="30" width="40" height="8" rx="2" fill="#e8a21a" stroke="#5a3820" stroke-width="2"/></svg>',
  carts: '<svg viewBox="0 0 48 48"><rect x="6" y="14" width="26" height="16" rx="3" fill="#3f9b3a" stroke="#5a3820" stroke-width="3"/><path d="M32 26 H44" stroke="#5a3820" stroke-width="3"/><circle cx="14" cy="34" r="5" fill="#333"/><circle cx="26" cy="34" r="5" fill="#333"/></svg>',
};
const X_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 11 L29 29 M29 11 L11 29" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>';

const el = (doc, tag, cls, html) => { const x = doc.createElement(tag); if (cls) x.className = cls; if (html) x.innerHTML = html; return x; };
// blades: the toughest of the vehicle's crops it cuts
const cuts = (veh, l) => CROP[CROP_IDS.findLast(k => CROP[k].vehicle === veh && CROP[k].tough <= l)].label.toLowerCase();
const fmt = (veh, id, l) => {
  const u = upgrade(veh, id), v = u.value(l);
  return id === 'speed' ? `${(v * 3.6).toFixed(0)} km/h` : id === 'width' ? `${+v.toFixed(1)} m` : id === 'bins' ? `${v}` : id === 'blades' ? cuts(veh, v)
    : `${v} ${u.noun[v === 1 ? 0 : 1]}`;
};

export function shopHalf({ sound }) {
  let card = null, rows = null, vehs = [], builtFor = null;
  // the card for the vehicle being driven: the vehicle chips, then its upgrade rows
  function build(engine, view) {
    card?.remove();
    const doc = view.doc; card = el(doc, 'div', 'hv-card'); card.id = 'shop';
    const close = el(doc, 'button', 'hv-x', X_SVG); close.type = 'button'; close.dataset.lhSlot = 'shop.close'; close.setAttribute('aria-label', 'Close');
    const veh = builtFor = engine.scene.state.rig?.vehicle ?? 'mower';
    card.append(el(doc, 'h2', null, 'Workshop'), close);
    const chips = el(doc, 'div', 'hv-vehs');
    vehs = VEHICLE_IDS.map(id => { const btn = el(doc, 'button', 'hv-veh'); btn.type = 'button'; btn.dataset.lhSlot = `shop.veh.${id}`; chips.appendChild(btn); return { id, btn, key: '' }; });
    card.appendChild(chips);
    rows = UPGRADE_IDS.map(id => {
      const row = el(doc, 'div', 'hv-row'), pips = el(doc, 'div', 'hv-pips'), val = el(doc, 'div', 'hv-val'), buy = el(doc, 'button', 'hv-buy');
      buy.type = 'button'; buy.dataset.lhSlot = `shop.${id}`;
      for (let k = 0; k < upgrade(veh, id).max; k++) pips.appendChild(el(doc, 'i'));
      const name = el(doc, 'div', 'hv-name'); name.append(el(doc, 'span', 'hv-icon', ICONS[id]), el(doc, 'b', null, upgrade(veh, id).label));
      row.append(name, pips, val, buy); card.appendChild(row);
      return { id, veh, pips, val, buy, level: -1 };
    });
    doc.getElementById('ui').appendChild(card); view.ui.adopt();
  }
  return {
    enter(engine, view) { build(engine, view); sound?.chime(0.3); },
    frame(engine, alpha, view) {
      const r = engine.scene.state.rig; if (!r || !rows) return;
      if (r.vehicle !== builtFor) { build(engine, view); return; }
      for (const v of vehs) {
        const owned = engine.scene.state.farm.prog.owned[v.id], k = `${owned}:${r.vehicle === v.id}`; if (k === v.key) continue;
        const label = VEHICLES[v.id].label;
        v.key = k; v.btn.innerHTML = r.vehicle === v.id ? `<b>${label}</b><span>driving</span>` : owned ? `<b>${label}</b><span>drive</span>`
          : `<b>${label}</b><span>${COIN_SVG}${VEHICLES[v.id].price}</span>`;
        v.btn.classList.toggle('on', r.vehicle === v.id);
      }
      for (const row of rows) {
        const l = r.levels[row.id]; if (l === row.level) continue;
        row.level = l; [...row.pips.children].forEach((p, k) => p.classList.toggle('on', k < l));
        const c = costOf(row.veh, row.id, l), f = k => fmt(row.veh, row.id, k);
        const pre = row.id === 'blades' ? 'Cuts ' : '';
        row.val.textContent = pre + (c === null ? f(l) : `${f(l)} → ${f(l + 1)}`);
        row.buy.innerHTML = c === null ? '<b>MAX</b>' : `${COIN_SVG}<b>${c}</b>`;
      }
    },
    exit() { card?.remove(); card = rows = null; vehs = []; builtFor = null; },
  };
}
