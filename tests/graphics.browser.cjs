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
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__prismiaDebug?.runtime?.renderer.info.render.frame>0,null,{timeout:90000});
  assert.deepEqual(await page.locator('[data-v3d-mode-host] option').allTextContents(),['Просмотр']);
  assert.deepEqual(await page.locator('[data-v3d-tool-host] button:visible').allTextContents(),['Обзор']);
  const rail=await page.locator('[data-v3d-tool-host]').boundingBox(),label=await page.locator('.p-viewport-overlay span:first-child').boundingBox();
  assert(rail.y>=label.y+label.height,'tool rail does not cover the subject label');
  await page.locator('[data-v3d-graphics-toggle]').click();
  assert(await page.locator('[data-v3d-graphics]').isVisible());
  assert(await page.locator('[data-v3d-setting="shadowType"] option[value="soft"]').evaluate(option=>option.disabled));
  assert((await page.locator('[data-v3d-shadow-type-info]').textContent()).includes('недоступен'));
  await page.locator('[data-v3d-setting="shadowType"]').selectOption('vsm');
  assert(await page.evaluate(()=>__prismiaDebug.viewport3d.renderer.shadowMap.type===__prismiaDebug.viewport3d.THREE.VSMShadowMap));
  await page.locator('[data-v3d-setting="shadowType"]').selectOption('pcf');
  await page.evaluate(()=>__prismiaDebug.viewportGraphics.set({shadowType:'soft'}));
  assert.equal(await page.evaluate(()=>__prismiaDebug.viewportGraphics.value.shadowType),'pcf');
  const geometry=await page.locator('[data-v3d-graphics-panel]').evaluate(el=>{
    const r=el.getBoundingClientRect(),stage=document.querySelector('#prismia-viewport').getBoundingClientRect();
    return {parent:el.parentElement.tagName,position:getComputedStyle(el).position,top:r.top,bottom:r.bottom,stageBottom:stage.bottom,scrollable:el.scrollHeight>el.clientHeight};
  });
  assert.equal(geometry.parent,'BODY');assert.equal(geometry.position,'fixed');assert(geometry.scrollable);
  assert(geometry.bottom>geometry.stageBottom,'graphics must escape the clipped dock panel');
  await page.locator('[data-v3d-graphics] summary').filter({hasText:'Текстуры и камера'}).click();
  const texture=page.locator('[data-v3d-setting="anisotropy"]');await texture.scrollIntoViewIfNeeded();
  assert(await texture.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===el||el.contains(hit);}),'lower controls must receive pointer events');
  await texture.selectOption('4');assert.equal(await texture.inputValue(),'4');
  await page.keyboard.press('Escape');assert(!(await page.locator('[data-v3d-graphics-panel]').isVisible()));
  await page.locator('[data-v3d-graphics-toggle]').click();
  await page.locator('[data-v3d-setting="toneMapping"]').selectOption('reinhard');
  await page.locator('[data-v3d-setting="shadow"]').selectOption('512');
  await page.locator('[data-v3d-setting="renderScale"]').evaluate(el=>{el.value='0.65';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('[data-v3d-setting="exposure"]').evaluate(el=>{el.value='1.6';el.dispatchEvent(new Event('input',{bubbles:true}));});
  let state=await page.evaluate(()=>{const a=__prismiaDebug,g=a.viewportGraphics;return {s:g.value,actual:g.snapshot(),renderer:{tone:a.viewport3d.renderer.toneMapping,exposure:a.viewport3d.renderer.toneMappingExposure,ratio:a.viewport3d.renderer.getPixelRatio()},view:a.view.value};});
  assert.equal(state.s.shadow,'512');assert.equal(state.actual.shadows[0].size,512);assert.equal(state.renderer.exposure,1.6);assert.equal(state.view.exposure,1.6);assert(Math.abs(state.renderer.ratio-.65)<.01);
  // The pre-existing lighting panel and the shared graphics panel stay in sync.
  await page.evaluate(()=>__prismiaDebug.view.set('exposure',1.9));
  assert.equal(await page.locator('[data-v3d-setting="exposure"]').inputValue(),'1.9');
  // Simulate an older saved setting whose constant still exists but whose
  // implementation was removed from modern Three.js.
  await page.evaluate(()=>{const key='fws-prismia.viewport-graphics.v1',s=JSON.parse(localStorage.getItem(key));s.shadowType='soft';localStorage.setItem(key,JSON.stringify(s));});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__prismiaDebug?.runtime?.renderer.info.render.frame>0,null,{timeout:90000});
  state=await page.evaluate(()=>({settings:__prismiaDebug.viewportGraphics.value,view:__prismiaDebug.view.value,ratio:__prismiaDebug.viewport3d.renderer.getPixelRatio()}));
  assert.equal(state.settings.shadow,'512');assert.equal(state.settings.shadowType,'pcf');assert.equal(state.settings.exposure,1.9);assert.equal(state.view.exposure,1.9);assert(Math.abs(state.ratio-.65)<.01);
  // The old lighting checkbox remembers the chosen shadow quality even across
  // a reload while shadows are off, rather than silently replacing it with auto.
  await page.evaluate(()=>__prismiaDebug.view.set('shadows',false));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__prismiaDebug?.runtime?.renderer.info.render.frame>0,null,{timeout:90000});
  assert.equal(await page.evaluate(()=>__prismiaDebug.viewportGraphics.value.shadow),'off');
  await page.evaluate(()=>__prismiaDebug.view.set('shadows',true));
  assert.equal(await page.evaluate(()=>__prismiaDebug.viewportGraphics.value.shadow),'512');
  await page.locator('[data-v3d-graphics-toggle]').click();await page.locator('[data-v3d-reset]').click();
  state=await page.evaluate(()=>({settings:__prismiaDebug.viewportGraphics.value,view:__prismiaDebug.view.value}));
  assert.equal(state.settings.shadow,'auto');assert.equal(state.view.shadows,true);
  await page.evaluate(()=>__prismiaDebug.destroy());
  assert.equal(await page.locator('[data-v3d-graphics-panel]').count(),0,'portal is removed on studio teardown');assert.deepEqual(errors,[]);
  console.log('Prismia: shared view, unclipped scrollable graphics, real renderer, lighting sync, persistence, reset and teardown PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
