// Patch a Lambert/Standard material so brown spots appear where value noise < uDirt. The noise is taken in the mesh's own space, so the spots
// ride with the vehicle or animal instead of crawling across it as it moves.
export function dirtify(material) {
  const uniforms = { uDirt: { value: 0 } };
  material.onBeforeCompile = sh => {
    sh.uniforms.uDirt = uniforms.uDirt;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDirtPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDirtPos = transformed;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uDirt; varying vec3 vDirtPos;
float dh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
float dn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x),mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x),mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float dirtN = dn(vDirtPos * 2.7) * 0.65 + dn(vDirtPos * 9.0) * 0.35;
float lowBias = clamp(1.2 - vDirtPos.y * 0.45, 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.19, 0.10), step(dirtN, uDirt * 0.8 * lowBias) * 0.9);`);
  };
  material.customProgramCacheKey = () => 'dirt';
  return { uniforms };
}
