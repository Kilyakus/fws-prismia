import { createShaderRegistry } from "./registry.js";
import original from "./presets/original.js";
import pbr from "./presets/pbr.js";
import toon from "./presets/toon.js";
import unlit from "./presets/unlit.js";
import toon10 from "./presets/toon10.js";
import toon93 from "./presets/toon93.js";
import world from "./presets/world.js";
import skin from "./presets/skin.js";
import clay from "./presets/clay.js";
import tactical from "./presets/tactical.js";
import cyber from "./presets/cyber.js";
import glitter from "./presets/glitter.js";
import emission from "./presets/emission.js";
import hologram from "./presets/hologram.js";
import cinematic from "./presets/cinematic.js";
import cinematicSkin from "./presets/cinematic-skin.js";
import cinematicFabric from "./presets/cinematic-fabric.js";
import wetAsphalt from "./presets/wet-asphalt.js";
import sunriseGround from "./presets/sunrise-ground.js";
import clearcoatPaint from "./presets/clearcoat-paint.js";

export const BUILT_IN_SHADER_PRESETS = [
  original,
  pbr,
  toon,
  unlit,
  toon10,
  toon93,
  world,
  skin,
  clay,
  tactical,
  cyber,
  glitter,
  emission,
  hologram,
  cinematic,
  cinematicSkin,
  cinematicFabric,
  wetAsphalt,
  sunriseGround,
  clearcoatPaint,
];

/** UI groups: label + helper text for the select. */
export const SHADER_GROUPS = [
  { id: "base", label: "Базовые", hint: "Исходные материалы модели и простые схемы", order: 1 },
  { id: "toon", label: "Toon-шейдеры", hint: "Градации теней как в anime-рендере", order: 2 },
  { id: "material", label: "Материалы", hint: "Физические и стилизованные поверхности", order: 3 },
  { id: "cinematic", label: "Кинематограф", hint: "MeshPhysicalMaterial с нейтральным IBL", order: 4 },
  { id: "world", label: "Мир / Prismia", hint: "Поверхности в мировых координатах", order: 5 },
];


/** Fresh registry for each independent host or studio. */
export function createPrismiaRegistry() {
  return createShaderRegistry({ groups: SHADER_GROUPS, presets: BUILT_IN_SHADER_PRESETS, defaultId: "original" });
}
