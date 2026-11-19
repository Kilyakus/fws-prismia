import { createEmptyProject } from './document.js';
import { NODE_TYPES, nodeDefaults, OUTPUT_USAGES } from './nodes.js';

/** Reusable, editable procedural materials. Each is a real multi-output graph. */
const SPECS=[
  {id:'brick',label:'Тёплый кирпич',description:'Кладка, минеральные вариации и мягкие швы.',type:'bricks',pattern:{columns:6,rows:8,mortar:.055,round:.02},colors:['#4d302c','#c37e5c'],rough:[.65,.95],metal:0,normal:4,blend:'multiply'},
  {id:'marble',label:'Мрамор с прожилками',description:'Прожилки, искажённые шумом, и полированная поверхность.',type:'waves',pattern:{scale:10,distortion:.8,angle:36},colors:['#495969','#e9e6dc'],rough:[.22,.43],metal:0,normal:1,blend:'warp'},
  {id:'steel',label:'Окисленный металл',description:'Зернистая поверхность и металлический канал.',type:'cells',pattern:{scale:11,jitter:.9,contrast:1.8},colors:['#302d28','#a59983'],rough:[.34,.78],metal:.82,normal:2,blend:'multiply'},
  {id:'fabric',label:'Синяя ткань',description:'Переплетение нитей и микрорельеф.',type:'weave',pattern:{scale:24,width:.63,relief:.7},colors:['#142c40','#7c9fae'],rough:[.72,.98],metal:0,normal:4,blend:'multiply'},
  {id:'wood',label:'Древесина',description:'Волокна с естественными цветовыми переходами.',type:'waves',pattern:{scale:20,distortion:.9,angle:0},colors:['#493025','#ca9360'],rough:[.5,.82],metal:0,normal:2,blend:'warp'},
  {id:'stone',label:'Каменные ячейки',description:'Минеральные пятна и рельеф от процедурных ячеек.',type:'cells',pattern:{scale:7,jitter:1,contrast:1.5},colors:['#343d3c','#bbc2ad'],rough:[.75,1],metal:0,normal:4,blend:'multiply'},
  {id:'ceramic',label:'Керамическая плитка',description:'Повторяющаяся плитка с глянцевым покрытием.',type:'checker',pattern:{scale:8,colorA:'#ebdac0',colorB:'#4f6867'},colors:['#344e50','#eee0c9'],rough:[.18,.35],metal:0,normal:.6,blend:'multiply'},
  {id:'asphalt',label:'Асфальт',description:'Тёмное зерно и неоднородная шероховатость.',type:'noise',pattern:{scale:25,detail:.75,contrast:1.5},colors:['#252a2b','#66706b'],rough:[.55,.92],metal:0,normal:3,blend:'multiply'},
  {id:'gold',label:'Матовая латунь',description:'Металл с шумовыми следами и различной шероховатостью.',type:'noise',pattern:{scale:14,detail:.65,contrast:1.1},colors:['#5f4420','#cda65d'],rough:[.25,.61],metal:1,normal:1,blend:'multiply'},
  {id:'plaster',label:'Штукатурка',description:'Мягкий облачный шум и неровности.',type:'noise',pattern:{scale:6,detail:.9,contrast:1.25},colors:['#87867e','#d9d3c4'],rough:[.72,.95],metal:0,normal:2,blend:'multiply'},
];
export const MATERIAL_EXAMPLES=Object.freeze(SPECS.map(({id,label,description,type})=>Object.freeze({id,label,description,type})));
function makeNode(id,type,x,y,params={}){return {id,type,position:{x,y},params:{...nodeDefaults(type),...params}};}

export function createExample(id='brick'){
  const spec=SPECS.find(x=>x.id===id);if(!spec)throw new Error(`Нет материала ${id}`);
  const g=createEmptyProject(spec.label);g.seed=11;g.resolution=512;
  const nodes=[],edges=[];let seq=0;
  const add=(id,type,x,y,params)=>{nodes.push(makeNode(id,type,x,y,params));return id;};
  const link=(source,target,input)=>edges.push({id:`edge-${++seq}`,source,target,input});
  add('pattern',spec.type,70,90,spec.pattern);add('detail','noise',70,430,{scale:16,detail:.65,contrast:1});
  let height;
  if(spec.blend==='warp'){
    add('warped','warp',340,100,{strength:.4});link('pattern','warped','source');link('detail','warped','mask');height='warped';
  }else{
    add('mixed','blend',340,100,{mode:2,opacity:.38});link('pattern','mixed','background');link('detail','mixed','foreground');height='mixed';
  }
  add('height-level','levels',580,80,{inLow:0,inHigh:1,gamma:1,outLow:0,outHigh:1});link(height,'height-level','source');
  add('color-map','gradientmap',820,70,{low:spec.colors[0],high:spec.colors[1],mid:.48});link('height-level','color-map','source');
  add('normal-map','normal',820,300,{strength:spec.normal,format:0});link('height-level','normal-map','source');
  add('ambient-map','ao',820,500,{distance:5,strength:1.2});link('height-level','ambient-map','source');
  add('rough-map','levels',580,500,{outLow:spec.rough[0],outHigh:spec.rough[1]});link('detail','rough-map','source');
  add('metal-value','value',820,720,{value:spec.metal});
  let yi=40;for(const [usage,source] of [['baseColor','color-map'],['normal','normal-map'],['height','height-level'],['ambientOcclusion','ambient-map'],['roughness','rough-map'],['metallic','metal-value']]){
    const oid='out-'+usage.replace(/[A-Z]/g,m=>'-'+m.toLowerCase());add(oid,'output',1120,yi,{usage:OUTPUT_USAGES.indexOf(usage)});link(source,oid,'source');yi+=150;
  }
  g.nodes=nodes;g.edges=edges;
  g.exposed=[{id:'relief-strength',label:'Сила рельефа',node:'normal-map',param:'strength'},{id:'detail-scale',label:'Масштаб деталей',node:'detail',param:'scale'}];
  return g;
}
