import {MATERIAL_EXAMPLES,createExample} from '../graph/examples.js';
import {OUTPUT_USAGES,nodeDefaults} from '../graph/nodes.js';
import {createEmptyProject,validateProject} from '../graph/document.js';
import {createSurfacePreset} from './surface.js';

const EXTRA=Object.freeze([
  Object.freeze({id:'starter',label:'Мой первый материал',description:'Простой граф: цвет и шероховатость — отличный способ начать.'}),
  Object.freeze({id:'toon-pastel',label:'Мягкий мульт',description:'Пастельный материал со ступенями света и подсветкой краёв.'}),
  Object.freeze({id:'toon-ink',label:'Графичный мульт',description:'Двухступенчатое освещение с тёмным геометрическим контуром.'}),
  Object.freeze({id:'toon-metal',label:'Глянцевый мульт',description:'Стилизованный материал с настраиваемым бликом.'}),
  Object.freeze({id:'luminous',label:'Светящаяся поверхность',description:'Пример материала с независимым каналом свечения.'}),
]);
/** Metadata only; createMaterialPreset returns a fresh, fully editable graph. */
export const MATERIAL_PRESETS=Object.freeze([EXTRA[0],...MATERIAL_EXAMPLES.map(({id,label,description})=>Object.freeze({id,label,description})),...EXTRA.slice(1)]);
export function listMaterialPresets(){return MATERIAL_PRESETS.map(item=>({...item}));}
export function createMaterialPreset(id='brick'){
  if(id==='starter'){
    const g=createEmptyProject('Мой первый материал');
    g.nodes=[
      {id:'base-color',type:'color',position:{x:70,y:70},params:{...nodeDefaults('color'),color:'#b69bd7'}},
      {id:'out-base-color',type:'output',position:{x:400,y:70},params:{...nodeDefaults('output'),usage:OUTPUT_USAGES.indexOf('baseColor')}},
      {id:'rough-value',type:'value',position:{x:70,y:235},params:{...nodeDefaults('value'),value:.45}},
      {id:'out-roughness',type:'output',position:{x:400,y:235},params:{...nodeDefaults('output'),usage:OUTPUT_USAGES.indexOf('roughness')}},
    ];
    g.edges=[{id:'edge-color',source:'base-color',target:'out-base-color',input:'source'},{id:'edge-rough',source:'rough-value',target:'out-roughness',input:'source'}];
    g.exposed=[{id:'main-color',label:'Цвет материала',node:'base-color',param:'color'},{id:'main-roughness',label:'Шероховатость',node:'rough-value',param:'value'}];
    return validateProject(g);
  }
  if(MATERIAL_EXAMPLES.some(x=>x.id===id))return validateProject(createExample(id));
  const config={
    'toon-pastel':{base:'plaster',surface:'toon-soft',colors:['#674b79','#efb4ce']},
    'toon-ink':{base:'ceramic',surface:'toon-graphic',colors:['#3d355c','#c2a9e4']},
    'toon-metal':{base:'gold',surface:'toon-glossy',colors:['#503552','#e9bd77']},
    'luminous':{base:'asphalt',surface:'unlit',colors:['#184265','#62d4e8']},
  }[id];
  if(!config)throw new Error(`Нет заготовки материала: ${id}`);
  const g=createExample(config.base),meta=EXTRA.find(x=>x.id===id);g.name=meta.label;g.surface=createSurfacePreset(config.surface);
  const color=g.nodes.find(n=>n.id==='color-map');color.params.low=config.colors[0];color.params.high=config.colors[1];
  if(id==='luminous'){
    g.surface.rimStrength=.6;g.surface.rimColor='#80dfff';
    const node={id:'out-emissive',type:'output',position:{x:1120,y:940},params:{...nodeDefaults('output'),usage:OUTPUT_USAGES.indexOf('emissive')}};
    g.nodes.push(node);g.edges.push({id:'edge-emissive',source:'color-map',target:node.id,input:'source'});
  }
  return validateProject(g);
}
