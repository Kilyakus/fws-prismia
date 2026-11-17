import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SURFACE_SCHEMA,SURFACE_DEFAULTS,SURFACE_PRESETS,listSurfacePresets,createSurfacePreset,validateSurface,createSurfaceMaterial,attachSurfaceOutlines,MATERIAL_PRESETS,listMaterialPresets,createMaterialPreset} from '../api/materials.js';
import {createEmptyProject,createGraphStore,validateProject,OUTPUT_USAGES,OUTPUT_LABELS,NODE_TYPES,createGraphMaterial} from '../api/graph.js';
import {collectShaderEntries} from '../src/materials/collect.js';

test('surface styles and ready materials are generic, editable independent data',()=>{
  assert.equal(SURFACE_PRESETS.length,6);assert.equal(MATERIAL_PRESETS.length,15);
  assert.deepEqual(listSurfacePresets().map(p=>p.id),SURFACE_PRESETS.map(p=>p.id));
  assert.deepEqual(listMaterialPresets().map(p=>p.id),MATERIAL_PRESETS.map(p=>p.id));
  assert.ok(SURFACE_PRESETS.every(p=>Object.isFrozen(p.values)));
  for(const meta of MATERIAL_PRESETS){const a=createMaterialPreset(meta.id),b=createMaterialPreset(meta.id);assert.deepEqual(validateProject(a),a);assert.notEqual(a,b);a.surface.rimStrength=2.9;assert.notEqual(a.surface.rimStrength,b.surface.rimStrength);assert.ok(b.nodes.some(n=>n.type==='output'));}
  assert.throws(()=>createMaterialPreset('not-a-preset'),/Нет заготовки/);assert.throws(()=>createSurfacePreset('not-a-style'),/Неизвестный стиль/);
  assert.equal(createMaterialPreset('toon-ink').surface.model,'toon');assert.ok(createMaterialPreset('toon-ink').surface.outlineWidth>0);
  assert.ok(createMaterialPreset('luminous').nodes.some(n=>n.type==='output'&&OUTPUT_USAGES[n.params.usage]==='emissive'));
  assert.ok(NODE_TYPES.posterize&&NODE_TYPES.threshold);assert.ok(OUTPUT_USAGES.includes('rimMask')&&OUTPUT_USAGES.includes('specularMask'));
  assert.deepEqual(NODE_TYPES.output.params.usage.choices,OUTPUT_USAGES);assert.deepEqual(Object.keys(OUTPUT_LABELS),OUTPUT_USAGES);
  const starter=createMaterialPreset('starter');assert.equal(starter.nodes.length,4);assert.equal(starter.edges.length,2);assert.equal(starter.exposed.length,2);
});

test('old projects migrate, style edits round-trip and undo as graph transactions',()=>{
  const old=createEmptyProject();delete old.surface;assert.deepEqual(validateProject(old).surface,SURFACE_DEFAULTS);
  assert.equal(validateSurface({toonSteps:999,rimStrength:NaN}).toonSteps,8);assert.equal(validateSurface({rimStrength:NaN}).rimStrength,0);
  assert.throws(()=>validateSurface({model:'arbitrary shader'}),/модель/);assert.throws(()=>validateSurface([]),/объект/);
  const g=createGraphStore(createMaterialPreset('brick')),original=structuredClone(g.value.project.nodes);
  g.applySurfacePreset('toon-graphic');assert.equal(g.value.project.surface.model,'toon');assert.deepEqual(g.value.project.nodes,original);
  g.setSurface('rimStrength',1.25,{coalesce:false});assert.equal(g.value.project.surface.rimStrength,1.25);
  assert.throws(()=>g.setSurface('__proto__',{}),/Неизвестная/);assert.throws(()=>g.setSurface('model','other'),/модель/);
  g.undo();assert.equal(g.value.project.surface.rimStrength,createSurfacePreset('toon-graphic').rimStrength);g.undo();assert.equal(g.value.project.surface.model,'pbr');g.redo();assert.equal(g.value.project.surface.model,'toon');
  const restored=validateProject(JSON.parse(JSON.stringify(g.value.project)));assert.deepEqual(restored.surface,g.value.project.surface);
  g.setSurfaceValues({...restored.surface,outlineWidth:.02});assert.equal(g.value.project.surface.outlineWidth,.02);g.dispose();
});

test('surface materials preserve texture ownership and install lighting, masks, rim, unlit',()=>{
  const texture=new THREE.DataTexture(new Uint8Array([255,0,0,255]),1,1);let textureDisposed=false;texture.addEventListener('dispose',()=>{textureDisposed=true;});
  const pbr=createGraphMaterial({baseColor:texture},{rimStrength:1,roughnessBase:.82,metalnessBase:.7});assert.ok(pbr.isMeshPhysicalMaterial);assert.equal(pbr.map,texture);assert.equal(pbr.roughness,.82);assert.equal(pbr.metalness,.7);assert.equal(pbr.userData.prismiaSurface.rimStrength,1);
  const mapped=createSurfaceMaterial({roughness:texture,metallic:texture},{roughness:.23,metalness:.8,roughnessBase:.9,metalnessBase:.1});assert.equal(mapped.roughness,.23);assert.equal(mapped.metalness,.8);mapped.dispose();
  const toon=createSurfaceMaterial({baseColor:texture,rimMask:texture,specularMask:texture},createSurfacePreset('toon-soft'));assert.ok(toon.isMeshToonMaterial);
  const shader={vertexShader:THREE.ShaderLib.toon.vertexShader,fragmentShader:THREE.ShaderLib.toon.fragmentShader,uniforms:{}};toon.onBeforeCompile(shader,{});
  assert.match(shader.vertexShader,/vPrismUv=uv/);assert.match(shader.fragmentShader,/prismRimTex/);assert.match(shader.fragmentShader,/getGradientIrradiance/);assert.match(shader.fragmentShader,/prismHighlight/);assert.match(shader.fragmentShader,/reflectedLight\.directSpecular/);assert.equal(shader.uniforms.prismRimMask.value,texture);assert.equal(shader.uniforms.prismHasSpecMask.value,1);
  const unlit=createSurfaceMaterial({},createSurfacePreset('unlit'));const basic={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};unlit.onBeforeCompile(basic,{});assert.match(basic.fragmentShader,/outgoingLight = diffuseColor\.rgb \+ totalEmissiveRadiance/);
  assert.notEqual(pbr.customProgramCacheKey(),toon.customProgramCacheKey());pbr.dispose();toon.dispose();unlit.dispose();assert.equal(textureDisposed,false);texture.dispose();assert.equal(textureDisposed,true);
});

test('outlines share geometry and skeleton, skip instances, and release only owned resources',()=>{
  const geometry=new THREE.BoxGeometry(),sourceMaterial=new THREE.MeshBasicMaterial(),root=new THREE.Group(),mesh=new THREE.Mesh(geometry,sourceMaterial);root.add(mesh);
  const instance=new THREE.InstancedMesh(geometry,sourceMaterial,2);root.add(instance);
  const skinGeometry=new THREE.BoxGeometry();skinGeometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(skinGeometry.attributes.position.count*4),4));skinGeometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:skinGeometry.attributes.position.count*4},(_,i)=>i%4===0?1:0),4));
  const skinned=new THREE.SkinnedMesh(skinGeometry,sourceMaterial),bone=new THREE.Bone();skinned.add(bone);skinned.bind(new THREE.Skeleton([bone]));root.add(skinned);
  let geoDisposed=false;geometry.addEventListener('dispose',()=>{geoDisposed=true;});const manager=attachSurfaceOutlines(root,{outlineWidth:.02,outlineColor:'#123456'});
  assert.equal(manager.count,2);assert.equal(collectShaderEntries(root).length,3,'generated outline shells must not become Prismia inputs');const a=mesh.children.find(x=>x.userData.prismiaOutline),b=skinned.children.find(x=>x.userData.prismiaOutline);assert.equal(a.geometry,geometry);assert.equal(b.skeleton,skinned.skeleton);assert.equal(instance.children.length,0);
  const shader={vertexShader:THREE.ShaderLib.basic.vertexShader,uniforms:{}};a.material.onBeforeCompile(shader);assert.match(shader.vertexShader,/normalize\(normal\) \* prismOutlineWidth/);assert.equal(shader.uniforms.prismOutlineWidth.value,.02);
  manager.dispose();manager.dispose();assert.equal(manager.count,0);assert.equal(mesh.children.includes(a),false);assert.equal(geoDisposed,false);geometry.dispose();skinGeometry.dispose();sourceMaterial.dispose();
});
