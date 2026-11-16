/**
 * Neutral IBL for the physically based presets (/src/engine/shl/environment.js)
 *
 * Карта окружения — часть механики движка, а не конкретного пресета: её просят
 * `pbr`, `skin`, `cinematic*`, и строить её на каждый материал нельзя. Кеш
 * держится по рендереру: два проекта с разными рендерерами не должны получить
 * чужую карту, а после `renderer.dispose()` кеш пригоден для нового.
 *
 * Библиотека самодостаточна: никаких примеров из `three/addons`, только self
 * module three и процедурная равноугольная карта (DataTexture → PMREM). Если у
 * проекта-хозяина есть свой студийный IBL (у студии — карта из `scene/stage.js`),
 * он подставляется через `setEnvironmentProvider` и тогда используется он:
 * движок не навязывает чужой проект вид поверхности.
 */
import * as THREE from "three";

let provider = null;
const cache = new WeakMap();
let fallback = null;

/**
 * Хостовой источник карты окружения.
 *
 * @param {(renderer: object) => THREE.Texture|null|undefined} fn
 *        `undefined` — «движок решает сам», `null` — «окружения нет».
 */
export function setEnvironmentProvider(fn) {
  provider = typeof fn === "function" ? fn : null;
  fallback = null;
}

/** Мягкие источники света процедурной студии: `[u, v, радиус, яркость]`. */
const SOFTBOXES = [
  [0.14, 0.66, 0.16, 0.42],
  [0.38, 0.74, 0.1, 0.3],
  [0.66, 0.64, 0.18, 0.38],
  [0.88, 0.7, 0.08, 0.26],
];

/**
 * Равноугольная карта «фотометрической студии»: градиент фона и несколько
 * мягких пятен над горизонтом. Данные, а не DOM: канвас здесь не нужен.
 */
function proceduralEquirect() {
  const width = 256;
  const height = 128;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    // v = 0 — нижняя полусфера (пол), v = 1 — зенит.
    const v = y / (height - 1);
    const base = 0.14 + 0.5 * Math.pow(1 - Math.min(1, Math.abs(v - 0.62) / 0.62), 1.6);
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      let glow = 0;
      for (const [cx, cy, radius, strength] of SOFTBOXES) {
        let dx = Math.abs(u - cx);
        if (dx > 0.5) dx = 1 - dx;
        const distance = Math.hypot(dx * 2.6, v - cy);
        if (distance < radius) glow += strength * (1 - distance / radius) ** 2;
      }
      const value = Math.min(1, base + glow);
      const index = (y * width + x) * 4;
      data[index] = Math.round(value * 255);
      data[index + 1] = Math.round(value * 252);
      data[index + 2] = Math.round(value * 248);
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * @param {object} renderer WebGLRenderer проекта-хозяина.
 * @returns {THREE.Texture|null} карта окружения либо null, если собрать не удалось.
 */
export function neutralEnvironment(renderer) {
  if (provider) {
    try {
      const provided = provider(renderer);
      if (provided !== undefined) return provided;
    } catch (error) {
      console.warn("shl: провайдер окружения упал — беру процедурную карту", error);
    }
  }
  if (!renderer) return fallback;
  if (cache.has(renderer)) return cache.get(renderer);
  let texture = null;
  let source = null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    source = proceduralEquirect();
    texture = pmrem.fromEquirectangular(source).texture;
    pmrem.dispose();
  } catch (error) {
    console.warn("Не удалось создать IBL для шейдеров:", error);
    texture = null;
  } finally {
    source?.dispose?.();
  }
  cache.set(renderer, texture);
  if (texture) fallback = texture;
  return texture;
}

/** Освободить окружение (при выходе из приложения или смене рендерера). */
export function disposeEnvironment(renderer) {
  if (renderer && cache.has(renderer)) {
    const texture = cache.get(renderer);
    texture?.dispose?.();
    cache.delete(renderer);
    if (fallback === texture) fallback = null;
    return true;
  }
  fallback?.dispose?.();
  fallback = null;
  return true;
}
