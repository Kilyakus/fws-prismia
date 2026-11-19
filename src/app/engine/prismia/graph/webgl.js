import * as THREE from 'three';
import { NODE_TYPES, outputUsage } from './nodes.js';
import { validateProject, topologicalNodes } from './document.js';
import { compileNodeFragment, validateNodeFragment } from './compiler.js';
import { createSurfaceMaterial } from '../materials/surface.js';

const vertex=`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;
const colorVec=hex=>new THREE.Vector3(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
function solidTexture(r,g,b,a=255){const t=new THREE.DataTexture(new Uint8Array([r,g,b,a]),1,1,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.needsUpdate=true;return t;}

/**
 * Incremental, texture-per-node WebGL evaluator. Targets belong to this
 * evaluator; consumers must detach materials before dispose. It uses the
 * renderer supplied by the host and restores the previous render target.
 */
export class GraphEvaluator {
  constructor(renderer,{onInvalidate=()=>{}}={}){
    if(!renderer?.isWebGLRenderer)throw new TypeError('GraphEvaluator: нужен THREE.WebGLRenderer');
    this.renderer=renderer;this.onInvalidate=onInvalidate;this.cache=new Map();this.bitmaps=new Map();this.revision=0;this.project=null;
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.geometry=new THREE.PlaneGeometry(2,2);this.placeholder=new THREE.MeshBasicMaterial();this.mesh=new THREE.Mesh(this.geometry,this.placeholder);this.scene.add(this.mesh);
    this.black=solidTexture(0,0,0);this.white=solidTexture(255,255,255);this.disposed=false;
  }
  bitmap(src){
    if(!src)return this.black;
    if(this.bitmaps.has(src))return this.bitmaps.get(src).texture;
    const record={texture:this.black,ready:false,promise:null};this.bitmaps.set(src,record);
    record.promise=new Promise((resolve)=>{const image=new Image();image.onload=()=>{if(!this.disposed&&!record.cancelled){const tex=new THREE.Texture(image);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.NoColorSpace;tex.needsUpdate=true;record.texture=tex;record.ready=true;this.onInvalidate();}resolve();};
      image.onerror=()=>{record.error='Не удалось загрузить изображение';if(!this.disposed&&!record.cancelled)this.onInvalidate();resolve();};image.src=src;});return record.texture;
  }
  async prepareBitmaps(project){for(const n of project.nodes)if(n.type==='bitmap'&&n.params.src)this.bitmap(n.params.src);await Promise.all([...this.bitmaps.values()].map(x=>x.promise));for(const b of this.bitmaps.values())if(b.error)throw new Error(b.error);}
  evaluate(raw,{resolution=raw.resolution,time=0}={}){
    if(this.disposed)throw new Error('GraphEvaluator освобождён');
    const project=validateProject(raw), size=Math.max(16,Math.min(2048,Math.round(Number(resolution)||512)));
    if(project.nodes.length*size*size*4>256*1024*1024)throw new Error(`Граф из ${project.nodes.length} узлов на ${size}² превышает бюджет памяти 256 МиБ. Уменьшите разрешение.`);
    this.project=project;
    const byTarget=new Map();for(const edge of project.edges){if(!byTarget.has(edge.target))byTarget.set(edge.target,[]);byTarget.get(edge.target).push(edge);}
    const alive=new Set(project.nodes.map(n=>n.id));for(const [id,entry] of this.cache)if(!alive.has(id)){entry.target.dispose();entry.material?.dispose();this.cache.delete(id);}
    const sources=new Set(project.nodes.filter(n=>n.type==='bitmap').map(n=>n.params.src));for(const [src,b] of this.bitmaps)if(!sources.has(src)){b.cancelled=true;if(b.texture!==this.black)b.texture.dispose();this.bitmaps.delete(src);}
    for(const node of topologicalNodes(project)){
      const def=NODE_TYPES[node.type],incoming=byTarget.get(node.id)||[], deps=incoming.map(e=>[e.input,e.source,this.cache.get(e.source)?.revision||0]);
      const bitmapRevision=node.type==='bitmap'?(this.bitmaps.get(node.params.src)?.ready?1:0):0;
      const signature=JSON.stringify([node.type,node.params,deps,size,project.seed,bitmapRevision,(node.type==='custom'&&/\buTime\b/.test(node.params.code))?Math.floor(time*10):0]);
      let entry=this.cache.get(node.id);
      if(entry&&entry.signature===signature)continue;
      if(!entry||entry.type!==node.type||entry.size!==size){
        entry?.target.dispose();entry?.material?.dispose();
        const target=new THREE.WebGLRenderTarget(size,size,{depthBuffer:false,stencilBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
        target.texture.wrapS=target.texture.wrapT=THREE.RepeatWrapping;target.texture.generateMipmaps=false;target.texture.colorSpace=THREE.NoColorSpace;
        entry={type:node.type,size,target,material:null,signature:'',revision:0,code:''};this.cache.set(node.id,entry);
      }
      const code=compileNodeFragment(node);
      if(!entry.material||entry.code!==code){
        if(def.custom){const check=validateNodeFragment(this.renderer.getContext(),code);if(!check.ok)throw new Error(`GLSL «${node.id}»: ${check.error}`);}
        entry.material?.dispose();entry.material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:code,uniforms:{},depthTest:false,depthWrite:false,toneMapped:false});entry.code=code;
      }
      const uniforms={uTexel:{value:new THREE.Vector2(1/size,1/size)},uSeed:{value:project.seed},uTime:{value:time}};
      for(const input of def.inputs){const edge=incoming.find(e=>e.input===input.id);uniforms[`tex_${input.id}`]={value:(edge&&this.cache.get(edge.source)?.target.texture)|| (input.fallback==='white'?this.white:this.black)};}
      if(node.type==='bitmap')uniforms.tex_bitmap={value:this.bitmap(node.params.src)};
      for(const [key,spec] of Object.entries(def.params))if(['range','choice','color'].includes(spec.kind))uniforms[`p_${key}`]={value:spec.kind==='color'?colorVec(node.params[key]):Number(node.params[key])};
      // Three caches the uniform dictionary at first compilation: mutate it
      // in place so changing a parameter really affects later renders.
      for(const [key,uniform] of Object.entries(uniforms)){
        if(entry.material.uniforms[key])entry.material.uniforms[key].value=uniform.value;
        else entry.material.uniforms[key]=uniform;
      }
      this.mesh.material=entry.material;
      const previous=this.renderer.getRenderTarget();try{this.renderer.setRenderTarget(entry.target);this.renderer.render(this.scene,this.camera);}finally{this.renderer.setRenderTarget(previous);}
      entry.signature=signature;entry.revision=++this.revision;
    }
    return this.outputs();
  }
  outputs(){
    const out={};if(!this.project)return out;
    for(const n of this.project.nodes.filter(n=>n.type==='output'))if(this.project.edges.some(e=>e.target===n.id&&e.input==='source'))out[outputUsage(n)]=this.cache.get(n.id)?.target||null;
    return out;
  }
  target(nodeId){return this.cache.get(nodeId)?.target||null;}
  read(nodeId){const target=typeof nodeId==='string'?this.target(nodeId):nodeId;if(!target)throw new Error('Изображение узла пока недоступно.');const pixels=new Uint8Array(target.width*target.height*4);this.renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);return {width:target.width,height:target.height,pixels};}
  dispose(){if(this.disposed)return;this.disposed=true;for(const entry of this.cache.values()){entry.target.dispose();entry.material?.dispose();}this.cache.clear();for(const b of this.bitmaps.values())if(b.texture!==this.black)b.texture.dispose();this.bitmaps.clear();this.black.dispose();this.white.dispose();this.geometry.dispose();this.placeholder.dispose();}
}

/** Convert GPU pixels into a top-down Canvas for 2D preview and PNG export. */
export function pixelsToCanvas({width,height,pixels},canvas=document.createElement('canvas')){
  canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height),row=width*4;
  for(let y=0;y<height;y++)image.data.set(pixels.subarray((height-y-1)*row,(height-y)*row),y*row);
  ctx.putImageData(image,0,0);return canvas;
}

/** Copy graph outputs into owned DataTextures. Caller owns returned textures. */
export function createOutputTextures(evaluator){
  const textures={};for(const [usage,target] of Object.entries(evaluator.outputs())){
    const {width,height,pixels}=evaluator.read(target),texture=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat);
    texture.colorSpace=['baseColor','emissive'].includes(usage)?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;textures[usage]=texture;
  }return textures;
}

/** Three.js material from graph maps and generic surface settings. Caller owns textures. */
export function createGraphMaterial(textures={},options={}){
  const mat=createSurfaceMaterial(textures,options);mat.name=options.name||'Prismia graph material';return mat;
}
