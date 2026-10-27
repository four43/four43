// The pig skin (phase 3k; 3f C4/C6): the compiler's pigHide material with per-instance mud (COVERAGE_INSTANCED, lane w of
// instanceCoverage) and wet (COVERAGE_WET, instanceWet) plus a game patch for closed eyelids at night (aEye on the face
// vertices, aSleep per instance). The block is injected before emissivemap_fragment, so it runs after the compiler's mud
// and wet: the eyes get their own clean vertex colour back (the mud is on the hide), and a sleeping muddy pig shows its lids. `fur: true` is the coat's shells (FUR), `false` the skin under them.
export function pigSkin(mc, { fur = false } = {}) {
  const mud = mc.coverage(mc.get('pigHide', { instanced: true, vertexColors: true, fur })).material;
  return mc.extend(mud, 'eyelids', (sh, inject) => {
    sh.vertexShader = inject(sh.vertexShader, 'common', 'attribute vec3 aEye; attribute float aSleep; varying vec3 vEye; varying float vSleep;');
    sh.vertexShader = inject(sh.vertexShader, 'begin_vertex', 'vEye = aEye; vSleep = aSleep;');
    sh.fragmentShader = inject(sh.fragmentShader, 'common', 'varying vec3 vEye; varying float vSleep;');
    sh.fragmentShader = inject(sh.fragmentShader, 'emissivemap_fragment', `if (vEye.x > 0.5) {
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
