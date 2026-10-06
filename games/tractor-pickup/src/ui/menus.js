// Start screen (F-11), sticker card (F-3, F-9), paint screen (W-3), sticker book (W-2) and the parent menu (U-3, P-3..P-8).
// Everything a child sees is a picture (R-2, U-4); only the parent panel has text. Buttons use `click` so iOS counts the tap as a gesture for audio.
import { clampSettings, unlockedPaints } from '../sim/progress.js';
import { PAINTS } from '../render/vehicles3d.js';

const el = (cls, tag = 'div', parent) => { const e = document.createElement(tag); if (cls) e.className = cls; parent?.appendChild(e); return e; };
const RB = '<linearGradient id="rb" x1="0" x2="1"><stop offset="0" stop-color="#e53935"/><stop offset=".25" stop-color="#fdd835"/><stop offset=".5" stop-color="#43a047"/><stop offset=".75" stop-color="#1e88e5"/><stop offset="1" stop-color="#8e24aa"/></linearGradient>';
const fill = c => c === 'rainbow' ? 'url(#rb)' : PAINTS[c];
// A paint pot: a tin with the paint on top and running down the front
export const potSvg = c => `<svg viewBox="0 0 80 80" aria-hidden="true"><defs>${RB}</defs><path d="M14 26 H66 L62 70 Q40 76 18 70 Z" fill="#c9ccd4" stroke="#4a3a2c" stroke-width="3" stroke-linejoin="round"/>
<ellipse cx="40" cy="26" rx="26" ry="8" fill="${fill(c)}" stroke="#4a3a2c" stroke-width="3"/><path d="M24 30 Q24 44 29 44 Q34 44 33 31 Q40 52 46 52 Q51 52 50 31 Q55 40 58 30" fill="${fill(c)}"/>
<path d="M18 22 Q40 2 62 22" fill="none" stroke="#4a3a2c" stroke-width="3"/></svg>`;
// Which area a row paints (W-3): a side-view tractor outline with that area filled in its paint and the rest pale. body: the cab
// and the hood; trim: the fenders and the roof. Glass and wheels are never painted.
export const areaSvg = (area, c) => { const on = a => a === area ? fill(c) : '#f3eee6';
  return `<svg viewBox="0 0 120 84" aria-hidden="true"><defs>${RB}</defs>
<path d="M54 36 H110 Q114 36 114 40 V58 H54 Z" fill="${on('body')}" stroke="#4a2c14" stroke-width="3" stroke-linejoin="round"/>
<path d="M16 12 H52 V58 H16 Z" fill="${on('body')}" stroke="#4a2c14" stroke-width="3" stroke-linejoin="round"/><rect x="22" y="17" width="24" height="16" rx="3" fill="#cfeefc" stroke="#4a2c14" stroke-width="2"/>
<path d="M10 4 H58 V12 H10 Z" fill="${on('trim')}" stroke="#4a2c14" stroke-width="3" stroke-linejoin="round"/>
<path d="M6 46 Q34 22 62 46" fill="none" stroke="#4a2c14" stroke-width="10" stroke-linecap="round"/><path d="M6 46 Q34 22 62 46" fill="none" stroke="${on('trim')}" stroke-width="5" stroke-linecap="round"/>
<path d="M84 50 H112" stroke="#4a2c14" stroke-width="9" stroke-linecap="round"/><path d="M84 50 H112" stroke="${on('trim')}" stroke-width="4" stroke-linecap="round"/>
<circle cx="34" cy="60" r="21" fill="#3b3b3b" stroke="#222" stroke-width="3"/><circle cx="34" cy="60" r="9" fill="#d6d6da" stroke="#222" stroke-width="2"/>
<circle cx="98" cy="66" r="13" fill="#3b3b3b" stroke="#222" stroke-width="3"/><circle cx="98" cy="66" r="6" fill="#d6d6da" stroke="#222" stroke-width="2"/></svg>`; };
const goSvg = () => '<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M20 12 L48 30 L20 48 Z" fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round"/></svg>';
export const bookSvg = () => `<svg viewBox="0 0 100 80" aria-hidden="true"><path d="M50 14 C36 6 18 8 8 14 V68 C18 62 36 60 50 68 C64 60 82 62 92 68 V14 C82 8 64 6 50 14 Z" fill="#fff6dc" stroke="#6b4428" stroke-width="4" stroke-linejoin="round"/><path d="M50 14 V68" stroke="#6b4428" stroke-width="3"/><circle cx="29" cy="38" r="10" fill="#f6a9bd" stroke="#6b4428" stroke-width="2"/><path d="M62 46 l8 -14 l8 14 z" fill="#f5c84c" stroke="#6b4428" stroke-width="2"/></svg>`;
const gearSvg = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#5a3820" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm9 4.4v-1.8l-2.2-.5a7 7 0 0 0-.7-1.7l1.2-1.9-1.3-1.3-1.9 1.2a7 7 0 0 0-1.7-.7L14.1 3h-1.8l-.5 2.2a7 7 0 0 0-1.7.7L8.2 4.7 6.9 6l1.2 1.9a7 7 0 0 0-.7 1.7L5.2 10.1v1.8l2.2.5c.2.6.4 1.2.7 1.7l-1.2 1.9 1.3 1.3 1.9-1.2c.5.3 1.1.5 1.7.7l.5 2.2h1.8l.5-2.2c.6-.2 1.2-.4 1.7-.7l1.9 1.2 1.3-1.3-1.2-1.9c.3-.5.5-1.1.7-1.7z"/></svg>`;
export const hatSvg = id => ({
  straw: '<svg viewBox="0 0 60 36"><ellipse cx="30" cy="28" rx="28" ry="7" fill="#f2c85a" stroke="#6b4428" stroke-width="2"/><path d="M16 28 C16 8 44 8 44 28 Z" fill="#e0b040" stroke="#6b4428" stroke-width="2"/><rect x="16" y="22" width="28" height="5" fill="#c0392b"/></svg>',
  cowboy: '<svg viewBox="0 0 60 40"><path d="M2 30 C10 36 50 36 58 30 C52 30 48 26 46 14 C40 4 20 4 14 14 C12 26 8 30 2 30 Z" fill="#8a5530" stroke="#4a2c14" stroke-width="2"/><rect x="15" y="22" width="30" height="4" fill="#4a2c14"/></svg>',
  party: '<svg viewBox="0 0 40 56"><path d="M20 4 L36 52 H4 Z" fill="#ff5fa2" stroke="#6b4428" stroke-width="2"/><path d="M13 30 H27 M9 42 H31" stroke="#ffd24a" stroke-width="5"/><circle cx="20" cy="5" r="4" fill="#fff" stroke="#6b4428" stroke-width="1.5"/></svg>',
})[id];

// A round portrait of a sticker; golden ones get a gold rim (F-3).
const portrait = (icons, s) => { const d = el('portrait' + (s.golden ? ' golden' : '')); d.innerHTML = `<img alt="" src="${s.golden ? icons.golden[s.type] : icons[s.type]}">`; return d; };

export function createMenus(root, { icons, tractorPic, onPlay, onKeepDriving, onNewFarm, onSettings, onClearStickers, onPaint, onParent }) {
  let screen = null;
  const close = () => { screen?.remove(); screen = null; };
  const open = cls => { close(); screen = el('screen ' + cls, 'div', root); return screen; };
  const pic = (parent, cls, html, fn, label) => { const b = el('pic ' + cls, 'button', parent); b.innerHTML = html; b.setAttribute('aria-label', label); b.addEventListener('click', e => { e.stopPropagation(); fn(); }); return b; };
  const go = (parent, fn) => pic(parent, 'go', goSvg(), () => { close(); fn(); }, 'Go');

  // W-3: the tractor in 3D at the left; at the right a row of pots for the body and one for the trim. fresh: the paint just won.
  function paintPanel(parent, progress, fresh) {
    const box = el('paintpanel', 'div', parent), preview = el('preview', 'div', box), rows = el('rows', 'div', box);
    const show = () => { preview.innerHTML = `<img alt="" src="${tractorPic(progress.paint)}">`; };
    for (const area of ['body', 'trim']) {
      const row = el('prow', 'div', rows), tag = el('area', 'div', row), pots = el('pots', 'div', row);
      const mark = () => { tag.innerHTML = areaSvg(area, progress.paint[area]); [...pots.children].forEach(b => b.classList.toggle('on', b.dataset.c === progress.paint[area])); };
      for (const c of unlockedPaints(progress)) {
        const b = pic(pots, 'pot' + (c === fresh ? ' fresh' : ''), potSvg(c), () => { progress.paint = { ...progress.paint, [area]: c }; onPaint?.(progress.paint); mark(); show(); }, `${c} ${area}`);
        b.dataset.c = c;
      }
      mark();
    }
    show(); return box;
  }

  // F-11: only when there is a paint to choose; the main code starts driving at once otherwise
  function showStart(progress) {
    const s = open('start');
    paintPanel(s, progress);
    go(s, onPlay);
    pic(s, 'bookbtn', bookSvg(), () => showBook(progress, () => showStart(progress)), 'Sticker book');
  }

  // F-3: "New sticker!" and the sticker, stamped on (and a new hat), the paint screen when a paint was just won, one go button, and the
  // sticker book button with the number of stickers in it
  function showReward({ sticker, newPaint, newHat, progress }) {
    const s = open('reward' + (newPaint ? ' withpaint' : ''));
    el('caption', 'div', s).textContent = 'New sticker!'; // spoken with it (R-2): "You got a sticker!"
    const top = el('rewardtop', 'div', s), big = el('bigsticker', 'div', top); big.appendChild(portrait(icons, sticker));
    if (newHat) { const h = el('extra hatted', 'div', top); h.innerHTML = `<img alt="" src="${icons.pig}"><span>${hatSvg(newHat)}</span>`; }
    if (newPaint) paintPanel(s, progress, newPaint);
    go(s, onKeepDriving);
    const book = pic(s, 'bookbtn small', bookSvg(), () => showBook(progress, () => showReward({ sticker, newPaint, newHat, progress })), 'Sticker book');
    el('count', 'span', book).textContent = progress.stickers.length; // the new sticker went in the book: this many now
  }

  function showBook(progress, back) {
    const s = open('book'), grid = el('grid', 'div', s);
    for (const st of progress.stickers) { const cell = el('cell', 'div', grid); cell.appendChild(portrait(icons, st)); }
    if (!progress.stickers.length) grid.appendChild(el('empty', 'div')).innerHTML = bookSvg();
    pic(s, 'x', '<svg viewBox="0 0 40 40"><path d="M8 8 L32 32 M32 8 L8 32" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>', () => { close(); back?.(); }, 'Close');
  }

  // U-3: a small gear, top right. Hold for 2 s (a ring fills); a shorter press does nothing.
  const gear = el('gear', 'button', root); gear.innerHTML = gearSvg() + '<i></i>'; gear.setAttribute('aria-label', 'Parent menu');
  let holdStart = 0, raf = 0;
  const ring = gear.querySelector('i'), HOLD = 2000;
  const stop = () => { cancelAnimationFrame(raf); raf = 0; holdStart = 0; ring.style.setProperty('--p', '0deg'); };
  const tick = () => {
    if (!holdStart) return;
    const f = (performance.now() - holdStart) / HOLD; ring.style.setProperty('--p', Math.min(1, f) * 360 + 'deg');
    if (f >= 1) { stop(); onParent?.(); } else raf = requestAnimationFrame(tick);
  };
  gear.addEventListener('pointerdown', e => { e.stopPropagation(); gear.setPointerCapture?.(e.pointerId); holdStart = performance.now(); raf = requestAnimationFrame(tick); });
  for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) gear.addEventListener(n, stop);
  gear.addEventListener('contextmenu', e => e.preventDefault());

  function openParent(settings, seed) {
    root.querySelector('.parent')?.remove();
    const p = el('parent', 'div', root), box = el('box', 'div', p);
    box.innerHTML = `<h2>Parent menu</h2>
<fieldset><legend>Power</legend>${['low', 'medium', 'high'].map(v => `<label><input type="radio" name="power" value="${v}"> ${v[0].toUpperCase() + v.slice(1)}</label>`).join('')}</fieldset>
<fieldset><legend>Voice</legend><label><input type="radio" name="voice" value="1"> On</label><label><input type="radio" name="voice" value="0"> Off</label></fieldset>
<fieldset><legend>Music</legend><label><input type="radio" name="music" value="1"> On</label><label><input type="radio" name="music" value="0"> Off</label></fieldset>
<fieldset><legend>Farm seed (this farm: ${seed})</legend><label>Seed <input type="number" name="seed" min="0" step="1"></label><label><input type="checkbox" name="useSeed"> Use this seed</label></fieldset>
<div class="row"><button data-a="new">New farm</button><button data-a="clear">Clear stickers</button></div>
<div class="row"><button data-a="apply" class="primary">Apply</button><button data-a="close">Close</button></div>`;
    const q = n => box.querySelector(`[name=${n}]`), pick = (n, v) => { box.querySelector(`[name=${n}][value="${v}"]`).checked = true; };
    pick('power', settings.power); pick('voice', settings.voice ? 1 : 0); pick('music', settings.music ? 1 : 0);
    q('seed').value = settings.seed ?? seed; q('useSeed').checked = settings.seed !== null;
    const values = () => {
      const val = n => box.querySelector(`[name=${n}]:checked`).value, raw = q('seed').value.trim();
      return clampSettings({ power: val('power'), voice: val('voice') === '1', music: val('music') === '1', seed: q('useSeed').checked && raw !== '' ? Number(raw) : null });
    };
    const done = () => p.remove();
    box.addEventListener('click', e => {
      const a = e.target.dataset?.a; if (!a) return;
      if (a === 'apply') { onSettings(values()); done(); }
      else if (a === 'close') done();
      else if (a === 'new') { onSettings(values()); done(); close(); onNewFarm(); } // a screen left open would hide the new farm; onNewFarm itself brings back the start screen when play has not begun
      else if (a === 'clear' && confirm('Clear all stickers? This cannot be undone.')) { onClearStickers(); done(); }
    });
    p.addEventListener('pointerdown', e => e.stopPropagation());
  }
  return { showStart, showReward, showBook, openParent, hide: close };
}
