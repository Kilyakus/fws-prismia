import { makeStandard } from "../_lib/materials.js";

/** Matte clay: reads the silhouette, hides surface noise. */
export default {
  id: "clay",
  label: "Скульптурная глина",
  description: "Матовая глиняная поверхность без бликов — удобно читать форму",
  group: "material",
  order: 22,
  build: (source, ctx) =>
    makeStandard(source, {
      tag: "clay",
      tint: 0xd8dee9,
      roughness: 0.42,
      metalness: 0.08,
      envMap: ctx?.envMap,
      envMapIntensity: 0.35,
    }),
};
