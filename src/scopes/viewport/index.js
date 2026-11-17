import * as THREE from 'three';
import {createViewport3D} from 'framework-preparatorio/scopes/viewport3d';
import {passports} from '../passports.js';
import plugins from '../../plugins/viewport3d/index.js';

// Add a file exporting a descriptor to extensions/ or inject one via the host.
let discovered=[];
try { discovered=Object.values(import.meta.glob('../../plugins/viewport3d/extensions/*.js',{eager:true,import:'default'})); }
catch(error) { if(typeof window!=='undefined')throw error; }

/** Host-specific scope shell; actual 3D and plugin lifecycle live in viewport3d. */
export function activate({node,exchange,services}){
  const view=exchange.channel('view'),graph=exchange.channel('graph'),render=services.renderState;
  const viewport=createViewport3D({THREE,container:node.querySelector('[data-viewport]'),
    cameraOptions:{kind:'perspective',args:[38,1,.05,200]},
    rendererOptions:{antialias:true,alpha:false,preserveDrawingBuffer:true},
    scopes:services.scopeIds,apis:{...services.viewportApis,node,graph,view,render},
    configure({scene,renderer}){
      scene.background=new THREE.Color('#242834');renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
    },
  });
  try { viewport.registerPlugins([...plugins,...discovered,...services.viewportPlugins]); }
  catch(error) {viewport.dispose();throw error;}
  services.viewport3d=viewport;
  return ()=>{viewport.dispose();services.viewport3d=null;};
}
export default Object.freeze({...passports.viewport,activate});
