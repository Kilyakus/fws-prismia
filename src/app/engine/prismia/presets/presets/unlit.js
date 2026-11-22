import {buildSourceStyle} from '../_lib/source-styles.js';
import { makeUnlit } from "../_lib/materials.js";

/** Flat colour and texture without lighting. */
export default {
  id: "unlit",
  label: "Unlit",
  description: "Без освещения: ровный цвет и текстура, как в эскизе",
  group: "base",
  order: 4,
  build: (source, ctx) => buildSourceStyle("unlit", source, ctx, source => makeUnlit(source, { tag: "unlit" })),
};
