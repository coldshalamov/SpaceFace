import * as THREE from 'three';

// Opaque camera-facing disk on an energy round. The visual-factory mesh is
// skipped for energy-card weapons, and the bolt is a thin transparent spindle,
// so the readability disk (inner 70% of entity.radius) was mostly background.
// MeshBasic, depthWrite, not additive: it fills that disk and is not combat VFX.
const CORE_CAPACITY = 256;
const _mat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _color = new THREE.Color();

export function projectileReadCoreActive(state) {
  const run = state && state.run;
  return !!(run && run.kind === 'survival');
}

export class ProjectileReadCores {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        depthWrite: true,
        depthTest: true,
        transparent: false,
        fog: false,
        toneMapped: false,
      }),
      CORE_CAPACITY,
    );
    this.mesh.name = 'SF_ProjectileReadCore';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.renderOrder = 11;
    this._n = 0;
    if (scene) scene.add(this.mesh);
  }

  begin() {
    this._n = 0;
  }

  write(x, y, z, radius, colorHex, camera) {
    if (this._n >= CORE_CAPACITY) return;
    const r = Number(radius);
    const body = Number.isFinite(r) && r > 0 ? r : 1;
    _pos.set(Number(x) || 0, Number(y) || 0, Number(z) || 0);
    if (camera && typeof camera.getWorldQuaternion === 'function') camera.getWorldQuaternion(_quat);
    else _quat.identity();
    _scl.set(body, body, body);
    _mat.compose(_pos, _quat, _scl);
    const i = this._n++;
    this.mesh.setMatrixAt(i, _mat);
    _color.set(colorHex || '#ffd24a');
    this.mesh.setColorAt(i, _color);
  }

  commit() {
    const n = this._n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    if (this._disposed || !this.mesh) return;
    this._disposed = true;
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
