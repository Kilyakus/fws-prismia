import {createScopeRegistry,registerScopeDefinitions,registerContributions,loadEnginePlugins,bindScopeImplementations} from 'framework-preparatorio';
import {passports} from '../studio/scopes/passports.js';
const loaders={
 library:()=>import('../studio/scopes/library/index.js'),viewport:()=>import('../studio/scopes/viewport/index.js'),preview:()=>import('../studio/scopes/preview/index.js'),
 graph:()=>import('../studio/scopes/graph/index.js'),code:()=>import('../studio/scopes/code/index.js'),properties:()=>import('../studio/scopes/properties/index.js'),
 outputs:()=>import('../studio/scopes/outputs/index.js'),material:()=>import('../studio/scopes/material/index.js'),lighting:()=>import('../studio/scopes/lighting/index.js'),scene:()=>import('../studio/scopes/scene/index.js'),
};
export const PRISMIA_ENGINES=Object.freeze(Object.entries(passports).map(([key,passport])=>Object.freeze({id:passport.id,title:passport.label,kind:'scope',plugins:Object.freeze({scopeDefinitions:Object.freeze([passport]),loaders:Object.freeze([])}),load:loaders[key]})));
// A built-in area is hidden unless this application explicitly enables it.
export const PRISMIA_BUILT_IN_SCOPES=Object.freeze({viewport3d:Object.freeze({enabled:true})});
export function createPrismiaComposition({engines=PRISMIA_ENGINES,pluginScopes=[],pluginLoaders=[],builtInScopes=PRISMIA_BUILT_IN_SCOPES}={}){
  const baseRegistry=createScopeRegistry();
  // Compatibility lookup; enumeration and plugin requirements use viewport3d.
  const registry=Object.freeze({...baseRegistry,get:id=>baseRegistry.get(id==='viewport'?'viewport3d':id)});const composition=registerScopeDefinitions(registry,{engines,pluginScopes,builtInScopes,preferred:Object.values(passports).map(p=>p.id),engineOrder:Object.values(passports).map(p=>p.id)});
  registerContributions(composition.engines,composition.scopes);
  return {...composition,registry,pluginLoaders};
}
export async function bindPrismiaComposition(composition){await loadEnginePlugins(composition.engines);const bound=await bindScopeImplementations(composition.registry,{engines:composition.engines,loaders:composition.pluginLoaders});return {...composition,bound};}
