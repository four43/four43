// The flat's working things (2.9.0, clinic.js PROPS; places: CLINIC.props): water from the shower head and the taps, the
// bathroom basin filling and draining, the toilet's lid and its flush, the laptop's lid, the fridge door. View only: reads
// sim.clinic.props, never writes it. createFlat({ root, sim, pieces }) → { update(dt), dispose() } (pieces: the furnished
// pieces that move, by prop id: the Kenney toilet and fridge, our laptop)
import * as THREE from 'three';
import { CLINIC } from '../defs/buildings.js';
import { PROPS } from '../clinic.js';

const OPEN = { toilet: 1.75, laptop: 1.85, fridge: 1.7 }; // rad: lid up, screen up, door wide
const EASE = 7;                                             // 1/s: how fast a lid or a door swings
// water out of a running spout, droplets a second: the shower's fall from its head (speed down, m/s; spread, m); a tap's
// splash up (m/s) and out (m/s) of where its stream lands
const SPRAY = {
  shower: { rate: 160, down: 0.5, spread: 0.2 },
  tap:    { rate: 80, up: [1.0, 1.7], out: 0.5 },
};
const MAX = 700, DEPTH = 0.06, STREAM = 0.35; // droplets at once; how far a full basin's water lies below its rim; how far
// toward the basin's middle a tap's stream lands (of the way from the spout)
const world = ([x, y, z]) => [CLINIC.x + x, y, CLINIC.z + z];

// a dot of water, soft-edged
function dropTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(210,238,255,0.85)'); gr.addColorStop(1, 'rgba(200,235,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
}
// water seen from above with a swirl in it (a draining basin, a flushing bowl)
function swirlTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#7cc8f0'; g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 6; g.lineCap = 'round';
  for (let arm = 0; arm < 3; arm++) {
    g.beginPath();
    for (let a = 0; a < 5; a += 0.1) { const r = 6 + a * 11, t = a + arm * 2.09; g.lineTo(S / 2 + Math.cos(t) * r, S / 2 + Math.sin(t) * r); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// A pivot on one edge of a part, in its piece's frame, holding the part: 'back' (a lid: the -z edge, on top) or 'left'
// (a door: the -x edge, at the front). The piece's own frame has the kit's front at +z.
function hinge(piece, part, edge) {
  piece.updateMatrixWorld(true);
  const inv = piece.matrixWorld.clone().invert(), b = new THREE.Box3(), m = new THREE.Matrix4();
  part.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld))); } });
  const p = new THREE.Group(); p.name = `${part.name}_hinge`;
  if (edge === 'back') p.position.set((b.min.x + b.max.x) / 2, b.max.y, b.min.z); else p.position.set(b.min.x, (b.min.y + b.max.y) / 2, b.max.z);
  piece.add(p); p.attach(part); return p;
}

// The shower's glass, see-through again (the bake draws every kit material as opaque wood): the Furniture Kit's glass is
// its one colour with more green than blue (#daebe3), so a mesh whose vertex colours run that way is a pane
function glaze(piece, glass) {
  piece.traverse(o => {
    const c = o.isMesh && o.geometry.attributes.color; if (!c) return;
    let g = 0, b = 0; for (let i = 0; i < c.count; i++) { g += c.getY(i); b += c.getZ(i); }
    if (g > b + 0.01 * c.count) { o.material = glass; o.castShadow = false; }
  });
}

export function createFlat({ root, sim, pieces }) {
  const props = sim.clinic.props, group = new THREE.Group(); group.name = 'flat'; root.add(group);
  const glass = new THREE.MeshLambertMaterial({ color: '#d4ece6', transparent: true, opacity: 0.32, depthWrite: false });
  glaze(pieces.shower, glass);
  const need = (id, name) => { const n = pieces[id]?.getObjectByName(name); if (!n) throw new Error(`pig-pens: the clinic's ${id} has no '${name}'`); return n; };
  // the swinging parts: a pivot each, turned about x (lids) or y (the door); a lid lifts with -x, the door swings out with -y
  const swing = {
    toilet: { node: hinge(pieces.toilet, need('toilet', 'cover'), 'back'), axis: 'x', open: () => props.toilet.state !== 'shut', a: 0 },
    laptop: { node: need('laptop', 'lid'), axis: 'x', open: () => props.laptop.state === 'open', a: 0 },
    fridge: { node: hinge(pieces.fridge, need('fridge', 'doorFridge'), 'left'), axis: 'y', open: () => props.fridge.state === 'open', a: 0 },
  };
  for (const [id, s] of Object.entries(swing)) { s.a = s.open() ? 1 : 0; s.node.rotation[s.axis] = -OPEN[id] * s.a; }

  // ---- water droplets: one Points cloud for every spout
  const pos = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3), floor = new Float32Array(MAX);
  let n = 0;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); geo.setDrawRange(0, 0);
  const dropMap = dropTexture();
  const drops = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.11, map: dropMap, color: '#a8e0ff', transparent: true, depthWrite: false }));
  drops.frustumCulled = false; group.add(drops);
  const streamMat = new THREE.MeshLambertMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.7, depthWrite: false });
  const emitters = Object.entries(CLINIC.props).filter(([, P]) => P.spout).map(([id, P]) => {
    const e = { id, spout: world(P.spout), basin: world(P.basin), kind: id === 'shower' ? SPRAY.shower : SPRAY.tap, acc: 0, stream: null, foot: null };
    if (id !== 'shower') { // a tap's stream: a thin glassy column from the spout down into the basin, flickering while it runs
      const [sx, sy, sz] = e.spout, [bx, by, bz] = e.basin, end = new THREE.Vector3(sx + (bx - sx) * STREAM, by, sz + (bz - sz) * STREAM);
      const from = new THREE.Vector3(sx, sy, sz), len = from.distanceTo(end);
      e.foot = [end.x, end.y, end.z];
      e.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, len, 8).translate(0, -len / 2, 0), streamMat);
      e.stream.position.copy(from); e.stream.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), end.sub(from).normalize());
      e.stream.visible = false; group.add(e.stream);
    }
    return e;
  });
  const running = id => { const p = props[id]; return id === 'bathSink' ? p.state === 'run' : p.state === 'on'; };
  function spray(dt) {
    for (const e of emitters) {
      const on = running(e.id);
      if (e.stream) { e.stream.visible = on; e.stream.scale.set(0.85 + 0.3 * Math.random(), 1, 0.85 + 0.3 * Math.random()); }
      if (!on) { e.acc = 0; continue; }
      const K = e.kind, [sx, sy, sz] = e.spout, by = e.basin[1];
      e.acc += dt * K.rate;
      while (e.acc >= 1 && n < MAX) {
        e.acc--; const i = n++, a = Math.random() * Math.PI * 2, j = 0.85 + Math.random() * 0.3;
        if (e.stream) { // a splash out of the stream's foot
          const [fx, fy, fz] = e.foot, o = K.out * Math.random();
          pos.set([fx, fy + 0.01, fz], i * 3); vel.set([Math.cos(a) * o, K.up[0] + Math.random() * (K.up[1] - K.up[0]), Math.sin(a) * o], i * 3);
        } else {
          const r = Math.sqrt(Math.random()) * K.spread;
          pos.set([sx + Math.cos(a) * r, sy, sz + Math.sin(a) * r], i * 3); vel.set([0, -K.down * j, 0], i * 3);
        }
        floor[i] = by;
      }
    }
    let w = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 3; vel[o + 1] -= 9.81 * dt;
      pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
      if (pos[o + 1] < floor[i]) continue; // into the basin (or onto the shower tray)
      if (w !== i) { pos.copyWithin(w * 3, o, o + 3); vel.copyWithin(w * 3, o, o + 3); floor[w] = floor[i]; }
      w++;
    }
    n = w; geo.setDrawRange(0, n); geo.attributes.position.needsUpdate = true;
  }

  // ---- standing water: the bathroom basin (fills, stands, drains with a swirl) and the toilet bowl (swirls when flushed)
  const swirlMap = swirlTexture();
  const pool = (id, opacity) => {
    const [x, y, z] = world(CLINIC.props[id].basin), r = CLINIC.props[id].basin[3];
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: swirlMap, transparent: true, opacity, depthWrite: false }));
    m.position.set(x, y, z); m.userData.y = y; m.renderOrder = 1; group.add(m); return m;
  };
  const basin = pool('bathSink', 0.85), bowl = pool('toilet', 0.9);
  function pools(dt) {
    const p = props.bathSink, T = PROPS.bathSink, u = Math.min(1, p.t / (T[p.state] ?? 1));
    const level = { off: 0, run: u, full: 1, drain: 1 - u }[p.state];
    basin.visible = level > 0.02;
    basin.position.y = basin.userData.y - DEPTH * (1 - level); basin.scale.setScalar(0.55 + 0.45 * level);
    if (p.state === 'drain') basin.rotation.y -= dt * 7;
    const f = props.toilet, k = f.state === 'flush' ? Math.min(1, f.t / PROPS.flush) : 0, dip = Math.sin(Math.PI * k); // down and back up
    bowl.visible = swing.toilet.a > 0.05;                    // only seen with the lid up
    bowl.position.y = bowl.userData.y - 0.08 * dip; bowl.scale.setScalar(1 - 0.45 * dip);
    if (f.state === 'flush') bowl.rotation.y -= dt * (6 + 10 * dip);
  }

  function update(dt) {
    for (const [id, s] of Object.entries(swing)) {
      s.a += ((s.open() ? 1 : 0) - s.a) * Math.min(1, dt * EASE);
      s.node.rotation[s.axis] = -OPEN[id] * s.a;
    }
    spray(dt); pools(dt);
  }
  return {
    update,
    dispose() { root.remove(group); geo.dispose(); drops.material.dispose(); streamMat.dispose(); glass.dispose(); for (const e of emitters) e.stream?.geometry.dispose(); dropMap.dispose(); swirlMap.dispose(); for (const m of [basin, bowl]) { m.geometry.dispose(); m.material.dispose(); } },
  };
}
