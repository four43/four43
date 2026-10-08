// E-5: bedtime. The parent picks Now, 3, 5 or 10 minutes (parent menu). When the time is up the trip goes on (R-1) and the barn
// path shows for one last drive ('last'); after that show the farm goes to sleep ('asleep') until a 5 s hold on "Wake Up!".
// Times are wall-clock ms, so bedtime survives a reload.
export const BEDTIME_CHOICES = [0, 3, 5, 10]; // minutes; 0 = now
export const BED = { dusk: 4, wakeHold: 5000, wakeFade: 2 }; // s from day to night; ms the wake button is held; s from night to day
export function clampBedtime(b) {
  const phase = ['awake', 'last', 'asleep'].includes(b?.phase) ? b.phase : 'awake';
  const at = phase === 'awake' && Number.isFinite(b?.at) ? b.at : null, choice = BEDTIME_CHOICES.includes(b?.choice) && at !== null ? b.choice : null;
  return { phase, at, choice };
}
// minutes: one of BEDTIME_CHOICES, or null to cancel. Changing it while 'last' or 'asleep' does nothing (the wake button ends those).
export function setBedtime(b, minutes, now) {
  if (b.phase !== 'awake') return b;
  if (minutes === null || !BEDTIME_CHOICES.includes(minutes)) { b.at = null; b.choice = null; } else { b.at = now + minutes * 60000; b.choice = minutes; }
  return b;
}
// 'last' once, when the time is up
export function stepBedtime(b, now) { if (b.phase === 'awake' && b.at !== null && now >= b.at) { b.phase = 'last'; b.at = null; b.choice = null; return 'last'; } return null; }
export const sleepNow = b => { b.phase = 'asleep'; b.at = null; b.choice = null; return b; };
export const wakeUp = b => { b.phase = 'awake'; b.at = null; b.choice = null; return b; };
export const minutesLeft = (b, now) => b.at === null ? null : Math.max(0, Math.ceil((b.at - now) / 60000));
