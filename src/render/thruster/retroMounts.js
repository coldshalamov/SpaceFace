// Ship-local manufactured bow retros. These are physical hull children, not an effect proxy: the
// sockets at the recessed mouths inherit the exact presented translation and yaw of their hull.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addSocket } from '../ships/shipKit.js';
import { getEngineProfileBase, resolveEngineProfileId } from '../vfxProfiles.js';
import { retroProfileFor } from './retroProfiles.js';

function merged(parts) {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return geometry;
}

function placed(geometry, x, y, z, rotateZ = 0, rotateY = 0) {
  geometry.rotateZ(rotateZ);
  geometry.rotateY(rotateY);
  geometry.translate(x, y, z);
  return geometry;
}

/** Add one paired retro assembly to an already normalized flyable hull. Idempotent on rebuild. */
export function attachRetroMounts(hull, entity, palette = {}, engineUrl = null) {
  if (!hull || hull.getObjectByName('SOCKET_Retro_Port')) return null;
  const defId = entity?.data?.defId || null;
  const engineProfileId = resolveEngineProfileId({
    defId,
    driveId: entity?.data?.driveId,
    slots: engineUrl ? { engine: [engineUrl] } : null,
  }, defId);
  const profile = retroProfileFor(engineProfileId);
  const engine = getEngineProfileBase(engineProfileId);
  const metal = new THREE.MeshStandardMaterial({
    color: palette.dark || '#26313b', metalness: 0.78, roughness: 0.37,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: palette.accent || '#718c9a', metalness: 0.72, roughness: 0.34,
  });
  const throat = new THREE.MeshStandardMaterial({
    color: '#101820', emissive: engine.plumeCore || '#36c8ff', emissiveIntensity: 0.16,
    metalness: 0.6, roughness: 0.42, side: THREE.DoubleSide,
  });
  const shellParts = [];
  const trimParts = [];
  const throatParts = [];
  const mountY = 0.06;
  const splay = 0.349; // match the reaction-jet resolver: exhaust clears the two bow flanks
  for (const side of [-1, 1]) {
    const z = side * profile.halfSpan;
    const r = profile.bell;
    const x = profile.station;
    const mouthX = x + 0.035 + 0.135 * Math.cos(splay);
    const mouthZ = z + side * 0.135 * Math.sin(splay);
    // A short load-bearing cheek grows out of the hull and carries a recessed, open shroud.
    shellParts.push(placed(new THREE.BoxGeometry(0.37, r * 0.86, r * 1.28), x - 0.20, mountY - 0.015, z - side * r * 0.24));
    shellParts.push(placed(new THREE.CylinderGeometry(r * 0.96, r * 1.18, 0.27, profile.segments, 1, true), x + 0.035, mountY, z, -Math.PI / 2, -side * splay));
    trimParts.push(placed(new THREE.TorusGeometry(r * 0.98, r * 0.15, 5, profile.segments), mouthX + 0.006, mountY, mouthZ, 0, Math.PI / 2 - side * splay));
    throatParts.push(placed(new THREE.CircleGeometry(r * 0.75, profile.segments), mouthX - 0.012, mountY, mouthZ, 0, Math.PI / 2 - side * splay));
    const name = side < 0 ? 'SOCKET_Retro_Port' : 'SOCKET_Retro_Starboard';
    const socket = addSocket(hull, name, [mouthX + 0.006, mountY, mouthZ], 'retro', [Math.cos(splay), 0, side * Math.sin(splay)]);
    socket.userData.engineProfileId = engineProfileId;
  }
  const assembly = new THREE.Group();
  assembly.name = `Retro_Bow_Assembly_${engineProfileId}`;
  assembly.userData.spacefaceRetroHardware = true;
  for (const [parts, material, name] of [
    [shellParts, metal, 'Retro_Load_Brackets_And_Shrouds'],
    [trimParts, trim, 'Retro_Machined_Lips'],
    [throatParts, throat, 'Retro_Recessed_Throats'],
  ]) {
    const mesh = new THREE.Mesh(merged(parts), material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    assembly.add(mesh);
  }
  hull.add(assembly);
  return assembly;
}
