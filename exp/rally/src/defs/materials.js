// Rally's material registry (lion-hawk M-1…M-3, phase 3). Road and verge surfaces carry the tyre model's Magic Formula
// parameters in `tire` (the old src/tire.js SURFACES table, moved) and their display name in `game.name` (D6);
// colliders carry friction and restitution (√f with Multiply, max restitution: M-8, M-9); `look` feeds the material
// compiler. Ids are 'rally-<surface key>' so a surface never shadows a base material. Every entry states phys
// friction and restitution, so no base-library value reaches the feel.
import { defineMaterials } from 'lion-hawk/sim';

// look.color white: the pad's surface texture carries the colour (the pad ground is the only mesh drawn with these).
// `plow` (R5-4, loose-surface side force) isn't an engine tire field, so it rides in the free-form `game` block.
// `road` (R10-3, R13) is the road shader's preset for a road surface (render/roadSurface.js), also in `game`: `paint`, its
// palette (sRGB): `base`, `light` and `dark` tone bands, `mark` (tyre marks), `rim` (just inside the edge), `chip` (flat
// stones); layer strengths 0..1 (`tone` how strongly the tone bands show, `streak` painted strokes along the road, `chips`,
// `rimW` rim width m, `wet` wet patches (darker, glossy), `relief` fine aggregate relief (m), `mud` dried mud cracks, `edge` ragged edge
// and spill, `crack`, `line` centre dashes, `pud` puddles, `ice` the ice model). Base roughness is look.roughness.
// `pebbles` (R10-6, render/pebbles.js): loose stones per m² on the road and on the shoulder just past the edge, their size
// range (m, radius) and colour. `ground` on a verge surface (R13): the terrain's palette: `a`, `b`, `c` grass (or snow)
// tones, `dry` patches, `clump` small strokes, `earth` and `rock` on slopes, and the slope (ny) range.
const ground = (base, name, { plow, ...tire }, look = {}, extra = {}) => ({ extends: base, phys: { friction: 0.8, restitution: 0 }, tire, look: { color: '#ffffff', ...look }, game: { name, plow, ...extra } });
const road = (paint, o) => ({ road: { paint, tone: 1, streak: 0.5, chips: 0, rimW: 0.3, wet: 0, relief: 0.002, mud: 0, edge: 1, crack: 0, line: 0, pud: 0, ice: 0, pebbles: null, ...o } });

export default defineMaterials({
  'rally-tarmac':   ground('asphalt', 'Tarmac',       { mu: 1.15, C: 1.50, kp: 0.10, ap: 0.12, crr: 0.015, drag: 0, plow: 0 }, { roughness: 0.85, metalness: 0 },
    road({ base: '#4d525a', light: '#5b6169', dark: '#43474e', mark: '#363a40', rim: '#3e4248', chip: '#6b7078' },
      { tone: 0.25, streak: 0.08, rimW: 0.2, wet: 0.6, relief: 0.0015, edge: 0.3, crack: 1 })),
  'rally-hardpack': ground('dirt',    'Dirt',         { mu: 0.90, C: 1.40, kp: 0.14, ap: 0.15, crr: 0.025, drag: 0, plow: 0.10 }, { roughness: 0.95, metalness: 0 },
    road({ base: '#c28b5a', light: '#d49f6d', dark: '#ab784c', mark: '#9e6d45', rim: '#946a46', chip: '#8c6747' },
      { streak: 0.8, chips: 0.3, pud: 1, wet: 0.4, mud: 1, pebbles: { road: 10, shoulder: 14, size: [0.02, 0.07], color: '#9a7a5c' } })),
  'rally-gravel':   ground('gravel',  'Loose gravel', { mu: 0.80, C: 1.25, kp: 0.18, ap: 0.18, crr: 0.035, drag: 0, plow: 0.25 }, { roughness: 0.95, metalness: 0 },
    road({ base: '#b3a48d', light: '#c5b7a0', dark: '#9c8e79', mark: '#9a8670', rim: '#a19380', chip: '#d6cab6' },
      { streak: 0.7, chips: 1, rimW: 0.25, wet: 0.2, relief: 0.003, pebbles: { road: 40, shoulder: 24, size: [0.025, 0.09], color: '#9a948a' } })),
  'rally-grass':    ground('grass',   'Grass',        { mu: 0.55, C: 1.55, kp: 0.12, ap: 0.14, crr: 0.050, drag: 0.2, plow: 0 }, { roughness: 1, metalness: 0, side: 'double' }, // the verge tufts
    { ground: { a: '#4f6a34', b: '#5c7839', c: '#6a8640', dry: '#8a874b', clump: '#445e2e', earth: '#a27a50', rock: '#8c887f', slope: [0.95, 0.8] } }),
  'rally-sand':     ground('dirt',    'Sand',         { mu: 0.50, C: 1.20, kp: 0.22, ap: 0.20, crr: 0.120, drag: 0.14, plow: 0.35 }),
  'rally-mud':      ground('mud',     'Mud',          { mu: 0.40, C: 1.50, kp: 0.15, ap: 0.16, crr: 0.100, drag: 0.18, plow: 0.20 }),
  'rally-packed':   ground('snow',    'Packed snow',  { mu: 0.75, C: 1.25, kp: 0.20, ap: 0.20, crr: 0.030, drag: 0, plow: 0.12 }, { roughness: 0.95, metalness: 0 },
    road({ base: '#d5dde8', light: '#e2e9f1', dark: '#c3cddb', mark: '#aebcd0', rim: '#bccadb', chip: '#ffffff' },
      { streak: 0.6 })),
  'rally-snowbank': ground('snow',    'Snowbank',     { mu: 0.30, C: 1.20, kp: 0.25, ap: 0.22, crr: 0.150, drag: 0.1, plow: 0.30 }, {},
    { ground: { a: '#e6edf5', b: '#f2f6fb', c: '#fbfcfe', dry: '#d3deeb', clump: '#dbe4ef', earth: '#8f8780', rock: '#767a81', slope: [0.86, 0.7] } }),
  'rally-ice':      ground('ice',     'Ice',          { mu: 0.55, C: 1.40, kp: 0.08, ap: 0.08, crr: 0.015, drag: 0, plow: 0 }, { roughness: 0.25, metalness: 0 },
    road({ base: '#9ec1d7', light: '#b9d5e6', dark: '#88afca', mark: '#cfe4f1', rim: '#d9e6f0', chip: '#eef5fa' },
      { streak: 0.9, edge: 0.6, ice: 1, relief: 0 })),                                                 // marks are polished lighter
  // The heightfield and the pad's ground boxes (today's friction 0.8); wheels read the surfaces above, not this.
  'rally-ground': { extends: 'dirt', phys: { friction: 0.8, restitution: 0 }, look: { roughness: 1, metalness: 0 } },
  'rally-road':   { extends: 'gravel', phys: { friction: 0.8, restitution: 0 }, look: { roughness: 0.92, metalness: 0 } },
  // Loose stones on the road (R10-6): instanced, a little rougher than the road.
  'rally-pebble': { extends: 'gravel', phys: { friction: 0.8, restitution: 0 }, look: { roughness: 0.9, metalness: 0 } },
  // The car: drawn shell, and the two inline colliders (low friction so a nose strike skids; mass comes from cars.js, D3).
  // The hull and cabin keep today's car-ground contact: Rapier averaged the old raw colliders (hull 0.3 with ground 0.8
  // gave 0.55, cabin 0.45 gave 0.625; restitution 0.1 with 0 gave 0.05), and the engine's √f Multiply gives √(f·0.8),
  // so f = pair² / 0.8 and restitution (Max) is the old pair value.
  // The real cars' paint bakes to car-body (game.config.js, R16-1); their metal trim draws on these base ids, toned down
  // from fully metallic: the scene has no environment map, so a metalness-1 rim
  // reflects nothing and draws black.
  steel:       { look: { metalness: 0.4, roughness: 0.4 } },
  aluminium:   { look: { metalness: 0.35, roughness: 0.35 } },
  // and opaque tinted glass: the base glass's transmission costs three.js a transmission pass every frame for windows that
  // read as dark tint anyway (and one more shader program)
  glass:       { look: { transmission: 0, roughness: 0.15, metalness: 0.2 } },
  'car-body':  { extends: 'steel', phys: { friction: 0.3, restitution: 0.1 }, look: { roughness: 0.45, metalness: 0.15 } },
  'car-hull':  { extends: 'steel', phys: { friction: 0.378125, restitution: 0.05 } },
  'car-cabin': { extends: 'steel', phys: { friction: 0.48828125, restitution: 0.05 } },
  tyre:        { extends: 'rubber', phys: { friction: 0.9, restitution: 0 }, look: { roughness: 0.8, metalness: 0 } },
  // Props.
  cone:          { extends: 'plastic', phys: { friction: 0.6, restitution: 0 }, look: { roughness: 0.6, metalness: 0 } },
  marker:        { extends: 'plastic', phys: { friction: 0.9, restitution: 0 }, look: { roughness: 0.55, metalness: 0 } },
  'gate-post':   { extends: 'wood', phys: { friction: 0.6, restitution: 0 }, look: { color: '#2b2d31', roughness: 0.6, metalness: 0 } },
  'gate-banner': { extends: 'fabric', phys: { friction: 0.6, restitution: 0 }, look: { color: '#dedede', roughness: 0.7, metalness: 0 } },
  'pad-prop':    { extends: 'wood', phys: { friction: 0.8, restitution: 0 }, look: { color: '#9a8f80', roughness: 0.9, metalness: 0 } },
  'pad-stripe':  { extends: 'plastic', phys: { friction: 0.8, restitution: 0 }, look: { color: '#d8b13a', roughness: 0.7, metalness: 0 } },
  // The painted skidpad ring and start line: see-through, a little self-lit (the old unlit paint).
  'pad-paint':   { extends: 'plastic', phys: { friction: 0.8, restitution: 0 }, look: { color: '#f4efe2', emissive: '#f4efe2', emissiveIntensity: 0.45, roughness: 1, metalness: 0, transparent: true, opacity: 0.8 } },
});
