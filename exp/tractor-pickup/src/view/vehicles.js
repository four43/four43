// The train's drawing (3l Task 16; was render/vehicles3d.js, render/others3d.js and view/bodies.js). View sync clones each tractor and
// car entity's model and poses it from the pool every frame (E-11, interpolated), wheels included: the vehicle kit writes each wheel's
// part pose (e.partXf) and sync turns the named node about its hub (3g Task 13b). These hooks add the Kenney axis fix (model +z is the
// chassis +x) and the car's second wheel node at create, then, on a change only, the paint (W-3: the engine's shading-preserving paint
// on the paint-body / paint-trim slots, rainbow a hue ramp along the tractor; 3f Task 8b) and the away ghost (M-39, M-40). Local and
// remote trains alike.
import * as THREE from 'three';
import { CAR_WHEELS } from '../sim/hitch.js';

// W-3: the paints as CSS colours for the UI (roster, menus, HUD), in unlock order; rainbow is null there (the UI draws its own gradient)
export const PAINTS = { red: '#d8342c', yellow: '#f2c230', green: '#3f9b3a', blue: '#2f6fd6', pink: '#f07aa8', orange: '#f28a1e', purple: '#8a4fd0', white: '#f4f1ea', rainbow: null };
// rainbow on the tractor (1.8's paintable): hue = fract((z + 1) / 2) along the model's z, saturation 0.75, lightness 0.5
export const RAINBOW = Object.freeze({ hue: Object.freeze({ axis: Object.freeze([0, 0, 1]), from: -1, to: 1, s: 0.75, l: 0.5 }) });
// the compiler's paint look (RENDER.paint): the paint base is chassis (it takes dirt); shade k = 0.25 + 0.85 × relative brightness, at most 1.1
export const PAINT_LOOK = Object.freeze({ base: 'chassis', shade: Object.freeze([0.25, 0.85, 1.1]) });
const COAT = Object.freeze({ ...PAINTS, rainbow: RAINBOW });
// a { body, trim } pair of paint names → the engine's paint values (an unknown name paints red, as 1.8 did); on a change only
export const paintValues = ({ body, trim }) => ({ body: COAT[body] ?? PAINTS.red, trim: COAT[trim] ?? PAINTS.red });
const AXES = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
// the away ghost writes only this train's own materials: coverageView's per-entity clones (3f mc.coverage, lhShared false; every train
// material has a coverage block). A shared compiled material is every train's, so ghosting it would ghost them all: that throws.
function ghost(obj, on, shadowOf) {
  obj.traverse(m => { if (!m.isMesh) return; m.castShadow = !on && shadowOf(m);
    for (const mat of [].concat(m.material)) {
      if (mat.userData.lhShared !== false) throw new Error(`tractor: ghost needs per-entity materials (mesh '${m.name}' has the shared '${mat.name}'): register coverageView, and give the registry material a coverage block`);
      mat.transparent = on; mat.opacity = on ? 0.45 : 1; mat.depthWrite = !on; mat.needsUpdate = true; } });
}
// materials: view.materials (repaint, 3f Task 8b); paintOf(e) → { body, trim } names; awayOf(e) → boolean (remote trains, Part E); local
// trains give false
export function trainViews(sync, { materials, paintOf, awayOf = () => false }) {
  const state = new Map(); // entity id → per-train view state (made at create, dropped at remove)
  const offTractor = sync.on('#tractor', {
    create(e, obj) { // static shaping only, before sync measures the wheel hubs (the wheels are sync's, from e.partXf)
      const inner = new THREE.Group(); inner.quaternion.copy(AXES); while (obj.children.length) inner.add(obj.children[0]); obj.add(inner);
      state.set(e.id, { body: '', trim: '', away: false }); // paint: the first frame repaints (lhPaint is model space, so the axis fix does not move the rainbow)
    },
    frame(e, obj) {
      const st = state.get(e.id); if (!st) return;
      const p = paintOf(e); if (p.body !== st.body || p.trim !== st.trim) { st.body = p.body; st.trim = p.trim; materials.repaint(obj, paintValues(p)); } // a change only: repaint allocates
      const away = awayOf(e); if (away !== st.away) { st.away = away; ghost(obj, away, m => !m.name.startsWith('wheel')); }
    },
    remove(e) { state.delete(e.id); }, // per-entity materials go with the object (coverageView's remove, sync's disposeTree); geometry is the template's
  });
  const offCar = sync.on('#car', {
    create(e, obj) { // trailer.glb has one wheel node (centred, models.mjs); the kit's two wheel parts need a node each: CAR_WHEELS (side -1, +1)
      const w0 = obj.getObjectByName('wheel'), w1 = w0.clone(); w0.parent.add(w1); w0.name = CAR_WHEELS[0]; w1.name = CAR_WHEELS[1];
      state.set(e.id, { away: false });
    },
    frame(e, obj) {
      const st = state.get(e.id); if (!st) return; const away = awayOf(e); if (away !== st.away) { st.away = away; ghost(obj, away, m => m.name === 'bed'); }
    },
    remove(e) { state.delete(e.id); },
  });
  return () => { offTractor(); offCar(); state.clear(); };
}
