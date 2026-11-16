/** Small independent state channel for view, material and lighting settings. */
export function createViewState(initial={}){
  const defaults={mode:'graph',preset:'cinematic',shape:'sphere',look:'studio',exposure:1.08,key:1,ambient:1,rotation:0,grid:true,shadows:true,autoRotate:false,bumpScale:.03,tint:'#ffffff',roughness:1,metalness:1,normalStrength:1,clearcoat:0,coatRoughness:.3,aoIntensity:1};
  let state={...defaults,...initial},listeners=new Set(),disposed=false;
  const normalize=(key,value)=>{
    if(['grid','shadows','autoRotate'].includes(key))return !!value;
    if(key==='mode')return ['graph','preset'].includes(value)?value:'graph';
    if(key==='shape')return ['sphere','torus','cube','plane','model'].includes(value)?value:'sphere';
    if(key==='look')return ['studio','sunrise','overcast','night'].includes(value)?value:'studio';
    if(key==='preset')return String(value).slice(0,80);
    if(key==='tint')return /^#[0-9a-f]{6}$/i.test(String(value))?String(value).toLowerCase():'#ffffff';
    const bounds={exposure:[.2,3],key:[0,3],ambient:[0,3],rotation:[-180,180],bumpScale:[0,.3],roughness:[0,1],metalness:[0,1],normalStrength:[0,3],clearcoat:[0,1],coatRoughness:[0,1],aoIntensity:[0,1]};
    if(bounds[key])return Math.min(bounds[key][1],Math.max(bounds[key][0],Number(value)||0));
    throw new Error(`Неизвестная настройка: ${key}`);
  };
  const api={get value(){return {...state};},subscribe(fn,{immediate=true}={}){listeners.add(fn);if(immediate)fn(api.value,{kind:'init'});return()=>listeners.delete(fn);},
    set(key,value){if(disposed)throw new Error('Состояние освобождено');const next=normalize(key,value);if(state[key]===next)return false;state={...state,[key]:next};for(const fn of [...listeners])fn(api.value,{kind:key});return true;},
    reset(){state={...defaults};for(const fn of [...listeners])fn(api.value,{kind:'reset'});},dispose(){disposed=true;listeners.clear();}};
  return Object.freeze(api);
}
/** Runtime notifications carry metadata only; WebGL ownership remains internal. */
export function createRenderState(){
  let data={ready:false,status:'Подготовка WebGL…',error:'',renderVersion:0,nodeCount:0,outputCount:0},listeners=new Set();
  return {get value(){return {...data};},subscribe(fn,{immediate=true}={}){listeners.add(fn);if(immediate)fn({...data},{kind:'init'});return()=>listeners.delete(fn);},
    update(patch){data={...data,...patch};for(const fn of [...listeners])fn({...data},{kind:'render'});},dispose(){listeners.clear();}};
}
