import {createStudio,installRangeFillSupport,syncRangeFill,syncRangeFills,resolveConfig,serializeConfig} from 'uix-preparatorio';
import {mountScopeNodes} from 'framework-preparatorio';
import {createPrismiaComposition,bindPrismiaComposition} from './registry.js';
import {createScopeExchange} from './scope-exchange.js';
import {createViewState,createRenderState} from './state.js';
import {createGraphStore,createEmptyProject,validateProject} from '../graph/document.js';
import {createMaterialPreset} from '../materials/material-presets.js';
import {NODE_TYPES,nodeDefaults} from '../graph/nodes.js';
import {compileNodeFragment,validateNodeFragment} from '../graph/compiler.js';

const tab=(...ids)=>({type:'tab-area',widgets:ids,currentIndex:0});
const wide={type:'split-area',orientation:'horizontal',sizes:[.215,.545,.24],children:[tab('library'),
  {type:'split-area',orientation:'vertical',sizes:[.51,.49],children:[
    {type:'split-area',orientation:'horizontal',sizes:[.44,.56],children:[tab('preview'),tab('viewport')]},tab('graph','code')]},
  {type:'split-area',orientation:'vertical',sizes:[.54,.46],children:[tab('properties'),tab('outputs','material','lighting','scene')]}]};
const compact=tab('viewport','preview','graph','library','properties','outputs','material','lighting','scene','code');
const mode=()=>window.innerWidth<800?'compact':'wide';
function responsive(studio){
  let current=mode(),restoring=false;const key=m=>`fws-prismia.panels.${m}.v1`;
  function save(){if(restoring||mode()!==current)return;try{localStorage.setItem(key(current),JSON.stringify(serializeConfig(studio.dock.saveLayout().main)));}catch{}}
  function apply(next,force=false){let config=null;if(!force)try{config=JSON.parse(localStorage.getItem(key(next))||'null');}catch{};config=config|| (next==='compact'?compact:wide);const resolved=resolveConfig(config,studio.panels);if(!resolved)return;restoring=true;try{studio.dock.restoreLayout({main:resolved});for(const [id,p] of Object.entries(studio.panels))if(studio.isAreaVisible(id)&&!studio.dock.contains(p))studio.dock.addWidget(p,{mode:'tab-after',ref:studio.panels.viewport});}finally{restoring=false;}save();}
  const resize=()=>{const next=mode();if(next===current)return;current=next;apply(next);studio.dock.fit();studio.dock.update();};
  studio.dock.layoutModified.connect(save);window.addEventListener('resize',resize);apply(current);
  return {reset(){for(const m of ['wide','compact'])try{localStorage.removeItem(key(m));}catch{}studio.resetLayout();apply(current,true);},dispose(){save();studio.dock.layoutModified.disconnect(save);window.removeEventListener('resize',resize);}};
}
function download(content,name,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}

/** Create a Preparatorio/Lumino studio with independently activated scopes. */
export async function createPrismiaStudio({mount='#app',project=null,composition=null,restore=true,notices='',viewportPlugins=[],viewportApis={}}={}){
  installRangeFillSupport();const built=await bindPrismiaComposition(composition||createPrismiaComposition());
  if(!built.registry.get('viewport3d'))throw new Error('Для Prismia требуется область viewport3d.');
  let initial=project;if(!initial&&restore)try{const saved=localStorage.getItem('fws-prismia.project.v1');if(saved)initial=validateProject(JSON.parse(saved));}catch{}initial ||= createMaterialPreset('starter');
  const graph=createGraphStore(initial),view=createViewState(),renderState=createRenderState(),exchange=createScopeExchange({graph,view,render:renderState});
  let studio,layouts,offGraph,offRender,saveTimer,destroyed=false;const disposers=[],abort=new AbortController();
  const services={viewport3d:null,viewportPlugins,viewportApis,scopeIds:built.registry.list().map(scope=>scope.id),get runtime(){return this.viewport3d?.getPlugin('prismia-material-preview')??null;},renderState,ui:{syncRangeFill,syncRangeFills},activatePanel(id){if(!studio?.panels[id])return;if(!studio.isAreaVisible(id))studio.setAreaVisible(id,true);studio.dock.activateWidget(studio.panels[id]);},message(text,error=false){const status=studio?.root.querySelector('[data-app-message]');if(status){status.textContent=text;status.classList.toggle('is-error',error);}}};
  const loadInput=document.createElement('input');loadInput.type='file';loadInput.accept='.json,application/json';loadInput.hidden=true;
  const menus=[{label:'Файл',items:[
    {label:'Новый материал',onClick:()=>{if(confirm('Создать пустой граф? Предыдущий можно вернуть через Ctrl+Z.')){graph.load(createEmptyProject());view.set('mode','graph');services.message('Новый граф создан.');}}},
    {label:'Открыть проект…',onClick:()=>loadInput.click()},
    {label:'Сохранить проект JSON',onClick:()=>download(JSON.stringify(graph.value.project,null,2),'prismia-material.json')},
    {separator:true},{label:'Экспорт карт PNG…',onClick:()=>services.activatePanel('outputs')},
    {label:'Снимок 3D PNG',onClick:()=>services.runtime?.snapshot()},
    {separator:true},{label:'Лицензии компонентов…',onClick:()=>studio.root.querySelector('[data-license-dialog]')?.showModal()},
  ]},{label:'Правка',items:[{label:'Отменить  Ctrl+Z',onClick:()=>graph.undo()},{label:'Повторить  Ctrl+Shift+Z',onClick:()=>graph.redo()}]},
  {label:'Вид',items:[{label:'Сбросить расположение панелей',onClick:()=>layouts.reset()},{label:'Сбросить камеру',onClick:()=>services.runtime?.resetCamera()}]}];
  try{
    const descriptors=built.registry.list().map(scope=>({id:scope.areaId,title:scope.label,hint:scope.hint,iconPath:scope.iconPath,hideable:scope.hideable,className:`prismia-area prismia-area-${scope.areaId}`,ref:'viewport',mode:'tab-after',render(body){const slot=document.createElement('div');slot.dataset.scopeSlot=scope.id;body.append(slot);}}));
    studio=await createStudio({id:'fws-prismia',mount,title:'FWS PRISMIA',anchor:'viewport',panels:descriptors,layout:mode()==='compact'?compact:wide,menus,toolsMenuLabel:'Панели'});
    studio.root.append(loadInput);
    const license=document.createElement('dialog');license.className='p-license-dialog';license.dataset.licenseDialog='';license.setAttribute('aria-label','Лицензии компонентов');
    const licenseHead=document.createElement('header'),licenseTitle=document.createElement('strong'),licenseClose=document.createElement('button'),licenseText=document.createElement('pre');
    licenseTitle.textContent='Лицензии компонентов';licenseClose.textContent='Закрыть';licenseClose.type='button';licenseClose.addEventListener('click',()=>license.close(),{signal:abort.signal});licenseHead.append(licenseTitle,licenseClose);licenseText.textContent=notices||'Лицензии компонентов находятся в THIRD_PARTY_NOTICES.txt пакета Prismia.';license.append(licenseHead,licenseText);studio.root.append(license);
    const meta=document.createElement('div');meta.className='p-app-meta';meta.innerHTML='<span class="p-app-dot"></span><span data-app-message>PROCEDURAL MATERIAL LAB</span><b>WEBGL</b>';studio.root.querySelector('.b-topbar').append(meta);
    loadInput.addEventListener('change',async()=>{const file=loadInput.files[0];if(!file)return;try{if(file.size>16_000_000)throw new Error('Проект слишком большой: максимум 16 МБ.');graph.load(JSON.parse(await file.text()));view.set('mode','graph');services.message('Проект открыт.');}catch(error){services.message(error.message,true);}finally{loadInput.value='';}},{signal:abort.signal});
    mountScopeNodes(built.registry,document);layouts=responsive(studio);
    const scopes=built.registry.list().slice().sort((a,b)=>(a.id==='viewport3d'?-1:b.id==='viewport3d'?1:0));
    for(const scope of scopes){const element=studio.root.querySelector(scope.selector);if(!element||typeof scope.activate!=='function')throw new Error(`Не удалось активировать область ${scope.id}`);const off=await scope.activate({node:element,scope,exchange,services,studio});if(typeof off!=='function')throw new Error(`Область ${scope.id} не вернула disposer`);disposers.push(off);}
    offGraph=graph.subscribe((s,event)=>{if(event.kind==='graph'){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem('fws-prismia.project.v1',JSON.stringify(s.project));}catch{services.message('Проект не поместился в локальное хранилище: сохраните JSON.',true);}},500);}});
    offRender=renderState.subscribe(s=>{if(s.error)services.message(s.error,true);else if(s.ready)services.message(`${s.outputCount} КАРТ · ${s.nodeCount} УЗЛОВ`);});
    const initialNode=graph.value.project.nodes.find(n=>n.type!=='output');if(initialNode)graph.select(initialNode.id);const firstOutput=graph.value.project.nodes.find(n=>n.type==='output');if(firstOutput)graph.previewNode(firstOutput.id);
    studio.root.dataset.appReady='true';
    function destroy(){if(destroyed)return;destroyed=true;clearTimeout(saveTimer);abort.abort();offGraph?.();offRender?.();for(const off of disposers.reverse())try{off();}catch(error){console.warn(error);}exchange.dispose();layouts?.dispose();graph.dispose();view.dispose();renderState.dispose();studio.destroy();}
    const api={studio,registry:built.registry,exchange,graph,view,get runtime(){return services.runtime;},get viewport3d(){return services.viewport3d;},destroy};
    if(new URLSearchParams(location.search).has('debug')){api.debug={NODE_TYPES,nodeDefaults,compileNodeFragment,validateNodeFragment,createPrismiaStudio};window.__prismiaDebug=api;}
    return api;
  }catch(error){abort.abort();for(const off of disposers.reverse())try{off();}catch{}exchange.dispose();layouts?.dispose();studio?.destroy();graph.dispose();view.dispose();renderState.dispose();throw error;}
}
