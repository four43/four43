// Harvest's model numbers, shared by the sim (colliders, wheels, hitches, zones) and the model scripts in tools/models/
// (glb-author), so a model and its physics never drift apart. Sim-pure data. Metres. Model space is glb-author's: +Y up,
// the front faces +Z, +X is the model's LEFT, the origin is bottom-centre on the ground. The sim uses the same frame for its
// vehicles (the vehicle kit's forward: 'z'), so a model needs no axis fix.

// The combine. Big drive wheels at the front, small steering wheels at the back (a real combine steers with its rear axle).
export const COMBINE = Object.freeze({
  length: 6.0, width: 3.0, height: 3.6, z0: -3.2, z1: 2.8,        // body extent along z
  wheels: Object.freeze([
    { name: 'wheel_FL', x: 1.35, y: 0.8, z: 1.6, r: 0.8, front: true },
    { name: 'wheel_FR', x: -1.35, y: 0.8, z: 1.6, r: 0.8, front: true },
    { name: 'wheel_BL', x: 1.2, y: 0.5, z: -2.4, r: 0.5, front: false },
    { name: 'wheel_BR', x: -1.2, y: 0.5, z: -2.4, r: 0.5, front: false },
  ].map(Object.freeze)),
  header: Object.freeze([0, 0.05, 2.9]),   // Socket_Header: the header's origin (its back edge, centre, ground level) hangs here
  hitch: Object.freeze([0, 0.7, -3.3]),    // Socket_Hitch: the first cart's tongue tip joins here
  cab: Object.freeze({ z0: 1.0, z1: 2.6, y0: 2.2, y1: 3.6, half: 0.9 }),
  tank: Object.freeze({ x: 0, z: -0.8, half: 1.1, floor: 2.7, top: 3.5 }), // open-top grain tank; the grain node's origin is the floor centre
  spout: Object.freeze({ root: Object.freeze([1.1, 3.3, -2.2]), length: 2.4 }), // the chute: pivot behind the tank, folded along -z over the wagons; swings about +y
});

// The header (cutting table): built 1 m wide so the view can stretch it to any width. `bar` and `reel` are 1 m along x and are
// scaled in x; `end_L` / `end_R` are the side shields, pivoted at their inner edge (x = +0.5 / -0.5), moved to ±width/2.
export const HEADER = Object.freeze({ depth: 1.9, height: 1.2, reel: Object.freeze({ y: 1.0, z: 1.3, r: 0.55 }) });

// The grain cart: a hopper on two wheels with a tongue at the front.
export const CART = Object.freeze({
  length: 4.6, width: 2.2, height: 2.0,
  hitch: Object.freeze([0, 0.7, 2.3]),     // Socket_Hitch: the tongue tip (joins the combine's or the cart in front's tow point)
  tow: Object.freeze([0, 0.7, -2.0]),      // Socket_Tow: the next cart's tongue tip joins here
  wheels: Object.freeze([{ name: 'wheel_L', x: 1.2, y: 0.55, z: -0.5, r: 0.55 }, { name: 'wheel_R', x: -1.2, y: 0.55, z: -0.5, r: 0.55 }].map(Object.freeze)),
  hopper: Object.freeze({ z0: -1.8, z1: 1.0, floor: 0.9, top: 2.0, half: 1.1 }), // the grain node's origin is the floor centre (0, floor, (z0+z1)/2)
});

// Crops: one clump fills a 1 m cell. Heights at full growth.
export const CROPS = Object.freeze({ wheat: Object.freeze({ h: 0.9 }), corn: Object.freeze({ h: 1.6 }), sunflower: Object.freeze({ h: 1.5 }) });

// The silo: a drive-through sell bay along z (x -6.5..6.5, z -7..7, roof 6 m: wide enough for the widest header) with two silos on
// its +x side.
export const SILO = Object.freeze({
  bay: Object.freeze({ half: 6.5, len: 7, roof: 6, post: 0.3 }),
  silos: Object.freeze([{ x: 11.5, z: -3.5, r: 3, h: 12 }, { x: 11.5, z: 3.5, r: 3, h: 12 }].map(Object.freeze)),
});

// The upgrade barn: a drive-through along z (open at both ends), side walls `eave` high, the ridge at `height`, doorways `door`
// high under the gables.
export const SHED = Object.freeze({ half: 8.5, depth: 14, height: 10, eave: 6.5, door: 5.4, wall: 0.3 });

// A field sign: a board on two posts, its front facing +z.
export const SIGN = Object.freeze({ w: 3.2, h: 1.6, y: 2.0, post: 0.16 });

// ---- the backyard (vehicle ladder chapter 1) ----

// The ride-on mower. Small front wheels steer-free (the arcade drive turns the body), the big rear wheels drive. The deck hangs
// between the axles; it is built 1 m wide (node `deck`, scaled in x by the view). Clippings blow out of the deck's chute at the back
// (Socket_SpoutTip) into the catcher box on the back (Socket_Bag, top centre; node `grain`, the clippings heap, scaled in y).
export const MOWER = Object.freeze({
  length: 2.3, width: 1.3, height: 1.5, z0: -1.25, z1: 1.05,
  wheels: Object.freeze([
    { name: 'wheel_FL', x: 0.48, y: 0.24, z: 0.62, r: 0.24, front: true },
    { name: 'wheel_FR', x: -0.48, y: 0.24, z: 0.62, r: 0.24, front: true },
    { name: 'wheel_BL', x: 0.52, y: 0.36, z: -0.42, r: 0.36, front: false },
    { name: 'wheel_BR', x: -0.52, y: 0.36, z: -0.42, r: 0.36, front: false },
  ].map(Object.freeze)),
  deck: Object.freeze({ z: 0.1, depth: 0.44, y: 0.12, h: 0.22 }),    // the cutting deck, between the axles' tyres: centre along z, depth, underside, height
  seat: Object.freeze({ z: -0.35, y: 0.75 }),
  bag: Object.freeze({ z0: -1.25, z1: -0.65, floor: 0.45, top: 1.05, half: 0.42 }), // the catcher box (open top)
  spout: Object.freeze([0.0, 0.95, -0.62]),                        // Socket_SpoutTip: where the clippings leave the chute
  hitch: Object.freeze([0, 0.3, -1.3]),                            // Socket_Hitch: the first tip cart's tongue tip joins here
});

// The garden tip cart the mower tows: the cart's contract (bed, grain, wheel_L/R, Socket_Hitch, Socket_Tow), smaller.
export const TIPCART = Object.freeze({
  length: 1.7, width: 1.1, height: 0.85,
  hitch: Object.freeze([0, 0.3, 0.95]),
  tow: Object.freeze([0, 0.3, -0.8]),
  wheels: Object.freeze([{ name: 'wheel_L', x: 0.55, y: 0.24, z: -0.15, r: 0.24 }, { name: 'wheel_R', x: -0.55, y: 0.24, z: -0.15, r: 0.24 }].map(Object.freeze)),
  hopper: Object.freeze({ z0: -0.7, z1: 0.45, floor: 0.38, top: 0.85, half: 0.45 }),
});

// The farmhouse: front (porch, door) facing +z. The compost bins: three open-fronted slatted bays in a row along x, open to +z.
export const FARMHOUSE = Object.freeze({ w: 12, d: 9, eave: 4.2, ridge: 7.5 });
export const COMPOST = Object.freeze({ w: 8, d: 2.4, h: 1.4, bays: 3 });
export const DOGHOUSE = Object.freeze({ w: 1.2, d: 1.4, h: 1.3 });
export const FLOWERBED = Object.freeze({ w: 3, d: 1, h: 0.3 });

// Backyard crops: one clump fills a 0.5 m cell. Heights at full growth.
export const YARD_CROPS = Object.freeze({ lawn: Object.freeze({ h: 0.14 }), longgrass: Object.freeze({ h: 0.6 }), clover: Object.freeze({ h: 0.3 }) });

// The farm gate in the fence between the backyard and the grain fields: two leaves hung on posts at x ±(half + post / 2), each
// leaf (node `leaf_L` at +x, `leaf_R` at -x) pivoting about y at its post and reaching to the middle. Closed, it faces ±z.
export const GATE = Object.freeze({ half: 3.5, h: 1.3, post: 0.22 });
// The mower's garage by the compost bins: an open gravel pad (half sizes hx, hz) with a workbench along its east side, facing the pad
// (the bench's front faces +z in its model).
export const GARAGE = Object.freeze({ hx: 4, hz: 4 });
export const WORKBENCH = Object.freeze({ w: 3.4, d: 0.9, h: 0.95, board: 2.1 });

// ---- the meadow (vehicle ladder chapter 2) ----

// The compact tractor. Big rear wheels drive; a mower deck hangs in front of the front wheels, built 1 m wide (node `deck`, scaled in
// x by the view). Hay goes into the baler it tows, which drops round bales onto the bale trailers behind (the view draws them).
export const TRACTOR = Object.freeze({
  length: 3.6, width: 1.9, height: 2.6, z0: -1.75, z1: 1.85,
  wheels: Object.freeze([
    { name: 'wheel_FL', x: 0.72, y: 0.42, z: 1.05, r: 0.42, front: true },
    { name: 'wheel_FR', x: -0.72, y: 0.42, z: 1.05, r: 0.42, front: true },
    { name: 'wheel_BL', x: 0.82, y: 0.72, z: -0.75, r: 0.72, front: false },
    { name: 'wheel_BR', x: -0.82, y: 0.72, z: -0.75, r: 0.72, front: false },
  ].map(Object.freeze)),
  deck: Object.freeze({ z: 2.45, depth: 1.1, y: 0.1, h: 0.4 }),     // the front mower: centre along z (ahead of the front tyres), depth
  cab: Object.freeze({ z0: -1.1, z1: 0.4, y0: 1.3, y1: 2.6, half: 0.7 }), // a cab (or a roll frame and canopy) over the seat
  hitch: Object.freeze([0, 0.55, -1.9]),                           // Socket_Hitch: the bale trailer's tongue tip joins here
});

// The bale trailer: a flatbed on two wheels; round bales ride on it lying on their sides (axis along x), two across and two along,
// up to three layers. The view places them from Socket_Bed (the bed's top centre).
export const BALE = Object.freeze({ r: 0.72, w: 1.15 });             // a round bale: radius, width (along its axis)
export const BALETRAILER = Object.freeze({
  length: 5.4, width: 2.5, height: 1.3,
  hitch: Object.freeze([0, 0.55, 2.7]),
  tow: Object.freeze([0, 0.55, -2.6]),
  wheels: Object.freeze([{ name: 'wheel_L', x: 1.12, y: 0.5, z: -0.6, r: 0.5 }, { name: 'wheel_R', x: -1.12, y: 0.5, z: -0.6, r: 0.5 }].map(Object.freeze)),
  bed: Object.freeze({ z0: -2.3, z1: 1.9, top: 1.2, half: 1.2 }),   // the flatbed's deck (its top face), with low rails at the edges; 20 cm over the tyres
  hopper: Object.freeze({ z0: -2.3, z1: 1.9, floor: 1.2, top: 2.6, half: 1.2 }), // as a bin, for the sim's cart contract
});

// The hay barn: the meadow's sell point, a drive-through along z (open at both ends); bales are lifted off the trailers inside.
export const HAYBARN = Object.freeze({ half: 7.5, depth: 16, eave: 6.5, ridge: 11, door: 5.4, wall: 0.3 });

// Meadow crops: one clump fills a 1 m cell. Heights at full growth.
export const MEADOW_CROPS = Object.freeze({ hay: Object.freeze({ h: 0.8 }), alfalfa: Object.freeze({ h: 0.7 }), wildflowers: Object.freeze({ h: 0.65 }) });
