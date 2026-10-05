// Tractor, trailer and wagon meshes. Poses come from interpolated snapshots, not straight from Rapier.
import * as THREE from 'three';
import { ASSETS, geoFrom, boxGeo, mergeGeos } from './gfx.js';
import { TP } from '../sim/tractor.js';
import { TR } from '../sim/hitch.js';

export const TRACTOR_COLORS = { red: '#d8342c', green: '#3f9b3a', blue: '#2f6fd6', yellow: '#f2c230', pink: '#f07aa8', rainbow: null };
const S = TP.scale;
export function createVehicles3D(scene, tractor, train) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const modelRot = new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(S, S, S));
  const baseBody = geoFrom([ASSETS.tractor.body]);
  const isPaint = (r, g, b) => b > r * 1.1 && r > 0.08; // Kenney's grey-blue bodywork
  const body = new THREE.Mesh(baseBody.clone(), mat); body.castShadow = true; body.matrixAutoUpdate = false; scene.add(body);
  function setColor(name) {
    const src = baseBody.attributes.color, dst = body.geometry.attributes.color, pos = body.geometry.attributes.position, c = new THREE.Color();
    for (let i = 0; i < src.count; i++) {
      const r = src.getX(i), g = src.getY(i), b = src.getZ(i);
      if (!isPaint(r, g, b)) { dst.setXYZ(i, r, g, b); continue; }
      const l = 0.3 * r + 0.6 * g + 0.1 * b;
      if (name === 'rainbow') c.setHSL(((pos.getZ(i) + 1) * 0.5) % 1, 0.75, 0.5); else c.set(TRACTOR_COLORS[name]).convertSRGBToLinear();
      dst.setXYZ(i, c.r * l * 2.6, c.g * l * 2.6, c.b * l * 2.6);
    }
    dst.needsUpdate = true;
  }
  setColor('red');
  const wheels = tractor.W.map(w => { const g = geoFrom([ASSETS.tractor[w.name]]); g.translate(-w.mx, -w.my, -w.mz); const m = new THREE.Mesh(g, mat); m.castShadow = true; m.matrixAutoUpdate = false; scene.add(m); return m; });
  // trailer bed: wooden box with rails, tongue and two wheels
  const carGeo = mergeGeos([
    boxGeo(TR.half.x * 2, TR.half.y * 2, TR.half.z * 2, 0, 0, 0, '#9a6a3f'),
    boxGeo(TR.half.x * 2, 0.45, 0.08, 0, 0.37, TR.half.z, '#c08a55'), boxGeo(TR.half.x * 2, 0.45, 0.08, 0, 0.37, -TR.half.z, '#c08a55'),
    boxGeo(0.08, 0.45, TR.half.z * 2, TR.half.x, 0.37, 0, '#c08a55'), boxGeo(0.08, 0.45, TR.half.z * 2, -TR.half.x, 0.37, 0, '#c08a55'),
    boxGeo(1.9, 0.1, 0.12, TR.half.x + 0.95, -0.15, 0, '#555555'),
  ]);
  const wheelGeo = new THREE.CylinderGeometry(TR.wheelR, TR.wheelR, 0.3, 16).rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: '#333333' });
  const cars = train.cars.map(() => {
    const m = new THREE.Mesh(carGeo, mat); m.castShadow = true; m.matrixAutoUpdate = false; scene.add(m);
    const ws = [0, 1].map(() => { const w = new THREE.Mesh(wheelGeo, wheelMat); w.castShadow = true; w.matrixAutoUpdate = false; scene.add(w); return w; });
    return { m, ws };
  });
  const M = new THREE.Matrix4(), T = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  return {
    setColor, bodyMesh: body, carMeshes: cars.map(c => c.m),
    update(snap) { // snap.tractor / snap.cars[i]: { p: Vector3, q: Quaternion }
      M.compose(snap.tractor.p, snap.tractor.q, one);
      body.matrix.multiplyMatrices(M, modelRot); body.matrixWorldNeedsUpdate = true;
      tractor.W.forEach((w, i) => {
        const susp = tractor.vc.wheelSuspensionLength(i) ?? TP.suspRest, rot = tractor.vc.wheelRotation(i) ?? 0, st = tractor.vc.wheelSteering(i) ?? 0;
        wheels[i].matrix.copy(M).multiply(T.makeTranslation(w.cx, w.cy + 0.12 - susp, w.cz)).multiply(T.makeRotationY(st)).multiply(T.makeRotationZ(-rot)).multiply(modelRot);
        wheels[i].matrixWorldNeedsUpdate = true;
      });
      train.cars.forEach((c, k) => {
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
