// Sickness (v3 §8, R3): four ailments with causes the player can see, a farm-wide cap, cooldowns after a cure, and
// the symptoms the view shows. Pure sim: no three.js, no DOM. An animal (a pig or a bird) carries `sick`
// ({ ailment, since, step }) while it is poorly, `green` (0..1, eased) for the view, and `sickCd`, the time it can next
// fall ill. sim.js and chickens.js call the cause hooks; the clinic (clinic.js) cures.
import { mulberry32 } from './layout.js';

// The tuning table's defaults (one table, like P and BED). Each farm tunes its own copy (`tune`, the ?tune= command).
export const SICK = {
  coldChance: 0.4,       // per animal: still wet (or muddy) and asleep outside the barn/coop at coldCheck s into the night
  coldCheck: 25,         // s after nightfall
  wetMin: 0.15,          // how wet (p.wet) counts as wet
  muddyMin: 0.3,         // how muddy counts (P.muddy)
  tummyChance: 0.5,      // on the snack (or handful of grain) that makes too many…
  tummySnacks: 3,        // …snacks for a pig…
  tummyGrain: 30,        // …grains for a bird…
  tummyWindow: 40,       // …within this many s
  splinterChance: 0.5,   // on a hard knock…
  splinterImpact: 5,     // …a sudden stop of at least this many m/s near a fence (thrown)
  earInterval: 600,      // s between random ear aches (only when nobody is sick)
  earChance: 1,          // the chance one comes when the interval is up
  maxSick: 3,            // poorly animals on the farm at once
  cooldown: 300,         // s after a cure before it can fall ill again
  sickSpeed: 0.6,        // speed factor while poorly
  greenEase: 3,          // s for the green to come (and go)
  symptomEvery: [5, 10], // s between symptoms (a sneeze, a groan…)
};

// The ailments: the card's phrase, the clue each check-up tool finds, the treatment(s) in order, the emote and the symptom.
export const AILMENTS = {
  cold:     { label: 'sniffly', clue: { stethoscope: 'Hmm, a bit wheezy…', thermometer: 'Ooh, a little bit hot!' }, cure: ['shot'], emote: 'drops', symptom: 'sneeze', birds: true },
  tummy:    { label: 'a tummy ache', clue: { stethoscope: 'Gurgle, gurgle! Too many treats, I think.' }, cure: ['spoon'], emote: 'sad', symptom: 'groan', birds: true },
  splinter: { label: 'a splinter', clue: { magnifier: 'There it is: a splinter!' }, cure: ['tweezers', 'bandage'], emote: 'ouch', symptom: 'limp', birds: true },
  ear:      { label: 'an ear ache', clue: { otoscope: 'That ear looks red and sore.' }, cure: ['drops'], emote: 'swirl', symptom: 'headshake', birds: false },
};
export const CHECKUPS = ['stethoscope', 'otoscope', 'thermometer', 'magnifier'];
export const TREATMENTS = ['shot', 'drops', 'spoon', 'tweezers', 'bandage'];

// createSickness({ pigs, birds, clock, seed, emit, now, inBarn, inCoop }) → the cause hooks, the clinic's cure, and step()
export function createSickness({ pigs, birds, clock, seed = 1, emit, now, outsideAtNight }) {
  const T = { ...SICK }; // this farm's values
  function tune(key, value) {
    if (!(key in T)) throw new Error(`pig-pens: no SICK value '${key}' (${Object.keys(T).join(', ')})`);
    const v = Array.isArray(T[key]) ? [].concat(value).map(Number) : Number(value);
    if ([].concat(v).some(x => !Number.isFinite(x))) throw new Error(`pig-pens: T.${key} needs a number, got '${value}'`);
    T[key] = v;
  }
  const rng = mulberry32((seed ^ 0x51c4) >>> 0); // its own sequence: falling ill never moves the farm's
  const all = () => [...pigs.map(p => ['pig', p]), ...birds().map(b => ['bird', b])];
  const sickCount = () => all().filter(([, a]) => a.sick).length;
  let coldAt = Infinity, earT = 0;

  function canSicken(a) { return !a.sick && (a.sickCd ?? 0) <= now() && !a.clinic && sickCount() < T.maxSick; }
  function sicken(kind, a, ailment, why) {
    if (!AILMENTS[ailment]) throw new Error(`pig-pens: no ailment '${ailment}'`);
    if (kind === 'bird' && !AILMENTS[ailment].birds) return false;
    if (!canSicken(a)) return false;
    a.sick = { ailment, since: now(), step: 0, next: T.symptomEvery[0] + rng() * (T.symptomEvery[1] - T.symptomEvery[0]) };
    emit('sick', { kind, i: a.i, ailment, name: a.name, why, x: a.px, z: a.pz });
    return true;
  }
  const maybe = (kind, a, ailment, chance, why) => (canSicken(a) && rng() < chance ? sicken(kind, a, ailment, why) : false);
  function cure(kind, a) {
    if (!a.sick) return false;
    const ailment = a.sick.ailment; a.sick = null; a.sickCd = now() + T.cooldown;
    emit('cured', { kind, i: a.i, ailment, name: a.name });
    return true;
  }

  // ---- causes ------------------------------------------------------------------
  function onNight() { coldAt = now() + T.coldCheck; }
  // a pig ate a snack / a bird pecked a grain: too many in the window gives a tummy ache
  function onEat(kind, a) {
    const t = now(), w = (a.ate ||= []); w.push(t);
    while (w.length && w[0] < t - T.tummyWindow) w.shift();
    if (w.length >= (kind === 'pig' ? T.tummySnacks : T.tummyGrain)) { w.length = 0; maybe(kind, a, 'tummy', T.tummyChance, 'too many treats'); }
  }
  // a sudden stop (thrown into a fence)
  function onImpact(kind, a, dv) { if (dv >= T.splinterImpact) maybe(kind, a, 'splinter', T.splinterChance, 'a hard knock'); }

  function step(dt) {
    const t = now();
    // the cold check, once a night
    if (clock.night && t >= coldAt) {
      coldAt = Infinity;
      for (const [kind, a] of all()) {
        if (!outsideAtNight(kind, a)) continue;
        if (kind === 'pig' && !(a.wet > T.wetMin || a.mud > T.muddyMin)) continue;
        maybe(kind, a, 'cold', T.coldChance, 'a cold night outside');
      }
    }
    if (!clock.night) coldAt = Infinity;
    // the odd ear ache, when nobody is poorly
    if (sickCount() === 0) {
      if ((earT += dt) > T.earInterval) {
        earT = 0;
        const can = pigs.filter(p => !p.piglet && canSicken(p));
        if (can.length && rng() < T.earChance) sicken('pig', can[Math.floor(rng() * can.length)], 'ear', 'out of the blue');
      }
    } else earT = 0;
    // green in and out, and the symptoms
    for (const [kind, a] of all()) {
      const g = a.sick ? 1 : 0; a.green = (a.green ?? 0) + Math.sign(g - (a.green ?? 0)) * Math.min(Math.abs(g - (a.green ?? 0)), dt / T.greenEase);
      if (!a.sick || a.clinic) continue;
      if ((a.sick.next -= dt) <= 0) {
        a.sick.next = T.symptomEvery[0] + rng() * (T.symptomEvery[1] - T.symptomEvery[0]);
        emit('symptom', { kind, i: a.i, symptom: AILMENTS[a.sick.ailment].symptom, x: a.px, y: a.py, z: a.pz });
      }
    }
  }
  return { step, onNight, onEat, onImpact, sicken, cure, canSicken, count: sickCount, tune, get T() { return T; } }; // T: this farm's live values (read them, tune to change them)
}
