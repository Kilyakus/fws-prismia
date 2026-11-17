/* The built-in framework scope, independent of Prismia's scene/controls. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
(async()=>{
 let browser,server;
 try{
  const {createServer}=await import('vite');
  server=await createServer({root:resolve(__dirname,'..'),configFile:false,appType:'custom',logLevel:'silent',server:{host:'127.0.0.1',port:0}});
  server.middlewares.use((req,res,next)=>{
    if(req.url!=='/__viewport-test')return next();
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><div id="host" style="width:600px;height:400px"></div>');
  });
  await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:900,height:650},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url+'/__viewport-test');
  await page.addStyleTag({url:url+'/node_modules/uix-preparatorio/src/web/assets/css/base.css'});
  await page.addStyleTag({url:url+'/node_modules/uix-preparatorio/src/web/assets/css/components.css'});
  await page.addStyleTag({url:url+'/node_modules/framework-preparatorio/src/scopes/viewport3d/styles.css'});
  await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createCustomSelect,syncRangeFill}=await import('/node_modules/uix-preparatorio/src/app/main.js');
    const {createViewport3DScope}=await import('/node_modules/framework-preparatorio/src/scopes/viewport3d/index.js');
    const scope=createViewport3DScope({enabled:true}),host=document.querySelector('#host');host.innerHTML=scope.template;
    window.__orbitChanges=0;window.__invalidations=0;window.__hostInvalidations=0;window.__assetDisposals=0;window.__externalEnable=true;
    window.__builtin=scope.activate({node:host.querySelector('[data-viewport3d-scope]'),viewport3d:{
      THREE,loop:false,ui:{createCustomSelect,syncRangeFill},
      onReady(v){v.camera.position.set(0,0,4);},
      plugins:[{id:'test-cube',activate({viewport,defer}){
        const geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial({color:0x44aaff});
        const mesh=new THREE.Mesh(geometry,material);viewport.scene.add(mesh);
        defer(()=>{mesh.removeFromParent();geometry.dispose();material.dispose();window.__assetDisposals++;});
      }}],
      modeOptions:{tools:[{id:'select',label:'Выбрать'}],modes:[{id:'edit',label:'Правка',description:'Правка объекта.',tools:['orbit','select'],defaultTool:'select'},{id:'denied',label:'Отклонён',description:'Хост отклоняет переход.',tools:['orbit']},{id:'unavailable',label:'Недоступен',description:'Расширение отключено.',available:false,tools:['orbit']}],onModeChange:id=>id!=='denied'},
      graphicsOptions:{invalidate(){window.__invalidations++;}},
      invalidate(){window.__hostInvalidations++;},
      orbitOptions:{onChange(){window.__orbitChanges++;},isEnabled:()=>window.__externalEnable},
    }});
  });
  await page.waitForFunction(()=>window.__builtin?.viewport3d.renderer.info.render.frame>0,null,{timeout:30000});
  const mode=page.locator('[data-v3d-mode-host] [role="combobox"]');
  assert.equal(await page.locator('[data-v3d-mode-host] select').count(),0);
  await mode.click();
  const list=page.locator('.prep-select-menu:visible');
  assert.deepEqual(await list.locator('[role="option"] .prep-select-option-title').allTextContents(),['Просмотр','Правка','Отклонён','Недоступен']);
  assert.equal(await list.locator('[data-value="unavailable"]').isDisabled(),true);
  assert.match(await list.locator('[data-value="edit"] .prep-select-option-description').textContent(),/Правка объекта/);
  await list.locator('[data-value="denied"]').click();
  assert.equal(await mode.evaluate(el=>el.value),'view','a host-rejected transition restores the selected label');
  assert.deepEqual(await page.locator('[data-v3d-tool-host] button:visible').allTextContents(),['Обзор']);
  const frame=await page.evaluate(()=>__builtin.viewport3d.renderer.info.render.frame);
  await page.evaluate(()=>__builtin.graphics.set({exposure:1.5,renderScale:.7}));
  await page.waitForFunction(frame=>__builtin.viewport3d.renderer.info.render.frame>frame,frame,{timeout:30000});
  assert.equal(await page.evaluate(()=>__builtin.viewport3d.renderer.getPixelRatio()),.7);
  assert(await page.evaluate(()=>__invalidations>0&&__hostInvalidations>0));
  // Resizing clears WebGL's drawing buffer even if DPR is unchanged. A
  // demand-rendered built-in scope must draw again without any user gesture.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const beforeResize=await page.evaluate(()=>__builtin.viewport3d.renderer.info.render.frame);
  await page.locator('#host').evaluate(host=>{host.style.width='520px';});
  await page.waitForFunction(frame=>__builtin.viewport3d.container.clientWidth===520&&__builtin.viewport3d.renderer.info.render.frame>frame,beforeResize,{timeout:30000});
  await mode.focus();await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.value),'view');
  await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement?.dataset.value),'edit');
  await page.keyboard.press('Enter');assert.equal(await mode.evaluate(el=>el.value),'edit');
  assert.deepEqual(await page.locator('[data-v3d-tool-host] button:visible').allTextContents(),['Обзор','Выбрать']);
  assert.equal(await page.locator('[data-viewport-tool="select"]').getAttribute('aria-pressed'),'true');
  const canvas=page.locator('#host canvas'),box=await canvas.boundingBox(),before=await page.evaluate(()=>__builtin.viewport3d.camera.position.toArray());
  const drag=async()=>{await page.mouse.move(box.x+box.width*.55,box.y+box.height*.55);await page.mouse.down();await page.mouse.move(box.x+box.width*.68,box.y+box.height*.55,{steps:5});await page.mouse.up();};
  await drag();assert.deepEqual(await page.evaluate(()=>__builtin.viewport3d.camera.position.toArray()),before,'non-orbit tool must not rotate the camera');
  await page.locator('[data-viewport-tool="orbit"]').click();await drag();
  const after=await page.evaluate(()=>__builtin.viewport3d.camera.position.toArray());
  assert(after.some((n,i)=>Math.abs(n-before[i])>.01));assert(await page.evaluate(()=>__orbitChanges>0));
  await page.evaluate(()=>{window.__externalEnable=false;});await drag();
  assert.deepEqual(await page.evaluate(()=>__builtin.viewport3d.camera.position.toArray()),after,'host may suspend orbit input');
  await page.locator('[data-v3d-graphics-toggle]').click();assert(await page.locator('[data-v3d-graphics-panel]').isVisible());
  assert.equal(await page.locator('[data-v3d-graphics] select').count(),0);
  assert.equal(await page.locator('[data-v3d-graphics] input[type="range"]').count(),7);
  assert.equal(await page.locator('[data-v3d-graphics] .range-row input[type="range"]').count(),7);
  assert.match(await page.locator('[data-v3d-setting="renderScale"]').evaluate(el=>el.style.getPropertyValue('--range-fill')),/13\.33%/);
  const track=await page.locator('[data-v3d-setting="renderScale"]').evaluate(el=>({appearance:getComputedStyle(el).appearance,height:getComputedStyle(el).height,
    rule:[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules]).some(rule=>rule.selectorText?.includes('.range-row')&&rule.selectorText.includes('::-webkit-slider-runnable-track')&&rule.style?.background.includes('--range-fill'))}));
  assert.equal(track.appearance,'none');assert.equal(track.height,'18px');assert(track.rule,'Preparatorio track consumes the synchronized fill');
  const tone=page.locator('[data-v3d-setting="toneMapping"]');await tone.scrollIntoViewIfNeeded();await tone.click();
  assert(await page.locator('.prep-select-menu:visible [data-value="reinhard"] .prep-select-option-description').isVisible());
  await page.keyboard.press('Escape');assert(await page.locator('[data-v3d-graphics-panel]').isVisible());
  await tone.click();
  await page.locator('[data-v3d-graphics-panel]').evaluate(panel=>{panel.hidden=true;});
  await page.locator('.prep-select-menu').waitFor({state:'detached'});
  await page.locator('[data-v3d-graphics-panel]').evaluate(panel=>{panel.hidden=false;});
  await tone.click();
  await page.evaluate(()=>{window.__builtin.viewport3d.dispose();window.__builtin.viewport3d.dispose();});
  assert.equal(await page.locator('.prep-select-menu').count(),0,'disposal removes a child select portal');
  assert.equal(await page.evaluate(()=>__assetDisposals),1);assert.equal(await canvas.count(),0);
  assert.equal(await page.locator('body > [data-v3d-graphics-panel]').count(),0);
  assert.equal(await page.locator('[data-v3d-graphics]').count(),0);assert.equal(await page.locator('[data-v3d-mode-host] [role=combobox]').count(),0);
  const rollback=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createCustomSelect,syncRangeFill}=await import('/node_modules/uix-preparatorio/src/app/main.js');
    const {createViewport3DScope}=await import('/node_modules/framework-preparatorio/src/scopes/viewport3d/index.js');
    const scope=createViewport3DScope({enabled:true}),host=document.querySelector('#host');host.innerHTML=scope.template;
    let count=0,error='';
    try{scope.activate({node:host.querySelector('[data-viewport3d-scope]'),viewport3d:{THREE,loop:false,ui:{syncRangeFill,createCustomSelect(config){if(++count===4)throw Error('test ui failure');return createCustomSelect(config);}}}});}catch(e){error=e.message;}
    return {error,selects:host.querySelectorAll('[data-prep-select]').length,graphics:host.querySelectorAll('[data-v3d-graphics]').length,canvases:host.querySelectorAll('canvas').length,portals:document.querySelectorAll('.prep-select-menu').length};
  });
  assert.deepEqual(rollback,{error:'test ui failure',selects:0,graphics:0,canvases:0,portals:0});
  assert.deepEqual(errors,[]);
  console.log('Framework built-in viewport: real WebGL, demand frames, extensions, gated orbit and automatic teardown PASS');
 }finally{await browser?.close();await server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
