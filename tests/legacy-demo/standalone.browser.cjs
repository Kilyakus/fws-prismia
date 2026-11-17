/* Exercise the bundled single HTML in an opaque, network-blocked sandbox,
 * and the same file at a narrow mobile viewport. */
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const output=process.env.OUTPUT_DIR||path.join(os.tmpdir(),'prismia-browser');fs.mkdirSync(output,{recursive:true});
const executablePath=process.env.CHROMIUM_PATH||undefined;
(async()=>{const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:850},deviceScaleFactor:1});const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.route(/^https?:\/\//,route=>{requests.push(route.request().url());route.abort()});
  await page.setContent('<!doctype html><iframe id="preview" sandbox="allow-scripts" style="width:100%;height:820px;border:0"></iframe>');
  const html=fs.readFileSync(require('node:path').join(__dirname,'../standalone/index.html'),'utf8');
  await page.evaluate(html=>{document.querySelector('#preview').srcdoc=html},html);
  const frame=page.frames().find(f=>f!==page.mainFrame());
  await frame.waitForFunction(()=>window.__PRISMIA&&document.querySelector('#runtime-status').textContent==='WebGL готов',{timeout:90000});
  assert.equal(await frame.locator('#preset-count').textContent(),'20');
  await frame.locator('[data-filter="world"]').click();await frame.locator('[data-preset="sunrise-ground"]').click();
  assert.equal(await frame.evaluate(()=>window.__PRISMIA.selected),'sunrise-ground');
  await frame.locator('[data-shape="torus"]').click();assert.equal(await frame.evaluate(()=>window.__PRISMIA.sampleRoot.children[0].geometry.type),'TorusKnotGeometry');
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);await page.close();
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await mobile.goto('file://'+require('node:path').resolve(__dirname,'../standalone/index.html'));
  await mobile.waitForFunction(()=>window.__PRISMIA,{timeout:90000});
  const sizes=await mobile.evaluate(()=>({body:document.body.scrollWidth,viewport:window.innerWidth,canvas:document.querySelector('canvas').clientWidth}));
  assert(sizes.body<=sizes.viewport,`horizontal overflow: ${JSON.stringify(sizes)}`);assert(sizes.canvas>200);
  await mobile.screenshot({path:path.join(output,'mobile.png'),fullPage:true});await mobile.close();
  console.log(JSON.stringify({offlineSandbox:'PASS',networkRequests:requests.length,mobile:'PASS',sizes}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
