import {createMaterialPreview} from './material.js';

/** Subject-specific rendering and GPU graph evaluation, not part of viewport3d. */
export const materialPreview = Object.freeze({
  id:'prismia-material-preview',
  requires:{scopes:['viewport3d','graph'],apis:['graph','view','render']},
  activate({viewport,apis}) {
    const runtime=createMaterialPreview(viewport,apis);
    return {api:runtime,dispose:()=>runtime.dispose()};
  },
});

/** Toolbar is separate and only exists when both the viewport and material API exist. */
export const cameraTools = Object.freeze({
  id:'prismia-camera-tools',
  requires:{scopes:['viewport3d'],apis:['node','view'],plugins:['prismia-material-preview']},
  activate({viewport,apis,signal,defer}) {
    const {node,view}=apis, runtime=viewport.getPlugin('prismia-material-preview');
    node.querySelector('[data-reset-camera]').addEventListener('click',runtime.resetCamera,{signal});
    node.querySelector('[data-snapshot]').addEventListener('click',runtime.snapshot,{signal});
    node.querySelector('[data-rotate]').addEventListener('click',()=>view.set('autoRotate',!view.value.autoRotate),{signal});
    defer(view.subscribe(s=>{
      node.querySelector('[data-rotate]').setAttribute('aria-pressed',String(s.autoRotate));
    }));
  },
});
export default Object.freeze([materialPreview,cameraTools]);
