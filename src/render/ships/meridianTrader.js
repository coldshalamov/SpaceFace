// SF-MTS Meridian Corporate Hauler — bespoke faction ship (spec §8.3, Phase 3 §20).
//
// §8.3 reading: "brand-controlled efficiency." Meridian is the corporate trade syndicate — ships read
// as branded, modular, efficient, throughput-driven. Not predatory (pirate) nor institutional-police
// (Concord): this is a COMPANY asset. Modular replaceable blocks, strict alignment, standardized
// containers/radiators, warm gold/cream accents in disciplined neutral fields, large legible corporate
// marks at infrastructure scale, low grime but visible throughput wear at cargo/docking interfaces.
//
// Host: the fleeing trader (mule_trader) — a corporate hauler the player encounters fleeing combat.
import * as THREE from 'three';
import { attachLodState } from '../lod.js';

const COLOR = Object.freeze({
  hull: '#d8c8a0',          // warm cream neutral field (corporate palette)
  hullDark: '#a89870',
  accent: '#F2B233',        // Meridian gold (faction_mts primary)
  container: '#c0a850',     // standardized cargo containers (modular blocks, §8.3)
  graphite: '#2a2418',
  brand: '#F2B233',         // large legible corporate mark
  drive: '#ffcc66',         // warm corporate drive
  driveCore: '#fff0c8',
  light: '#ffd070',         // throughput/service work lights
});

function stdMat(c, r, m) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: r, metalness: m }); }
function lightMat(c, i = 2.4) { return new THREE.MeshStandardMaterial({ color: new THREE.Color('#000'), emissive: new THREE.Color(c), emissiveIntensity: i }); }
function glowMat(c, o = 0.6) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(c), transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); }

export function buildMeridianTrader(entity) {
  const DESIGN_RADIUS = 20; // mule is a freighter — larger
  const radius = (entity && Number.isFinite(entity.radius)) ? entity.radius : DESIGN_RADIUS;
  const scale = radius / DESIGN_RADIUS;

  const mat = {
    hull: stdMat(COLOR.hull, 0.4, 0.3),
    hullDark: stdMat(COLOR.hullDark, 0.5, 0.35),
    container: stdMat(COLOR.container, 0.55, 0.2),
    accent: lightMat(COLOR.accent, 1.6),
    graphite: stdMat(COLOR.graphite, 0.6, 0.7),
    brand: lightMat(COLOR.brand, 1.8),
    drive: lightMat(COLOR.drive, 3.0),
    driveCore: lightMat(COLOR.driveCore, 4.0),
    driveGlow: glowMat(COLOR.drive, 0.58),
  };
  for (const [n, m] of Object.entries(mat)) m.name = `Meridian_${n}`;

  const hull = new THREE.Group(); hull.name = 'Meridian_Trader_Hull';
  const addBox = (m, name, [sx, sy, sz], [x, y, z]) => { const g = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); g.name = name; g.position.set(x, y, z); hull.add(g); return g; };
  const addCylX = (m, name, r, h, [x, y, z]) => { const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), m); g.name = name; g.position.set(x, y, z); g.rotation.z = Math.PI / 2; hull.add(g); return g; };

  // ---- strict-alignment fuselage: a clean rectangular corporate block (modular replaceable, §8.3) ----
  addBox(mat.hull, 'Meridian_Fuselage', [22.0, 4.0, 6.0], [0, 0, 0]);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.2, 4.8), mat.hull); nose.name = 'Meridian_Nose'; nose.position.set(13.0, 0, 0); hull.add(nose);
  addBox(mat.hullDark, 'Meridian_Tail_Block', [5.0, 3.6, 5.4], [-13.0, 0, 0]);

  // ---- standardized cargo containers (modular blocks, strict alignment, §8.3) ----
  // A grid of identical containers strapped to the dorsal hull — the "throughput" read.
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      addBox(mat.container, `Meridian_Container_${row}_${col}`, [4.5, 1.6, 1.6], [-6.0 + col * 5.0, 2.2 + row * 1.7, 0]);
    }
  }

  // ---- service grid radiator fins (standardized radiators, §8.3) — symmetric, aligned ----
  for (const side of [-1, 1]) {
    addBox(mat.hullDark, `Meridian_Radiator_${side < 0 ? 'Port' : 'Starboard'}`, [10.0, 0.3, 2.5], [-2.0, 0.5, side * 4.0]);
  }

  // ---- large legible corporate mark (brand-controlled, infrastructure scale, §8.3) ----
  // A big gold Meridian chevron on each flank — reads as a company asset, not personal property.
  for (const side of [-1, 1]) {
    const chevron = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.8, 0.2), mat.brand);
    chevron.name = `Meridian_BrandMark_${side < 0 ? 'Port' : 'Starboard'}`;
    chevron.position.set(2.0, 0.5, side * 3.05); hull.add(chevron);
  }

  // ---- throughput wear at the docking/cargo interface (visible use, low grime, §8.3) ----
  // A subtle darker scuff band at the cargo-door plane where containers load.
  addBox(mat.graphite, 'Meridian_Docking_Wear', [1.0, 3.6, 5.8], [-6.0, 0, 0]);

  // ---- drive: twin standardized corporate nozzles (efficient, not hot/unstable) ----
  for (const side of [-1, 1]) {
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20), mat.driveGlow);
    glow.name = `Meridian_Drive_Glow_${side}`; glow.position.set(-15.7, 0, side * 2.0); glow.rotation.y = -Math.PI / 2; hull.add(glow);
    addCylX(mat.driveCore, `Meridian_Drive_Core_${side}`, 0.8, 0.4, [-15.5, 0, side * 2.0]);
  }

  // ---- warm throughput work lights (service grid lighting, §8.3) ----
  for (const x of [8.0, 0.0, -8.0]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 4.5), mat.accent);
    l.name = `Meridian_WorkLight_${x}`; l.position.set(x, 2.0, 0); hull.add(l);
  }

  // ---- sockets ----
  const addSocket = (name, pos, role) => { const s = new THREE.Object3D(); s.name = name; s.position.set(pos[0], pos[1], pos[2]); s.userData.spacefaceSocket = true; s.userData.role = role; hull.add(s); };
  addSocket('SOCKET_Engine_Main', [-15.7, 0, 0], 'engine', [-1, 0, 0]);
  addSocket('SOCKET_Trail_Main', [-16.0, 0, 0], 'vfx', [-1, 0, 0]);
  addSocket('SOCKET_Cargo_Ventral', [-6.0, -2.0, 0], 'cargo', [0, -1, 0]);
  addSocket('SOCKET_Camera_Focus', [0, 0.5, 0], 'camera');
  // defensive flak turret socket (mule_trader has a defensive flak turret)
  addSocket('SOCKET_Weapon_Front', [13.0, 1.5, 0], 'weapon');

  const outer = new THREE.Group(); outer.name = 'Meridian_Trader';
  outer.add(hull); outer.userData.hull = hull; outer.scale.setScalar(scale);
  outer.userData.assetId = 'SF_MTS_MERIDIAN_HAULER';
  outer.userData.renderContract = { coordinateSystem: '+X forward, +Y up, +Z starboard', authoredMetres: true, nominalDimensions: [38, 6, 14], sockets: 5, drawCallTarget: '<= 18 before post-processing', factionGrammar: '§8.3 corporate — modular, branded, efficient, throughput', version: 1 };
  attachLodState(outer);
  return outer;
}
