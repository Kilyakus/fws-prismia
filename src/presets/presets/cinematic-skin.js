import { makePhysical } from "../_lib/materials.js";

/** Matte skin with a very soft wide highlight and light sheen. */
export default {
  id: "cinematic-skin",
  label: "Кинематограф: кожа",
  description: "Матовая кожа с очень мягким широким бликом и лёгким sheen",
  group: "cinematic",
  order: 31,
  build: (source, ctx) =>
    makePhysical(source, {
      tag: "cinematic-skin",
      roughness: 0.54,
      metalness: 0,
      sheen: 0.25,
      sheenColor: 0xffe2d2,
      sheenRoughness: 0.82,
      specularIntensity: 0.42,
      clearcoat: 0.035,
      clearcoatRoughness: 0.72,
      envMap: ctx?.envMap,
      envMapIntensity: 0.85,
    }),
};
