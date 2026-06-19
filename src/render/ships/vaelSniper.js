// SF-VAEL The Vael — bespoke faction ship (spec §8.7, Phase 3 §20).
//
// §8.7 reading: "purpose without human hospitality." The Vael are non-human — their ships should
// violate ONE foundational human assumption so the unfamiliarity reads as alien, not random. Chosen
// violation: STRUCTURE AND SIGNAL SHARE A SURFACE + repetition at a non-human scale + cavities over
// shells + ambiguous front (until motion). No cockpit, no human-scale details (hatches/handles/lights),
// no bilateral symmetry, no painted identity. The hull is a faceted crystalline lattice with
// continuous material transitions and deep cavities — it reads as grown/constructed by a different
// intelligence.
//
// Host: the lancer_sniper (Vael is the xenophobic faction; a sniper fits their austere long-range doctrine).
import * as THREE from 'three';
import { attachLodState } from '../lod.js';

const COLOR = Object.freeze({
  lattice: '#1a4a3a',        // dark teal-green crystalline structure (non-human palette)
  latticeLight: '#2a6a52',
  cavity: '#08120e',         // deep cavities (more important than shells, §8.7)
  signalSurface: '#2FCFA0',  // structure-and-signal share a surface: the lattice itself glows (no fixtures)
  facet: '#143a30',
  drive: '#2FCFA0',          // the Vael teal — drive is a resonant glow, not a nozzle
});

function stdMat(c, r, m) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: r, metalness: m }); }
function lightMat(c, i = 1.8) { return new THREE.MeshStandardMaterial({ color: new THREE.Color('#000'), emissive: new THREE.Color(c), emissiveIntensity: i }); }
function glowMat(c, o = 0.5) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(c), transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); }

export function buildVaelSniper(entity) {
  const DESIGN_RADIUS = 17;
  const radius = (entity && Number.isFinite(entity.radius)) ? entity.radius : DESIGN_RADIUS;
  const scale = radius / DESIGN_RADIUS;

  const mat = {
    lattice: stdMat(COLOR.lattice, 0.3, 0.55),       // smooth, semi-metal — crystalline, not painted
    latticeLight: stdMat(COLOR.latticeLight, 0.25, 0.6),
    cavity: stdMat(COLOR.cavity, 1.0, 0.0),          // matte black voids (cavities, §8.7)
    signalSurface: lightMat(COLOR.signalSurface, 1.4), // structure IS the signal (no fixtures, §8.7)
    facet: stdMat(COLOR.facet, 0.35, 0.5),
    drive: lightMat(COLOR.drive, 2.2),
    driveGlow: glowMat(COLOR.drive, 0.5),
  };
  for (const [n, m] of Object.entries(mat)) m.name = `Vael_${n}`;

  const hull = new THREE.Group(); hull.name = 'Vael_Sniper_Hull';
  const addBox = (m, name, [sx, sy, sz], [x, y, z], rot) => { const g = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); g.name = name; g.position.set(x, y, z); if (rot) g.rotation.set(rot[0], rot[1], rot[2]); hull.add(g); return g; };

  // ---- ambiguous-front crystalline spine: a long faceted prism with NO clear "nose" (§8.7) ----
  // The Vael hull is a hexagonal-ish lattice prism — front/back read as similar until it moves.
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 22.0, 6), mat.lattice);
  spine.name = 'Vael_Spine'; spine.rotation.z = Math.PI / 2; hull.add(spine);
  // tapered ends on BOTH sides (ambiguous front, §8.7)
  const endA = new THREE.Mesh(new THREE.ConeGeometry(2.0, 5.0, 6), mat.lattice); endA.name = 'Vael_End_A'; endA.position.set(13.5, 0, 0); endA.rotation.z = -Math.PI / 2; hull.add(endA);
  const endB = new THREE.Mesh(new THREE.ConeGeometry(2.0, 5.0, 6), mat.lattice); endB.name = 'Vael_End_B'; endB.position.set(-13.5, 0, 0); endB.rotation.z = Math.PI / 2; hull.add(endB);

  // ---- repetition at a non-human scale (§8.7): a ring of identical resonant facets ----
  // The signal-surface facets repeat around the spine at an even cadence — reads as a non-human grammar.
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const f = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.4), mat.signalSurface);
    f.name = `Vael_Resonance_Facet_${i}`; f.position.set(Math.cos(a) * 0 + (i - N / 2) * 2.6, Math.sin(a) * 2.3, Math.cos(a) * 2.3);
    f.rotation.y = a; hull.add(f);
  }

  // ---- deep cavities (more important than shells, §8.7): hexagonal voids sunk into the hull ----
  // Where a human ship has surface detail, the Vael have holes — cavities that imply an interior logic.
  for (const x of [6.0, -2.0, -8.0]) {
    addBox(mat.cavity, `Vael_Cavity_${x}`, [2.0, 1.4, 1.4], [x, 1.6, 0]);
  }

  // ---- structure-and-signal share a surface (§8.7): facet edges glow along the lattice ----
  // Thin emissive veins run along the spine — there are no "lights," the structure emits.
  for (const side of [-1, 1]) {
    const vein = new THREE.Mesh(new THREE.BoxGeometry(18.0, 0.08, 0.08), mat.signalSurface);
    vein.name = `Vael_Signal_Vein_${side}`; vein.position.set(0, side * 1.8, 0); hull.add(vein);
  }

  // ---- resonant drive: a glow that suffuses the aft facet, not a nozzle (non-human propulsion) ----
  const driveGlow = new THREE.Mesh(new THREE.CircleGeometry(2.2, 6), mat.driveGlow);
  driveGlow.name = 'Vael_Drive_Glow'; driveGlow.position.set(-13.0, 0, 0); driveGlow.rotation.y = -Math.PI / 2; hull.add(driveGlow);

  // ---- sockets (minimal — the Vael don't expose human-style hardpoints) ----
  const addSocket = (name, pos, role) => { const s = new THREE.Object3D(); s.name = name; s.position.set(pos[0], pos[1], pos[2]); s.userData.spacefaceSocket = true; s.userData.role = role; hull.add(s); };
  addSocket('SOCKET_Weapon_Front', [13.5, 0, 0], 'weapon');
  addSocket('SOCKET_Engine_Main', [-13.0, 0, 0], 'engine', [-1, 0, 0]);
  addSocket('SOCKET_Trail_Main', [-13.3, 0, 0], 'vfx', [-1, 0, 0]);
  addSocket('SOCKET_Camera_Focus', [0, 0, 0], 'camera');

  const outer = new THREE.Group(); outer.name = 'Vael_Sniper';
  outer.add(hull); outer.userData.hull = hull; outer.scale.setScalar(scale);
  outer.userData.assetId = 'SF_VAEL_SNIPER';
  outer.userData.renderContract = { coordinateSystem: '+X forward, +Y up, +Z starboard', authoredMetres: true, nominalDimensions: [32, 5, 5], sockets: 4, drawCallTarget: '<= 14 before post-processing', factionGrammar: '§8.7 non-human — ambiguous front, cavities, structure-is-signal, crystalline', version: 1 };
  attachLodState(outer);
  return outer;
}
