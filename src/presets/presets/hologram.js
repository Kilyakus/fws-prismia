import { makeStandard } from "../_lib/materials.js";

/** Translucent cyan shell. */
export default {
  id: "hologram",
  label: "Hologram / Scanner",
  description: "Полупрозрачный светящийся корпус с холодным голубым сканом",
  group: "material",
  order: 27,
  build: (source, ctx) =>
    makeStandard(source, {
      tag: "hologram",
      tint: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveMix: 0.9,
      emissiveIntensity: 0.95,
      roughness: 0.12,
      metalness: 0.45,
      opacity: 0.68,
      transparent: true,
      envMap: ctx?.envMap,
      envMapIntensity: 0.9,
    }),
};
