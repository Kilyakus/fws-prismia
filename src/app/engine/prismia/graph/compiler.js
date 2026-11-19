import { NODE_TYPES } from './nodes.js';

const COMMON = `
float hash12(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))+uSeed*19.19)*43758.5453123); }
float tileNoise(vec2 uv, float scale) {
  vec2 p=fract(uv)*scale, i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  float a=hash12(mod(i,scale)), b=hash12(mod(i+vec2(1.,0.),scale));
  float c=hash12(mod(i+vec2(0.,1.),scale)), d=hash12(mod(i+vec2(1.,1.),scale));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}`;

/** Source for a single graph pass. Inputs are sampler2D textures, not embedded. */
export function compileNodeFragment(node) {
  const def=Object.hasOwn(NODE_TYPES,node?.type)?NODE_TYPES[node.type]:null;if(!def)throw new Error(`Неизвестный узел: ${node?.type}`);
  const textures=def.inputs.map(i=>`uniform sampler2D tex_${i.id};`);
  if(node.type==='bitmap')textures.push('uniform sampler2D tex_bitmap;');
  const params=Object.entries(def.params).filter(([,v])=>['range','choice','color'].includes(v.kind))
    .map(([key,v])=>`uniform ${v.kind==='color'?'vec3':'float'} p_${key};`);
  const implementation=def.custom?String(node.params?.code ?? def.params.code.default):`vec4 prismNode(vec2 uv) {\n  ${def.code}\n}`;
  return `precision highp float;\nvarying vec2 vUv;\nuniform vec2 uTexel;\nuniform float uSeed;\nuniform float uTime;\n${textures.join('\n')}\n${params.join('\n')}\n${COMMON}\n${implementation}\nvoid main() { gl_FragColor = clamp(prismNode(vUv), 0.0, 1.0); }\n`;
}

/** Compile-check user GLSL against the active WebGL2 context before committing. */
export function validateNodeFragment(gl, source) {
  if(!gl) return {ok:false,error:'Контекст WebGL недоступен.'};
  if(typeof source!=='string'||source.length>24000)return {ok:false,error:'Код слишком длинный.'};
  const prefix='#version 300 es\n#define varying in\n#define texture2D texture\nout highp vec4 prismFragColor;\n#define gl_FragColor prismFragColor\n';
  const shader=gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(shader,prefix+source);gl.compileShader(shader);
  const ok=!!gl.getShaderParameter(shader,gl.COMPILE_STATUS);
  const error=ok?'':(gl.getShaderInfoLog(shader)||'Ошибка компиляции GLSL');gl.deleteShader(shader);
  return {ok,error};
}
