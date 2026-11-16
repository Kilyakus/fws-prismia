import { makeStandard } from "../_lib/materials.js";

/** Fine sparkle: high metalness, low roughness, faint iridescent glow. */
export default {
  id: "glitter",
  label: "Glitter / Иридесценция",
  description: "Мелкая искра с радужным металлическим отблеском",
  group: "material",
  order: 25,
  build: (source, ctx) =>
    makeStandard(source, {
      tag: "glitter",
      roughness: 0.16,
      metalness: 0.48,
      emissive: 0x6366f1,
      emissiveMix: 0.35,
      emissiveIntensity: 0.16,
      envMap: ctx?.envMap,
      envMapIntensity: 1,
    }),
};
