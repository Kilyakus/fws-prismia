/** Host API: projects and node definitions are DOM-independent; WebGL requires Three. */
export {NODE_TYPES,NODE_CATEGORIES,OUTPUT_USAGES,OUTPUT_LABELS,nodeDefaults,outputUsage} from '../src/app/engine/prismia/graph/nodes.js';
export {PROJECT_FORMAT,PROJECT_VERSION,createEmptyProject,validateProject,topologicalNodes,createGraphStore} from '../src/app/engine/prismia/graph/document.js';
export {MATERIAL_EXAMPLES,createExample} from '../src/app/engine/prismia/graph/examples.js';
export {MATERIAL_PRESETS,listMaterialPresets,createMaterialPreset} from '../src/app/engine/prismia/materials/material-presets.js';
export {SURFACE_SCHEMA,SURFACE_DEFAULTS,SURFACE_PRESETS,listSurfacePresets,createSurfacePreset,validateSurface,createSurfaceMaterial,attachSurfaceOutlines} from '../src/app/engine/prismia/materials/surface.js';
export {compileNodeFragment,validateNodeFragment} from '../src/app/engine/prismia/graph/compiler.js';
export {GraphEvaluator,pixelsToCanvas,createOutputTextures,createGraphMaterial} from '../src/app/engine/prismia/graph/webgl.js';
