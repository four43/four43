// Car configurations. Dimensions are real-car values; the Kenney meshes are scaled
// to fit the wheel positions, not the other way round.
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
    brakeTorque: 6000, brakeBias: 0.58, handbrakeTorque: 1500,
    cda: 0.80,
    body: { scale: [1.45, 1.45, 1.48], color: 0x2f6fd6 },
    drive: {
      layout: 'awd',
      curve: [[800, 145], [1000, 158], [2500, 325], [4000, 362], [5500, 343], [6500, 310], [7500, 258], [8000, 230]],
      idle: 900, redline: 7500, engineBrake: 55, engineInertia: 0.18,
      clutchCap: 900, clutchVisc: 400,
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
    brakeTorque: 5000, brakeBias: 0.62, handbrakeTorque: 1400,
    cda: 0.75,
    body: { scale: [1.45, 1.45, 1.70], color: 0xe8b323 },
    drive: {
      layout: 'rwd',
      curve: [[800, 130], [1000, 150], [3000, 195], [5000, 220], [6000, 230], [7000, 215], [8000, 185], [8500, 160]],
      idle: 950, redline: 8000, engineBrake: 45, engineInertia: 0.15,
      clutchCap: 600, clutchVisc: 400,
      gears: [3.4, 2.3, 1.7, 1.3, 1.05], reverse: 3.3, final: 4.3, shiftTime: 0.12,
      rearLsd: { preload: 50, rampPower: 0.40, rampCoast: 0.25, visc: 300 },
    },
  },
};
