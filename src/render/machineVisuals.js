// src/render/machineVisuals.js — Verge-Layer machine visuals (doc 07).
// Machine design language is the OPPOSITE of fungal organic noise: exact, spare, pale
// metal + nacre, controlled emissive seams, no wear, no dirt. Every shape is a clean
// platonic-ish primitive composition — geometry that tolerates a logo.
//
// Palette constants are deliberately shared between entity bodies and place props so a
// pylon and a prism read as the same civilization.

import * as THREE from 'three';
import { machineKindById } from '../data/precursorMachines.js';

const PALE_METAL = 0xb9c4bd;   // nacre-adjacent pale metal
const DARK_SEAM = 0x2a3430;    // recessed seam material
const COLD_LIGHT = 0xa8e8dc;   // controlled emissive — cold teal-white
const SHADOW_INNER = 0x1a2320;

function metalMat() {
  return new THREE.MeshStandardMaterial({
    color: PALE_METAL, roughness: 0.35, metalness: 0.85,
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

const MACHINE_BUILDERS = {
  surveyor_prism: buildSurveyorPrism,
  custodian: buildCustodian,
  auditor: buildGateAuditor,
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
