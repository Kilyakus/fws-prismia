import * as THREE from "three";

/**
 * Shared helpers for shader presets.
 *
 * Presets never mutate the model's own material: they receive it as a source,
 * copy everything that describes the surface (maps, alpha cut-out, side, …) and
 * return a new material. That keeps palette edits, AO textures and hair maps
 * working no matter which shader is selected.
 */

const MAP_KEYS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
  "alphaMap",
  "bumpMap",
  "displacementMap",
  "clearcoatMap",
  "clearcoatRoughnessMap",
  "clearcoatNormalMap",
  "sheenColorMap",
  "sheenRoughnessMap",
  "specularMap",
  "specularIntensityMap",
  "specularColorMap",
  "iridescenceMap",
  "iridescenceThicknessMap",
  "transmissionMap",
  "thicknessMap",
];

const FLAG_KEYS = [
  "transparent",
  "opacity",
  "alphaTest",
  "depthWrite",
  "depthTest",
  "side",
  "vertexColors",
  "flatShading",
  "blending",
  "premultipliedAlpha",
  "colorWrite",
  "polygonOffset",
  "polygonOffsetFactor",
  "polygonOffsetUnits",
];

const SCALAR_KEYS = [
  "normalScale",
  "aoMapIntensity",
  "bumpScale",
  "displacementScale",
  "displacementBias",
];

const tintCache = new Map();

/**
 * Resolve a texture slot on either a standard material (`material.map`) or a
 * three-vrm MToon material, which keeps every texture inside `uniforms`.
 */
export function textureOf(source, key) {
  return source?.[key] ?? source?.uniforms?.[key]?.value ?? null;
}

/**
 * Albedo folded together with MToon's `shadeMultiplyTexture`.
 *
 * VRM keeps the painted face in the albedo map and the volume (shadow bands,
 * creases, AO) in a separate multiply map that only MToon's shader knows about.
 * A standard/toon/physical material would drop it and the face turns flat, so
 * both maps are baked into one canvas texture once per material pair. Painted
 * details stay untouched — they are multiplied by their own shading.
 */
const bakedCache = new Map();

function imageSize(image) {
  return {
    width: image?.width ?? image?.naturalWidth ?? 0,
    height: image?.height ?? image?.naturalHeight ?? 0,
  };
}

export function bakedAlbedo(source) {
  const albedo = textureOf(source, "map");
  const shade = textureOf(source, "shadeMultiplyTexture");
  if (!albedo?.image || !shade?.image) return albedo;
  // Some VRM files point the shade slot at the albedo itself; multiplying a map
  // by itself would only double the contrast, so that case is left alone.
  if (shade.uuid === albedo.uuid) return albedo;
  const key = `${albedo.uuid}:${shade.uuid}`;
  const cached = bakedCache.get(key);
  if (cached) return cached;
  const base = imageSize(albedo.image);
  const shadow = imageSize(shade.image);
  if (!base.width || !base.height) return albedo;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(albedo.image, 0, 0, base.width, base.height);
    if (shadow.width && shadow.height) {
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(shade.image, 0, 0, base.width, base.height);
      ctx.globalCompositeOperation = "source-over";
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = albedo.colorSpace;
    texture.flipY = albedo.flipY;
    texture.wrapS = albedo.wrapS;
    texture.wrapT = albedo.wrapT;
    texture.magFilter = albedo.magFilter;
    texture.minFilter = albedo.minFilter;
    texture.anisotropy = albedo.anisotropy;
    texture.needsUpdate = true;
    bakedCache.set(key, texture);
    return texture;
  } catch (error) {
    console.warn("Не удалось собрать затенение для шейдера:", error);
    return albedo;
  }
}

/**
 * Normalised tint (max channel = 1) used to *shift* the picked colour instead of
 * replacing it, so "Тактический синий" tints the palette rather than ignoring it.
 */
export function presetTint(hex) {
  const key = String(hex);
  const cached = tintCache.get(key);
  if (cached) return cached.clone();
  const color = new THREE.Color(hex);
  const max = Math.max(color.r, color.g, color.b) || 1;
  const tint = color.multiplyScalar(1 / max);
  tintCache.set(key, tint.clone());
  return tint;
}

/**
 * Copy imported surface description from `src` onto `dst`.
 * `copyColor: false` keeps the colour the preset already computed (tinted/forced).
 */
export function inheritSurface(dst, src, { copyColor = true } = {}) {
  if (!dst || !src) return dst;
  // Only slots the target material type declares: copying e.g. `emissiveMap`
  // onto MeshBasicMaterial would break its uniform refresh in the renderer.
  for (const key of MAP_KEYS) {
    // `map` is already the baked albedo × shade texture, so it wins.
    if (key === "map" && dst.map) continue;
    if (!(key in dst)) continue;
    const texture = textureOf(src, key);
    if (texture) dst[key] = texture;
  }
  for (const key of FLAG_KEYS) {
    if (!(key in dst)) continue;
    const value = src[key] ?? src.uniforms?.[key]?.value;
    if (value !== undefined) dst[key] = value;
  }
  for (const key of SCALAR_KEYS) {
    if (!(key in dst)) continue;
    const value = src[key] ?? src.uniforms?.[key]?.value;
    if (value === undefined) continue;
    dst[key] = value?.clone?.() ?? value;
  }
  if (copyColor && src.color?.isColor && dst.color?.isColor)
    dst.color.copy(src.color);
  if (src.emissive?.isColor && dst.emissive?.isColor)
    dst.emissive.copy(src.emissive);
  dst.needsUpdate = true;
  return dst;
}

/**
 * Base material settings every preset starts from.
 *
 * `tint` shifts the palette colour instead of replacing it; `color` is only used
 * as a fallback for untextured, colourless sources.
 */
export function baseParams(source, options = {}) {
  const authored =
    source.color?.isColor && source.color.getHex() !== 0xffffff
      ? source.color.clone()
      : null;
  const albedo = bakedAlbedo(source);
  const hasMap = !!albedo;
  let color = authored ?? new THREE.Color(0xffffff);
  if (options.tint !== undefined) {
    // `material.color` multiplies the albedo texture, so a tint works the same
    // way the palette does: it shifts the ownership surface without touching
    // the painted detail inside the map.
    const tint = presetTint(options.tint);
    color = authored ? authored.multiply(tint) : tint;
  }
  if (!hasMap && !authored && options.color !== undefined)
    color = new THREE.Color(options.color);
  return {
    name: `${source.name ?? "material"}@${options.tag ?? "shader"}`,
    color,
    map: albedo,
    side: source.side ?? THREE.FrontSide,
    transparent: !!source.transparent || !!options.transparent,
    opacity: options.opacity ?? source.opacity ?? 1,
    alphaTest: source.alphaTest ?? 0,
    depthWrite: source.depthWrite !== false,
    vertexColors: !!source.vertexColors,
  };
}

/** MeshStandardMaterial built from the source surface. */
export function makeStandard(source, options = {}) {
  const material = new THREE.MeshStandardMaterial(baseParams(source, options));
  inheritSurface(material, source, { copyColor: options.tint === undefined });
  material.roughness = options.roughness ?? 0.72;
  material.metalness = options.metalness ?? 0;
  material.emissive = (
    source.emissive?.isColor
      ? source.emissive.clone()
      : new THREE.Color(0x000000)
  ).lerp(
    new THREE.Color(options.emissive ?? 0x000000),
    options.emissiveMix ?? 0,
  );
  if (options.emissive !== undefined) {
    material.emissive.set(options.emissive);
    if (options.emissiveMix !== undefined && source.emissive)
      material.emissive.lerpColors(
        source.emissive,
        new THREE.Color(options.emissive),
        options.emissiveMix,
      );
  }
  material.emissiveIntensity =
    options.emissiveIntensity ?? source.emissiveIntensity ?? 1;
  if (options.envMap) {
    material.envMap = options.envMap;
    material.envMapIntensity = options.envMapIntensity ?? 1;
  }
  if (options.transparent) material.transparent = true;
  if (options.opacity !== undefined) material.opacity = options.opacity;
  material.userData = { shaderParameters: { ...options } };
  material.needsUpdate = true;
  return material;
}

/** MeshPhysicalMaterial built from the source surface (PBR + sheen/clearcoat). */
export function makePhysical(source, options = {}) {
  const material = new THREE.MeshPhysicalMaterial(baseParams(source, options));
  inheritSurface(material, source, { copyColor: options.tint === undefined });
  material.roughness = options.roughness ?? 0.6;
  material.metalness = options.metalness ?? 0;
  material.ior = options.ior ?? 1.45;
  material.clearcoat = options.clearcoat ?? 0;
  material.clearcoatRoughness = options.clearcoatRoughness ?? 0.4;
  material.sheen = options.sheen ?? 0;
  if (options.sheenColor !== undefined)
    material.sheenColor.set(options.sheenColor);
  material.sheenRoughness = options.sheenRoughness ?? 0.6;
  material.specularIntensity = options.specularIntensity ?? 1;
  if (source.emissive?.isColor) material.emissive.copy(source.emissive);
  if (options.emissive !== undefined) material.emissive.set(options.emissive);
  material.emissiveIntensity =
    options.emissiveIntensity ?? source.emissiveIntensity ?? 1;
  if (options.envMap) {
    material.envMap = options.envMap;
    material.envMapIntensity = options.envMapIntensity ?? 1;
  }
  if (options.opacity !== undefined) material.opacity = options.opacity;
  if (options.transparent) material.transparent = true;
  material.needsUpdate = true;
  return material;
}

/* ------------------------------- toon ramps ------------------------------ */

const gradientCache = new Map();

/** N-step toon ramp shared between presets with the same step count. */
export function toonGradient(steps = 3, low = 120) {
  const key = `${steps}:${low}`;
  const cached = gradientCache.get(key);
  if (cached) return cached;
  const data = new Uint8Array(steps);
  for (let index = 0; index < steps; index += 1)
    data[index] = Math.round(
      THREE.MathUtils.lerp(low, 255, index / (steps - 1)),
    );
  const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  gradientCache.set(key, texture);
  return texture;
}

/** MeshToonMaterial with an optional tint shift. */
export function makeToon(source, options = {}) {
  const material = new THREE.MeshToonMaterial(baseParams(source, options));
  inheritSurface(material, source, { copyColor: options.tint === undefined });
  material.gradientMap = toonGradient(options.steps ?? 3, options.low ?? 120);
  if (options.emissive !== undefined) {
    material.emissive = new THREE.Color(options.emissive);
    material.emissiveIntensity = options.emissiveIntensity ?? 1;
  } else if (source.emissive?.isColor) {
    material.emissive.copy(source.emissive);
  }
  if (options.opacity !== undefined) material.opacity = options.opacity;
  if (options.transparent) material.transparent = true;
  material.needsUpdate = true;
  return material;
}

/** Unlit material: flat colour + texture. */
export function makeUnlit(source, options = {}) {
  const material = new THREE.MeshBasicMaterial(baseParams(source, options));
  inheritSurface(material, source, { copyColor: options.tint === undefined });
  material.toneMapped = false;
  if (options.opacity !== undefined) material.opacity = options.opacity;
  if (options.transparent) material.transparent = true;
  material.needsUpdate = true;
  return material;
}
