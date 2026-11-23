/** Browser-only studio entry point; styles are separate in an integrating host. */
export async function createPrismiaStudio(options){return (await import('../src/studio/studio.js')).createPrismiaStudio(options)}
/** Scope passports, composition, state and exchange for embedding in a host. */
export {PRISMIA_SCOPE_DEFINITIONS,passports} from '../src/studio/scopes/passports.js';
export {PRISMIA_ENGINES,createPrismiaComposition,bindPrismiaComposition} from '../src/app/registry.js';
export {createScopeExchange} from '../src/app/scope-exchange.js';
export {createViewState,createRenderState} from '../src/app/state.js';
export {createGraphStore} from '../src/app/engine/prismia/graph/document.js';
