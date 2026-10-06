// The barn show (F-5..F-8, F-10, W-7). The camera moves beside the line-up area; animals hop from the trailer onto the ground there
// one at a time with a number above and a name below; then all jump, regroup by type, and the total shows.
import * as THREE from 'three';
const GAP = 0.95, GROUP_GAP = 0.45, CAM_D = [8, 13]; // camera distance: closer for a short row, 13 m for a full one
export function createShow({ root, camera, game, voice, sound, fx }) {
  const el = document.createElement('div'); el.id = 'show'; el.hidden = true; root.appendChild(el);
  const big = document.createElement('div'); big.className = 'big'; el.appendChild(big);
  let tweens = [], labels = [], skip = null, active = false, camT = 1;
  const camFrom = new THREE.Vector3(), camTo = new THREE.Vector3(), look = new THREE.Vector3(), lookFrom = new THREE.Vector3(), lookTo = new THREE.Vector3(), v = new THREE.Vector3();
  el.addEventListener('pointerdown', () => skip?.()); // F-8: a tap goes to the next step
  const wait = ms => new Promise(res => { const t = setTimeout(res, ms); skip = () => { clearTimeout(t); res(); }; });
  const say = ids => Promise.race([voice.say(ids), new Promise(r => { skip = r; })]);
  const tween = (a, to, dur, h) => new Promise(res => tweens.push({ a, from: { x: a.x, y: a.y || 0, z: a.z }, to, t: 0, dur, h, res }));
  const letters = w => [...w].map((c, i) => `<b style="animation-delay:${i * 0.12}s">${c === ' ' ? '&nbsp;' : c}</b>`).join('');
  const label = (anchor, cls, html, dy, word) => {
    const d = document.createElement('div'); d.className = cls; d.innerHTML = html; el.appendChild(d);
    if (word) d.addEventListener('pointerdown', e => { e.stopPropagation(); voice.say(word); }); // W-6
    labels.push({ anchor, d, dy });
  };
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
        a.x = tw.from.x + (tw.to.x - tw.from.x) * u; a.z = tw.from.z + (tw.to.z - tw.from.z) * u;
        a.y = tw.from.y + (tw.to.y - tw.from.y) * u + tw.h * 4 * u * (1 - u);
        if (u >= 1) { tw.res(); return false; } return true;
      });
      for (const L of labels) { v.set(L.anchor.x, (L.anchor.y || 0) + L.dy, L.anchor.z).project(camera); L.d.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; L.d.style.top = ((1 - v.y) / 2 * innerHeight) + 'px'; }
    },
    async play(riders, steps) {
      active = true; el.hidden = false; big.textContent = ''; big.classList.remove('on');
      const F = frame(), n = riders.length, groups = steps.at(-1).groups.length, width = (n - 1) * GAP + (groups - 1) * GROUP_GAP;
      const spot = x => ({ x: F.c.x + F.f[0] * (x - width / 2), y: F.y, z: F.c.z + F.f[1] * (x - width / 2) }); // x = metres along the line-up row
      // F-5: ease from the chase view to the side of the line-up; the look point eases too, so the turn is smooth
      const D = Math.min(CAM_D[1], Math.max(CAM_D[0], width + 5));
      camFrom.copy(camera.position); camTo.set(F.c.x + F.side[0] * D, F.y + D * 6 / 13, F.c.z + F.side[1] * D);
      lookFrom.copy(camera.getWorldDirection(v)).multiplyScalar(15).add(camera.position); lookTo.set(F.c.x, F.y + 1, F.c.z); look.copy(lookFrom); camT = 0;
      const faceCam = Math.atan2(F.side[0], F.side[1]);
      const rowX = i => i * GAP + (width - (n - 1) * GAP) / 2; // hop row: centered, no group gaps yet
      for (const s of steps) {
        if (s.kind === 'hop') { // F-6
          labels.filter(L => L.d.className === 'name').forEach(L => L.d.remove()); labels = labels.filter(L => L.d.className !== 'name'); // names are wider than the row gap: only the newest stays
          const a = riders[s.index].animal; a.state = 'show'; a.anim = 'idle'; a.yaw = faceCam; sound?.boing?.(0.3);
          await tween(a, spot(rowX(s.index)), 0.7, 3); sound?.plop?.();
          label(a, 'num', s.n, 1.6); label(a, 'name', letters(s.word), -0.35, s.say.slice(1));
        }
        if (s.kind === 'all') { // F-7
          labels.forEach(L => L.d.remove()); labels = [];
          await Promise.all(riders.map(r => tween(r.animal, { x: r.animal.x, y: F.y, z: r.animal.z }, 0.6, 1.5)));
          big.textContent = s.n; big.classList.add('on');
          let x = 0; const moves = [];
          for (const [gi, g] of s.groups.entries()) {
            const start = x;
            for (const r of riders.filter(r => r.animal.type === g.type)) { moves.push(tween(r.animal, spot(x), 0.6, 1)); x += GAP; }
            label(spot((start + x - GAP) / 2), 'group', `<span class="gn">${g.n}</span><span class="gw">${letters(g.word)}</span>`, gi % 2 ? -2 : -0.9, [g.type]); // below the row (number on top); every other group label sits lower, so neighbours do not overlap
            x += GROUP_GAP; // x already sits one GAP past the last member
          }
          await Promise.all(moves); fx?.confetti?.(F.c.x, F.y + 2, F.c.z); sound?.cheer?.();
        }
        await say(s.say); await wait(800);
      }
      skip = null;
    },
    end() { active = false; el.hidden = true; labels.forEach(L => L.d.remove()); labels = []; big.classList.remove('on'); },
  };
}
