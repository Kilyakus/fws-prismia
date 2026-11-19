import * as THREE from 'three';

/** Data-driven light looks. Values are intentionally modest rather than a post
 * effect; scene material, albedo, IBL and a host's exposure still matter. */
export const LOOK_PROFILES = Object.freeze({
  studio: Object.freeze({ label:'Мягкая студия', background:0x191524, sky:0xd3d5f1, ground:0x555064, hemi:0.94, ambientColor:0xffffff, ambient:0.40, keyColor:0xfff1e1, key:1.72, fillColor:0xc8c4f3, fill:0.48, rimColor:0xbda6ff, rim:0.32, exposure:1.08 }),
  sunrise: Object.freeze({ label:'Рассвет', background:0x352938, sky:0xb8c9ef, ground:0x8c665c, hemi:0.78, ambientColor:0xffe5d2, ambient:0.16, keyColor:0xffc491, key:2.0, fillColor:0x9aafe9, fill:0.42, rimColor:0xffaf92, rim:0.25, exposure:1.04 }),
  overcast: Object.freeze({ label:'Пасмурно', background:0x29313e, sky:0xdce9f8, ground:0x62616b, hemi:1.02, ambientColor:0xe8efff, ambient:0.25, keyColor:0xeaf1ff, key:1.08, fillColor:0xc8d5f1, fill:0.55, rimColor:0xb5caff, rim:0.16, exposure:1.05 }),
  night: Object.freeze({ label:'Неоновая ночь', background:0x151327, sky:0x9c9cda, ground:0x333044, hemi:0.55, ambientColor:0xaeb7ff, ambient:0.08, keyColor:0xc5b5ff, key:1.25, fillColor:0x84bde6, fill:0.38, rimColor:0xf496df, rim:0.62, exposure:1.05 }),
});

const NAMES = ['hemi','ambient','key','fill','rim','exposure'];
const COLORS = ['background','sky','ground','ambientColor','keyColor','fillColor','rimColor'];
function snapshot(profile) {
  const value = {};
  for (const name of NAMES) value[name] = Number(profile[name]);
  for (const name of COLORS) value[name] = new THREE.Color(profile[name]);
  return value;
}

/** Transitions numeric light/color values continuously, without shader rebuilds. */
export function createLookMixer({ scene, renderer, hemiLight, ambientLight, keyLight, fillLight, rimLight, initial = 'studio' } = {}) {
  const refs = {scene, renderer, hemiLight, ambientLight, keyLight, fillLight, rimLight};
  let current = snapshot(LOOK_PROFILES[initial] ?? LOOK_PROFILES.studio);
  let from = current, to = current, elapsed = 0, duration = 0, id = initial;
  function render() {
    if (scene) {
      if (!scene.background?.isColor) scene.background = new THREE.Color();
      scene.background.copy(current.background);
    }
    if (hemiLight) { hemiLight.color.copy(current.sky); hemiLight.groundColor.copy(current.ground); hemiLight.intensity = current.hemi; }
    if (ambientLight) { ambientLight.color.copy(current.ambientColor); ambientLight.intensity = current.ambient; }
    if (keyLight) { keyLight.color.copy(current.keyColor); keyLight.intensity = current.key; }
    if (fillLight) { fillLight.color.copy(current.fillColor); fillLight.intensity = current.fill; }
    if (rimLight) { rimLight.color.copy(current.rimColor); rimLight.intensity = current.rim; }
    if (renderer) renderer.toneMappingExposure = current.exposure;
  }
  render();
  return {
    get id() { return id; },
    get refs() { return refs; },
    set(name, { duration: seconds = 0.7 } = {}) {
      const profile = typeof name === 'string' ? LOOK_PROFILES[name] : name;
      if (!profile) return false;
      const copy = {};
      for (const n of NAMES) copy[n] = current[n];
      for (const n of COLORS) copy[n] = current[n].clone();
      from = copy; to = snapshot(profile); id = typeof name === 'string' ? name : 'custom';
      elapsed = 0; duration = Math.max(0, Number(seconds) || 0);
      if (!duration) { current = to; render(); }
      return true;
    },
    update(dt) {
      if (!duration) return;
      elapsed = Math.min(duration, elapsed + Math.max(0, Number(dt) || 0));
      const t = elapsed / duration;
      for (const n of NAMES) current[n] = THREE.MathUtils.lerp(from[n], to[n], t);
      for (const n of COLORS) current[n].copy(from[n]).lerp(to[n], t);
      render();
      if (t >= 1) duration = 0;
    },
  };
}
