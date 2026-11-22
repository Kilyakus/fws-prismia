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
} from "./engine/prismia/core/prismia-engine.js";

export {
  ShaderRegistry,
  createShaderRegistry,
  normaliseGroup,
  normalisePreset,
} from "./engine/prismia/presets/registry.js";

export {
  baseMaterialsOf,
  collectShaderEntries,
  liveMaterial,
  resetBaseMaterials,
} from "./engine/prismia/materials/collect.js";

export { SIGNATURE_MAPS, materialSignature } from "./engine/prismia/materials/signature.js";

export {
  disposeEnvironment,
  neutralEnvironment,
  setEnvironmentProvider,
} from "./engine/prismia/environment/environment.js";

// Prismia exposes its material engine and the shared preset catalog.
export { BUILT_IN_SHADER_PRESETS, SHADER_GROUPS, createPrismiaRegistry } from "./engine/prismia/presets/index.js";
export { DirectionalShadowVolume, LOOK_PROFILES, createLookMixer } from "./engine/prismia/lighting/index.js";
// Standard composable surface toolkit.
export {SURFACE_SCHEMA,SURFACE_DEFAULTS,SURFACE_PRESETS,listSurfacePresets,createSurfacePreset,validateSurface,createSurfaceMaterial,attachSurfaceOutlines} from './engine/prismia/materials/surface.js';
export {MATERIAL_PRESETS,listMaterialPresets,createMaterialPreset} from './engine/prismia/materials/material-presets.js';
export const PRISMIA_VERSION = "1.0.0";

/** Browser hosts explicitly opt into the Studio; pure engine imports remain DOM-free. */
export async function bootPrismiaStudio(options = {}) {
  const {createPrismiaStudio} = await import('../studio/studio.js');
  return createPrismiaStudio(options);
}

// Source-material building blocks are also usable without a registry.
export {createSourcePbr, createSourceToon, createSourceUnlit} from './engine/prismia/presets/_lib/source-styles.js';
