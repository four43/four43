// A whole generated track from a seed (spec tracks T-2 … T-7): layout, obstacles, terrain,
// surfaces, roadside and a locator. Each generator draws from its own rng fork, so changing one
// never reshuffles the others. Pure data: no Rapier, no three.js.
import { rng } from './rng.js';
import { generateLayout } from './trackgen.js';
import { placeFeatures } from './features.js';
import { generateTerrain, heightAt } from './terrain.js';
import { generateSurfaces } from './surfaces.js';
import { placeRoadside } from './roadside.js';
import { makeLocator } from './locate.js';
import { generateEdges } from './edges.js';
import { generateWear } from './wear.js';
import { generateBumps } from './bumps.js';
import { styleLevel, obstacleLevel } from './levels.js';
import { flatOut, lineSpot, turnLoop } from './speed.js';
import { ROADSIDE } from './roadside.js';

export const ROAD_WIDTH = 7;
const LINE_MU = { summer: 0.8, winter: 0.7 }; // gravel; packed snow with some ice

// style: 1 (tight, rallycross-like) … 5 (open and fast); obstacles: 1 (few) … 5 (frequent); both 2 by default, old names
// read (levels.js). Style 4 keeps the original seed string (the tracks seeds gave before styles existed) and 2 the old
// 'twisty' one, so those tracks are unchanged; the new levels get their own.
// length: micro | short | medium (the default, the tracks as they were) | long (rally spec R14-5).
const seedKey = (seed, kind, style, length) => (style === 4 ? `${seed}|${kind}` : style === 2 ? `${seed}|${kind}|twisty` : `${seed}|${kind}|style${style}`) +
  (length === 'medium' ? '' : `|${length}`);
export function generateTrack(seed, { kind = 'loop', theme = 'summer', obstacles: ob = 2, style: sv = 2, length = 'medium' } = {}) {
  const style = styleLevel(sv), obstacles = obstacleLevel(ob);
  const r = rng(seedKey(seed, kind, style, length));
  // A loop is turned so its line sits where a flat-out crossing can still brake for what follows (rally spec R18-5).
  // The surfaces aren't laid yet, so the theme's loose-road grip stands in.
  let layout = generateLayout(r.fork('layout'), { kind, style, length });
  if (layout.closed) layout = turnLoop(layout, lineSpot(layout, LINE_MU[theme] ?? 0.8).i, ROADSIDE.gateS);
  const surfaces = generateSurfaces(layout, r.fork('surfaces'), { theme });
  const features = placeFeatures(layout, r.fork('features'), { obstacles, style, speed: flatOut(layout, surfaces) });
  const edges = generateEdges(layout, surfaces, r.fork('edges'), features);
  const bumps = generateBumps(layout, surfaces, edges, features, r.fork('bumps'), { obstacles });
  const terrain = generateTerrain(layout, features, r.fork('terrain'), { roadBumps: bumps, edges });
  const heightFn = (x, z) => heightAt(terrain, x, z);
  const roadside = placeRoadside(layout, heightFn, features, r.fork('roadside'), { edges });
  const locator = makeLocator(layout);
  const wear = generateWear(layout, surfaces, edges, r.fork('wear'));
  // Spawn on the centreline just past the start of the layout, facing along the road.
  const i = Math.min(10, layout.n - 1);
  const spawn = { x: layout.x[i], y: terrain.road[i] + 0.6, z: layout.z[i], yaw: layout.heading[i] };
  return { seed, kind, style, theme, obstacles, size: length, layout, features, terrain, surfaces, edges, wear, bumps, roadside, locator, spawn, roadWidth: ROAD_WIDTH };
}
