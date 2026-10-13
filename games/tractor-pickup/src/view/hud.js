// The farm's HUD on the engine path (lion-hawk 2g G2, parity #9–#12, #16, #18, #23): main.js's wiring of ui/hud.js (the slot
// bar, the words, the golden flash, the edge arrow), ui/roster.js (circles and the finder), render/hornMarks.js, the barn-wait
// bubble (M-72), the barn path (F-2), the help arrow (F-4) and the drive buttons, moved. It reads the farm's state and engine
// events and never writes the sim: the drive buttons and the gear are the sim's controls (farm.paint, farm.book, farm.parent)
// on game markup the engine adopts (data-lh-slot, [U-1]).
import { createHud } from '../ui/hud.js';
import { createRoster, createFinder, placeArrow } from '../ui/roster.js';
import { createHornMarks } from '../render/hornMarks.js';
import { paintBtnSvg, bookSvg, gearSvg } from '../ui/menus.js';
import { VIEW } from '../render/scene.js';
import { slotIndex } from '../sim/slots.js';
import { TYPES } from '../sim/herd.js';
import { newStickers } from '../sim/progress.js';
import { START_PAINT } from '../net/players.js';
import { barnPath } from './world.js';

// M-72: the hourglass in the bubble of a train that waits for the barn
const HOURGLASS_SVG = `<svg viewBox="0 0 60 76" aria-hidden="true"><path d="M12 10h36c0 14-12 20-12 28s12 14 12 28H12c0-14 12-20 12-28S12 24 12 10z" fill="#e8f4ff" stroke="#6b4428" stroke-width="3" stroke-linejoin="round"/><path d="M18 17h24c-3 8-9 11-12 15-3-4-9-7-12-15z" fill="#f5c84c"/><path d="M30 50c-5 3-11 8-12 14h24c-1-6-7-11-12-14z" fill="#f5c84c"/><rect x="6" y="3" width="48" height="8" rx="4" fill="#a0673a"/><rect x="6" y="65" width="48" height="8" rx="4" fill="#a0673a"/></svg>`;
const HELP_SECS = 10; // F-4: the arrow to the helper animal, on engine time

// The adopted controls' markup, made once in #ui before boot so the first UI sync adopts it ([U-1]: the engine makes its own
// element for a control with no slot when the control appears). U-6: the drive buttons (bottom left, hidden until driving);
// U-3: the gear (top left; the ring is its <i>, filled from --lh-progress). An adopted control out of the registry has no
// data-testid: the template hides it then. The screens' own buttons (go, the red X) come with their screens (view/menus.js).
export function hudMarkup(doc) {
  const ui = doc.getElementById('ui');
  if (doc.getElementById('drivebtns')) return;
  const button = (parent, cls, slot, html, label) => { const b = doc.createElement('button'); b.type = 'button'; b.className = cls; b.dataset.lhSlot = slot; b.innerHTML = html; b.setAttribute('aria-label', label); parent.appendChild(b); return b; };
  const drive = Object.assign(doc.createElement('div'), { id: 'drivebtns', hidden: true }); ui.appendChild(drive);
  button(drive, 'pic paintbtn', 'farm.paint', paintBtnSvg(), 'Paint');
  button(drive, 'pic stickerbtn', 'farm.book', bookSvg(), 'Sticker book');
  button(ui, 'gear', 'farm.parent', gearSvg() + '<i></i>', 'Parent menu');
}

// M-75: the horn marks live in the scene, not a farm: made once per scene (in it before the shader warm-up, B-2)
const marksOf = new WeakMap();
const hornMarksIn = scene => { let m = marksOf.get(scene); if (!m) marksOf.set(scene, m = createHornMarks(scene)); return m; };

// F-2, F-4: a point off screen (or behind the camera) gives an arrow on a screen ellipse inset by 70 px, pointing toward it; on screen gives null
const _at = { x: 0, y: 0, angle: 0, on: false };
function edgeArrow(rig, p) {
  const s = rig.toNdc(p.x, p.y, p.z);
  placeArrow(s.nx, s.ny, s.behind, VIEW.w, VIEW.h, 70, _at); return _at.on ? null : _at;
}

// root: #ui. world(): the farm's 3D (its fx), tractorAt(): the drawn tractor position (interpolated). icons, tractorPic: the
// slot pictures and the bubble's tractor (ui/icons.js); paints: PAINTS (render/vehicles3d.js); scene: the page's three.js scene.
export function createTractorHud(root, { icons, voice, sound, rig, paints, tractorPic, scene, world, tractorAt }) {
  const doc = root.ownerDocument, before = new Set(root.children);
  const hud = createHud(root, { icons, onWordTap: ids => voice.say(ids), onSlotTap: (type, golden) => { sound.animal(type); voice.say(golden ? ['golden', type] : [type]); } }); // E-3
  // M-75..M-79: the players' circles by the menu button, and after a honk in a room, arrows to the other players
  const roster = createRoster(root, paints), finder = createFinder(root, paints, (x, y, z) => rig.toNdc(x, y, z), () => VIEW);
  const hornMarks = hornMarksIn(scene);
  // M-72: held at the barn while another player's show has it: a bubble with that player's tractor and a turning hourglass (no text, R-2)
  const barnWaitEl = Object.assign(doc.createElement('div'), { id: 'barnwait', hidden: true });
  barnWaitEl.innerHTML = `<img alt="">${HOURGLASS_SVG}`; root.appendChild(barnWaitEl);
  const made = [...root.children].filter(n => !before.has(n));
  const driveBtns = doc.getElementById('drivebtns'), bookBtn = driveBtns?.querySelector('.stickerbtn');
  const plop = () => sound.plop(); // a drive button's tap (the engine opens its screen; a disabled button gets no click)
  for (const b of driveBtns?.children ?? []) b.addEventListener('click', plop);
  let sceneId, showOn = false, sync = null, guide = false, help = null, helpUntil = 0, pathT = 0, pathK = false, barnWay = null, barnBy = 0;
  const p0 = { x: 0, y: 0, z: 0 };
  // M-75: where a horn mark goes: key 0 is this device's tractor, else the other player's number
  const hornAt = (key, out) => { if (!key) { out.copy(tractorAt()); return true; } const p = sync?.players.map.get(key); if (!p?.pose) return false; const q = p.pose.tractor.p; out.set(q.x, q.y, q.z); return true; };
  function badge(progress) { // F-3: the drive button's badge: new stickers only
    if (!bookBtn || !progress) return; bookBtn.querySelector('.count')?.remove();
    const n = newStickers(progress); if (n) bookBtn.appendChild(Object.assign(doc.createElement('span'), { className: 'count', textContent: n }));
  }
  const unguide = () => { help = null; world()?.fx.sparkleTrail([]); hud.arrowTo(null); };
  // 2f delta: the slot bar from the farm's state (presets land riders with no `land` event), the path and the badge. id: the
  // scene id this state belongs to (engine.scene.id), so the next frame does not reset it again
  function reset(s, id = sceneId) {
    sceneId = id; showOn = !!s?.show; hud.reset(); help = null; pathT = 0; barnWay = null;
    const g = s?.game; if (!g) return;
    if (g.load) for (const sl of g.load.slots) if (sl.landed) hud.fill(slotIndex(sl) + 1, sl.animal.type, sl.animal.golden);
    guide = !!s.guide; badge(s.progress);
  }
  return {
    reset,
    hop(r) { hud.markOut(slotIndex(r.slot ?? r) + 1); }, // F-15: the show's onHop: its animal hopped out (a rider, or its { car, k })
    event(e, engine) {
      const s = engine.scene.state, g = s.game;
      switch (e.type) {
        case 'land': { // W-5: the word pops in and flies into its slot; E-6: a golden one flashes the bar
          const a = e.animal, n = slotIndex(e.slot) + 1, ids = a.golden ? ['golden', a.type] : [a.type];
          if (a.golden) hud.goldFlash();
          hud.fill(n, a.type, a.golden); hud.showWord((a.golden ? 'Golden ' : '') + TYPES[a.type].word, n, ids); break;
        }
        case 'unclaim': hud.reset(); for (const sl of g.load.slots) if (sl.landed) hud.fill(slotIndex(sl) + 1, sl.animal.type, sl.animal.golden); break; // M-14: the slot bar packs up
        case 'horn': if (s.net?.sync) { hornMarks.honk(0); finder.show(); } break; // M-75, M-76: in a room
        case 'remoteHorn': hornMarks.honk(e.n); break;
        case 'help': help = e.animal; helpUntil = engine.time.sim + HELP_SECS; break; // F-4, M-9
        case 'guide': guide = e.on; pathT = 0; if (!e.on) unguide(); break; // F-2
        case 'show': case 'sleep': unguide(); break;
        case 'reward': hud.reset(); break;
        case 'progress': badge(e.progress); break; // F-3: a sticker, the book seen, the stickers cleared
      }
    },
    // dt: the frame's (0 for a hook render)
    frame(engine, dt) {
      const s = engine.scene.state, g = s.game, t = g.tractor; sync = s.net?.sync ?? null;
      if (engine.scene.id !== sceneId) reset(s, engine.scene.id); // 2f delta: a jump re-entered the farm
      else if (showOn !== !!s.show) { showOn = !!s.show; if (!showOn) reset(s); } // the show is over: the bar is empty, even when the card failed (R-1)
      hornMarks.update(dt, hornAt); finder.update(dt, sync, !!s.show || g.mode !== 'drive'); roster.update(sync, s.progress.paint);
      if (driveBtns) { const on = s.started && g.mode === 'drive' && !s.show; if (driveBtns.hidden === on) driveBtns.hidden = !on; } // U-6
      // M-72: the bubble shows whose show has the barn; that tractor toots once. It goes when this train's own show starts
      const n = g.barnWait > 0 ? g.barnWait : 0;
      if (n !== barnBy) { barnBy = n; barnWaitEl.hidden = !n; if (n) { barnWaitEl.firstChild.src = tractorPic(sync?.players.map.get(n)?.paint ?? START_PAINT); sound.horn(0.4); } }
      if (!s.tripOn || !s.started) return; // F-2: sparkle path and arrow to the barn; F-4: arrow to the helper animal for 10 s
      if (help && (engine.time.sim >= helpUntil || !g.herd.free().includes(help))) help = null;
      const fx = world()?.fx;
      if (guide && fx && (pathT -= dt) <= 0) { pathT = 0.25; barnWay = barnPath(g, t.x, t.z); if ((pathK = !pathK)) fx.sparkleTrail(barnWay.path); fx.sparkleFrame(barnWay.frame); } // the door frame twice as often
      const aim = s.show ? null : help ? (p0.x = help.x, p0.y = 1, p0.z = help.z, p0) : guide && barnWay ? barnWay.aim : null;
      hud.arrowTo(aim && edgeArrow(rig, aim));
    },
    dispose() {
      for (const b of driveBtns?.children ?? []) b.removeEventListener('click', plop);
      if (driveBtns) driveBtns.hidden = true;
      hornMarks.clear(); finder.hide();
      for (const n of made) n.remove();
    },
  };
}
