import * as THREE from 'three';
import {createViewport3D,mountViewportChrome} from 'framework-preparatorio/scopes/viewport3d';
import {passports} from '../passports.js';
import plugins from '../../plugins/viewport3d/index.js';

// Add a file exporting a descriptor to extensions/ or inject one via the host.
let discovered=[];
try { discovered=Object.values(import.meta.glob('../../plugins/viewport3d/extensions/*.js',{eager:true,import:'default'})); }
catch(error) { if(typeof window!=='undefined')throw error; }
const GRAPHICS_KEY='fws-prismia.viewport-graphics.v1';
const readGraphics=()=>{try{return JSON.parse(localStorage.getItem(GRAPHICS_KEY)||'{}')||{};}catch{return {};}};

/** Prismia supplies its subject; mode/tools and graphics come from the framework. */
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
  const saved=readGraphics();
  const shadowOptions=['auto','512','1024','2048','4096','8192'];
  let chrome=null,offView=()=>{},lastShadow=shadowOptions.includes(saved.lastShadow)?saved.lastShadow:'auto';
  try {
    viewport.registerPlugins([...plugins,...discovered,...services.viewportPlugins]);
    chrome=mountViewportChrome({root:node,viewport,graphicsOptions:{settings:saved,onChange(settings){
      if(settings.shadow!=='off')lastShadow=settings.shadow;
      try{localStorage.setItem(GRAPHICS_KEY,JSON.stringify({...settings,lastShadow}));}catch{/* private browsing */}
      // Keep the existing lighting panel in sync with the common controls.
      view.set('exposure',settings.exposure);view.set('shadows',settings.shadow!=='off');
    }}});
    const graphics=chrome.graphics;
    if(graphics.value.shadow!=='off')lastShadow=graphics.value.shadow;
    view.set('shadows',graphics.value.shadow!=='off');view.set('exposure',graphics.value.exposure);
    graphics.refresh();
    offView=view.subscribe((s,event)=>{
      if(event.kind==='exposure'||event.kind==='reset')graphics.set({exposure:s.exposure});
      if(event.kind==='shadows'||event.kind==='reset')graphics.set({shadow:s.shadows?lastShadow:'off'});
      if(event.kind==='shape')graphics.refresh();
    },{immediate:false});
    services.viewport3d=viewport;services.viewportGraphics=graphics;
  } catch(error) {offView();chrome?.dispose();viewport.dispose();throw error;}
  return ()=>{offView();chrome.dispose();viewport.dispose();services.viewport3d=null;services.viewportGraphics=null;};
}
export default Object.freeze({...passports.viewport,activate});
