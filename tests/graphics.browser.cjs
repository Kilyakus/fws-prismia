const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
async function openSelect(page,selector){
  const trigger=page.locator(selector);await trigger.scrollIntoViewIfNeeded();
  if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();
  const id=await trigger.getAttribute('aria-controls');
  const menu=page.locator(`[id="${id}"]`);await menu.waitFor({state:'visible'});return menu;
}
async function choose(page,selector,value){
  const menu=await openSelect(page,selector);
  await menu.locator(`[role="option"][data-value="${value}"]`).click();
}
async function selected(page,selector){return page.locator(selector).evaluate(element=>element.value);}

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=384']});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:750},deviceScaleFactor:1,reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const url=pathToFileURL(resolve(__dirname,'../standalone/index.html')).href+'?debug=1';
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__prismiaDebug?.runtime?.renderer.info.render.frame>0,null,{timeout:90000});
  assert.equal(await page.locator('[data-v3d-mode-host] select').count(),0);
  assert.equal(await selected(page,'[data-v3d-mode-host] [role="combobox"]'),'view');
  let modeMenu=await openSelect(page,'[data-v3d-mode-host] [role="combobox"]');
  assert.deepEqual(await modeMenu.locator('[role="option"] .prep-select-option-title').allTextContents(),['Просмотр']);
  assert.match(await modeMenu.locator('[role="option"] .prep-select-option-description').textContent(),/обзор сцены/i);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.v3d-title').count(),0);
  assert.equal(await page.locator('[data-v3d-graphics] select').count(),0);
  assert.deepEqual(await page.locator('[data-v3d-tool-host] button:visible').allTextContents(),['Обзор']);
  assert.equal(await page.locator('[data-v3d-status-item="live"]').textContent(),'LIVE MATERIAL');
  assert.equal(await page.locator('[data-v3d-status-item="subject"]').textContent(),'Сфера');
  assert.equal(await page.locator('[data-v3d-status-item="help"]').textContent(),'ЛКМ — вращение · колесо — масштаб');
  assert(await page.locator('.v3d-header [data-snapshot]').isVisible(),'viewport actions live in the shared header');
  await page.locator('[data-v3d-graphics-toggle]').click();
  await page.locator('[data-v3d-graphics]').waitFor({state:'visible'});
  const firstBounds=await page.locator('[data-v3d-graphics-panel]').evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight};});
  assert(firstBounds.top>=0&&firstBounds.bottom<=firstBounds.height,'the first visible opening is positioned on screen');
  assert.equal(await page.locator('.prismia-area-viewport > .b-header').isVisible(),false);
  let shadowMenu=await openSelect(page,'[data-v3d-setting="shadowType"]');
  assert(await shadowMenu.locator('[data-value="soft"]').isDisabled());
  assert.match(await shadowMenu.locator('[data-value="soft"] .prep-select-option-description').textContent(),/недоступно/i);
  await page.keyboard.press('Escape');
  assert(await page.locator('[data-v3d-graphics-panel]').isVisible(),'Escape closes only the select first');
  assert((await page.locator('[data-v3d-shadow-type-info]').textContent()).includes('недоступен'));
  await choose(page,'[data-v3d-setting="shadowType"]','vsm');
  assert(await page.evaluate(()=>__prismiaDebug.viewport3d.renderer.shadowMap.type===__prismiaDebug.viewport3d.THREE.VSMShadowMap));
  await choose(page,'[data-v3d-setting="shadowType"]','pcf');
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
  await choose(page,'[data-v3d-setting="anisotropy"]','4');assert.equal(await selected(page,'[data-v3d-setting="anisotropy"]'),'4');
  await page.keyboard.press('Escape');assert(!(await page.locator('[data-v3d-graphics-panel]').isVisible()));
  await page.locator('[data-v3d-graphics-toggle]').click();
  await choose(page,'[data-v3d-setting="toneMapping"]','reinhard');
  await choose(page,'[data-v3d-setting="shadow"]','512');
  await page.locator('[data-v3d-setting="renderScale"]').evaluate(el=>{el.value='0.65';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('[data-v3d-setting="exposure"]').evaluate(el=>{el.value='1.6';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const exposure=page.locator('[data-v3d-setting="exposure"]');
  assert.equal(await page.locator('[data-v3d-graphics] .range-row input[type="range"]').count(),9);
  assert.equal(await exposure.evaluate(el=>el.style.getPropertyValue('--range-fill')),'50.00%');
  await exposure.focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>__prismiaDebug.viewportGraphics.value.exposure),1.61);
  assert.equal(await exposure.evaluate(el=>el.style.getPropertyValue('--range-fill')),'50.36%');
  await page.keyboard.press('ArrowLeft');
  const target=page.locator('[data-v3d-setting="adaptiveTarget"]');assert(await target.isDisabled());
  await page.locator('[data-v3d-setting="adaptiveResolution"]').check();assert(await target.isEnabled());
  await choose(page,'[data-v3d-setting="adaptiveTarget"]','45');
  assert.equal(await page.evaluate(()=>__prismiaDebug.viewportGraphics.value.adaptiveTarget),45);
  await page.locator('[data-v3d-setting="adaptiveResolution"]').uncheck();assert(await target.isDisabled());
  let state=await page.evaluate(()=>{const a=__prismiaDebug,g=a.viewportGraphics;return {s:g.value,actual:g.snapshot(),renderer:{tone:a.viewport3d.renderer.toneMapping,exposure:a.viewport3d.renderer.toneMappingExposure,ratio:a.viewport3d.renderer.getPixelRatio()},view:a.view.value};});
  assert.equal(state.s.shadow,'512');assert.equal(state.actual.shadows[0].size,512);assert.equal(state.renderer.exposure,1.6);assert.equal(state.view.exposure,1.6);assert(Math.abs(state.renderer.ratio-.65)<.01);
  // The pre-existing lighting panel and the shared graphics panel stay in sync.
  await page.evaluate(()=>__prismiaDebug.view.set('exposure',1.9));
  assert.equal(await page.locator('[data-v3d-setting="exposure"]').inputValue(),'1.9');
  assert.equal(await exposure.evaluate(el=>el.style.getPropertyValue('--range-fill')),'60.71%');
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
  assert(await exposure.evaluate(el=>el.style.getPropertyValue('--range-fill')===`${((Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min))*100).toFixed(2)}%`),'reset updates the library fill');
  await page.evaluate(()=>__prismiaDebug.destroy());
  assert.equal(await page.locator('[data-v3d-graphics-panel]').count(),0,'portal is removed on studio teardown');assert.deepEqual(errors,[]);
  console.log('Prismia: shared view, unclipped scrollable graphics, real renderer, lighting sync, persistence, reset and teardown PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
