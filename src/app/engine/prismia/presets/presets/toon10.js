import { makeToon } from "../_lib/materials.js";

/** Finer toon ramp with a soft lift inside the shadow band. */
export default {
  id: "toon10",
  label: "Poiyomi Toon 10.0",
  description: "Мягкая градация теней и лёгкая подсветка в тенях",
  group: "toon",
  order: 10,
  build: (source) =>
    makeToon(source, {
      tag: "toon10",
      steps: 5,
      low: 140,
      emissive: 0x1a1014,
      emissiveIntensity: 0.12,
    }),
};
