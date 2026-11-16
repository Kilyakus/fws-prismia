import {passports} from '../passports.js';
import {NODE_TYPES,NODE_CATEGORIES} from '../../graph/nodes.js';
import {MATERIAL_PRESETS,createMaterialPreset} from '../../materials/material-presets.js';
import {SURFACE_PRESETS} from '../../materials/surface.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
const iconFor=type=>({color:'◉',value:'◑',noise:'▒',cells:'◌',gradient:'◧',checker:'▦',bricks:'▤',weave:'▥',waves:'≈',shape:'◇',bitmap:'▧',blend:'◒',levels:'☷',gradientmap:'▨',posterize:'▥',threshold:'◒',invert:'◐',grayscale:'◔',blur:'░',sharpen:'✧',edge:'◈',transform:'↻',warp:'〰',normal:'◩',ao:'◕',channel:'☰',combine:'⊞',output:'↗',custom:'{}'})[type]||'◈';
export function activate({node,exchange,services}){
  const graph=exchange.channel('graph'),abort=new AbortController(),signal=abort.signal;
  const categories=node.querySelector('[data-categories]'),cards=node.querySelector('[data-library-cards]'),search=node.querySelector('[data-library-search]'),count=node.querySelector('[data-library-count]');
  let category='Материалы',query='',showGrid=true,generation=0,timer=0;let favorites=new Set();
  try{favorites=new Set(JSON.parse(localStorage.getItem('fws-prismia.favorites.v1')||'[]'));}catch{}
  const persist=()=>{try{localStorage.setItem('fws-prismia.favorites.v1',JSON.stringify([...favorites]));}catch{}};
  function catalog(){
    const nodes=Object.values(NODE_TYPES).map(d=>({kind:'node',id:d.id,label:d.label,description:d.description,category:d.category}));
    const materials=MATERIAL_PRESETS.map(x=>({...x,kind:'material',category:'Материалы'}));
    const styles=SURFACE_PRESETS.map(({id,label,description})=>({kind:'style',id,label,description,category:'Стили поверхности'}));
    return [...materials,...styles,...nodes];
  }
  function setFavorite(item){const key=`${item.kind}:${item.id}`;favorites.has(key)?favorites.delete(key):favorites.add(key);persist();draw();}
  function add(item){try{
    if(item.kind==='material'){
      if(!confirm('Открыть материал «'+item.label+'» вместо текущего графа? Предыдущий можно вернуть кнопкой «Отменить».'))return;
      graph.load(createMaterialPreset(item.id));services.message('Материал открыт. Цвета и стиль можно изменить.');
    }else if(item.kind==='style'){
      graph.applySurfacePreset(item.id);services.activatePanel('material');services.message('Стиль применён к текущему графу. Настройте его в панели «Материал».');
    }else if(services.addGraphNode){services.addGraphNode(item.id);}
    else{const i=graph.value.project.nodes.length;graph.addNode(item.id,{x:140+(i%4)*70,y:120+(i%5)*55});}
  }catch(error){services.message(error.message,true);}}
  function drawCategories(){categories.replaceChildren();for(const cat of NODE_CATEGORIES){const btn=el('button',cat===category?'is-active':'',cat);btn.type='button';btn.dataset.libraryCategory=cat;btn.setAttribute('aria-pressed',String(cat===category));btn.addEventListener('click',()=>{category=cat;draw();},{signal});categories.append(btn);}}
  function draw(){
    generation++;const current=generation;clearTimeout(timer);drawCategories();cards.replaceChildren();cards.classList.toggle('is-list',!showGrid);
    let items=catalog().filter(item=>category==='Все узлы'?item.kind==='node':category==='Избранное'?favorites.has(`${item.kind}:${item.id}`):item.category===category);
    if(query){const terms=query.toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);items=catalog().filter(item=>terms.every(t=>`${item.label} ${item.id} ${item.description} ${item.category}`.toLocaleLowerCase('ru').includes(t)));if(category==='Избранное')items=items.filter(i=>favorites.has(`${i.kind}:${i.id}`));}
    count.textContent=`${items.length} ${items.length===1?'ресурс':'ресурсов'}`;
    const pending=[];
    for(const item of items){
      const card=el('div','p-card');card.dataset.resource=`${item.kind}:${item.id}`;card.draggable=item.kind==='node';if(card.draggable)card.addEventListener('dragstart',e=>{e.dataTransfer.setData('application/x-prismia-node',item.id);e.dataTransfer.effectAllowed='copy';},{signal});
      const main=el('button','p-card-main');main.type='button';main.title=`${item.label} — ${item.description}`;const thumb=el('span','p-card-thumb');thumb.append(el('span','p-card-icon',item.kind==='material'?'◈':item.kind==='style'?'✦':iconFor(item.id)));const copy=el('span','p-card-copy');copy.append(el('strong',null,item.label),el('small',null,item.kind==='material'?'Готовый материал':item.kind==='style'?'Только стиль света':'Добавить узел'));main.append(thumb,copy);main.addEventListener('click',()=>add(item),{signal});
      const star=el('button','p-favorite',favorites.has(`${item.kind}:${item.id}`)?'★':'☆');star.type='button';star.title='Избранное';star.setAttribute('aria-label',`${favorites.has(`${item.kind}:${item.id}`)?'Убрать из':'Добавить в'} избранное: ${item.label}`);star.addEventListener('click',()=>setFavorite(item),{signal});card.append(main,star);cards.append(card);
      if(item.kind!=='style')pending.push({item,thumb});
    }
    if(!items.length)cards.append(el('p','p-empty','Нет результатов. Измените запрос или категорию.'));
    const next=()=>{if(signal.aborted||current!==generation||!pending.length)return;const {item,thumb}=pending.shift();try{const url=item.kind==='material'?services.runtime.exampleThumbnail(item.id):services.runtime.libraryNodeThumbnail(item.id);if(url){const img=el('img');img.alt='';img.src=url;thumb.replaceChildren(img);}}catch(error){console.warn('Миниатюра:',error);}timer=setTimeout(next,15);};timer=setTimeout(next,40);
  }
  search.addEventListener('input',()=>{query=search.value.trim();draw();},{signal});node.querySelector('[data-library-view]').addEventListener('click',()=>{showGrid=!showGrid;draw();},{signal});
  draw();return ()=>{generation++;clearTimeout(timer);abort.abort();};
}
export default Object.freeze({...passports.library,activate});
