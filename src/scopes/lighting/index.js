import {passports} from '../passports.js';
export function activate({node,exchange,services}){
  const view=exchange.channel('view'),abort=new AbortController(),signal=abort.signal;
  for(const input of node.querySelectorAll('[data-view-range]'))input.addEventListener('input',()=>view.set(input.dataset.viewRange,input.value),{signal});
  for(const input of node.querySelectorAll('[data-view-select]'))input.addEventListener('change',()=>view.set(input.dataset.viewSelect,input.value),{signal});
  for(const input of node.querySelectorAll('[data-view-check]'))input.addEventListener('change',()=>view.set(input.dataset.viewCheck,input.checked),{signal});
  const off=view.subscribe(s=>{for(const input of node.querySelectorAll('[data-view-range]')){const key=input.dataset.viewRange;input.value=s[key];node.querySelector(`[data-output="${key}"]`).textContent=key==='rotation'?`${Math.round(s[key])}°`:Number(s[key]).toFixed(2);services.ui.syncRangeFill(input);}for(const input of node.querySelectorAll('[data-view-select]'))input.value=s[input.dataset.viewSelect];for(const input of node.querySelectorAll('[data-view-check]'))input.checked=s[input.dataset.viewCheck];});
  return ()=>{off();abort.abort();};
}
export default Object.freeze({...passports.lighting,activate});
