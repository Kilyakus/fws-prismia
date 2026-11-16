import { makePhysical } from '../_lib/materials.js';
export default {
  id: 'clearcoat-paint', label: 'Лак / автомобильная краска', group: 'world', order: 42,
  targets: ['world', 'preview'],
  description: 'Физический лак с верхним покрытием и отражением окружения (IBL); без экранных отражений.',
  build: (source, ctx) => makePhysical(source, {
    tag: 'clearcoat-paint', roughness: 0.26, metalness: 0.32,
    clearcoat: 0.92, clearcoatRoughness: 0.12, envMap: ctx?.envMap, envMapIntensity: 1.1,
  }),
};
