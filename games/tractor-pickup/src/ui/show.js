// The barn show (F-5..F-8, F-10, W-7). The camera moves beside the line-up area; animals hop from the trailer onto the ground there
// one at a time with a number above and a name below; then all jump, regroup by type, and the total shows.
import * as THREE from 'three';
import { rowLayout } from '../sim/showSteps.js';
const CAM_D = [8, 13]; // camera distance: closer for a short row, 13 m for a full one
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export function createShow({ root, camera, game, voice, sound, fx }) {
  const el = document.createElement('div'); el.id = 'show'; el.hidden = true; root.appendChild(el);
  const big = document.createElement('div'); big.className = 'big'; el.appendChild(big);
  let tweens = [], labels = [], active = false, camT = 1, cut = null, fast = false;
  const camFrom = new THREE.Vector3(), camTo = new THREE.Vector3(), look = new THREE.Vector3(), lookFrom = new THREE.Vector3(), lookTo = new THREE.Vector3(), v = new THREE.Vector3();
  // F-8: one tap finishes the current step: hops in flight land at once, and the voice and the 0.8 s wait end together
  const newStep = () => { fast = false; let fire; const p = new Promise(r => { fire = r; }); cut = { p, fire }; };
  el.addEventListener('pointerdown', () => { if (!cut) return; fast = true; for (const tw of tweens) tw.t = tw.dur; cut.fire(); });
  const wait = ms => fast ? Promise.resolve() : Promise.race([new Promise(res => setTimeout(res, ms)), cut.p]);
  // R-1: a voice that throws or rejects must never stall the show
  const speak = ids => Promise.resolve().then(() => voice.say(ids)).catch(e => console.warn('voice', e));
  const say = ids => fast ? Promise.resolve() : Promise.race([speak(ids), cut.p]);
  const tween = (a, to, dur, h, yaw) => new Promise(res => tweens.push({ a, from: { x: a.x, y: a.y || 0, z: a.z, yaw: a.yaw }, to, t: fast ? dur : 0, dur, h, yaw, res }));
  const finish = tw => { const a = tw.a; a.x = tw.to.x; a.y = tw.to.y; a.z = tw.to.z; if (tw.yaw !== undefined) a.yaw = tw.yaw; tw.res(); };
  const letters = w => [...w].map((c, i) => `<b style="animation-delay:${i * 0.12}s">${c === ' ' ? '&nbsp;' : c}</b>`).join('');
  const label = (anchor, cls, html, dy, word) => {
    const d = document.createElement('div'); d.className = cls; d.innerHTML = html; el.appendChild(d);
    if (word) d.addEventListener('pointerdown', e => { e.stopPropagation(); speak(word); }); // W-6
    labels.push({ anchor, d, dy }); return d;
  };
  // riders are drawn with their car's pose, so their own yaw is stale: the hop starts from the car's heading (model +z = car +x)
  const ridingYaw = r => { const q = game.train.cars[r.slot.car].body.rotation(), f = v.set(1, 0, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w)); return Math.atan2(f.x, f.z); };
  const frame = () => { // line-up center, axis along the line-up, and the side the camera stands on
    const y = game.farm.yard, b = y.barn, st = { ...y.lineup, y: 0 }, f = [Math.sin(b.yaw), Math.cos(b.yaw)], side = [Math.cos(b.yaw) * y.side, -Math.sin(b.yaw) * y.side];
    return { c: { x: (st.x0 + st.x1) / 2, z: (st.z0 + st.z1) / 2 }, f, side, y: st.y };
  };
  return {
    get active() { return active; },
    update(dt) {
      if (!active) return;
      if (camT < 1) { camT = Math.min(1, camT + dt); const k = camT * camT * (3 - 2 * camT); camera.position.lerpVectors(camFrom, camTo, k); look.lerpVectors(lookFrom, lookTo, k); }
      camera.lookAt(look);
      tweens = tweens.filter(tw => {
        tw.t += dt; const u = Math.min(1, tw.t / tw.dur), a = tw.a;
        if (u >= 1) { finish(tw); return false; }
        a.x = tw.from.x + (tw.to.x - tw.from.x) * u; a.z = tw.from.z + (tw.to.z - tw.from.z) * u;
        a.y = tw.from.y + (tw.to.y - tw.from.y) * u + tw.h * 4 * u * (1 - u);
        if (tw.yaw !== undefined) a.yaw = tw.from.yaw + wrap(tw.yaw - tw.from.yaw) * u;
        return true;
      });
      for (const L of labels) { v.set(L.anchor.x, (L.anchor.y || 0) + L.dy, L.anchor.z).project(camera); L.d.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; L.d.style.top = ((1 - v.y) / 2 * innerHeight) + 'px'; }
    },
    async play(riders, steps) {
      active = true; el.hidden = false; big.textContent = ''; big.classList.remove('on');
      try {
        const F = frame(), L = rowLayout(riders.map(r => r.animal.type));
        const spot = x => ({ x: F.c.x + F.f[0] * x, y: F.y, z: F.c.z + F.f[1] * x }); // x = metres along the line-up row from its center
        // F-5: ease from the chase view to the side of the line-up; the look point eases too, so the turn is smooth
        const D = Math.min(CAM_D[1], Math.max(CAM_D[0], L.width + 5));
        camFrom.copy(camera.position); camTo.set(F.c.x + F.side[0] * D, F.y + D * 6 / 13, F.c.z + F.side[1] * D);
        lookFrom.copy(camera.getWorldDirection(v)).multiplyScalar(15).add(camera.position); lookTo.set(F.c.x, F.y + 1, F.c.z); look.copy(lookFrom); camT = 0;
        const faceCam = Math.atan2(F.side[0], F.side[1]);
        for (const s of steps) {
          newStep();
          if (s.kind === 'hop') { // F-6
            labels.filter(L => L.d.className === 'name').forEach(L => L.d.remove()); labels = labels.filter(L => L.d.className !== 'name'); // names are wider than the row gap: only the newest stays
            const r = riders[s.index], a = r.animal; a.yaw = ridingYaw(r); a.state = 'show'; a.anim = 'idle'; sound?.boing?.(0.3);
            await tween(a, spot(L.hop[s.index]), 0.7, 3, faceCam); sound?.plop?.();
            label(a, 'num', s.n, s.n >= 10 && s.n % 2 === 0 ? 2.25 : 1.6); // 10 and 12 sit higher: two-digit numbers are wider than a small animal label(a, 'name', letters(s.word), -0.35, s.say.slice(1));
          }
          if (s.kind === 'all') { // F-7
            labels.forEach(L => L.d.remove()); labels = [];
            await Promise.all(riders.map(r => tween(r.animal, { x: r.animal.x, y: F.y, z: r.animal.z }, 0.6, 1.5)));
            big.textContent = s.n; big.classList.add('on');
            await Promise.all(riders.map((r, k) => tween(r.animal, spot(L.group[k]), 0.6, 1)));
            const html = g => `<span class="gn">${g.n}</span><span class="gw">${letters(g.word)}</span>`;
            const tags = s.groups.map((g, gi) => label(spot(L.groups[gi].x), 'group', html(g), -0.9 - (gi % 3) * 0.9, g.say)); // below the row, on three staggered lines, so neighbouring groups do not overlap
            fx?.confetti?.(F.c.x, F.y + 2, F.c.z); sound?.cheer?.();
            await say(s.say);
            for (const [gi, g] of s.groups.entries()) { tags[gi].innerHTML = html(g); await say(g.say); } // R-2: read each group label; its letters light up again (W-7)
          } else await say(s.say);
          await wait(800);
        }
      } finally { // R-1: whatever happens, nobody is left mid-hop
        for (const tw of tweens) finish(tw); tweens = []; cut = null;
      }
    },
    end() { active = false; el.hidden = true; labels.forEach(L => L.d.remove()); labels = []; big.classList.remove('on'); },
  };
}
