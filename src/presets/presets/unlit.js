import { makeUnlit } from "../_lib/materials.js";

/** Flat colour and texture without lighting. */
export default {
  id: "unlit",
  label: "Unlit",
  description: "Без освещения: ровный цвет и текстура, как в эскизе",
  group: "base",
  order: 4,
  build: (source) => makeUnlit(source, { tag: "unlit" }),
};
