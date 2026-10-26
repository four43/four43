// Rally settings (pure; storage lives in the view half). Field note #24.
import { MODES } from './modes.js';
import { LEVELS, LENGTH_NAMES } from '../gen/levels.js';

export const SETTINGS_V = 6;
// style: 1 (tight) … 5 (flowing); obstacles: 1 (mild) … 5 (frequent) (rally spec R14-3, R14-4)
export const DEFAULTS = { car: 'awd', surface: 'gravel', assist: false, gearbox: 'auto', mode: 'freeDrive', world: 'loop',
  theme: 'summer', obstacles: 2, style: 2, length: 'medium', units: 'mph',
  rumble: 'full' }; // rumble: the controller rumble's strength (off | light | full; view-only, rally-spec R7)

export function normalizeSettings(saved = {}) {
  const s = { ...DEFAULTS, ...saved, v: SETTINGS_V };
  if ((saved.v || 1) < 2) s.assist = DEFAULTS.assist; // round 2 made Sim the default (spec R2-1)
  if (!MODES[s.mode]) s.mode = 'freeDrive';
  if (s.world === 'pad') s.world = 'loop'; // settings v4: the pad left the menus
  if ('density' in s) { if (!('obstacles' in saved)) s.obstacles = s.density; delete s.density; } // v5: 'density' became 'obstacles'
  // v6: style and obstacles became levels 1 … 5 (twisty 2, flowing 4; mild 2, and wild 4: as often, no longer taller)
  s.style = { twisty: 2, flowing: 4 }[s.style] ?? s.style; s.obstacles = { mild: 2, wild: 4 }[s.obstacles] ?? s.obstacles;
  if (!LEVELS.includes(s.style)) s.style = DEFAULTS.style;
  if (!LEVELS.includes(s.obstacles)) s.obstacles = DEFAULTS.obstacles;
  if (!LENGTH_NAMES.includes(s.length)) s.length = DEFAULTS.length; // R14-5
  return s;
}

// 5 characters from 0-9a-z, drawn from an engine rng stream (replaces Math.random in the sim half).
export const newSeed = (r) => Array.from({ length: 5 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[r.int(0, 35)]).join('');
