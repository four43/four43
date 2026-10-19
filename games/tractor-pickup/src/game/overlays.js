// The overlays over the farm (lion-hawk 2f T4–T5, [S-2], [U-1], #4, #83): sim halves only (the view halves come in 2g). None
// pauses: the farm keeps stepping under them (the tractor is held by its mode, the trip waits for its flags), and the
// game-wide commands and network messages keep arriving (#49). Control ids are the test ids: start.go, show.skip,
// reward.go, paint.close, book.close, parent.close, parent.mp, multiplayer.close, sleep.wake.
import { seeBook } from '../sim/progress.js';
import { BED } from '../sim/bedtime.js';
import { play, closeReward, open, wake } from './flow.js';

const F = e => e.scene.state; // the farm's ctx.state (the main scene)
// Menu navigation (lion-hawk U-9): every overlay is a modal menu a pad or the keys can drive (D-pad/stick/arrows move, A/Enter
// select, a hold is held with A). The screens a grown-up or child closes go Back with B/Esc/Start; the start screen, the show,
// the sticker card and sleep have no Back (their own button moves the farm on). The parent menu opens on a 2 s Start hold,
// the same child lock as the HUD gear's 2 s hold.
const back = name => e => e.close(name);
// U-6: the paint screen and the sticker book hold the tractor ('menu') until they close; a 'drive' cue does not free it
const menu = (extra = () => {}) => ({
  enter(e) { const s = F(e); if (s.game) { s.game.mode = 'menu'; extra(e, s); } },
  exit(e) { const g = F(e).game; if (g?.mode === 'menu') g.mode = 'drive'; },
});

export function makeOverlays() {
  // F-11: paint and go, shown only when there is a paint to choose
  const start = { nav: { modal: true, initial: 'start.go' }, ui(u) { u.button({ id: 'go', label: 'Go', action: e => play(e, F(e)) }); } };
  // F-13, #79: the show is the view's cutscene; the sim holds the train until show.done. Skip: a 1 s hold on wall time (#83)
  const show = {
    nav: { modal: true, initial: 'show.skip' },
    ui(u) {
      u.hold({ id: 'skip', label: 'Skip', seconds: 1, wall: true, // ui/show.js CHEER.skipMs (1000 ms, F-13; a view module the sim cannot import)
        when: e => !!F(e).show && !F(e).show.done,
        action: e => { const sh = F(e).show; if (sh.skipped) return; sh.skipped = true; e.emit('showSkip'); } });
    },
  };
  // F-3: the sticker card holds the train until its go
  const reward = { nav: { modal: true, initial: 'reward.go' }, ui(u) { u.button({ id: 'go', label: 'Keep driving', action: e => closeReward(e, F(e)) }); } };
  const paint = { ...menu(), nav: { modal: true, back: back('paint') }, ui(u) { u.button({ id: 'close', label: 'Close', action: e => e.close('paint') }); } };
  // F-3: opening the book marks every sticker seen (the drive button's badge)
  const book = {
    nav: { modal: true, back: back('book') },
    ...menu((e, s) => { s.progress = seeBook(s.progress); e.emit('progress', { progress: structuredClone(s.progress) }); }),
    ui(u) { u.button({ id: 'close', label: 'Close', action: e => e.close('book') }); },
  };
  // P-1: the grown-up menu (its settings, bedtime, new farm and clear are commands from the view)
  const parent = {
    nav: { modal: true, back: back('parent'), open: { button: 'start', seconds: 2 } },
    ui(u) {
      u.button({ id: 'close', label: 'Close', action: e => e.close('parent') });
      u.button({ id: 'mp', label: 'Multiplayer', action: e => { e.close('parent'); open(e, 'multiplayer'); } });
    },
  };
  const multiplayer = { nav: { modal: true, back: back('multiplayer') }, ui(u) { u.button({ id: 'close', label: 'Close', action: e => e.close('multiplayer') }); } };
  // E-5: asleep (args { quiet }: the view shows the button at once, or after the dusk); wake up: a 5 s hold on wall time (#83)
  const sleep = { nav: { modal: true, initial: 'sleep.wake' }, ui(u) { u.hold({ id: 'wake', label: 'Wake up', seconds: BED.wakeHold / 1000, wall: true, action: e => wake(e, F(e)) }); } };
  return { start, show, reward, paint, book, parent, multiplayer, sleep };
}
