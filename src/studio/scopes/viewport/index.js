import {mountSharedGizmoHost,viewportClasses} from '../../../shared/viewport3d-shell.js';
import * as THREE from 'three';
import {createViewport3D,mountViewportChrome,mountViewportNavigation,mountViewportGizmo,mountViewportStatus,discoverViewportEnvironments} from 'framework-preparatorio/scopes/viewport3d';
import {passports} from '../passports.js';
import plugins from '../../../plugins/viewport3d/index.js';

// Add a file exporting a descriptor to extensions/ or inject one via the host.
let discovered=[];
try { discovered=Object.values(import.meta.glob('../../../plugins/viewport3d/extensions/*.js',{eager:true,import:'default'})); }
catch(error) { if(typeof window!=='undefined')throw error; }
const GRAPHICS_KEY='fws-prismia.viewport-graphics.v1';
const SECTIONS_KEY='fws-prismia.viewport-sections.v1',ENVIRONMENT_KEY='fws-prismia.viewport-environment.v1';
const readObject=key=>{try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}};
const saveObject=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{/* private browsing */}};
let discoveredWorlds=[];
try { discoveredWorlds=discoverViewportEnvironments({
  manifests:import.meta.glob('../../../plugins/worlds/*/manifest.json',{eager:true,import:'default'}),
  entries:import.meta.glob('../../../plugins/worlds/*/*.js'),
}); } catch(error) {if(typeof window!=='undefined')throw error;}
const readGraphics=()=>{try{return JSON.parse(localStorage.getItem(GRAPHICS_KEY)||'{}')||{};}catch{return {};}};

/** Prismia supplies its subject; mode/tools and graphics come from the framework. */
export function activate({node,exchange,services}){
  const gizmoHost=mountSharedGizmoHost(node.querySelector('[data-v3d-stage]'));
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
  const saved=readGraphics(), sections=readObject(SECTIONS_KEY),savedEnvironment=readObject(ENVIRONMENT_KEY);
  const shadowOptions=['auto','512','1024','2048','4096','8192'];
  let chrome=null,navigation=null,gizmo=null,status=null,offView=()=>{},offEnvironment=()=>{},lastShadow=shadowOptions.includes(saved.lastShadow)?saved.lastShadow:'auto';
  try {
    viewport.registerPlugins([...plugins,...discovered,...services.viewportPlugins]);
    chrome=mountViewportChrome({root:node,viewport,ui:services.viewportUi,classes:viewportClasses,
      shadingOptions:{getObject:()=>viewport.getPlugin('prismia-material-preview')?.subject},
      environmentOptions:{studioColors:{background:0x242834,pedestal:0x667080,grid:{major:0xc5cbd7,minor:0x7c899c}},getGridFocus:()=>viewport.getPlugin('prismia-material-preview')?.subject,environments:discoveredWorlds,gridVisible:typeof savedEnvironment.grid==='boolean'?savedEnvironment.grid:view.value.grid,preserveBackground:true},
      settingsOptions:{sections,onSectionChange:()=>saveObject(SECTIONS_KEY,sections)},
      graphicsOptions:{settings:saved,
        globalLightingAdapter:{
          setEnabled:enabled=>viewport.getPlugin('prismia-material-preview')?.setGlobalLightingEnabled?.(enabled),
          setIntensity:intensity=>viewport.getPlugin('prismia-material-preview')?.setGlobalLightingIntensity?.(intensity),
          snapshot:()=>viewport.getPlugin('prismia-material-preview')?.globalLightingSnapshot?.()??null,
        },
        onChange(settings){
      if(settings.shadow!=='off')lastShadow=settings.shadow;
      try{localStorage.setItem(GRAPHICS_KEY,JSON.stringify({...settings,lastShadow}));}catch{/* private browsing */}
      // Keep the existing lighting panel in sync with the common controls.
      view.set('exposure',settings.exposure);view.set('shadows',settings.shadow!=='off');
    }}});
    const current=()=>viewport.getPlugin('prismia-material-preview');
    const fallbackTarget=new THREE.Vector3(0,.9,0);
    const orbit={
      get target(){return current()?.controls.target ?? fallbackTarget;},
      get minDistance(){return current()?.controls.minDistance ?? .05;},
      get maxDistance(){return current()?.controls.maxDistance ?? 1000;},
      zoom(factor){const controls=current()?.controls;if(!controls)return;
        const offset=viewport.camera.position.clone().sub(controls.target);
        const distance=Math.max(controls.minDistance,Math.min(controls.maxDistance,offset.length()*factor));
        viewport.camera.position.copy(controls.target).add(offset.setLength(distance));controls.update();},
    };
    const enabled=()=>!!current();
    navigation=mountViewportNavigation({root:node,viewport,orbit,isEnabled:enabled,
      fitObject:()=>current()?.subject,invalidate:()=>current()?.controls.update()});
    gizmo=mountViewportGizmo({host:gizmoHost,THREE,camera:viewport.camera,setView:navigation.setView,
      isEnabled:enabled,subscribe:fn=>viewport.onRender(fn)});
    const SUBJECT_NAMES={sphere:'Сфера',torus:'Тор',cube:'Куб',plane:'Плоскость',model:'GLB модель'};
    status=mountViewportStatus({
      root:node.querySelector('[data-v3d-status]'),viewport,
      getActiveObject:()=>current()?.subject??null,
      getContext:()=>({shape:view.value.shape}),
      layers:[{groups:[{id:'subject-meta',row:0,side:'left',order:10,separator:' · '}],items:[
        {id:'live',group:'subject-meta',text:'LIVE MATERIAL',title:'Материал графа пересчитывается в реальном времени'},
        {id:'subject',group:'subject-meta',text:({shape})=>SUBJECT_NAMES[shape]??'Сфера',title:'Активный объект сцены'},
        {id:'position',text:({viewport:vp})=>{const p=vp.camera?.position;if(!p)return null;
          const n=v=>Math.abs(v)<.005?'0.00':v.toFixed(2);return `XYZ ${n(p.x)}  ${n(p.y)}  ${n(p.z)}`;},title:'Позиция камеры'},
        {id:'help',row:0,side:'left',order:50,text:'ЛКМ — вращение · колесо — масштаб',title:'Управление камерой в области просмотра'},
      ]}],
    });
    const graphics=chrome.graphics,environment=chrome.environment;
    if(view.value.grid!==environment.gridWanted)view.set('grid',environment.gridWanted);
    offEnvironment=environment.onChange(()=>{
      if(view.value.grid!==environment.gridWanted)view.set('grid',environment.gridWanted);
      saveObject(ENVIRONMENT_KEY,{id:environment.currentId,grid:environment.gridWanted});
    });
    if(savedEnvironment.id&&savedEnvironment.id!=='studio')void environment.set(savedEnvironment.id);
    if(graphics.value.shadow!=='off')lastShadow=graphics.value.shadow;
    view.set('shadows',graphics.value.shadow!=='off');view.set('exposure',graphics.value.exposure);
    graphics.refresh();
    offView=view.subscribe((s,event)=>{
      if(event.kind==='exposure'||event.kind==='reset')graphics.set({exposure:s.exposure});
      if(event.kind==='shadows'||event.kind==='reset')graphics.set({shadow:s.shadows?lastShadow:'off'});
      if(event.kind==='shape')graphics.refresh();
      if((event.kind==='grid'||event.kind==='reset')&&environment.gridWanted!==s.grid)environment.setGrid(s.grid);
      if(event.kind==='shape'||event.kind==='reset')status?.update();
    },{immediate:false});
    services.viewport3d=viewport;services.viewportGraphics=graphics;services.viewportEnvironment=environment;services.viewportDisplay=chrome.display;
  } catch(error) {offView();offEnvironment();status?.dispose();gizmo?.dispose();navigation?.dispose();chrome?.dispose();viewport.dispose();throw error;}
  return ()=>{offView();offEnvironment();status?.dispose();gizmo?.dispose();navigation?.dispose();chrome.dispose();viewport.dispose();services.viewport3d=null;services.viewportGraphics=null;services.viewportEnvironment=null;services.viewportDisplay=null;};
}
export default Object.freeze({...passports.viewport,activate});
