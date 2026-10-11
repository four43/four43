// Game modes (spec tracks T-21): data the Game reads. kind: the track kind the mode always uses
// (null = the player picks); clock: 'go' starts it on Go, 'line' at the first line crossing
// (flying start); startOffset: where the car starts, in m from the start line (null = spawn).
import { runUpDistance } from './pace.js';

export const MODES = {
  freeDrive: { id: 'freeDrive', label: 'Free drive', kind: null, countdown: false, clock: null, laps: false, startOffset: () => null },
  stage: { id: 'stage', label: 'Stage', kind: 'stage', countdown: true, clock: 'go', laps: false, startOffset: () => -4 },
  timeAttack: { id: 'timeAttack', label: 'Time attack', kind: 'loop', countdown: true, clock: 'line', laps: true,
    startOffset: (track) => -runUpDistance(track, track.roadside.gates[0].s) },
};
