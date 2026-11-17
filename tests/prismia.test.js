import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  PRISMIA_VERSION, ShaderEngine, createPrismiaRegistry, collectShaderEntries,
  baseMaterialsOf, resetBaseMaterials, markDerived, isDerivedMaterial,
  DirectionalShadowVolume, LOOK_PROFILES, createLookMixer,
} from '../src/index.js';

test('public package entry points expose a single Prismia implementation', async () => {
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(PRISMIA_VERSION,pkg.version);
  assert.deepEqual(Object.keys(pkg.exports).sort(),[
    '.', './graph', './lighting', './materials', './package.json', './presets',
    './scopes', './shaders', './studio', './styles.css',
  ].sort());
  const root=await import('fws-prismia'), shaders=await import('fws-prismia/shaders');
  assert.equal(root.ShaderEngine,ShaderEngine);assert.equal(shaders.ShaderEngine,ShaderEngine);
  assert.equal(root.createPrismiaRegistry,createPrismiaRegistry);
});

test('source snapshots and Prismia tags stay correct when the host replaces a material', () => {
  const source=new THREE.MeshStandardMaterial(),replacement=new THREE.MeshStandardMaterial();
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),source);
  assert.equal(baseMaterialsOf(mesh)[0],source);
  const derived=markDerived(source.clone(),{presetId:'clay',source,target:'character'});
  assert(isDerivedMaterial(derived));
  assert.equal(derived.userData.shaderPreset,'clay');
  assert.deepEqual(derived.userData.prismiaDerived,{presetId:'clay',target:'character',sourceUuid:source.uuid});
  mesh.material=derived;assert.equal(baseMaterialsOf(mesh)[0],source);
  mesh.material=replacement;assert.equal(baseMaterialsOf(mesh)[0],replacement);
  resetBaseMaterials(mesh);assert.equal(baseMaterialsOf(mesh)[0],replacement);
  derived.dispose();source.dispose();replacement.dispose();mesh.geometry.dispose();
});

test('catalog is reusable and world surfaces are selectable for all host targets', () => {
  const a=createPrismiaRegistry(), b=createPrismiaRegistry();
  assert.notEqual(a,b); assert.equal(a.size,20);
  const targets=['world','preview','character','face','hair','clothing-top','clothing-outerwear','clothing-bottom','clothing-shoes'];
  const engine=new ShaderEngine({registry:a,targets});
  for (const id of ['wet-asphalt','sunrise-ground','clearcoat-paint']) {
    assert(a.has(id));
    for(const target of targets) {
      assert(a.list({target}).some(p=>p.id===id),`${id}: ${target} in list`);
      assert(engine.setSelection(target,id),`${id}: ${target} accepted`);
    }
  }
  engine.dispose();a.unregister('pbr'); assert(b.has('pbr'));
});

test('Prismia creates animated wet materials, preserves the source and restores on reset', () => {
  const registry=createPrismiaRegistry(), engine=new ShaderEngine({registry,targets:['world']});
  const texture=new THREE.Texture(), original=new THREE.MeshStandardMaterial({color:0x999999,map:texture});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),original), root=new THREE.Group(); root.add(mesh);
  assert(engine.setSelection('world','wet-asphalt'));
  const result=engine.applyToObject(root,{defaultTarget:'world'}); assert.equal(result.converted,1);
  const wet=mesh.material; assert.notEqual(wet,original); assert.equal(wet.map,texture);
  assert.equal(wet.userData.shaderPreset,'wet-asphalt');
  assert.deepEqual(wet.userData.prismiaDerived,{presetId:'wet-asphalt',target:'world',sourceUuid:original.uuid});
  let disposed=0;wet.addEventListener('dispose',()=>disposed++);
  engine.update(4.2); assert.equal(wet.userData.prismUniforms.prismTime.value,4.2);
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <worldpos_vertex>',fragmentShader:'#include <common>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>'};
  wet.onBeforeCompile(shader,{});
  assert(shader.vertexShader.includes('instanceMatrix')); assert(shader.fragmentShader.includes('prismGradient'));
  assert.equal(shader.uniforms.prismTime.value,4.2); assert.match(wet.customProgramCacheKey(),/wet/);
  assert.equal(collectShaderEntries(root,{defaultTarget:'world'})[0].material,original);
  assert(engine.setSelection('world','sunrise-ground'));engine.applyToObject(root,{defaultTarget:'world'});
  assert.equal(disposed,1); assert.equal(mesh.material.userData.prismSurface,'stone');
  engine.setSelection('world','original');engine.applyToObject(root,{defaultTarget:'world'});
  assert.equal(mesh.material,original);assert.equal(original.map,texture);engine.dispose();
});

test('directional volume covers moving subjects and nearby distant casters', () => {
  const scene=new THREE.Scene(), light=new THREE.DirectionalLight();light.position.set(-3,5,4);scene.add(light);
  light.shadow.mapSize.set(2048,2048);
  const volume=new DirectionalShadowVolume({scene,light,extent:22,distance:60,depth:140});
  for(const focus of [new THREE.Vector3(0,0,0),new THREE.Vector3(95,3,-120)]) {
    volume.update(focus,{viewDirection:new THREE.Vector3(0,0,-1),lead:4});light.shadow.updateMatrices(light);
    for (const delta of [[0,0,0],[12,0,0],[-12,0,0],[0,0,-16],[0,0,12],[0,8,0]]) {
      const p=focus.clone().add(new THREE.Vector3(...delta)).project(light.shadow.camera);
      assert(Math.abs(p.x)<1 && Math.abs(p.y)<1 && Math.abs(p.z)<1,`point ${delta} clipped at ${p.toArray()}`);
    }
  }
  assert.equal(light.shadow.camera.right-light.shadow.camera.left,44);
  volume.setExtent(3.2); assert.equal(light.shadow.camera.right-light.shadow.camera.left,6.4);
  assert.equal(volume.update({x:NaN,y:0,z:0}),false);
});

test('look blending interpolates in place without touching materials', () => {
  const scene=new THREE.Scene(), renderer={toneMappingExposure:1}, hemi=new THREE.HemisphereLight(), ambient=new THREE.AmbientLight(), key=new THREE.DirectionalLight(),fill=new THREE.DirectionalLight(),rim=new THREE.DirectionalLight();
  const mixer=createLookMixer({scene,renderer,hemiLight:hemi,ambientLight:ambient,keyLight:key,fillLight:fill,rimLight:rim});
  assert.equal(ambient.intensity,LOOK_PROFILES.studio.ambient);
  assert.equal(key.intensity,LOOK_PROFILES.studio.key);
  assert.equal(mixer.set('sunrise',{duration:1}),true);mixer.update(0.5);
  assert(key.intensity > LOOK_PROFILES.studio.key && key.intensity < LOOK_PROFILES.sunrise.key);
  mixer.update(0.5);assert.equal(key.intensity,LOOK_PROFILES.sunrise.key);assert.equal(renderer.toneMappingExposure,LOOK_PROFILES.sunrise.exposure);
  assert.equal(mixer.set('does-not-exist'),false);
});
