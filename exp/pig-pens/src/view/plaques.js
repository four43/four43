// Name plaques (v3 §4.3, §7): a little wooden board on each stall's header beam and above each perch on the coop's back
// wall, with its owner's name and, smaller underneath, the names of its piglets or chicks. Every plaque is a cell of one
// canvas texture on one merged mesh (one draw); the canvas is redrawn when a family changes (a chick hatches). View only.
// createPlaques({ root, sim, clipCoop }) → { update(frame), dispose() }
import * as THREE from 'three';
import { BARN, COOP } from '../defs/buildings.js';

const CW = 256, CH = 96, COLS = 4; // one plaque's cell in the atlas
const FONT = '"Sniglet", "Arial Rounded MT Bold", sans-serif';

// every plaque: its world centre, the way it faces (yaw), its size, and who it belongs to. A stall's plaque has a face on
// each side of its header beam (`back`: how far behind the front one), so it reads from the aisle and from in front of
// the barn, where the camera usually is.
const BEAM = 0.18;
function plaqueList(sim) {
  const list = [];
  for (const s of BARN.stalls) list.push({ at: [BARN.x + s.plaque[0], s.plaque[1], BARN.z + s.plaque[2]], yaw: s.out > 0 ? 0 : Math.PI, back: BEAM, ...BARN.plaque, owner: () => {
    const i = sim.stallOwner[s.id]; if (i < 0) return null;
    return { name: sim.pigs[i].name, young: sim.pigs.filter(p => p.mom === i).map(p => p.name) };
  } });
  for (let k = 0; k < COOP.perches; k++) { const [x, y, z] = COOP.plaqueAt(k); list.push({ coop: true, at: [COOP.x + x, y, COOP.z + z], yaw: 0, ...COOP.plaque, owner: () => {
    const b = sim.flock.birds.find(o => o.perch === k); if (!b) return null;
    return { name: b.name, young: sim.flock.birds.filter(o => o.kind === 'chick' && o.mom === b.i).map(o => o.name) };
  } }); }
  return list;
}

function drawCell(g, k, who) {
  const x = (k % COLS) * CW, y = Math.floor(k / COLS) * CH;
  g.fillStyle = '#7a4f2e'; g.fillRect(x, y, CW, CH);                       // the board's edge
  g.fillStyle = '#c99a62'; g.fillRect(x + 6, y + 6, CW - 12, CH - 12);      // its face
  g.fillStyle = '#a77a48'; for (let s = 0; s < 3; s++) g.fillRect(x + 6, y + 26 + s * 24, CW - 12, 2); // grain
  if (!who) return;
  g.fillStyle = '#3d2614'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const small = who.young.length ? who.young.join(', ') : '';
  let size = 44; g.font = `900 ${size}px ${FONT}`;
  while (size > 20 && g.measureText(who.name).width > CW - 24) { size -= 2; g.font = `900 ${size}px ${FONT}`; }
  g.fillText(who.name, x + CW / 2, y + (small ? 36 : CH / 2 + 2));
  if (small) {
    let ss = 20; g.font = `700 ${ss}px ${FONT}`;
    while (ss > 11 && g.measureText(small).width > CW - 20) { ss -= 1; g.font = `700 ${ss}px ${FONT}`; }
    g.fillText(small, x + CW / 2, y + 72);
  }
}

export function createPlaques({ root, sim, clipCoop = null }) {
  const list = plaqueList(sim), rows = Math.ceil(list.length / COLS);
  const canvas = document.createElement('canvas'); canvas.width = CW * COLS; canvas.height = CH * rows;
  const g = canvas.getContext('2d'), tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // one quad per plaque (the barn's and the coop's in two meshes, so the coop's can be cut with its back wall)
  const build = items => {
    const pos = [], uv = [], nor = [], idx = [];
    const quad = (at, yaw, p, k) => {
      const c = Math.cos(yaw), sn = Math.sin(yaw), hw = p.w / 2, hh = p.h / 2, base = pos.length / 3;
      const u0 = (k % COLS) / COLS, u1 = u0 + 1 / COLS, v1 = 1 - Math.floor(k / COLS) / rows, v0 = v1 - 1 / rows;
      for (const [a, b, u, v] of [[-hw, -hh, u0, v0], [hw, -hh, u1, v0], [hw, hh, u1, v1], [-hw, hh, u0, v1]]) {
        pos.push(at[0] + a * c, at[1] + b, at[2] - a * sn); uv.push(u, v); nor.push(sn, 0, c);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (const { p, k } of items) {
      quad(p.at, p.yaw, p, k);
      if (p.back) quad([p.at[0] - Math.sin(p.yaw) * p.back, p.at[1], p.at[2] - Math.cos(p.yaw) * p.back], p.yaw + Math.PI, p, k); // the beam's other side
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setIndex(idx);
    return geo;
  };
  const items = list.map((p, k) => ({ p, k }));
  const barnMat = new THREE.MeshLambertMaterial({ map: tex }), coopMat = new THREE.MeshLambertMaterial({ map: tex, clippingPlanes: clipCoop ? [clipCoop] : null });
  const meshes = [new THREE.Mesh(build(items.filter(o => !o.p.coop)), barnMat), new THREE.Mesh(build(items.filter(o => o.p.coop)), coopMat)];
  for (const m of meshes) { m.receiveShadow = true; m.name = 'plaques'; root.add(m); }

  let sig = null;
  function update(frame) {
    if (frame % 30 !== 0 && sig !== null) return;
    const who = list.map(p => p.owner()), now = JSON.stringify(who);
    if (now === sig) return; sig = now;
    g.clearRect(0, 0, canvas.width, canvas.height);
    who.forEach((w, k) => drawCell(g, k, w));
    tex.needsUpdate = true;
  }
  return {
    update,
    dispose() { for (const m of meshes) { root.remove(m); m.geometry.dispose(); } barnMat.dispose(); coopMat.dispose(); tex.dispose(); },
  };
}
