import {buildSourceStyle} from '../_lib/source-styles.js';
import { makeStandard } from "../_lib/materials.js";

/** Physically based surface that keeps the picked colour. */
export default {
  id: "pbr",
  label: "PBR",
  description:
    "Физически корректное освещение: матовая поверхность и мягкие блики",
  group: "base",
  order: 2,
  build: (source, ctx) =>
    buildSourceStyle("pbr", source, ctx, (source, ctx) => makeStandard(source, {
      tag: "pbr",
      roughness: 0.72,
      metalness: 0,
      envMap: ctx?.envMap,
      envMapIntensity: 0.55,
    })),
};
