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

export const ROAD_WIDTH = 7;

// style: 'twisty' (rallycross-like, the default) | 'flowing' (open and fast). Flowing keeps the
// original seed string, so its tracks are the ones seeds gave before styles existed.
export function generateTrack(seed, { kind = 'loop', theme = 'summer', density = 'mild', style = 'twisty' } = {}) {
  const r = rng(style === 'flowing' ? `${seed}|${kind}` : `${seed}|${kind}|${style}`);
  const layout = generateLayout(r.fork('layout'), { kind, style });
  const features = placeFeatures(layout, r.fork('features'), { density, style });
  const terrain = generateTerrain(layout, features, r.fork('terrain'), {});
  const surfaces = generateSurfaces(layout, r.fork('surfaces'), { theme });
  const heightFn = (x, z) => heightAt(terrain, x, z);
  const roadside = placeRoadside(layout, heightFn, features, r.fork('roadside'), {});
  const locator = makeLocator(layout);
  // Spawn on the centreline just past the start of the layout, facing along the road.
  const i = Math.min(10, layout.n - 1);
  const spawn = { x: layout.x[i], y: terrain.road[i] + 0.6, z: layout.z[i], yaw: layout.heading[i] };
  return { seed, kind, style, theme, density, layout, features, terrain, surfaces, roadside, locator, spawn, roadWidth: ROAD_WIDTH };
}
