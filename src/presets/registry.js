/**
 * Preset registry (/src/engine/shl/registry.js)
 *
 * Хранилище пресетов — единственное, что нужно движку, чтобы знать, *чем*
 * рисовать поверхность. Оно ничего не знает ни про Three.js-сцену, ни про
 * панели: пресет — это данные (`id/label/description/group/order`) плюс фабрика
 * `build(source, ctx)`.
 *
 * Реестр можно создать с нуля в любом проекте:
 *
 *   const registry = createShaderRegistry({
 *     groups: [{ id: "base", label: "Базовые", order: 1 }],
 *     presets: [{ id: "flat", label: "Плоский", group: "base", build: (src) => … }],
 *   });
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

/** Приводит описание пресета к внутреннему виду (или падает с понятной ошибкой). */
export function normalisePreset(preset, fallbackOrder = 1) {
  const id = String(preset?.id ?? "").trim();
  if (!ID_PATTERN.test(id))
    throw new TypeError(`shader: некорректный id «${id}»`);
  return {
    id,
    label: String(preset.label ?? id),
    description: String(preset.description ?? ""),
    group: String(preset.group ?? "material"),
    // `targets` необязателен: пресет может быть доступен только части частей
    // тела (например, только волосам).
    targets: Array.isArray(preset.targets) ? [...preset.targets] : null,
    order: Number.isFinite(preset.order) ? preset.order : fallbackOrder,
    build:
      typeof preset.build === "function" ? preset.build : () => null,
  };
}

/** Группа пресетов: id + подпись для интерфейса. */
export function normaliseGroup(group, fallbackOrder = 1) {
  const id = String(group?.id ?? "").trim();
  if (!ID_PATTERN.test(id)) throw new TypeError(`shader: некорректная группа «${id}»`);
  return {
    id,
    label: String(group.label ?? id),
    hint: String(group.hint ?? ""),
    order: Number.isFinite(group.order) ? group.order : fallbackOrder,
  };
}

export class ShaderRegistry {
  #presets = new Map();
  #groups = new Map();
  #listeners = new Set();
  #defaultId = null;

  constructor({ presets = [], groups = [], defaultId = null } = {}) {
    groups.forEach((group, position) =>
      this.addGroup(group, { silent: true, order: position + 1 }),
    );
    presets.forEach((preset, position) =>
      this.register(preset, { silent: true, order: position + 1 }),
    );
    this.#defaultId = defaultId;
  }

  /** Все зарегистрированные id в порядке добавления (для валидации выбора). */
  get ids() {
    return [...this.#presets.keys()];
  }

  get size() {
    return this.#presets.size;
  }

  has(id) {
    return this.#presets.has(String(id ?? ""));
  }

  /** Пресет по id; без id — «нейтральный» пресет движка. */
  get(id) {
    const key = String(id ?? "");
    return (
      this.#presets.get(key) ??
      (this.#defaultId ? this.#presets.get(this.#defaultId) : undefined) ??
      undefined
    );
  }

  /**
   * Пресет, который возвращает материал модели без изменений. Он должен быть
   * зарегистрирован под `defaultId` (по умолчанию первый добавленный).
   */
  get defaultPreset() {
    return this.#presets.get(this.#defaultId) ?? this.#presets.values().next().value;
  }

  get defaultId() {
    return this.defaultPreset?.id ?? null;
  }

  setDefault(id) {
    if (!this.#presets.has(String(id ?? ""))) return false;
    this.#defaultId = String(id);
    return true;
  }

  addGroup(group, { replace = false, silent = false, order } = {}) {
    const entry = normaliseGroup(
      { ...group, order: order ?? group?.order },
      this.#groups.size + 1,
    );
    if (this.#groups.has(entry.id) && !replace) return this.#groups.get(entry.id);
    this.#groups.set(entry.id, entry);
    if (!silent) this.#emit({ type: "group", group: entry });
    return entry;
  }

  register(preset, { replace = false, silent = false, order } = {}) {
    const entry = normalisePreset(
      { ...preset, order: order ?? preset?.order },
      this.#presets.size + 1,
    );
    if (this.#presets.has(entry.id) && !replace) return this.#presets.get(entry.id);
    this.#presets.set(entry.id, entry);
    if (this.#defaultId === null) this.#defaultId = entry.id;
    if (!silent) this.#emit({ type: "preset", preset: entry });
    return entry;
  }

  unregister(id) {
    const key = String(id ?? "");
    if (!this.#presets.delete(key)) return false;
    if (this.#defaultId === key) this.#defaultId = this.#presets.keys().next().value ?? null;
    this.#emit({ type: "removed", id: key });
    return true;
  }

  /** Пресеты в порядке `order`, затем по id. */
  list({ target = null } = {}) {
    return [...this.#presets.values()]
      .filter(
        (preset) =>
          !target || !preset.targets || preset.targets.includes(String(target)),
      )
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  /** Пресеты, сгруппированные для интерфейса; пустые группы выброшены. */
  grouped({ target = null } = {}) {
    const presets = this.list({ target });
    const groups = [...this.#groups.values()]
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map((group) => ({
        ...group,
        presets: presets.filter((preset) => preset.group === group.id),
      }))
      .filter((group) => group.presets.length);
    // Пресеты без объявленной группы не должны теряться в интерфейсе.
    const loose = presets.filter(
      (preset) => !this.#groups.has(preset.group),
    );
    if (loose.length)
      groups.push({ id: "other", label: "Прочее", hint: "", order: 99, presets: loose });
    return groups;
  }

  /** Подписка на изменения реестра (полезно интерфейсу). */
  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(event) {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        /* подписчик не должен ломать реестр */
      }
    }
  }
}

export function createShaderRegistry(options = {}) {
  return new ShaderRegistry(options);
}
