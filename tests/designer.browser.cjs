const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {readFileSync,mkdirSync}=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const output=process.env.OUTPUT_DIR||path.join(os.tmpdir(),'prismia-designer');mkdirSync(output,{recursive:true});
const url=process.env.PRISMIA_URL||pathToFileURL(path.resolve(__dirname,'../standalone/index.html')).href;
const wait=p=>p.waitForTimeout(900);
const tab=async(p,name)=>p.locator('.lm-TabBar-tab').filter({hasText:name}).first().click();
const input=async(p,selector,value)=>p.locator(selector).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
function makeGlb(doc,bin){let jb=Buffer.from(JSON.stringify(doc));jb=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,0x20)]);const body=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);const out=Buffer.alloc(12+8+jb.length+8+body.length);out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jb.length,12);out.write('JSON',16);jb.copy(out,20);out.writeUInt32LE(body.length,20+jb.length);out.write('BIN\0',24+jb.length);body.copy(out,28+jb.length);return out;}

async function imageStats(page,usage='baseColor'){
  return page.evaluate(usage=>{const d=window.__prismiaDebug;const target=d.runtime.evaluator.outputs()[usage];if(!target)return null;const a=d.runtime.evaluator.read(target).pixels;let hash=2166136261,min=255,max=0;for(let i=0;i<a.length;i+=4){hash=Math.imul(hash^a[i],16777619);hash=Math.imul(hash^a[i+1],16777619);hash=Math.imul(hash^a[i+2],16777619);min=Math.min(min,a[i],a[i+1],a[i+2]);max=Math.max(max,a[i],a[i+1],a[i+2]);}return {hash:hash>>>0,min,max,width:target.width};},usage);
}
(async()=>{
 const {unzipSync}=await import('three/addons/libs/fflate.module.js');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
 const page=await context.newPage(),errors=[],requests=[];
 page.on('dialog',dialog=>dialog.accept());page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
 await page.goto(url+'?debug');await page.waitForSelector('[data-app-ready=true]',{timeout:90000});await page.waitForFunction(()=>window.__prismiaDebug?.runtime?.evaluator?.outputs()?.baseColor,{timeout:60000});
 // The first screen is a four-node working material, not an opaque example graph.
 const starter=await page.evaluate(()=>__prismiaDebug.graph.value.project);
 assert.equal(starter.nodes.length,4);assert.equal(starter.edges.length,2);
 assert.deepEqual(await page.evaluate(()=>Object.keys(__prismiaDebug.runtime.evaluator.outputs()).sort()),['baseColor','roughness']);
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-library-cards] img')].filter(x=>x.src.startsWith('data:image')).length===15,{timeout:90000});
 assert.equal(await page.locator('.b-header-hint').count(),10);assert.equal(await page.locator('[data-library-cards] [data-resource]').count(),15);
 await page.screenshot({path:path.join(output,'prismia-overview.png')});
 // A physical value works even without its corresponding texture map; when a map exists the slider is a multiplier.
 await tab(page,'Материал');assert.ok(await page.locator('[data-metalness-base]').isVisible());assert.ok(await page.locator('[data-roughness-map]').isVisible());assert.ok(await page.locator('[data-roughness-base]').isHidden());
 await input(page,'[data-surface="metalnessBase"]',.7);assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.project.surface.metalnessBase),.7);
 assert.equal(await page.evaluate(()=>{let value=null;__prismiaDebug.runtime.scene.traverse(x=>{if(x.material?.userData?.prismiaSurface)value=x.material.metalness;});return value;}),.7);
 await page.locator('[data-graph-undo]').click();assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.project.surface.metalnessBase),0);
 // Visible help, explicit delete/disconnect, click-to-connect, and undo: real pointer gestures.
 await page.locator('.p-graph-instructions summary').click();assert.match(await page.locator('.p-graph-instructions').innerText(),/справа.*входа/s);await page.locator('.p-graph-instructions summary').click();
 const originalEdges=await page.evaluate(()=>__prismiaDebug.graph.value.project.edges.length);
 await page.locator('[data-node="out-base-color"] [data-disconnect-input="source"]').click();
 assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.project.edges.length),originalEdges-1);
 await page.locator('[data-node="base-color"] [data-output-port]').click();assert.equal(await page.locator('[data-graph-canvas]').evaluate(el=>el.classList.contains('is-linking')),true);
 await page.locator('[data-node="out-base-color"] [data-input-port="source"]').click();assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.project.edges.length),originalEdges);
 await page.locator('[data-node="rough-value"] [data-delete-node]').click();assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.project.nodes.length),3);assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.project.edges.length),1);
 await page.locator('[data-graph-undo]').click();assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.project.nodes.length),4);assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.project.edges.length),2);
 await page.locator('[data-node="rough-value"] [data-node-preview]').click();assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.preview),'rough-value');
 // Add a material output from the graph menu and discover the new mask channels in its inspector.
 await page.locator('[data-graph-add]').click();await page.locator('[data-node-search]').fill('Выход материала');await page.locator('[data-node-results] button').first().click();
 const maskOutput=await page.evaluate(()=>__prismiaDebug.graph.value.selected);assert.equal(await page.evaluate(id=>__prismiaDebug.graph.value.project.nodes.find(n=>n.id===id).type,maskOutput),'output');
 const outputSelect=page.locator('[data-node-properties] [data-param="usage"]');assert.match(await outputSelect.innerText(),/Маска краёв.*rimMask/s);assert.match(await outputSelect.innerText(),/Маска блика.*specularMask/s);
 await outputSelect.selectOption('8');assert.equal(await page.evaluate(id=>__prismiaDebug.graph.value.project.nodes.find(n=>n.id===id).params.usage,maskOutput),8);
 await page.locator(`[data-node="${maskOutput}"] [data-delete-node]`).click();assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.project.nodes.length),4);
 console.log('CHECK beginner graph help + disconnect + click-connect + delete/undo + 2D + mask selector');
 // All 29 node shaders are accepted by this WebGL2 driver, not just string-tested.
 const shaderCheck=await page.evaluate(()=>{const d=__prismiaDebug,gl=d.runtime.renderer.getContext(),failures=[];for(const [id] of Object.entries(d.debug.NODE_TYPES)){const node={id:'test',type:id,params:d.debug.nodeDefaults(id)};try{const check=d.debug.validateNodeFragment(gl,d.debug.compileNodeFragment(node));if(!check.ok)failures.push(`${id}: ${check.error}`);}catch(e){failures.push(`${id}: ${e.message}`);}}return {count:Object.keys(d.debug.NODE_TYPES).length,failures};});
 assert.equal(shaderCheck.count,29);assert.deepEqual(shaderCheck.failures,[]);
 const hints=await page.locator('.b-header-hint').allTextContents();assert.ok(hints.some(x=>x.toUpperCase().includes('РЕСУРСЫ')));assert.ok(hints.some(x=>x.toUpperCase().includes('СОЕДИНЯЙТЕ БЛОКИ')));
 // Open a real procedural material and verify its controls affect GPU pixels.
 await page.locator('[data-resource="material:brick"] .p-card-main').click();await page.waitForFunction(()=>__prismiaDebug.graph.value.project.name.includes('кирпич'));await wait(page);
 const initial=await imageStats(page);assert.ok(initial.max-initial.min>30,'brick base color must not be flat');
 assert.deepEqual(await page.evaluate(()=>Object.keys(__prismiaDebug.runtime.evaluator.outputs()).sort()),['ambientOcclusion','baseColor','height','metallic','normal','roughness']);
 await page.evaluate(()=>__prismiaDebug.graph.select('pattern'));
 await input(page,'[data-param="columns"]',12);await wait(page);const changed=await imageStats(page);assert.notEqual(initial.hash,changed.hash,'parameter should alter baseColor GPU pixels');
 let param=page.locator('[data-param="columns"]');assert.equal(await param.evaluate(el=>getComputedStyle(el).appearance),'none');const fill=await param.evaluate(el=>el.style.getPropertyValue('--range-fill'));assert.ok(fill.includes('%'));
 await page.locator('[data-graph-undo]').click();await wait(page);assert.equal((await imageStats(page)).hash,initial.hash,'undo restores pixels');await page.locator('[data-graph-redo]').click();await wait(page);assert.equal((await imageStats(page)).hash,changed.hash,'redo restores edited pixels');
 console.log('CHECK 15 material thumbnails + 29 shader compiles + range + undo/redo');
 // Search, category hierarchy and local favorites use real types.
 await page.locator('[data-library-category="Генераторы"]').click();assert.ok(await page.locator('[data-library-cards] [data-resource]').count()>=5);await page.locator('[data-library-search]').fill('шум');assert.ok(await page.locator('[data-library-cards] [data-resource]').count()>0);await page.locator('[data-library-search]').fill('');
 const resource=page.locator('[data-library-cards] [data-resource]').first();const type=(await resource.getAttribute('data-resource')).split(':')[1];await resource.locator('.p-favorite').click();await page.locator('[data-library-category="Избранное"]').click();assert.equal(await page.locator('[data-library-cards] [data-resource]').count(),1);
 const countBefore=await page.evaluate(()=>__prismiaDebug.graph.value.project.nodes.length);await page.locator('[data-library-cards] [data-resource] .p-card-main').click();await page.waitForFunction(n=>__prismiaDebug.graph.value.project.nodes.length===n+1,countBefore);assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.project.nodes.at(-1).type),type);
 // Material thumbnails correspond to different editable graphs and GPU maps.
 await page.locator('[data-library-category="Материалы"]').click();await page.locator('[data-resource="material:marble"] .p-card-main').click();await page.waitForFunction(()=>__prismiaDebug.graph.value.project.name.includes('Мрамор'));await wait(page);const marble=await imageStats(page);assert.notEqual(marble.hash,changed.hash);
 await page.locator('[data-resource="material:brick"] .p-card-main').click();await page.waitForFunction(()=>__prismiaDebug.graph.value.project.name.includes('кирпич'));await wait(page);
 console.log('CHECK library and recipes');
 // Drag/drop through the HTML dataTransfer path, then connect ports using pointers.
 await page.locator('[data-library-category="Генераторы"]').click();const dragItem=page.locator('[data-resource="node:noise"]');assert.equal(await dragItem.count(),1);const beforeDrag=await page.evaluate(()=>__prismiaDebug.graph.value.project.nodes.length);const canvas=page.locator('[data-graph-canvas]');const rect=await canvas.boundingBox();await dragItem.dragTo(canvas,{targetPosition:{x:rect.width*.55,y:rect.height*.5}});await page.waitForFunction(n=>__prismiaDebug.graph.value.project.nodes.length===n+1,beforeDrag);
 await page.locator('[data-graph-fit]').click();
 const addedId=await page.evaluate(()=>__prismiaDebug.graph.value.project.nodes.at(-1).id);const added=page.locator(`.p-graph-node[data-node="${addedId}"]`);await added.scrollIntoViewIfNeeded();const out=added.locator('[data-output-port]');const target=page.locator('.p-graph-node[data-node="mixed"] [data-input-port="mask"]');
 const outBox=await out.boundingBox(),inBox=await target.boundingBox();assert.ok(outBox&&inBox);await page.mouse.move(outBox.x+outBox.width/2,outBox.y+outBox.height/2);await page.mouse.down();await page.mouse.move(inBox.x+inBox.width/2,inBox.y+inBox.height/2,{steps:8});await page.mouse.up();await page.waitForFunction(id=>__prismiaDebug.graph.value.project.edges.some(e=>e.source===id&&e.target==='mixed'&&e.input==='mask'),addedId,{timeout:5000});
 // Choice parameters can also be exposed and edited from graph properties.
 await page.locator('.p-graph-node[data-node="mixed"] .p-graph-node-head').click();await page.locator('[data-expose-param="mode"]').click();
 const exposedId=await page.evaluate(()=>__prismiaDebug.graph.value.project.exposed.find(x=>x.node==='mixed'&&x.param==='mode')?.id);assert.ok(exposedId);
 await page.locator(`[data-exposed-param="${exposedId}"]`).selectOption('1');assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.project.nodes.find(x=>x.id==='mixed').params.mode),1);
 console.log('CHECK node drag/connect and exposed choice');
 // Real editable GLSL node: valid compile, rejected compile, animated uTime.
 await page.locator('[data-library-category="Основные"]').click();await page.locator('[data-resource="node:custom"] .p-card-main').click();await page.waitForFunction(()=>{const g=__prismiaDebug.graph.value;return g.project.nodes.find(n=>n.id===g.selected)?.type==='custom'});await tab(page,'Код GLSL');const code=page.locator('[data-code-editor]');await code.fill('vec4 prismNode(vec2 uv) { return vec4(0.25, 0.50, 0.75, 1.0); }');await page.locator('[data-code-apply]').click();await wait(page);assert.match(await page.locator('[data-code-error]').innerText(),/Компиляция успешна/);
 const customId=await page.evaluate(()=>__prismiaDebug.graph.value.selected);const customPixel=await page.evaluate(id=>{const d=__prismiaDebug;return [...d.runtime.evaluator.read(d.runtime.evaluator.target(id)).pixels.slice(0,4)]},customId);assert.ok(Math.abs(customPixel[0]-64)<3&&Math.abs(customPixel[1]-128)<3&&Math.abs(customPixel[2]-191)<3,JSON.stringify(customPixel));
 await code.fill('vec4 prismNode(vec2 uv) { syntax error }');await page.locator('[data-code-apply]').click();assert.match(await page.locator('[data-code-error]').innerText(),/ERROR|error|ошиб/i);assert.match(await page.evaluate(id=>__prismiaDebug.graph.value.project.nodes.find(n=>n.id===id).params.code,customId),/0\.25/);
 await code.fill('vec4 prismNode(vec2 uv) { return vec4(fract(uTime * 0.23), 0.0, 0.0, 1.0); }');await page.locator('[data-code-apply]').click();await wait(page);const a=await page.evaluate(id=>__prismiaDebug.runtime.evaluator.read(__prismiaDebug.runtime.evaluator.target(id)).pixels[0],customId);await page.waitForFunction(({id,a})=>{const d=__prismiaDebug,e=d.runtime.evaluator.cache.get(id);return e&&d.runtime.evaluator.read(e.target).pixels[0]!==a;},{id:customId,a},{timeout:15000});const b=await page.evaluate(id=>__prismiaDebug.runtime.evaluator.read(__prismiaDebug.runtime.evaluator.target(id)).pixels[0],customId);assert.notEqual(a,b,'uTime updates the graph');
 // Stop the animation after checking it so the rest of this software-GPU
 // integration test measures independent, stable operations.
 await code.fill('vec4 prismNode(vec2 uv) { return vec4(0.25, 0.50, 0.75, 1.0); }');await page.locator('[data-code-apply]').click();
 // A real locally imported bitmap propagates through the GPU and PNG export.
 await page.locator('[data-library-category="Входы"]').click();await page.locator('[data-resource="node:bitmap"] .p-card-main').click();await page.waitForFunction(()=>{const g=__prismiaDebug.graph.value;return g.project.nodes.find(n=>n.id===g.selected)?.type==='bitmap'});
 const bitmapId=await page.evaluate(()=>__prismiaDebug.graph.value.selected),red=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGM8IRfwnwEJMDGgAcICAJF4Aj1q1NDzAAAAAElFTkSuQmCC','base64');
 await page.locator('[data-node-properties] input[type=file]').setInputFiles({name:'red.png',mimeType:'image/png',buffer:red});
 await page.waitForFunction(id=>{const d=__prismiaDebug,e=d.runtime.evaluator.cache.get(id);if(!e)return false;const px=d.runtime.evaluator.read(e.target).pixels;return Math.abs(px[0]-200)<5&&Math.abs(px[1]-30)<5&&Math.abs(px[2]-80)<5;},bitmapId,{timeout:30000});
 await page.evaluate(id=>__prismiaDebug.graph.connect(id,'out-base-color','source'),bitmapId);
 console.log('CHECK GLSL, animation and embedded bitmap');
 // Loading an empty, non-identity GLB exercises real GLTFLoader and framing.
 // Generate a self-contained triangle with normals and UV coordinates.
 const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,translation:[1,0,0]}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3}]}],buffers:[{byteLength:104}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962},{buffer:0,byteOffset:36,byteLength:36,target:34962},{buffer:0,byteOffset:72,byteLength:24,target:34962},{buffer:0,byteOffset:96,byteLength:6,target:34963}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC3'},{bufferView:2,componentType:5126,count:3,type:'VEC2'},{bufferView:3,componentType:5123,count:3,type:'SCALAR'}]};
 const bin=Buffer.alloc(104);[0,0,0,1,0,0,0,1,0].forEach((x,i)=>bin.writeFloatLE(x,i*4));[0,0,1,0,0,1,0,0,1].forEach((x,i)=>bin.writeFloatLE(x,36+i*4));[0,0,1,0,0,1].forEach((x,i)=>bin.writeFloatLE(x,72+i*4));[0,1,2].forEach((x,i)=>bin.writeUInt16LE(x,96+i*2));
 await tab(page,'Сцена');
 // The importer must reject external dependencies without requesting them.
 const unsafe=structuredClone(json);unsafe.buffers[0].uri='https://prismia.invalid/external.bin';await page.locator('[data-model-file]').setInputFiles({name:'unsafe.glb',mimeType:'model/gltf-binary',buffer:makeGlb(unsafe,bin)});
 await page.waitForFunction(()=>document.querySelector('[data-model-status]').textContent.includes('Внешние ресурсы'),null,{timeout:30000});
 await page.locator('[data-model-file]').setInputFiles({name:'triangle.glb',mimeType:'model/gltf-binary',buffer:makeGlb(json,bin)});await page.waitForFunction(()=>document.querySelector('[data-model-status]').textContent.includes('Модель загружена'),null,{timeout:30000});
 assert.equal(await page.evaluate(()=>__prismiaDebug.view.value.shape),'model');
 await tab(page,'Материал');await page.locator('[data-surface-style]').selectOption('toon-graphic');await wait(page);
 assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.project.surface.model),'toon');
 assert.ok(await page.evaluate(()=>{let count=0;__prismiaDebug.runtime.scene.traverse(x=>{if(x.userData?.prismiaOutline)count++});return count>0}));
 await page.locator('[data-surface-style]').selectOption('physical');await input(page,'[data-surface="roughness"]',.36);assert.equal(await page.locator('[data-surface-output="roughness"]').innerText(),'0.36');
 assert.equal(await page.evaluate(()=>__prismiaDebug.graph.value.project.surface.roughness),.36);
 await tab(page,'Свет');await page.locator('[data-view-select="look"]').selectOption('sunrise');await input(page,'[data-view-range="exposure"]',1.6);assert.equal(await page.locator('[data-output="exposure"]').innerText(),'1.60');
 console.log('CHECK GLB + material + lighting');
 // 2D RGB/channel/tile controls actually redraw the preview.
 await page.locator('[data-channel="r"]').click();assert.equal(await page.locator('[data-channel="r"]').getAttribute('aria-pressed'),'true');await page.locator('[data-tile]').click();assert.equal(await page.locator('[data-tile]').getAttribute('aria-pressed'),'true');
 // Project round-trip downloads Prismia JSON, not SBS/SBSAR.
 await page.locator('.b-menu-btn').filter({hasText:'Файл'}).click();const [projectDownload]=await Promise.all([page.waitForEvent('download'),page.locator('.b-menu-item').filter({hasText:'Сохранить проект JSON'}).click()]);const projectPath=await projectDownload.path();const saved=JSON.parse(readFileSync(projectPath,'utf8'));assert.equal(saved.format,'fws-prismia-material');assert.equal(saved.surface.roughness,.36);assert.ok(saved.nodes.some(n=>n.type==='custom'));assert.ok(saved.nodes.some(n=>n.type==='bitmap'&&n.params.src.startsWith('data:image/png;')));
 // Round-trip through the actual file picker rather than only parsing JSON.
 await page.evaluate(()=>__prismiaDebug.graph.setSeed(777));await page.locator('.b-menu-btn').filter({hasText:'Файл'}).click();
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('.b-menu-item').filter({hasText:'Открыть проект'}).click()]);await chooser.setFiles({name:'material.json',mimeType:'application/json',buffer:readFileSync(projectPath)});
 await page.waitForFunction(seed=>__prismiaDebug.graph.value.project.seed===seed,saved.seed,{timeout:30000});
 await page.locator('.b-menu-btn').filter({hasText:'Файл'}).click();await page.locator('.b-menu-item').filter({hasText:'Лицензии компонентов'}).click();assert.match(await page.locator('[data-license-dialog] pre').innerText(),/Lumino/);await page.locator('[data-license-dialog] button').click();
 await tab(page,'Выходы');await page.locator('[data-export-size]').selectOption('256');const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.locator('[data-export-maps]').click()]);assert.match(download.suggestedFilename(),/\.zip$/);const archive=unzipSync(new Uint8Array(readFileSync(await download.path()))),names=Object.keys(archive),png=archive[names.find(n=>n.endsWith('_baseColor.png'))];assert.ok(png,'Base Color is in ZIP');const pngBuffer=Buffer.from(png),checked={names,signature:[...pngBuffer.subarray(0,8)],width:pngBuffer.readUInt32BE(16),image:pngBuffer.toString('base64')};assert.ok(checked.names.some(n=>n.endsWith('_normal.png')));assert.deepEqual(checked.signature,[137,80,78,71,13,10,26,10]);assert.equal(checked.width,256);
 const pngPixel=await page.evaluate(async data=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];},checked.image);assert.ok(Math.abs(pngPixel[0]-200)<5&&Math.abs(pngPixel[1]-30)<5&&Math.abs(pngPixel[2]-80)<5,JSON.stringify(pngPixel));
 console.log('CHECK 2D + JSON round trip + real PNG pixels + licenses');
 // Releasing a mounted composition must not strand a WebGL context or subscriptions.
 await page.screenshot({path:path.join(output,'prismia-designer-desktop.png')});await page.evaluate(()=>__prismiaDebug.destroy());assert.equal(await page.locator('[data-app-ready=true]').count(),0);
 assert.equal(requests.length,0,`standalone must stay offline: ${requests}`);
 // Release the desktop WebGL context before starting the mobile scenario.
 await context.close();
 const mobileContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});const mobile=await mobileContext.newPage();mobile.on('pageerror',e=>errors.push(e.stack));mobile.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await mobile.goto(url+'?debug');await mobile.waitForSelector('[data-app-ready=true]',{timeout:90000});await mobile.waitForTimeout(1800);const mobileSize=await mobile.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,panels:document.querySelectorAll('.lm-TabBar-tab').length}));assert.ok(mobileSize.scroll<=mobileSize.width+2,JSON.stringify(mobileSize));assert.ok(mobileSize.panels>=10);await mobile.screenshot({path:path.join(output,'prismia-designer-mobile.png')});
 // Graph is mounted hidden in compact mode; on activation its wires must be
 // measured again and the first graph fitted. Touch controls must be usable.
 await mobile.locator('.lm-TabBar-tab').filter({hasText:'Граф узлов'}).tap();await mobile.waitForTimeout(500);
 const mobileGraph=await mobile.evaluate(()=>({wires:document.querySelectorAll('[data-graph-wires] .p-wire').length,paths:[...document.querySelectorAll('[data-graph-wires] .p-wire')].map(x=>x.getAttribute('d')),out:document.querySelector('[data-node="out-base-color"]').getBoundingClientRect().toJSON(),transform:document.querySelector('[data-graph-world]').style.transform}));
 assert.equal(mobileGraph.wires,2);assert.ok(mobileGraph.out.right<=390&&mobileGraph.out.left>=0,JSON.stringify(mobileGraph));assert.ok(mobileGraph.paths.every(x=>!x.includes('NaN')));
 await mobile.locator('.p-graph-instructions summary').tap();assert.ok(await mobile.locator('.p-graph-instructions > div').isVisible());await mobile.locator('.p-graph-instructions summary').tap();
 await mobile.locator('[data-node="out-base-color"] [data-disconnect-input="source"]').tap();assert.equal(await mobile.evaluate(()=>__prismiaDebug.graph.value.project.edges.length),1);
 await mobile.locator('[data-node="base-color"] [data-output-port]').tap();await mobile.locator('[data-node="out-base-color"] [data-input-port="source"]').tap();assert.equal(await mobile.evaluate(()=>__prismiaDebug.graph.value.project.edges.length),2);
 await mobile.locator('[data-graph-zoom-in]').tap();assert.notEqual(await mobile.locator('[data-graph-world]').getAttribute('style'),`transform: ${mobileGraph.transform};`);await mobile.locator('[data-graph-fit]').tap();
 await mobile.screenshot({path:path.join(output,'prismia-graph-mobile.png')});await mobile.evaluate(()=>__prismiaDebug.destroy());
 await mobileContext.close();
 // Arena-style sandbox: scripts allowed, storage and external network denied.
 const sandbox=await browser.newPage({viewport:{width:1200,height:820}});sandbox.on('pageerror',e=>errors.push(e.message));sandbox.on('console',m=>{if(m.type()==='error')errors.push(m.text())});const sandboxRequests=[];await sandbox.route(/^https?:/,r=>{sandboxRequests.push(r.request().url());r.abort();});
 await sandbox.setContent('<iframe sandbox="allow-scripts" style="width:100%;height:800px;border:0"></iframe>');const html=readFileSync(path.resolve(__dirname,'../standalone/index.html'),'utf8');await sandbox.evaluate(html=>{document.querySelector('iframe').srcdoc=html},html);
 const frame=sandbox.frames().find(f=>f!==sandbox.mainFrame());await frame.waitForSelector('[data-app-ready=true]',{timeout:90000});await frame.locator('[data-library-category="Генераторы"]').click();assert.ok(await frame.locator('[data-library-cards] [data-resource]').count()>=5);assert.deepEqual(sandboxRequests,[]);await sandbox.close();
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS Prismia: 29 GPU GLSL nodes, 15 editable material previews, beginner gestures, graph/undo/drag/connect, exposed choices, GLSL/time, bitmap, offline GLB, PBR/toon, JSON/PNG pixels, sandbox, mobile, lifecycle');
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
