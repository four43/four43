// ?tune's table (D-5, lion-hawk 2g G4b): the feel constants the playtest panel may move, keyed by a stable id. Each row addresses
// the object the sim reads (a POWER preset, TP, PILOT, TR, TREE) and the key in it; the `tune` command (game/commands.js) writes
// through tuneSet, the panel reads back through tuneGet. No copies: the value lives where it always did. Degree rows show and take
// degrees and store radians. The camera rows are the view's (ui/debug.js). Feel constants are module-level, so two sims in one
// process (the headless mp() tests) share them.
import { POWER, TP } from './tractor.js';
import { PILOT } from './pilot.js';
import { TR } from './hitch.js';
import { TREE } from './trees.js';

const D = Math.PI / 180;
const preset = g => POWER[g.tractor.power]; // the tractor's own preset (tractor.P is this same object)
const row = (id, label, of, min, max, step, deg = false) => Object.freeze({ id, label, of, key: id.slice(id.indexOf('.') + 1), min, max, step, deg });

export const TUNE = Object.freeze([
  row('P.vmax', 'vmax', preset, 3, 15, 0.5), row('P.force', 'force', preset, 2000, 15000, 100),
  row('P.rearSide', 'rearSide', preset, 0.2, 1.2, 0.01), row('P.slideMax', 'slideMax', preset, 0.2, 1.2, 0.01),
  row('P.loose', 'loose', preset, 0, 0.3, 0.005),
  row('PILOT.revCone', 'reverse cone deg', () => PILOT, 0, 80, 1, true),
  row('PILOT.fullErr', 'full speed err deg', () => PILOT, 5, 80, 1, true), row('PILOT.crawlErr', 'crawl err deg', () => PILOT, 30, 180, 1, true),
  row('PILOT.crawl', 'crawl', () => PILOT, 0, 1, 0.05), row('PILOT.gain', 'pilot gain', () => PILOT, 0.5, 6, 0.1),
  row('TP.revForce', 'reverse force', () => TP, 2000, 15000, 100), row('TP.turnHelp', 'turn help', () => TP, 0, 12, 0.5),
  row('PILOT.helpSpeed', 'help below m/s', () => PILOT, 0, 8, 0.5),
  row('TP.slip', 'slip', () => TP, 0.5, 6, 0.1), row('TP.steerMax', 'steerMax', () => TP, 0.3, 0.9, 0.01),
  row('TREE.breakSpeed', 'tree break speed', () => TREE, 1, 10, 0.5),
  row('TP.stiffness', 'stiffness (reload)', () => TP, 8, 40, 1), row('TR.limitBeta', 'trailer limitBeta', () => TR, 0.1, 2, 0.05),
]);
const ROWS = new Map(TUNE.map(r => [r.id, r]));
export const TUNE_POWERS = Object.keys(POWER);

// the value the sim reads, in the row's units (degrees for a degree row)
export function tuneGet(game, id) { const r = ROWS.get(id), v = r.of(game)[r.key]; return r.deg ? v / D : v; }
// writes a value clamped to the row's range; returns what was written (row units), or null for an unknown id or a non-number
export function tuneSet(game, id, value) {
  const r = ROWS.get(id); if (!r || typeof value !== 'number' || !Number.isFinite(value)) return null;
  const v = Math.max(r.min, Math.min(r.max, value));
  r.of(game)[r.key] = r.deg ? v * D : v;
  return v;
}
// every row's value, for the panel's console line (copied into tractor.js and friends)
export const tuneValues = game => Object.fromEntries(TUNE.map(r => [r.id, tuneGet(game, r.id)]));
