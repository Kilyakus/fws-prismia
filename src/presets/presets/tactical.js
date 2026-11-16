import { makeStandard } from "../_lib/materials.js";

/** Cool blue shift with a slight metallic sheen. */
export default {
  id: "tactical",
  label: "Тактический синий",
  description: "Холодный синий оттенок с металлическим отливом",
  group: "material",
  order: 23,
  build: (source, ctx) =>
    makeStandard(source, {
      tag: "tactical",
      tint: 0x4772b3,
      roughness: 0.35,
      metalness: 0.22,
      envMap: ctx?.envMap,
      envMapIntensity: 0.7,
    }),
};
