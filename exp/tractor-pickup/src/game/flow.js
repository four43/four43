// The trip flow in the sim (lion-hawk 2f T4–T5, spec 3.1, 3.4, 3.5, [S-4], #4, #79, #84, #85): the cues main.js handled in its frame loop
// (main.js:298-318), with the view effects turned into events. Each function takes the engine and the farm's ctx.state.
// What is purely visual (the sparkle trail, the arrows, the show camera and its blend back) is the view's reaction to the
// `guide`, `show` and `reward` events and state.
import { stepTrip, modeAfterDrive } from '../sim/trip.js';
import { buildShowSteps } from '../sim/showSteps.js';
import { completeShow, wornHats } from '../sim/progress.js';
import { sleepNow, wakeUp, stepBedtime } from '../sim/bedtime.js';
import { DT } from '../sim/ground.js';

const say = (e, ids) => e.emit('say', { ids });
// F-2, N-2: the barn path and arrow; the view draws them while on
export const setGuide = (e, s, on) => { if (s.guide !== on) { s.guide = on; e.emit('guide', { on }); } };
// the overlays are opened once: a cue or a command never stacks a second copy (engine.overlay throws on that)
export const open = (e, name, args) => { if (!e.isOpen(name, { pending: true })) e.overlay(name, args); };
const has = (ev, type) => { for (let i = 0; i < ev.length; i++) if (ev[i].type === type) return true; return false; }; // B-6: no closure per step

// E-5: the last drive. Driving (or in a menu): the voice and the barn path; in a show or on its card: that show is the last
export function lastDrive(e, s) {
  const g = s.game; if (!g.herd) return;
  g.lastDrive = true;
  if (g.mode === 'drive' || g.mode === 'menu') { say(e, ['go-to-barn']); setGuide(e, s, true); }
  else s.sleepAfter ||= g.mode === 'show' || g.mode === 'reward';
}
// E-5: asleep. The tractor is held; the view brings the night, the lullaby and (unless quiet) the goodnight voice
export function goSleep(e, s, { quiet = false } = {}) {
  sleepNow(s.bed); e.emit('bed', { bed: { ...s.bed } });
  s.sleepAfter = false; s.game.lastDrive = false; setGuide(e, s, false);
  s.game.mode = 'sleep';
  e.emit('sleep', { quiet });
  open(e, 'sleep', { quiet });
}
// E-5: the 5 s wake hold (sleep.wake)
export function wake(e, s) {
  wakeUp(s.bed); e.emit('bed', { bed: { ...s.bed } });
  e.close('sleep'); e.emit('wake');
  if (s.game.mode === 'sleep') s.game.mode = 'drive';
}
// F-11, A-7: the trip starts (the start screen's go, the view's first gesture or the first stick move)
export function play(e, s) {
  if (s.started) return;
  s.started = true; s.game.mode = 'drive';
  if (s.bed.phase === 'asleep') goSleep(e, s, { quiet: true }); else if (s.bed.phase === 'last') lastDrive(e, s);
  e.close('start'); e.emit('play');
}
// F-3: the card's go (or a clear of the stickers under it): the trip drives on at the next step
export function closeReward(e, s) { s.rewardDone = true; s.reward = null; e.close('reward'); }
// F-10, #79: the view's ack carries where each rider stands at the end of its show; they walk into the barn from there.
// gen: the farm the show was on (the `show` event's); an ack for an older farm's show is ignored
export function showDone(e, s, spots, gen) {
  const sh = s.show; if (!sh || sh.done) return; // only while the show runs; a second ack does nothing
  if (gen !== undefined && gen !== s.gen) return;
  if (Array.isArray(spots)) for (const p of spots) {
    if (!Array.isArray(p) || p.length !== 5 || !p.every(Number.isFinite)) continue;
    const r = sh.riders.find(x => x.animal.id === p[0]); if (!r) continue;
    const a = r.animal; a.x = p[1]; a.y = p[2]; a.z = p[3]; a.yaw = p[4];
  }
  sh.done = true; s.showDone = true;
}

// W-1, W-3, W-4: the sticker, a new color or hat, then the card. R-1: a failure here never leaves the game held
function reward(e, s, riders) {
  try {
    const r = completeShow(s.progress, riders.map(x => x.animal)); s.progress = r.progress;
    if (r.newHat) s.game.wearHats(wornHats(s.progress));
    s.reward = { sticker: r.sticker, newPaint: r.newPaint, newHat: r.newHat };
    e.emit('progress', { progress: structuredClone(s.progress) }); // a copy: the event log never sees later changes
    e.emit('reward', structuredClone(s.reward));
    open(e, 'reward');
  } catch (err) { console.error('reward', err); s.reward = null; s.rewardDone = true; }
}

// E-5, #85: time is up on the view's last wall date (checked each step, the date arrives once a second). Before the trip.
export function stepBed(e, s) {
  if (s.date !== null && stepBedtime(s.bed, s.date) === 'last') { e.emit('bed', { bed: { ...s.bed } }); lastDrive(e, s); }
}

// spec 3.1: intro, drive, show, reward. Runs at the end of the farm step while the trip is on, started and not asleep.
export function stepFlow(e, s, ev) {
  const g = s.game, sync = s.net?.sync ?? null;
  const cues = stepTrip(s.trip, { dt: DT, landed: g.load.landed(), booped: has(ev, 'boop'), barnPass: has(ev, 'barnPass'), showDone: s.showDone, rewardDone: s.rewardDone });
  s.showDone = s.rewardDone = false;
  for (const c of cues) {
    if (c === 'drive' && s.sleepAfter) { goSleep(e, s); continue; } // E-5: the card of the last show is closed: goodnight
    if (c === 'drive') g.mode = modeAfterDrive(g.mode); // the card is gone: driving and boops work again (U-6: not under paint or book)
    if (c === 'say-intro') say(e, ['lets-find', 'animals']);
    if (c === 'full') { say(e, ['great-job', 'go-to-barn']); setGuide(e, s, true); }
    if (c === 'help' && !g.barnWait) { // F-4: the helper calls out; M-9: a guest asks the host (its answer is the sync's help event, or none)
      if (!(s.net?.role === 'guest' && sync?.requestHelp())) { const a = g.herd.callHelp(g.tractor); if (a) e.emit('help', { animal: a }); }
    }
    if (c === 'show') {
      setGuide(e, s, false); const riders = g.startShow(); sync?.showStarted(); // M-17
      if (s.bed.phase === 'last') s.sleepAfter = true; // E-5: this was the last drive
      s.show = { riders, done: !riders.length, skipped: false };
      if (!riders.length) { s.showDone = true; continue; } // E-5: an empty last drive has no show
      for (const r of riders) r.animal.state = 'show'; // #79: the slot spring lets go; the view animates its own copies
      open(e, 'show');
      e.emit('show', { gen: s.gen, riders: riders.map(r => ({ id: r.animal.id, type: r.animal.type, golden: !!r.animal.golden, car: r.slot.car, k: r.slot.k })),
        steps: buildShowSteps(riders.map(r => ({ type: r.animal.type, golden: r.animal.golden }))) });
    }
    if (c === 'reward') {
      const riders = s.show?.riders ?? []; s.show = null;
      if (!riders.length) { g.finishShow(riders); s.rewardDone = true; g.mode = 'reward'; continue; } // E-5: no animals, no sticker: straight on to sleep
      e.close('show'); g.finishShow(riders); sync?.delivered(riders); g.mode = 'reward'; // F-3: held (no driving, no boops) until the card's go
      reward(e, s, riders);
    }
  }
}
