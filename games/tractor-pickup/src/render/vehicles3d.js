// Tractor, trailer and wagon meshes. Poses come from interpolated snapshots, not straight from Rapier.
import * as THREE from 'three';
import { ASSETS, geoFrom } from './gfx.js';
import { TP } from '../sim/tractor.js';
import { TR } from '../sim/hitch.js';
import { dirtify } from './dirtMat.js';

// W-3: the paints, in unlock order (sim/progress.js). rainbow runs through the hues along the tractor.
export const PAINTS = { red: '#d8342c', yellow: '#f2c230', green: '#3f9b3a', blue: '#2f6fd6', pink: '#f07aa8', orange: '#f28a1e', purple: '#8a4fd0', white: '#f4f1ea', rainbow: null };
const S = TP.scale;
// The two paint areas (material paint-body: the body node; paint-trim: the fenders and roof nodes of tractor.glb) keep their own shading: each vertex gets the paint times
// its brightness relative to the brightest vertex of its area.
export function paintable(parts) {
  const g = geoFrom(parts), area = parts.flatMap(p => p.area || Array(p.pos.length / 3).fill(0)), src = g.attributes.color.array.slice(), lum = [], top = [0, 0, 0];
  for (let i = 0; i < area.length; i++) { const l = 0.3 * src[i * 3] + 0.6 * src[i * 3 + 1] + 0.1 * src[i * 3 + 2]; lum.push(l); top[area[i]] = Math.max(top[area[i]], l); }
  const c = new THREE.Color();
  g.userData.paint = ({ body, trim }) => {
    const dst = g.attributes.color, pos = g.attributes.position;
    for (let i = 0; i < area.length; i++) {
      const a = area[i]; if (!a) continue;
      const name = a === 1 ? body : trim, k = Math.min(1.1, 0.25 + 0.85 * lum[i] / top[a]);
      if (name === 'rainbow') c.setHSL(((pos.getZ(i) + 1) * 0.5) % 1, 0.75, 0.5); else c.set(PAINTS[name] ?? PAINTS.red);
      dst.setXYZ(i, c.r * k, c.g * k, c.b * k);
    }
    dst.needsUpdate = true;
  };
  return g;
}
export function createVehicles3D(scene, tractor, train) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const dirty = base => { const m = base.clone(), d = dirtify(m); m.userData.dirt = d.uniforms.uDirt; return m; }; // one clone per thing that gets dirty on its own (T-16)
  const modelRot = new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(S, S, S));
  const bodyMat = dirty(mat), wheelsMat = dirty(mat), body = new THREE.Mesh(paintable(Object.entries(ASSETS.tractor).filter(([k]) => !k.startsWith('wheel')).map(([, p]) => p)), bodyMat); body.castShadow = true; body.matrixAutoUpdate = false; scene.add(body);
  const wheels = tractor.W.map(w => { const g = paintable([ASSETS.tractor[w.name]]); g.translate(-w.mx, -w.my, -w.mz); const m = new THREE.Mesh(g, wheelsMat); m.castShadow = true; m.matrixAutoUpdate = false; scene.add(m); return m; });
  const setPaint = p => { for (const m of [body, ...wheels]) m.geometry.userData.paint(p); };
  setPaint({ body: 'red', trim: 'yellow' });
  // trailer and wagon: the bed (rails, tongue) and two wheels each
  const carGeo = geoFrom([ASSETS.trailer.bed]), wheelGeo = geoFrom([ASSETS.trailer.wheel]), baseWheelMat = mat; // trailer.glb, in car space
  const cars = train.cars.map(() => {
    const carMat = dirty(mat), wheelMat = dirty(baseWheelMat), m = new THREE.Mesh(carGeo, carMat); m.castShadow = true; m.matrixAutoUpdate = false; scene.add(m);
    const ws = [0, 1].map(() => { const w = new THREE.Mesh(wheelGeo, wheelMat); w.castShadow = true; w.matrixAutoUpdate = false; scene.add(w); return w; });
    return { m, ws, mats: [carMat, wheelMat] };
  });
  const M = new THREE.Matrix4(), T = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  return {
    setPaint, bodyMesh: body, carMeshes: cars.map(c => c.m),
    update(snap) { // snap.tractor / snap.cars[i]: { p: Vector3, q: Quaternion }; snap.dirt: the tractor's dirt level (cars carry their own)
      const td = snap.dirt ?? 0; bodyMat.userData.dirt.value = wheelsMat.userData.dirt.value = td;
      M.compose(snap.tractor.p, snap.tractor.q, one);
      body.matrix.multiplyMatrices(M, modelRot); body.matrixWorldNeedsUpdate = true;
      tractor.W.forEach((w, i) => {
        const susp = tractor.vc.wheelSuspensionLength(i) ?? TP.suspRest, rot = tractor.vc.wheelRotation(i) ?? 0, st = tractor.vc.wheelSteering(i) ?? 0;
        wheels[i].matrix.copy(M).multiply(T.makeTranslation(w.cx, w.cy + 0.12 - susp, w.cz)).multiply(T.makeRotationY(st)).multiply(T.makeRotationZ(-rot)).multiply(modelRot);
        wheels[i].matrixWorldNeedsUpdate = true;
      });
      train.cars.forEach((c, k) => {
        for (const cm of cars[k].mats) cm.userData.dirt.value = c.dirt ?? 0;
        M.compose(snap.cars[k].p, snap.cars[k].q, one); cars[k].m.matrix.copy(M); cars[k].m.matrixWorldNeedsUpdate = true;
        [-1, 1].forEach((side, i) => {
          const susp = c.vc.wheelSuspensionLength(i) ?? TR.suspRest, rot = c.vc.wheelRotation(i) ?? 0;
          cars[k].ws[i].matrix.copy(M).multiply(T.makeTranslation(TR.axleX, -susp, side * TR.track)).multiply(T.makeRotationZ(-rot));
          cars[k].ws[i].matrixWorldNeedsUpdate = true;
        });
      });
    },
  };
}
