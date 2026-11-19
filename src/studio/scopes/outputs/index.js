import {passports} from '../passports.js';
import {outputUsage,OUTPUT_USAGES,OUTPUT_LABELS} from '../../../app/engine/prismia/graph/nodes.js';
const LABEL=Object.freeze(Object.fromEntries(OUTPUT_USAGES.map(key=>[key,`${OUTPUT_LABELS[key]} · ${key}`])));
export function activate({node,exchange,services}){
  const graph=exchange.channel('graph'),abort=new AbortController(),signal=abort.signal,list=node.querySelector('[data-outputs-list]'),status=node.querySelector('[data-export-status]');
  let enabled=new Set(OUTPUT_USAGES);
  function draw(s){list.replaceChildren();for(const usage of OUTPUT_USAGES){const out=s.project.nodes.find(n=>n.type==='output'&&outputUsage(n)===usage),connected=out&&s.project.edges.some(e=>e.target===out.id);const row=document.createElement('label');row.className='p-output-row';const check=document.createElement('input');check.type='checkbox';check.checked=enabled.has(usage);check.disabled=!connected;check.addEventListener('change',()=>{check.checked?enabled.add(usage):enabled.delete(usage);},{signal});const name=document.createElement('span');name.textContent=LABEL[usage];const dot=document.createElement('small');dot.textContent=connected?'подключён':'—';row.append(check,name,dot);list.append(row);}}
  const off=graph.subscribe(draw);const button=node.querySelector('[data-export-maps]');button.addEventListener('click',async()=>{button.disabled=true;status.textContent='Вычисляем карты…';try{const files=await services.runtime.exportMaps({resolution:Number(node.querySelector('[data-export-size]').value),usages:[...enabled]});status.textContent=`Готово: ${files.length-1} PNG в архиве.`;}catch(error){status.textContent=error.message;}finally{button.disabled=false;}},{signal});
  return ()=>{off();abort.abort();};
}
export default Object.freeze({...passports.outputs,activate});
