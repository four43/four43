// Marker posts, gates and checkpoints along a layout (spec tracks T-6). Pure data; markers are
// home positions for dynamic props (TrackWorld makes them knock-over cylinders).

export const ROADSIDE = {
  offset: 4.5,          // m from the centreline: half road width 3.5 + 1 beyond the edge
  spacing: 25,          // m, both sides
  outsideSpacing: 12,   // m, on the outside of corners tighter than...
  tightKappa: 1 / 80,   // ...this curvature
  clearTypes: ['kicker', 'tabletop'], // no markers within these features' [s0, s1]
  gateS: 40,            // start gate s; stage finish at length − 40
  checkpointEvery: 250, // m from the start gate
  checkpointClear: 50,  // no checkpoint this close before the finish
};

// Point at distance s, offset d to the left (left normal for heading h is (cos h, −sin h)).
function along(layout, s, d) {
  const { n, ds, closed } = layout;
  let i = Math.round(s / ds);
  i = closed ? ((i % n) + n) % n : Math.min(Math.max(i, 0), n - 1);
  const h = layout.heading[i];
  return { i, x: layout.x[i] + d * Math.cos(h), z: layout.z[i] - d * Math.sin(h), yaw: h };
}

// r is unused today (placement is fully determined by the layout); kept for the shared signature.
export function placeRoadside(layout, heightFn, features = [], r = null) {
  const C = ROADSIDE, { length, closed } = layout;
  const clear = features.filter((f) => C.clearTypes.includes(f.type));
  const blocked = (s) => clear.some((f) => s >= f.s0 && s <= f.s1);

  const markers = [];
  for (const side of [1, -1]) {
    // Loops stop half a gap short of the seam so the first and last markers don't crowd.
    for (let s = 0; closed ? s < length - C.outsideSpacing / 2 : s <= length;) {
      const p = along(layout, s, side * C.offset);
      const k = layout.curvature[p.i];
      const outside = Math.abs(k) > C.tightKappa && Math.sign(k) === -side;
      if (!blocked(s)) markers.push({ x: p.x, y: heightFn(p.x, p.z), z: p.z, yaw: p.yaw, side });
      s += outside ? C.outsideSpacing : C.spacing;
    }
  }

  const gate = (kind, s) => {
    const p = along(layout, s, 0);
    return { kind, s, x: p.x, y: heightFn(p.x, p.z), z: p.z, yaw: p.yaw };
  };
  const start = Math.min(C.gateS, length);
  const gates = [gate('start', start)];
  const finish = closed ? start + length : length - C.gateS;
  if (!closed) gates.push(gate('finish', finish));

  const checkpoints = [];
  for (let s = start + C.checkpointEvery; s <= finish - C.checkpointClear; s += C.checkpointEvery) {
    checkpoints.push({ s: closed ? s % length : s });
  }
  return { markers, gates, checkpoints };
}
