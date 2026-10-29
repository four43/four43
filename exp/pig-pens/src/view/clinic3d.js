// The exam room's view (v3 §9.4): the vet's tools on their pegs on the pegboard (vet-tools.glb), the one being dragged
// following the finger (the farm's s.exam.drag, held at EXAM_DRAG.y) and easing back to its peg when let go, and the
// lollipop for a patient made better. View only. createExamRoom({ root, assets, sim }) → { update(dt, s), dispose() }
import * as THREE from 'three';
import { CLINIC } from '../defs/buildings.js';

const BACK = 7, HELD = 1.6; // 1/s: a let-go tool eases back to its peg; how much bigger a held one shows

export function createExamRoom({ root, assets, sim }) {
  const src = assets.clone('vetTools'), group = new THREE.Group(); group.name = 'examTools'; root.add(group);
  src.updateMatrixWorld(true);
  const take = name => { const n = src.getObjectByName(name); if (!n) throw new Error(`pig-pens: vet-tools has no '${name}'`); n.removeFromParent(); n.position.set(0, 0, 0); n.rotation.set(0, 0, 0); n.traverse(o => { if (o.isMesh) o.castShadow = true; }); group.add(n); return n; };
  // each tool hangs on its peg, its front (+z) turned to face out of the west wall (+x)
  const tools = CLINIC.pegs.map(({ tool, at: [x, y, z] }) => {
    const n = take(`tool_${tool}`), home = new THREE.Vector3(CLINIC.x + x, y, CLINIC.z + z);
    n.position.copy(home); n.rotation.y = Math.PI / 2;
    return { tool, n, home };
  });
  const lolly = take('tool_lollipop'); lolly.visible = false;
  const want = new THREE.Vector3(), q = new THREE.Quaternion(), qHang = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)),
    qHeld = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, -0.9, 'YXZ')); // held: tipped toward the table
  let t = 0;
  function update(dt, s) {
    t += dt;
    const drag = s.exam?.drag, k = Math.min(1, dt * BACK);
    for (const T of tools) {
      const held = drag?.tool === T.tool && drag.at;
      if (held) want.set(drag.at[0], drag.at[1] + 0.2, drag.at[2]); else want.copy(T.home); // its peg end a little above the finger
      T.n.position.lerp(want, held ? Math.min(1, dt * 20) : k);
      T.n.quaternion.slerp(held ? qHeld : qHang, held ? Math.min(1, dt * 12) : k);
      T.n.scale.setScalar(T.n.scale.x + ((held ? HELD : 1) - T.n.scale.x) * Math.min(1, dt * 10)); // a held tool is bigger in the hand
    }
    // the lollipop: bobbing in front of the patient while it has its treat, and carried out of the door
    const ex = sim.clinic.exam, p = ex.state === 'cured' || ex.state === 'leave' ? sim.clinic.patient() : null;
    lolly.visible = !!p;
    if (p) { // on the table it faces the camera (east); walking out, it is in the patient's mouth
      const fy = ex.state === 'leave' ? p.yaw : Math.PI / 2, s = Math.sin(fy), c = Math.cos(fy);
      lolly.position.set(p.px + s * 0.45, p.py + 0.55 + 0.05 * Math.sin(t * 5), p.pz + c * 0.45);
      lolly.quaternion.copy(q.setFromEuler(new THREE.Euler(0, fy, 0.25 * Math.sin(t * 3))));
    }
  }
  return { update, dispose() { root.remove(group); } };
}
