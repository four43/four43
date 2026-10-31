// The HUD (lion-hawk 2e P7, [U-5]): main.js's info card, hint, snack badge, egg counter and pops and day/night label,
// moved out of its closure and driven from the farm state (`selected`) and engine events instead of the old handlers. View only: it reads the sim, never writes it.
// createHud(doc, { world }) → { hint(text, seconds, now), event(ev, basket), update(engine, s, frame, dt), dispose() }
import * as THREE from 'three';
import { ST } from '../sim.js';
import { AILMENTS } from '../sickness.js';
import { rig } from './rig.js';

const PIG_DOING = s => ({ [ST.BED]: 'Off to bed in the barn', [ST.ROAM]: 'Wandering about', [ST.GRAZE]: 'Nibbling the grass', [ST.EAT]: 'Eating at the trough', [ST.FLEE]: 'Running away!', [ST.SNACK]: 'Chasing a snack', [ST.GRAB]: 'Squealing in your hand', [ST.AIR]: 'Flying!', [ST.SHOWER]: 'Waiting for a bath', [ST.ZOOM]: 'Squeaky clean and zooming', [ST.VISIT]: 'Saying hello to Dr. Emmy' }[s]);
const BIRD_DOING = { 0: 'Pecking at the ground', 1: 'Strutting about', 2: 'Going for grain', 3: 'Off to a nest box', 4: 'Laying an egg', 5: 'Sitting on an egg', 6: 'Taking a dust bath', 7: 'Panicking!', 8: 'Heading to bed', 9: 'Climbing the ramp', 10: 'Asleep in the coop', 11: 'Coming out', 12: 'Inside the fox’s cheeks!', 13: 'Lost in the woods', 14: 'Flapping in your hand', 15: 'Flapping through the air', 16: 'Walking home', 17: 'Chasing the fox!', 19: 'Saying hello to Dr. Emmy' };
const bar = (label, v, cls) => `<div class="bar ${cls}"><span>${label}</span><i><b style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></b></i></div>`;
// poorly, waiting at the vet's, or on the table (v3 §8.2, §9): the card's line, over what it would say otherwise
function sickLine(sim, a, kind) {
  if (a.clinic) {
    const k = sim.clinic.queue.findIndex(q => q.kind === kind && q.i === a.i);
    if (k < 0) return 'All better! Off home'; // 2.14.0: made better, walking out
    return k === 0 && sim.clinic.exam.who ? 'On the exam table' : `Waiting to see Dr. Emmy (${k + 1}${['st', 'nd', 'rd'][k] ?? 'th'} in line)`;
  }
  if (a.sick) return `Feeling poorly: ${AILMENTS[a.sick.ailment].label}. Take ${a.name} to the vet!`;
  return null;
}
function cardInfo(sim, sel) {
  const lay = sim.lay, flock = sim.flock;
  if (sel.kind === 'pig') {
    const p = sim.pigs[sel.i], mum = p.mom >= 0 ? sim.pigs[p.mom].name : null;
    let doing = PIG_DOING(p.state);
    if (p.state === ST.REST) doing = p.bed?.phase === 'wait' ? 'Waiting at the barn doors' : p.bed?.nap ? 'Napping in the barn' : p.bed ? 'Fast asleep in the barn'
      : Math.hypot(p.px - lay.wallow.x, p.pz - lay.wallow.z) < 4 ? 'Rolling in the mud' : 'Fast asleep';
    if (p.state === ST.BED && p.bed?.phase === 'out') doing = 'Off out to the pen';
    doing = sickLine(sim, p, 'pig') ?? doing;
    if (p.state === ST.TRAVEL) doing = p.trough >= 0 ? 'Heading to the trough' : p.target === lay.destinations.length - 1 ? 'Off to the mud' : 'Exploring another pen';
    return { name: p.name, sub: p.piglet ? `Piglet · mum is ${mum}` : p.stall >= 0 ? `Pig · sleeps in stall ${p.stall + 1}` : 'Pig', doing, bars: bar('Hunger', p.hunger, 'hunger') + bar('Mud', p.mud, 'mud'), at: [p.px, p.pz] };
  }
  if (sel.kind === 'bird') {
    const b = flock.birds[sel.i], adults = flock.birds.filter(o => o.kind !== 'chick').length;
    const sub = b.kind === 'rooster' ? 'Rooster · top of the pecking order' : b.kind === 'chick' ? `Chick · mum is ${flock.birds[b.mom].name}` : `Hen · number ${b.rank + 1} of ${adults} in the pecking order`;
    const extra = b.kind === 'hen' ? `<div class="facts"><span>Eggs today <b>${b.eggsToday}</b></span><span>All time <b>${b.eggsTotal}</b></span></div>` : '';
    return { name: b.name, sub, doing: sickLine(sim, b, 'bird') ?? BIRD_DOING[b.state], bars: extra + bar('Fright', b.panic, 'fright'), at: b.state === 12 ? [flock.fox.x, flock.fox.z] : b.hidden && b.state !== 10 ? null : [b.px, b.pz] };
  }
  if (sel.kind === 'fox') { const f = flock.fox; return { name: 'The fox', sub: 'Fox · up to no good', doing: f.carrying ? `Cheeks full of ${f.carrying.name}! Tap to make it spit.` : ['Gone', 'Sniffing around', 'Chasing a chicken!', 'Very pleased with itself', 'Running away'][f.state], bars: bar('Nerve', 1 - Math.min(1, f.fear / 0.6), 'fright'), at: f.state ? [f.x, f.z] : null }; }
  if (sel.kind === 'vet') { const v = sim.vet; return { name: v.name, sub: 'Vet · looks after every animal on the farm', doing: v.doing, bars: '', at: [v.x, v.z] }; }
  return { name: 'Biscuit', sub: 'Sheepdog · good dog', doing: sim.dog.active ? 'Herding' : sim.dog.visit ? (sim.vet.pet?.a === sim.dog ? 'Getting a scratch from Dr. Emmy' : 'Saying hello to Dr. Emmy') : sim.dog.home === 3 ? 'Napping in his dog house' : sim.dog.home ? 'Trotting home' : 'Waiting for a job', bars: '', at: [sim.dog.x, sim.dog.z] };
}

// 2.14.0: the exam room's patients counter, a little face for each patient in the clinic (sim.clinic.queue)
const FACE = {
  pig: '<svg viewBox="0 0 32 32"><path d="M7 9 4 3l9 4M25 9l3-6-9 4" fill="#e98aa4" stroke="#6b4428" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="17" r="12" fill="#f6a9bd" stroke="#6b4428" stroke-width="2"/><ellipse cx="16" cy="21" rx="6" ry="4.2" fill="#e98aa4" stroke="#6b4428" stroke-width="1.8"/><circle cx="14" cy="21" r="1.1" fill="#6b4428"/><circle cx="18" cy="21" r="1.1" fill="#6b4428"/><circle cx="11" cy="13.5" r="1.6" fill="#3a2414"/><circle cx="21" cy="13.5" r="1.6" fill="#3a2414"/></svg>',
  bird: '<svg viewBox="0 0 32 32"><path d="M11 7c0-4 3-5 4-3 1-3 5-2 4 1 3-1 4 2 2 4" fill="#e8483f" stroke="#6b4428" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="18" r="11" fill="#fffaf0" stroke="#6b4428" stroke-width="2"/><path d="M13 19h6l-3 5z" fill="#f2a33a" stroke="#6b4428" stroke-width="1.6" stroke-linejoin="round"/><path d="M15 24.5q1 3 2 0" fill="#e8483f" stroke="#6b4428" stroke-width="1.4"/><circle cx="12" cy="15" r="1.6" fill="#3a2414"/><circle cx="20" cy="15" r="1.6" fill="#3a2414"/></svg>',
};
export function patientsLabel(n) { return n ? `${n} patient${n === 1 ? '' : 's'}` : 'All better!'; }

export function createHud(doc, { world }) {
  const $ = id => doc.getElementById(id), win = doc.defaultView;
  const card = $('card'), hintEl = $('hint'), badge = $('snacks'), feedBtn = doc.querySelector('[data-tool="feed"]');
  const dn = $('daynight'), eggTxt = $('eggCount'), eggBox = $('eggs'), outside = $('outside'), say = $('say');
  const pBox = $('patients'), pFaces = $('patientFaces'), pCount = $('patientCount'); let pKey = null;
  let sayUntil = null; const sayV = new THREE.Vector3();
  const stillMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let selKey = null, hintUntil = null, shownLeft = -1, lastEggs = -1, night = null;
  const eggPops = [], popV = new THREE.Vector3();

  function renderCard(sim, sel) {
    const c = cardInfo(sim, sel);
    $('cardName').textContent = c.name; $('cardSub').textContent = c.sub; $('cardDoing').textContent = c.doing || '';
    $('cardBars').innerHTML = c.bars;
    world.select(c.at, sel.kind);
  }
  // collecting an egg floats the new basket total up from the nest. It's an HTML overlay that starts
  // above the nest-box roof (~0.86 m), so the box can never cover or cut through it.
  function popEgg(x, z, n) {
    for (const p of eggPops) if (Math.hypot(p.x - x, p.z - z) < 1.2) p.t = Math.max(p.t, 0.98); // quick taps: the older number fades so only the newest count reads
    const el = doc.createElement('div'); el.className = 'eggpop'; el.textContent = n; el.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(el); eggPops.push({ el, x, z, t: 0 });
  }
  function updateEggPops(dt) {
    const canvas = rig.canvas;
    for (let i = eggPops.length - 1; i >= 0; i--) {
      const p = eggPops[i]; p.t += dt; const u = Math.min(1, p.t / 1.4);
      if (u >= 1) { p.el.remove(); eggPops.splice(i, 1); continue; }
      popV.set(p.x, 1.15 + (stillMotion ? 0 : 0.6 * (1 - (1 - u) * (1 - u))), p.z).project(rig.camera);
      const sc = stillMotion ? 1 : u < 0.15 ? 0.4 + 0.8 * (u / 0.15) : 1.2 - 0.2 * Math.min(1, (u - 0.15) / 0.15);
      p.el.style.opacity = popV.z > 1 ? 0 : u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      p.el.style.transform = `translate(${(popV.x + 1) / 2 * canvas.clientWidth}px, ${(1 - popV.y) / 2 * canvas.clientHeight}px) translate(-50%, -100%) scale(${sc})`;
    }
  }

  return {
    // [U-5] the deadline is on engine time (main.js counted frame time down)
    hint(text, seconds, now) { hintEl.textContent = text; hintEl.classList.add('on'); hintUntil = now + seconds; },
    event(ev, basket) { if (ev.type === 'egg') popEgg(ev.x, ev.z, basket); },
    say(text, seconds, now) { if (!say) return; say.textContent = text; say.hidden = false; sayUntil = now + seconds; },
    // every drawn frame; dt is 0 for hook renders (#19)
    update(engine, s, frame, dt) {
      const sim = s.sim, sel = s.selected, key = sel ? `${sel.kind}:${sel.i}` : null;
      // the card: shown, filled and ringed on the frame the selection changes, then refreshed every 6 frames
      if (key !== selKey) { selKey = key; card.hidden = !sel; if (sel) renderCard(sim, sel); else world.select(null); }
      else if (sel && frame % 6 === 0) renderCard(sim, sel);
      if (hintUntil !== null && engine.time.sim >= hintUntil) { hintUntil = null; hintEl.classList.remove('on'); }
      const left = sim.foodCap - sim.foods.length;
      if (left !== shownLeft) {
        shownLeft = left; badge.textContent = left; badge.classList.toggle('empty', left === 0);
        feedBtn?.setAttribute('aria-label', `Feed, ${left} of ${sim.foodCap} snacks left`);
      }
      const f = sim.flock;
      if (f.basket !== lastEggs) { const bump = lastEggs >= 0; lastEggs = f.basket; eggTxt.textContent = lastEggs; if (bump) { eggBox.classList.remove('bump'); void eggBox.offsetWidth; eggBox.classList.add('bump'); } }
      if (sim.clock.night !== night) { night = sim.clock.night; dn.setAttribute('aria-label', night ? 'Night. Switch to day' : 'Day. Switch to night'); } // aria-pressed is the engine's (farm.night)
      if (outside) { outside.hidden = !s.focus; const label = s.focus === 'clinic.exam' ? 'Back' : 'Outside'; if (outside.lastChild.textContent !== label) outside.lastChild.textContent = label; }
      // Dr. Emmy's speech bubble, over her head while it lasts (and only while you're in her clinic)
      if (say && sayUntil !== null) {
        const v = sim.vet, on = engine.time.sim < sayUntil && s.focus?.startsWith('clinic');
        if (engine.time.sim >= sayUntil) { sayUntil = null; say.hidden = true; }
        else if (on) {
          sayV.set(v.x, 1.75, v.z).project(rig.camera); say.hidden = sayV.z > 1;
          say.style.transform = `translate(${(sayV.x + 1) / 2 * rig.canvas.clientWidth}px, ${(1 - sayV.y) / 2 * rig.canvas.clientHeight}px) translate(-50%, -100%)`;
        } else say.hidden = true;
      }
      // the patients still to see, while you're in the exam room
      if (pBox) {
        const q = sim.clinic.queue, inExam = s.focus === 'clinic.exam', key = inExam ? q.map(w => w.kind).join() : null;
        if (key !== pKey) {
          const fewer = pKey !== null && key !== null && key.split(',').filter(Boolean).length < pKey.split(',').filter(Boolean).length;
          pKey = key; pBox.hidden = !inExam;
          if (inExam) {
            pFaces.innerHTML = q.map(w => FACE[w.kind]).join(''); pCount.textContent = patientsLabel(q.length); pBox.classList.toggle('done', !q.length);
            if (fewer) { pBox.classList.remove('bump'); void pBox.offsetWidth; pBox.classList.add('bump'); }
          }
        }
      }
      updateEggPops(dt);
    },
    dispose() {
      for (const p of eggPops) p.el.remove(); eggPops.length = 0;
      card.hidden = true; hintEl.classList.remove('on'); if (pBox) pBox.hidden = true;
    },
  };
}
