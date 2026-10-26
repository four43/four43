// Style and obstacle levels (rally spec R14-3, R14-4): style 1 (tight) … 5 (flowing), obstacles 1 (few) … 5 (frequent),
// both 2 by default. The old names still read: 'twisty' = 2, 'flowing' = 4, 'mild' = 2; the old 'wild' was taller as
// well as denser, and only the density is left, so it reads as 4. Pure.
export const LEVELS = [1, 2, 3, 4, 5];
const STYLE_NAMES = { twisty: 2, flowing: 4 }, OBSTACLE_NAMES = { mild: 2, wild: 4 };
const level = (names, what) => (v) => {
  const n = names[v] ?? v;
  if (!LEVELS.includes(n)) throw new Error(`unknown ${what} ${v}`);
  return n;
};
export const styleLevel = level(STYLE_NAMES, 'style'), obstacleLevel = level(OBSTACLE_NAMES, 'obstacles');

// Track length (rally spec R14-5): a scale on the style's own target lengths and bands; medium is the style as it was.
export const LENGTH_SCALE = { micro: 0.3, short: 0.6, medium: 1, long: 1.5 };
export const LENGTH_NAMES = Object.keys(LENGTH_SCALE);
export const lengthScale = (v) => { const k = LENGTH_SCALE[v]; if (k === undefined) throw new Error(`unknown length ${v}`); return k; };
