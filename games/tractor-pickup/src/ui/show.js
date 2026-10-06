// The barn show (F-5..F-8, F-10, F-12, W-7). The camera moves beside the line-up area. One type at a time, the animals hop from
// the trailer into their group's block and are counted with a number above each; the group label ("3 Pigs") follows. Then the
// sum lights up term by term ("3 + 2 = 5") with the voice, and all animals jump for the total.
import * as THREE from 'three';
import { showLayout } from '../sim/showSteps.js';
import { NUMBER_WORDS } from '../sim/words.js';
import { SCALE } from '../render/petScale.js';
const headY = type => 1.4 * (SCALE[type] ?? 1) + 0.6; // a Cube Pet is about 1.4 model units tall: a number floats just above its head
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const SUM_TEXT = { plus: '+', makes: '=' }; // the sum's spoken tokens, as shown (numbers show as digits)
export function createShow({ root, camera, game, voice, sound, fx }) {
  const el = document.createElement('div'); el.id = 'show'; el.hidden = true; root.appendChild(el);
  const big = document.createElement('div'); big.className = 'big'; el.appendChild(big);
  let tweens = [], labels = [], active = false, ended = false, camT = 1, cut = null, fast = false;
  const camFrom = new THREE.Vector3(), camTo = new THREE.Vector3(), look = new THREE.Vector3(), lookFrom = new THREE.Vector3(), lookTo = new THREE.Vector3(), v = new THREE.Vector3();
  // F-8: one tap finishes the current step: hops in flight land at once, and the voice and the 0.8 s wait end together
  const newStep = () => { fast = false; let fire; const p = new Promise(r => { fire = r; }); cut = { p, fire }; };
  el.addEventListener('pointerdown', () => { if (!cut) return; fast = true; for (const tw of tweens) tw.t = tw.dur; voice?.stop?.(); cut.fire(); });
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
  const drop = list => { labels = labels.filter(L => { if (!list.includes(L)) return true; L.d.remove(); return false; }); };
  // riders are drawn with their car's pose, so their own yaw is stale: the hop starts from the car's heading (model +z = car +x)
  const ridingYaw = r => { const q = game.train.cars[r.slot.car].body.rotation(), f = v.set(1, 0, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w)); return Math.atan2(f.x, f.z); };
  // the line-up: its barn-side edge center, the axis along it, the unit direction out toward the camera and its depth
  const frame = () => {
    const y = game.farm.yard, b = y.barn, L = y.lineup, f = [Math.sin(b.yaw), Math.cos(b.yaw)], side = [Math.cos(b.yaw) * y.side, -Math.sin(b.yaw) * y.side];
    const depth = Math.abs((L.x1 - L.x0) * side[0]) + Math.abs((L.z1 - L.z0) * side[1]), c = { x: (L.x0 + L.x1) / 2, z: (L.z0 + L.z1) / 2 };
    return { inner: { x: c.x - side[0] * depth / 2, z: c.z - side[1] * depth / 2 }, f, side, depth };
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
      active = true; ended = false; el.hidden = false; big.innerHTML = ''; big.classList.remove('on');
      try {
        const F = frame(), all = steps.find(s => s.kind === 'all'), lay = showLayout(all.groups), off = Math.max(0, (F.depth - lay.depth) / 2);
        const mx = F.f[0] * F.side[1] - F.f[1] * F.side[0] >= 0 ? 1 : -1; // layout x runs to screen-right (the camera looks back along -side), so groups read in the sum's order
        const spot = (x, d) => ({ x: F.inner.x + F.f[0] * x * mx + F.side[0] * (d + off), y: 0, z: F.inner.z + F.f[1] * x * mx + F.side[1] * (d + off) });
        // F-5: ease from the chase view to the side of the line-up, far enough back to see every block; the look point eases too
        const hfov = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect), C = spot(0, lay.depth / 2);
        const D = Math.max(12, (lay.width / 2 + 3) / Math.tan(hfov / 2) + lay.depth / 2);
        camFrom.copy(camera.position); camTo.set(C.x + F.side[0] * D, D * 0.55, C.z + F.side[1] * D);
        lookFrom.copy(camera.getWorldDirection(v)).multiplyScalar(15).add(camera.position); lookTo.set(C.x, 0.8, C.z); look.copy(lookFrom); camT = 0;
        const faceCam = Math.atan2(F.side[0], F.side[1]), nums = [], tags = [];
        for (const s of steps) {
          if (ended) break; // end() was called (a new farm): stop before touching the old bodies
          newStep();
          if (s.kind === 'hop') { // F-6: into its group's block, counted within the group
            const r = riders[s.index], a = r.animal, p = lay.spots[s.group][s.n - 1]; a.yaw = ridingYaw(r); a.state = 'show'; a.anim = 'idle'; sound?.boing?.(0.3);
            await tween(a, spot(p.x, p.d), 0.7, 3, faceCam); sound?.plop?.();
            (nums[s.group] ||= []).push(label(a, 'num', s.golden ? `<small>Golden</small>${s.n}` : s.n, headY(a.type), s.say));
          }
          if (s.kind === 'group') { // the numbers go; the group label shows in front of the block
            drop(labels.filter(L => nums[s.group]?.includes(L.d)));
            const p = lay.labels[s.group];
            tags[s.group] = label(spot(p.x, p.d), 'group', `<span class="gn">${s.n}</span><span class="gw">${letters(s.word)}</span>`, 0, s.say);
          }
          if (s.kind === 'sum') { // F-7: each term lights up while the voice says it; its group label glows with it
            const terms = s.say.map(t => SUM_TEXT[t] ?? NUMBER_WORDS.indexOf(t)), chars = terms.join(' ').length;
            big.style.fontSize = Math.min(150, innerWidth * 0.9 / (chars * 0.62)) + 'px';
            big.innerHTML = terms.map(t => `<span class="t">${t}</span>`).join(' '); big.classList.add('on');
            const spans = big.querySelectorAll ? [...big.querySelectorAll('.t')] : [];
            let gi = 0;
            for (const [k, t] of s.say.entries()) {
              spans[k]?.classList.add('lit');
              if (!SUM_TEXT[t] && k < s.say.length - 1) tags[gi++]?.classList.add('glow');
              await say([t]);
            }
          } else if (s.kind === 'all') { // all jump together; the total stays up top
            if (!steps.some(x => x.kind === 'sum')) { big.style.fontSize = ''; big.textContent = s.n; big.classList.add('on'); }
            await Promise.all(riders.map(r => tween(r.animal, { x: r.animal.x, y: 0, z: r.animal.z }, 0.6, 1.5)));
            fx?.confetti?.(C.x, 2, C.z); sound?.cheer?.();
            await say(s.say);
          } else if (s.kind !== 'sum') await say(s.say);
          await wait(800);
        }
      } finally { // R-1: whatever happens, nobody is left mid-hop
        for (const tw of tweens) finish(tw); tweens = []; cut = null; fast = false;
      }
    },
    end() { active = false; ended = true; fast = true; cut?.fire(); for (const tw of tweens) finish(tw); tweens = []; el.hidden = true; labels.forEach(L => L.d.remove()); labels = []; big.classList.remove('on'); big.innerHTML = ''; },
  };
}
