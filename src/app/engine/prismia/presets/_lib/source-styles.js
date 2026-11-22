import * as THREE from 'three';
import {makePhysical, makeUnlit} from './materials.js';

function copyRenderFlags(material, source) {
  for (const key of ['toneMapped', 'alphaHash', 'alphaToCoverage', 'visible',
    'depthFunc', 'colorWrite', 'stencilWrite', 'stencilWriteMask', 'stencilFunc',
    'stencilRef', 'stencilFuncMask', 'stencilFail', 'stencilZFail', 'stencilZPass',
    'clipShadows', 'clipIntersection', 'shadowSide', 'dithering']) {
    if (key in source && key in material) material[key] = source[key];
  }
  if (source.clippingPlanes) material.clippingPlanes = source.clippingPlanes.slice();
  return material;
}

// Quantize only the direct-light response. The texture itself, baked blush,
// AO, eye colours and the original Phong specular remain unquantized.
export function createSourceToon(source) {
  const material = source.clone();
  material.name = `${source.name}@toon`;
  const previous = source.onBeforeCompile;
  const previousKey = source.customProgramCacheKey?.call(source) ?? '';
  material.onBeforeCompile = function(shader, renderer) {
    previous?.call(this, shader, renderer);
    const token = '#include <lights_phong_pars_fragment>';
    const chunk = THREE.ShaderChunk.lights_phong_pars_fragment;
    const original = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
    if (!shader.fragmentShader.includes(token) || !chunk.includes(original)) {
      console.warn('Prismia Toon: unsupported Phong shader; leaving the source lighting intact.');
      return;
    }
    const stylized = `float prismiaNdotL = saturate( dot( geometryNormal, directLight.direction ) );
      float prismiaBand = mix( 0.58, 0.82, smoothstep( 0.16, 0.25, prismiaNdotL ) );
      prismiaBand = mix( prismiaBand, 1.0, smoothstep( 0.56, 0.65, prismiaNdotL ) );
      float dotNL = mix( prismiaNdotL, prismiaBand * step( 0.001, prismiaNdotL ), 0.45 );`;
    shader.fragmentShader = shader.fragmentShader.replace(token, chunk.replace(original, stylized));
  };
  material.customProgramCacheKey = () => `${previousKey}|prismia-source-toon-v1`;
  material.needsUpdate = true;
  return material;
}

export function createSourcePbr(source, context = {}) {
  const material = makePhysical(source, {
    tag: 'pbr', roughness: 0.78, metalness: 0,
    ior: 1.3, specularIntensity: 0.35, clearcoat: 0,
    envMap: context.envMap, envMapIntensity: 0.45,
  });
  copyRenderFlags(material, source);
  // Prefer authored source-specific material maps and flags; there is no new
  // texture allocation, so subsequent appearance/atlas edits stay live.
  material.needsUpdate = true;
  return material;
}

export function createSourceUnlit(source) {
  const material = makeUnlit(source, { tag: 'unlit' });
  // Unlit has no light response, but still participates in the same scene
  // tone mapping as the source instead of becoming unnaturally washed out.
  copyRenderFlags(material, source);
  material.needsUpdate = true;
  return material;
}

function sourceWithoutShadeBake(source) {
  if (!source?.shadeMultiplyTexture && !source?.uniforms?.shadeMultiplyTexture?.value) return source;
  const uniforms = source.uniforms ? {...source.uniforms, shadeMultiplyTexture: {value: null}} : null;
  return new Proxy(source, {get(target, key, receiver) {
    if (key === 'shadeMultiplyTexture') return null;
    if (key === 'uniforms' && uniforms) return uniforms;
    return Reflect.get(target, key, receiver);
  }});
}


/** Convert non-world surfaces using their live authored albedo and render state.
 * Phong sources retain specular response in Toon; other types use the supplied
 * Prismia factory. Textures stay owned by the caller and are never baked. */
export function buildSourceStyle(id, source, context, fallback) {
  if (!source) return null;
  if (context?.target === 'world') return fallback(source, context);
  if (source.isMeshPhongMaterial) {
    if (id === 'pbr') return createSourcePbr(source, context);
    if (id === 'toon') return createSourceToon(source);
    if (id === 'unlit') return createSourceUnlit(source);
  }
  const material = fallback(sourceWithoutShadeBake(source), context);
  if (!material) return material;
  copyRenderFlags(material, source);
  const map = source?.map ?? source?.uniforms?.map?.value;
  if ('map' in material && map) material.map = map;
  material.needsUpdate = true;
  return material;
}
