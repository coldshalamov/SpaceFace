// Ship-local manufactured bow retros. These are physical hull children, not an effect proxy: the
// sockets at the recessed mouths inherit the exact presented translation and yaw of their hull.
//
// Proportion guide: a brake/vernier jet is regulatory hardware — small chamber, small throat, so
// the nozzle is a short bell barely proud of the skin, mounted in a flush aperture plate on a low
// fairing blister. Real reaction-control packs (Draco, Apollo SM quads) read as a machined port
// with a stubby diverging nozzle inside, never as a tube running along the hull.
//
// Placement guide: the pack must sit ON the skin. Hull flanks taper inward toward the nose and
// differ per ship, so the station's lateral position is measured from the authored hull geometry
// at build time — a fixed halfSpan floats off a tapered bow or drowns inside a wide flank.
//
// Part contract: each side's pack is a self-contained thruster — one `Retro_Thruster_*` pivot
// owns ALL of its hardware plus its emitter socket. shipMicroMotion gimbals the pivot with
// steering demand, and because the socket is a child of the pivot the exhaust keeps firing out
// of the moving nozzle — VFX never chases a static anchor while the part swings. Authored parts
// that want the same coupling put their SOCKET_* emitter inside the articulating node the same
// way.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addSocket } from '../ships/shipKit.js';
import { getEngineProfileBase, resolveEngineProfileId } from '../vfxProfiles.js';
import { retroProfileFor } from './retroProfiles.js';
import { buildSkinSeatIndex, flankSeat } from './retroSkinSeat.js';

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

// A mesh's transform chain composed down to (excluding) the hull container — hull-local space,
// the same normalized frame the profile dimensions are authored in.
function matrixInHull(mesh, hull, out) {
  out.identity();
  let o = mesh;
  while (o && o !== hull) {
    o.updateMatrix();
    out.premultiply(o.matrix);
    o = o.parent;
  }
  return out;
}

// Triangle soup of the visible hull skin in hull-local normalized units, built once per attach.
// The authored record's primitives are the truth: the live tree mostly carries instance proxies
// whose geometry lives in static batches, so the tree scan below is only a fallback (lab pages,
// dedicated parts). getX/Y/Z dequantizes KHR_mesh_quantization positions, and primitive.matrix is
// GLB-scene-space — the partRoot scale (targetLength 1.72) normalizes it into hull-local units.
const SKIN_RAYCAST_MATERIAL = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

function collectHullSkinMesh(hull, hullRecord) {
  const soup = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const bake = (geometry, matrix, scale) => {
    const pos = geometry && geometry.attributes && geometry.attributes.position;
    if (!pos) return;
    const index = geometry.index;
    const count = index ? index.count : pos.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const a = index ? index.getX(i) : i;
      const b = index ? index.getX(i + 1) : i + 1;
      const c = index ? index.getX(i + 2) : i + 2;
      if (a >= pos.count || b >= pos.count || c >= pos.count) continue;
      for (const vi of [a, b, c]) {
        v.set(pos.getX(vi), pos.getY(vi), pos.getZ(vi)).applyMatrix4(matrix);
        soup.push(v.x * scale, v.y * scale, v.z * scale);
      }
    }
  };
  if (hullRecord && Array.isArray(hullRecord.primitives)) {
    const sourceLength = Math.max(Number(hullRecord.bounds?.size?.[0]) || 1, 1e-6);
    const scale = 1.72 / sourceLength;
    for (const p of hullRecord.primitives) {
      const lod = p.tags && p.tags.lod;
      if (lod && lod !== 'lod0') continue;
      if (!p.geometry || !p.matrix) continue;
      if (p.matrix.elements) m.copy(p.matrix);
      else if (Array.isArray(p.matrix)) m.fromArray(p.matrix);
      else continue;
      bake(p.geometry, m, scale);
    }
  }
  if (!soup.length) {
    const local = new THREE.Matrix4();
    hull.traverse((o) => {
      if (!o.isMesh || o.visible === false) return;
      if (o.name && /LOD[12]/i.test(o.name)) return;
      if (o.userData && (o.userData.spacefaceSocket || o.userData.spacefaceRetroHardware)) return;
      matrixInHull(o, hull, local);
      bake(o.geometry, local, 1);
    });
  }
  if (!soup.length) return null;
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.Float32BufferAttribute(soup, 3);
  geometry.setAttribute('position', attribute);
  const mesh = new THREE.Mesh(geometry, SKIN_RAYCAST_MATERIAL);
  mesh.userData.skinSeatIndex = buildSkinSeatIndex(attribute.array);
  return mesh;
}

// The skin's lateral position on one side at a given (x, y): a ray cast inward from far outboard
// hits the outermost surface along that line — the exact face under the mount, which vertex
// sampling cannot give on hulls whose flanks are a few long wedge faces. flankSeat answers that
// analytically over the soup index (see retroSkinSeat.js) instead of 7 full-soup raycasts.
const RAY_FAR_Z = 4; // beyond any normalized hull half-width; ray ends at the centerline plane

// The surface a lateral-firing jet belongs on: the outermost skin point inside a tight vertical
// window around the ideal mount height. One bare line misses thin wedge rims and flank chines —
// the widest surface found is also where a side-firing plume clears the hull, so it is the
// physically correct seat for the port.
function flankSurfaceAt(skinMesh, x, y, side) {
  const index = skinMesh && skinMesh.userData && skinMesh.userData.skinSeatIndex;
  return index ? flankSeat(index, x, y, side, RAY_FAR_Z) : null;
}

// One soup per authored hull record: identical for every ship built from it, so spawn-time
// attaches share the bake instead of re-walking primitive triangles.
const skinMeshCache = new WeakMap();

// The finished pack geometry too: seats are raycast against the same skin soup and the profile
// dimensions are fixed per engine profile, so a (hull record, engine profile, side) pack is one
// deterministic bake. Sharing it means the launch-warm exemplar's stamp uploads the buffers once
// and every in-round spawn draws resident geometry instead of paying mergeGeometries plus a
// first-draw bufferData per pack mesh. Disposal-proof like the other shared bakes — a retiring
// hull must not steal the buffers the next spawn still draws.
const retroPackCache = new WeakMap(); // hullRecord -> Map<key, {geometries, pivot, socket}>

function shareRetroPackGeometry(geometry) {
  geometry.userData = { ...(geometry.userData || {}), spacefaceSharedAsset: true };
  geometry.dispose = () => {};
  return geometry;
}

/** Add one paired retro assembly to an already normalized flyable hull. Idempotent on rebuild. */
export function attachRetroMounts(hull, entity, palette = {}, engineUrl = null, hullRecord = null) {
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
  // palette can run saturated (teal faction hulls paint every procedural part cyan). The fairing
  // stays a plated grey close to hull plating; nozzle and gland are darker machined metal. Keep
  // metalness low — glossy skins mirror the teal environment and glow.
  const metal = new THREE.MeshStandardMaterial({
    color: '#6e767c', metalness: 0.22, roughness: 0.6,
  });
  const nozzleMetal = new THREE.MeshStandardMaterial({
    color: '#2c3338', metalness: 0.3, roughness: 0.5,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: '#4a545c', metalness: 0.5, roughness: 0.34,
  });
  const throat = new THREE.MeshStandardMaterial({
    color: '#0a1016', emissive: engine.plumeCore || '#36c8ff', emissiveIntensity: 0.04,
    metalness: 0.55, roughness: 0.52, side: THREE.DoubleSide,
  });
  const iris = new THREE.MeshStandardMaterial({
    color: '#04070b', emissive: engine.plumeCore || '#36c8ff', emissiveIntensity: RETRO_IRIS_IDLE,
    metalness: 0.2, roughness: 0.6, side: THREE.DoubleSide,
  });
  // Material buckets per side. Bucket mesh names deliberately avoid the micro-motion bell scan's
  // words (nozzle|bell|drive|engine|plume|thruster|exhaust|rcs): the pivot is the articulated
  // node, and a mesh that also matched would rotate a second time about the pivot origin.
  const MESH_PARTS = [
    ['Shell', metal],   // fairing + aperture plate
    ['Body', nozzleMetal], // gland + diverging bell
    ['Trim', trim],     // lip + collar rings
    ['Throat', throat], // recessed funnel
    ['Iris', iris],     // aperture cap
  ];
  const assembly = new THREE.Group();
  // Name stays free of the micro-motion bell words even though the id contains 'engine' —
  // only the two pack pivots articulate; a bell entry on the wrapper would double the swing.
  assembly.name = 'Retro_Bow_Assembly';
  assembly.userData.spacefaceRetroHardware = true;
  assembly.userData.engineProfileId = engineProfileId;
  const mountY = 0.055;
  const splay = 0.349; // match the reaction-jet resolver: exhaust clears the two bow flanks
  const axisX = Math.cos(splay);
  let skin = null;
  let skinOwned = false;
  // The pack bake is only shareable when its seats are measured from the record's soup — the
  // tree-scan fallback skin is per-hull, so that path must keep baking per attach.
  const packCacheable = !!(hullRecord && Array.isArray(hullRecord.primitives) && hullRecord.primitives.length);
  if (packCacheable) {
    if (skinMeshCache.has(hullRecord)) {
      skin = skinMeshCache.get(hullRecord);
    } else {
      skin = collectHullSkinMesh(hull, hullRecord);
      skinMeshCache.set(hullRecord, skin);
    }
  } else {
    skin = collectHullSkinMesh(hull, null);
    skinOwned = true;
  }
  for (const side of [-1, 1]) {
    const axisZ = side * Math.sin(splay);
    const r = profile.bell;
    const x = profile.station;
    const mouthX = x + 0.05 * axisX;
    const sideName = side < 0 ? 'Port' : 'Starboard';
    const packKey = `${engineProfileId}|${side < 0 ? 'P' : 'S'}`;
    let packs = packCacheable ? retroPackCache.get(hullRecord) : null;
    let baked = packs ? packs.get(packKey) : null;
    // The gimbal pivot stands on the jet axis at the fairing's root — steering the pack swings
    // the mouth around the mount point like a vectored nozzle, and the socket (a pivot child)
    // carries the plume with it.
    const pivot = new THREE.Group();
    pivot.name = `Retro_Thruster_${sideName}`;
    // Declare the articulating pivot on the hull — shipMicroMotion gimbals declared nodes before
    // its name scan, so a socket-owning pack always gets its slot. This is the part-owned
    // emitter contract: the part owns the swing, the swing owns the socket, the socket owns the
    // exhaust.
    (hull.userData.spacefaceArticulatingNodes
      || (hull.userData.spacefaceArticulatingNodes = []))
      .push({ node: pivot, demandScale: 0.55 });
    if (!baked) {
      // Seat the pack on the measured skin: raycast the flank at the mouth and at the fairing's
      // midpoint, take the tighter one — the pack embeds aft into the wider skin and its lip plane
      // sits a hair inside the skin surface, like a flush port cut into a sloped flank. The
      // halfSpan cap keeps the pack off appendage tips (fins, antennae) outboard of the body.
      // Unmeasured hulls keep the authored halfSpan and height.
      const seatMouth = skin ? flankSurfaceAt(skin, mouthX, mountY, side) : null;
      const seatMid = skin ? flankSurfaceAt(skin, x - r * 2.5, mountY, side) : null;
      const seat = seatMouth && seatMid
        ? (Math.abs(seatMouth.z) < Math.abs(seatMid.z) ? seatMouth : seatMid)
        : (seatMouth || seatMid);
      const packY = seat ? seat.y : mountY;
      const span = seat
        ? Math.max(0.08, Math.min(profile.halfSpan + 0.10, Math.abs(seat.z) - 0.01))
        : profile.halfSpan;
      const z = side * span;
      const mouthZ = z + 0.05 * axisZ;
      const px = mouthX - axisX * r * 2.9;
      const py = packY;
      const pz = mouthZ - axisZ * r * 2.9;
      // Positions along the jet axis, measured aft of the lip plane at the mouth.
      const aftX = (t) => mouthX - axisX * t;
      const aftZ = (t) => mouthZ - axisZ * t;
      const parts = [[], [], [], [], []];
      const bucket = { Shell: 0, Body: 1, Trim: 2, Throat: 3, Iris: 4 };

      // A low wedge fairing grows out of the flank — a shallow tapering blister the size of the
      // port it carries, its aft end buried in the hull. It stays hull-aligned; only the nozzle
      // hardware carries the splay. Roughly 3 bell radii long, i.e. a fitting, not a spine.
      parts[bucket.Shell].push(placed(
        new THREE.CylinderGeometry(r * 1.05, r * 1.8, r * 3.3, 7, 1),
        mouthX - axisX * r * 3.4, packY - r * 0.34, z - side * r * 0.35, -Math.PI / 2, 0, [1, 0.42, 1.1]));
      // The aperture plate the jet fires through: a thin chamfered ring flush on the fairing's
      // forward face, normal to the jet axis — the port surround, not a shroud.
      parts[bucket.Shell].push(placed(
        new THREE.CylinderGeometry(r * 1.55, r * 1.95, r * 0.22, 8, 1),
        aftX(r * 2.55), packY, aftZ(r * 2.55), -Math.PI / 2, -side * splay));
      // The gland: a short collar the bell bolts to — the visible valve body between plate and bell.
      parts[bucket.Body].push(placed(
        new THREE.CylinderGeometry(r * 0.70, r * 0.82, r * 1.0, profile.segments, 1),
        aftX(r * 2.05), packY, aftZ(r * 2.05), -Math.PI / 2, -side * splay));
      // The nozzle itself: a real diverging bell — narrow at the chamber joint, flaring to the lip.
      // Total protrusion past the plate is about one bell diameter, like a Draco at the skin.
      parts[bucket.Body].push(placed(
        new THREE.CylinderGeometry(r * 1.0, r * 0.56, r * 1.7, profile.segments, 1, true),
        aftX(r * 0.85), packY, aftZ(r * 0.85), -Math.PI / 2, -side * splay));
      // Machined edges: the exit lip ring and the collar where the bell meets the gland.
      parts[bucket.Trim].push(placed(
        new THREE.TorusGeometry(r * 1.0, r * 0.08, 5, profile.segments),
        mouthX + axisX * 0.004, packY, mouthZ + axisZ * 0.004, 0, Math.PI / 2 - side * splay));
      parts[bucket.Trim].push(placed(
        new THREE.TorusGeometry(r * 0.60, r * 0.07, 5, profile.segments),
        aftX(r * 1.66), packY, aftZ(r * 1.66), 0, Math.PI / 2 - side * splay));
      // Inside is a dark funnel that narrows to the iris — a designed aperture, not a glowing disc.
      parts[bucket.Throat].push(placed(
        new THREE.CylinderGeometry(r * 0.96, r * 0.26, r * 1.7, profile.segments, 1, true),
        aftX(r * 0.86), packY, aftZ(r * 0.86), -Math.PI / 2, -side * splay));
      parts[bucket.Iris].push(placed(
        new THREE.CircleGeometry(r * 0.26, profile.segments),
        aftX(r * 1.7), packY, aftZ(r * 1.7), 0, Math.PI / 2 - side * splay));

      // Pivot-local bake: the translate makes the geometry owned by the pivot origin.
      const geometries = parts.map((part) => {
        const geometry = merged(part);
        geometry.translate(-px, -py, -pz);
        return geometry;
      });
      baked = {
        geometries,
        pivot: [px, py, pz],
        socket: [mouthX + axisX * 0.01 - px, 0, mouthZ + axisZ * 0.01 - pz],
      };
      if (packCacheable) {
        baked.geometries = baked.geometries.map(shareRetroPackGeometry);
        if (!packs) {
          packs = new Map();
          retroPackCache.set(hullRecord, packs);
        }
        packs.set(packKey, baked);
      }
    }
    pivot.position.set(baked.pivot[0], baked.pivot[1], baked.pivot[2]);
    for (let i = 0; i < MESH_PARTS.length; i++) {
      const mesh = new THREE.Mesh(baked.geometries[i], MESH_PARTS[i][1]);
      mesh.name = `Retro_${MESH_PARTS[i][0]}_${sideName}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pivot.add(mesh);
    }
    const socket = addSocket(pivot, `SOCKET_Retro_${sideName}`,
      baked.socket, 'retro', [axisX, 0, axisZ]);
    socket.userData.engineProfileId = engineProfileId;
    // Driven hardware channels: the vfx owner raises the throat's heat emissive with spool and
    // the iris with live demand, and cools both on reset — the part carries its own heat sink.
    socket.userData.retroIris = {
      material: iris, idle: RETRO_IRIS_IDLE, lit: RETRO_IRIS_LIT,
      heatMaterial: throat, heatIdle: 0.04, heatLit: 0.6,
    };
    assembly.add(pivot);
  }
  if (skinOwned && skin) skin.geometry.dispose();
  hull.add(assembly);
  return assembly;
}
