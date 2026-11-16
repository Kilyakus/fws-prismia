import { makeStandard } from "../_lib/materials.js";

/** Matte surface that keeps the authored maps untouched. */
export default {
  id: "world",
  label: "Toon World",
  description: "Мягкий матовый вариант с исходными картами модели",
  group: "material",
  order: 20,
  build: (source, ctx) =>
    makeStandard(source, {
      tag: "world",
      roughness: 0.68,
      metalness: 0.02,
      envMap: ctx?.envMap,
      envMapIntensity: 0.4,
    }),
};
