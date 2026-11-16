import { makePhysical } from '../_lib/materials.js';
import { proceduralSurface } from '../_lib/procedural.js';

export default {
  id: 'wet-asphalt', label: 'Мокрый асфальт', group: 'world', order: 40,
  targets: ['world', 'preview'],
  description: 'PBR: процедурные лужи в мировых координатах, шероховатость и анимированная рябь. Отражает IBL; это не SSR.',
  build: (source, ctx) => proceduralSurface(makePhysical(source, {
    tag: 'wet-asphalt', roughness: 0.83, metalness: 0.02, clearcoat: 0.22,
    clearcoatRoughness: 0.27, envMap: ctx?.envMap, envMapIntensity: 1.15,
  }), {kind: 'wet', amount: 0.85, scale: 1, ripple: 0.4}),
};
