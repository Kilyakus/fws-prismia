/* A dropped-in extension must be discovered by Vite, without changing a registry. */
const {chromium}=require('playwright');
const {mkdtempSync,cpSync,symlinkSync,rmSync,mkdirSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'..'),tmp=mkdtempSync(join(tmpdir(),'prismia-viewport-discovery-'));
(async()=>{
 let browser;
 try {
  for(const item of ['src','api','package.json','package-lock.json','vite.config.js','THIRD_PARTY_NOTICES.txt'])
    cpSync(join(root,item),join(tmp,item),{recursive:true});
  symlinkSync(join(root,'node_modules'),join(tmp,'node_modules'),'dir');
  const extensions=join(tmp,'src/plugins/viewport3d/extensions');mkdirSync(extensions,{recursive:true});
  writeFileSync(join(extensions,'probe.js'),`export default {id:'folder-probe',requires:{scopes:['properties'],apis:['graph'],plugins:['prismia-material-preview']},
    activate({apis,defer,signal}){(window.__folderEvents ||= []).push('start');defer(()=>window.__folderEvents.push('stop:'+signal.aborted));return {api:!!apis.graph};}};\n`);
  execFileSync('npm',['run','build'],{cwd:tmp,timeout:180000,stdio:'pipe'});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(join(tmp,'standalone/index.html')).href+'?debug=1');
  await page.waitForFunction(()=>window.__prismiaDebug?.runtime?.renderer?.info.render.frame>0,null,{timeout:90000});
  const result=await page.evaluate(()=>{
    const app=window.__prismiaDebug,v=app.viewport3d,first=v.getPlugin('folder-probe');
    v.setScopeAvailable('properties',false);const off=v.getPlugin('folder-probe');
    v.setScopeAvailable('properties',true);const on=v.getPlugin('folder-probe');app.destroy();
    return {first,off,on,events:window.__folderEvents};
  });
  assert.deepEqual(result,{first:true,off:null,on:true,events:['start','stop:true','start','stop:true']});
  assert.deepEqual(errors,[]);console.log('Prismia drop-in viewport extension discovery, scope gating and cleanup: PASS');
 } finally {await browser?.close();rmSync(tmp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
