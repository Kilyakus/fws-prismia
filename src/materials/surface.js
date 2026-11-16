import * as THREE from 'three';

/**
 * A small, composable surface model. Texture-graph maps and real-time lighting
 * are separate: the latter needs normals, light and camera at render time and
 * cannot be faithfully baked into a 2D texture. No third-party shader code.
 */
const range=(label,min,max,step,value)=>Object.freeze({label,kind:'range',min,max,step,default:value});
const color=(label,value)=>Object.freeze({label,kind:'color',default:value});
const bool=(label,value)=>Object.freeze({label,kind:'boolean',default:value});
export const SURFACE_SCHEMA=Object.freeze({
  model:Object.freeze({label:'Освещение',kind:'model',choices:Object.freeze(['pbr','toon','unlit']),default:'pbr'}),
  tint:color('Цветовой множитель','#ffffff'),
  roughness:range('Шероховатость · множитель карты',0,1,.01,1),
  roughnessBase:range('Шероховатость без карты',0,1,.01,.65),
  metalness:range('Металличность · множитель карты',0,1,.01,1),
  metalnessBase:range('Металличность без карты',0,1,.01,0),
  normalStrength:range('Сила normal',0,3,.01,1),
  bumpScale:range('Рельеф из высоты',0,.3,.005,.03),
  clearcoat:range('Верхнее покрытие',0,1,.01,0),
  coatRoughness:range('Шероховатость покрытия',0,1,.01,.3),
  aoIntensity:range('Сила AO',0,1,.01,1),
  emissionStrength:range('Яркость свечения',0,4,.01,1),
  opacity:range('Непрозрачность',0,1,.01,1),
  alphaTest:range('Порог вырезания',0,1,.01,0),
  doubleSided:bool('Двусторонняя поверхность',false),
  toonSteps:range('Ступени света',2,8,1,3),
  toonShift:range('Положение границы света',-.4,.4,.01,0),
  toonSoftness:range('Мягкость границы',.005,.49,.005,.08),
  shadowColor:color('Цвет тени','#77758e'),
  specularStrength:range('Яркость блика',0,3,.01,.3),
  specularSize:range('Размер блика',0,1,.01,.45),
  specularColor:color('Цвет блика','#ffffff'),
  rimStrength:range('Сила краевого света',0,3,.01,0),
  rimPower:range('Резкость краевого света',.5,8,.1,3),
  rimColor:color('Цвет краевого света','#ffffff'),
  outlineWidth:range('Толщина контура',0,.08,.001,0),
  outlineColor:color('Цвет контура','#251f30'),
});
export const SURFACE_DEFAULTS=Object.freeze(Object.fromEntries(Object.entries(SURFACE_SCHEMA).map(([key,spec])=>[key,spec.default])));

/** Validate old or new project data. Unknown fields are deliberately ignored. */
export function validateSurface(raw={}){
  if(raw==null)raw={};
  if(typeof raw!=='object'||Array.isArray(raw))throw new TypeError('Настройки поверхности должны быть объектом.');
  const out={};
  for(const [key,spec] of Object.entries(SURFACE_SCHEMA)){
    const value=raw[key]??spec.default;
    if(spec.kind==='model'){
      if(!spec.choices.includes(value))throw new Error('Неизвестная модель освещения.');
      out[key]=value;
    }else if(spec.kind==='range'){
      const n=Number(value);out[key]=Number.isFinite(n)?Math.min(spec.max,Math.max(spec.min,n)):spec.default;
      if(spec.step===1)out[key]=Math.round(out[key]);
    }else if(spec.kind==='color')out[key]=typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():spec.default;
    else if(spec.kind==='boolean')out[key]=typeof value==='boolean'?value:spec.default;
  }
  return out;
}

const style=(id,label,description,values)=>Object.freeze({id,label,description,values:Object.freeze(validateSurface(values))});
/** These are editable parameter sets, not a separate shader per style. */
export const SURFACE_PRESETS=Object.freeze([
  style('physical','Физический','Освещение PBR, шероховатость и металлические отражения.',{}),
  style('toon-soft','Мягкий мульт','Ступени освещения с мягкими тенями и краевым светом.',{model:'toon',toonSteps:4,toonSoftness:.16,shadowColor:'#7d7893',specularStrength:.35,rimStrength:.3,rimPower:3.5}),
  style('toon-graphic','Графичный мульт','Чёткая тень, блик и тонкий геометрический контур.',{model:'toon',toonSteps:2,toonSoftness:.025,shadowColor:'#5b526d',specularStrength:.35,specularSize:.3,rimStrength:.2,outlineWidth:.012}),
  style('toon-glossy','Глянцевый мульт','Мультяшный свет и выразительный настраиваемый блик.',{model:'toon',toonSteps:3,toonSoftness:.08,shadowColor:'#77708b',specularStrength:1.1,specularSize:.58,rimStrength:.25}),
  style('unlit','Без освещения','Цвет из графа без влияния источников света.',{model:'unlit'}),
  style('rim-light','С краевой подсветкой','Физическая поверхность с цветной подсветкой краёв.',{rimStrength:.8,rimColor:'#a9caff',rimPower:2.7}),
]);
export function listSurfacePresets(){return SURFACE_PRESETS.map(({id,label,description})=>({id,label,description}));}
export function createSurfacePreset(id='physical'){
  const entry=SURFACE_PRESETS.find(item=>item.id===id);if(!entry)throw new Error(`Неизвестный стиль поверхности: ${id}`);
  return {...entry.values};
}

function installRealtimeEffects(material,surface,textures){
  const uniforms={
    prismRimColor:{value:new THREE.Color(surface.rimColor)},prismRimStrength:{value:surface.rimStrength},prismRimPower:{value:surface.rimPower},
    prismRimMask:{value:textures.rimMask||null},prismHasRimMask:{value:textures.rimMask?1:0},
    prismSpecMask:{value:textures.specularMask||null},prismHasSpecMask:{value:textures.specularMask?1:0},
    prismSteps:{value:surface.toonSteps},prismShift:{value:surface.toonShift},prismSoft:{value:surface.toonSoftness},
    prismShadowColor:{value:new THREE.Color(surface.shadowColor)},prismSpecColor:{value:new THREE.Color(surface.specularColor)},
    prismSpecStrength:{value:surface.specularStrength},prismSpecSize:{value:surface.specularSize},
  };
  const declarations=`
varying vec2 vPrismUv;
uniform vec3 prismRimColor; uniform float prismRimStrength; uniform float prismRimPower;
uniform sampler2D prismRimMask; uniform float prismHasRimMask;
uniform sampler2D prismSpecMask; uniform float prismHasSpecMask;
uniform float prismSteps; uniform float prismShift; uniform float prismSoft;
uniform vec3 prismShadowColor; uniform vec3 prismSpecColor; uniform float prismSpecStrength; uniform float prismSpecSize;
`;
  const rim=`
  float prismRim=pow(1.0-clamp(dot(normalize(normal),normalize(vViewPosition)),0.0,1.0),prismRimPower);
  float prismRimTex=prismHasRimMask>0.5?texture2D(prismRimMask,vPrismUv).r:1.0;
  totalEmissiveRadiance+=prismRimColor*prismRimStrength*prismRim*prismRimTex;
`;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vPrismUv;')
      .replace('#include <uv_vertex>','#include <uv_vertex>\nvPrismUv=uv;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+declarations)
      .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n'+rim);
    if(surface.model==='toon'){
      const gradient=`
vec3 getGradientIrradiance(vec3 n,vec3 l){
  float x=clamp(dot(n,l)*0.5+0.5+prismShift,0.0,0.99999)*(prismSteps-1.0);
  float band=(floor(x)+smoothstep(0.5-prismSoft,0.5+prismSoft,fract(x)))/(prismSteps-1.0);
  return mix(prismShadowColor,vec3(1.0),clamp(band,0.0,1.0));
}`;
      const original=THREE.ShaderChunk.lights_toon_pars_fragment;
      const anchor='reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';
      if(!original.includes(anchor))throw new Error('Несовместимая версия Three.js: toon lighting.');
      const lighting=original.replace(anchor,`${anchor}
  vec3 prismHalf=normalize(directLight.direction+geometryViewDir);
  float prismHighlight=pow(max(dot(geometryNormal,prismHalf),0.0),mix(160.0,4.0,prismSpecSize));
  float prismSpecTex=prismHasSpecMask>0.5?texture2D(prismSpecMask,vPrismUv).r:1.0;
  reflectedLight.directSpecular+=directLight.color*prismSpecColor*prismSpecStrength*prismSpecTex*smoothstep(.42,.58,prismHighlight);
`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <gradientmap_pars_fragment>',gradient)
        .replace('#include <lights_toon_pars_fragment>',lighting)
        .replace('reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance','reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + totalEmissiveRadiance');
    }else if(surface.model==='unlit'){
      shader.fragmentShader=shader.fragmentShader.replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        'vec3 outgoingLight = diffuseColor.rgb + totalEmissiveRadiance;');
    }
  };
  material.customProgramCacheKey=()=>`prismia-surface-v1:${surface.model}`;
  material.userData.prismiaSurface={...surface};
}

/** Caller owns the material; input textures remain owned by the caller. */
export function createSurfaceMaterial(textures={},settings={}){
  const s=validateSurface(settings),common={
    name:'Prismia surface',color:new THREE.Color(s.tint),map:textures.baseColor||null,
    normalMap:textures.normal||null,bumpMap:textures.normal?null:(textures.height||null),bumpScale:s.bumpScale,
    normalScale:new THREE.Vector2(s.normalStrength,s.normalStrength),aoMap:textures.ambientOcclusion||null,aoMapIntensity:s.aoIntensity,
    emissiveMap:textures.emissive||null,emissive:textures.emissive?0xffffff:0x000000,emissiveIntensity:s.emissionStrength,
    alphaMap:textures.opacity||null,opacity:s.opacity,alphaTest:s.alphaTest,transparent:s.opacity<.999||!!textures.opacity,
    side:s.doubleSided?THREE.DoubleSide:THREE.FrontSide,
  };
  const material=s.model==='toon'?new THREE.MeshToonMaterial(common):new THREE.MeshPhysicalMaterial({...common,
    roughness:textures.roughness?s.roughness:s.roughnessBase,metalness:textures.metallic?s.metalness:s.metalnessBase,
    roughnessMap:textures.roughness||null,metalnessMap:textures.metallic||null,clearcoat:s.clearcoat,clearcoatRoughness:s.coatRoughness});
  installRealtimeEffects(material,s,textures);return material;
}

/**
 * Optional inverted-hull outline. Attaches child meshes, does not own geometry,
 * and must be disposed before replacing the host mesh. It is object-space,
 * skips instanced meshes and does not trace alpha cutouts or material groups.
 */
export function attachSurfaceOutlines(root,settings={}){
  const s=validateSurface(settings),meshes=[];let disposed=false;
  if(!root?.traverse||!s.outlineWidth)return {get count(){return meshes.length;},dispose(){disposed=true;}};
  const originals=[];root.traverse(mesh=>{if(mesh.isMesh&&!mesh.isInstancedMesh&&!mesh.userData?.prismiaOutline&&mesh.geometry?.attributes?.normal)originals.push(mesh);});
  for(const mesh of originals){
    const material=new THREE.MeshBasicMaterial({color:new THREE.Color(s.outlineColor),side:THREE.BackSide,depthWrite:true});
    material.onBeforeCompile=shader=>{shader.uniforms.prismOutlineWidth={value:s.outlineWidth};shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nuniform float prismOutlineWidth;')
      .replace('#include <begin_vertex>','vec3 transformed = vec3(position) + normalize(normal) * prismOutlineWidth;');};
    material.customProgramCacheKey=()=>`prismia-outline-v1`;
    const shell=mesh.isSkinnedMesh?new THREE.SkinnedMesh(mesh.geometry,material):new THREE.Mesh(mesh.geometry,material);
    if(mesh.isSkinnedMesh&&mesh.skeleton){shell.bindMode=mesh.bindMode;shell.bind(mesh.skeleton,mesh.bindMatrix);}
    if(mesh.morphTargetInfluences){shell.morphTargetInfluences=mesh.morphTargetInfluences;shell.morphTargetDictionary=mesh.morphTargetDictionary;}
    shell.name='Prismia outline';shell.userData.prismiaOutline=true;shell.castShadow=false;shell.receiveShadow=false;shell.frustumCulled=false;
    mesh.add(shell);meshes.push(shell);
  }
  return {get count(){return meshes.length;},dispose(){if(disposed)return;disposed=true;for(const shell of meshes){shell.removeFromParent();shell.material.dispose();}meshes.length=0;}};
}
