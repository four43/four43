// Rally's material registry (lion-hawk M-1…M-3, phase 3). Road and verge surfaces carry the tyre model's Magic Formula
// parameters in `tire` (the old src/tire.js SURFACES table, moved) and their display name in `game.name` (D6);
// colliders carry friction and restitution (√f with Multiply, max restitution: M-8, M-9); `look` feeds the material
// compiler. Ids are 'rally-<surface key>' so a surface never shadows a base material. Every entry states phys
// friction and restitution, so no base-library value reaches the feel.
import { defineMaterials } from 'lion-hawk/sim';

// look.color white: the pad's surface texture carries the colour (the pad ground is the only mesh drawn with these).
// `plow` (R5-4, loose-surface side force) isn't an engine tire field, so it rides in the free-form `game` block.
const ground = (base, name, { plow, ...tire }, look = {}) => ({ extends: base, phys: { friction: 0.8, restitution: 0 }, tire, look: { color: '#ffffff', ...look }, game: { name, plow } });

export default defineMaterials({
  'rally-tarmac':   ground('asphalt', 'Tarmac',       { mu: 1.15, C: 1.50, kp: 0.10, ap: 0.12, crr: 0.015, drag: 0, plow: 0 }, { roughness: 0.85, metalness: 0 }),
  'rally-hardpack': ground('dirt',    'Dirt',         { mu: 0.90, C: 1.40, kp: 0.14, ap: 0.15, crr: 0.025, drag: 0, plow: 0.10 }, { roughness: 0.95, metalness: 0 }),
  'rally-gravel':   ground('gravel',  'Loose gravel', { mu: 0.80, C: 1.25, kp: 0.18, ap: 0.18, crr: 0.035, drag: 0, plow: 0.25 }, { roughness: 0.95, metalness: 0 }),
  'rally-grass':    ground('grass',   'Grass',        { mu: 0.55, C: 1.55, kp: 0.12, ap: 0.14, crr: 0.050, drag: 0.2, plow: 0 }, { roughness: 1, metalness: 0, side: 'double' }), // the verge tufts
  'rally-sand':     ground('dirt',    'Sand',         { mu: 0.50, C: 1.20, kp: 0.22, ap: 0.20, crr: 0.120, drag: 0.14, plow: 0.35 }),
  'rally-mud':      ground('mud',     'Mud',          { mu: 0.40, C: 1.50, kp: 0.15, ap: 0.16, crr: 0.100, drag: 0.18, plow: 0.20 }),
  'rally-packed':   ground('snow',    'Packed snow',  { mu: 0.75, C: 1.25, kp: 0.20, ap: 0.20, crr: 0.030, drag: 0, plow: 0.12 }, { roughness: 0.95, metalness: 0 }),
  'rally-snowbank': ground('snow',    'Snowbank',     { mu: 0.30, C: 1.20, kp: 0.25, ap: 0.22, crr: 0.150, drag: 0.1, plow: 0.30 }),
  'rally-ice':      ground('ice',     'Ice',          { mu: 0.55, C: 1.40, kp: 0.08, ap: 0.08, crr: 0.015, drag: 0, plow: 0 }, { roughness: 0.25, metalness: 0 }),
  // The heightfield and the pad's ground boxes (today's friction 0.8); wheels read the surfaces above, not this.
  'rally-ground': { extends: 'dirt', phys: { friction: 0.8, restitution: 0 }, look: { roughness: 1, metalness: 0 } },
  'rally-road':   { extends: 'gravel', phys: { friction: 0.8, restitution: 0 }, look: { roughness: 0.92, metalness: 0 } },
  // The car: drawn shell, and the two inline colliders (low friction so a nose strike skids; mass comes from cars.js, D3).
  // The hull and cabin keep today's car-ground contact: Rapier averaged the old raw colliders (hull 0.3 with ground 0.8
  // gave 0.55, cabin 0.45 gave 0.625; restitution 0.1 with 0 gave 0.05), and the engine's √f Multiply gives √(f·0.8),
  // so f = pair² / 0.8 and restitution (Max) is the old pair value.
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
