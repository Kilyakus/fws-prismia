// Functional WebGL regression: render real frames, then compare image pixels.
// Run against the single-file build; no network, no Three.js test doubles.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {readFileSync}=require('node:fs');
const url=process.env.PRISMIA_URL||pathToFileURL(path.resolve(__dirname,'../standalone/index.html')).href;
const sleep=p=>p.waitForTimeout(600);
async function capture(page,name){
  return page.evaluate(name=>{
    const d=window.__prismiaDebug,r=d.runtime,gl=r.renderer.getContext();
    r.renderer.render(r.scene,r.camera);
    const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixels=new Uint8Array(w*h*4);
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    (window.__testFrames ||= {})[name]={w,h,pixels};
    const shapes=[];let outlines=0;
    r.scene.traverse(x=>{if(x.userData?.prismiaOutline)outlines++;else if(x.material?.userData?.prismiaSurface)shapes.push({type:x.material.type,model:x.material.userData.prismiaSurface.model});});
    return {error:gl.getError(),w,h,shapes,outlines};
  },name);
}
async function compare(page,a,b){
  return page.evaluate(([a,b])=>{
    const A=window.__testFrames[a],B=window.__testFrames[b];if(A.w!==B.w||A.h!==B.h)throw Error('frame sizes differ');
    let sum=0,changed=0,centerSum=0,centerN=0;
    for(let y=0;y<A.h;y++)for(let x=0;x<A.w;x++){
      const i=(y*A.w+x)*4;let v=0;for(let k=0;k<3;k++)v+=Math.abs(A.pixels[i+k]-B.pixels[i+k]);
      sum+=v;if(v>5)changed++;
      if(x>A.w*.45&&x<A.w*.55&&y>A.h*.45&&y<A.h*.55){centerSum+=v;centerN++;}
    }
    return {mean:sum/(A.w*A.h*3),changed,center:centerSum/(centerN*3)};
  },[a,b]);
}
async function waitMask(page,usage,value){
  await page.waitForFunction(({usage,value})=>{const e=__prismiaDebug.runtime.evaluator,o=e.outputs()[usage];if(!o)return false;return Math.abs(e.read(o).pixels[0]-value*255)<3;},{usage,value},{timeout:30000});
  await sleep(page);
}
(async()=>{
  const {unzipSync}=await import('three/addons/libs/fflate.module.js');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
  try{
    await page.goto(url+'?debug');await page.waitForSelector('[data-app-ready=true]',{timeout:90000});
    await page.waitForFunction(()=>__prismiaDebug.runtime.evaluator.outputs().baseColor,{timeout:60000});
    await page.evaluate(()=>{__prismiaDebug.graph.setResolution(128);window.__masks={};});await sleep(page);
    let state=await capture(page,'pbr');assert.equal(state.error,0);assert.ok(state.shapes.some(m=>m.type==='MeshPhysicalMaterial'&&m.model==='pbr'));assert.equal(state.outlines,0);
    // Graph-generated black and white rim masks must produce visibly different 3D frames.
    await page.evaluate(()=>{
      const g=__prismiaDebug.graph;g.setSurface('rimPower',1);g.setSurface('rimStrength',3);g.setSurface('rimColor','#ff5533');
      const source=g.addNode('value',{x:0,y:0},{value:0});const out=g.addNode('output',{x:220,y:0},{usage:8});g.connect(source,out,'source');window.__masks.rim=source;
    });
    await waitMask(page,'rimMask',0);await capture(page,'rim-black');
    await page.evaluate(()=>__prismiaDebug.graph.setParam(window.__masks.rim,'value',1));await waitMask(page,'rimMask',1);await capture(page,'rim-white');
    const rim=await compare(page,'rim-black','rim-white');console.log('rim mask pixel difference',rim);assert.ok(rim.changed>300&&rim.mean>.5,'rimMask must visibly modulate lighting');
    // Toon bands and toon specular mask share the same editable graph.
    await page.evaluate(()=>{
      const g=__prismiaDebug.graph;g.applySurfacePreset('toon-glossy');g.setSurface('rimStrength',0);g.setSurface('outlineWidth',0);
      g.setSurface('specularStrength',3);g.setSurface('specularSize',.85);
      const source=g.addNode('value',{x:0,y:180},{value:0});const out=g.addNode('output',{x:220,y:180},{usage:9});g.connect(source,out,'source');window.__masks.spec=source;
    });
    await waitMask(page,'specularMask',0);state=await capture(page,'spec-black');assert.ok(state.shapes.some(m=>m.type==='MeshToonMaterial'&&m.model==='toon'));assert.equal(state.outlines,0);assert.equal(state.error,0);
    await page.evaluate(()=>__prismiaDebug.graph.setParam(window.__masks.spec,'value',1));await waitMask(page,'specularMask',1);await capture(page,'spec-white');
    const spec=await compare(page,'spec-black','spec-white');console.log('toon specular mask pixel difference',spec);assert.ok(spec.changed>100&&spec.mean>.1,'specularMask must visibly modulate highlight');
    const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.evaluate(()=>__prismiaDebug.runtime.exportMaps({resolution:128}))]);
    const zip=unzipSync(new Uint8Array(readFileSync(await download.path()))),names=Object.keys(zip);
    for(const suffix of ['_rimMask.png','_specularMask.png']){
      const filename=names.find(x=>x.endsWith(suffix));assert.ok(filename,`${suffix} in PNG export`);
      const data=Buffer.from(zip[filename]).toString('base64');
      const pixel=await page.evaluate(async data=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.drawImage(img,0,0,1,1);return [...x.getImageData(0,0,1,1).data];},data);
      assert.ok(pixel[0]>250&&pixel[1]>250&&pixel[2]>250,`${suffix} must contain the white graph mask: ${pixel}`);
    }
    assert.match(Buffer.from(zip['README.txt']).toString(),/graph outputs only/);console.log('mask PNG exports and runtime/JSON distinction verified');
    await page.evaluate(()=>{const g=__prismiaDebug.graph;g.setSurface('specularStrength',0);g.setSurface('toonSteps',2);g.setSurface('toonSoftness',.01);});await sleep(page);await capture(page,'bands-two');
    await page.evaluate(()=>__prismiaDebug.graph.setSurface('toonSteps',8));await sleep(page);await capture(page,'bands-eight');
    const bands=await compare(page,'bands-two','bands-eight');console.log('toon band pixel difference',bands);assert.ok(bands.changed>500&&bands.mean>.15,'toonSteps must affect light bands');
    // The inverted hull is visible, not accidentally collected by the engine,
    // and it is replaced without accumulating children on further edits.
    await page.evaluate(()=>{const g=__prismiaDebug.graph;g.setSurface('outlineColor','#000000');g.setSurface('outlineWidth',.06);});await sleep(page);state=await capture(page,'outline');assert.equal(state.outlines,1);
    const outline=await compare(page,'bands-eight','outline');console.log('outline pixel difference',outline);assert.ok(outline.changed>100&&outline.mean>.05,'outline must change frame pixels');
    await page.evaluate(()=>{let shell;__prismiaDebug.runtime.scene.traverse(x=>{if(x.userData?.prismiaOutline)shell=x;});window.__outlineDisposed=false;shell.material.addEventListener('dispose',()=>{window.__outlineDisposed=true;});__prismiaDebug.graph.setSurface('rimPower',2);});
    state=await capture(page,'outline-replaced');assert.equal(state.outlines,1);assert.equal(await page.evaluate(()=>window.__outlineDisposed),true);
    await page.evaluate(()=>__prismiaDebug.graph.setSurface('outlineWidth',0));state=await capture(page,'outline-off');assert.equal(state.outlines,0);
    // In unlit mode, the centre of the subject must not vary when scene lights
    // change, while the PBR subject must vary with exactly the same adjustment.
    await page.evaluate(()=>{const g=__prismiaDebug.graph;g.applySurfacePreset('unlit');__prismiaDebug.view.set('key',.1);__prismiaDebug.view.set('ambient',.1);});await sleep(page);state=await capture(page,'unlit-dark');assert.ok(state.shapes.some(m=>m.model==='unlit'));assert.equal(state.error,0);
    await page.evaluate(()=>{__prismiaDebug.view.set('key',2.8);__prismiaDebug.view.set('ambient',2.8);});await sleep(page);await capture(page,'unlit-bright');const unlit=await compare(page,'unlit-dark','unlit-bright');console.log('unlit light invariance',unlit);assert.ok(unlit.center<1,'unlit subject must ignore lighting');
    await page.evaluate(()=>{const g=__prismiaDebug.graph;g.applySurfacePreset('physical');__prismiaDebug.view.set('key',.1);__prismiaDebug.view.set('ambient',.1);});await sleep(page);await capture(page,'physical-dark');
    await page.evaluate(()=>{__prismiaDebug.view.set('key',2.8);__prismiaDebug.view.set('ambient',2.8);});await sleep(page);await capture(page,'physical-bright');const physical=await compare(page,'physical-dark','physical-bright');console.log('PBR light response',physical);assert.ok(physical.center>5,'PBR subject must respond to lighting');
    assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);await page.evaluate(()=>__prismiaDebug.destroy());
    console.log('PASS real WebGL frames: PBR, toon, unlit, rim/specular masks, toon steps, outline and disposal; offline');
  }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
