import * as THREE from 'three';

export const VFX_EVENT_LOBES = 3;
export const VFX_EVENT_ROWS = 16;
export const VFX_EVENT_COLUMNS = 8;
export const VFX_EVENT_TRIANGLES = VFX_EVENT_LOBES * VFX_EVENT_ROWS * VFX_EVENT_COLUMNS * 2;

/**
 * One immutable, closed three-lobe carrier for every transient energy/matter event.
 * The old carrier was one 32x12 sheet: 768 triangles with no thickness. This keeps the
 * same triangle budget, but spends it on three closed 16x8 volumes with real parallax.
 * Instance descriptors supply the physical family and lifecycle; no geometry is rebuilt.
 */
export function createVfxEventGeometry({ instanced = false } = {}) {
  const positions = [];
  const uvs = [];
  const sections = [];
  const indices = [];
  for (let lobe = 0; lobe < VFX_EVENT_LOBES; lobe++) {
    const base = positions.length / 3;
    for (let row = 0; row <= VFX_EVENT_ROWS; row++) {
      const u = row / VFX_EVENT_ROWS;
      for (let column = 0; column <= VFX_EVENT_COLUMNS; column++) {
        const v = column / VFX_EVENT_COLUMNS;
        positions.push(u, 0, v);
        uvs.push(u, v);
        sections.push(lobe, VFX_EVENT_LOBES > 1 ? lobe / (VFX_EVENT_LOBES - 1) : 0);
      }
    }
    for (let row = 0; row < VFX_EVENT_ROWS; row++) {
      for (let column = 0; column < VFX_EVENT_COLUMNS; column++) {
        const a = base + row * (VFX_EVENT_COLUMNS + 1) + column;
        const b = a + VFX_EVENT_COLUMNS + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = instanced ? new THREE.InstancedBufferGeometry() : new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aEventSection', new THREE.Float32BufferAttribute(sections, 2));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
  if (instanced) geometry.instanceCount = 0;
  geometry.name = 'SF_VFX_closed-event-volumes';
  geometry.userData.spacefaceTransientTechnique = 'closed-folded-event-volumes';
  geometry.userData.triangleBudget = VFX_EVENT_TRIANGLES;
  return geometry;
}
