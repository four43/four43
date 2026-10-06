// Trailer and wagon slots (2 rows x 3 per car, B-13) and the spring that holds a riding animal in its slot (D-12).
export const CAR_SLOTS = 6;
export const slotLocal = k => ({ x: 0.9 - Math.floor(k / 2) * 0.9, y: 0.15, z: k % 2 ? -0.48 : 0.48 });
// The point a rider sits at, in its car's axes: the slot on the bed (bed = height of the bed top above the car center) plus the rider's spring offset.
export const slotPoint = (k, rider, bed, out) => { const l = slotLocal(k); out.x = l.x + (rider?.ox || 0); out.y = l.y + bed + (rider?.oy || 0); out.z = l.z + (rider?.oz || 0); return out; };
export const slotIndex = s => s.car * CAR_SLOTS + s.k; // 0-5 trailer, 6-11 wagon: the slot bar position (U-1)
export function createLoad(capacity) {
  const slots = [];
  return {
    capacity, slots,
    reserve(animal) { if (slots.length >= capacity) return null; const n = slots.length, s = { car: Math.floor(n / CAR_SLOTS), k: n % CAR_SLOTS, animal, landed: false }; slots.push(s); return s; },
    land(s) { s.landed = true; },
    landed: () => slots.filter(s => s.landed).length,
    full: () => slots.length >= capacity,
  };
}
export const RIDER = { k: 70, c: 7, max: 0.45 };
export const newRider = () => ({ ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0 });
// accLocal: the trailer's acceleration in its own frame (gravity excluded), m/s^2. Riders lag behind it.
export function stepRider(r, a, dt) {
  r.vx += (-RIDER.k * r.ox - RIDER.c * r.vx - a.x) * dt; r.vy += (-RIDER.k * r.oy - RIDER.c * r.vy - a.y - 9.81 * (r.oy > 0 ? 1 : 0)) * dt; r.vz += (-RIDER.k * r.oz - RIDER.c * r.vz - a.z) * dt;
  r.ox += r.vx * dt; r.oy += r.vy * dt; r.oz += r.vz * dt;
  if (r.oy < 0) { r.oy = 0; if (r.vy < 0) r.vy *= -0.3; }
  const m = Math.hypot(r.ox, r.oy, r.oz);
  if (m > RIDER.max) { const s = RIDER.max / m; r.ox *= s; r.oy *= s; r.oz *= s; const dot = (r.vx * r.ox + r.vy * r.oy + r.vz * r.oz) / (RIDER.max * RIDER.max); if (dot > 0) { r.vx -= dot * r.ox; r.vy -= dot * r.oy; r.vz -= dot * r.oz; } }
}
