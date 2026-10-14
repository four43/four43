// The overlays' view halves around ui/menus.js (lion-hawk 2g G3, G4, parity #2, #15, #17–#21): the start screen, the sticker card,
// the paint screen, the sticker book, the parent menu and the sleep screen, moved from main.js's createMenus wiring. Each opens its screen in enter and closes it in exit;
// the screen's go or close button is the overlay's control on game markup the engine adopts ([U-1]: view.ui.adopt() right after the
// screen is built). The screens draw a copy of the farm's progress and never write the sim: a pot, a hat or a sticker drag is a
// command (paint, hat, sticker.place, sticker.unplace, book.seen) and the sim's progress event follows.
import { createMenus, sunSvg } from '../ui/menus.js';
import { createStickerArt } from '../ui/stickerArt.js';
import { BED, minutesLeft } from '../sim/bedtime.js';

// pics(doc): the page's { renderer, icons, tractorPic, sound, voice } (game.view.js). net (G5): { session, netlog } from the entry
// (the session is set after boot, as it binds rooms to the engine), or null (no multiplayer panel)
export function menuHalves(pics, net = null) {
  let menus = null, engine = null, seen = null; // seen: the book's last seen mark before it opened (the new stickers bounce, F-3)
  const command = (type, data) => { try { engine?.command(type, data); } catch (e) { console.warn('command ' + type, e); } };
  const menusOf = doc => {
    if (menus) return menus;
    const p = pics(doc);
    return (menus = createMenus(doc.getElementById('ui'), {
      icons: p.icons, art: createStickerArt(p.renderer), tractorPic: p.tractorPic,
      onPaint(paint) { p.sound.plop(); command('paint', { body: paint.body, trim: paint.trim }); }, // W-3
      onHats(_, id) { p.sound.plop(); command('hat', { id }); }, // W-4
      onPlace(i, at) { command('sticker.place', { i, page: at.page, x: at.x, y: at.y }); }, // W-2
      onUnplace(i) { command('sticker.unplace', { i }); },
      onBookSeen() { if (!engine?.scene.overlays.includes('book')) command('book.seen', {}); }, // F-3: the book from the start screen or the card (the book overlay marks it itself)
      // P-3..P-8, E-5: the parent menu's choices. A seed waits for the next new farm; the sim saves nothing itself (the entry saves its events)
      onSettings(s) { command('settings', s); },
      onBedtime(minutes) { command('bed.set', { minutes, date: Date.now() }); }, // #85: counted from the view's wall date
      onNewFarm() { command('farm.new', {}); },
      onClearStickers() { command('stickers.clear', {}); }, // P-6 (it also closes the parent menu)
      onParentDone() { try { engine?.ui.tryTap('parent.close'); } catch (e) { console.warn('parent close', e); } }, // a choice that ends the menu closes its overlay as the X does
      // M-29..M-36, M-53: the Multiplayer panel. Each redraw makes its X again (multiplayer.close, adopted at once); M-33's
      // "Connected!" closes the overlay as the X does
      netlog: net?.netlog ?? null, onMpDraw() { ui?.adopt(); },
      onMpDone() { try { engine?.ui.tryTap('multiplayer.close'); } catch (e) { console.warn('multiplayer close', e); } },
    }));
  };
  const progressOf = e => structuredClone(e.scene.state.progress); // the screens change their copy as the player taps
  // one screen per overlay: show(menus, engine, progress, view) builds it; its go or close control is adopted at once
  let ui = null; // the view's UI (adopt)
  const half = (show, more = {}) => ({
    enter(e, view) {
      engine = e; ui = view.ui; if (!e.scene.state.progress) return;
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
        off = e.events.on(ev => { if (ev.type !== 'progress') return; const k = ev.progress.stickers.length; if (k < n) { menus.showStart(structuredClone(ev.progress)); ui?.adopt(); } n = k; });
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
    // P-1, U-3, E-7: the grown-ups' menu over the farm (its X and Multiplayer are parent.close and parent.mp). Not a `half`: closing
    // it must not hide the screen under it (the start screen)
    parent: {
      enter(e, view) {
        engine = e; const s = e.scene.state; if (!s.settings) return;
        menusOf(view.doc).openParent(s.settings, s.seed, { guest: s.net?.role === 'guest', bed: { choice: s.bed.choice, left: minutesLeft(s.bed, Date.now()), phase: s.bed.phase } }); // M-19
        view.ui.adopt();
      },
      exit() { menus?.closeParent(); },
    },
    sleep: sleepHalf(pics),
    // M-29..M-36 (parity #23–#25): the Multiplayer panel over the farm, drawn from the session (net/session.js). Closing it ends a
    // code check or a join prompt (its client closes); a room goes on
    multiplayer: {
      enter(e, view) { engine = e; ui = view.ui; const session = net?.session; if (!session) return; menusOf(view.doc).openMultiplayer(session); },
      exit() { try { net?.session?.cancel(); } catch (err) { console.warn('multiplayer cancel', err); } menus?.closeMultiplayer(); },
    },
    // the session changed (net/session.js onChange): the open panel redraws
    refreshMultiplayer() { menus?.refreshMultiplayer(); },
    // the farm's frame, while the book is shut: its seen mark (the book overlay marks every sticker seen as it opens)
    noteSeen(s) { seen = s.progress?.bookSeen ?? null; },
  };
}

// E-5 (parity #20, #21): asleep. The night layer with the big sun (sleep.wake, the sim's 5 s wall-time hold) and the lullaby while
// the overlay is open. The button shows after BED.dusk s of engine time, as night falls; at once for a quiet sleep (a reload while
// asleep, N-7), which the `sleep` event that opened the overlay says (overlay args do not reach a view half)
function sleepHalf(pics) {
  let layer = null, t0 = 0, sound = null;
  return {
    enter(e, view) {
      const doc = view.doc, ev = e.events.since(0).findLast(x => x.type === 'sleep'), quiet = ev?.quiet ?? true; // none in the log: never hide the wake
      sound = pics(doc).sound; sound.lullaby(true);
      layer = doc.createElement('div'); layer.id = 'sleep'; layer.hidden = !quiet; t0 = e.time.sim;
      layer.innerHTML = `<button type="button" class="pic wake" data-lh-slot="sleep.wake" aria-label="Wake up">${sunSvg()}<span>Wake Up!</span><i></i></button>`;
      doc.getElementById('ui').appendChild(layer); view.ui.adopt();
    },
    frame(e) { if (layer?.hidden && e.time.sim - t0 >= BED.dusk) layer.hidden = false; },
    exit() { layer?.remove(); layer = null; sound?.lullaby(false); },
  };
}
