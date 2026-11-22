import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPrismiaRegistry,ShaderEngine} from '../src/app/main.js';
import {migratePreviewLayout} from '../src/studio/layout.js';

test('public base presets preserve authored textures, flags, Phong lighting and restore the original',()=>{
 const tex=new THREE.Texture(),alpha=new THREE.Texture(),src=new THREE.MeshPhongMaterial({color:0xcccccc,map:tex,alphaMap:alpha,alphaTest:.3,shininess:14,specular:0x202020});
 src.toneMapped=true;src.polygonOffset=true;src.polygonOffsetFactor=-2;
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),src),registry=createPrismiaRegistry(),engine=new ShaderEngine({registry,targets:['preview']});
 for(const id of ['pbr','toon','unlit']){
  engine.setSelection('preview',id);engine.applyToObject(mesh,{defaultTarget:'preview'});const mat=mesh.material;
  assert.notEqual(mat,src);assert.equal(mat.map,tex);assert.equal(mat.alphaMap,alpha);assert.equal(mat.color.getHex(),src.color.getHex());assert.equal(mat.alphaTest,.3);assert.equal(mat.toneMapped,true);assert.equal(mat.polygonOffsetFactor,-2);
  if(id==='toon'){assert(mat.isMeshPhongMaterial);assert.equal(mat.shininess,14);assert.equal(mat.specular.getHex(),src.specular.getHex());const shader={fragmentShader:'#include <lights_phong_pars_fragment>'};mat.onBeforeCompile(shader,{});assert.match(shader.fragmentShader,/prismiaNdotL/);}
 }
 engine.setSelection('preview','original');engine.applyToObject(mesh,{defaultTarget:'preview'});assert.equal(mesh.material,src);engine.dispose();src.dispose();tex.dispose();alpha.dispose();mesh.geometry.dispose();
});
test('presets keep live uniform albedo rather than baking a stale shade map',()=>{
 const map=new THREE.Texture(),shade=new THREE.Texture(),src=new THREE.ShaderMaterial({uniforms:{map:{value:map},shadeMultiplyTexture:{value:shade},color:{value:new THREE.Color(0x88aaee)}}});
 const registry=createPrismiaRegistry();for(const id of ['pbr','toon','unlit']){const out=registry.get(id).build(src,{target:'character'});assert.equal(out.map,map);out.dispose();}src.dispose();map.dispose();shade.dispose();
});
test('legacy split layouts migrate without losing other panes; newer arrangements are left alone',()=>{
 const tab=(...widgets)=>({type:'tab-area',widgets,currentIndex:0});
 const legacy={type:'split-area',orientation:'horizontal',sizes:[.2,.8],children:[tab('library'),{type:'split-area',orientation:'vertical',sizes:[.5,.5],children:[{type:'split-area',orientation:'horizontal',sizes:[.44,.56],children:[tab('preview'),tab('viewport')]},tab('graph','code')]}]};
 const migrated=migratePreviewLayout(legacy);assert.deepEqual(migrated.children[0],tab('library'));assert.deepEqual(migrated.children[1].children[0],tab('viewport','preview'));assert.deepEqual(migrated.children[1].children[1],tab('graph','code'));assert.equal(legacy.children[1].children[0].children.length,2);assert.equal(migratePreviewLayout(migrated),migrated);
 assert.equal(migratePreviewLayout(tab('viewport','graph')).widgets.includes('preview'),false,'hidden 2D stays hidden');
 const mixed={type:'split-area',orientation:'horizontal',sizes:[.3,.7],children:[{...tab('preview','library'),currentIndex:1},tab('viewport','graph')]};const next=migratePreviewLayout(mixed);assert.deepEqual(next.children[0],tab('library'));assert.deepEqual(next.children[1].widgets,['viewport','preview','graph']);assert.deepEqual(next.sizes,[.3,.7]);
});
