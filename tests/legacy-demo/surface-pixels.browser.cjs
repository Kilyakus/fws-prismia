/* Actual WebGL pixel regression: wetness and animated normal ripple must change
 * the rendered image, not just a JavaScript field on the material. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{const p=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await p.goto(process.env.PRISMIA_URL||'http://127.0.0.1:5203/');await p.waitForFunction(()=>window.__PRISMIA,{timeout:90000});
  const result=await p.evaluate(()=>{const a=window.__PRISMIA;a.setShape('plane');a.selectPreset('wet-asphalt');a.renderer.setAnimationLoop(null);const u=a.sampleRoot.children[0].material.userData.prismUniforms;const gl=a.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
   const read=()=>{const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
   u.prismTime.value=1;u.prismAmount.value=0;a.renderer.render(a.scene,a.camera);const dry=read();
   u.prismAmount.value=1;a.renderer.render(a.scene,a.camera);const wet=read();
   u.prismTime.value=2.3;a.renderer.render(a.scene,a.camera);const later=read();
   let wetPixels=0,animatedPixels=0;for(let i=0;i<dry.length;i+=4){const diff=(x,y)=>Math.abs(x[i]-y[i])+Math.abs(x[i+1]-y[i+1])+Math.abs(x[i+2]-y[i+2]);if(diff(dry,wet)>12)wetPixels++;if(diff(wet,later)>3)animatedPixels++;}
   return {w,h,wetPixels,animatedPixels};});
  assert(result.wetPixels>300,JSON.stringify(result));assert(result.animatedPixels>100,JSON.stringify(result));assert.deepEqual(errors,[]);
  console.log(JSON.stringify({actualWebGLPixels:'PASS',...result}));await p.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
