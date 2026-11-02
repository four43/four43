// Harvest's economy and feel numbers (spec §4–§6). Sim-pure data. TUNE is the one mutable object: the sim reads it every step
// and ?tune writes it through the sim `tune` command (never from the view). Everything else is frozen.

// Crops: price per grain (H-S2), the colour the view gives their grain heap, the vehicle that cuts them, and how tough they are
// (H-H6): a vehicle cuts a crop only when its blades level is at least that; a crop it cannot cut (too tough, or another vehicle's)
// it pushes through slowly (TUNE.toughSlow) and leaves standing.
export const CROP_IDS = Object.freeze(['lawn', 'longgrass', 'clover', 'hay', 'alfalfa', 'wildflowers', 'wheat', 'corn', 'sunflower']);
const crop = (label, vehicle, tough, price, grain) => Object.freeze({ label, vehicle, tough, price, grain });
export const CROP = Object.freeze({
  lawn: crop('Lawn', 'mower', 0, 1, '#7ec850'),
  longgrass: crop('Long grass', 'mower', 1, 2, '#c4c45a'),
  clover: crop('Clover', 'mower', 2, 3, '#e58fb4'),
  hay: crop('Hay', 'tractor', 0, 4, '#d9c25a'),
  alfalfa: crop('Alfalfa', 'tractor', 1, 8, '#8fbf4a'),
  wildflowers: crop('Wildflowers', 'tractor', 2, 12, '#e8a0c8'),
  wheat: crop('Wheat', 'combine', 0, 20, '#e8c25a'),
  corn: crop('Corn', 'combine', 1, 40, '#f2b632'),
  sunflower: crop('Sunflowers', 'combine', 2, 80, '#5a4a3a'),
});

// Upgrades (H-U2) are each vehicle's own: src/defs/vehicles.js.

// Fields (H-F3, H-F5): a field is done (and grows back once) when DONE_AT of its cells are cut.
export const FIELD_IDS = Object.freeze(['lawn', 'longgrass', 'clover', 'hay', 'alfalfa', 'wildflowers', 'wheat', 'corn', 'sunflower']);
export const DONE_AT = 0.97;
export const START_COINS = 0;

// Feel and pacing, live-tunable (?tune).
export const TUNE = {
  growS: 45,          // H-H2: seconds from cut to ripe
  unloadRate: 150,    // H-S1: grain per second each wagon over the pit drops
  toughSlow: 0.4,     // H-H6: speed share pushing through a crop too tough to cut
};
export const TUNE_RANGE = Object.freeze({ growS: [5, 180], unloadRate: [5, 300], toughSlow: [0.1, 1] });
