/**
 * FWS Prismia public WebGL API. Material mechanics, registry, catalog,
 * directional shadow volume and light looks have no dependency on Morphia UI.
 * See README.md for integration and ownership details.
 */

export {
  ShaderEngine,
  createShaderEngine,
  isDerivedMaterial,
  markDerived,
} from "./core/prismia-engine.js";

export {
  ShaderRegistry,
  createShaderRegistry,
  normaliseGroup,
  normalisePreset,
} from "./presets/registry.js";

export {
  baseMaterialsOf,
  collectShaderEntries,
  liveMaterial,
  resetBaseMaterials,
} from "./materials/collect.js";

export { SIGNATURE_MAPS, materialSignature } from "./materials/signature.js";

export {
  disposeEnvironment,
  neutralEnvironment,
  setEnvironmentProvider,
} from "./environment/environment.js";

// Prismia exposes its material engine and the shared preset catalog.
export { BUILT_IN_SHADER_PRESETS, SHADER_GROUPS, createPrismiaRegistry } from "./presets/index.js";
export { DirectionalShadowVolume, LOOK_PROFILES, createLookMixer } from "./lighting/index.js";
// Standard composable surface toolkit.
export {SURFACE_SCHEMA,SURFACE_DEFAULTS,SURFACE_PRESETS,listSurfacePresets,createSurfacePreset,validateSurface,createSurfaceMaterial,attachSurfaceOutlines} from './materials/surface.js';
export {MATERIAL_PRESETS,listMaterialPresets,createMaterialPreset} from './materials/material-presets.js';
export const PRISMIA_VERSION = "1.0.0";
