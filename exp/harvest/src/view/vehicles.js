// The vehicles and their carts as view sync draws them (their poses and wheel spins come from the sim entities). For the combine these
// hooks add the header at its Socket_Header, stretched to the header width (bar and reel scaled in x, the end shields moved out), spin
// the reel with the ground speed, keep the chute pointing back at the wagon that is filling with its nozzle turned along the stream
// (H-H7). The mower's deck is scaled to its width and its own catcher heap shows the catcher's fill. Both blow their crop into the bin
// that is filling while they cut, raise each cart's heap with its bin's fill, and drop the crop out of a bin while it unloads over a
// sell zone (H-S1). The tractor's bale trailers carry round bales instead (H-H8): one appears on the stack for every bale's worth of
// hay cut, the stack sways with the turns, and at the hay barn the bales are lifted off one by one into the loft. Nothing here
// writes the sim.
import * as THREE from 'three';
import { COMBINE, CART, TIPCART, BALETRAILER, BALE, HAYBARN } from '../defs/models.js';
import { MEADOW } from '../sim/layout.js';
import { CROP, CROP_IDS } from '../defs/econ.js';
import { VEHICLES } from '../defs/vehicles.js';
import { G } from './grain.js';

const SP = COMBINE.spout, STREAM = 90; // kernels a second in the stream
const FLIGHT = { combine: 0.45, mower: 0.22 }; // a kernel's flight time (s), chute to bin
const DIMS = { cart: CART, tipcart: TIPCART, baletrailer: BALETRAILER }; // a cart model's dimensions (its hopper)
const LOFT = { x: MEADOW.barn.x, y: HAYBARN.eave + 1, z: MEADOW.barn.z }; // where sold bales fly to
// the k-th bale's place on a trailer bed, from the bed's top centre: two across, two along, then the next layer up
const slot = (k, out) => out.set(((k % 2) - 0.5) * (BALE.w + 0.05), Math.floor(k / 4) * BALE.r * 2 * 0.96, (((k >> 1) % 2) - 0.5) * BALE.r * 2.2);
const jitter = () => (Math.random() - 0.5) * 0.8;
const V = () => new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);

// rigOf(e) → the sim rig that owns the entity (its load, vehicle and carts), or null; grain() → the flying grain (view/grain.js)
export function vehicleViews(sync, { assets, rigOf, grain }) {
  const st = new Map(), carts = new Map(); // carts: entity id → drawn object
  const tip = V(), target = V(), local = V(), at = V(), dir = V(), land = V(), qi = new THREE.Quaternion(), qn = new THREE.Quaternion();
  // the header at the combine's Socket_Header, stretched to width w
  function addHeader(obj, w) {
    const header = assets.clone('header'), sock = obj.getObjectByName('Socket_Header');
    (sock ?? obj).add(header);
    const parts = { bar: header.getObjectByName('bar'), reel: header.getObjectByName('reel'), L: header.getObjectByName('end_L'), R: header.getObjectByName('end_R') };
    if (parts.bar) parts.bar.scale.x = w; if (parts.reel) parts.reel.scale.x = w;
    if (parts.L) parts.L.position.x = w / 2; if (parts.R) parts.R.position.x = -w / 2;
    return parts;
  }
  // the top centre of bin i's opening in the world: the vehicle's catcher (Socket_Bag) or a cart's hopper
  function binTop(r, s, i, out) {
    if (VEHICLES[r.vehicle].bag) { if (i === 0) return s.bag ? s.bag.getWorldPosition(out) : null; i--; }
    const k = r.train.carts[i], o = k && carts.get(k.e.id); if (!o) return null;
    const H = st.get(k.e.id).dims.hopper;
    o.updateMatrixWorld(); return o.localToWorld(out.set(0, H.top, (H.z0 + H.z1) / 2));
  }
  const offRig = sync.on('#rig', {
    create(e, obj) {
      const combine = e.kind === 'combine', heap = obj.getObjectByName('grain');
      if (combine && heap) heap.visible = false; // the combine's grain goes straight to the wagons
      const deck = obj.getObjectByName('deck'); if (deck) deck.scale.x = e.cutWidth ?? 1; // built 1 m wide
      const nozzle = combine ? obj.getObjectByName('nozzle') : null; // at the pipe's end, in the spout's (pivot) frame; it carries Socket_SpoutTip
      st.set(e.id, { combine, parts: combine ? null : {}, heap: combine ? null : heap, bag: obj.getObjectByName('Socket_Bag'),
        spout: combine ? obj.getObjectByName('spout') : null, nozzle, tip: obj.getObjectByName('Socket_SpoutTip'),
        tipX: nozzle?.position.x ?? 0, tipZ: nozzle?.position.z ?? -SP.length,
        spin: 0, aim: 0, last: -1, flow: 0, owed: 0, lastFill: -1, lastN: -1, dropOwed: 0 });
    },
    frame(e, obj, alpha, view) {
      const s = st.get(e.id), r = rigOf(e); if (!s || !r) return;
      const dt = view?.dt ?? 0, g = grain();
      if (!s.parts) { if (!assets.has('header')) return; s.parts = addHeader(obj, e.cutWidth ?? 3); } // sync waits for the combine's model, not the header's
      if (s.parts.reel) { s.spin += dt * (0.6 + r.c.speed * 0.9); s.parts.reel.rotation.x = -s.spin; }
      // the mower's own catcher: its heap, and the clippings it drops at the compost bins
      if (s.heap) {
        const b = r.load.bins[0], fill = b.n / b.cap;
        if (fill !== s.lastFill) { s.lastFill = fill; s.heap.visible = fill > 0.01; s.heap.scale.y = Math.max(0.05, fill); }
        const dropping = s.lastN > b.n && r.selling; s.lastN = b.n;
        if (g && dropping && s.bag) for (s.dropOwed += STREAM * dt; s.dropOwed >= 1; s.dropOwed--) {
          s.bag.getWorldPosition(at); g.emit(at.x + jitter() * 0.5, at.y - 0.3, at.z + jitter() * 0.5, jitter() * 0.5, -1.2, jitter() * 0.5, CROP[CROP_IDS[b.last]].grain, 1.2, -0.3);
        }
      }
      // the bin filling (or the last one, full)
      const i = r.load.filling(), k = i < 0 ? r.load.bins.length - 1 : i;
      obj.updateMatrixWorld(); // this frame's pose (sync moved it since the last render)
      if (!binTop(r, s, k, target)) return;
      const flight = FLIGHT[r.vehicle] ?? 0.4;
      if (s.spout) {
        // the chute swings about its root until its nozzle (folded at (tx, tz) from the root) points at the bin: R_y(a) turns the
        // nozzle's bearing atan2(tx, tz) by a, so a = the target's bearing less the nozzle's
        obj.worldToLocal(local.copy(target));
        const d = Math.atan2(local.x - SP.root[0], local.z - SP.root[2]) - Math.atan2(s.tipX, s.tipZ); // both near ±π (straight back): wrap
        const want = Math.max(-0.7, Math.min(0.7, Math.atan2(Math.sin(d), Math.cos(d))));
        s.aim += (want - s.aim) * Math.min(1, dt * 6);
        s.spout.rotation.y = s.aim; s.spout.updateMatrixWorld();
      }
      // the crop leaves the tip for where the bin will be when it lands (it rolls on under it)
      if (!s.tip) return;
      s.tip.getWorldPosition(tip);
      const lv = r.c.body.linvel();
      at.set(target.x + lv.x * flight, target.y - 0.2, target.z + lv.z * flight);
      // the combine's nozzle points the way the grain leaves it, as seen from the moving combine: the throw's velocity less its own
      if (s.nozzle) {
        dir.set((at.x - tip.x) / flight - lv.x, (at.y - tip.y) / flight + 0.5 * G * flight, (at.z - tip.z) / flight - lv.z).normalize();
        s.spout.getWorldQuaternion(qi).invert(); dir.applyQuaternion(qi); // into the spout's frame (the nozzle's parent)
        qn.setFromUnitVectors(DOWN, dir); s.nozzle.quaternion.slerp(qn, Math.min(1, dt * 8));
      }
      // the stream: while the load grew in the last moment
      const total = r.load.total();
      if (total > s.last && s.last >= 0) s.flow = 0.35; else s.flow = Math.max(0, s.flow - dt);
      s.last = total;
      if (!g || s.flow <= 0 || dt <= 0) return;
      const colour = CROP[CROP_IDS[r.cutCrop]].grain, spread = s.combine ? 0.6 : 0.25;
      for (s.owed += STREAM * dt; s.owed >= 1; s.owed--) g.throwTo(tip, land.set(at.x + jitter() * spread, at.y, at.z + jitter() * spread), colour, flight, jitter);
    },
    remove(e) { st.delete(e.id); },
  });
  const flying = []; // sold bales on their way to the loft: { o, from, t }
  // a bale trailer's stack: bales added and taken off to match the bin, popped in, flown off at the hay barn, swaying with the turns
  function baleFrame(s, obj, r, b, dt) {
    if (!assets.has('bale')) return;
    const want = Math.floor((b?.n ?? 0) / VEHICLES[r.vehicle].bale);
    while (s.bales.length < want) {
      const o = assets.clone('bale'); slot(s.bales.length, o.position); o.scale.setScalar(0.01); s.stack.add(o); s.bales.push({ o, pop: 0 });
    }
    while (s.bales.length > want) {
      const { o } = s.bales.pop();
      if (r.selling) { o.getWorldPosition(at); s.stack.remove(o); obj.parent.add(o); o.position.copy(at); o.rotation.set(0, obj.rotation.y, 0); flying.push({ o, from: at.clone(), t: 0 }); }
      else s.stack.remove(o);
    }
    for (const k of s.bales) if (k.pop < 1) { k.pop = Math.min(1, k.pop + dt * 4); k.o.scale.setScalar(0.3 + 0.7 * Math.sin(k.pop * Math.PI / 2) + 0.15 * Math.sin(k.pop * Math.PI)); }
    // sway: lean out of the turn by the turn rate times the speed
    const lean = Math.max(-0.12, Math.min(0.12, -r.c.body.angvel().y * r.c.speed * 0.03));
    s.stack.rotation.z += (lean - s.stack.rotation.z) * Math.min(1, dt * 4);
  }
  // the flying bales arc up to the loft and vanish
  function flyFrame(dt) {
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i]; f.t += dt / 0.8;
      if (f.t >= 1) { f.o.removeFromParent(); flying.splice(i, 1); continue; }
      const t = f.t, k = t * t * (3 - 2 * t);
      f.o.position.set(f.from.x + (LOFT.x - f.from.x) * k, f.from.y + (LOFT.y - f.from.y) * k + Math.sin(t * Math.PI) * 3, f.from.z + (LOFT.z - f.from.z) * k);
      f.o.rotation.x += dt * 4; f.o.scale.setScalar(1 - 0.5 * t);
    }
  }
  const offCart = sync.on('#cart', {
    create(e, obj) {
      carts.set(e.id, obj);
      const s = { dims: DIMS[e.model] ?? CART, grain: obj.getObjectByName('grain'), lastFill: -1, lastN: -1, owed: 0, bales: null, stack: null };
      if (e.model === 'baletrailer') { const B = BALETRAILER.bed; s.bales = []; s.stack = new THREE.Group(); s.stack.position.set(0, B.top, (B.z0 + B.z1) / 2); obj.add(s.stack); }
      st.set(e.id, s);
    },
    frame(e, obj, alpha, view) {
      const s = st.get(e.id), r = rigOf(e); if (!s || !r) return;
      const b = r.load.bins[(VEHICLES[r.vehicle].bag ? 1 : 0) + (e.cart ?? 0)], fill = b ? b.n / b.cap : 0;
      if (s.bales) { const dt = view?.dt ?? 0; baleFrame(s, obj, r, b, dt); if (e.cart === 0) flyFrame(dt); return; }
      if (s.grain && fill !== s.lastFill) { s.lastFill = fill; s.grain.visible = fill > 0.01; s.grain.scale.y = Math.max(0.05, fill); }
      // unloading over a sell zone: the crop falls out of the floor
      const n = b?.n ?? 0, dropping = s.lastN > n && r.selling; s.lastN = n;
      const g = grain(), dt = view?.dt ?? 0, H = s.dims.hopper;
      if (!g || !dropping) return;
      const colour = CROP[CROP_IDS[b.last]].grain;
      for (s.owed += STREAM * 1.5 * dt; s.owed >= 1; s.owed--) {
        obj.localToWorld(at.set((Math.random() - 0.5) * H.half * 1.5, H.floor - 0.1, H.z0 + Math.random() * (H.z1 - H.z0)));
        g.emit(at.x, at.y, at.z, jitter() * 0.3, -1.5, jitter() * 0.3, colour, 1.5, -0.5);
      }
    },
    remove(e) { carts.delete(e.id); st.delete(e.id); },
  });
  return () => { offRig(); offCart(); st.clear(); carts.clear(); for (const f of flying) f.o.removeFromParent(); flying.length = 0; };
}
