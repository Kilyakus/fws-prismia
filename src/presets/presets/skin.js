import { makeStandard } from "../_lib/materials.js";

/** Semi-matte skin with a broad, low-intensity highlight. */
export default {
  id: "skin",
  label: "Студийная кожа",
  description: "Полуматовая кожа с мягким рассеянным бликом",
  group: "material",
  order: 21,
  build: (source, ctx) =>
    makeStandard(source, {
      tag: "skin",
      tint: 0xe8beac,
      roughness: 0.48,
      metalness: 0.04,
      envMap: ctx?.envMap,
      envMapIntensity: 0.5,
    }),
};
