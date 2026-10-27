// The buildings (v3 §4, §5): the coop, the barn and the vet clinic from their glb-author models (defs/buildings.js gives
// every number), the cutaway when one is in focus (the roof floats up and away, the walls that face the camera are cut
// down to stubs by a clipping plane that sinks to the stub height, the way The Sims cuts walls), the barn's doors and the coop's pop door, a lamp inside each at night, the
// clinic's Kenney furniture, and Dr. Emmy and her cat. View only: reads the sim and the farm's focus, never writes them.
// createBuildings({ root, assets, sim, camera, renderer }) → { update(dt, focus, night), dispose() }
import * as THREE from 'three';
import { BUILDINGS, COOP, BARN, CLINIC } from '../defs/buildings.js';
import { geometryUnder } from './models.js';

export const CUT = {
  ease: 4.5,          // 1/s: how fast the roof lifts and the walls drop (about half a second)
  lift: 5,            // m the roof rises before it is hidden
  stub: 0.45,         // m a cut wall keeps above its base (the clipping plane's height over the wall's foot)
  near: 0.2,          // a wall is cut when its outward normal points this much toward the camera (cos of the angle)
  doorOpen: 1.75,     // rad: the barn's leaves swing out this far
};
// each wall face's outward normal in its building's frame; inner walls (no normal) are cut whenever the building is
const NORMAL = { wall_front: [0, 1], wall_back: [0, -1], wall_side_L: [1, 0], wall_side_R: [-1, 0] };

// The clinic's furniture (Kenney Furniture Kit, baked as furn_<name>): model, local [x, z], yaw, on top of (y), scale.
// The kit's pieces sit off their origin, so each is recentred on its footprint first.
const FS = 2.1; // the kit is about half size beside a 1.5 m vet
const S = CLINIC.spots;
const FURNISH = [
  { m: 'desk', at: [S.desk.at[0], S.desk.at[2]], yaw: S.desk.yaw },
  { m: 'computerScreen', at: [S.desk.at[0], S.desk.at[2] - 0.2], yaw: S.desk.yaw + Math.PI, y: 0.384 * FS, s: FS * 0.8 },
  { m: 'trashcan', at: [-1.9, 2.9], yaw: 0 },
  { m: 'pottedPlant', at: [S.plant.at[0], S.plant.at[2]], yaw: 0.4 },
  { m: 'pottedPlant', at: [3.9, -0.1], yaw: 1.3, s: FS * 0.8 },
  { m: 'coatRackStanding', at: [0.5, 3.45], yaw: 0 },
  { m: 'bookcaseOpenLow', at: [-1.1, 3.55], yaw: Math.PI },
  { m: 'bedSingle', at: [S.bed.at[0], S.bed.at[2]], yaw: S.bed.yaw },
  { m: 'kitchenFridgeSmall', at: [0.45, -3.4], yaw: 0 },
  { m: 'kitchenSink', at: [1.35, -3.4], yaw: 0 },
  { m: 'kitchenCabinet', at: [2.25, -3.4], yaw: 0 },
  { m: 'kitchenCoffeeMachine', at: [2.25, -3.45], yaw: 0, y: 0.45 * FS, s: FS * 0.8 },
  { m: 'rugRounded', at: [S.rug.at[0], S.rug.at[2]], yaw: 0 },
  { m: 'lampRoundFloor', at: [0.45, -0.55], yaw: 0 },
  { m: 'pillow', at: [S.catBed.at[0], S.catBed.at[2]], yaw: 0.3, s: FS * 1.3 },
];
export const VET_SCALE = 1.8, VET_H = 0.72, CAT_SCALE = 0.32; // VET_H: Kenney's mini character is about 0.72 m tall

export function createBuildings({ root, assets, sim, camera, renderer }) {
  const lay = sim.lay, group = new THREE.Group(); group.name = 'buildings'; root.add(group);
  renderer.localClippingEnabled = true; // the cut walls' planes (per material)
  // A wall face's own copy of its material with one clipping plane (always one, so the program never changes; parked far
  // above when the wall is whole), drawn double-sided so the cut shows the wall's inside rather than a hole. clone() drops
  // the compiler's shader patch, so it is carried over.
  const NO_CUT = 1e4;
  const clipped = m => {
    const c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;
    c.userData = { ...m.userData }; delete c.userData.lhShared; // ours to free
    c.side = THREE.DoubleSide; c.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), NO_CUT)];
    return c;
  };
  const barnGate = lay.gates.find(g => g.kind === 'barn');
  const box = new THREE.Box3(), v = new THREE.Vector3();

  // a node's meshes become one mesh at the node (every building material draws as the same baked-colour wood)
  const flatten = node => {
    const geo = geometryUnder(node); if (!geo) return;
    let mat = null; node.traverse(o => { if (o.isMesh && !mat) mat = o.material; });
    for (const c of [...node.children]) node.remove(c);
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = true; node.add(mesh);
  };
  const mount = (id, before = null) => {
    const B = BUILDINGS[id], obj = assets.clone(id);
    obj.position.set(B.x, 0, B.z); group.add(obj);
    obj.updateMatrixWorld(true);
    const need = n => { const o = obj.getObjectByName(n); if (!o) throw new Error(`pig-pens: building '${id}' has no '${n}' node`); return o; };
    before?.(obj);
    // one draw per moving part: the roof, each wall face, each door, and everything else that stays put
    const moving = ['roof', ...need('walls').children.map(w => w.name), 'door_L', 'door_R', 'pop_door'].map(n => obj.getObjectByName(n)).filter(Boolean);
    for (const n of moving) flatten(n);
    const top = obj.getObjectByName(id) ?? obj, rest = new THREE.Group(); rest.name = 'static'; // the model's own root node
    top.add(rest); rest.updateMatrixWorld(true); // parented first, so attach keeps every part where it is
    for (const c of [...top.children]) if (c !== rest && c.name !== 'walls' && !moving.includes(c)) rest.attach(c);
    flatten(rest);
    const walls = need('walls').children.map(w => {
      box.setFromObject(w); const mesh = w.children[0], mat = clipped(mesh.material); mesh.material = mat;
      return { node: w, n: NORMAL[w.name] ?? null, base: box.min.y, top: box.max.y + 0.05, mat, plane: mat.clippingPlanes[0], cut: 0 };
    });
    return { id, B, obj, need, roof: need('roof'), walls, cut: 0 };
  };
  // the pegboard hangs on the exam room's west wall, so it drops with that wall when the walls are cut
  const hangPegboard = obj => { const peg = obj.getObjectByName('pegboard'), wall = obj.getObjectByName('wall_side_R'); if (peg && wall) wall.attach(peg); };
  const B = { coop: mount('coop'), barn: mount('barn'), clinic: mount('clinic', hangPegboard) };

  const doorL = B.barn.need('door_L'), doorR = B.barn.need('door_R'), pop = B.coop.need('pop_door'), popY = pop.position.y;
  // the doors are on the front wall: they are cut with it, by its plane
  const frontOf = b => b.walls.find(w => w.node.name === 'wall_front');
  for (const [d, b] of [[doorL, B.barn], [doorR, B.barn], [pop, B.coop]]) d.children[0].material = frontOf(b).mat;
  let popAnim = lay.coop.open ? 1 : 0;

  // ---- lamps: warm light inside each building at night (the coop's lights the ramp, as before)
  const lamp = (x, y, z, d, k) => { const l = new THREE.PointLight('#ffb347', 0, d, 1.6); l.position.set(x, y, z); group.add(l); return { l, k }; };
  const lamps = [
    lamp(COOP.x + COOP.popDoor.x - 1.15, 1.3, COOP.z + COOP.hz + 0.6, 7, 6),
    lamp(BARN.x, BARN.eave - 0.5, BARN.z, 16, 14),
    lamp(CLINIC.x, CLINIC.eave - 0.4, CLINIC.z, 12, 10),
  ];

  // ---- the clinic's furniture, merged into one draw
  const furniture = new THREE.Group(); group.add(furniture);
  for (const f of FURNISH) {
    const src = assets.clone(`furn_${f.m}`), s = f.s ?? FS;
    box.setFromObject(src); box.getCenter(v);
    src.position.set(-v.x, 0, -v.z);                     // recentred on its footprint
    const holder = new THREE.Group(); holder.add(src);
    holder.position.set(CLINIC.x + f.at[0], f.y ?? 0, CLINIC.z + f.at[1]); holder.rotation.y = f.yaw; holder.scale.setScalar(s);
    furniture.add(holder);
  }
  flatten(furniture);

  // ---- Dr. Emmy (Mini Characters, skinned, with Kenney's clips) and her cat
  const actor = (key, scale) => {
    const o = assets.clone(key); o.scale.setScalar(scale); o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
    group.add(o);
    const mixer = new THREE.AnimationMixer(o), clips = assets.get(key).clips, acts = {};
    for (const c of clips) acts[c.name] = mixer.clipAction(c);
    let cur = null;
    const play = (name, fade = 0.25) => {
      const a = acts[name] ?? acts.idle; if (!a || a === cur) return;
      a.reset().play(); if (cur) a.crossFadeFrom(cur, fade, false); cur = a;
    };
    return { o, mixer, play };
  };
  const vet = actor('vet', VET_SCALE), cat = actor('cat', CAT_SCALE);
  cat.o.position.set(CLINIC.x + S.catBed.at[0], 0.1, CLINIC.z + S.catBed.at[2]); cat.o.rotation.y = 2.2; cat.play('idle');
  const sv = sim.vet; let vetYaw = sv.yaw;
  const bedTop = 0.26 * FS + 0.02; // on the covers (bedSingle: cover top 0.26 before FS)
  function updateVet(dt) {
    const asleep = sv.state === 'sleep';
    let d = sv.yaw - vetYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); vetYaw += d * Math.min(1, dt * 8);
    if (asleep) { // tucked up in bed on her back: lying turns her head to her -z, so her feet go half her height back from the bed's middle
      const y = CLINIC.spots.bed.yaw, half = VET_H * VET_SCALE / 2;
      vet.o.rotation.order = 'YXZ'; vet.o.rotation.set(-Math.PI / 2, y, 0);
      vet.o.position.set(sv.x + Math.sin(y) * half, bedTop, sv.z + Math.cos(y) * half);
      vet.play('idle');
    } else {
      vet.o.position.set(sv.x, 0, sv.z); vet.o.rotation.set(0, vetYaw, 0);
      vet.play(sv.moving ? 'walk' : sv.state === 'waking' ? 'sit' : 'idle');
    }
    vet.mixer.update(dt * (asleep ? 0.25 : 1)); cat.mixer.update(dt * 0.4);
  }

  const ease = (cur, tgt, dt) => cur + (tgt - cur) * Math.min(1, dt * CUT.ease);
  const smooth = u => u * u * (3 - 2 * u);
  function update(dt, focus, night) {
    for (const b of Object.values(B)) {
      const on = focus === b.id || (focus?.startsWith?.(b.id + '.') ?? false);
      b.cut = ease(b.cut, on ? 1 : 0, dt); if (Math.abs(b.cut - (on ? 1 : 0)) < 1e-3) b.cut = on ? 1 : 0;
      const u = smooth(b.cut);
      b.roof.position.y = u * CUT.lift; b.roof.visible = b.cut < 0.97;
      // which walls face the camera, from where the camera stands round this building
      const cx = camera.position.x - b.B.x, cz = camera.position.z - b.B.z, cl = Math.hypot(cx, cz) || 1;
      for (const w of b.walls) {
        const near = !w.n || (w.n[0] * cx + w.n[1] * cz) / cl > CUT.near;
        w.cut = ease(w.cut, on && near ? 1 : 0, dt * 1.4); if (w.cut < 1e-3) w.cut = 0;
        w.plane.constant = w.cut ? w.top + (w.base + CUT.stub - w.top) * smooth(w.cut) : NO_CUT; // keep y ≤ constant
        w.node.children[0].castShadow = w.cut < 0.5; // the shadow pass ignores the plane: a cut wall casts none
      }
    }
    // doors: the barn's leaves follow the gate's eased swing (farm3d), the pop door slides up
    const g = smooth(barnGate.anim ?? (barnGate.open ? 1 : 0));
    doorL.rotation.y = CUT.doorOpen * g; doorR.rotation.y = -CUT.doorOpen * g;
    popAnim += Math.sign((lay.coop.open ? 1 : 0) - popAnim) * Math.min(Math.abs((lay.coop.open ? 1 : 0) - popAnim), dt * 2.5);
    pop.position.y = popY + popAnim * COOP.popDoor.h;
    for (const { l, k } of lamps) l.intensity = night * k;
    updateVet(dt);
  }
  return {
    update,
    dispose() { // world.dispose frees the group with the farm root (the wall materials are ours: not shared)
      vet.mixer.stopAllAction(); cat.mixer.stopAllAction();
    },
  };
}
