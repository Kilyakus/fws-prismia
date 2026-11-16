import {createScopeRegistry,registerScopeDefinitions,registerContributions,loadEnginePlugins,bindScopeImplementations} from 'framework-preparatorio';
import {passports} from '../scopes/passports.js';
const loaders={
 library:()=>import('../scopes/library/index.js'),viewport:()=>import('../scopes/viewport/index.js'),preview:()=>import('../scopes/preview/index.js'),
 graph:()=>import('../scopes/graph/index.js'),code:()=>import('../scopes/code/index.js'),properties:()=>import('../scopes/properties/index.js'),
 outputs:()=>import('../scopes/outputs/index.js'),material:()=>import('../scopes/material/index.js'),lighting:()=>import('../scopes/lighting/index.js'),scene:()=>import('../scopes/scene/index.js'),
};
export const PRISMIA_ENGINES=Object.freeze(Object.entries(passports).map(([key,passport])=>Object.freeze({id:passport.id,title:passport.label,kind:'scope',plugins:Object.freeze({scopeDefinitions:Object.freeze([passport]),loaders:Object.freeze([])}),load:loaders[key]})));
export function createPrismiaComposition({engines=PRISMIA_ENGINES,pluginScopes=[],pluginLoaders=[]}={}){
  const baseRegistry=createScopeRegistry();
  // Compatibility lookup; enumeration and plugin requirements use viewport3d.
  const registry=Object.freeze({...baseRegistry,get:id=>baseRegistry.get(id==='viewport'?'viewport3d':id)});const composition=registerScopeDefinitions(registry,{engines,pluginScopes,preferred:Object.values(passports).map(p=>p.id),engineOrder:Object.values(passports).map(p=>p.id)});
  registerContributions(composition.engines,composition.scopes);
  return {...composition,registry,pluginLoaders};
}
export async function bindPrismiaComposition(composition){await loadEnginePlugins(composition.engines);const bound=await bindScopeImplementations(composition.registry,{engines:composition.engines,loaders:composition.pluginLoaders});return {...composition,bound};}
