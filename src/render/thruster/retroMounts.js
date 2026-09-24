// Ship-local manufactured bow retros. These are physical hull children, not an effect proxy: the
// sockets at the recessed mouths inherit the exact presented translation and yaw of their hull.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addSocket } from '../ships/shipKit.js';
import { getEngineProfileBase, resolveEngineProfileId } from '../vfxProfiles.js';
import { retroProfileFor } from './retroProfiles.js';

// The throat iris. Cold, the mouth is a dark machined aperture; the retro spool runs it up to a
// lit point while the brake is held. Driven from vfx via socket.userData.retroIris.
export const RETRO_IRIS_IDLE = 0.1;
export const RETRO_IRIS_LIT = 2.4;

function merged(parts) {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return geometry;
}

function placed(geometry, x, y, z, rotateZ = 0, rotateY = 0, scale = null) {
  geometry.rotateZ(rotateZ);
  if (scale) geometry.scale(scale[0], scale[1], scale[2]);
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
  // Neutral machinery greys, not faction palette: authored hulls carry baked paint while the
  // palette can run saturated (teal faction hulls paint every procedural part cyan). The blister
  // stays a light plated grey so it reads as shaped hull plating; bell and lip are darker
  // machined metal. Keep metalness low — glossy skins mirror the teal environment and glow.
  const metal = new THREE.MeshStandardMaterial({
    color: '#7d858c', metalness: 0.18, roughness: 0.62,
  });
  const nozzleMetal = new THREE.MeshStandardMaterial({
    color: '#31383e', metalness: 0.15, roughness: 0.55,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: '#4a545c', metalness: 0.35, roughness: 0.4,
  });
  const throat = new THREE.MeshStandardMaterial({
    color: '#0a1016', emissive: engine.plumeCore || '#36c8ff', emissiveIntensity: 0.04,
    metalness: 0.55, roughness: 0.52, side: THREE.DoubleSide,
  });
  const iris = new THREE.MeshStandardMaterial({
    color: '#04070b', emissive: engine.plumeCore || '#36c8ff', emissiveIntensity: RETRO_IRIS_IDLE,
    metalness: 0.2, roughness: 0.6, side: THREE.DoubleSide,
  });
  const shellParts = [];
  const nozzleParts = [];
  const trimParts = [];
  const throatParts = [];
  const irisParts = [];
  const mountY = 0.055;
  const splay = 0.349; // match the reaction-jet resolver: exhaust clears the two bow flanks
  const axisX = Math.cos(splay);
  for (const side of [-1, 1]) {
    const axisZ = side * Math.sin(splay);
    const z = side * profile.halfSpan;
    const r = profile.bell;
    const x = profile.station;
    const mouthX = x + 0.05 * axisX;
    const mouthZ = z + 0.05 * axisZ;
    // A low faceted blister grows out of the flank, wide at its shoulder and tapering aft to a
    // fine tail that stays buried in the hull — a ridge, not a bolted-on pod. It is anchored to
    // the mouth, not the station, so its forward face always closes just behind the nozzle at
    // the bow shoulder instead of hanging past the hull's taper. The canted nozzle tip alone
    // carries the splay so the housing stays aligned with the hull lines.
    shellParts.push(placed(
      new THREE.CylinderGeometry(r * 1.45, r * 0.30, 0.38, 6, 1),
      mouthX - 0.21, mountY - 0.012, z - side * r * 0.9, -Math.PI / 2, 0, [1, 0.44, 1.22]));
    // A short bell tip, barely proud of the blister's forward shoulder.
    nozzleParts.push(placed(
      new THREE.CylinderGeometry(r * 1.06, r * 0.94, 0.085, profile.segments, 1, true),
      mouthX - axisX * 0.035, mountY, mouthZ - axisZ * 0.035, -Math.PI / 2, -side * splay));
    trimParts.push(placed(
      new THREE.TorusGeometry(r * 1.04, r * 0.07, 5, profile.segments),
      mouthX + axisX * 0.006, mountY, mouthZ + axisZ * 0.006, 0, Math.PI / 2 - side * splay));
    // Inside is a dark funnel that narrows to the iris — a designed aperture, not a glowing disc.
    throatParts.push(placed(
      new THREE.CylinderGeometry(r * 0.98, r * 0.30, r * 0.9, profile.segments, 1, true),
      mouthX - axisX * r * 0.40, mountY, mouthZ - axisZ * r * 0.40, -Math.PI / 2, -side * splay));
    irisParts.push(placed(
      new THREE.CircleGeometry(r * 0.30, profile.segments),
      mouthX - axisX * r * 0.84, mountY, mouthZ - axisZ * r * 0.84, 0, Math.PI / 2 - side * splay));
    const name = side < 0 ? 'SOCKET_Retro_Port' : 'SOCKET_Retro_Starboard';
    const socket = addSocket(hull, name,
      [mouthX + axisX * 0.012, mountY, mouthZ + axisZ * 0.012], 'retro', [axisX, 0, axisZ]);
    socket.userData.engineProfileId = engineProfileId;
    socket.userData.retroIris = { material: iris, idle: RETRO_IRIS_IDLE, lit: RETRO_IRIS_LIT };
  }
  const assembly = new THREE.Group();
  assembly.name = `Retro_Bow_Assembly_${engineProfileId}`;
  assembly.userData.spacefaceRetroHardware = true;
  for (const [parts, material, name] of [
    [shellParts, metal, 'Retro_Fairings'],
    [nozzleParts, nozzleMetal, 'Retro_Nozzle_Tips'],
    [trimParts, trim, 'Retro_Machined_Lips'],
    [throatParts, throat, 'Retro_Throat_Funnels'],
    [irisParts, iris, 'Retro_Throat_Irises'],
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
