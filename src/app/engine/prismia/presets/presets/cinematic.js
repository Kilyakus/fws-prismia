import { makePhysical } from "../_lib/materials.js";

/** Physical PBR with a restrained top highlight. */
export default {
  id: "cinematic",
  label: "Кинематограф: PBR",
  description: "Физический PBR с нейтральным IBL и умеренным верхним бликом",
  group: "cinematic",
  order: 30,
  build: (source, ctx) =>
    makePhysical(source, {
      tag: "cinematic",
      roughness: 0.6,
      metalness: 0.02,
      ior: 1.45,
      clearcoat: 0.1,
      clearcoatRoughness: 0.55,
      envMap: ctx?.envMap,
      envMapIntensity: 1,
    }),
};
