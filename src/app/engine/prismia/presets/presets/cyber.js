import { makeStandard } from "../_lib/materials.js";

/** Polished metal with strong reflections. */
export default {
  id: "cyber",
  label: "Кибер-титан",
  description: "Глянцевый металл с холодным блеском и сильными отражениями",
  group: "material",
  order: 24,
  build: (source, ctx) =>
    makeStandard(source, {
      tag: "cyber",
      tint: 0x94a3b8,
      roughness: 0.22,
      metalness: 0.68,
      envMap: ctx?.envMap,
      envMapIntensity: 0.95,
    }),
};
