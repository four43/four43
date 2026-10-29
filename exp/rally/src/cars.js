// Car configurations (rally-spec R16): ten cars based on real rally cars, under parody names, in era order. Geometry
// comes from each car's model (assets/models/<id>.glb: wheel nodes on their hubs, the spec's overall size;
// test/cars.test.mjs holds the numbers to the GLB); mass, weight split, layout and engine are published figures,
// rounded. Tyres and surfaces are the same for every car. drive.engine is a lion-hawk ENGINE_PRESETS layout (its firing
// order and exhaust feed the engine sound) with this car's numbers on top; drive.turbo is the powertrain's turbo, and a
// turbo engine's torque is its peak over (1 + maxBoost).
const deg = Math.PI / 180;

// Rally's diffs by era (R5 values as the base): 70s cars a rear plate LSD; four-wheel drive a viscous centre and front
// and rear LSDs.
const RWD_LSD = { preload: 50, rampPower: 0.40, rampCoast: 0.25, visc: 300 };
const AWD = { frontSplit: 0.5, centreVisc: 150, centreCap: 400,
  frontLsd: { preload: 40, rampPower: 0.30, rampCoast: 0.20, visc: 300 },
  rearLsd: { preload: 60, rampPower: 0.50, rampCoast: 0.30, visc: 300 } };
// Aero by era (rally spec R18-4): [drag CdA (m²), downforce ClA (m², negative = lift), front share of it]. The 70s
// cars lift a little; Group B's wings and the 90s/2000s WRC aero press down more each decade; the 2017 cars' big
// wings and diffusers the most (AERO_2017).
const AERO = { '1970s': [0.70, -0.10, 0.5], '1980s': [0.80, 0.35, 0.35], '1990s': [0.80, 0.45, 0.40], '2000s': [0.85, 0.60, 0.40], '2010s': [0.85, 0.70, 0.40] };
const AERO_2017 = [0.95, 1.20, 0.40];
// The air resists pitching: a torque −pitchDamp · v · ω about the car's axle line, pitchDamp = inertia ÷ (PITCH_TAU ·
// 30 m/s), so at 30 m/s a pitch rate decays over PITCH_TAU s.
const PITCH_TAU = 3;
const BOX5 = [3.2, 2.2, 1.65, 1.3, 1.05], BOX6 = [3.2, 2.35, 1.85, 1.5, 1.25, 1.05];

// geo: [wheelbase, track (mean of front and rear), wheel radius, [width, height, length], body z] from the model: the
// overall bounds, and their centre ahead of the wheelbase midpoint (bodyZ, where the hull and cabin colliders centre).
// mid: a mid-engined car (less yaw inertia for its size); top: the speed (m/s) at the redline in top gear, which sets
// the final drive.
function car({ id, name, years, era, power, geo: [wheelbase, track, radius, size, bodyZ], mass, frontWeight, comHeight = 0.45,
  mid = false, top, drive, sound, aero = AERO[era] }) {
  const [W, H, L] = size, box = (a, b) => mass * (a * a + b * b) / 12;
  const rwd = drive.layout === 'rwd', gears = drive.gears;
  const final = +((drive.engine.redline * 2 * Math.PI / 60) * radius / (gears[gears.length - 1] * top)).toFixed(2);
  const inertia = { x: Math.round(0.92 * box(L, H)), y: Math.round((mid ? 0.85 : 0.93) * box(L, W)), z: Math.round(0.92 * box(W, H)) }; // pitch, yaw, roll (kg m^2)
  return {
    id, name, years, era, power, model: id,
    mass, frontWeight, comHeight, wheelbase, track, radius, size, bodyZ,
    inertia,
    wheelInertia: +(1.2 * (radius / 0.33) ** 2).toFixed(2),
    travel: 0.25, fn: 1.6, zetaBump: 0.30, zetaReb: 0.60,
    arbF: rwd ? 9000 : 10000, arbR: rwd ? 4000 : 5000, // N per m of left/right compression difference
    rcF: 0.08, rcR: rwd ? 0.14 : 0.12,                 // roll-centre heights (m)
    maxLock: (rwd ? 32 : 30) * deg, ackermann: 0.5,
    rearAp: 0.85,                                       // rear peak slip angle × this: stiffer rear (toe-in, wider tires)
    brakeTorque: Math.round(6000 * mass / 1250), brakeBias: mid ? 0.52 : rwd ? 0.62 : 0.58,
    handbrakeTorque: 1500,                               // the hydraulic handbrake, the same lever on every car
    cda: aero[0], cla: aero[1], aeroFront: aero[2], pitchDamp: +(inertia.x / (PITCH_TAU * 30)).toFixed(1),
    sound,                                              // createEngineSound options (view only)
    drive: { reverse: 3.2, shiftTime: 0.12, ...drive, final },
  };
}

// createEngineSound's afterfire pops: only the anti-lag turbo cars of the 1990s on (Group A and WRC); the 70s atmospheric
// cars and the Group B turbos lift quietly.
const antiLag = { muffler: 'sport', pops: true }, groupB = { muffler: 'sport', pops: false }, open4 = { muffler: 'straight', pops: false };

const LIST = [
  car({ id: 'stratos-hf', name: 'Lunchia Stratus HF', years: '1974-78', era: '1970s', power: 240,
    geo: [2.18, 1.445, 0.31, [1.75, 1.11, 3.83], 0.09], mass: 980, frontWeight: 0.42, comHeight: 0.42, mid: true, top: 51,
    sound: open4,
    drive: { layout: 'rwd', engine: { preset: 'i4', torque: 230, peakRpm: 6500, idle: 1000, redline: 7800, limiter: 8000, inertia: 0.15 },
      gears: [3.0, 2.1, 1.6, 1.25, 1.0], rearLsd: RWD_LSD } }),
  car({ id: 'escort-rs1800', name: 'Fjord Escapade 1800', years: '1975-81', era: '1970s', power: 245,
    geo: [2.40, 1.36, 0.28, [1.74, 1.39, 4.20], -0.13], mass: 980, frontWeight: 0.53, comHeight: 0.47, top: 48.5,
    sound: open4,
    drive: { layout: 'rwd', engine: { preset: 'i4', torque: 215, peakRpm: 6500, idle: 1000, redline: 8500, limiter: 8800, inertia: 0.14 },
      gears: [3.4, 2.3, 1.7, 1.3, 1.05], rearLsd: RWD_LSD } }),
  car({ id: 'sport-quattro-s1', name: 'Outie Squattro S1', years: '1985-86', era: '1980s', power: 470,
    geo: [2.224, 1.4835, 0.32, [1.80, 1.39, 4.23], 0.07], mass: 1090, frontWeight: 0.60, comHeight: 0.47, top: 55.5,
    sound: groupB,
    drive: { layout: 'awd', engine: { preset: 'i4', torque: 204, peakRpm: 5500, idle: 1000, redline: 8000, limiter: 8200, inertia: 0.18 },
      turbo: { maxBoost: 1.4, size: 0.35, bov: true }, gears: BOX5, ...AWD } }),
  car({ id: 'peugeot-205-t16', name: 'Pugeot Pupper T16', years: '1985-86', era: '1980s', power: 450,
    geo: [2.54, 1.43, 0.32, [1.70, 1.43, 4.01], 0.05], mass: 910, frontWeight: 0.42, comHeight: 0.45, mid: true, top: 55.5,
    sound: groupB,
    drive: { layout: 'awd', engine: { preset: 'i4', torque: 204, peakRpm: 5500, idle: 1000, redline: 8000, limiter: 8200, inertia: 0.16 },
      turbo: { maxBoost: 1.4, size: 0.3, bov: true }, gears: BOX5, ...AWD, frontSplit: 0.35 } }),
  car({ id: 'impreza-555', name: 'Subaroo Impressa', years: '1993-96', era: '1990s', power: 300,
    geo: [2.52, 1.465, 0.325, [1.72, 1.46, 4.42], 0.03], mass: 1230, frontWeight: 0.58, top: 53,
    sound: antiLag,
    drive: { layout: 'awd', engine: { preset: 'flat4', torque: 235, peakRpm: 4000, idle: 900, redline: 7200, limiter: 7400, inertia: 0.18 },
      turbo: { maxBoost: 1.0, size: 0.2, bov: true }, gears: BOX5, ...AWD } }),
  car({ id: 'lancer-evo6', name: 'Mitsubiscuit Lancelot Evo VI', years: '1999', era: '1990s', power: 300,
    geo: [2.51, 1.54, 0.325, [1.79, 1.43, 4.41], -0.04], mass: 1230, frontWeight: 0.58, top: 53,
    sound: antiLag,
    drive: { layout: 'awd', engine: { preset: 'i4', torque: 250, peakRpm: 3500, idle: 900, redline: 7000, limiter: 7200, inertia: 0.18 },
      turbo: { maxBoost: 1.0, size: 0.2, bov: true }, gears: BOX5, ...AWD } }),
  car({ id: 'peugeot-206-wrc', name: 'Pugeot Pupper Plus', years: '1999-2003', era: '2000s', power: 300,
    geo: [2.468, 1.534, 0.325, [1.81, 1.47, 4.13], 0.11], mass: 1230, frontWeight: 0.57, top: 53,
    sound: antiLag,
    drive: { layout: 'awd', engine: { preset: 'i4', torque: 268, peakRpm: 3500, idle: 900, redline: 7000, limiter: 7200, inertia: 0.17 },
      turbo: { maxBoost: 1.0, size: 0.15, bov: true }, gears: BOX6, ...AWD } }),
  car({ id: 'xsara-wrc', name: 'Citrus Sahara', years: '2001-06', era: '2000s', power: 315,
    geo: [2.555, 1.568, 0.325, [1.82, 1.35, 4.21], 0.03], mass: 1230, frontWeight: 0.57, top: 53,
    sound: antiLag,
    drive: { layout: 'awd', engine: { preset: 'i4', torque: 285, peakRpm: 3000, idle: 900, redline: 6800, limiter: 7000, inertia: 0.17 },
      turbo: { maxBoost: 1.0, size: 0.15, bov: true }, gears: BOX6, ...AWD } }),
  car({ id: 'polo-r-wrc', name: 'Folkswagon Pollo R', years: '2013-16', era: '2010s', power: 315,
    geo: [2.48, 1.61, 0.325, [1.89, 1.42, 4.09], 0.13], mass: 1200, frontWeight: 0.56, top: 53,
    sound: antiLag,
    drive: { layout: 'awd', engine: { preset: 'i4', torque: 212, peakRpm: 5000, idle: 1000, redline: 7500, limiter: 7700, inertia: 0.14 },
      turbo: { maxBoost: 1.0, size: 0.15, bov: true }, gears: BOX6, ...AWD } }),
  car({ id: 'yaris-wrc', name: 'Toyoyo Yarn', years: '2017', era: '2010s', power: 380,
    geo: [2.511, 1.63, 0.325, [1.92, 1.52, 4.19], 0.05], mass: 1190, frontWeight: 0.56, top: 54, aero: AERO_2017,
    sound: antiLag,
    drive: { layout: 'awd', engine: { preset: 'i4', torque: 225, peakRpm: 5000, idle: 1000, redline: 8000, limiter: 8200, inertia: 0.14 },
      turbo: { maxBoost: 1.0, size: 0.15, bov: true }, gears: BOX6, ...AWD } }),
];

export const CARS = Object.fromEntries(LIST.map(c => [c.id, c]));
export const CAR_IDS = LIST.map(c => c.id); // the garage's order
export const DEFAULT_CAR = 'impreza-555';
