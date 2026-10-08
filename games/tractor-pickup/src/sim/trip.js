// Trip state machine (spec 3.1, F-2, F-4). The game only reports a barn pass when animals ride.
const INTRO = 3, HELP_AFTER = 20, CAPACITY = 12;
export const createTrip = () => ({ state: 'intro', t: 0, idle: 0, said: false, fullSaid: false });
export function stepTrip(r, { dt, landed, booped, barnPass, showDone, rewardDone }) {
  const cues = []; r.t += dt;
  switch (r.state) {
    case 'intro': if (!r.said) { r.said = true; cues.push('say-intro'); } if (r.t >= INTRO - 1e-9) { r.state = 'drive'; r.t = 0; cues.push('drive'); } break;
    case 'drive':
      r.idle = booped ? 0 : r.idle + dt;
      if (landed >= CAPACITY) { r.idle = 0; if (!r.fullSaid) { r.fullSaid = true; cues.push('full'); } }
      else if (r.idle >= HELP_AFTER) { r.idle = 0; cues.push('help'); }
      if (barnPass) { r.state = 'show'; r.t = 0; cues.push('show'); }
      break;
    case 'show': if (showDone) { r.state = 'reward'; cues.push('reward'); } break;
    case 'reward': if (rewardDone) { r.state = 'drive'; r.idle = 0; r.fullSaid = false; cues.push('drive'); } break;
  }
  return cues;
}
// U-6: the paint screen and the sticker book hold the tractor ('menu') until they close; a 'drive' cue (end of the intro) must not free it
export const modeAfterDrive = mode => mode === 'menu' ? 'menu' : 'drive';
