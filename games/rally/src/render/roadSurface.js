// Road and ground surfaces (rally spec R10): extend() patches on the compiled `rally-road` and `rally-ground` materials, so
// three's standard PBR, shadows and fog stay.
// - Photo textures (R10-7, R10-9; ambientCG, CC0): one colour and one normal+roughness texture array for the page, a layer
//   per surface. Each is sampled with a random offset and quarter turn per noise cell, blended across cell borders, plus a
//   broad brightness drift from the same photo at a ninth of the scale, so the tile doesn't repeat visibly.
// - Road (R10-2 … R10-8): the road edge (the track's edges, plus a few cm of visual fray), the photo per surface (blended
//   by the ribbon's per-vertex surface weights), wear marks (short tyre marks around the track's driven lines, grooved,
//   compacted or polished per surface, with loose berms beside them), tarmac cracks and centre dashes, dirt puddles, an ice model (cracks as normals,
//   sky reflection, fake refraction into the ice), and road material spilling onto the shoulder. Loose stones are
//   geometry (pebbles.js).
// - Ground (R10-9): the verge's photo (grass or snow) as detail over the terrain's vertex colours, the slope surface's
//   photo on steep ground. The ribbon draws its ground part with the same function, so it meets the terrain seamlessly.
// A height value bends the normal (screen-space derivatives) after the photo's normal. Presets are the registry's
// `game.road` and `game.ground` (defs/materials.js).
import { Color, Vector2, Vector4, DataArrayTexture, SRGBColorSpace, LinearMipmapLinearFilter, LinearFilter, RepeatWrapping } from 'three';
import MATERIALS from '../defs/materials.js';

// Weight slots: aSurfA = (tarmac, hardpack, gravel, packed), aSurfB = ice. Anything else draws as gravel.
export const ROAD_SURFACES = ['tarmac', 'hardpack', 'gravel', 'packed', 'ice'];
export const surfaceSlot = (key) => { const i = ROAD_SURFACES.indexOf(key); return i < 0 ? 2 : i; };
const N = ROAD_SURFACES.length;
// Texture array layers: the road slots that have a photo (ice stays procedural), then the verges'.
const VERGES = ['grass', 'snowbank'];
const LAYERS = [
  ...ROAD_SURFACES.slice(0, 4).map(key => ({ key, tex: MATERIALS.get(`rally-${key}`).game.road.tex, file: 'road' })),
  ...VERGES.map(key => ({ key, tex: MATERIALS.get(`rally-${key}`).game.ground.tex, file: 'ground' })),
];
const NT = 4, layerOf = (key) => LAYERS.findIndex(l => l.key === key);

// One set of uniforms for the page: one track at a time, and the compiler caches each material by name.
const U = {
  uRoadCol: { value: [] },  // per surface: colour (linear; the photo's mean once loaded)
  uRoadA: { value: [] },    // (crack, line, grit, tone)
  uRoadB: { value: [] },    // (edge, pud, roughness, ice)
  uRoadC: { value: [] },    // (sparkle, -, -, -)
  uRoadW: { value: [] },    // wear: (depth, smooth, rough, berm)
  uRoadWT: { value: [] },   // wear tint (linear)
  uRoadTex: { value: [] },  // per road photo slot: (tile m, has a photo, -, -)
  uRoadTint: { value: [] }, // per road photo slot: tint (linear)
  uLayerMean: { value: LAYERS.map(() => new Color(0.5, 0.5, 0.5)) }, // per layer, the photo's mean colour (linear)
  uGround: { value: new Vector4(4, 1, 3, 2.5) }, // (layer, slope layer, tile m, slope tile m): setGround
  uGroundSlope: { value: new Vector2(0.95, 0.8) }, // ny over which the slope photo takes over
  uRoadTexOn: { value: 0 },  // 1 once the arrays are loaded
  uRoadTexC: { value: null }, uRoadTexN: { value: null }, // colour (sRGB) and normal xy + roughness, one layer each
  uSkyH: { value: new Color(0.6, 0.7, 0.8) }, // horizon: the fog colour (setSky)
  uSkyZ: { value: new Color(0.35, 0.48, 0.62) },
};
for (const key of ROAD_SURFACES) {
  const def = MATERIALS.get(`rally-${key}`), r = def.game.road, w = r.wear ?? { tint: '#ffffff', depth: 0, smooth: 0, rough: 1, berm: 0 };
  U.uRoadCol.value.push(new Color(r.color));
  U.uRoadA.value.push(new Vector4(r.crack, r.line, r.grit, r.tone));
  U.uRoadB.value.push(new Vector4(r.edge, r.pud, def.look.roughness ?? 0.9, r.ice));
  U.uRoadC.value.push(new Vector4(r.sparkle, 0, 0, 0));
  U.uRoadW.value.push(new Vector4(w.depth, w.smooth, w.rough, w.berm));
  U.uRoadWT.value.push(new Color(w.tint));
}
for (const l of LAYERS.slice(0, NT)) {
  U.uRoadTex.value.push(new Vector4(l.tex?.scale ?? 1, l.tex ? 1 : 0, 0, 0));
  U.uRoadTint.value.push(new Color(l.tex?.tint ?? '#ffffff'));
}
const arrayTexture = (data, size, srgb) => {
  const t = new DataArrayTexture(data, size, size, LAYERS.length);
  t.wrapS = t.wrapT = RepeatWrapping; t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; if (srgb) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
};
U.uRoadTexC.value = arrayTexture(new Uint8Array(4 * LAYERS.length).fill(255), 1, true);   // until the photos load
U.uRoadTexN.value = arrayTexture(new Uint8Array(4 * LAYERS.length).fill(128), 1, false);

// The photos, once per page: each layer's -color.jpg (1024²) and -normal.jpg (512²: normal x, y in red and green,
// roughness in blue) from the page's folder, drawn into its array layer. Until they load (or if they fail) the road keeps
// its procedural colours and the ground its vertex colours. A road slot's mean colour replaces its stand-in colour, so the
// shoulder spill and the blends match the photo.
let loading = null;
export function loadSurfaceTextures(base = '') {
  if (loading) return loading;
  const img = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(`surface texture ${src} failed to load`)); i.src = src; });
  const layers = async (suffix, size) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d', { willReadFrequently: true }), data = new Uint8Array(size * size * 4 * LAYERS.length), mean = [];
    for (const [k, l] of LAYERS.entries()) { // one canvas, so one layer at a time
      if (!l.tex) continue;
      g.drawImage(await img(`${base}${l.file}-${l.tex.name}-${suffix}.jpg`), 0, 0, size, size);
      const px = g.getImageData(0, 0, size, size).data;
      data.set(px, k * size * size * 4);
      let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < px.length; i += 4 * 61) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; n++; }
      mean[k] = new Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, SRGBColorSpace);
    }
    return { data, mean };
  };
  loading = Promise.all([layers('color', 1024), layers('normal', 512)]).then(([c, n]) => {
    U.uRoadTexC.value = arrayTexture(c.data, 1024, true);
    U.uRoadTexN.value = arrayTexture(n.data, 512, false);
    c.mean.forEach((m, k) => { if (!m) return; U.uLayerMean.value[k].copy(m); if (k < NT) U.uRoadCol.value[k].copy(m).multiply(U.uRoadTint.value[k]); });
    U.uRoadTexOn.value = 1;
  });
  return loading;
}

// Reflections see a sky that matches the fog: horizon = fog colour, zenith a deeper, still muted blue (a saturated zenith
// turns every ice crack into a blue line, doc §6.1).
const ZENITH = new Color(0.62, 0.76, 0.95);
export function setSky(fogColor) {
  U.uSkyH.value.copy(fogColor);
  U.uSkyZ.value.copy(fogColor).multiply(ZENITH);
}
// The ground's photos for a verge surface ('grass' | 'snowbank') and the ny range of its slope colour (trackView's PAL).
export function setGround(verge, slope) {
  const g = MATERIALS.get(`rally-${verge}`).game.ground, s = MATERIALS.get(`rally-${g.slope}`).game.road.tex;
  U.uGround.value.set(layerOf(verge), layerOf(g.slope), g.tex.scale, s.scale);
  U.uGroundSlope.value.set(slope[0], slope[1]);
}

const VERT_GROUND = `varying vec3 vRsWorld;`;
const VERT_ROAD = `attribute vec2 aRoad; attribute vec2 aEdge; attribute vec4 aSurfA; attribute float aSurfB; attribute vec4 aWear;
varying vec2 vRoad; varying vec2 vEdge; varying vec4 vSurfA; varying float vSurfB; varying vec4 vWear; varying vec3 vRsWorld;`;
const VERT_WORLD = `vRsWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`;
const VERT_ROAD_MAIN = `vRoad = aRoad; vEdge = aEdge; vSurfA = aSurfA; vSurfB = aSurfB; vWear = aWear;\n${VERT_WORLD}`;

// Shared by both materials: uniforms, noise, the photo sampler and the ground.
const FRAG_LIB = `uniform vec3 uRoadCol[${N}]; uniform vec4 uRoadA[${N}]; uniform vec4 uRoadB[${N}]; uniform vec4 uRoadC[${N}];
uniform vec4 uRoadW[${N}]; uniform vec3 uRoadWT[${N}];
uniform vec4 uRoadTex[${NT}]; uniform vec3 uRoadTint[${NT}]; uniform vec3 uLayerMean[${LAYERS.length}];
uniform vec4 uGround; uniform vec2 uGroundSlope; uniform float uRoadTexOn;
uniform highp sampler2DArray uRoadTexC; uniform highp sampler2DArray uRoadTexN;
uniform vec3 uSkyH; uniform vec3 uSkyZ;
float rsH( vec2 p ) { p = mod( p, 4096.0 ); p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float rsVn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( rsH( i ), rsH( i + vec2( 1, 0 ) ), f.x ), mix( rsH( i + vec2( 0, 1 ) ), rsH( i + 1.0 ), f.x ), f.y ); }
float rsFbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 4; i ++ ) { s += a * rsVn( p ); p *= 2.03; a *= 0.5; } return s / 0.9375; }
mat2 rsQuarter( float n ) { float a = floor( n * 4.0 ) * 1.5707963; float c = cos( a ), s = sin( a ); return mat2( c, s, -s, c ); }
// One photo layer at world xz w, tiled every scale m; gx, gy = dFdx( w ), dFdy( w ) from uniform control flow. A noise
// index picks a random offset and quarter turn every few tiles; neighbouring picks blend across the index's fractional
// part, biased by colour so the seam follows the photo (after Quilez's texture-repetition technique 3). The rotated
// samples' normal slopes are turned back. out: colour (linear), normal xy (tangent: +x, -z), roughness.
void rsTex( float layer, vec2 w, float scale, vec2 gx, vec2 gy, out vec3 col, out vec2 xy, out float rough ) {
  float sc = 1.0 / scale;
  vec2 uv = vec2( w.x, -w.y ) * sc, dx = vec2( gx.x, -gx.y ) * sc, dy = vec2( gy.x, -gy.y ) * sc;
  float k = rsVn( uv * 0.27 + layer * 13.0 ) * 8.0, i = floor( k ), f = fract( k );
  vec2 ha = vec2( rsH( vec2( i, layer ) ), rsH( vec2( i, layer + 5.0 ) ) ), hb = vec2( rsH( vec2( i + 1.0, layer ) ), rsH( vec2( i + 1.0, layer + 5.0 ) ) );
  mat2 ra = rsQuarter( ha.x ), rb = rsQuarter( hb.x );
  vec3 ua = vec3( ra * uv + ha * 17.0, layer ), ub = vec3( rb * uv + hb * 17.0, layer );
  vec3 ca = textureGrad( uRoadTexC, ua, ra * dx, ra * dy ).rgb, cb = textureGrad( uRoadTexC, ub, rb * dx, rb * dy ).rgb;
  vec3 na = textureGrad( uRoadTexN, ua, ra * dx, ra * dy ).rgb, nb = textureGrad( uRoadTexN, ub, rb * dx, rb * dy ).rgb;
  float b = smoothstep( 0.2, 0.8, f - 0.1 * dot( ca - cb, vec3( 1.0 ) ) );
  col = mix( ca, cb, b );
  xy = mix( transpose( ra ) * ( na.xy * 2.0 - 1.0 ), transpose( rb ) * ( nb.xy * 2.0 - 1.0 ), b );
  rough = mix( na.z, nb.z, b );
  vec3 cm = textureGrad( uRoadTexC, vec3( uv * 0.11 + 0.5, layer ), dx * 0.11, dy * 0.11 ).rgb; // broad drift, same photo
  vec3 lum = vec3( 0.3, 0.6, 0.1 );
  col *= mix( 1.0, dot( cm, lum ) / max( dot( uLayerMean[ int( layer ) ], lum ), 0.01 ), 0.45 );
}
// The ground at w: the vertex colour (the terrain's palette) times the verge photo's detail (photo / its mean), the slope
// surface's photo where ny falls through uGroundSlope.
vec3 rsGround( vec2 w, float ny, vec3 vcol, vec2 gx, vec2 gy, out vec2 xy, out float rough ) {
  xy = vec2( 0.0 ); rough = 1.0;
  if ( uRoadTexOn < 0.5 ) return vcol;
  vec3 c; rsTex( uGround.x, w, uGround.z, gx, gy, c, xy, rough );
  vec3 col = vcol * mix( vec3( 1.0 ), c / max( uLayerMean[ int( uGround.x ) ], vec3( 0.01 ) ), 0.85 );
  float sl = smoothstep( uGroundSlope.x, uGroundSlope.y, ny );
  if ( sl > 0.001 ) {
    vec3 c2; vec2 xy2; float r2; rsTex( uGround.y, w, uGround.w, gx, gy, c2, xy2, r2 );
    col = mix( col, vcol * mix( vec3( 1.0 ), c2 / max( uLayerMean[ int( uGround.y ) ], vec3( 0.01 ) ), 0.85 ), sl );
    xy = mix( xy, xy2, sl ); rough = mix( rough, r2, sl );
  }
  rough = mix( 1.0, rough, 0.2 ); // the photos' roughness maps are glossier than turf and snow look from a car
  return col;
}
// shared between the colour, roughness, normal and emissive splices
vec2 rsTexXY = vec2( 0.0 );
float rsHeight = 0.0, rsRough = 1.0, rsMirror = 0.0, rsSparkle = 0.0;`;

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
float rsWorley( vec2 p ) { vec2 i = floor( p ), f = fract( p ); float a = 8.0;
  for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
    vec2 g = vec2( float( x ), float( y ) ), o = vec2( rsH( i + g ), rsH( i + g + 17.0 ) );
    a = min( a, length( g + o - f ) );
  }
  return a; }
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

// Road, after color_fragment: diffuseColor.rgb is the vertex colour (the terrain's, for the ground part). Everything that
// feeds a derivative is computed in uniform control flow; the branches only skip layers a surface doesn't have.
const FRAG_ROAD_COLOR = `{
  vec2 w = vRsWorld.xz; float x = vRoad.x;
  vec2 gx = dFdx( w ), gy = dFdy( w );
  float px = length( fwidth( w ) );                                           // metres per pixel
  float near = 1.0 - smoothstep( 12.0, 45.0, distance( cameraPosition, vRsWorld ) );
  float wt[${N}]; wt[0] = vSurfA.x; wt[1] = vSurfA.y; wt[2] = vSurfA.z; wt[3] = vSurfA.w; wt[4] = vSurfB;
  vec3 cRoad = vec3( 0.0 ), wTint = vec3( 0.0 ); vec4 A = vec4( 0.0 ), B = vec4( 0.0 ), C = vec4( 0.0 ), W = vec4( 0.0 );
  for ( int k = 0; k < ${N}; k ++ ) {
    cRoad += wt[k] * uRoadCol[k]; wTint += wt[k] * uRoadWT[k];
    A += wt[k] * uRoadA[k]; B += wt[k] * uRoadB[k]; C += wt[k] * uRoadC[k]; W += wt[k] * uRoadW[k];
  }
  float crack = A.x, line = A.y, grit = A.z, tone = A.w, fEdge = B.x, pud = B.y, rough0 = B.z, ice = B.w;

  // edge: the track's half-width on this side (= the physics), frayed a few cm by finer noise
  float hw = ( x >= 0.0 ? vEdge.x : vEdge.y ) + fEdge * ( ( rsVn( w * 5.0 ) - 0.5 ) * 0.12 + ( rsVn( w * 1.7 + 3.0 ) - 0.5 ) * 0.1 );
  float d = abs( x ) - hw, soft = 0.03 + 0.1 * fEdge;
  float road = 1.0 - smoothstep( -soft, soft, d );

  // wear: short tyre marks around the track's driven lines (aWear), with loose berms beside them
  vec2 mk = rsMarks( x, vRoad.y, vWear );
  float track = mk.x, berm = mk.y * ( 1.0 - track );

  // the photos, blended by the surface weights
  vec3 tcol = vec3( 0.0 ); vec2 txy = vec2( 0.0 ); float trough = 0.0, twt = 0.0;
  for ( int k = 0; k < ${NT}; k ++ ) {
    float wk = wt[k] * uRoadTex[k].y * uRoadTexOn;
    if ( wk > 0.001 ) {
      vec3 c; vec2 n; float r; rsTex( float( k ), w, uRoadTex[k].x, gx, gy, c, n, r );
      tcol += wk * c * uRoadTint[k]; txy += wk * n; trough += wk * r; twt += wk;
    }
  }
  // fine aggregate where there's no photo (2–4 cm grain, faded out before it aliases)
  float aaSp = 1.0 - smoothstep( 0.15, 0.5, px * 40.0 );
  float sp = mix( 0.5, rsVn( w * 23.0 ) * 0.55 + rsVn( w * 61.0 + 7.0 ) * 0.45, aaSp );
  vec3 col = cRoad * ( 1.0 - twt ) + tcol;
  col *= mix( 1.0, 0.85 + 0.3 * rsFbm( w * 0.05 ), tone );                    // broad drift
  grit *= 1.0 - twt;
  col *= mix( 1.0, 0.7 + 0.6 * sp, grit );
  col *= mix( vec3( 1.0 ), wTint, track );
  txy *= 1.0 - W.y * track;                                                     // tyres flatten the relief in the lines

  float cr = 0.0;                                                               // tarmac cracks: thin, in some stretches only
  if ( crack > 0.001 ) cr = crack * ( 1.0 - smoothstep( 0.0, 0.006, abs( rsFbm( w * 0.6 + 9.0 ) - 0.5 ) ) )
                          * smoothstep( 0.55, 0.7, rsVn( w * 0.08 + 4.0 ) ) * ( 1.0 - smoothstep( 0.015, 0.04, px ) );
  col *= 1.0 - cr * 0.45;
  float puddle = 0.0;                                                           // dirt: water in the odd low spot, in the lines,
  float level = smoothstep( 0.999, 0.9998, inverseTransformDirection( normalize( vNormal ), viewMatrix ).y ); // only where flat (< ~2–4.5 %)
  if ( pud > 0.001 ) puddle = pud * level * smoothstep( 0.74, 0.78, rsFbm( w * 0.45 + 2.0 ) + 0.08 * track ) * smoothstep( 0.55, 0.75, rsVn( w * 0.04 + 8.0 ) );
  col = mix( col, cRoad * 0.4, puddle );
  if ( line > 0.001 ) {                                                         // centre dashes, worn by grit and the lines
    float dash = line * ( 1.0 - smoothstep( 0.07, 0.1, abs( x ) ) ) * smoothstep( 0.54, 0.56, fract( vRoad.y / 7.0 ) )
               * mix( 1.0, smoothstep( 0.25, 0.6, rsVn( w * 3.0 ) ), 0.6 ) * ( 1.0 - 0.7 * track );
    col = mix( col, rsLin( vec3( 0.85, 0.82, 0.7 ) ), dash * 0.9 );
  }
  float h = grit * ( sp - 0.5 ) * aaSp * 0.003 - cr * 0.003 - W.x * track + W.x * 0.5 * W.w * berm; // metres
  h *= 1.0 - puddle;
  float rough = mix( mix( rough0, trough / max( twt, 0.001 ), twt * 0.7 ) * mix( 1.0, W.z, track ), 0.06, puddle );
  float mirror = puddle * 0.45; // muddy water: a dim reflection

  if ( ice > 0.001 ) {                                                          // ice (doc §6); the lines are polished clear
    float frost = clamp( smoothstep( 0.5, 0.8, rsFbm( w * 0.35 + 3.0 ) ) * ( 1.0 - track ) + smoothstep( -1.4, 0.0, d ), 0.0, 1.0 );
    float crk = rsCrackNet( w ) * near;
    float hi = ( rsFbm( w * 1.2 ) - 0.5 ) * 0.03 + near * ( -crk * 0.012 + frost * ( rsVn( w * 18.0 ) - 0.5 ) * 0.012 );
    float ri = clamp( mix( 0.04, 0.55, frost ) * mix( 1.0, W.z, track ) + crk * 0.6, 0.0, 1.0 );
    // fake refraction: the view ray bent into the ice down to a dark bed 0.12 m below, absorbed red-first
    vec3 V = normalize( cameraPosition - vRsWorld ), rr = refract( -V, vec3( 0.0, 1.0, 0.0 ), 1.0 / 1.31 );
    float path = 0.12 / max( -rr.y, 0.08 );
    vec2 bw = w + rr.xz * path;
    vec3 bed = rsLin( vec3( 0.13, 0.13, 0.14 ) ) * ( 0.75 + 0.5 * rsFbm( bw * 2.5 ) ) * ( 0.85 + 0.3 * rsH( floor( bw * 40.0 ) ) );
    vec3 ab = exp( -path * vec3( 5.5, 2.2, 1.4 ) );
    vec3 body = bed * ab + rsLin( vec3( 0.42, 0.62, 0.74 ) ) * ( 1.0 - ab ) * 0.55;
    body = mix( body, rsLin( vec3( 0.86, 0.88, 0.9 ) ), rsCrackNet( w + rr.xz * path * 0.5 ) * near * 0.45 ); // fracture sheet below
    body = mix( body, rsLin( vec3( 0.88, 0.89, 0.9 ) ), crk * 0.22 );        // cracks scatter white, never blue
    if ( near > 0.0 ) for ( int k = 0; k < 2; k ++ ) {                            // bubbles at two depths, in clusters
      vec2 bp = w + rr.xz * path * ( 0.3 + 0.4 * float( k ) );
      float bb = ( 1.0 - smoothstep( 0.03, 0.09, rsWorley( bp * 12.0 + float( k ) * 31.0 ) ) ) * smoothstep( 0.55, 0.72, rsVn( bp * 1.2 + float( k ) * 9.0 ) );
      body += rsLin( vec3( 0.85, 0.9, 0.95 ) ) * bb * 0.3 * near;
    }
    vec3 frostC = rsLin( vec3( 0.88, 0.92, 0.96 ) ) * ( 0.86 + 0.14 * rsVn( w * 25.0 ) );
    col = mix( col, mix( body, frostC, frost * 0.85 ), ice );
    h = mix( h, hi, ice ); rough = mix( rough, ri, ice );
    mirror = mix( mirror, 1.0 - frost * 0.75, ice );
  }

  // ground: the terrain's look (same function as the terrain material), then road material spilling onto it just past
  // the edge, in tongues (not at the ribbon's own edge)
  vec2 gxy; float grough;
  vec3 g = rsGround( w, inverseTransformDirection( normalize( vNormal ), viewMatrix ).y, diffuseColor.rgb, gx, gy, gxy, grough );
  float sh = fEdge * ( 1.0 - smoothstep( 0.0, 0.3 + 1.2 * rsVn( w * 0.4 ), d ) ) * step( 0.0, d ) * ( 1.0 - smoothstep( 1.4, 1.9, abs( x ) - ( x >= 0.0 ? vEdge.x : vEdge.y ) ) ) * ( 1.0 - ice );
  g = mix( g, cRoad * ( 0.85 + 0.3 * sp ), sh * 0.6 );

  diffuseColor.rgb = mix( g, col, road );
  rsHeight = h * road;
  rsRough = mix( grough, rough, road );
  rsMirror = mirror * road;
  rsSparkle = C.x * road * near;
  rsTexXY = mix( gxy * ( 1.0 - sh ), txy * ( 1.0 - puddle ) * ( 1.0 - ice ), road );
}`;

// Ground (terrain), after color_fragment.
const FRAG_GROUND_COLOR = `{
  vec2 w = vRsWorld.xz;
  diffuseColor.rgb = rsGround( w, inverseTransformDirection( normalize( vNormal ), viewMatrix ).y, diffuseColor.rgb, dFdx( w ), dFdy( w ), rsTexXY, rsRough );
}`;

// After normal_fragment_maps: the photo's normal (tangent along +x, bitangent along -z, on the mesh normal), then the
// height's screen-space gradient bends it further.
const FRAG_TEX_NORMAL = `if ( dot( rsTexXY, rsTexXY ) > 1e-6 ) {
  vec3 nG = inverseTransformDirection( normal, viewMatrix ), T = normalize( vec3( 1.0, 0.0, 0.0 ) - nG * nG.x ), B = cross( nG, T );
  vec3 nW = normalize( T * rsTexXY.x + B * rsTexXY.y + nG * sqrt( max( 1.0 - dot( rsTexXY, rsTexXY ), 0.0 ) ) );
  normal = normalize( ( viewMatrix * vec4( nW, 0.0 ) ).xyz );
}`;
const FRAG_BUMP = `{
  vec3 pos = -vViewPosition, sx = dFdx( pos ), sy = dFdy( pos );
  float hx = dFdx( rsHeight ), hy = dFdy( rsHeight );
  vec3 r1 = cross( sy, normal ), r2 = cross( normal, sx );
  float det = dot( sx, r1 );
  normal = normalize( abs( det ) * normal - sign( det ) * ( hx * r1 + hy * r2 ) );
}`;
// The mirror-like parts (ice, puddles) reflect the sky from the bent normal, added as emissive light (there is no
// environment map); packed snow sparkles.
const FRAG_EMISSIVE = `{
  vec3 nW = inverseTransformDirection( normal, viewMatrix ), V = normalize( cameraPosition - vRsWorld );
  float F = 0.02 + 0.98 * pow( 1.0 - max( dot( nW, V ), 0.0 ), 5.0 );        // Schlick, F0 of ice and water
  if ( rsMirror > 0.001 ) {
    vec3 R = reflect( -V, nW ); R.y = abs( R.y ) + 0.001;
    vec3 refl = mix( rsSky( normalize( R ) ), uSkyH * 0.95, clamp( rsRough * 1.3, 0.0, 1.0 ) );
    totalEmissiveRadiance += refl * F * rsMirror;
  }
  if ( rsSparkle > 0.001 ) totalEmissiveRadiance += vec3( step( 0.998, rsH( floor( vRsWorld.xz * 70.0 ) + floor( V.xz * 30.0 ) ) ) * rsSparkle * 0.35 );
}`;

function roadPatch(sh, inject, { depth } = {}) {
  if (depth) return; // the road casts no displaced shadow
  Object.assign(sh.uniforms, U);
  sh.vertexShader = inject(sh.vertexShader, 'common', VERT_ROAD);
  sh.vertexShader = inject(sh.vertexShader, 'project_vertex', VERT_ROAD_MAIN);
  sh.fragmentShader = inject(sh.fragmentShader, 'common', FRAG_ROAD_COMMON);
  sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', FRAG_ROAD_COLOR);
  sh.fragmentShader = inject(sh.fragmentShader, 'roughnessmap_fragment', 'roughnessFactor = rsRough;');
  sh.fragmentShader = inject(sh.fragmentShader, 'normal_fragment_maps', FRAG_TEX_NORMAL + '\n' + FRAG_BUMP);
  sh.fragmentShader = inject(sh.fragmentShader, 'emissivemap_fragment', FRAG_EMISSIVE);
}
function groundPatch(sh, inject, { depth } = {}) {
  if (depth) return;
  Object.assign(sh.uniforms, U);
  sh.vertexShader = inject(sh.vertexShader, 'common', VERT_GROUND);
  sh.vertexShader = inject(sh.vertexShader, 'project_vertex', VERT_WORLD);
  sh.fragmentShader = inject(sh.fragmentShader, 'common', `varying vec3 vRsWorld;\n${FRAG_LIB}`);
  sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', FRAG_GROUND_COLOR);
  sh.fragmentShader = inject(sh.fragmentShader, 'roughnessmap_fragment', 'roughnessFactor = rsRough;');
  sh.fragmentShader = inject(sh.fragmentShader, 'normal_fragment_maps', FRAG_TEX_NORMAL);
}

// The road material: the compiled base (vertex colours) extended by the road patch; the ground: the terrain's.
export const roadMaterial = (mc, base) => mc.extend(base, 'rally-road-surface', roadPatch);
export const groundMaterial = (mc, base) => mc.extend(base, 'rally-ground-surface', groundPatch);
