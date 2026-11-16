const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(resolve(__dirname,'../standalone/index.html')).href+'?debug=1');
  await page.waitForFunction(()=>window.__prismiaDebug?.runtime?.renderer?.info.render.frame>0,null,{timeout:90000});
  const result=await page.evaluate(()=>{
    const app=window.__prismiaDebug,v=app.viewport3d,first=app.runtime,initialChildren=v.scene.children.length,events=[];
    const id=v.id, same=v.renderer===first.renderer&&v.camera===first.camera&&v.scene===first.scene;
    const aliases=app.registry.get('viewport')===app.registry.get('viewport3d');
    const initial=v.listPlugins().map(p=>[p.id,p.active]);
    v.setScopeAvailable('graph',false);
    const inactive=[app.runtime===null,v.getPlugin('prismia-camera-tools')===null,v.scene.children.length];
    v.setScopeAvailable('graph',true);
    const again=app.runtime, restored=[!!again&&again!==first,again?.renderer===v.renderer,v.scene.children.length,document.querySelectorAll('.p-3d-canvas').length];
    v.registerPlugin({id:'test-extension',requires:{scopes:['graph'],apis:['probe'],plugins:['prismia-material-preview']},
      activate({apis,defer,signal}){events.push('start:'+apis.probe);defer(()=>events.push('stop:'+signal.aborted));return {api:apis.probe};}});
    v.setApi('probe',42);const probe=v.getPlugin('test-extension');
    v.setScopeAvailable('graph',false);v.setScopeAvailable('graph',true);v.unregisterPlugin('test-extension');
    const after=v.listPlugins().map(p=>[p.id,p.active]);app.destroy();app.destroy();
    return {id,same,aliases,initial,initialChildren,inactive,restored,probe,events,after,disposed:v.disposed,canvases:document.querySelectorAll('.p-3d-canvas').length};
  });
  assert.equal(result.id,'viewport3d');assert(result.same&&result.aliases);
  assert.deepEqual(result.initial,[['prismia-material-preview',true],['prismia-camera-tools',true]]);
  assert.deepEqual(result.inactive,[true,true,0]);assert.deepEqual(result.restored,[true,true,result.initialChildren,1]);
  assert.equal(result.probe,42);assert.deepEqual(result.events,['start:42','stop:true','start:42','stop:true']);
  assert(result.after.every(p=>p[1]));assert(result.disposed);assert.equal(result.canvases,0);assert.deepEqual(errors,[]);
  console.log('Prismia shared viewport + graph scope, API gating, reactivation, ownership: PASS');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
