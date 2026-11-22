import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {zipSync,strToU8} from 'three/addons/libs/fflate.module.js';
import {ShaderEngine,createPrismiaRegistry,neutralEnvironment,disposeEnvironment,createLookMixer,LOOK_PROFILES,baseMaterialsOf} from '../../app/main.js';
import {GraphEvaluator,pixelsToCanvas,createOutputTextures,createGraphMaterial} from '../../app/engine/prismia/graph/webgl.js';
import {createMaterialPreset} from '../../app/engine/prismia/materials/material-presets.js';
import {attachSurfaceOutlines} from '../../app/engine/prismia/materials/surface.js';
import {createEmptyProject} from '../../app/engine/prismia/graph/document.js';
import {NODE_TYPES,nodeDefaults} from '../../app/engine/prismia/graph/nodes.js';

const saveBlob=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
// Some Chromium file:// builds discard a non-ASCII download filename.
const translit={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
const safeName=name=>String(name||'material').trim().replace(/[а-яё]/gi,ch=>{const value=translit[ch.toLowerCase()];return ch===ch.toUpperCase()?value.charAt(0).toUpperCase()+value.slice(1):value;}).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,50)||'material';
function disposeObject(root){if(!root)return;const geo=new Set(),mats=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geo.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});geo.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
const makeShape=id=>{
  let geometry=id==='torus'?new THREE.TorusKnotGeometry(.63,.21,120,20):id==='cube'?new THREE.BoxGeometry(1.4,1.4,1.4,6,6,6):id==='plane'?new THREE.PlaneGeometry(2.5,2.5,32,32):new THREE.SphereGeometry(.9,64,48);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xbebcb6,roughness:.6,metalness:.05}));
  if(id==='plane'){mesh.rotation.x=-Math.PI/2;mesh.position.y=.12;}else{geometry.computeBoundingBox();mesh.position.y=-geometry.boundingBox.min.y+.04;}
  const root=new THREE.Group();root.name='Preview';root.add(mesh);return root;
};
const disposeTextures=items=>Object.values(items||{}).forEach(t=>t?.dispose?.());

/** Prismia's graph/material extension uses the shared viewport renderer. */
export function createMaterialPreview(viewport,{graph,view,render}){
  const {renderer,scene,camera,canvas}=viewport;
  canvas.className='p-3d-canvas';canvas.setAttribute('aria-label','3D предпросмотр материала');canvas.tabIndex=0;
  camera.position.set(3.3,2.6,4.2);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.9,0);controls.enableDamping=true;controls.minDistance=1.6;controls.maxDistance=14;controls.update();
  const hemi=new THREE.HemisphereLight(0xffffff,0x666b77,.94),ambient=new THREE.AmbientLight(0xffffff,.4),key=new THREE.DirectionalLight(0xfff2e3,1.72),fill=new THREE.DirectionalLight(0xc9caff,.48),rim=new THREE.DirectionalLight(0xb8c6ff,.32);
  key.position.set(-3,5,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=4;key.shadow.camera.bottom=-4;key.shadow.camera.near=.5;key.shadow.camera.far=20;key.shadow.bias=-.00015;key.shadow.normalBias=.012;
  fill.position.set(4,3,-2);rim.position.set(-3,3,-4);scene.add(hemi,ambient,key,key.target,fill,rim);
  const looks=createLookMixer({scene,renderer,hemiLight:hemi,ambientLight:ambient,keyLight:key,fillLight:fill,rimLight:rim});
  scene.environment=neutralEnvironment(renderer);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:0x2d3038,roughness:.9}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const registry=createPrismiaRegistry(),engine=new ShaderEngine({registry,renderer,targets:['preview'],defaults:{preview:'original'}});
  let sampleRoot=null,outlines=null,textures={},disposed=false,refreshTimer=0,importToken=0,version=0,libraryEvaluator=null,hasTime=false,lastTimeRefresh=0,outputSignature='';
  const clock=new THREE.Clock();
  const evaluator=new GraphEvaluator(renderer,{onInvalidate:()=>schedule()});const thumbCache=new Map(),exampleCache=new Map();
  registry.addGroup({id:'graph',label:'Материал Prismia'});registry.register({id:'prismia-graph',label:'Материал графа',group:'graph',targets:['preview'],build:()=>createGraphMaterial(textures,graph.value.project.surface)});
  function replaceRoot(root){outlines?.dispose();outlines=null;engine.reset();if(sampleRoot){sampleRoot.removeFromParent();disposeObject(sampleRoot);}sampleRoot=root;root.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});scene.add(root);applyMaterial();}
  function applyMaterial(){if(!sampleRoot)return;outlines?.dispose();outlines=null;const state=view.value;engine.setSelection('preview',state.mode==='graph'?'prismia-graph':state.preset);engine.applyToObject(sampleRoot,{defaultTarget:'preview',force:true});if(state.mode==='graph')outlines=attachSurfaceOutlines(sampleRoot,graph.value.project.surface);}
  function syncLook(s){
    looks.set(s.look,{duration:0});const p=LOOK_PROFILES[s.look];renderer.toneMappingExposure=s.exposure;key.intensity=p.key*s.key;hemi.intensity=p.hemi*s.ambient;ambient.intensity=p.ambient*s.ambient;
    const a=s.rotation*Math.PI/180;key.position.set(-3*Math.cos(a)+4*Math.sin(a),5,4*Math.cos(a)+3*Math.sin(a));controls.autoRotate=s.autoRotate;
    if(renderer.shadowMap.enabled!==s.shadows){renderer.shadowMap.enabled=s.shadows;sampleRoot?.traverse(n=>{if(!n.isMesh)return;for(const m of [...baseMaterialsOf(n),...(Array.isArray(n.material)?n.material:[n.material])])if(m)m.needsUpdate=true;});floor.material.needsUpdate=true;}
  }
  function refresh(){
    if(disposed)return;clearTimeout(refreshTimer);refreshTimer=0;
    try{
      const p=graph.value.project;hasTime=p.nodes.some(n=>n.type==='custom'&&/\buTime\b/.test(n.params.code));evaluator.evaluate(p,{time:clock.elapsedTime});
      const outputs=evaluator.outputs();
      // Keep PBR textures/materials if the changed node is not downstream of
      // an output. This avoids repeated GPU readback for animated previews.
      const signature=JSON.stringify(Object.entries(outputs).map(([usage,target])=>[usage,target?.texture?.uuid]));
      const revisions=JSON.stringify(p.nodes.filter(n=>n.type==='output'&&p.edges.some(e=>e.target===n.id&&e.input==='source')).map(n=>[n.id,evaluator.cache.get(n.id)?.revision]));
      const nextSignature=signature+revisions;
      if(nextSignature!==outputSignature){const fresh=createOutputTextures(evaluator),old=textures;textures=fresh;outputSignature=nextSignature;applyMaterial();disposeTextures(old);}
      for(const id of thumbCache.keys())if(!evaluator.cache.has(id))thumbCache.delete(id);version++;
      render.update({ready:true,status:'Материал вычислен',error:'',renderVersion:version,nodeCount:p.nodes.length,outputCount:Object.keys(outputs).length});
    }catch(error){console.error(error);render.update({ready:true,status:'Ошибка графа',error:error?.message||String(error)});}
  }
  // A queued refresh reads the latest graph. Do not keep postponing it while
  // uTime ticks faster than a slow GPU can render.
  function schedule(){if(disposed||refreshTimer)return;refreshTimer=setTimeout(refresh,75);}
  let surfaceSignature='';
  const offGraph=graph.subscribe((s,event)=>{if(event.kind==='graph'||event.kind==='init'){const next=JSON.stringify(s.project.surface);if(next!==surfaceSignature){surfaceSignature=next;applyMaterial();}schedule();}});
  const offView=view.subscribe((s,event)=>{
    syncLook(s);
    if(event.kind==='mode'||event.kind==='preset'||event.kind==='reset')applyMaterial();
    if(event.kind==='shape'&&s.shape!=='model')replaceRoot(makeShape(s.shape));
  });
  replaceRoot(makeShape(view.value.shape));syncLook(view.value);
  // Publish the plugin API before notifying already-mounted scopes on reactivation.
  queueMicrotask(refresh);
  const offResize=viewport.onResize(({width,height})=>{camera.aspect=width/height;camera.updateProjectionMatrix();},{phase:'before'});
  viewport.observeResize();
  viewport.start(()=>{const dt=Math.min(clock.getDelta(),.05);looks.update(dt);engine.update(clock.elapsedTime);controls.update();viewport.render();if(hasTime&&clock.elapsedTime-lastTimeRefresh>.2){lastTimeRefresh=clock.elapsedTime;schedule();}},{driver:'renderer'});
  async function importGlb(file){
    if(!file||!file.name.toLowerCase().endsWith('.glb')||file.size>80*1024*1024)throw new Error('Нужен GLB до 80 МБ. Внешние файлы и сжатие Draco не поддерживаются.');
    const token=++importToken,buffer=await file.arrayBuffer();
    // GLB assets must be self-contained. Reject HTTP, relative paths and
    // other external URLs before GLTFLoader can make a network request.
    const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{
      if(/^(?:data:|blob:)/i.test(url))return url;
      throw new Error('Внешние ресурсы в GLB не поддерживаются. Встройте текстуры в файл.');
    });
    const gltf=await new Promise((ok,fail)=>new GLTFLoader(manager).parse(buffer,'',ok,fail));
    const model=gltf.scene;if(disposed||token!==importToken){disposeObject(model);return;}
    model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),max=Math.max(size.x,size.y,size.z);if(box.isEmpty()||!Number.isFinite(max)||max<=0){disposeObject(model);throw new Error('В GLB нет видимой геометрии.');}
    const center=box.getCenter(new THREE.Vector3()),scale=1.9/max,wrapper=new THREE.Group();model.scale.multiplyScalar(scale);model.position.set(-center.x*scale,-box.min.y*scale+.05,-center.z*scale);wrapper.add(model);replaceRoot(wrapper);view.set('shape','model');render.update({status:`Модель ${file.name} загружена локально`});
  }
  function preview(nodeId,canvas,{channel='rgba'}={}){
    const target=evaluator.target(nodeId);if(!target)return false;const source=evaluator.read(target);
    if(channel!=='rgba')for(let i=0;i<source.pixels.length;i+=4){const idx={r:0,g:1,b:2,a:3}[channel];const v=source.pixels[i+idx];source.pixels[i]=source.pixels[i+1]=source.pixels[i+2]=v;source.pixels[i+3]=255;}
    pixelsToCanvas(source,canvas);return true;
  }
  function thumbnail(nodeId){const entry=evaluator.cache.get(nodeId);if(!entry)return '';const hit=thumbCache.get(nodeId);if(hit?.revision===entry.revision)return hit.url;
    const source=pixelsToCanvas(evaluator.read(nodeId)),small=document.createElement('canvas');small.width=small.height=72;small.getContext('2d').drawImage(source,0,0,72,72);const url=small.toDataURL('image/png');thumbCache.set(nodeId,{revision:entry.revision,url});return url;}
  function exampleThumbnail(id){if(exampleCache.has(id))return exampleCache.get(id);libraryEvaluator ||= new GraphEvaluator(renderer);const p=createMaterialPreset(id);libraryEvaluator.evaluate(p,{resolution:96});const t=libraryEvaluator.outputs().baseColor;if(!t)return '';const url=pixelsToCanvas(libraryEvaluator.read(t)).toDataURL('image/png');exampleCache.set(id,url);return url;}
  function libraryNodeThumbnail(type){const key=`node:${type}`;if(exampleCache.has(key))return exampleCache.get(key);const def=Object.hasOwn(NODE_TYPES,type)?NODE_TYPES[type]:null;if(!def||type==='bitmap'||type==='custom')return '';libraryEvaluator ||= new GraphEvaluator(renderer);const p=createEmptyProject('thumbnail');p.resolution=128;p.nodes=[{id:'sample-noise',type:'noise',position:{x:0,y:0},params:nodeDefaults('noise')},{id:'sample-target',type,position:{x:0,y:0},params:nodeDefaults(type)}];p.edges=def.inputs.map((input,index)=>({id:`edge-${index+1}`,source:'sample-noise',target:'sample-target',input:input.id}));libraryEvaluator.evaluate(p,{resolution:96});const url=pixelsToCanvas(libraryEvaluator.read('sample-target')).toDataURL('image/png');exampleCache.set(key,url);return url;}
  async function exportMaps({resolution=512,usages=null}={}){
    const project=graph.value.project,temp=new GraphEvaluator(renderer);try{
      await temp.prepareBitmaps(project);temp.evaluate(project,{resolution,time:clock.elapsedTime});const outputs=temp.outputs();const wanted=usages?new Set(usages):null,entries={};
      for(const [usage,target] of Object.entries(outputs)){if(wanted&&!wanted.has(usage))continue;const canvas=pixelsToCanvas(temp.read(target));const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)throw new Error('Браузер не смог создать PNG.');entries[`${safeName(project.name)}_${usage}.png`]=new Uint8Array(await blob.arrayBuffer());}
      if(!Object.keys(entries).length)throw new Error('Нет подключённых выходов для экспорта.');
      entries['README.txt']=strToU8(`Prismia ${project.name}\nResolution: ${resolution}x${resolution}\nPNG: 8-bit RGBA. Base color and emissive are sRGB; other channels are linear data.\nThese images contain graph outputs only. Surface settings, outline and live lighting are not baked into PNG; save the Prismia JSON project as well.\n`);
      saveBlob(new Blob([zipSync(entries,{level:5})],{type:'application/zip'}),`${safeName(project.name)}-maps.zip`);return Object.keys(entries);
    }finally{temp.dispose();}
  }
  function snapshot(){viewport.render();renderer.domElement.toBlob(blob=>{if(blob)saveBlob(blob,'prismia-preview.png');},'image/png');}
  function resetCamera(){camera.position.set(3.3,2.6,4.2);controls.target.set(0,.9,0);controls.update();}
  return {renderer,scene,camera,controls,get subject(){return sampleRoot;},engine,evaluator,registry,refresh,preview,thumbnail,exampleThumbnail,libraryNodeThumbnail,importGlb,exportMaps,snapshot,resetCamera,
    dispose(){if(disposed)return;disposed=true;importToken++;clearTimeout(refreshTimer);offGraph();offView();offResize();viewport.disconnectResize();viewport.stop();outlines?.dispose();engine.dispose();if(sampleRoot){sampleRoot.removeFromParent();disposeObject(sampleRoot);}disposeTextures(textures);evaluator.dispose();libraryEvaluator?.dispose();scene.remove(floor,hemi,ambient,key,key.target,fill,rim);floor.geometry.dispose();floor.material.dispose();scene.environment=null;disposeEnvironment(renderer);controls.dispose();}};
}
