// Gameplay-camera markers for reactive cargo. Silhouettes lie on the XZ plane.
// Drawn radius is at least the family's legibility floor, so debris is not a speck
// at chase zoom 144.

import * as THREE from 'three';
import { MARKER_MIN_LEGIBLE_RADIUS, REACTIVE_MARKERS, REACTIVE_SILHOUETTES } from '../../data/reactiveMatter/markers.js';
import { modelById } from '../../data/reactiveMatter/models.js';

const markerList = Object.values(REACTIVE_MARKERS);

function markerForStamp(stamp) {
  if (!stamp) return REACTIVE_MARKERS.debris;
  if (stamp.marker && REACTIVE_MARKERS[stamp.marker]) return REACTIVE_MARKERS[stamp.marker];
  const model = modelById(stamp.modelId);
  if (model && REACTIVE_MARKERS[model.marker]) return REACTIVE_MARKERS[model.marker];
  return markerList.find((row) => row.id === (stamp.marker || model?.marker)) || REACTIVE_MARKERS.debris;
}

function silhouetteFor(marker) {
  return REACTIVE_SILHOUETTES[marker.id] || REACTIVE_SILHOUETTES.debris;
}

function buildMesh(marker) {
  const points = silhouetteFor(marker);
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: marker.tint,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `reactive-marker-${marker.id}`;
  mesh.userData.signature = marker.signature;
  mesh.userData.family = marker.family;
  mesh.userData.tint = marker.tint;
  return mesh;
}

export function createReactiveMarkerPass() {
  const group = new THREE.Group();
  group.name = 'reactive-matter-markers';
  const meshes = new Map();
  return {
    group,
    update(state) {
      const seen = new Set();
      const list = state?.entityList || [];
      for (let i = 0; i < list.length; i++) {
        const entity = list[i];
        const stamp = entity?.data?.reactiveMatter;
        const machine = entity?.data?.reactiveMachine;
        if (!stamp && !machine) continue;
        if (stamp?.phase === 'fractured') continue;
        const marker = machine ? REACTIVE_MARKERS.machine : markerForStamp(stamp);
        const floor = Math.max(MARKER_MIN_LEGIBLE_RADIUS, marker.minWorldRadius);
        const radius = Math.max(floor, entity.radius || 0);
        let mesh = meshes.get(entity.id);
        if (!mesh || mesh.userData.signature !== marker.signature) {
          if (mesh) group.remove(mesh);
          mesh = buildMesh(marker);
          meshes.set(entity.id, mesh);
          group.add(mesh);
        }
        mesh.position.set(entity.pos.x, 0, entity.pos.z);
        mesh.scale.set(radius, 1, radius);
        mesh.userData.worldRadius = radius;
        seen.add(entity.id);
      }
      for (const [id, mesh] of meshes) {
        if (seen.has(id)) continue;
        group.remove(mesh);
        meshes.delete(id);
      }
      return group;
    },
    dispose() {
      for (const mesh of meshes.values()) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      meshes.clear();
    },
  };
}

/** Screen-space radius under the shipping chase pose (tilt 60°, fov 50, zoom 144). */
export function markerPixels(worldRadius, { width = 1600, height = 900, zoom = 144 } = {}) {
  const tilt = 60 * Math.PI / 180;
  const camera = new THREE.PerspectiveCamera(50, width / height, 1, 14000);
  camera.position.set(0, zoom * Math.sin(tilt), -zoom * Math.cos(tilt));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const edgeX = new THREE.Vector3(worldRadius, 0, 0);
  const edgeZ = new THREE.Vector3(0, 0, worldRadius);
  const center = new THREE.Vector3(0, 0, 0);
  center.project(camera);
  edgeX.project(camera);
  edgeZ.project(camera);
  const px = Math.abs(edgeX.x - center.x) * 0.5 * width;
  const pz = Math.abs(edgeZ.y - center.y) * 0.5 * height;
  return Math.max(px, pz);
}

export { MARKER_MIN_LEGIBLE_RADIUS };
