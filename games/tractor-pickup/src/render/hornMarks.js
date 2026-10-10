// M-75: a honk puts a small bulb horn with sound lines (U-2's picture) over the honking tractor for 1.5 s, on every device.
// One sprite per player, made once (in the scene, so the shader warm-up sees it, B-2); nothing is allocated per frame.
import * as THREE from 'three';
import { HORN_SVG } from '../ui/input.js';
import { MAX_PLAYERS } from '../net/protocol.js';

export const HONK = { secs: 1.5, lift: 4.4, size: 2.4, pop: 0.18, fade: 0.4 };
// size factor and opacity of a mark `age` s after its honk: it pops up (overshoots a little), bobs, and fades out at the end
export function honkLook(age, out) {
  const u = Math.min(1, age / HONK.pop), left = HONK.secs - age;
  out.scale = age >= HONK.secs ? 0 : u < 1 ? u * (1.25 - 0.25 * u) : 1 + 0.05 * Math.sin(age * 14);
  out.opacity = left <= 0 ? 0 : Math.min(1, left / HONK.fade);
  out.rise = 0.5 * Math.min(1, age / HONK.secs);
  return out;
}

function hornTexture() {
  const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(255,252,248,.92)'; g.strokeStyle = '#6b4428'; g.lineWidth = 6; g.beginPath(); g.arc(N / 2, N / 2, N / 2 - 4, 0, Math.PI * 2); g.fill(); g.stroke();
    g.drawImage(img, 10, 26, 76, 76);
    g.strokeStyle = '#6b4428'; g.lineWidth = 6; g.lineCap = 'round'; // the sound lines, out of the bell
    for (const r of [14, 26]) { g.beginPath(); g.arc(86, 64, r, -0.7, 0.7); g.stroke(); }
    tex.needsUpdate = true;
  };
  img.onerror = e => console.warn('horn mark picture', e);
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(HORN_SVG.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" '));
  return tex;
}

export function createHornMarks(scene) {
  const tex = hornTexture(), look = { scale: 0, opacity: 0, rise: 0 };
  const marks = Array.from({ length: MAX_PLAYERS }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    s.renderOrder = 20; s.visible = false; scene.add(s);
    return { s, key: -1, age: 0 };
  });
  return {
    // key: 0 for this device's own tractor, else the other player's number
    honk(key) {
      let m = marks.find(x => x.key === key && x.s.visible) || marks.find(x => !x.s.visible);
      if (!m) { m = marks[0]; for (const x of marks) if (x.age > m.age) m = x; } // all busy: the oldest
      m.key = key; m.age = 0; m.s.visible = true;
    },
    // where(key, v3): writes the tractor's position into v3, or false when that tractor is not shown
    update(dt, where) {
      for (const m of marks) {
        if (!m.s.visible) continue;
        m.age += dt; honkLook(m.age, look);
        if (look.scale <= 0 || !where(m.key, m.s.position)) { m.s.visible = false; m.key = -1; continue; }
        m.s.position.y += HONK.lift + look.rise; m.s.scale.setScalar(HONK.size * look.scale); m.s.material.opacity = look.opacity;
      }
    },
    clear() { for (const m of marks) { m.s.visible = false; m.key = -1; } },
  };
}
