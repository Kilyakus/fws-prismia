import {passports} from '../passports.js';
import {NODE_TYPES} from '../../graph/nodes.js';
import {compileNodeFragment,validateNodeFragment} from '../../graph/compiler.js';
export function activate({node,exchange,services}){
  const graph=exchange.channel('graph'),abort=new AbortController(),signal=abort.signal,editor=node.querySelector('[data-code-editor]'),apply=node.querySelector('[data-code-apply]'),error=node.querySelector('[data-code-error]');let selected=null,lastCode='';
  const off=graph.subscribe((s,event)=>{const n=s.project.nodes.find(x=>x.id===s.selected);selected=n||null;const custom=n?.type==='custom';node.querySelector('[data-code-title]').textContent=n?`${NODE_TYPES[n.type].label} · GLSL`:'GLSL узла';node.querySelector('[data-code-note]').textContent=!n?'Выберите узел графа.':custom?'Функция vec4 prismNode(vec2 uv). Доступны tex_source, tex_mask, uTexel, uSeed и uTime.':'Генерируемый исходник этого прохода доступен для просмотра и экспорта. Для своего кода добавьте узел GLSL.';
    editor.readOnly=!custom;apply.disabled=!custom;const code=n?(custom?n.params.code:compileNodeFragment(n)):'';if(document.activeElement!==editor||selected?.id!==editor.dataset.node||event.kind==='selection'){editor.value=code;lastCode=code;editor.dataset.node=n?.id||'';}if(event.kind==='selection')error.textContent='';});
  apply.addEventListener('click',()=>{if(!selected)return;try{const candidate={...selected,params:{...selected.params,code:editor.value}},source=compileNodeFragment(candidate),result=validateNodeFragment(services.runtime.renderer.getContext(),source);if(!result.ok){error.textContent=result.error;return;}graph.setParam(selected.id,'code',editor.value,{coalesce:false});lastCode=editor.value;error.textContent='Компиляция успешна.';}catch(e){error.textContent=e.message;}},{signal});
  node.querySelector('[data-code-download]').addEventListener('click',()=>{if(!selected)return;const code=selected.type==='custom'?compileNodeFragment({...selected,params:{...selected.params,code:editor.value}}):compileNodeFragment(selected),url=URL.createObjectURL(new Blob([code],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download=`${selected.id}.frag`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},{signal});
  return ()=>{off();abort.abort();};
}
export default Object.freeze({...passports.code,activate});
