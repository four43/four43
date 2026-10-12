// Rally settings (pure; storage lives in the view half). Field note #24.
import { MODES } from './modes.js';

export const SETTINGS_V = 4;
export const DEFAULTS = { car: 'awd', surface: 'gravel', assist: false, gearbox: 'auto', mode: 'freeDrive', world: 'loop',
  theme: 'summer', density: 'mild', style: 'twisty', units: 'mph' };

export function normalizeSettings(saved = {}) {
  const s = { ...DEFAULTS, ...saved, v: SETTINGS_V };
  if ((saved.v || 1) < 2) s.assist = DEFAULTS.assist; // round 2 made Sim the default (spec R2-1)
  if (!MODES[s.mode]) s.mode = 'freeDrive';
  if (s.world === 'pad') s.world = 'loop'; // settings v4: the pad left the menus
  return s;
}

// 5 characters from 0-9a-z, drawn from an engine rng stream (replaces Math.random in the sim half).
export const newSeed = (r) => Array.from({ length: 5 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[r.int(0, 35)]).join('');
