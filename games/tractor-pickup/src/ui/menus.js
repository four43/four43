// Start screen (F-11), sticker card (F-3, F-9), paint screen (W-3), sticker book (W-2) and the parent menu (U-3, P-3..P-8).
// Everything a child sees is a picture (R-2, U-4); only the parent panel has text. Buttons use `click` so iOS counts the tap as a gesture for audio.
import { clampSettings, unlockedPaints, unlockedHats, wornHats, toggleHat, placeSticker, unplaceSticker, bookPages } from '../sim/progress.js';
import { PAINTS } from '../render/vehicles3d.js';
import { SCALE } from '../render/petScale.js';
import { qrSvg } from './qr.js';

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
export { paintBtnSvg };
export const bookSvg = () => `<svg viewBox="0 0 100 80" aria-hidden="true"><path d="M50 14 C36 6 18 8 8 14 V68 C18 62 36 60 50 68 C64 60 82 62 92 68 V14 C82 8 64 6 50 14 Z" fill="#fff6dc" stroke="#6b4428" stroke-width="4" stroke-linejoin="round"/><path d="M50 14 V68" stroke="#6b4428" stroke-width="3"/><circle cx="29" cy="38" r="10" fill="#f6a9bd" stroke="#6b4428" stroke-width="2"/><path d="M62 46 l8 -14 l8 14 z" fill="#f5c84c" stroke="#6b4428" stroke-width="2"/></svg>`;
const gearSvg = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#5a3820" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm9 4.4v-1.8l-2.2-.5a7 7 0 0 0-.7-1.7l1.2-1.9-1.3-1.3-1.9 1.2a7 7 0 0 0-1.7-.7L14.1 3h-1.8l-.5 2.2a7 7 0 0 0-1.7.7L8.2 4.7 6.9 6l1.2 1.9a7 7 0 0 0-.7 1.7L5.2 10.1v1.8l2.2.5c.2.6.4 1.2.7 1.7l-1.2 1.9 1.3 1.3 1.9-1.2c.5.3 1.1.5 1.7.7l.5 2.2h1.8l.5-2.2c.6-.2 1.2-.4 1.7-.7l1.9 1.2 1.3-1.3-1.2-1.9c.3-.5.5-1.1.7-1.7z"/></svg>`;
export const hatSvg = id => ({
  straw: '<svg viewBox="0 0 60 36"><ellipse cx="30" cy="28" rx="28" ry="7" fill="#f2c85a" stroke="#6b4428" stroke-width="2"/><path d="M16 28 C16 8 44 8 44 28 Z" fill="#e0b040" stroke="#6b4428" stroke-width="2"/><rect x="16" y="22" width="28" height="5" fill="#c0392b"/></svg>',
  cowboy: '<svg viewBox="0 0 60 40"><path d="M2 30 C10 36 50 36 58 30 C52 30 48 26 46 14 C40 4 20 4 14 14 C12 26 8 30 2 30 Z" fill="#8a5530" stroke="#4a2c14" stroke-width="2"/><rect x="15" y="22" width="30" height="4" fill="#4a2c14"/></svg>',
  party: '<svg viewBox="0 0 40 56"><path d="M20 4 L36 52 H4 Z" fill="#ff5fa2" stroke="#6b4428" stroke-width="2"/><path d="M13 30 H27 M9 42 H31" stroke="#ffd24a" stroke-width="5"/><circle cx="20" cy="5" r="4" fill="#fff" stroke="#6b4428" stroke-width="1.5"/></svg>',
})[id];

// W-2: the farm pictures of the book's pages, taking turns: day farm, pond, sunset
const PAGE_ART = [
  ['#9fd8f5', '#d8f0fb', '#7cc46a', '#5fae52', ''],
  ['#a8dcf2', '#e3f4fb', '#86c96f', '#69b45a', '<ellipse cx="560" cy="470" rx="190" ry="55" fill="#5fb4e0"/><ellipse cx="560" cy="462" rx="150" ry="36" fill="#86cbed"/>'],
  ['#f6a96a', '#fde3b5', '#8fb85a', '#76a24a', '<circle cx="640" cy="250" r="70" fill="#ffe08a"/>'],
];
const pageSvg = k => { const [s0, s1, h0, h1, extra] = PAGE_ART[k % PAGE_ART.length];
  return `<svg viewBox="0 0 800 600" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sky${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s0}"/><stop offset="1" stop-color="${s1}"/></linearGradient></defs>
<rect width="800" height="600" fill="url(#sky${k})"/><circle cx="130" cy="110" r="38" fill="#fff" opacity=".85"/><circle cx="170" cy="100" r="30" fill="#fff" opacity=".85"/><circle cx="560" cy="80" r="26" fill="#fff" opacity=".75"/>
<ellipse cx="180" cy="400" rx="340" ry="130" fill="${h1}"/><ellipse cx="650" cy="420" rx="320" ry="120" fill="${h1}"/><rect y="380" width="800" height="220" fill="${h0}"/>${extra}
</svg>`; };
const paintBtnSvg = () => `<svg viewBox="0 0 80 80" aria-hidden="true"><defs>${RB}</defs><path d="M14 26 H66 L62 70 Q40 76 18 70 Z" fill="#c9ccd4" stroke="#4a3a2c" stroke-width="4" stroke-linejoin="round"/>
<ellipse cx="40" cy="26" rx="26" ry="8" fill="url(#rb)" stroke="#4a3a2c" stroke-width="4"/><path d="M18 22 Q40 2 62 22" fill="none" stroke="#4a3a2c" stroke-width="4"/></svg>`;

export function createMenus(root, { icons, art, tractorPic, onPlay, onKeepDriving, onNewFarm, onSettings, onClearStickers, onPaint, onHats, onStickers, onParent, onMultiplayer }) {
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
    // W-4: a row of the unlocked hats, each turned on (gold ring) or off (pale) with a tap; the animals wear the ones that are on
    if (unlockedHats(progress).length) {
      const row = el('prow hats', 'div', rows), tag = el('area hatted', 'div', row), hats = el('pots', 'div', row);
      tag.innerHTML = `<img alt="" src="${icons.pig}"><span>${hatSvg(unlockedHats(progress)[0])}</span>`;
      const mark = () => [...hats.children].forEach(b => b.classList.toggle('on', wornHats(progress).includes(b.dataset.h)));
      for (const h of unlockedHats(progress)) {
        const b = pic(hats, 'pot hat', hatSvg(h), () => { progress.hatsOff = toggleHat(progress, h).hatsOff; onHats?.(progress); mark(); }, `${h} hat`);
        b.dataset.h = h;
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
    const top = el('rewardtop', 'div', s), big = el('bigsticker', 'div', top); big.appendChild(cut(sticker));
    if (newHat) { const h = el('extra hatted', 'div', top); h.innerHTML = `<img alt="" src="${icons.pig}"><span>${hatSvg(newHat)}</span>`; }
    if (newPaint) paintPanel(s, progress, newPaint);
    go(s, onKeepDriving);
    const book = pic(s, 'bookbtn small', bookSvg(), () => showBook(progress, () => showReward({ sticker, newPaint, newHat, progress })), 'Sticker book');
    el('count', 'span', book).textContent = progress.stickers.length; // the new sticker went in the book: this many now
  }

  // W-1: a die-cut sticker picture
  const cut = st => { const im = document.createElement('img'), a = art.get(st); im.className = 'cut' + (st.golden ? ' golden' : ''); im.alt = ''; im.src = a.src; im.draggable = false; im.style.aspectRatio = `${a.w} / ${a.h}`; return im; };
  const xSvg = () => '<svg viewBox="0 0 40 40"><path d="M8 8 L32 32 M32 8 L8 32" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>';
  const closeBtn = (s, fn) => pic(s, 'x', xSvg(), () => { close(); fn?.(); }, 'Close');

  // U-6: the paint screen while driving, with a close button
  function openPaint(progress, back) { const s = open('paint'); paintPanel(s, progress); closeBtn(s, back); }

  // W-2: pages with a farm picture, the tray of stickers not on a page, drag to place, drag again to move, drag to the tray to take off
  function showBook(progress, back, page = 0) {
    const s = open('book'), book = el('bookwrap', 'div', s), pg = el('page', 'div', book), tray = el('tray', 'div', s);
    const prev = pic(book, 'turn prev', '<svg viewBox="0 0 40 40"><path d="M26 6 L10 20 L26 34" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>', () => { page--; draw(); }, 'Previous page');
    const next = pic(book, 'turn next', '<svg viewBox="0 0 40 40"><path d="M14 6 L30 20 L14 34" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>', () => { page++; draw(); }, 'Next page');
    closeBtn(s, back);
    const fresh = progress.stickers.length - 1; // the newest sticker bounces once in the tray
    const draw = () => {
      page = Math.max(0, Math.min(bookPages(progress) - 1, page)); prev.hidden = page === 0; next.hidden = page >= bookPages(progress) - 1;
      pg.innerHTML = pageSvg(page);
      progress.stickers.map((st, i) => ({ st, i })).filter(o => o.st.place?.page === page).sort((a, b) => a.st.place.z - b.st.place.z).forEach(({ st, i }) => {
        const im = cut(st); im.classList.add('placed'); im.style.left = st.place.x * 100 + '%'; im.style.top = st.place.y * 100 + '%'; im.style.transform = `translate(-50%, -50%) rotate(${st.place.rot}rad)`;
        im.style.width = 20 * Math.max(0.65, SCALE[st.type] ?? 1) + '%'; // as big as the animal is next to the others (a chick is small)
        grab(im, i); pg.appendChild(im);
      });
      tray.innerHTML = '';
      progress.stickers.map((st, i) => ({ st, i })).filter(o => !o.st.place).reverse().forEach(({ st, i }) => { const im = cut(st); if (i === fresh) im.classList.add('fresh'); grab(im, i); tray.appendChild(im); });
      if (!tray.children.length) tray.classList.add('empty'); else tray.classList.remove('empty');
    };
    const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    function grab(im, i) {
      im.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        const r = im.getBoundingClientRect(), ghost = cut(progress.stickers[i]), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        ghost.className += ' ghost'; ghost.style.width = Math.max(r.width, pg.clientWidth * 0.2) + 'px'; s.appendChild(ghost); im.classList.add('lifted');
        const move = ev => { ghost.style.left = ev.clientX - dx + 'px'; ghost.style.top = ev.clientY - dy + 'px'; }; move(e);
        const up = ev => {
          removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); ghost.remove();
          const cx = ev.clientX - dx, cy = ev.clientY - dy, pr = pg.getBoundingClientRect();
          if (ev.type === 'pointerup' && inside(tray.getBoundingClientRect(), ev.clientX, ev.clientY)) progress.stickers = unplaceSticker(progress, i).stickers;
          else if (ev.type === 'pointerup' && inside(pr, cx, cy)) progress.stickers = placeSticker(progress, i, { page, x: (cx - pr.left) / pr.width, y: (cy - pr.top) / pr.height }).stickers;
          onStickers?.(progress); draw();
        };
        addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
      });
    }
    draw();
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

  function openParent(settings, seed, { guest = false } = {}) { // M-19: only the host makes a new farm in a room
    root.querySelector('.parent')?.remove();
    const p = el('parent', 'div', root), box = el('box', 'div', p);
    box.innerHTML = `<button data-a="close" class="x" aria-label="Close">${xSvg()}</button><h2>Parent menu</h2>
<div class="row"><button data-a="mp" class="primary">Multiplayer</button></div>
<fieldset><legend>Power</legend>${['low', 'medium', 'high'].map(v => `<label><input type="radio" name="power" value="${v}"> ${v[0].toUpperCase() + v.slice(1)}</label>`).join('')}</fieldset>
<fieldset><legend>Voice</legend><label><input type="radio" name="voice" value="1"> On</label><label><input type="radio" name="voice" value="0"> Off</label></fieldset>
<fieldset><legend>Music</legend><label><input type="radio" name="music" value="1"> On</label><label><input type="radio" name="music" value="0"> Off</label></fieldset>
<fieldset><legend>Farm seed (this farm: ${seed})</legend><label>Seed <input type="number" name="seed" min="0" step="1"></label><label><input type="checkbox" name="useSeed"> Use this seed</label></fieldset>
<div class="row"><button data-a="new"${guest ? ' disabled title="Leave the room first"' : ''}>New farm</button><button data-a="clear">Clear stickers</button></div>
<div class="row"><button data-a="apply" class="primary">Apply</button></div>`;
    const q = n => box.querySelector(`[name=${n}]`), pick = (n, v) => { box.querySelector(`[name=${n}][value="${v}"]`).checked = true; };
    pick('power', settings.power); pick('voice', settings.voice ? 1 : 0); pick('music', settings.music ? 1 : 0);
    q('seed').value = settings.seed ?? seed; q('useSeed').checked = settings.seed !== null;
    const values = () => {
      const val = n => box.querySelector(`[name=${n}]:checked`).value, raw = q('seed').value.trim();
      return clampSettings({ power: val('power'), voice: val('voice') === '1', music: val('music') === '1', seed: q('useSeed').checked && raw !== '' ? Number(raw) : null });
    };
    const done = () => p.remove();
    box.addEventListener('click', e => {
      const a = e.target.closest?.('[data-a]')?.dataset.a; if (!a) return; // (the close X holds an svg: the tap can land on it)
      if (a === 'apply') { onSettings(values()); done(); }
      else if (a === 'close') done();
      else if (a === 'mp') { done(); onMultiplayer(); }
      else if (a === 'new') { onSettings(values()); done(); close(); onNewFarm(); } // a screen left open would hide the new farm; onNewFarm itself brings back the start screen when play has not begun
      else if (a === 'clear' && confirm('Clear all stickers? This cannot be undone.')) { onClearStickers(); done(); }
    });
    p.addEventListener('pointerdown', e => e.stopPropagation());
  }
  // M-29..M-34: the Multiplayer panel (text, like the parent menu). It redraws on every session change while it is open.
  let mpSession = null;
  function openMultiplayer(session) { mpSession = session; root.querySelector('.parent.mp')?.remove(); const p = el('parent mp', 'div', root), box = el('box', 'div', p); p.addEventListener('pointerdown', e => e.stopPropagation()); drawMp(box); }
  function refreshMultiplayer() { const box = root.querySelector('.parent.mp .box'); if (box && mpSession) drawMp(box); }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const STATUS = { connecting: 'connecting…', direct: 'direct', relayed: 'relayed', away: 'away', '': '' };
  function playerRows(v, removable) {
    return `<ul class="players">${v.players.map(p => `<li><img alt="" src="${tractorPic(p.paint)}"><span>Player ${p.n}${p.you ? ' (this device)' : p.host ? ' (host)' : ''}</span><em>${STATUS[p.status] ?? ''}</em>${removable && !p.you ? `<button data-a="remove" data-n="${p.n}">Remove</button>` : ''}</li>`).join('')}</ul>`;
  }
  function drawMp(box) {
    const v = mpSession.view(), err = v.error ? `<p class="err">${esc(v.error)}</p>` : '';
    let body = '';
    if (v.state === 'idle') body = `<div class="row big"><button data-a="host" class="primary">Host</button><button data-a="join" class="primary">Join</button></div>${err}`;
    else if (v.state === 'starting') body = `<p>Making a room…</p>${err}<div class="row"><button data-a="stop">Cancel</button></div>`;
    else if (v.state === 'hosting') body = `<p class="room">${esc(v.name)}</p><div class="qr">${qrSvg(v.url)}</div>${playerRows(v, true)}
<label><input type="checkbox" data-a="lock"${v.locked ? ' checked' : ''}> Lock: no new players</label><div class="row"><button data-a="stop">Stop hosting</button></div>${err}`;
    else if (v.state === 'join' || v.state === 'checking') body = `<label>Room name <input name="room" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="tractor-pickup-K7MX2"></label>
<div class="row"><button data-a="submit" class="primary"${v.state === 'checking' ? ' disabled' : ''}>Join</button><button data-a="cancel">Back</button></div>${err}`;
    else if (v.state === 'prompt' || v.state === 'joining') { const n = Number(v.info.players) | 0; body = `<p>Join <b>${esc(v.name)}</b>? ${n} ${n === 1 ? 'player' : 'players'}.</p>
<div class="row"><button data-a="confirm" class="primary"${v.state === 'joining' ? ' disabled' : ''}>Join</button><button data-a="cancel">Cancel</button></div>${err}`; }
    else if (v.state === 'joined') body = `<p class="room">${esc(v.name)}</p>${playerRows(v, false)}<div class="row"><button data-a="leave">Leave</button></div>${err}`;
    const keep = box.querySelector('[name=room]')?.value ?? '';
    box.innerHTML = `<button data-a="close" class="x" aria-label="Close">${xSvg()}</button><h2>Multiplayer</h2>${body}`;
    const input = box.querySelector('[name=room]'); if (input) { input.value = keep; input.addEventListener('keydown', e => { if (e.key === 'Enter') mpSession.submitCode(input.value); }); }
    box.onclick = e => {
      const t = e.target.closest?.('[data-a]'), a = t?.dataset.a; if (!a) return;
      if (a === 'close') { mpSession.cancel(); box.parentElement.remove(); return; } // a check or a prompt ends with the panel (its client closes); a room goes on
      ({ host: () => mpSession.host(), join: () => mpSession.openJoin(), stop: () => mpSession.stopHosting(), submit: () => mpSession.submitCode(input.value), cancel: () => mpSession.cancel(),
        confirm: () => { mpSession.confirmJoin().then(() => { if (mpSession.view().state === 'joined') box.parentElement?.remove(); }); }, leave: () => mpSession.leave(),
        remove: () => mpSession.remove(Number(t.dataset.n)), lock: () => mpSession.lock(t.checked) })[a]?.();
    };
  }
  return { showStart, showReward, showBook, openPaint, openParent, openMultiplayer, refreshMultiplayer, hide: close, get open() { return !!screen; } };
}
