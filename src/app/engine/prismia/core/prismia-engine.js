/**
 * Prismia material engine
 *
 * Механика подмены материалов: какой пресет выбран для части модели, какой
 * материал сейчас нарисован, когда его пересобрать и как вернуть исходный.
 * Движок не знает ни одной конкретной модели: ему отдают рендерер, реестр
 * пресетов и список записей `{ mesh, index, material, target }`.
 *
 * ── Главный инвариант («пресеты не слипаются») ──────────────────────────────
 *
 * 1. Каждый пресет всегда собирается из материала МОДЕЛИ (`source`), а не из
 *    того, что сейчас висит на меше. Поэтому пресет, который настраивает
 *    только материал (шероховатость, металличность), и пресет, который
 *    настраивает только текстуры, не наследуют друг друга: после переключения
 *    получается ровно то, что этот пресет строит с чистого листа.
 * 2. Собранный материал помечается `userData.shaderPreset` и `userData.prismiaDerived`, и если хост по ошибке
 *    передаст в движок уже собранный материал, он будет отвергнут как источник
 *    (с предупреждением) — источник берётся из таблицы привязок.
 * 3. При смене пресета предыдущий материал возвращается к исходному и
 *    освобождается (`dispose`), поэтому на меше никогда не остаётся смесь двух
 *    пресетов.
 */

import { materialSignature } from "../materials/signature.js";
import { neutralEnvironment } from "../environment/environment.js";
import { collectShaderEntries } from "../materials/collect.js";

const DEFAULT_PRESET = "original";

/** Пометка «этот материал собран движком», а не пришёл из модели. */
export function markDerived(material, { presetId, source, target }) {
  material.userData = {
    ...(material.userData ?? {}),
    shaderPreset: presetId,
    prismiaDerived: {
      presetId,
      target: target ?? null,
      sourceUuid: source?.uuid ?? null,
    },
  };
  return material;
}

/** Материал собран движком? */
export function isDerivedMaterial(material) {
  return Boolean(
    material?.userData?.shaderPreset !== undefined || material?.userData?.prismiaDerived,
  );
}

function slotKey(mesh, index) {
  return `${mesh.uuid}:${index}`;
}

function assignMaterial(mesh, index, material) {
  if (Array.isArray(mesh.material)) {
    mesh.material[index] = material;
    return;
  }
  mesh.material = material;
}

function liveMaterialOf(mesh, index) {
  return Array.isArray(mesh?.material) ? mesh.material[index] : mesh?.material;
}

function disposeMaterial(material) {
  // Текстуры освобождать нельзя: они принадлежат модели и переживают пресет.
  material?.dispose?.();
}

export class ShaderEngine {
  #registry;
  #bindings = new Map();
  #listeners = new Map();
  #selection = new Map();
  #defaults = new Map();
  #targets;
  #renderer = null;
  #envMap = null;

  /**
   * @param {object} options
   * @param {object} options.registry        реестр пресетов (см. registry.js)
   * @param {Array}  [options.targets]       части модели: строка или `{ id, label }`
   * @param {object} [options.defaults]      `{ target: presetId }` по умолчанию
   * @param {object} [options.selection]     начальный выбор (перекрывает defaults)
   * @param {object} [options.renderer]      WebGLRenderer для IBL пресетов
   * @param {string} [options.defaultPreset] пресет «как в модели»
   */
  constructor({
    registry,
    targets = null,
    defaults = {},
    selection = {},
    renderer = null,
    defaultPreset = DEFAULT_PRESET,
  } = {}) {
    if (!registry?.get) throw new TypeError("Prismia: нужен реестр пресетов");
    this.#registry = registry;
    this.#renderer = renderer;
    this.#targets = normaliseTargets(targets ?? deriveTargets(registry));
    for (const target of this.#targets)
      this.#defaults.set(target.id, String(defaults[target.id] ?? defaultPreset));
    for (const target of this.#targets)
      this.#selection.set(target.id, this.#defaults.get(target.id));
    this.restoreState(selection);
  }

  /* ------------------------------- описание ------------------------------- */

  get registry() {
    return this.#registry;
  }

  /** Все пресеты в порядке показа (массив, как у плагина шейдеров). */
  get presets() {
    return this.#registry.list();
  }

  /** Пресеты, доступные конкретной части модели. */
  presetsFor(target) {
    return this.#registry.list({ target });
  }

  /** Пресеты, сгруппированные для интерфейса. */
  groupedPresets(target = null) {
    return this.#registry.grouped({ target });
  }

  /** Части модели, которыми можно управлять независимо. */
  get targets() {
    return this.#targets.map((target) => ({ ...target }));
  }

  get targetIds() {
    return this.#targets.map((target) => target.id);
  }

  /* ------------------------------- состояние ------------------------------ */

  /** Выбранный пресет части модели. Неизвестная часть — «как в модели». */
  getSelection(target) {
    return this.#selection.get(String(target)) ?? this.#defaults.get(String(target)) ?? DEFAULT_PRESET;
  }

  /** Значение по умолчанию для части модели (нужно кнопке «сбросить»). */
  getDefaultSelection(target) {
    return this.#defaults.get(String(target)) ?? DEFAULT_PRESET;
  }

  /**
   * Выбрать пресет. Возвращает `true`, если выбор принят (даже когда пресет тот
   * же самый: интерфейс может переспросить, и это не ошибка).
   * Материалы при этом не пересобираются — это делает `apply()`.
   */
  setSelection(target, presetId) {
    const key = String(target);
    if (!this.#selection.has(key) && !this.#defaults.has(key)) return false;
    const id = String(presetId);
    if (!this.#registry.has(id)) return false;
    const preset = this.#registry.get(id);
    if (preset?.targets && !preset.targets.includes(key)) return false;
    if (this.getSelection(key) === id) return true;
    this.#selection.set(key, id);
    this.#emit("select", { target: key, presetId: id });
    return true;
  }

  /** Выбор целиком — то, что сохраняется в состоянии проекта. */
  getState() {
    return Object.fromEntries(this.#selection);
  }

  /** Восстановление выбора; неизвестные id и части игнорируются. */
  restoreState(saved = {}) {
    let changed = false;
    for (const target of this.targetIds) {
      const id = saved?.[target];
      if (typeof id !== "string" || !this.#registry.has(id)) continue;
      const preset = this.#registry.get(id);
      if (preset?.targets && !preset.targets.includes(target)) continue;
      if (this.#selection.get(target) === id) continue;
      this.#selection.set(target, id);
      changed = true;
    }
    if (changed) this.#emit("restore", this.getState());
    return changed;
  }

  /** Сброс выбора к значениям по умолчанию. */
  resetSelection() {
    for (const target of this.targetIds)
      this.#selection.set(target, this.#defaults.get(target) ?? DEFAULT_PRESET);
    this.#emit("restore", this.getState());
  }

  /* -------------------------------- движок -------------------------------- */

  setRenderer(renderer) {
    this.#renderer = renderer ?? this.#renderer;
    // Новая карта окружения появится при следующей сборке материалов.
    this.#envMap = null;
  }

  get renderer() {
    return this.#renderer;
  }

  /** Сколько слотов сейчас нарисовано пресетами (для статуса интерфейса). */
  get convertedCount() {
    return this.#bindings.size;
  }

  /**
   * Подменить материалы по списку записей.
   *
   * @param {Array<{mesh, index?, material, target}>} entries
   * @param {object} [options]
   * @param {boolean} [options.force] пересобрать даже если ничего не изменилось
   * @returns {{converted: number, targets: string[]}}
   */
  apply(entries = [], { force = false } = {}) {
    const alive = new Set();
    const targets = new Set();
    let converted = 0;
    const envMap = neutralEnvironment(this.#renderer);

    for (const entry of entries) {
      const mesh = entry?.mesh;
      if (!mesh) continue;
      const index = entry.index ?? 0;
      const key = slotKey(mesh, index);
      alive.add(key);
      const target = String(entry.target ?? this.targetIds[0] ?? "character");
      const binding = this.#bindings.get(key);
      const desired = this.getSelection(target);

      // Источник — материал модели. Уже собранный материал источником быть не
      // может: иначе новый пресет лёг бы поверх старого (то самое «слипание»).
      const source = this.#resolveSource(entry, binding);
      if (!source) continue;

      if (desired === this.#neutralPresetId()) {
        if (binding) {
          this.#restore(binding);
          this.#bindings.delete(key);
        }
        continue;
      }

      const signature = materialSignature(source);
      const reusable =
        !force &&
        binding &&
        binding.source === source &&
        binding.presetId === desired &&
        binding.signature === signature &&
        binding.material?.userData?.prismiaDerived?.presetId === desired;

      if (reusable) {
        assignMaterial(mesh, index, binding.material);
        binding.mesh = mesh;
        targets.add(target);
        converted += 1;
        continue;
      }

      if (binding) {
        this.#restore(binding);
        this.#bindings.delete(key);
      }

      const built = this.#build(desired, source, target, envMap, entry);
      if (!built) continue;
      assignMaterial(mesh, index, built);
      this.#bindings.set(key, {
        mesh,
        index,
        target,
        source,
        material: built,
        presetId: desired,
        signature,
      });
      targets.add(target);
      converted += 1;
    }

    // Меши, которых больше нет в сцене (смена персонажа, скрытые волосы),
    // возвращаются к своим материалам.
    for (const [key, binding] of [...this.#bindings]) {
      if (alive.has(key)) continue;
      this.#restore(binding);
      this.#bindings.delete(key);
    }

    this.#emit("apply", { converted, targets: [...targets] });
    return { converted, targets: [...targets] };
  }

  /**
   * Собрать записи из произвольного Object3D и применить их — самая короткая
   * интеграция в чужой проект:
   *
   *   engine.applyToObject(scene, { resolveTarget: (mesh) => mesh.userData.part });
   */
  applyToObject(root, { force = false, ...collectOptions } = {}) {
    return this.apply(collectShaderEntries(root, collectOptions), { force });
  }

  /** Advance time-dependent surface uniforms without rebuilding shader programs.
   * Pass elapsed seconds, not a frame delta. Presets without animation ignore it. */
  update(timeSeconds) {
    if (!Number.isFinite(timeSeconds)) return;
    for (const { material } of this.#bindings.values()) {
      const time = material?.userData?.prismUniforms?.prismTime;
      if (time) time.value = timeSeconds;
    }
  }

  /** Вернуть все исходные материалы и забыть привязки. */
  reset() {
    for (const [key, binding] of [...this.#bindings]) {
      this.#restore(binding);
      this.#bindings.delete(key);
    }
    this.#emit("reset", {});
  }

  dispose() {
    this.reset();
    this.#listeners.clear();
  }

  /**
   * Отпечаток нарисованного состояния: тип, пресет, цвет и карты каждого слота.
   * Нужен тестам и диагностике — «пресеты не слипаются» проверяется сравнением
   * отпечатков после разных порядков переключения.
   */
  fingerprint(target = null) {
    const rows = [];
    for (const [key, binding] of this.#bindings) {
      if (target && binding.target !== String(target)) continue;
      const material = liveMaterialOf(binding.mesh, binding.index) ?? binding.material;
      rows.push(
        [
          key,
          binding.target,
          binding.presetId,
          material?.type ?? "-",
          material?.color?.getHexString?.() ?? "-",
          material?.map?.uuid ?? "-",
          material?.roughness ?? "-",
          material?.metalness ?? "-",
          material?.emissive?.getHexString?.() ?? "-",
          material?.transparent ? 1 : 0,
          material?.opacity ?? "-",
        ].join("|"),
      );
    }
    return rows.sort().join("\n");
  }

  /* ------------------------------- события -------------------------------- */

  /** `on("select"|"apply"|"reset"|"restore", listener)` */
  on(type, listener) {
    if (typeof listener !== "function") return () => {};
    const key = String(type);
    if (!this.#listeners.has(key)) this.#listeners.set(key, new Set());
    this.#listeners.get(key).add(listener);
    return () => this.#listeners.get(key)?.delete(listener);
  }

  /* ------------------------------ внутреннее ------------------------------ */

  #neutralPresetId() {
    return this.#registry.defaultId ?? DEFAULT_PRESET;
  }

  /**
   * Материал-источник для записи.
   *
   * Хост обязан отдавать материал модели, но движок страховает себя: если
   * пришёл уже собранный материал, берётся исходный из привязки, а если
   * привязки нет — материал считается исходным (первый визит слота).
   */
  #resolveSource(entry, binding) {
    const material = entry.material;
    if (!material) return null;
    if (!isDerivedMaterial(material)) return material;
    if (binding?.source) return binding.source;
    console.warn(
      "Prismia: в записи пришёл уже собранный материал — использую его как исходный",
      material.name,
    );
    return material;
  }

  #build(presetId, source, target, envMap, entry) {
    const preset = this.#registry.get(presetId);
    if (!preset?.build) return null;
    let built = null;
    try {
      built = preset.build(source, {
        target,
        envMap,
        renderer: this.#renderer,
        engine: this,
        mesh: entry.mesh,
        index: entry.index ?? 0,
      });
    } catch (error) {
      console.error(`Prismia: пресет «${presetId}» упал при сборке`, error);
      return null;
    }
    if (!built) return null;
    return markDerived(built, { presetId, source, target });
  }

  #restore(binding) {
    // Возвращаем материал модели ровно на тот слот, с которого его сняли.
    assignMaterial(binding.mesh, binding.index, binding.source);
    if (binding.material !== binding.source) disposeMaterial(binding.material);
  }

  #emit(type, payload) {
    for (const listener of this.#listeners.get(type) ?? []) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`Prismia: подписчик «${type}» упал`, error);
      }
    }
  }
}

function normaliseTargets(targets) {
  const list = (Array.isArray(targets) ? targets : [])
    .map((target, position) => {
      if (typeof target === "string")
        return { id: target, label: target, hint: "", order: position + 1 };
      const id = String(target?.id ?? "").trim();
      if (!id) return null;
      return {
        id,
        label: String(target.label ?? id),
        hint: String(target.hint ?? ""),
        order: Number.isFinite(target.order) ? target.order : position + 1,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
  return list.length ? list : [{ id: "character", label: "character", hint: "", order: 1 }];
}

/**
 * Если части модели не заданы явно, движок выводит их из пресетов: у пресета
 * может быть список `targets`, иначе используется «character» и всё, что
 * встретится в записях.
 */
function deriveTargets(registry) {
  const ids = new Set();
  for (const preset of registry.list()) for (const id of preset.targets ?? []) ids.add(id);
  if (!ids.size) ids.add("character");
  return [...ids].map((id, position) => ({ id, order: position + 1 }));
}

export function createShaderEngine(options) {
  return new ShaderEngine(options);
}
