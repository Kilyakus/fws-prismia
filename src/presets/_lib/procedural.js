/** Prismia's WebGL surface patch. No global Three.js ShaderChunk is modified.
 * The patterns use world XZ, so adjacent ground meshes do not form UV seams.
 * Compatible with skinned, batched and instanced Three.js meshes. */
export function proceduralSurface(material, { kind = 'wet', amount = 0.8, scale = 1, ripple = 0.35 } = {}) {
  const uniforms = {
    prismAmount: { value: amount },
    prismScale: { value: scale },
    prismRipple: { value: ripple },
    prismTime: { value: 0 },
  };
  material.userData.prismUniforms = uniforms;
  material.userData.prismSurface = kind;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vPrismWorld;`);
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 prismWorldPosition = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        prismWorldPosition = batchingMatrix * prismWorldPosition;
      #endif
      #ifdef USE_INSTANCING
        prismWorldPosition = instanceMatrix * prismWorldPosition;
      #endif
      vPrismWorld = (modelMatrix * prismWorldPosition).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vPrismWorld;
      uniform float prismAmount, prismScale, prismRipple, prismTime;
      float prismHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float prismNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(prismHash(i), prismHash(i+vec2(1.0,0.0)), f.x),
                   mix(prismHash(i+vec2(0.0,1.0)), prismHash(i+vec2(1.0,1.0)), f.x), f.y);
      }`);
    if (kind === 'wet') {
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        vec2 prismP = vPrismWorld.xz * prismScale;
        float prismMask = smoothstep(0.43, 0.69, prismNoise(prismP * 0.72) * 0.75 + prismNoise(prismP * 2.3) * 0.25) * prismAmount;
        roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.13), prismMask);
        diffuseColor.rgb *= mix(1.0, 0.68, prismMask);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 prismCell = fract(vPrismWorld.xz * (4.5 * prismScale)) - 0.5;
        float prismDistance = max(length(prismCell), 0.001);
        float prismWave = cos(prismDistance * 32.0 - prismTime * 3.2);
        vec2 prismGradient = prismCell / prismDistance * prismWave * 0.11 * prismRipple * prismMask;
        normal = normalize(normal - mat3(viewMatrix) * vec3(prismGradient.x, 0.0, prismGradient.y));`);
    } else {
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float prismGrain = prismNoise(vPrismWorld.xz * prismScale * 3.2);
        float prismFine = prismNoise(vPrismWorld.xz * prismScale * 14.0);
        diffuseColor.rgb *= mix(1.0, 0.82 + prismGrain * 0.30, prismAmount);
        roughnessFactor = clamp(roughnessFactor + (prismFine - 0.5) * 0.16 * prismAmount, 0.04, 1.0);`);
    }
  };
  material.customProgramCacheKey = () => `prismia-surface-v1-${kind}`;
  material.needsUpdate = true;
  return material;
}
