import { makeStandard } from '../_lib/materials.js';
import { proceduralSurface } from '../_lib/procedural.js';

export default {
  id: 'sunrise-ground', label: 'Минеральная поверхность', group: 'world', order: 41,
  targets: ['world', 'preview'],
  description: 'Неброская процедурная зернистость грунта и камня в мировом пространстве; цвет и карты источника сохраняются.',
  build: (source, ctx) => proceduralSurface(makeStandard(source, {
    tag: 'sunrise-ground', roughness: 0.91, metalness: 0, envMap: ctx?.envMap, envMapIntensity: 0.65,
  }), {kind: 'stone', amount: 0.7, scale: 1}),
};
