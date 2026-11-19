import { makeToon } from "../_lib/materials.js";

/** Classic two-step toon look with deeper shadows. */
export default {
  id: "toon93",
  label: "Poiyomi Toon 9.3 Legacy",
  description: "Контрастная двухступенчатая раскладка с глубокими тенями",
  group: "toon",
  order: 11,
  build: (source) =>
    makeToon(source, {
      tag: "toon93",
      steps: 2,
      low: 96,
      emissive: 0x24141c,
      emissiveIntensity: 0.18,
    }),
};
