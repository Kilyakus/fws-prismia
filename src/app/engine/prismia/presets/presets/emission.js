import { makeStandard } from "../_lib/materials.js";

/** Self-lit pulse that stays readable in shadow. */
export default {
  id: "emission",
  label: "Emission Pulse",
  description: "Собственное свечение в цвете кожи и одежды — читается и в тени",
  group: "material",
  order: 26,
  build: (source, ctx) =>
    makeStandard(source, {
      tag: "emission",
      roughness: 0.42,
      metalness: 0.12,
      emissive: 0xf43f5e,
      emissiveMix: 0.4,
      emissiveIntensity: 0.3,
      envMap: ctx?.envMap,
      envMapIntensity: 0.5,
    }),
};
