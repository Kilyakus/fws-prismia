import { NODE_TYPES, nodeDefaults, outputUsage, OUTPUT_USAGES } from './nodes.js';
import { SURFACE_SCHEMA, validateSurface, createSurfacePreset } from '../materials/surface.js';
export const PROJECT_FORMAT='fws-prismia-material';
export const PROJECT_VERSION=1;
const copy=x=>structuredClone(x);
const ID=/^[a-z][a-z0-9-]{0,63}$/;
const finite=(n,lo,hi,def=0)=>Number.isFinite(Number(n))?Math.max(lo,Math.min(hi,Number(n))):def;
const resolutions=[128,256,512,1024,2048];
let sequence=0;
function uid(prefix){return `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}`;}
function cleanParam(spec,value,key){
  if(spec.kind==='range')return finite(value,spec.min,spec.max,spec.default);
  if(spec.kind==='choice')return Math.round(finite(value,0,spec.choices.length-1,spec.default));
  if(spec.kind==='color')return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():spec.default;
  if(spec.kind==='image'){
    if(value==null||value==='')return '';
    if(typeof value!=='string'||value.length>12_000_000||!/^data:image\/(png|jpeg|webp);base64,/i.test(value))throw new Error('Допускаются встроенные PNG/JPEG/WebP до 9 МБ.');
    return value;
  }
  if(spec.kind==='code'){if(typeof value!=='string'||value.length>20000)throw new Error('GLSL превышает лимит 20000 символов.');return value;}
  return String(value??spec.default).slice(0,160);
}

/** Validates and normalizes a project without trusting loaded JSON. */
export function validateProject(raw){
  if(!raw||raw.format!==PROJECT_FORMAT||raw.version!==PROJECT_VERSION)throw new Error('Неподдерживаемый формат проекта Prismia.');
  if(!Array.isArray(raw.nodes)||raw.nodes.length>128||!Array.isArray(raw.edges)||raw.edges.length>384)throw new Error('Некорректный размер графа.');
  const ids=new Set(), nodes=raw.nodes.map(item=>{
    if(!item||!ID.test(item.id)||ids.has(item.id)||!Object.hasOwn(NODE_TYPES,item.type))throw new Error(`Неизвестный или повторный узел: ${item?.id}`);ids.add(item.id);
    const def=NODE_TYPES[item.type],params={};for(const [key,spec] of Object.entries(def.params))params[key]=cleanParam(spec,item.params?.[key]??spec.default,key);
    return {id:item.id,type:item.type,position:{x:finite(item.position?.x,-20000,20000),y:finite(item.position?.y,-20000,20000)},params};
  });
  const bitmapChars=nodes.reduce((sum,n)=>sum+(n.type==='bitmap'?n.params.src.length:0),0);
  if(bitmapChars>12_000_000)throw new Error('Суммарный размер встроенных изображений слишком велик (не более 12 млн символов base64).');
  const byId=new Map(nodes.map(n=>[n.id,n])),targets=new Set(),edgeIds=new Set();
  const edges=raw.edges.map((edge,index)=>{
    if(!edge||!byId.has(edge.source)||!byId.has(edge.target)||edge.source===edge.target)throw new Error('Соединение ссылается на отсутствующий узел.');
    const target=byId.get(edge.target);if(!NODE_TYPES[target.type].inputs.some(i=>i.id===edge.input))throw new Error(`Нет входа ${edge.input} у узла ${target.id}.`);
    if(byId.get(edge.source).type==='output')throw new Error('Выход PBR нельзя использовать как источник.');
    const slot=`${edge.target}:${edge.input}`;if(targets.has(slot))throw new Error(`Повторное соединение входа ${slot}.`);targets.add(slot);
    const id=typeof edge.id==='string'&&ID.test(edge.id)?edge.id:`edge-${index+1}`;if(edgeIds.has(id))throw new Error('Повторный id соединения.');edgeIds.add(id);
    return {id,source:edge.source,target:edge.target,input:edge.input};
  });
  const usage=new Set();for(const n of nodes.filter(n=>n.type==='output')){const key=outputUsage(n);if(usage.has(key))throw new Error(`Канал ${key} уже используется.`);usage.add(key);}
  const incoming=new Map(nodes.map(n=>[n.id,0])),outgoing=new Map(nodes.map(n=>[n.id,[]]));
  for(const e of edges){incoming.set(e.target,incoming.get(e.target)+1);outgoing.get(e.source).push(e.target);}
  const queue=nodes.filter(n=>incoming.get(n.id)===0).map(n=>n.id),order=[];
  while(queue.length){const id=queue.shift();order.push(id);for(const next of outgoing.get(id)){const d=incoming.get(next)-1;incoming.set(next,d);if(!d)queue.push(next);}}
  if(order.length!==nodes.length)throw new Error('Цикл в графе: соединение невозможно.');
  const exposed=Array.isArray(raw.exposed)?raw.exposed.slice(0,64).map((p,i)=>{
    if(!p||typeof p!=='object')throw new Error('Некорректный опубликованный параметр.');
    const n=byId.get(p.node),spec=n&&NODE_TYPES[n.type].params[p.param];
    if(!spec||!['range','color','choice'].includes(spec.kind))throw new Error('Некорректный опубликованный параметр.');
    return {id:ID.test(p.id)?p.id:`parameter-${i+1}`,label:String(p.label||spec.label).slice(0,80),node:n.id,param:p.param};
  }):[];
  if(new Set(exposed.map(p=>p.id)).size!==exposed.length)throw new Error('Повторный id параметра.');
  const resolution=resolutions.includes(Number(raw.resolution))?Number(raw.resolution):512;
  return {format:PROJECT_FORMAT,version:PROJECT_VERSION,name:String(raw.name||'Новый материал').slice(0,80),resolution,seed:Math.round(finite(raw.seed,0,999999,1)),nodes,edges,exposed,surface:validateSurface(raw.surface)};
}
export function createEmptyProject(name='Новый материал'){
  return {format:PROJECT_FORMAT,version:PROJECT_VERSION,name,resolution:512,seed:1,nodes:[],edges:[],exposed:[],surface:validateSurface()};
}
export function topologicalNodes(project){
  const graph=validateProject(project),incoming=new Map(graph.nodes.map(n=>[n.id,0])),byId=new Map(graph.nodes.map(n=>[n.id,n])),next=new Map(graph.nodes.map(n=>[n.id,[]]));
  for(const e of graph.edges){incoming.set(e.target,incoming.get(e.target)+1);next.get(e.source).push(e.target);}
  const queue=graph.nodes.filter(n=>!incoming.get(n.id)).map(n=>n.id),result=[];
  while(queue.length){const id=queue.shift();result.push(byId.get(id));for(const n of next.get(id)){incoming.set(n,incoming.get(n)-1);if(!incoming.get(n))queue.push(n);}}
  return result;
}

/** State machine / undo history shared by independent scopes and the host. */
export function createGraphStore(initial=createEmptyProject()){
  let project=validateProject(initial),selected=null,preview=null,undo=[],redo=[],listeners=new Set(),lastAction='',lastTime=0,disposed=false;
  const emit=(kind)=>{if(disposed)return;const value=api.value;for(const fn of [...listeners]){try{fn(value,{kind});}catch(e){console.error(e);}}};
  // Bitmap data is embedded in snapshots; bound undo/redo by size as well as
  // count so a large image cannot turn an 80-entry history into gigabytes.
  function pushHistory(stack,snapshot){const bytes=JSON.stringify(snapshot).length*2;stack.push({project:snapshot,bytes});let total=stack.reduce((sum,item)=>sum+item.bytes,0);while(stack.length>1&&(stack.length>80||total>64*1024*1024)){total-=stack.shift().bytes;}}
  function change(key,fn,{coalesce=false}={}){
    if(disposed)throw new Error('Граф освобождён.');
    const before=copy(project),candidate=copy(project);fn(candidate);const next=validateProject(candidate);
    if(JSON.stringify(next)===JSON.stringify(before))return false;
    const now=Date.now();if(!(coalesce&&lastAction===key&&now-lastTime<700)){pushHistory(undo,before);}
    lastAction=key;lastTime=now;redo=[];project=next;if(selected&&!project.nodes.some(n=>n.id===selected))selected=null;if(preview&&!project.nodes.some(n=>n.id===preview))preview=null;emit('graph');return true;
  }
  const api={
    get value(){return {project:copy(project),selected,preview,canUndo:undo.length>0,canRedo:redo.length>0};},
    subscribe(fn,{immediate=true}={}){if(typeof fn!=='function')throw new TypeError('Нужен подписчик');listeners.add(fn);if(immediate)fn(api.value,{kind:'init'});return()=>listeners.delete(fn);},
    select(id){selected=project.nodes.some(n=>n.id===id)?id:null;emit('selection');},
    previewNode(id){preview=project.nodes.some(n=>n.id===id)?id:null;emit('preview');},
    addNode(type,position={x:100,y:100},params={}){
      if(!Object.hasOwn(NODE_TYPES,type))throw new Error(`Неизвестный узел ${type}`);const id=uid('node');
      const defaults={...nodeDefaults(type),...params};if(type==='output'&&params.usage===undefined){const used=new Set(project.nodes.filter(n=>n.type==='output').map(outputUsage));defaults.usage=Math.max(0,OUTPUT_USAGES.findIndex(v=>!used.has(v)));}
      change('add',g=>g.nodes.push({id,type,position,params:defaults}));selected=id;preview=id;emit('selection');return id;
    },
    removeNode(id){return change('remove',g=>{g.nodes=g.nodes.filter(n=>n.id!==id);g.edges=g.edges.filter(e=>e.source!==id&&e.target!==id);g.exposed=g.exposed.filter(p=>p.node!==id);});},
    moveNode(id,position){return change(`move:${id}`,g=>{const n=g.nodes.find(x=>x.id===id);if(n)n.position=position;},{coalesce:true});},
    setParam(id,key,value,{coalesce=true}={}){return change(`param:${id}:${key}`,g=>{const n=g.nodes.find(x=>x.id===id);if(!n||!NODE_TYPES[n.type].params[key])throw new Error('Неизвестный параметр');n.params[key]=value;},{coalesce});},
    connect(source,target,input){return change('connect',g=>{g.edges=g.edges.filter(e=>!(e.target===target&&e.input===input));g.edges.push({id:uid('edge'),source,target,input});});},
    disconnect(target,input){return change('disconnect',g=>{g.edges=g.edges.filter(e=>!(e.target===target&&e.input===input));});},
    setSurface(key,value,{coalesce=true}={}){if(!Object.hasOwn(SURFACE_SCHEMA,key))throw new Error(`Неизвестная настройка поверхности: ${key}`);return change(`surface:${key}`,g=>{g.surface[key]=value;},{coalesce});},
    setSurfaceValues(values){const next=validateSurface(values);return change('surface-values',g=>{g.surface=next;});},
    applySurfacePreset(id){const next=createSurfacePreset(id);return change('surface-preset',g=>{g.surface=next;});},
    setResolution(value){return change('resolution',g=>{g.resolution=Number(value);});},
    setSeed(value){return change('seed',g=>{g.seed=Number(value);},{coalesce:true});},
    rename(name){return change('rename',g=>{g.name=name;},{coalesce:true});},
    expose(id,param,label){const n=project.nodes.find(x=>x.id===id),spec=n&&NODE_TYPES[n.type].params[param];if(!spec||!['range','choice','color'].includes(spec.kind))throw new Error('Параметр нельзя опубликовать');return change('expose',g=>{if(!g.exposed.some(p=>p.node===id&&p.param===param))g.exposed.push({id:uid('parameter'),node:id,param,label:label||spec.label});});},
    unexpose(id){return change('unexpose',g=>{g.exposed=g.exposed.filter(p=>p.id!==id);});},
    load(raw){const next=validateProject(raw);pushHistory(undo,copy(project));redo=[];project=next;selected=next.nodes[0]?.id??null;preview=next.nodes.find(n=>n.type==='output')?.id??selected;lastAction='';emit('graph');},
    undo(){if(!undo.length)return false;pushHistory(redo,copy(project));project=undo.pop().project;selected=project.nodes.some(n=>n.id===selected)?selected:null;preview=project.nodes.some(n=>n.id===preview)?preview:null;lastAction='';emit('graph');return true;},
    redo(){if(!redo.length)return false;pushHistory(undo,copy(project));project=redo.pop().project;selected=project.nodes.some(n=>n.id===selected)?selected:null;preview=project.nodes.some(n=>n.id===preview)?preview:null;lastAction='';emit('graph');return true;},
    dispose(){disposed=true;listeners.clear();undo=[];redo=[];},
  };
  return Object.freeze(api);
}
