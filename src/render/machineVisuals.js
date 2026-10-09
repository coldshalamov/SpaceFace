// src/render/machineVisuals.js — Verge-Layer machine visuals (doc 07).
// Machine design language is the OPPOSITE of fungal organic noise: exact, spare, pale
// metal + nacre, controlled emissive seams, no wear, no dirt. Every shape is a clean
// platonic-ish primitive composition — geometry that tolerates a logo.
//
// Palette constants are deliberately shared between entity bodies and place props so a
// pylon and a prism read as the same civilization.

import * as THREE from 'three';
import { machineKindById } from '../data/precursorMachines.js';
import { creatureSkin } from './creatureSkinLibrary.js';

const PALE_METAL = 0xb9c4bd;   // nacre-adjacent pale metal
const DARK_SEAM = 0x2a3430;    // recessed seam material
const COLD_LIGHT = 0xa8e8dc;   // controlled emissive — cold teal-white
const SHADOW_INNER = 0x1a2320;

function metalMat() {
  // Pale metal wears generated nacre plating (creatureSkinLibrary.js) once it has decoded: fine growth-line
  // layers and hairline seams instead of a bare grey primitive. The pale-metal colour still tints it.
  const skin = creatureSkin('nacre');
  return new THREE.MeshStandardMaterial({
    color: skin ? new THREE.Color(0xffffff).lerp(new THREE.Color(PALE_METAL), 0.5) : PALE_METAL,
    map: skin ? skin.baseColor : null,
    normalMap: skin ? skin.normal : null,
    roughness: 0.35, metalness: 0.85,
    emissive: 0x0c1210, emissiveIntensity: 0.1,
  });
}
function seamMat() {
  return new THREE.MeshStandardMaterial({ color: DARK_SEAM, roughness: 0.8, metalness: 0.4 });
}
function lightMat(intensity = 1.6) {
  return new THREE.MeshStandardMaterial({
    color: SHADOW_INNER, roughness: 0.4, metalness: 0.3,
    emissive: COLD_LIGHT, emissiveIntensity: intensity,
  });
}

function geo(key, make) {
  const cache = (geo._cache ||= new Map());
  if (!cache.has(key)) {
    const g = make();
    g.userData = { ...(g.userData || {}), spacefaceSharedAsset: true };
    cache.set(key, g);
  }
  return cache.get(key);
}

// ── Machine entity bodies ────────────────────────────────────────────────────────────────

// Surveyor Prism: a slowly tumbling tetrahedral instrument — pure procedure, no menace.
function buildSurveyorPrism() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    geo('prism_body', () => new THREE.OctahedronGeometry(1, 0)),
    metalMat(),
  );
  body.scale.setScalar(12);
  g.add(body);
  const ring = new THREE.Mesh(
    geo('prism_ring', () => new THREE.TorusGeometry(1.35, 0.06, 6, 40)),
    lightMat(1.2),
  );
  ring.scale.setScalar(12);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const pupil = new THREE.Mesh(geo('prism_pupil', () => new THREE.SphereGeometry(0.16, 10, 8)), lightMat(2.4));
  pupil.scale.setScalar(12);
  g.add(pupil);
  g.name = 'SF_Machine_surveyor_prism';
  return g;
}

// Custodian: a low radial shell with articulated maintenance arms — reads industrious.
function buildCustodian() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(geo('cust_shell', () => {
    const s = new THREE.SphereGeometry(1, 16, 8);
    s.scale(1.5, 0.45, 1.5);
    return s;
  }), metalMat());
  shell.scale.setScalar(14);
  g.add(shell);
  const arm = geo('cust_arm', () => {
    const s = new THREE.BoxGeometry(0.16, 0.1, 2.4);
    s.translate(0, 0, -1.0);
    return s;
  });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const m = new THREE.Mesh(arm, seamMat());
    m.position.set(Math.cos(a) * 12, -3, Math.sin(a) * 12);
    m.rotation.y = -a;
    m.scale.setScalar(8);
    g.add(m);
    const tip = new THREE.Mesh(geo('cust_tip', () => new THREE.SphereGeometry(0.14, 8, 6)), lightMat(1.8));
    tip.position.set(Math.cos(a) * 12 + Math.sin(-a) * 0 - Math.sin(a) * -14, -3, Math.sin(a) * 12 + Math.cos(a) * -14);
    tip.scale.setScalar(6);
    g.add(tip);
  }
  const eye = new THREE.Mesh(geo('cust_eye', () => new THREE.SphereGeometry(0.22, 8, 6)), lightMat(1.5));
  eye.position.y = 5;
  eye.scale.setScalar(10);
  g.add(eye);
  g.name = 'SF_Machine_custodian';
  return g;
}

// Gate Auditor: a tall open ring — a standing frame that waits. Read: customs arch.
function buildGateAuditor() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    geo('aud_ring', () => new THREE.TorusGeometry(1, 0.09, 8, 48)),
    metalMat(),
  );
  ring.scale.setScalar(18);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 6;
  g.add(ring);
  const pillar = geo('aud_pillar', () => {
    const s = new THREE.BoxGeometry(0.28, 1.6, 0.28);
    s.translate(0, 0.8, 0);
    return s;
  });
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    const p = new THREE.Mesh(pillar, metalMat());
    p.position.set(Math.cos(a) * 18, -10, Math.sin(a) * 18);
    p.scale.setScalar(12);
    g.add(p);
  }
  const core = new THREE.Mesh(geo('aud_core', () => new THREE.OctahedronGeometry(0.3, 0)), lightMat(2.0));
  core.position.y = 6;
  core.scale.setScalar(14);
  g.add(core);
  g.name = 'SF_Machine_gate_auditor';
  return g;
}

// ── Phase 24 wave-B bodies (AE-232..AE-241) — same language: spare, pale, seam-lit. ──────

// Witness: a faceted eye — a hemisphere lens on a ring gimbal. It does not chase.
function buildWitness() {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(geo('wit_dome', () => {
    const s = new THREE.SphereGeometry(0.7, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    return s;
  }), metalMat());
  dome.scale.setScalar(16);
  dome.rotation.x = -Math.PI / 2;
  g.add(dome);
  const iris = new THREE.Mesh(geo('wit_iris', () => new THREE.SphereGeometry(0.2, 12, 8)), lightMat(2.6));
  iris.scale.setScalar(16);
  g.add(iris);
  const gimbal = new THREE.Mesh(geo('wit_gimbal', () => new THREE.TorusGeometry(0.95, 0.05, 6, 40)), seamMat());
  gimbal.scale.setScalar(16);
  g.add(gimbal);
  g.name = 'SF_Machine_witness';
  return g;
}

// Shepherd: a long pale fuselage with a fan of corridor vanes — a moving field edge.
function buildShepherd() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(geo('shp_hull', () => {
    const s = new THREE.CylinderGeometry(0.28, 0.16, 3.4, 8);
    s.rotateX(Math.PI / 2);
    return s;
  }), metalMat());
  hull.scale.setScalar(10);
  g.add(hull);
  const vane = geo('shp_vane', () => {
    const s = new THREE.BoxGeometry(2.6, 0.06, 0.7);
    return s;
  });
  for (let i = 0; i < 3; i += 1) {
    const v = new THREE.Mesh(vane, seamMat());
    v.position.z = -6 + i * 6;
    v.scale.setScalar(10);
    g.add(v);
  }
  const fieldTip = new THREE.Mesh(geo('shp_tip', () => new THREE.OctahedronGeometry(0.2, 0)), lightMat(2.2));
  fieldTip.position.z = 18;
  fieldTip.scale.setScalar(10);
  g.add(fieldTip);
  g.name = 'SF_Machine_shepherd';
  return g;
}

// Mason: an assembly cradle — two open gantries holding an empty axis.
function buildMason() {
  const g = new THREE.Group();
  const arm = geo('msn_arm', () => {
    const s = new THREE.TorusGeometry(1.0, 0.09, 6, 24, Math.PI);
    return s;
  });
  for (let i = 0; i < 2; i += 1) {
    const a = new THREE.Mesh(arm, metalMat());
    a.scale.setScalar(14);
    a.rotation.z = i === 0 ? 0 : Math.PI;
    a.position.x = i === 0 ? -2 : 2;
    g.add(a);
  }
  const weld = new THREE.Mesh(geo('msn_weld', () => new THREE.SphereGeometry(0.12, 8, 6)), lightMat(2.8));
  weld.scale.setScalar(14);
  g.add(weld);
  g.name = 'SF_Machine_mason';
  return g;
}

// Executor: the revocation enforcer — a narrow dark dart with one cold ring aft.
function buildExecutor() {
  const g = new THREE.Group();
  const dart = new THREE.Mesh(geo('exe_dart', () => {
    const s = new THREE.ConeGeometry(0.4, 3.0, 4);
    s.rotateX(Math.PI / 2);
    return s;
  }), new THREE.MeshStandardMaterial({
    color: 0x11181a, roughness: 0.5, metalness: 0.9,
  }));
  dart.scale.setScalar(9);
  g.add(dart);
  const aft = new THREE.Mesh(geo('exe_aft', () => new THREE.TorusGeometry(0.55, 0.07, 6, 24)), lightMat(1.2));
  aft.position.z = -12;
  aft.scale.setScalar(9);
  g.add(aft);
  const eye = new THREE.Mesh(geo('exe_eye', () => new THREE.SphereGeometry(0.14, 8, 6)), lightMat(2.4));
  eye.position.z = 10;
  eye.scale.setScalar(9);
  g.add(eye);
  g.name = 'SF_Machine_executor';
  return g;
}

// Courier: a fast shuttle sliver — reads as mail, not menace.
function buildCourier() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo('cou_body', () => {
    const s = new THREE.OctahedronGeometry(1, 0);
    s.scale(0.5, 0.28, 1.6);
    return s;
  }), metalMat());
  body.scale.setScalar(10);
  g.add(body);
  const wake = new THREE.Mesh(geo('cou_wake', () => new THREE.ConeGeometry(0.2, 1.2, 4)), lightMat(1.6));
  wake.rotation.x = -Math.PI / 2;
  wake.position.z = -16;
  wake.scale.setScalar(10);
  g.add(wake);
  g.name = 'SF_Machine_courier';
  return g;
}

// Conservator: a squat canister with a vacuum intake skirt — the ring's janitor.
function buildConservator() {
  const g = new THREE.Group();
  const can = new THREE.Mesh(geo('con_can', () => new THREE.CylinderGeometry(0.6, 0.75, 1.1, 10)), metalMat());
  can.scale.setScalar(16);
  g.add(can);
  const skirt = new THREE.Mesh(geo('con_skirt', () => {
    const s = new THREE.CylinderGeometry(0.95, 0.6, 0.5, 10, 1, true);
    return s;
  }), seamMat());
  skirt.position.y = -10;
  skirt.scale.setScalar(16);
  g.add(skirt);
  const lamp = new THREE.Mesh(geo('con_lamp', () => new THREE.SphereGeometry(0.12, 8, 6)), lightMat(1.4));
  lamp.position.y = 10;
  lamp.scale.setScalar(16);
  g.add(lamp);
  g.name = 'SF_Machine_conservator';
  return g;
}

// Measure: a fixed instrument — a needle suspended between two ring rails.
function buildMeasure() {
  const g = new THREE.Group();
  const rail = geo('mea_rail', () => new THREE.TorusGeometry(0.9, 0.05, 6, 36));
  for (const dz of [-8, 8]) {
    const r = new THREE.Mesh(rail, metalMat());
    r.position.z = dz;
    r.scale.setScalar(12);
    g.add(r);
  }
  const needle = new THREE.Mesh(geo('mea_needle', () => {
    const s = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6);
    s.rotateX(Math.PI / 2);
    return s;
  }), lightMat(1.8));
  needle.scale.setScalar(12);
  g.add(needle);
  g.name = 'SF_Machine_measure';
  return g;
}

// Boundary Walker: a thin patrol wedge that fences a line nothing crosses cleanly.
function buildBoundaryWalker() {
  const g = new THREE.Group();
  const wedge = new THREE.Mesh(geo('bw_wedge', () => {
    const s = new THREE.CylinderGeometry(0.12, 0.5, 2.8, 4);
    s.rotateX(Math.PI / 2);
    return s;
  }), metalMat());
  wedge.scale.setScalar(10);
  g.add(wedge);
  const edge = new THREE.Mesh(geo('bw_edge', () => new THREE.BoxGeometry(0.06, 0.06, 2.6)), lightMat(1.6));
  edge.position.x = 4;
  edge.scale.setScalar(10);
  g.add(edge);
  g.name = 'SF_Machine_boundary_walker';
  return g;
}

// Appeals Clerk: a standing lectern-drone — reads bureaucratic, not armed.
function buildAppealsClerk() {
  const g = new THREE.Group();
  const desk = new THREE.Mesh(geo('ac_desk', () => {
    const s = new THREE.CylinderGeometry(0.4, 0.55, 1.3, 6);
    return s;
  }), metalMat());
  desk.scale.setScalar(12);
  g.add(desk);
  const slat = new THREE.Mesh(geo('ac_slat', () => new THREE.BoxGeometry(0.5, 0.7, 0.05)), lightMat(1.0));
  slat.position.set(0, 6, 7);
  slat.rotation.x = -0.5;
  slat.scale.setScalar(12);
  g.add(slat);
  g.name = 'SF_Machine_appeals_clerk';
  return g;
}

// Debris Sorter: a slow rake — wide intake mouth on a collector spine.
function buildDebrisSorter() {
  const g = new THREE.Group();
  const mouth = new THREE.Mesh(geo('ds_mouth', () => {
    const s = new THREE.CylinderGeometry(1.0, 0.55, 0.8, 12, 1, true);
    s.rotateX(-Math.PI / 2);
    return s;
  }), seamMat());
  mouth.scale.setScalar(14);
  g.add(mouth);
  const spine = new THREE.Mesh(geo('ds_spine', () => {
    const s = new THREE.BoxGeometry(0.4, 0.4, 2.2);
    s.translate(0, 0, -1.0);
    return s;
  }), metalMat());
  spine.scale.setScalar(14);
  g.add(spine);
  const eye = new THREE.Mesh(geo('ds_eye', () => new THREE.SphereGeometry(0.1, 8, 6)), lightMat(1.5));
  eye.position.y = 6;
  eye.scale.setScalar(14);
  g.add(eye);
  g.name = 'SF_Machine_debris_sorter';
  return g;
}

// Sleeping Jury: three joined sealed verdict pods — a body that convenes, not fights.
function buildSleepingJury() {
  const g = new THREE.Group();
  const pod = geo('sj_pod', () => {
    const s = new THREE.SphereGeometry(0.5, 14, 10);
    s.scale(1, 0.7, 1);
    return s;
  });
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    const p = new THREE.Mesh(pod, metalMat());
    p.position.set(Math.cos(a) * 10, 0, Math.sin(a) * 10);
    p.scale.setScalar(12);
    g.add(p);
  }
  const seal = new THREE.Mesh(geo('sj_seal', () => new THREE.TorusGeometry(1.3, 0.05, 6, 36)), lightMat(0.5));
  seal.rotation.x = Math.PI / 2;
  seal.scale.setScalar(12);
  g.add(seal);
  g.name = 'SF_Machine_sleeping_jury';
  return g;
}

const MACHINE_BUILDERS = {
  surveyor_prism: buildSurveyorPrism,
  custodian: buildCustodian,
  auditor: buildGateAuditor,
  witness: buildWitness,
  shepherd: buildShepherd,
  mason: buildMason,
  executor: buildExecutor,
  courier: buildCourier,
  conservator: buildConservator,
  measure: buildMeasure,
  boundary_walker: buildBoundaryWalker,
  appeals_clerk: buildAppealsClerk,
  debris_sorter: buildDebrisSorter,
  sleeping_jury: buildSleepingJury,
};

export function buildMachineMesh(entity) {
  const m = entity && entity.data && entity.data.machine;
  const kind = machineKindById(m && m.kind);
  if (!kind) return null;
  const builder = MACHINE_BUILDERS[kind.id];
  const root = builder ? builder() : null;
  if (root) {
    root.userData.kind = 'machine';
    root.userData.machineKind = kind.id;
  }
  return root;
}

// ── Machine place props (placeId 'machine_*') ─────────────────────────────────────────────
// Structures never glow warm — emissive is a controlled cold seam, never a bloom source.

export function buildMachineProp(placeId, radius = 20) {
  const id = String(placeId || '').replace(/^machine_/, '');
  const g = new THREE.Group();
  g.name = `SF_MachineProp_${id}`;
  const r = Math.max(8, radius || 20);

  switch (id) {
    case 'pylon': {
      // AE-100 quarantine pylon: a tall pale obelisk with a seam-lit collar.
      const body = new THREE.Mesh(geo('mp_pylon', () => {
        const s = new THREE.CylinderGeometry(0.35, 0.6, 5.5, 6);
        s.translate(0, 2.75, 0);
        return s;
      }), metalMat());
      body.scale.setScalar(r * 0.5);
      g.add(body);
      const collar = new THREE.Mesh(geo('mp_collar', () => new THREE.TorusGeometry(0.75, 0.09, 6, 24)), lightMat(1.4));
      collar.rotation.x = Math.PI / 2;
      collar.position.y = r * 2.4;
      collar.scale.setScalar(r * 0.5);
      g.add(collar);
      const cap = new THREE.Mesh(geo('mp_cap', () => new THREE.OctahedronGeometry(0.3, 0)), lightMat(1.0));
      cap.position.y = r * 3.0;
      cap.scale.setScalar(r * 0.5);
      g.add(cap);
      break;
    }
    case 'monolith': {
      // AE-101 survey monolith: a thin unbroken slab — a tool, not a monument.
      const slab = new THREE.Mesh(geo('mp_slab', () => new THREE.BoxGeometry(0.5, 4.2, 1.6)), metalMat());
      slab.position.y = r * 1.6;
      slab.scale.setScalar(r * 0.6);
      g.add(slab);
      const seam = new THREE.Mesh(geo('mp_seam', () => new THREE.BoxGeometry(0.54, 4.0, 0.06)), lightMat(0.9));
      seam.position.set(0, r * 1.6, r * 0.48);
      seam.scale.setScalar(r * 0.6);
      g.add(seam);
      break;
    }
    case 'spine': {
      // AE-102 null corridor spine: a chain segment — repeated along the lane.
      const seg = new THREE.Mesh(geo('mp_seg', () => {
        const s = new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6);
        s.rotateZ(Math.PI / 2);
        return s;
      }), metalMat());
      seg.scale.setScalar(r * 0.4);
      g.add(seg);
      for (let i = -1; i <= 1; i += 1) {
        const node = new THREE.Mesh(geo('mp_node', () => new THREE.OctahedronGeometry(0.3, 0)), lightMat(0.7));
        node.position.x = i * r * 0.9;
        node.scale.setScalar(r * 0.35);
        g.add(node);
      }
      break;
    }
    case 'plate': {
      // AE-103 gate underlayer plate: pale geometry showing through human scaffold.
      const plate = new THREE.Mesh(geo('mp_plate', () => {
        const s = new THREE.CylinderGeometry(1.1, 1.3, 0.18, 8);
        return s;
      }), metalMat());
      plate.scale.setScalar(r);
      plate.rotation.x = Math.PI / 2;
      g.add(plate);
      const etch = new THREE.Mesh(geo('mp_etch', () => new THREE.TorusGeometry(0.7, 0.04, 6, 32)), lightMat(0.8));
      etch.scale.setScalar(r);
      g.add(etch);
      break;
    }
    case 'husk': {
      // AE-104 ossuary husk: a dormant frame stored in rank — still precise, unbroken.
      const frame = new THREE.Mesh(geo('mp_frame', () => {
        const s = new THREE.TorusGeometry(0.8, 0.12, 6, 20, Math.PI * 1.5);
        return s;
      }), seamMat());
      frame.scale.setScalar(r * 0.5);
      frame.rotation.z = Math.PI * 0.75;
      g.add(frame);
      const core = new THREE.Mesh(geo('mp_hcore', () => new THREE.OctahedronGeometry(0.22, 0)), metalMat());
      core.scale.setScalar(r * 0.5);
      g.add(core);
      break;
    }
    case 'vault': {
      // AE-105 black vault: a sealed face — matte black plate ringed by one cold seam.
      const face = new THREE.Mesh(geo('mp_face', () => {
        const s = new THREE.SphereGeometry(1, 20, 12);
        s.scale(1, 0.25, 1);
        return s;
      }), new THREE.MeshStandardMaterial({
        color: 0x06090a, roughness: 0.9, metalness: 0.4,
      }));
      face.scale.setScalar(r);
      g.add(face);
      const seamRing = new THREE.Mesh(geo('mp_vseam', () => new THREE.TorusGeometry(1.02, 0.03, 6, 48)), lightMat(0.6));
      seamRing.scale.setScalar(r);
      g.add(seamRing);
      break;
    }
    case 'gate_ring': {
      // AE-108 revoked gate: a full transit ring, inert — the seam light is OFF.
      const ring = new THREE.Mesh(geo('mp_gate', () => new THREE.TorusGeometry(1, 0.08, 8, 40)), metalMat());
      ring.scale.setScalar(r);
      g.add(ring);
      const marker = geo('mp_marker', () => {
        const s = new THREE.ConeGeometry(0.16, 0.5, 4);
        return s;
      });
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const mk = new THREE.Mesh(marker, seamMat()); // deliberately unlit
        mk.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        mk.rotation.z = a - Math.PI / 2;
        mk.scale.setScalar(r * 0.3);
        g.add(mk);
      }
      break;
    }
    case 'marker': {
      // AE-243 star marker: a fixed reference needle — thin, untuned, still right.
      const needle = new THREE.Mesh(geo('mp_needle', () => {
        const s = new THREE.ConeGeometry(0.1, 3.8, 4);
        s.translate(0, 1.9, 0);
        return s;
      }), metalMat());
      needle.scale.setScalar(r * 0.5);
      g.add(needle);
      const ref = new THREE.Mesh(geo('mp_ref', () => new THREE.TorusGeometry(0.4, 0.05, 6, 24)), lightMat(1.2));
      ref.position.y = r * 0.4;
      ref.scale.setScalar(r * 0.5);
      g.add(ref);
      break;
    }
    case 'dock_arm': {
      // AE-244 quiet dock arm: a dormant berth clamp, open.
      const arm = new THREE.Mesh(geo('mp_darm', () => {
        const s = new THREE.BoxGeometry(0.24, 0.24, 3.0);
        s.translate(0, 0, 1.2);
        return s;
      }), metalMat());
      arm.scale.setScalar(r * 0.4);
      g.add(arm);
      const jaw = new THREE.Mesh(geo('mp_jaw', () => new THREE.TorusGeometry(0.5, 0.09, 6, 16, Math.PI)), seamMat());
      jaw.position.z = r * 1.05;
      jaw.scale.setScalar(r * 0.4);
      g.add(jaw);
      const pin = new THREE.Mesh(geo('mp_pin', () => new THREE.SphereGeometry(0.12, 8, 6)), lightMat(0.7));
      pin.position.y = r * 0.3;
      pin.scale.setScalar(r * 0.4);
      g.add(pin);
      break;
    }
    case 'gantry': {
      // AE-246 empty foundry: a construction frame holding an empty axis.
      const arch = new THREE.Mesh(geo('mp_garch', () => {
        const s = new THREE.TorusGeometry(1.0, 0.07, 6, 28, Math.PI);
        return s;
      }), metalMat());
      arch.rotation.y = Math.PI / 2;
      arch.scale.setScalar(r * 0.45);
      g.add(arch);
      const axis = new THREE.Mesh(geo('mp_gaxis', () => {
        const s = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6);
        s.rotateX(Math.PI / 2);
        return s;
      }), lightMat(0.9));
      axis.scale.setScalar(r * 0.45);
      g.add(axis);
      const cradle = new THREE.Mesh(geo('mp_gcradle', () => new THREE.OctahedronGeometry(0.14, 0)), seamMat());
      cradle.scale.setScalar(r * 0.45);
      g.add(cradle);
      break;
    }
    default: {
      const stub = new THREE.Mesh(geo('mp_stub', () => new THREE.BoxGeometry(0.6, 1.6, 0.6)), metalMat());
      stub.position.y = r * 0.6;
      stub.scale.setScalar(r * 0.5);
      g.add(stub);
      break;
    }
  }
  g.userData.kind = 'machineProp';
  g.userData.machinePropId = id;
  return g;
}
