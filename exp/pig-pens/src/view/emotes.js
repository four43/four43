// Emote bubbles (v3 §8.2): a little speech bubble bobbing over every poorly animal, in the Kenney Emote Pack's style
// (white bubble, dark outline, one bold icon), drawn on canvases here so the build needs no PNGs. A heart for a moment
// when one is made better. View only. createEmotes({ root, sim }) → { cured(kind, i), update(dt), dispose() }
import * as THREE from 'three';
import { AILMENTS } from '../sickness.js';

const S = 128, INK = '#3b2a20';
function bubble(draw) {
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.lineWidth = 7; g.strokeStyle = INK; g.fillStyle = '#ffffff';
  g.beginPath(); g.roundRect(10, 8, S - 20, S - 34, 26); g.moveTo(52, S - 27); g.lineTo(64, S - 8); g.lineTo(78, S - 27); // the tail
  g.fill(); g.stroke(); g.fillStyle = '#ffffff'; g.fillRect(50, S - 34, 30, 10); // tail joins the bubble
  g.save(); g.translate(S / 2, 54); draw(g); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ICONS = {
  drops: g => { g.fillStyle = '#4aa8e8'; for (const [x, y, k] of [[-18, -6, 1], [14, 4, 0.8]]) { g.beginPath(); g.moveTo(x, y - 22 * k); g.bezierCurveTo(x + 16 * k, y, x + 12 * k, y + 16 * k, x, y + 16 * k); g.bezierCurveTo(x - 12 * k, y + 16 * k, x - 16 * k, y, x, y - 22 * k); g.fill(); } },
  sad: g => { g.fillStyle = '#f4c542'; g.beginPath(); g.arc(0, 0, 28, 0, 7); g.fill(); g.fillStyle = INK; for (const x of [-10, 10]) { g.beginPath(); g.arc(x, -6, 4, 0, 7); g.fill(); } g.lineWidth = 5; g.strokeStyle = INK; g.beginPath(); g.arc(0, 18, 11, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); },
  ouch: g => { g.fillStyle = '#e8483f'; g.beginPath(); g.roundRect(-8, -30, 16, 40, 6); g.fill(); g.beginPath(); g.arc(0, 22, 8, 0, 7); g.fill(); },
  swirl: g => { g.strokeStyle = '#9b59d0'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); for (let a = 0; a < 4.2 * Math.PI; a += 0.2) { const r = 3 + a * 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); },
  heart: g => { g.fillStyle = '#ef5a7a'; g.beginPath(); g.moveTo(0, 22); g.bezierCurveTo(-34, -2, -18, -32, 0, -12); g.bezierCurveTo(18, -32, 34, -2, 0, 22); g.fill(); },
};

export function createEmotes({ root, sim }) {
  const mats = Object.fromEntries(Object.entries(ICONS).map(([k, d]) => [k, new THREE.SpriteMaterial({ map: bubble(d), transparent: true, depthWrite: false })]));
  const pool = [], happy = new Map(); // key "kind:i" → seconds left of the heart
  const get = k => { while (pool.length <= k) { const s = new THREE.Sprite(mats.heart); s.visible = false; s.renderOrder = 2; root.add(s); pool.push(s); } return pool[k]; };
  let t = 0;
  function update(dt) {
    t += dt; let n = 0;
    const show = (a, icon, kind) => {
      const s = get(n++), big = kind === 'pig' ? (a.piglet ? 0.75 : 1) : 0.7;
      s.material = mats[icon]; s.visible = true;
      s.position.set(a.px, a.py + (kind === 'pig' ? 0.75 * a.scale / 0.62 : 0.55) + 0.06 * Math.sin(t * 3 + a.i), a.pz);
      s.scale.setScalar(0.55 * big);
    };
    const ex = sim.clinic.exam, onTable = a => ex.who && ex.state !== 'leave' && sim.clinic.patient() === a; // in the close-up its bubble would cover the pegboard
    if (ex.state === 'leave') { const a = sim.clinic.patient(); show(a, 'heart', ex.who.kind); } // walking out happy
    for (const p of sim.pigs) if (p.sick && !onTable(p)) show(p, AILMENTS[p.sick.ailment].emote, 'pig');
    for (const b of sim.flock.birds) if (b.sick && !b.hidden && !onTable(b)) show(b, AILMENTS[b.sick.ailment].emote, 'bird');
    for (const [key, left] of happy) {
      if (left <= 0) { happy.delete(key); continue; } happy.set(key, left - dt);
      const [kind, i] = key.split(':'), a = kind === 'pig' ? sim.pigs[+i] : sim.flock.birds[+i]; if (a && !a.sick && !(ex.state === 'leave' && sim.clinic.patient() === a)) show(a, 'heart', kind); // a leaving patient has its own
    }
    for (let k = n; k < pool.length; k++) pool[k].visible = false;
  }
  return {
    update, cured(kind, i) { happy.set(`${kind}:${i}`, 3); },
    dispose() { for (const s of pool) root.remove(s); for (const m of Object.values(mats)) { m.map.dispose(); m.dispose(); } },
  };
}
