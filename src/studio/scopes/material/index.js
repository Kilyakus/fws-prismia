import {passports} from '../passports.js';
import {SURFACE_PRESETS} from '../../../app/engine/prismia/materials/surface.js';
import {outputUsage} from '../../../app/engine/prismia/graph/nodes.js';
export function activate({node,exchange,services}){
  const graph=exchange.channel('graph'),abort=new AbortController(),signal=abort.signal;
  const style=node.querySelector('[data-surface-style]');
  const custom=document.createElement('option');custom.value='';custom.textContent='Свой вариант';style.append(custom);
  for(const preset of SURFACE_PRESETS){const option=document.createElement('option');option.value=preset.id;option.textContent=preset.label;style.append(option);}
  style.addEventListener('change',()=>{if(!style.value)return;try{graph.applySurfacePreset(style.value);services.message('Стиль применён. Измените настройки ниже или отмените выбор.');}catch(error){services.message(error.message,true);}},{signal});
  const controls=[...node.querySelectorAll('[data-surface]')];
  for(const input of controls){const event=input.tagName==='SELECT'||input.type==='checkbox'?'change':'input';input.addEventListener(event,()=>{
    const value=input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value;
    try{graph.setSurface(input.dataset.surface,value,{coalesce:input.type==='range'||input.type==='color'});}catch(error){services.message(error.message,true);}
  },{signal});}
  const off=graph.subscribe(({project})=>{
    const s=project.surface,match=SURFACE_PRESETS.find(p=>JSON.stringify(p.values)===JSON.stringify(s));style.value=match?.id||'';
    node.querySelector('[data-surface-pbr]').hidden=s.model!=='pbr';node.querySelector('[data-surface-toon]').hidden=s.model!=='toon';
    const connected=new Set(project.nodes.filter(n=>n.type==='output'&&project.edges.some(e=>e.target===n.id&&e.input==='source')).map(outputUsage));
    for(const [channel,field] of [['roughness','roughness'],['metallic','metalness']]){const hasMap=connected.has(channel);node.querySelector(`[data-${field}-map]`).hidden=!hasMap;node.querySelector(`[data-${field}-base]`).hidden=hasMap;}
    for(const input of controls){const value=s[input.dataset.surface];if(input.type==='checkbox')input.checked=value;else input.value=value;
      if(input.type==='range'){const out=node.querySelector(`[data-surface-output="${input.dataset.surface}"]`);if(out)out.textContent=Number(value).toFixed(Number(input.step)<.01?3:Number(input.step)===1?0:2);services.ui.syncRangeFill(input);}
    }
  });
  return ()=>{off();abort.abort();};
}
export default Object.freeze({...passports.material,activate});
