// Car configurations. Dimensions are real-car values; the Kenney meshes are scaled
// to fit the wheel positions, not the other way round. drive.engine is a lion-hawk ENGINE_PRESETS layout (its firing
// order and exhaust feed the engine sound) with this car's numbers on top; drive.turbo is the powertrain's turbo.
const deg = Math.PI / 180;

export const CARS = {
  awd: {
    id: 'awd', name: 'R5 4WD', model: 'hatchback-sports',
    mass: 1250, frontWeight: 0.58, comHeight: 0.45,
    wheelbase: 2.40, track: 1.50,
    inertia: { x: 1800, y: 1950, z: 480 }, // pitch, yaw, roll (kg m^2)
    radius: 0.33, wheelInertia: 1.2,
    travel: 0.25, fn: 1.6, zetaBump: 0.30, zetaReb: 0.60,
    arbF: 10000, arbR: 5000,          // N per m of left/right compression difference
    rcF: 0.08, rcR: 0.12,             // roll-centre heights (m)
    maxLock: 30 * deg, ackermann: 0.5,
    rearAp: 0.85,                     // rear peak slip angle × this: stiffer rear (toe-in, wider tires)
    brakeTorque: 6000, brakeBias: 0.58, handbrakeTorque: 1500,
    cda: 0.80,
    body: { scale: [1.45, 1.45, 1.48], color: 0x2f6fd6 },
    sound: { muffler: 'sport', pops: true }, // createEngineSound options (view only): crackle on the lift
    drive: {
      layout: 'awd',
      // turbo 4: about 440 N m on full boost (from ~4000 rpm in 1st), less before the turbo spools
      engine: { preset: 'i4', torque: 210, peakRpm: 4500, idle: 900, redline: 7500, limiter: 7700, inertia: 0.18 },
      turbo: { maxBoost: 1.0, size: 0.2, bov: true },
      gears: [3.2, 2.2, 1.65, 1.3, 1.05], reverse: 3.2, final: 4.8, shiftTime: 0.12,
      frontSplit: 0.5, centreVisc: 150, centreCap: 400,
      frontLsd: { preload: 40, rampPower: 0.30, rampCoast: 0.20, visc: 300 },
      rearLsd: { preload: 60, rampPower: 0.50, rampCoast: 0.30, visc: 300 },
    },
  },
  rwd: {
    id: 'rwd', name: 'Classic RWD', model: 'sedan-sports',
    mass: 1050, frontWeight: 0.50, comHeight: 0.48,
    wheelbase: 2.25, track: 1.46,
    inertia: { x: 1400, y: 1500, z: 380 },
    radius: 0.33, wheelInertia: 1.1,
    travel: 0.24, fn: 1.6, zetaBump: 0.30, zetaReb: 0.60,
    arbF: 9000, arbR: 4000,
    rcF: 0.08, rcR: 0.14,
    maxLock: 32 * deg, ackermann: 0.5,
    rearAp: 0.85,
    brakeTorque: 5000, brakeBias: 0.62, handbrakeTorque: 1400,
    cda: 0.75,
    body: { scale: [1.45, 1.45, 1.70], color: 0xe8b323 },
    sound: { muffler: 'straight', pops: true },
    drive: {
      layout: 'rwd',
      // high-revving atmospheric 4: 230 N m at 6000 rpm
      engine: { preset: 'i4', torque: 238, peakRpm: 6000, idle: 950, redline: 8000, limiter: 8200, inertia: 0.15 },
      gears: [3.4, 2.3, 1.7, 1.3, 1.05], reverse: 3.3, final: 4.3, shiftTime: 0.12,
      rearLsd: { preload: 50, rampPower: 0.40, rampCoast: 0.25, visc: 300 },
    },
  },
};
