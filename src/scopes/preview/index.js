import {passports} from '../passports.js';
import {NODE_TYPES,outputUsage,OUTPUT_LABELS} from '../../graph/nodes.js';
export function activate({node,exchange,services}){
  const graph=exchange.channel('graph'),render=exchange.channel('render'),abort=new AbortController(),signal=abort.signal;
  const select=node.querySelector('[data-preview-select]'),canvas=node.querySelector('[data-preview-canvas]'),empty=node.querySelector('.p-preview-empty'),frame=node.querySelector('[data-preview-frame]');
  let state=graph.value,channel='rgba',tiled=false,zoom=1;
  function syncList(){const old=select.value;select.replaceChildren();for(const n of state.project.nodes){const opt=document.createElement('option');opt.value=n.id;opt.textContent=n.type==='output'?`Выход · ${OUTPUT_LABELS[outputUsage(n)]} (${outputUsage(n)})`:`${NODE_TYPES[n.type].label} · ${n.id}`;select.append(opt);}select.value=state.preview||old||state.project.nodes[0]?.id||'';}
  function draw(){const id=state.preview||select.value||state.project.nodes[0]?.id;if(!id){empty.hidden=false;return;}select.value=id;const temp=document.createElement('canvas');const ok=services.runtime.preview(id,temp,{channel});empty.hidden=ok;if(!ok)return;
    if(tiled){canvas.width=temp.width*3;canvas.height=temp.height*3;const ctx=canvas.getContext('2d');for(let y=0;y<3;y++)for(let x=0;x<3;x++)ctx.drawImage(temp,x*temp.width,y*temp.height);}else{canvas.width=temp.width;canvas.height=temp.height;canvas.getContext('2d').drawImage(temp,0,0);}
    canvas.style.transform=`scale(${zoom})`;const n=state.project.nodes.find(x=>x.id===id);node.querySelector('[data-preview-name]').textContent=n?`${NODE_TYPES[n.type].label}${n.type==='output'?' · '+OUTPUT_LABELS[outputUsage(n)]:''}`:'—';node.querySelector('[data-preview-size]').textContent=`${temp.width} × ${temp.height} · ${channel.toUpperCase()}`;
  }
  select.addEventListener('change',()=>graph.previewNode(select.value),{signal});
  for(const button of node.querySelectorAll('[data-channel]'))button.addEventListener('click',()=>{channel=button.dataset.channel;for(const b of node.querySelectorAll('[data-channel]'))b.setAttribute('aria-pressed',String(b===button));draw();},{signal});
  const tile=node.querySelector('[data-tile]');tile.addEventListener('click',()=>{tiled=!tiled;tile.setAttribute('aria-pressed',String(tiled));draw();},{signal});
  frame.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.5,Math.min(4,zoom*(e.deltaY<0?1.12:.89)));canvas.style.transform=`scale(${zoom})`;},{signal,passive:false});
  const offGraph=graph.subscribe((s,event)=>{state=s;if(['init','graph','preview'].includes(event.kind)){syncList();draw();}});
  const offRender=render.subscribe(()=>draw());
  return ()=>{offGraph();offRender();abort.abort();};
}
export default Object.freeze({...passports.preview,activate});
