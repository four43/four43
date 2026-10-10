// The players UI (M-75..M-79): a circle for each player in the room, right of the menu button (M-78, M-79), and, after this player's
// honk, a small arrow in each other player's paints pointing to that player (M-76, M-77). Pictures only (R-2). Nothing here is
// allocated per frame: the circles and arrows are made once and change only when what they show changes.
import { MAX_PLAYERS } from '../net/protocol.js';

export const FIND = { secs: 4, inset: 44, lift: 3.4, fadeSecs: 0.5 }; // M-76: arrows for 4 s, inset from the screen edge (px), on-screen marker height (m)
export const RAINBOW = 'conic-gradient(#e53935,#fb8c00,#fdd835,#43a047,#1e88e5,#8e24aa,#e53935)';
// a paint name (W-3) as a CSS background; paints: PAINTS from render/vehicles3d.js (rainbow is null there: the hues run along the tractor)
export const paintCss = (name, paints) => name === 'rainbow' ? RAINBOW : paints[name] ?? paints.red;

// M-77: where an arrow goes for a point given in normalized device coordinates (nx, ny in -1..1 on screen; behind: behind the camera) on a
// W x H px screen. On screen: just above the point, pointing down at it (on: true). Off screen or behind: on an ellipse inset by `inset` px,
// pointing toward the point (as the barn arrow, F-2). angle: radians, 0 = right, screen y down. out is filled and returned (no allocation).
export function placeArrow(nx, ny, behind, W, H, inset, out) {
  let dx = nx * W / 2, dy = -ny * H / 2;
  if (!behind && Math.abs(nx) <= 1 && Math.abs(ny) <= 1) {
    out.x = Math.min(W - inset / 2, Math.max(inset / 2, W / 2 + dx)); out.y = Math.min(H - inset / 2, Math.max(inset / 2, H / 2 + dy)); out.angle = Math.PI / 2; out.on = true; return out;
  }
  if (behind) { dx = -dx; dy = -dy; }
  if (Math.hypot(dx, dy) < 1) dy = 1; // straight behind: point down
  const e = Math.hypot(dx / (W / 2 - inset), dy / (H / 2 - inset));
  out.x = W / 2 + dx / e; out.y = H / 2 + dy / e; out.angle = Math.atan2(dy, dx); out.on = false; return out;
}

// M-78: the players to show, in player-number order, written into rows (reused): this device's own player and the others in sync.players.
// Nothing while not in a running room (no sync, or a guest not welcomed yet). Returns the count.
export function rosterRows(sync, myPaint, rows) {
  if (!sync?.you) return 0;
  let k = 0;
  for (let n = 1; n <= MAX_PLAYERS; n++) {
    const me = n === sync.you, p = me ? null : sync.players.map.get(n);
    if (!me && !p) continue;
    const r = rows[k++] ||= { n: 0, body: '', trim: '', you: false, away: false };
    r.n = n; r.you = me; r.body = me ? myPaint.body : p.paint.body; r.trim = me ? myPaint.trim : p.paint.trim; r.away = !me && !!p.away;
  }
  return k;
}

export function createRoster(root, paints) {
  const box = document.createElement('div'); box.id = 'roster'; box.hidden = true; root.appendChild(box);
  const rows = [], dots = Array.from({ length: MAX_PLAYERS }, () => {
    const d = document.createElement('span'); d.className = 'pc'; d.hidden = true; d.appendChild(document.createElement('i')); box.appendChild(d);
    return { d, n: 0, body: '', trim: '', you: false, away: false };
  });
  return {
    update(sync, myPaint) {
      const k = rosterRows(sync, myPaint, rows);
      if (box.hidden !== !k) box.hidden = !k;
      for (let i = 0; i < dots.length; i++) {
        const v = dots[i];
        if (i >= k) { if (!v.d.hidden) { v.d.hidden = true; v.n = 0; } continue; }
        const r = rows[i];
        if (v.d.hidden) v.d.hidden = false;
        if (v.n === r.n && v.body === r.body && v.trim === r.trim && v.you === r.you && v.away === r.away) continue; // unchanged: no style write
        v.n = r.n; v.body = r.body; v.trim = r.trim; v.you = r.you; v.away = r.away;
        v.d.style.background = paintCss(r.trim, paints); v.d.firstChild.style.background = paintCss(r.body, paints);
        v.d.classList.toggle('you', r.you); v.d.classList.toggle('away', r.away);
      }
    },
  };
}

// M-76: an arrow pointing right, in a player's paints: the body paint fills it, the trim paint outlines it (a gradient for rainbow).
const arrowSvg = i => `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="tp-rb${i}" x1="0" x2="1" y1="0" y2="1">${['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'].map((c, k) => `<stop offset="${k / 5}" stop-color="${c}"/>`).join('')}</linearGradient></defs>`
  + '<path d="M5 17 L25 17 L25 7 L44 24 L25 41 L25 31 L5 31 Z" stroke-width="5" stroke-linejoin="round" paint-order="stroke"/></svg>';
const svgPaint = (name, paints, i) => name === 'rainbow' ? `url(#tp-rb${i})` : paints[name] ?? paints.red;

// project(x, y, z) fills and returns { nx, ny, behind } for a world point (main.js, with the camera); size() gives the screen { w, h }.
export function createFinder(root, paints, project, size) {
  const at = { x: 0, y: 0, angle: 0, on: false };
  const arrows = Array.from({ length: MAX_PLAYERS }, (_, i) => {
    const a = document.createElement('div'); a.className = 'finder'; a.hidden = true; a.innerHTML = arrowSvg(i); root.appendChild(a);
    return { a, path: a.querySelector('path'), i, body: '', trim: '', away: null, tf: '', op: '' };
  });
  let t = 0;
  const hideAll = () => { for (const v of arrows) if (!v.a.hidden) v.a.hidden = true; };
  return {
    get active() { return t > 0; },
    show() { t = FIND.secs; }, // this player honked
    hide() { t = 0; hideAll(); },
    update(dt, sync, held) {
      if (t <= 0) return;
      t -= dt;
      if (t <= 0 || !sync?.you || held) { if (t <= 0) t = 0; hideAll(); return; }
      const { w, h } = size(), fade = Math.min(1, t / FIND.fadeSecs);
      let k = 0;
      for (let n = 1; n <= MAX_PLAYERS && k < arrows.length; n++) {
        if (n === sync.you) continue;
        const p = sync.players.map.get(n); if (!p?.pose) continue;
        const v = arrows[k++], q = p.pose.tractor.p, s = project(q.x, q.y + FIND.lift, q.z);
        placeArrow(s.nx, s.ny, s.behind, w, h, FIND.inset, at);
        if (v.body !== p.paint.body) { v.body = p.paint.body; v.path.setAttribute('fill', svgPaint(v.body, paints, v.i)); }
        if (v.trim !== p.paint.trim) { v.trim = p.paint.trim; v.path.setAttribute('stroke', svgPaint(v.trim, paints, v.i)); }
        const tf = `translate(${Math.round(at.x)}px,${Math.round(at.y - (at.on ? 20 : 0))}px) translate(-50%,-50%) rotate(${Math.round(at.angle * 57.3)}deg)`;
        if (tf !== v.tf) { v.a.style.transform = tf; v.tf = tf; }
        const op = String(Math.round(fade * (p.away ? 0.45 : 1) * 20) / 20); if (op !== v.op) { v.a.style.opacity = op; v.op = op; }
        if (v.a.hidden) v.a.hidden = false;
      }
      for (; k < arrows.length; k++) if (!arrows[k].a.hidden) arrows[k].a.hidden = true;
    },
  };
}
