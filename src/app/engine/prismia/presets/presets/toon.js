import {buildSourceStyle} from '../_lib/source-styles.js';
import { makeToon } from "../_lib/materials.js";

/** Hard-stepped cel shading. */
export default {
  id: "toon",
  label: "Toon",
  description: "Ступенчатая заливка с резкой границей света и тени",
  group: "base",
  order: 3,
  build: (source, ctx) => buildSourceStyle("toon", source, ctx, source => makeToon(source, { tag: "toon", steps: 3, low: 120 })),
};
