import * as THREE from 'three';

/** A fixed-size directional shadow volume, following a focus in world space.
 * Keep the expensive map bounded; snap its projection to whole shadow texels so
 * subpixel camera/player motion does not make stationary shadows shimmer.
 * `extent` is half the orthographic width in metres, not an infinite distance.
 * The light and its target must be direct children of the same unscaled scene.
 */
export class DirectionalShadowVolume {
  constructor({ light, scene, extent = 22, distance = 60, depth = 140 } = {}) {
    if (!light?.isDirectionalLight || !light.shadow?.camera) throw new TypeError('DirectionalShadowVolume requires a directional light');
    this.light = light;
    this.scene = scene ?? light.parent;
    if (!light.target.parent && this.scene) this.scene.add(light.target);
    this.distance = Math.max(1, distance);
    this.depth = Math.max(this.distance + 1, depth);
    this.extent = 0;
    this.center = new THREE.Vector3();
    this._direction = new THREE.Vector3();
    this._x = new THREE.Vector3();
    this._y = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._forward = new THREE.Vector3();
    this.setExtent(extent);
  }
  setExtent(extent) {
    const value = THREE.MathUtils.clamp(Number(extent) || 1, 1, 80);
    if (this.extent === value) return false;
    this.extent = value;
    const camera = this.light.shadow.camera;
    camera.left = camera.bottom = -value;
    camera.right = camera.top = value;
    camera.near = 0.1;
    camera.far = this.depth;
    camera.updateProjectionMatrix();
    this.light.shadow.needsUpdate = true;
    return true;
  }
  /** Update after the host has placed the camera and set the light direction.
   * focus is a world-space position. viewDirection can bias coverage ahead. */
  update(focus, { viewDirection = null, lead = 0 } = {}) {
    if (!focus || !Number.isFinite(focus.x) || !Number.isFinite(focus.y) || !Number.isFinite(focus.z)) return false;
    const { light } = this;
    const direction = this._direction.copy(light.position).sub(light.target.position);
    if (direction.lengthSq() < 1e-8) direction.set(-3, 5, 4);
    direction.normalize();
    this.center.copy(focus);
    if (viewDirection && Number.isFinite(lead) && lead !== 0) {
      this._forward.set(viewDirection.x, 0, viewDirection.z);
      if (this._forward.lengthSq() > 1e-8) this.center.addScaledVector(this._forward.normalize(), lead);
    }
    const x = this._x.crossVectors(this._up, direction);
    // A vertical light has no horizontal cross product: use another stable up.
    if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
    else x.normalize();
    const y = this._y.crossVectors(direction, x).normalize();
    const width = Math.max(1, light.shadow.mapSize.x || 1);
    const height = Math.max(1, light.shadow.mapSize.y || 1);
    const stepX = 2 * this.extent / width, stepY = 2 * this.extent / height;
    const u = this.center.dot(x), v = this.center.dot(y);
    this.center.addScaledVector(x, Math.round(u / stepX) * stepX - u)
      .addScaledVector(y, Math.round(v / stepY) * stepY - v);
    light.target.position.copy(this.center);
    light.position.copy(this.center).addScaledVector(direction, this.distance);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
    return true;
  }
}
