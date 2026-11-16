import {passports} from '../passports.js';
import {NODE_TYPES,OUTPUT_LABELS} from '../../graph/nodes.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
export function activate({node,exchange,services}){
  const graph=exchange.channel('graph'),abort=new AbortController(),signal=abort.signal,host=node.querySelector('[data-node-properties]'),exposedHost=node.querySelector('[data-exposed-properties]');
  let selectedKey='',exposedKey='',controlMap=new Map(),exposedMap=new Map(),innerAbort=null,exposedAbort=null;
  function report(message){let e=host.querySelector('.p-status');if(!e){e=el('div','p-status');host.append(e);}e.textContent=message;}
  function safe(fn){try{fn();}catch(error){report(error.message);sync(graph.value);}}
  function rangeControl(container,spec,value,onChange,onExpose,exposed=false){
    const row=el('label','range-row'),caption=el('span',null,spec.label),output=el('output'),input=el('input');input.type='range';input.min=spec.min;input.max=spec.max;input.step=spec.step;input.value=value;output.textContent=Number(value).toFixed(spec.step<.01?3:2);input.addEventListener('input',()=>{output.textContent=Number(input.value).toFixed(spec.step<.01?3:2);services.ui.syncRangeFill(input);onChange(Number(input.value));},{signal:innerAbort?.signal||signal});row.append(caption,output,input);container.append(row);services.ui.syncRangeFill(input);
    let exposeButton=null;if(onExpose){const btn=el('button','p-expose',exposed?'● Открыт в параметрах графа':'＋ Открыть параметр');exposeButton=btn;btn.type='button';btn.addEventListener('click',onExpose,{signal:innerAbort?.signal||signal});container.append(btn);}
    return {input,output,spec,exposeButton};
  }
  function rebuild(s,n){
    innerAbort?.abort();innerAbort=new AbortController();controlMap=new Map();host.replaceChildren();
    if(!n){host.append(el('p','p-section-label','ПРОЕКТ МАТЕРИАЛА'));const nameRow=el('label','p-field','Название');const name=el('input');name.value=s.project.name;name.maxLength=80;name.addEventListener('change',()=>safe(()=>graph.rename(name.value)),{signal:innerAbort.signal});nameRow.append(name);host.append(nameRow);
      const resolution=el('label','p-field','Разрешение графа');const sel=el('select');for(const value of [128,256,512,1024,2048]){const opt=el('option',null,`${value} × ${value}`);opt.value=value;sel.append(opt);}sel.value=s.project.resolution;sel.addEventListener('change',()=>safe(()=>graph.setResolution(sel.value)),{signal:innerAbort.signal});resolution.append(sel);host.append(resolution);
      const seed={label:'Случайное зерно',min:0,max:999,step:1};const control=rangeControl(host,seed,s.project.seed,v=>safe(()=>graph.setSeed(v)));controlMap.set('$seed',control);host.append(el('p','p-small','Выберите узел в графе, чтобы редактировать его свойства. Выходы могут назначаться каналам материала.'));return;
    }
    const def=NODE_TYPES[n.type];host.append(el('p','p-section-label','ВЫБРАННЫЙ УЗЕЛ'));const heading=el('div','p-node-heading');const icon=el('span','p-node-heading-icon','✣'),text=el('div');text.append(el('strong',null,def.label),el('small',null,n.id));heading.append(icon,text);host.append(heading,el('p','p-intro',def.description));
    const deleteButton=el('button','p-text-button','Удалить узел');deleteButton.addEventListener('click',()=>safe(()=>graph.removeNode(n.id)),{signal:innerAbort.signal});host.append(deleteButton,el('div','p-inspector-sep'));
    for(const [key,spec] of Object.entries(def.params)){
      if(spec.kind==='code'){host.append(el('p','p-small','Откройте вкладку «Код GLSL», чтобы изменить этот узел.'));continue;}
      if(spec.kind==='image'){
        const label=el('label','p-upload','＋ Загрузить PNG / JPEG / WebP');const input=el('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.hidden=true;input.addEventListener('change',()=>{const file=input.files[0];if(!file)return;if(file.size>8*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){report('Изображение должно быть PNG/JPEG/WebP до 8 МиБ.');return;}const reader=new FileReader();reader.onload=()=>safe(()=>{graph.setParam(n.id,'src',reader.result,{coalesce:false});graph.setParam(n.id,'name',file.name,{coalesce:false});});reader.readAsDataURL(file);},{signal:innerAbort.signal});label.append(input);host.append(label);continue;
      }
      const isExposed=s.project.exposed.some(p=>p.node===n.id&&p.param===key),toggle=()=>safe(()=>{const existing=graph.value.project.exposed.find(p=>p.node===n.id&&p.param===key);existing?graph.unexpose(existing.id):graph.expose(n.id,key);});
      if(spec.kind==='range'){
        const ctrl=rangeControl(host,spec,n.params[key],v=>safe(()=>graph.setParam(n.id,key,v)),toggle,isExposed);ctrl.input.dataset.param=key;ctrl.exposeButton.dataset.exposeParam=key;controlMap.set(key,ctrl);
      }else if(spec.kind==='color'){
        const label=el('label','p-field',spec.label),input=el('input');input.type='color';input.dataset.param=key;input.value=n.params[key];input.addEventListener('input',()=>safe(()=>graph.setParam(n.id,key,input.value)),{signal:innerAbort.signal});label.append(input);host.append(label);const btn=el('button','p-expose',isExposed?'● Открыт в параметрах графа':'＋ Открыть параметр');btn.type='button';btn.dataset.exposeParam=key;btn.addEventListener('click',toggle,{signal:innerAbort.signal});host.append(btn);controlMap.set(key,{input,spec});
      }else if(spec.kind==='choice'){
        const label=el('label','p-field',spec.label),input=el('select');input.dataset.param=key;spec.choices.forEach((choice,i)=>{const o=el('option',null,n.type==='output'&&key==='usage'?`${OUTPUT_LABELS[choice]} · ${choice}`:choice);o.value=i;input.append(o);});input.value=n.params[key];input.addEventListener('change',()=>safe(()=>graph.setParam(n.id,key,Number(input.value),{coalesce:false})),{signal:innerAbort.signal});label.append(input);host.append(label);const btn=el('button','p-expose',isExposed?'● Открыт в параметрах графа':'＋ Открыть параметр');btn.type='button';btn.dataset.exposeParam=key;btn.addEventListener('click',toggle,{signal:innerAbort.signal});host.append(btn);controlMap.set(key,{input,spec});
      }else if(spec.kind==='text'){
        const label=el('label','p-field',spec.label),input=el('input');input.value=n.params[key];input.addEventListener('change',()=>safe(()=>graph.setParam(n.id,key,input.value)),{signal:innerAbort.signal});label.append(input);host.append(label);controlMap.set(key,{input,spec});
      }
    }
  }
  function rebuildExposed(s){
    exposedAbort?.abort();exposedAbort=new AbortController();exposedMap=new Map();exposedHost.replaceChildren(el('p','p-section-label',`ПАРАМЕТРЫ ГРАФА · ${s.project.exposed.length}`));
    if(!s.project.exposed.length){exposedHost.append(el('p','p-small','Откройте параметры узлов, чтобы управлять материалом из одной панели.'));return;}
    for(const p of s.project.exposed){const n=s.project.nodes.find(n=>n.id===p.node),spec=n&&NODE_TYPES[n.type].params[p.param];if(!spec)continue;const wrap=el('div','p-exposed-item'),title=el('div','p-exposed-title'),name=el('strong',null,p.label),remove=el('button','p-text-button','×');remove.title='Убрать параметр';remove.addEventListener('click',()=>safe(()=>graph.unexpose(p.id)),{signal:exposedAbort.signal});title.append(name,remove);wrap.append(title);
      const input=el(spec.kind==='choice'?'select':'input');input.dataset.exposedParam=p.id;if(spec.kind==='range'){const row=el('label','range-row'),span=el('span',null,n.id),out=el('output');input.type='range';input.min=spec.min;input.max=spec.max;input.step=spec.step;input.value=n.params[p.param];out.textContent=Number(input.value).toFixed(2);row.append(span,out,input);input.addEventListener('input',()=>safe(()=>graph.setParam(p.node,p.param,Number(input.value))),{signal:exposedAbort.signal});wrap.append(row);services.ui.syncRangeFill(input);exposedMap.set(p.id,{input,out,p,spec});}
      else if(spec.kind==='color'){input.type='color';input.value=n.params[p.param];input.addEventListener('input',()=>safe(()=>graph.setParam(p.node,p.param,input.value)),{signal:exposedAbort.signal});wrap.append(input);exposedMap.set(p.id,{input,p,spec});}
      else if(spec.kind==='choice'){for(const [i,choice] of spec.choices.entries()){const option=el('option',null,n.type==='output'&&p.param==='usage'?`${OUTPUT_LABELS[choice]} · ${choice}`:choice);option.value=i;input.append(option);}input.value=n.params[p.param];input.addEventListener('change',()=>safe(()=>graph.setParam(p.node,p.param,Number(input.value),{coalesce:false})),{signal:exposedAbort.signal});wrap.append(input);exposedMap.set(p.id,{input,p,spec});}
      exposedHost.append(wrap);
    }
  }
  function sync(s){
    const n=s.project.nodes.find(x=>x.id===s.selected),exposure=JSON.stringify(s.project.exposed),next=`${n?.id||'project'}:${exposure}`;
    if(selectedKey!==next){selectedKey=next;rebuild(s,n);}else for(const [key,ctrl] of controlMap){const value=key==='$seed'?s.project.seed:n?.params[key];if(value!==undefined){ctrl.input.value=value;if(ctrl.output)ctrl.output.textContent=Number(value).toFixed(ctrl.spec.step<.01?3:2);if(ctrl.input.type==='range')services.ui.syncRangeFill(ctrl.input);}}
    if(exposedKey!==exposure){exposedKey=exposure;rebuildExposed(s);}else for(const {input,out,p,spec} of exposedMap.values()){const src=s.project.nodes.find(n=>n.id===p.node);if(!src)continue;input.value=src.params[p.param];if(out)out.textContent=Number(input.value).toFixed(2);if(input.type==='range')services.ui.syncRangeFill(input);}
  }
  const off=graph.subscribe(sync);
  return ()=>{off();innerAbort?.abort();exposedAbort?.abort();abort.abort();};
}
export default Object.freeze({...passports.properties,activate});
