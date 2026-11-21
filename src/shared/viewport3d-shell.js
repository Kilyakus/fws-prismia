import {VIEWPORT3D_TEMPLATE} from 'framework-preparatorio/scopes/viewport3d';

// The framework owns the gizmo markup and behaviour; the host only inserts
// the shared element into its own stage, found through the stable data hook.
export function mountSharedGizmoHost(stage) {
  if (!stage) throw new Error('viewport3d stage is missing');
  const existing=stage.querySelector('[data-v3d-gizmo]');
  if(existing)return existing;
  const template=stage.ownerDocument.createElement('template');
  template.innerHTML=VIEWPORT3D_TEMPLATE;
  const host=template.content.querySelector('[data-v3d-gizmo]');
  if(!host)throw new Error('framework viewport3d gizmo slot is missing');
  host.classList.add('fws-viewport-gizmo');stage.append(host);return host;
}

// The host supplies its visual theme; framework CSS remains mechanical only.
export const viewportClasses=Object.freeze({
  header:'b-header b-header-lumino fws-viewport-header',navigationButton:'b-header-btn',
  settingsToggle:'b-header-btn',settingsPanel:'b-menu-pop fws-viewport-menu',
  tool:'fws-viewport-tool',
});
