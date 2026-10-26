// Road and ground surfaces (rally spec R10, R13): extend() patches on the compiled `rally-road` and `rally-ground` materials,
// so three's standard shading, shadows and fog stay. A painted look to sit with the low-poly models (playtest 2026-10-25:
// the photo textures of R10-7 didn't fit; Art of Rally is the reference): each surface is a small palette (the registry's
// `game.road.paint` and `game.ground`), laid down as flat fields with soft steps, no photographic grain.
// - Road: three tone bands from broad noise, painted strokes stretched along the road, flat stones (gravel), short tyre
//   marks around the track's driven lines (wear), a darker rim just inside the edge (the track's edges, frayed a few cm),
//   tarmac cracks and centre dashes, dirt puddles on the flat, flat tongues of road spilling onto the shoulder, and ice
//   as flat blues with polished streaks and white cracks. Loose stones are low-poly geometry (pebbles.js).
// - Ground: three grass (or snow) tones in big soft-edged fields, dry patches, small clumps, earth then rock on slopes.
//   The ribbon draws its ground part with the same function, so it meets the terrain seamlessly.
import { Color, Vector2, Vector4 } from 'three';
import MATERIALS from '../defs/materials.js';

// Weight slots: aSurfA = (tarmac, hardpack, gravel, packed), aSurfB = ice. Anything else draws as gravel.
export const ROAD_SURFACES = ['tarmac', 'hardpack', 'gravel', 'packed', 'ice'];
export const surfaceSlot = (key) => { const i = ROAD_SURFACES.indexOf(key); return i < 0 ? 2 : i; };
const N = ROAD_SURFACES.length, PAINT = ['base', 'light', 'dark', 'mark', 'rim', 'chip'], GROUND = ['a', 'b', 'c', 'dry', 'clump', 'earth', 'rock'];

// One set of uniforms for the page: one track at a time, and the compiler caches each material by name.
const U = {
  uRoadPaint: { value: [] }, // per surface, PAINT.length colours (linear)
  uRoadA: { value: [] },     // (crack, line, streak, chips)
  uRoadB: { value: [] },     // (edge, pud, roughness, ice)
  uRoadC: { value: [] },     // (rim width m, tone, wet, relief m)
  uRoadD: { value: [] },     // (mud, -, -, -)
  uGroundPaint: { value: GROUND.map(() => new Color()) }, // setGround
  uGroundSlope: { value: new Vector2(0.95, 0.8) },          // ny over which earth, then rock, take over
  uSkyH: { value: new Color(0.6, 0.7, 0.8) }, // horizon: the fog colour (setSky)
  uSkyZ: { value: new Color(0.35, 0.48, 0.62) },
};
for (const key of ROAD_SURFACES) {
  const def = MATERIALS.get(`rally-${key}`), r = def.game.road;
  for (const k of PAINT) U.uRoadPaint.value.push(new Color(r.paint[k]));
  U.uRoadA.value.push(new Vector4(r.crack, r.line, r.streak, r.chips));
  U.uRoadB.value.push(new Vector4(r.edge, r.pud, def.look.roughness ?? 0.9, r.ice));
  U.uRoadC.value.push(new Vector4(r.rimW, r.tone, r.wet, r.relief));
  U.uRoadD.value.push(new Vector4(r.mud, 0, 0, 0));
}

// Reflections (ice, puddles) see a sky that matches the fog: horizon = fog colour, zenith a deeper, still muted blue.
const ZENITH = new Color(0.62, 0.76, 0.95);
export function setSky(fogColor) {
  U.uSkyH.value.copy(fogColor);
  U.uSkyZ.value.copy(fogColor).multiply(ZENITH);
}
// The ground's palette for a verge surface ('grass' | 'snowbank').
export function setGround(verge) {
  const g = MATERIALS.get(`rally-${verge}`).game.ground;
  GROUND.forEach((k, i) => U.uGroundPaint.value[i].set(g[k]));
  U.uGroundSlope.value.set(g.slope[0], g.slope[1]);
}

const VERT_GROUND = `varying vec3 vRsWorld;`;
const VERT_ROAD = `attribute vec2 aRoad; attribute vec2 aEdge; attribute vec4 aSurfA; attribute float aSurfB; attribute vec4 aWear;
varying vec2 vRoad; varying vec2 vEdge; varying vec4 vSurfA; varying float vSurfB; varying vec4 vWear; varying vec3 vRsWorld;`;
const VERT_WORLD = `vRsWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`;
const VERT_ROAD_MAIN = `vRoad = aRoad; vEdge = aEdge; vSurfA = aSurfA; vSurfB = aSurfB; vWear = aWear;\n${VERT_WORLD}`;

// Shared by both materials: uniforms, noise, soft steps and the ground.
const FRAG_LIB = `uniform vec3 uRoadPaint[${N * PAINT.length}]; uniform vec4 uRoadA[${N}]; uniform vec4 uRoadB[${N}]; uniform vec4 uRoadC[${N}]; uniform vec4 uRoadD[${N}];
uniform vec3 uGroundPaint[${GROUND.length}]; uniform vec2 uGroundSlope;
uniform vec3 uSkyH; uniform vec3 uSkyZ;
float rsH( vec2 p ) { p = mod( p, 4096.0 ); p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float rsVn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( rsH( i ), rsH( i + vec2( 1, 0 ) ), f.x ), mix( rsH( i + vec2( 0, 1 ) ), rsH( i + 1.0 ), f.x ), f.y ); }
float rsFbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 4; i ++ ) { s += a * rsVn( p ); p *= 2.03; a *= 0.5; } return s / 0.9375; }
// A soft step at t, widened to at least a pixel's worth of v (fw), so painted edges stay crisp up close and don't alias far off.
float rsStep( float t, float v, float fw ) { float e = max( 0.015, fw ); return smoothstep( t - e, t + e, v ); }
// Three tone bands from a field value v: dark below lo, light above hi, base between.
vec3 rsBands( vec3 dark, vec3 base, vec3 light, float v, float lo, float hi, float fw ) {
  return mix( mix( dark, base, rsStep( lo, v, fw ) ), light, rsStep( hi, v, fw ) );
}
// The ground at w (ny = the surface normal's up component): three tones in big fields, dry patches, small clumps, earth
// then rock where it steepens.
vec3 rsGround( vec2 w, float ny ) {
  float big = rsFbm( w * 0.018 + 3.0 ), fw = fwidth( big ) * 1.5;
  vec3 c = rsBands( uGroundPaint[0], uGroundPaint[1], uGroundPaint[2], big, 0.42, 0.6, fw );
  float dry = rsFbm( w * 0.045 + 11.0 );
  c = mix( c, uGroundPaint[3], rsStep( 0.66, dry, fwidth( dry ) * 1.5 ) * 0.85 );
  float cl = rsVn( w * 0.55 + 5.0 ) * 0.6 + rsVn( w * 1.7 ) * 0.4, fc = fwidth( cl ) * 1.5;
  c = mix( c, uGroundPaint[4], rsStep( 0.7, cl, fc ) * 0.55 * ( 1.0 - smoothstep( 0.3, 0.8, fc ) ) ); // fades out far away
  float sl = 1.0 - smoothstep( uGroundSlope.y, uGroundSlope.x, ny );          // 0 flat … 1 steep
  float r = sl + ( rsVn( w * 0.3 ) - 0.5 ) * 0.25;
  c = mix( c, uGroundPaint[5], rsStep( 0.35, r, fwidth( r ) * 1.5 ) );
  return mix( c, uGroundPaint[6], rsStep( 0.75, r, fwidth( r ) * 1.5 ) );
}
// shared between the colour, roughness, normal and emissive splices
float rsHeight = 0.0, rsRough = 1.0, rsMirror = 0.0;`;

const FRAG_ROAD_COMMON = `varying vec2 vRoad; varying vec2 vEdge; varying vec4 vSurfA; varying float vSurfB; varying vec4 vWear; varying vec3 vRsWorld;
${FRAG_LIB}
float rsCrackNet( vec2 p ) { // ice: domain-warped cell borders, only in some regions
  vec2 q = p * 0.35 + ( vec2( rsFbm( p * 0.4 ), rsFbm( p * 0.4 + 4.0 ) ) - 0.5 ) * 1.6;
  vec2 i = floor( q ), f = fract( q ); float a = 8.0, b = 8.0;
  for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
    vec2 g = vec2( float( x ), float( y ) ), o = vec2( rsH( i + g ), rsH( i + g + 17.0 ) );
    float d = length( g + o - f );
    if ( d < a ) { b = a; a = d; } else if ( d < b ) b = d;
  }
  return ( 1.0 - smoothstep( 0.0, 0.07, b - a ) ) * smoothstep( 0.42, 0.62, rsVn( p * 0.22 + 1.0 ) ); }
// Cell borders of a jittered grid at p: (F2 − F1, F1), for crack networks (thin where F2 − F1 is small).
vec2 rsBorders( vec2 p ) { vec2 i = floor( p ), f = fract( p ); float a = 8.0, b = 8.0;
  for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
    vec2 g = vec2( float( x ), float( y ) ), o = vec2( rsH( i + g + 5.0 ), rsH( i + g + 23.0 ) );
    float d = length( g + o - f );
    if ( d < a ) { b = a; a = d; } else if ( d < b ) b = d;
  }
  return vec2( b - a, a ); }
// A crack of width wd (m) along the borders of cells, scale per metre (domain-warped so they wander), antialiased over
// px (metres per pixel, from outside any branch: the border distance is in metres, so its screen rate is about px).
float rsCrack( vec2 w, float scale, float wd, float seed, float px ) {
  vec2 q = w * scale + ( vec2( rsVn( w * 0.9 + seed ), rsVn( w * 0.9 + seed + 7.0 ) ) - 0.5 ) * 0.8;
  float e = rsBorders( q ).x / scale, fe = px * 0.7;
  float gaps = smoothstep( 0.42, 0.55, rsVn( w * scale * 2.2 + seed * 3.0 ) ); // broken into segments, not a tiled network
  return ( 1.0 - smoothstep( wd * 0.5 - fe, wd * 0.5 + fe, e ) ) * gaps; }
// Flat stones: a share of jittered cells, each a soft-edged blob (cell id, coverage) — vector shapes, not grain.
vec2 rsChips( vec2 p ) { vec2 i = floor( p ), f = fract( p ); float a = 8.0; vec2 id = vec2( 0.0 );
  for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
    vec2 g = vec2( float( x ), float( y ) ), o = vec2( rsH( i + g ), rsH( i + g + 17.0 ) ) * 0.7 + 0.15;
    float d = length( g + o - f );
    if ( d < a ) { a = d; id = i + g; }
  }
  return vec2( rsH( id + 3.7 ), 1.0 - smoothstep( 0.16, 0.24, a ) ); }
// Wear marks at (x across, s along): short tyre marks, not continuous lines (playtest 2026-10-25: long pairs read as
// straight lines down the road). Four layers of cells 5–17 m long; a cell holds one mark or none. Each mark has its own
// start and length in the cell, offset around the driven line (c, the second line c2 in odd layers where it exists),
// slant, width, one wheel or a pair, and contrast, mottled along its length; a is the line's presence. Returns (mark,
// berm), the berm being the loose ridge just beside a mark.
vec2 rsMarks( float x, float s, vec4 wear ) {
  float m = 0.0, b = 0.0;
  for ( int k = 0; k < 4; k ++ ) {
    float fk = float( k ), len = 5.0 + 4.0 * fk, sk = s / len + fk * 0.37, ci = floor( sk ), f = fract( sk );
    float h0 = rsH( vec2( ci, fk * 11.0 + 1.0 ) );
    bool second = k == 1 || k == 3;
    float a = second && wear.w > 0.1 ? wear.w : wear.y, c = second && wear.w > 0.1 ? wear.z : wear.x;
    if ( h0 > 0.35 + 0.5 * a ) continue;                                       // empty cell (more of them where the line is faint)
    float h1 = rsH( vec2( ci, fk * 11.0 + 2.0 ) ), h2 = rsH( vec2( ci, fk * 11.0 + 3.0 ) ), h3 = rsH( vec2( ci, fk * 11.0 + 4.0 ) );
    float h4 = rsH( vec2( ci, fk * 11.0 + 5.0 ) ), h5 = rsH( vec2( ci, fk * 11.0 + 6.0 ) ), h6 = rsH( vec2( ci, fk * 11.0 + 7.0 ) );
    float f0 = h1 * 0.45, f1 = min( 1.0, f0 + 0.25 + 0.6 * h2 );
    float along = smoothstep( f0, f0 + 0.1, f ) * ( 1.0 - smoothstep( f1 - 0.15, f1, f ) );
    float off = c + ( h3 - 0.5 ) * 1.4 + ( h4 - 0.5 ) * 0.6 * ( f - 0.5 );   // around the line, slanted a little
    float wd = 0.06 + 0.16 * h5;
    float q = h6 < 0.55 ? abs( abs( x - off ) - 0.75 ) : abs( x - off - ( h6 < 0.78 ? 0.75 : -0.75 ) ); // a pair, or one wheel
    float u = q / wd;
    float str = a * ( 0.15 + 0.85 * h0 / max( 0.35 + 0.5 * a, 0.01 ) ) * along * ( 0.55 + 0.45 * rsVn( vec2( s * 0.8, x * 4.0 ) + fk * 7.0 ) );
    m = max( m, str * ( 1.0 - smoothstep( 0.0, 1.0, u ) ) );
    b = max( b, str * smoothstep( 0.8, 1.3, u ) * ( 1.0 - smoothstep( 1.3, 2.4, u ) ) );
  }
  return vec2( m, b );
}
vec3 rsLin( vec3 c ) { return pow( c, vec3( 2.2 ) ); }
vec3 rsSky( vec3 r ) { return mix( uSkyH, uSkyZ, smoothstep( 0.0, 0.6, r.y ) ); }`;

// Road, after color_fragment. Everything that feeds a derivative is computed in uniform control flow; the branches only
// skip layers a surface doesn't have.
const FRAG_ROAD_COLOR = `{
  vec2 w = vRsWorld.xz; float x = vRoad.x, s = vRoad.y;
  float px = length( fwidth( w ) );                                           // metres per pixel
  float wt[${N}]; wt[0] = vSurfA.x; wt[1] = vSurfA.y; wt[2] = vSurfA.z; wt[3] = vSurfA.w; wt[4] = vSurfB;
  vec3 P[${PAINT.length}]; for ( int j = 0; j < ${PAINT.length}; j ++ ) P[j] = vec3( 0.0 );
  vec4 A = vec4( 0.0 ), B = vec4( 0.0 ), C = vec4( 0.0 ), D = vec4( 0.0 );
  for ( int k = 0; k < ${N}; k ++ ) {
    for ( int j = 0; j < ${PAINT.length}; j ++ ) P[j] += wt[k] * uRoadPaint[k * ${PAINT.length} + j];
    A += wt[k] * uRoadA[k]; B += wt[k] * uRoadB[k]; C += wt[k] * uRoadC[k]; D += wt[k] * uRoadD[k];
  }
  vec3 base = P[0], light = P[1], dark = P[2], markC = P[3], rimC = P[4], chipC = P[5];
  float crack = A.x, line = A.y, streak = A.z, chips = A.w, fEdge = B.x, pud = B.y, rough0 = B.z, ice = B.w, rimW = C.x, tone = C.y, wetK = C.z, relief = C.w, mud = D.x;

  // edge: the track's half-width on this side (= the physics), frayed a few cm by finer noise
  float hwRaw = x >= 0.0 ? vEdge.x : vEdge.y;
  float hw = hwRaw + fEdge * ( ( rsVn( w * 5.0 ) - 0.5 ) * 0.12 + ( rsVn( w * 1.7 + 3.0 ) - 0.5 ) * 0.1 );
  float d = abs( x ) - hw;
  float road = 1.0 - rsStep( 0.0, d, px * 0.7 );

  // tone bands, then painted strokes along the road (road space, stretched along s), then flat stones
  float tb = rsFbm( w * 0.045 + 7.0 );
  vec3 col = mix( base, rsBands( dark, base, light, tb, 0.4, 0.62, fwidth( tb ) * 1.5 ), tone );
  float st = rsVn( vec2( x * 1.6, s * 0.22 ) ) * 0.65 + rsVn( vec2( x * 4.0, s * 0.5 ) + 9.0 ) * 0.35, fs = fwidth( st ) * 1.5;
  float far = 1.0 - smoothstep( 0.25, 0.7, fs * 4.0 );                         // strokes thin out before they alias
  col = mix( col, light, rsStep( 0.8, st, fs ) * streak * 0.35 * far );
  col = mix( col, dark, ( 1.0 - rsStep( 0.22, st, fs ) ) * streak * 0.45 * far );
  float h = 0.0;                                                                // relief (m): bends the normal
  float nearR = 1.0 - smoothstep( 0.004, 0.012, px );                          // fine relief only up close
  if ( chips > 0.001 ) {
    vec2 ch = rsChips( w * 7.0 );
    float on = step( 0.82, ch.x ) * ch.y * chips * ( 1.0 - smoothstep( 0.02, 0.05, px ) );
    col = mix( col, mix( chipC, dark, step( 0.91, ch.x ) ), on );
    h += on * 0.006;                                                            // stones stand proud
  }
  h += relief * ( ( rsVn( w * 35.0 ) - 0.5 ) * 0.6 + ( rsVn( w * 90.0 ) - 0.5 ) * 0.4 ) * nearR; // aggregate
  // tyre marks (flat), the rim just inside the edge
  vec2 mk = rsMarks( x, s, vWear );
  float track = mk.x;
  col = mix( col, markC, smoothstep( 0.15, 0.55, track ) * 0.8 );
  float rim = rimW > 0.0 ? ( 1.0 - rsStep( -rimW + ( rsVn( w * 0.8 ) - 0.5 ) * rimW, d, px ) ) : 1.0;
  col = mix( rimC, col, rim );

  float cr = 0.0, seal = 0.0;                                                   // tarmac: crack networks and tar-sealed cracks in stretches
  float crFade = 1.0 - smoothstep( 0.015, 0.05, px );
  if ( crack > 0.001 && crFade > 0.0 ) {
    float region = smoothstep( 0.62, 0.76, rsVn( w * 0.06 + 4.0 ) );
    if ( region > 0.001 ) cr = crack * region * max( rsCrack( w, 0.7, 0.012, 1.0, px ), 0.6 * rsCrack( w, 2.3, 0.007, 9.0, px ) * smoothstep( 0.6, 0.8, rsVn( w * 0.3 + 2.0 ) ) );
    float sealed = smoothstep( 0.6, 0.72, rsVn( w * 0.05 + 13.0 ) );
    if ( sealed > 0.001 ) seal = crack * sealed * rsCrack( w + 40.0, 0.5, 0.045, 17.0, px );
    cr *= crFade; seal *= crFade; cr *= 1.0 - seal;
  }
  col = mix( col, markC * 0.85, cr * 0.6 );
  col = mix( col, markC * 0.7, seal * 0.9 );
  h += -cr * 0.004 + seal * 0.001;
  float mc = 0.0;                                                               // dirt: dried mud cracks in patches
  if ( mud > 0.001 && crFade > 0.0 ) {
    float dryM = smoothstep( 0.6, 0.7, rsFbm( w * 0.08 + 31.0 ) ) * ( 1.0 - track );
    if ( dryM > 0.001 ) mc = mud * dryM * rsCrack( w, 3.2, 0.01, 5.0, px ) * crFade;
  }
  col = mix( col, dark * 0.85, mc * 0.5 );
  h -= mc * 0.003;
  float puddle = 0.0;                                                           // dirt: water in the odd low spot, only on the flat
  float level = smoothstep( 0.999, 0.9998, inverseTransformDirection( normalize( vNormal ), viewMatrix ).y );
  if ( pud > 0.001 ) { float pv = rsFbm( w * 0.45 + 2.0 ) + 0.08 * track; puddle = pud * level * rsStep( 0.76, pv, fwidth( pv ) ) * smoothstep( 0.55, 0.75, rsVn( w * 0.04 + 8.0 ) ); }
  col = mix( col, mix( dark, markC, 0.5 ) * 0.55, puddle );
  if ( line > 0.001 ) {                                                         // centre dashes, worn by the marks
    float dash = line * ( 1.0 - rsStep( 0.09, abs( x ), px ) ) * rsStep( 0.55, fract( s / 7.0 ), 0.002 ) * ( 1.0 - 0.7 * track );
    col = mix( col, rsLin( vec3( 0.9, 0.87, 0.76 ) ), dash * 0.9 );
  }
  // wet patches (the specular map): darker and glossy, with a damp halo; on tarmac water also gathers towards the edges
  float wetM = 0.0, damp = 0.0;
  if ( wetK > 0.001 ) {
    float wv = rsFbm( w * 0.07 + 41.0 ) + 0.22 * smoothstep( -1.6, 0.0, d ) * tone + 0.06 * track, fwv = fwidth( wv );
    wetM = wetK * rsStep( 0.7, wv, fwv ) * mix( 0.5, 1.0, level );
    damp = wetK * smoothstep( 0.6, 0.7, wv ) * ( 1.0 - wetM );
  }
  col *= mix( 1.0, 0.66, wetM ) * mix( 1.0, 0.88, damp );
  h *= 1.0 - 0.7 * max( wetM, puddle );                                         // water fills the relief
  float rough = mix( mix( mix( rough0, 0.2, wetM ), rough0 * 0.85, damp ), 0.06, puddle );
  rough = mix( rough, 0.35, seal );                                             // fresh tar is a little glossy
  float mirror = puddle * 0.45 + wetM * 0.22;

  if ( ice > 0.001 ) {                                                          // ice: flat blues, polished streaks, white cracks
    float frost = rsStep( 0.62, rsFbm( w * 0.3 + 3.0 ) + smoothstep( -1.2, 0.0, d ) * 0.5, 0.02 ) * ( 1.0 - track );
    float crk = rsCrackNet( w ) * ( 1.0 - smoothstep( 0.03, 0.08, px ) );
    vec3 ic = mix( col, P[1], frost * 0.8 );
    ic = mix( ic, P[5], crk * 0.9 );
    col = mix( col, ic, ice );
    rough = mix( rough, mix( 0.12, 0.5, frost ), ice );
    mirror = mix( mirror, 0.6 * ( 1.0 - frost ), ice );
  }

  // ground, then road spilling onto it just past the edge, in flat tongues (not at the ribbon's own edge)
  vec3 g = rsGround( w, inverseTransformDirection( normalize( vNormal ), viewMatrix ).y );
  float tongue = 0.25 + 1.3 * rsVn( w * 0.4 ), out2 = abs( x ) - hwRaw;
  float sh = fEdge * ( 1.0 - ice ) * step( 0.0, d ) * ( 1.0 - rsStep( tongue, d, px ) ) * ( 1.0 - smoothstep( 1.4, 1.9, out2 ) );
  g = mix( g, rimC, sh * 0.85 ); // the rim's colour carries on out: road, rim and spill, then ground (a lighter spill banded it)

  diffuseColor.rgb = mix( g, col, road );
  rsHeight = h * road;
  rsRough = mix( 1.0, rough, road );
  rsMirror = mirror * road;
}`;

// Ground (terrain), after color_fragment.
const FRAG_GROUND_COLOR = `diffuseColor.rgb = rsGround( vRsWorld.xz, inverseTransformDirection( normalize( vNormal ), viewMatrix ).y );`;

// After normal_fragment_maps: the height's screen-space gradient bends the normal (tarmac cracks).
const FRAG_BUMP = `{
  vec3 pos = -vViewPosition, sx = dFdx( pos ), sy = dFdy( pos );
  float hx = dFdx( rsHeight ), hy = dFdy( rsHeight );
  vec3 r1 = cross( sy, normal ), r2 = cross( normal, sx );
  float det = dot( sx, r1 );
  normal = normalize( abs( det ) * normal - sign( det ) * ( hx * r1 + hy * r2 ) );
}`;
// The mirror-like parts (ice, puddles) reflect the sky, added as emissive light (there is no environment map).
const FRAG_EMISSIVE = `if ( rsMirror > 0.001 ) {
  vec3 nW = inverseTransformDirection( normal, viewMatrix ), V = normalize( cameraPosition - vRsWorld );
  float F = 0.02 + 0.98 * pow( 1.0 - max( dot( nW, V ), 0.0 ), 5.0 );        // Schlick, F0 of ice and water
  vec3 R = reflect( -V, nW ); R.y = abs( R.y ) + 0.001;
  totalEmissiveRadiance += mix( rsSky( normalize( R ) ), uSkyH * 0.95, clamp( rsRough * 1.3, 0.0, 1.0 ) ) * F * rsMirror;
}`;

function roadPatch(sh, inject, { depth } = {}) {
  if (depth) return; // the road casts no displaced shadow
  Object.assign(sh.uniforms, U);
  sh.vertexShader = inject(sh.vertexShader, 'common', VERT_ROAD);
  sh.vertexShader = inject(sh.vertexShader, 'project_vertex', VERT_ROAD_MAIN);
  sh.fragmentShader = inject(sh.fragmentShader, 'common', FRAG_ROAD_COMMON);
  sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', FRAG_ROAD_COLOR);
  sh.fragmentShader = inject(sh.fragmentShader, 'roughnessmap_fragment', 'roughnessFactor = rsRough;');
  sh.fragmentShader = inject(sh.fragmentShader, 'normal_fragment_maps', FRAG_BUMP);
  sh.fragmentShader = inject(sh.fragmentShader, 'emissivemap_fragment', FRAG_EMISSIVE);
}
function groundPatch(sh, inject, { depth } = {}) {
  if (depth) return;
  Object.assign(sh.uniforms, U);
  sh.vertexShader = inject(sh.vertexShader, 'common', VERT_GROUND);
  sh.vertexShader = inject(sh.vertexShader, 'project_vertex', VERT_WORLD);
  sh.fragmentShader = inject(sh.fragmentShader, 'common', `varying vec3 vRsWorld;\n${FRAG_LIB}`);
  sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', FRAG_GROUND_COLOR);
}

// The road material: the compiled base (vertex colours) extended by the road patch; the ground: the terrain's.
export const roadMaterial = (mc, base) => mc.extend(base, 'rally-road-surface', roadPatch);
export const groundMaterial = (mc, base) => mc.extend(base, 'rally-ground-surface', groundPatch);
