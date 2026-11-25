/* Narrow touch viewport: actual Preparatorio portals, options and range track. */
const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=384']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(resolve(__dirname,'../standalone/index.html')).href+'?debug=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__prismiaDebug?.viewport3d?.renderer.info.render.frame>0,null,{timeout:120000});
  const mode=page.locator('[data-v3d-mode-host] [role="combobox"]');assert(await mode.isVisible());
  assert.equal(await page.locator('.prismia-area-viewport > .b-header').isVisible(),false);
  await mode.tap();
  let menu=page.locator('.prep-select-menu:visible');
  assert.match(await menu.locator('[data-value="view"] .prep-select-option-description').textContent(),/обзор сцены/i);
  await page.keyboard.press('Escape');
  const toggle=page.locator('[data-v3d-graphics-toggle]');await toggle.tap();
  const panel=page.locator('[data-v3d-graphics-panel]');await panel.waitFor({state:'visible'});
  await page.waitForFunction(()=>{
    const p=document.querySelector('[data-v3d-graphics-panel]'),r=p.getBoundingClientRect();
    return getComputedStyle(p).position==='fixed'&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;
  },null,{timeout:10000});
  const tone=page.locator('[data-v3d-setting="toneMapping"]');await tone.scrollIntoViewIfNeeded();await tone.tap();
  menu=page.locator('.prep-select-menu:visible');
  const bounds=await menu.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};});
  assert(bounds.left>=0&&bounds.top>=0&&bounds.right<=bounds.width&&bounds.bottom<=bounds.height,JSON.stringify(bounds));
  assert(await menu.locator('[data-value="reinhard"] .prep-select-option-description').isVisible());
  await menu.locator('[data-value="reinhard"]').tap();assert(await panel.isVisible());
  assert.equal(await page.evaluate(()=>window.__prismiaDebug.viewportGraphics.value.toneMapping),'reinhard');
  const slider=page.locator('[data-v3d-setting="exposure"]');await slider.scrollIntoViewIfNeeded();
  const box=await slider.boundingBox();await slider.tap({position:{x:Math.floor(box.width*.72),y:Math.floor(box.height/2)}});
  const track=await slider.evaluate(el=>({value:Number(el.value),fill:el.style.getPropertyValue('--range-fill'),appearance:getComputedStyle(el).appearance}));
  assert.equal(track.appearance,'none');assert(Number.parseFloat(track.fill)>60);assert(track.value>1.5);
  assert.equal(await page.evaluate(()=>window.__prismiaDebug.viewportGraphics.value.exposure),track.value);
  await page.evaluate(()=>window.__prismiaDebug.destroy());
  assert.equal(await page.locator('.prep-select-menu').count(),0);assert.deepEqual(errors,[]);
  console.log('Prismia: narrow touch viewport, described menu, library slider and teardown PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
