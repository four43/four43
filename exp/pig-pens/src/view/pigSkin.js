// The pig skin (phase 3k; 3f C4/C6): the compiler's pigHide material with per-instance mud (COVERAGE_INSTANCED, lane w of
// instanceCoverage) and wet (COVERAGE_WET, instanceWet) plus a game patch for closed eyelids at night (aEye on the face
// vertices, aSleep per instance). The block is injected before emissivemap_fragment, so it runs after the compiler's mud
// and wet: the eyes get their own clean vertex colour back (the mud is on the hide), and a sleeping muddy pig shows its lids. `fur: true` is the coat's shells (FUR), `false` the skin under them.
export function pigSkin(mc, { fur = false } = {}) {
  const mud = mc.coverage(mc.get('pigHide', { instanced: true, vertexColors: true, fur })).material;
  return mc.extend(mud, 'eyelids', (sh, inject) => {
    sh.vertexShader = inject(sh.vertexShader, 'common', 'attribute vec3 aEye; attribute float aSleep; attribute float aSick; attribute float aHead; varying vec3 vEye; varying float vSleep; varying float vSick;');
    sh.vertexShader = inject(sh.vertexShader, 'begin_vertex', 'vEye = aEye; vSleep = aSleep; vSick = aSick * aHead;');
    sh.fragmentShader = inject(sh.fragmentShader, 'common', 'varying vec3 vEye; varying float vSleep; varying float vSick;');
    // poorly (v3 §8.2): the head (aHead) goes a queasy green as aSick (per pig, eased) comes up; the eyes below keep theirs
    sh.fragmentShader = inject(sh.fragmentShader, 'emissivemap_fragment', `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.78, 0.30) * (0.55 + 0.45 * dot(diffuseColor.rgb, vec3(0.33))), vSick * 0.8);
if (vEye.x > 0.5) {
  diffuseColor.rgb = diffuse * vColor.rgb; // the eye's own colour: no mud, no wet darkening
  if (vSleep > 0.5) {
    // closed eye: pink lid with a little curved lash line
    vec3 lid = vec3(0.70, 0.27, 0.42);
    float line = 0.38 + 0.9 * (vEye.y - 0.5) * (vEye.y - 0.5);
    float lash = 1.0 - smoothstep(0.045, 0.075, abs(vEye.z - line));
    diffuseColor.rgb = mix(lid, vec3(0.06, 0.06, 0.08), lash * step(0.08, vEye.y) * step(vEye.y, 0.92));
  }
}`, 'before');
  });
}
