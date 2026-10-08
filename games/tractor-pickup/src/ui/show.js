// The barn show (F-5..F-8, F-10, F-12, W-7). The camera moves beside the line-up area. One type at a time, the animals hop from
// the trailer into their group's block and are counted with a number above each; the group label ("3 Pigs") follows. Then the
// running sum from zero lights up term by term ("0 + 3 = 3", then "3 + 2 = 5") with the voice; after each stage that group's
// animals move into the tally circle at the left, whose count goes up as each one lands (F-14). All animals jump for the total. A
// skip button ends the show at once.
import * as THREE from 'three';
import { showLayout, tallyLayout, TALLY, LINEUP } from '../sim/showSteps.js';
import { TYPES } from '../sim/herd.js';
import { SCALE } from '../render/petScale.js';
import { VIEW } from '../render/scene.js';
import { holdToFire } from './hold.js';
const headY = type => 1.4 * (SCALE[type] ?? 1) + 0.6; // a Cube Pet is about 1.4 model units tall: a number floats just above its head
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const SUM_PAUSE = 450, STAGE_PAUSE = 1200; // F-7: ms after each spoken term of the running sum, and before its next stage
// F-6, F-8, F-14 (made faster in version 1.10): a hop out of the trailer (s), the wait after each step (ms), between animals moving into
// the tally circle (ms) and their hop (s)
export const SHOW = { hop: 0.5, step: 350, tallyGap: 150, tallyHop: 0.45 };
// A-3: a child's tap makes the animal being counted hop and call (s, m); holding `fastMs` finishes the step (F-8); the skip button needs `skipMs` (F-13)
export const CHEER = { hop: 0.35, h: 0.7, fastMs: 1000, skipMs: 1000 };
// F-12: the show text scales with the scene, so a label never grows past the room its block has (LINEUP.letter metres a letter).
// pxPerLetter: the width of one letter of a 36 px label (Andika bold, with the number and the space); never below `min`.
export const LABEL = { pxPerLetter: 21, min: 0.5 };
export const labelScale = pxPerM => Math.max(LABEL.min, Math.min(1, pxPerM * LINEUP.letter / LABEL.pxPerLetter));
const RING = { line: 0.15, y: 0.03 }; // F-14: the tally circle on the ground: a light rim and a pale fill
export function createShow({ root, camera, game, voice, sound, fx, scene, onHop }) {
  const el = document.createElement('div'); el.id = 'show'; el.hidden = true; root.appendChild(el);
  const big = document.createElement('div'); big.className = 'big'; el.appendChild(big);
  // F-13: a skip button ends the whole show at once (the reward card comes next). A-3: only after a 1 s hold, so a child's poke cannot
  const skip = document.createElement('button'); skip.className = 'skip'; skip.setAttribute('aria-label', 'Skip');
  skip.innerHTML = '<svg viewBox="0 0 60 40" aria-hidden="true"><path d="M6 6 L28 20 L6 34 Z M30 6 L52 20 L30 34 Z" fill="#fff"/><rect x="52" y="6" width="5" height="28" rx="2" fill="#fff"/></svg><i></i>'; el.appendChild(skip);
  let ring = null; const dropRing = () => { if (!ring) return; ring.removeFromParent(); ring.traverse(m => { m.geometry?.dispose(); m.material?.dispose(); }); ring = null; };
  let tweens = [], labels = [], active = false, ended = false, skipped = false, camT = 1, cut = null, fast = false, cur = null, fastTimer = 0;
  const camFrom = new THREE.Vector3(), camTo = new THREE.Vector3(), look = new THREE.Vector3(), lookFrom = new THREE.Vector3(), lookTo = new THREE.Vector3(), v = new THREE.Vector3();
  // F-8: holding the screen for 1 s finishes the current step: hops in flight land at once, and the voice and the wait end together.
  // A-3: a short tap is the child's: the animal being counted hops and calls; the show goes on at its own pace.
  const newStep = () => { fast = false; let fire; const p = new Promise(r => { fire = r; }); cut = { p, fire }; };
  const hurry = () => { if (!cut) return; fast = true; for (const tw of tweens) tw.t = tw.dur; voice?.stop?.(); cut.fire(); };
  const cheer = () => {
    const a = cur; // before the first hop the animals still ride (drawn with the car's pose): only a call
    if (!a) { const r = riders0?.[Math.floor(Math.random() * riders0.length)]; if (r) sound?.animal?.(r.animal.type); return; }
    if (tweens.some(tw => tw.a === a)) return;
    sound?.animal?.(a.type); tweens.push({ a, from: { x: a.x, y: a.y || 0, z: a.z, yaw: a.yaw }, to: { x: a.x, y: a.y || 0, z: a.z }, t: 0, dur: CHEER.hop, h: CHEER.h, cheer: true, res: () => {} });
  };
  const release = () => { clearTimeout(fastTimer); fastTimer = 0; };
  el.addEventListener('pointerdown', () => { if (!cut) return; cheer(); release(); fastTimer = setTimeout(() => { fastTimer = 0; hurry(); }, CHEER.fastMs); });
  for (const n of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(n, release);
  holdToFire(skip, CHEER.skipMs, () => { if (!cut) return; skipped = true; hurry(); });
  let riders0 = null;
  const wait = ms => fast ? Promise.resolve() : Promise.race([new Promise(res => setTimeout(res, ms)), cut.p]);
  // R-1: a voice that throws or rejects must never stall the show
  const speak = ids => Promise.resolve().then(() => voice.say(ids)).catch(e => console.warn('voice', e));
  const say = ids => fast ? Promise.resolve() : Promise.race([speak(ids), cut.p]);
  const tween = (a, to, dur, h, yaw) => new Promise(res => (dropCheer(a), tweens).push({ a, from: { x: a.x, y: a.y || 0, z: a.z, yaw: a.yaw }, to, t: fast ? dur : 0, dur, h, yaw, res }));
  const dropCheer = a => { tweens = tweens.filter(tw => { if (!tw.cheer || tw.a !== a) return true; finish(tw); return false; }); }; // a show hop takes over from a cheer hop
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
      for (const L of labels) { v.set(L.anchor.x, (L.anchor.y || 0) + L.dy, L.anchor.z).project(camera); L.d.style.left = ((v.x + 1) / 2 * VIEW.w) + 'px'; L.d.style.top = ((1 - v.y) / 2 * VIEW.h) + 'px'; }
    },
    async play(riders, steps) {
      dropRing(); active = true; ended = skipped = false; cur = null; riders0 = riders; el.hidden = false; big.innerHTML = ''; big.classList.remove('on');
      try {
        const F = frame(), all = steps.find(s => s.kind === 'all'), lay = showLayout(all.groups, { len: camera.aspect < 0.9 ? LINEUP.portraitLen : LINEUP.len }), off = Math.max(0, (F.depth - lay.depth) / 2);
        const mx = F.f[0] * F.side[1] - F.f[1] * F.side[0] >= 0 ? 1 : -1; // layout x runs to screen-right (the camera looks back along -side), so groups read in the sum's order
        const spot = (x, d) => ({ x: F.inner.x + F.f[0] * x * mx + F.side[0] * (d + off), y: 0, z: F.inner.z + F.f[1] * x * mx + F.side[1] * (d + off) });
        // F-5: ease from the chase view to the side of the line-up, far enough back to see every block; the look point eases too
        // F-14: with a sum, the tally circle stands left of the blocks (screen left), sized for every animal, filled in the order of the sum
        const sum = steps.find(s => s.kind === 'sum'), hops = steps.filter(s => s.kind === 'hop');
        const order = sum ? sum.stages.flatMap(st => hops.filter(h => h.group === st.group).map(h => h.index)) : [];
        // X-12: on a tall screen (a phone in portrait) the tally circle stands in front of the blocks (screen bottom), so the view is narrow and close
        const tall = camera.aspect < 0.9, tl = order.length ? tallyLayout(order.map(i => TYPES[riders[i].animal.type]?.r ?? 0.5)) : null;
        const tx = !tl || tall ? 0 : -(lay.width / 2 + TALLY.gap + tl.r), td = tl && tall ? lay.depth + TALLY.tallGap + tl.r : lay.depth / 2;
        const x0 = tl ? Math.min(tx - tl.r, -lay.width / 2) : -lay.width / 2, x1 = Math.max(lay.width / 2, tl ? tx + tl.r : 0);
        const depth = tl && tall ? td + tl.r : Math.max(lay.depth, tl ? tl.r * 2 : 0), d0 = tall ? 0 : lay.depth / 2 - depth / 2;
        const hfov = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect), C = spot((x0 + x1) / 2, d0 + depth / 2);
        const D = Math.max(12, ((x1 - x0) / 2 + (tall ? 1 : 3)) / Math.tan(hfov / 2) + depth / 2);
        camFrom.copy(camera.position); camTo.set(C.x + F.side[0] * D, D * 0.55, C.z + F.side[1] * D);
        lookFrom.copy(camera.getWorldDirection(v)).multiplyScalar(15).add(camera.position); lookTo.set(C.x, 0.8, C.z); look.copy(lookFrom); camT = 0;
        const pxPerM = VIEW.h / (2 * Math.tan(camera.fov * Math.PI / 360) * camTo.distanceTo(v.set(C.x, 0.8, C.z)));
        el.style.setProperty?.('--k', labelScale(pxPerM).toFixed(3)); // F-12
        const faceCam = Math.atan2(F.side[0], F.side[1]), nums = [], tags = [];
        for (const s of steps) {
          if (ended || skipped) break; // end() was called (a new farm) or the skip button: stop before the next step
          newStep();
          if (s.kind === 'hop') { // F-6: into its group's block, counted within the group
            const r = riders[s.index], a = r.animal, p = lay.spots[s.group][s.n - 1]; cur = a; a.yaw = ridingYaw(r); a.state = 'show'; a.anim = 'idle'; sound?.boing?.(0.3);
            onHop?.(r); // F-15: its slot in the slot bar is marked off
            await tween(a, spot(p.x, p.d), SHOW.hop, 3, faceCam); sound?.plop?.();
            (nums[s.group] ||= []).push(label(a, 'num', s.golden ? `<small>Golden</small>${s.n}` : s.n, headY(a.type), s.say));
          }
          if (s.kind === 'group') { // the numbers go; the group label shows in front of the block
            drop(labels.filter(L => nums[s.group]?.includes(L.d)));
            const p = lay.labels[s.group];
            tags[s.group] = label(spot(p.x, p.d), 'group', `<span class="gn">${s.n}</span><span class="gw">${letters(s.word)}</span>`, 0, s.say);
          }
          if (s.kind === 'sum') { // F-7, F-14: a running sum from zero, one stage per group: "0 + 3 = 3", then "3 + 2 = 5". Each term lights up slowly
            // while the voice says it; the tally count glows with the first term and the group's label with the second. Then that group's animals
            // move into the tally circle one after another, and the count above the circle goes up as each one lands.
            const T = spot(tx, td), at = { x: T.x, y: 0, z: T.z };
            if (scene) {
              ring = new THREE.Group(); ring.position.set(T.x, RING.y, T.z);
              ring.add(new THREE.Mesh(new THREE.CircleGeometry(tl.r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff6dc', transparent: true, opacity: 0.45, depthWrite: false })),
                new THREE.Mesh(new THREE.RingGeometry(tl.r - RING.line, tl.r, 64).rotateX(-Math.PI / 2).translate(0, 0.005, 0), new THREE.MeshBasicMaterial({ color: '#ffe066' })));
              scene.add(ring);
            }
            let count = 0; const tally = label(at, 'tally', '0', 1.9 * Math.max(1, ...order.map(i => SCALE[riders[i].animal.type] ?? 1)) + 0.4);
            for (const [si, st] of s.stages.entries()) {
              if (skipped) break;
              const terms = [st.from, '+', st.add, '=', st.to];
              big.style.fontSize = Math.min(150, VIEW.w * 0.9 / (terms.join(' ').length * 0.62)) + 'px';
              big.innerHTML = terms.map(t => `<span class="t">${t}</span>`).join(' '); big.classList.remove('on'); void big.offsetWidth; big.classList.add('on');
              const spans = big.querySelectorAll ? [...big.querySelectorAll('.t')] : [];
              for (let k = 0; k < terms.length && !skipped; k++) {
                spans[k]?.classList.add('lit');
                if (k === 0) tally.classList.add('glow'); if (k === 2) tags[st.group]?.classList.add('glow');
                await say([st.say[k]]); await wait(SUM_PAUSE);
              }
              tally.classList.remove('glow');
              const members = order.filter(i => hops.find(h => h.index === i).group === st.group);
              await Promise.all(members.map(async (i, k) => {
                await wait(k * SHOW.tallyGap); const a = riders[i].animal, p = tl.spots[order.indexOf(i)]; cur = a;
                await tween(a, spot(tx + p.x, td + p.d), SHOW.tallyHop, 2, faceCam); tally.innerHTML = ++count; sound?.plop?.();
              }));
              tags[st.group]?.classList.add('done');
              if (si < s.stages.length - 1) await wait(STAGE_PAUSE);
            }
          } else if (s.kind === 'all') { // all jump together; the total stays up top
            if (!steps.some(x => x.kind === 'sum')) { big.style.fontSize = ''; big.textContent = s.n; big.classList.add('on'); }
            await Promise.all(riders.map(r => tween(r.animal, { x: r.animal.x, y: 0, z: r.animal.z }, 0.6, 1.5)));
            const P = tl ? spot(tx, td) : C; fx?.confetti?.(P.x, 2, P.z); sound?.cheer?.();
            await say(s.say);
          } else if (s.kind !== 'sum') await say(s.say);
          if (!skipped) await wait(SHOW.step);
        }
      } finally { // R-1: whatever happens, nobody is left mid-hop
        for (const tw of tweens) finish(tw); tweens = []; cut = null; fast = false; release();
      }
    },
    end() { dropRing(); active = false; ended = true; fast = true; cut?.fire(); for (const tw of tweens) finish(tw); tweens = []; el.hidden = true; labels.forEach(L => L.d.remove()); labels = []; big.classList.remove('on'); big.innerHTML = ''; },
  };
}
