import test from 'node:test';
import assert from 'node:assert/strict';
import {NODE_TYPES,OUTPUT_USAGES,nodeDefaults,outputUsage,MATERIAL_EXAMPLES,createExample,createEmptyProject,validateProject,topologicalNodes,createGraphStore,compileNodeFragment,PROJECT_FORMAT} from '../api/graph.js';
import {createPrismiaComposition,bindPrismiaComposition,createScopeExchange,createViewState,createRenderState,PRISMIA_SCOPE_DEFINITIONS} from '../api/scopes.js';
import {createPrismiaRegistry,ShaderEngine} from '../src/app/main.js';

test('all ten material recipes are valid real multi-output graphs',()=>{
  assert.equal(MATERIAL_EXAMPLES.length,10);assert.ok(Object.keys(NODE_TYPES).length>=25);
  const texts=new Set();for(const item of MATERIAL_EXAMPLES){const a=createExample(item.id),b=validateProject(a);assert.deepEqual(b,a);assert.equal(topologicalNodes(a).length,a.nodes.length);const outputs=a.nodes.filter(n=>n.type==='output');assert.equal(outputs.length,6);assert.equal(new Set(outputs.map(outputUsage)).size,6);for(const n of outputs)assert.ok(a.edges.some(e=>e.target===n.id));texts.add(JSON.stringify(a.nodes.find(n=>n.id==='pattern')));}
  assert.equal(texts.size,10);
});
test('GLSL generation contains declared input textures and distinct real node programs',()=>{
  const programs=new Set();for(const [id,def] of Object.entries(NODE_TYPES)){const node={id:'node-a',type:id,params:nodeDefaults(id)};const src=compileNodeFragment(node);assert.match(src,/vec4 prismNode/);assert.match(src,/void main/);for(const input of def.inputs)assert.ok(src.includes(`uniform sampler2D tex_${input.id};`));programs.add(src);}
  assert.ok(programs.size>=25);
});
test('project validation catches cycles, duplicates, invalid inputs and unsafe image data',()=>{
  const a=createExample('brick');let p=structuredClone(a);p.edges.push({id:'edge-new',source:'height-level',target:'pattern',input:'bad'});assert.throws(()=>validateProject(p),/Нет входа/);
  p=structuredClone(a);p.edges.push({id:'edge-new',source:'height-level',target:'mixed',input:'mask'});assert.throws(()=>validateProject(p),/Цикл/);
  p=structuredClone(a);p.nodes.push({...structuredClone(p.nodes[0])});assert.throws(()=>validateProject(p),/повторный/);
  p=structuredClone(a);p.nodes.push({id:'bad-image',type:'bitmap',position:{x:0,y:0},params:{src:'https://remote.invalid/x.png'}});assert.throws(()=>validateProject(p),/PNG/);
  p=structuredClone(a);p.nodes.find(n=>n.id==='pattern').params.columns=10000;assert.equal(validateProject(p).nodes.find(n=>n.id==='pattern').params.columns,24);
  p=structuredClone(a);p.format='sbsar';assert.throws(()=>validateProject(p),/формат/);
  p=structuredClone(a);p.nodes.push({id:'bad-proto',type:'constructor',params:{}});assert.throws(()=>validateProject(p),/Неизвестный/);
  p=structuredClone(a);p.exposed=[null];assert.throws(()=>validateProject(p),/опубликованный параметр/);
  p=createEmptyProject();const src='data:image/png;base64,'+'A'.repeat(6_000_000);p.nodes=[{id:'a',type:'bitmap',params:{src}},{id:'b',type:'bitmap',params:{src}}];assert.throws(()=>validateProject(p),/Суммарный размер/);
  assert.ok(Object.isFrozen(NODE_TYPES.noise.params.scale));assert.ok(Object.isFrozen(NODE_TYPES.blend.params.mode.choices));
});
test('transactional graph editing, connection replacement, expose and undo/redo',()=>{
  const store=createGraphStore(createExample('brick'));let notifications=0;const off=store.subscribe(()=>notifications++);const old=store.value.project.nodes.length;
  const added=store.addNode('noise',{x:5,y:6});assert.equal(store.value.project.nodes.length,old+1);store.setParam(added,'scale',12);assert.equal(store.value.project.nodes.find(n=>n.id===added).params.scale,12);
  store.connect(added,'mixed','mask');assert.equal(store.value.project.edges.filter(e=>e.target==='mixed'&&e.input==='mask').length,1);
  const before=JSON.stringify(store.value.project);assert.throws(()=>store.connect('height-level','mixed','background'),/Цикл/);assert.equal(JSON.stringify(store.value.project),before);
  store.expose(added,'scale','Размер');assert.ok(store.value.project.exposed.some(x=>x.label==='Размер'));store.undo();assert.ok(!store.value.project.exposed.some(x=>x.label==='Размер'));store.redo();assert.ok(store.value.project.exposed.some(x=>x.label==='Размер'));
  store.removeNode(added);assert.ok(!store.value.project.edges.some(e=>e.source===added));assert.ok(!store.value.project.exposed.some(x=>x.node===added));store.undo();assert.ok(store.value.project.nodes.some(n=>n.id===added));store.redo();assert.ok(!store.value.project.nodes.some(n=>n.id===added));assert.ok(notifications>=8);off();store.dispose();assert.throws(()=>store.addNode('noise'),/освобождён/);
});
test('scope registry is framework-bound and exchange enforces public command contracts',async()=>{
  const composition=await bindPrismiaComposition(createPrismiaComposition());assert.equal(composition.bound.length,10);for(const passport of PRISMIA_SCOPE_DEFINITIONS){const scope=composition.registry.get(passport.id);assert.equal(typeof scope.activate,'function');assert.equal(scope.hint,passport.hint);}
  const graph=createGraphStore(createExample()),view=createViewState(),render=createRenderState(),exchange=createScopeExchange({graph,view,render});const channel=exchange.channel('graph');let count=0;channel.subscribe(()=>count++);channel.dispatch('setSeed',23);assert.equal(graph.value.project.seed,23);assert.throws(()=>channel.dispatch('dispose'),/запрещена/);assert.throws(()=>exchange.channel('unknown'),/Неизвестный/);exchange.dispose();assert.throws(()=>channel.setSeed(1),/освобождён/);graph.setSeed(24);assert.equal(count,2);graph.dispose();view.dispose();render.dispose();
});
test('the built-in 3D scope is opt-in, unique, and skipped cleanly when disabled',async()=>{
  const enabled=createPrismiaComposition();
  assert.equal(enabled.registry.list().filter(scope=>scope.id==='viewport3d').length,1);
  assert.equal(enabled.registry.get('viewport'),enabled.registry.get('viewport3d'));
  const disabled=createPrismiaComposition({builtInScopes:{viewport3d:{enabled:false}}});
  assert.equal(disabled.registry.get('viewport3d'),undefined);
  const bound=await bindPrismiaComposition(disabled);
  assert.equal(bound.bound.includes('viewport3d'),false);
  assert.equal(bound.bound.length,9);
});
test('Prismia public surface supplies shader presets',()=>{const registry=createPrismiaRegistry();assert.ok(registry.has('wet-asphalt'));assert.ok(registry.has('cinematic'));const engine=new ShaderEngine({registry,targets:['preview']});assert.equal(engine.setSelection('preview','wet-asphalt'),true);engine.dispose();});
