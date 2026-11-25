const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=384']});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:750},deviceScaleFactor:1,reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const url=pathToFileURL(resolve(__dirname,'../standalone/index.html')).href+'?debug=1';
  const ready=()=>page.waitForFunction(()=>{const app=window.__prismiaDebug;return app?.viewportEnvironment&&app.viewportDisplay&&app.viewport3d?.renderer.info.render.frame>0;},null,{timeout:90000});
  await page.goto(url,{waitUntil:'domcontentloaded'});await ready();
  await page.locator('[data-v3d-graphics-toggle]').click();
  for(const key of ['environment','display','graphics']){
    const button=page.locator(`[data-v3d-section-toggle="${key}"]`);
    assert.equal(await button.count(),1);assert.equal(await button.getAttribute('aria-expanded'),'true');
  }
  assert.match(await page.locator('[data-v3d-renderer-info]').textContent(),/программный рендерер.*swiftshader/i);
  assert(await page.locator('[data-v3d-retry-gpu]').isHidden());
  assert.doesNotMatch(await page.locator('[data-v3d-gpu-help]').textContent(),/перезапуск|перезагруз/i,'do not advertise an unavailable host action');
  const result=await page.evaluate(()=>{const app=window.__prismiaDebug;
   return {current:app.viewportEnvironment.currentId,grid:app.viewportEnvironment.gridWanted,visible:app.viewportEnvironment.grid.visible,gridType:app.viewportEnvironment.grid.type,children:app.viewport3d.scene.children.filter(x=>x.userData?.baseMap==='studio').length};});
  assert.equal(result.current,'studio');assert.equal(result.children,1);
  assert.equal(result.grid,true);assert.equal(result.visible,result.grid);
  assert.equal(result.gridType,'Mesh','Prismia uses the shared Studio shader grid');
  const grid=page.locator('[data-v3d-display-control="floor-grid"]');
  const frameBefore=await page.evaluate(()=>window.__prismiaDebug.viewport3d.renderer.info.render.frame);
  await grid.uncheck();
  await page.waitForFunction(frame=>window.__prismiaDebug.viewport3d.renderer.info.render.frame>frame,frameBefore,{timeout:30000});
  let state=await page.evaluate(()=>{const app=window.__prismiaDebug;return {wanted:app.viewportEnvironment.gridWanted,visible:app.viewportEnvironment.grid.visible,viewGrid:app.view?.value?.grid};});
  assert.equal(state.visible,false);assert.equal(state.wanted,state.visible);
  assert.equal(state.viewGrid,false,'the existing scene checkbox and common control share state');
  await page.evaluate(()=>{const app=window.__prismiaDebug;window.__custom=false;
    window.__remove=app.viewportDisplay.register({id:'example',label:'Проверка вклада',get:()=>window.__custom,set:v=>{window.__custom=v;}});
    app.viewportEnvironment.register({id:'test-room',label:'Тестовая комната',module:{mount(ctx){const group=new ctx.THREE.Group();group.name='TestRoom';ctx.add(group);window.__map=false;ctx.contributeDisplay({id:'map-control',label:'Вклад карты',get:()=>window.__map,set:v=>window.__map=v});}}});});
  await page.locator('[data-v3d-display-control="example"]').check();assert(await page.evaluate(()=>window.__custom));
  await page.locator('[data-world="test-room"]').click();
  await page.waitForFunction(()=>window.__prismiaDebug.viewportEnvironment.currentId==='test-room',null,{timeout:30000});
  assert.equal(await grid.count(),0,'Studio control exists only in Studio');
  await page.locator('[data-v3d-display-control="map-control"]').check();assert(await page.evaluate(()=>window.__map));
  assert.equal(await page.locator('[data-v3d-display-control="example"]').count(),1);
  await page.locator('[data-world="studio"]').click();
  await page.waitForFunction(()=>window.__prismiaDebug.viewportEnvironment.currentId==='studio',null,{timeout:30000});
  assert.equal(await grid.isChecked(),false);
  assert.equal(await page.locator('[data-v3d-display-control="map-control"]').count(),0,'map-owned contribution is removed');
  await page.evaluate(()=>window.__remove());assert.equal(await page.locator('[data-v3d-display-control="example"]').count(),0);
  const graphics=page.locator('[data-v3d-section-toggle="graphics"]');await graphics.focus();await page.keyboard.press('Space');assert.equal(await graphics.getAttribute('aria-expanded'),'false');
  await page.locator('[data-v3d-reset]').click();assert.equal(await graphics.getAttribute('aria-expanded'),'false');
  await page.locator('[data-v3d-section-toggle="environment"]').click();await page.locator('[data-v3d-section-toggle="display"]').click();
  await page.reload({waitUntil:'domcontentloaded'});await ready();await page.locator('[data-v3d-graphics-toggle]').click();
  for(const key of ['environment','display','graphics'])assert.equal(await page.locator(`[data-v3d-section-toggle="${key}"]`).getAttribute('aria-expanded'),'false');
  await page.locator('[data-v3d-section-toggle="display"]').click();assert.equal(await grid.isChecked(),false);
  await page.evaluate(()=>window.__prismiaDebug.destroy());
  assert.equal(await page.locator('[data-v3d-graphics-panel]').count(),0);assert.deepEqual(errors,[]);
  console.log('Prismia: Studio grid ownership, dynamic environment/contributions, keyboard, reset, persistence and teardown PASS');
 } finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
