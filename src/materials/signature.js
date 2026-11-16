/**
 * Material signature (/src/engine/shl/signature.js)
 *
 * Дешёвый отпечаток исходного материала: цвет, карты, прозрачность, сторона.
 * Ровно то, что меняет палитра/покраска модели, — и ничего больше. Движок
 * сравнивает отпечаток с сохранённым и решает, надо ли собирать материал
 * заново: без этого пресет продолжал бы рисоваться со старым цветом волос.
 */

function uuidOf(texture) {
  return texture?.uuid ?? "-";
}

/** Карты, которые движок считает значимыми для пересборки. */
export const SIGNATURE_MAPS = [
  "map",
  "shadeMultiplyTexture",
  "emissiveMap",
  "alphaMap",
  "normalMap",
  "aoMap",
  "roughnessMap",
  "metalnessMap",
];

export function materialSignature(source) {
  if (!source) return "none";
  const color = source.color?.getHexString?.() ?? "-";
  const emissive = source.emissive?.getHexString?.() ?? "-";
  const maps = SIGNATURE_MAPS.map(
    (key) => uuidOf(source[key] ?? source.uniforms?.[key]?.value),
  );
  return [
    source.uuid ?? "-",
    color,
    emissive,
    ...maps,
    source.opacity,
    source.transparent ? 1 : 0,
    source.alphaTest,
    source.side,
  ].join("|");
}
