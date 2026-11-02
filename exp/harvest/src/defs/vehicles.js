// The vehicles (spec H-V1..H-V3; plan docs/spec/vehicle-ladder-plan.md), in the order the farm opens them. Each has a price (the
// first is free), its road speed (H-H5: off the crop it always drives this fast; in crop it slows to its speed upgrade's cutting
// speed), the zone it sells at, where it starts, whether it carries a bin on itself (the mower's catcher) besides the carts
// it tows, and its own upgrade table. Every table has the same five ids so the sim, the card and the saves treat them alike: speed,
// width (the cutter), bins (what each bin holds), carts (how many it tows) and blades (the toughest of its crops it cuts).
// value(level) is what a level gives; cost(level) is the price of going from level to level + 1 (base × growth^level, rounded to 5).
// Sim-pure data.
import { YARD, BACKYARD } from '../sim/layout.js';

export const UPGRADE_IDS = Object.freeze(['speed', 'width', 'bins', 'carts', 'blades']);
const up = (label, max, base, growth, value, noun) => Object.freeze({ label, max, base, growth, value, noun });

export const VEHICLE_IDS = Object.freeze(['mower', 'combine']);
export const VEHICLES = Object.freeze({
  mower: Object.freeze({
    label: 'Mower', price: 0, road: 6.5, sell: 'compost', start: BACKYARD.start, bag: true,
    upgrades: Object.freeze({
      speed: up('Cut speed', 6, 40, 1.55, l => 2.2 + 0.4 * l),
      width: up('Deck', 5, 60, 1.6, l => 1.1 + 0.3 * l),
      bins: up('Bin size', 6, 50, 1.5, l => 120 + 40 * l), // clippings the catcher (and each tip cart) holds
      carts: up('Tip carts', 2, 300, 2.5, l => l, ['tip cart', 'tip carts']),
      blades: up('Blades', 2, 150, 4, l => l),
    }),
  }),
  combine: Object.freeze({
    label: 'Combine', price: 8000, road: 10, sell: 'sell', start: YARD.start, bag: false,
    upgrades: Object.freeze({
      speed: up('Cut speed', 8, 1200, 1.5, l => 3.2 + 0.6 * l),
      width: up('Header', 5, 2000, 1.75, l => 3 + l),
      bins: up('Bin size', 6, 1600, 1.55, l => 350 + 80 * l), // grain one wagon holds
      carts: up('Wagons', 4, 5000, 2.1, l => 1 + l, ['wagon', 'wagons']),
      blades: up('Blades', 2, 6000, 5, l => l), // the toughest crop it cuts
    }),
  }),
});

const round5 = v => Math.max(5, Math.round(v / 5) * 5);
// the price of a vehicle's upgrade from `level` to the next, or null at the top
export function costOf(vehicle, id, level) {
  const u = VEHICLES[vehicle]?.upgrades[id];
  return !u || level >= u.max ? null : round5(u.base * u.growth ** level);
}
export const upgrade = (vehicle, id) => VEHICLES[vehicle].upgrades[id];
