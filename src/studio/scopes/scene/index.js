import {passports} from '../passports.js';
export function activate({node,exchange,services}){
  const view=exchange.channel('view'),abort=new AbortController(),signal=abort.signal,status=node.querySelector('[data-model-status]');
  for(const button of node.querySelectorAll('[data-shape]'))button.addEventListener('click',()=>view.set('shape',button.dataset.shape),{signal});
  for(const input of node.querySelectorAll('[data-view-check]'))input.addEventListener('change',()=>view.set(input.dataset.viewCheck,input.checked),{signal});
  const file=node.querySelector('[data-model-file]');file.addEventListener('change',async()=>{if(!file.files[0])return;status.textContent='Загружаем модель…';file.disabled=true;try{await services.runtime.importGlb(file.files[0]);status.textContent='Модель загружена локально.';}catch(error){status.textContent=error.message;}finally{file.value='';file.disabled=false;}},{signal});
  const off=view.subscribe(s=>{for(const b of node.querySelectorAll('[data-shape]'))b.setAttribute('aria-pressed',String(b.dataset.shape===s.shape));for(const input of node.querySelectorAll('[data-view-check]'))input.checked=s[input.dataset.viewCheck];});
  return ()=>{off();abort.abort();};
}
export default Object.freeze({...passports.scene,activate});
