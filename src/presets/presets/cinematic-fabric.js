import { makePhysical } from "../_lib/materials.js";

/** Fabric with a full sheen layer — reads as cloth under rim light. */
export default {
  id: "cinematic-fabric",
  label: "Кинематограф: ткань",
  description: "Ткань с выраженным sheen: ворсистый отлив по краям и складкам",
  group: "cinematic",
  order: 32,
  build: (source, ctx) =>
    makePhysical(source, {
      tag: "cinematic-fabric",
      roughness: 0.78,
      metalness: 0,
      sheen: 1,
      sheenColor: 0xdfe8ff,
      sheenRoughness: 0.65,
      envMap: ctx?.envMap,
      envMapIntensity: 0.7,
    }),
};
