/**
 * Generic entry collector (/src/engine/shl/collect.js)
 *
 * Тонкая прослойка между «любым Object3D» и движком: движок работает не со
 * сценой, а со списком записей `{ mesh, index, material, target }`. Собрать
 * такой список можно одной строкой в любом проекте:
 *
 *   const entries = collectShaderEntries(scene, {
 *     resolveTarget: (mesh) => (mesh.name.startsWith("Hair") ? "hair" : "character"),
 *   });
 *   shaderEngine.apply(entries);
 *
 * Важная деталь: `material` в записи — материал *модели*, а не тот, что сейчас
 * висит на меше. Для этого у каждого меша запоминается исходный набор (`#base`)
 * при первом визите; после подмены пресетом живой массив содержит уже собранный
 * материал, и строить следующий пресет поверх него нельзя — иначе пресеты
 * «слипаются».
 */

const baseMaterials = new WeakMap();

/** Исходные материалы меша в исходном порядке. */
export function baseMaterialsOf(mesh) {
  if (!mesh) return [];
  const cached = baseMaterials.get(mesh);
  if (cached) {
    // Хост мог пересобрать массив материалов целиком (перезагрузка модели,
    // повторная покраска). Тогда снимок устарел, и его надо обновить, иначе
    // движок будет строить пресеты поверх уже отброшенного материала.
    const live = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const sameShape = live.length === cached.length;
    const untouched =
      sameShape &&
      live.every(
        (material, index) =>
          material === cached[index] ||
          material?.userData?.shaderPreset !== undefined ||
          material?.userData?.shlDerived !== undefined,
      );
    if (untouched) return cached;
  }
  const snapshot = Array.isArray(mesh.material) ? [...mesh.material] : [mesh.material];
  baseMaterials.set(mesh, snapshot);
  return snapshot;
}

/** Забыть снимок конкретного меша (например, после подмены материала хостом). */
export function resetBaseMaterials(mesh) {
  if (mesh) baseMaterials.delete(mesh);
}

function meshMaterials(mesh) {
  return Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
}

/**
 * Собирает записи для движка.
 *
 * @param {object} root                    Object3D-корень (сцена или модель).
 * @param {object} [options]
 * @param {Function} [options.resolveTarget] `(mesh, material, index) => string`
 *        — какая часть тела это; по умолчанию «character».
 * @param {Function} [options.skip]        `(mesh, material, index) => boolean`.
 * @param {boolean} [options.includeInvisible] Собирать и скрытые меши.
 * @param {string} [options.defaultTarget]
 * @returns {Array<{mesh, index, material, target}>}
 */
export function collectShaderEntries(
  root,
  {
    resolveTarget = null,
    skip = null,
    includeInvisible = false,
    defaultTarget = "character",
  } = {},
) {
  if (!root?.traverse) return [];
  const entries = [];
  const seen = new Set();
  root.traverse((mesh) => {
    if (!mesh?.isMesh && !mesh?.isSkinnedMesh && !mesh?.isInstancedMesh) return;
    // Generated stencil masks and outline shells are not source materials.
    // In particular, keeping outline children out of the SHL collector lets
    // hosts safely compose the legacy engine with attachSurfaceOutlines().
    if (mesh.userData?.isOcclusionGhost || mesh.userData?.prismiaOutline) return;
    if (!includeInvisible && mesh.visible === false) return;
    const base = baseMaterialsOf(mesh);
    base.forEach((material, index) => {
      if (!material) return;
      if (skip?.(mesh, material, index)) return;
      const key = `${mesh.uuid}:${index}`;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({
        mesh,
        index,
        material,
        target: resolveTarget?.(mesh, material, index) ?? defaultTarget,
      });
    });
  });
  return entries;
}

/**
 * Живой материал слота — то, что сейчас реально нарисовано.
 * Нужен диагностике и тестам; движок в работе опирается на снимок выше.
 */
export function liveMaterial(mesh, index = 0) {
  const materials = meshMaterials(mesh);
  return Array.isArray(mesh?.material) ? materials[index] : mesh?.material;
}
