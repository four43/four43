// The overlays' view halves around ui/menus.js (lion-hawk 2g G3, parity #2, #15, #17): the start screen, the sticker card, the
// paint screen and the sticker book, moved from main.js's createMenus wiring. Each opens its screen in enter and closes it in exit;
// the screen's go or close button is the overlay's control on game markup the engine adopts ([U-1]: view.ui.adopt() right after the
// screen is built). The screens draw a copy of the farm's progress and never write the sim: a pot, a hat or a sticker drag is a
// command (paint, hat, sticker.place, sticker.unplace, book.seen) and the sim's progress event follows.
import { createMenus } from '../ui/menus.js';
import { createStickerArt } from '../ui/stickerArt.js';

// pics(doc): the page's { renderer, icons, tractorPic, sound, voice } (game.view.js)
export function menuHalves(pics) {
  let menus = null, engine = null, seen = null; // seen: the book's last seen mark before it opened (the new stickers bounce, F-3)
  const command = (type, data) => { try { engine?.command(type, data); } catch (e) { console.warn('command ' + type, e); } };
  const menusOf = doc => {
    if (menus) return menus;
    const p = pics(doc);
    return (menus = createMenus(doc.getElementById('ui'), {
      icons: p.icons, art: createStickerArt(p.renderer), tractorPic: p.tractorPic, gear: false, slots: true,
      onPaint(paint) { p.sound.plop(); command('paint', { body: paint.body, trim: paint.trim }); }, // W-3
      onHats(_, id) { p.sound.plop(); command('hat', { id }); }, // W-4
      onPlace(i, at) { command('sticker.place', { i, page: at.page, x: at.x, y: at.y }); }, // W-2
      onUnplace(i) { command('sticker.unplace', { i }); },
      onBookSeen() { command('book.seen', {}); }, // F-3: the book from the start screen or the card (the book overlay marks it itself)
    }));
  };
  const progressOf = e => structuredClone(e.scene.state.progress); // the screens change their copy as the player taps
  // one screen per overlay: show(menus, engine, progress, view) builds it; its go or close control is adopted at once
  const half = (show, more = {}) => ({
    enter(e, view) {
      engine = e; if (!e.scene.state.progress) return;
      show(menusOf(view.doc), e, progressOf(e), view); view.ui.adopt();
      more.enter?.(e, view);
    },
    exit(e, view) { more.exit?.(e, view); menus?.hide(); },
  });
  let off = null;
  return {
    // F-11: paint and go (start.go). A clear of the stickers from the parent menu (P-6) brings the start screen back, as main.js
    // did, so a sticker book opened from it never shows stickers that are gone
    start: half((m, e, p) => m.showStart(p), {
      enter(e) {
        let n = e.scene.state.progress.stickers.length;
        off = e.events.on(ev => { if (ev.type !== 'progress') return; const k = ev.progress.stickers.length; if (k < n) menus.showStart(structuredClone(ev.progress)); n = k; });
      },
      exit() { off?.(); off = null; },
    }),
    // F-3, W-1, W-3, W-4: the sticker, a new paint or hat, the go button (reward.go); the voice, and bells for a new paint or hat
    reward: half((m, e, p, view) => {
      const r = e.scene.state.reward; if (!r) return;
      m.showReward({ sticker: r.sticker, newPaint: r.newPaint, newHat: r.newHat, progress: p });
      const { sound, voice } = pics(view.doc);
      if (r.newPaint || r.newHat) sound.bells();
      voice.say(['you-did-it', 'new-sticker']);
    }),
    paint: half((m, e, p) => m.openPaint(p)), // U-6, W-3 (paint.close)
    book: half((m, e, p) => { if (seen !== null) p.bookSeen = seen; m.showBook(p); }), // W-2 (book.close)
    // the farm's frame, while the book is shut: its seen mark (the book overlay marks every sticker seen as it opens)
    noteSeen(s) { seen = s.progress?.bookSeen ?? null; },
  };
}
