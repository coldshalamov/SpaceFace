// src/render/faunaVisuals.js — procedural bodies for ecological fauna (doc 02/03).
// No authored GLBs in the slice: every body is built from primitives and reads "organic",
// never mechanical. Palette comes from the site's strain (data.strainId on the entity).
// Entities are kinematic (type 'fauna', no physics body) — the mesh IS the creature.

import * as THREE from 'three';
import { faunaSpeciesById } from '../data/alienFauna.js';
import { alienStrainById } from '../data/alienEcology.js';

const TISSUE = 0x9aa08e;
const FILAMENT = 0xc94f3d;
const GLOW = 0xff9a4a;

function strainColors(entity) {
  const strain = alienStrainById(entity && entity.data && entity.data.strainId);
  return {
    tissue: strain ? strain.tissueColor : TISSUE,
    filament: strain ? strain.filamentColor : FILAMENT,
    glow: strain ? strain.glowColor : GLOW,
  };
}

function tissueMat(color) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.85, metalness: 0.0,
    emissive: 0x1a1408, emissiveIntensity: 0.15,
  });
}
function glowMat(color, intensity = 1.2) {
  return new THREE.MeshStandardMaterial({
    color: 0x1c1410, roughness: 0.6, metalness: 0.0,
    emissive: color, emissiveIntensity: intensity,
  });
}

function geo(key, make) {
  const cache = (geo._cache ||= new Map());
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// ── species builders — top-down game reads XZ; bodies stay mostly flat-ish, y is height ──────

// Veil-Ray: a broad flat membrane wing — like a manta made of pale tissue with a filament keel.
function buildVeilRay(colors) {
  const g = new THREE.Group();
  const wing = geo('ray_wing', () => {
    const s = new THREE.SphereGeometry(1, 20, 10);
    s.scale(1.6, 0.16, 1.05);
    return s;
  });
  const body = new THREE.Mesh(wing, tissueMat(colors.tissue));
  body.scale.setScalar(14);
  g.add(body);
  const keel = new THREE.Mesh(
    geo('ray_keel', () => {
      const s = new THREE.SphereGeometry(1, 12, 6);
      s.scale(0.5, 0.28, 1.35);
      return s;
    }),
    glowMat(colors.filament, 0.9),
  );
  keel.scale.setScalar(11);
  keel.position.y = 0.4;
  g.add(keel);
  const tail = new THREE.Mesh(
    geo('ray_tail', () => {
      const s = new THREE.CylinderGeometry(0.06, 0.42, 3.2, 8);
      s.rotateX(Math.PI / 2);
      return s;
    }),
    tissueMat(colors.tissue),
  );
  tail.position.z = -2.4 * 11;
  tail.scale.setScalar(8);
  g.add(tail);
  g.rotation.x = 0;
  g.name = 'SF_Fauna_veil_ray';
  return g;
}

// Needle Swarm: one entity, a cloud of thin darts orbiting a dim core — reads as "many".
function buildNeedleSwarm(colors, species) {
  const g = new THREE.Group();
  const n = species.members || 9;
  const dart = geo('ns_dart', () => {
    const s = new THREE.ConeGeometry(0.22, 2.6, 5);
    s.rotateX(Math.PI / 2); // point along +Z (heading)
    return s;
  });
  const dartMat = tissueMat(colors.filament);
  for (let i = 0; i < n; i += 1) {
    const d = new THREE.Mesh(dart, dartMat);
    const a = (i / n) * Math.PI * 2;
    const r = 4.5 + (i % 3) * 2.2;
    d.position.set(Math.cos(a) * r, (i % 2 ? 0.5 : -0.4) * (1 + i * 0.12), Math.sin(a) * r);
    d.rotation.y = a + Math.PI / 2;
    g.add(d);
  }
  const core = new THREE.Mesh(
    geo('ns_core', () => new THREE.SphereGeometry(1.4, 10, 8)),
    glowMat(colors.glow, 0.8),
  );
  core.scale.setScalar(2.2);
  g.add(core);
  g.name = 'SF_Fauna_needle_swarm';
  return g;
}

// Blind Shepherd: a heavy pale torus-shell with a luminous relay organ — deliberately alien,
// bigger than everything else on the site.
function buildBlindShepherd(colors) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    geo('bs_shell', () => {
      const s = new THREE.SphereGeometry(1, 24, 14);
      s.scale(1.9, 0.55, 1.9);
      return s;
    }),
    tissueMat(colors.tissue),
  );
  shell.scale.setScalar(16);
  g.add(shell);
  const organ = new THREE.Mesh(
    geo('bs_organ', () => new THREE.SphereGeometry(0.5, 12, 8)),
    glowMat(colors.glow, 1.6),
  );
  organ.scale.setScalar(16);
  organ.position.y = 4.4;
  g.add(organ);
  const skirt = new THREE.Mesh(
    geo('bs_skirt', () => new THREE.TorusGeometry(1.4, 0.22, 8, 28)),
    tissueMat(colors.filament),
  );
  skirt.rotation.x = Math.PI / 2;
  skirt.scale.setScalar(16);
  skirt.position.y = -1.2;
  g.add(skirt);
  g.name = 'SF_Fauna_blind_shepherd';
  return g;
}

// Hull Leech: a flat disc with radial gripping arms — low, wide, obviously latched-on posture.
function buildHullLeech(colors) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    geo('hl_body', () => {
      const s = new THREE.SphereGeometry(1, 14, 8);
      s.scale(1.1, 0.22, 1.1);
      return s;
    }),
    tissueMat(colors.filament),
  );
  body.scale.setScalar(7);
  g.add(body);
  const arm = geo('hl_arm', () => {
    const s = new THREE.CylinderGeometry(0.12, 0.3, 2.4, 5);
    s.rotateZ(Math.PI / 2);
    return s;
  });
  const armMat = tissueMat(colors.tissue);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.Mesh(arm, armMat);
    m.scale.setScalar(6);
    m.position.set(Math.cos(a) * 7.2, -0.4, Math.sin(a) * 7.2);
    m.rotation.y = -a;
    g.add(m);
  }
  const maw = new THREE.Mesh(
    geo('hl_maw', () => new THREE.SphereGeometry(0.35, 8, 6)),
    glowMat(colors.glow, 1.1),
  );
  maw.scale.setScalar(6);
  maw.position.y = 1.4;
  g.add(maw);
  g.name = 'SF_Fauna_hull_leech';
  return g;
}

const BUILDERS = {
  veil_ray: (c, s) => buildVeilRay(c),
  needle_swarm: (c, s) => buildNeedleSwarm(c, s),
  blind_shepherd: (c, s) => buildBlindShepherd(c),
  hull_leech: (c, s) => buildHullLeech(c),
};

export function buildFaunaMesh(entity) {
  const eco = entity && entity.data && entity.data.ecology;
  const species = faunaSpeciesById(eco && eco.speciesId);
  if (!species) return null;
  const colors = strainColors(entity);
  const root = BUILDERS[species.id] ? BUILDERS[species.id](colors, species) : null;
  if (root) {
    root.userData.kind = 'fauna';
    root.userData.speciesId = species.id;
  }
  return root;
}

// ── Infestation growth props (doc 03 kit) — dressing entities place_alien_growth_<module> ────
// These replace a bare empty Group for the alien_growth_* placeIds in buildFallbackPlaceProp.

export function buildAlienGrowthProp(placeId, radius = 8) {
  const moduleId = String(placeId || '').replace(/^alien_growth_/, '');
  const g = new THREE.Group();
  g.name = `SF_AlienGrowth_${moduleId}`;
  const r = Math.max(2, radius || 8);
  const tissue = tissueMat(0x8f9484);
  const fil = tissueMat(0x7e3a2e);
  const glow = glowMat(0xff8a3c, 0.9);

  switch (moduleId) {
    case 'filament_sheet':
    case 'membrane_patch': {
      const sheet = new THREE.Mesh(geo('gr_sheet', () => {
        const s = new THREE.SphereGeometry(1, 18, 8);
        s.scale(1, 0.08, 1);
        return s;
      }), fil);
      sheet.scale.setScalar(r);
      g.add(sheet);
      for (let i = 0; i < 4; i += 1) {
        const bead = new THREE.Mesh(geo('gr_bead', () => new THREE.SphereGeometry(0.16, 8, 6)), glow);
        bead.position.set(Math.cos(i * 1.7) * r * 0.7, r * 0.12, Math.sin(i * 1.7) * r * 0.7);
        bead.scale.setScalar(r * 0.5);
        g.add(bead);
      }
      break;
    }
    case 'node_bulb_small':
    case 'node_bulb_large': {
      const bulb = new THREE.Mesh(geo('gr_bulb', () => new THREE.SphereGeometry(0.8, 14, 10)), glow);
      bulb.scale.setScalar(r * (moduleId === 'node_bulb_large' ? 1.1 : 0.8));
      bulb.position.y = r * 0.4;
      g.add(bulb);
      const collar = new THREE.Mesh(geo('gr_collar', () => new THREE.TorusGeometry(0.9, 0.24, 8, 20)), fil);
      collar.rotation.x = Math.PI / 2;
      collar.scale.setScalar(r * 0.8);
      g.add(collar);
      break;
    }
    case 'cyst_cluster': {
      for (let i = 0; i < 5; i += 1) {
        const cyst = new THREE.Mesh(geo('gr_cyst', () => new THREE.SphereGeometry(0.4, 10, 8)),
          i % 2 ? glow : tissue);
        const a = (i / 5) * Math.PI * 2;
        cyst.position.set(Math.cos(a) * r * 0.4, r * 0.22, Math.sin(a) * r * 0.4);
        cyst.scale.setScalar(r * (0.7 + (i % 3) * 0.18));
        g.add(cyst);
      }
      break;
    }
    case 'calcified_collar': {
      const ring = new THREE.Mesh(geo('gr_ring', () => new THREE.TorusGeometry(1, 0.3, 8, 24)), tissue);
      ring.rotation.x = Math.PI / 2;
      ring.scale.setScalar(r * 0.85);
      g.add(ring);
      break;
    }
    case 'tendril_cluster':
    case 'nerve_bundle': {
      const tendril = geo('gr_tendril', () => {
        const s = new THREE.ConeGeometry(0.2, 2.2, 6);
        s.translate(0, 1.1, 0);
        return s;
      });
      for (let i = 0; i < 6; i += 1) {
        const t = new THREE.Mesh(tendril, i % 2 ? fil : tissue);
        const a = (i / 6) * Math.PI * 2;
        t.position.set(Math.cos(a) * r * 0.45, 0, Math.sin(a) * r * 0.45);
        t.rotation.z = Math.cos(a) * 0.55;
        t.rotation.x = -Math.sin(a) * 0.55;
        t.scale.setScalar(r * 0.8);
        g.add(t);
      }
      break;
    }
    case 'vent_lung':
    case 'spore_chimney': {
      const stack = new THREE.Mesh(geo('gr_stack', () => {
        const s = new THREE.CylinderGeometry(0.35, 0.9, 2.6, 10);
        s.translate(0, 1.3, 0);
        return s;
      }), tissue);
      stack.scale.setScalar(r * 0.75);
      g.add(stack);
      const vent = new THREE.Mesh(geo('gr_vent', () => new THREE.SphereGeometry(0.3, 10, 6)), glow);
      vent.position.y = r * 2.0;
      vent.scale.setScalar(r * 0.8);
      g.add(vent);
      break;
    }
    case 'sensory_fan':
    case 'mineral_root':
    default: {
      const blade = geo('gr_blade', () => {
        const s = new THREE.ConeGeometry(0.16, 2.4, 4);
        s.translate(0, 1.2, 0);
        return s;
      });
      for (let i = 0; i < 7; i += 1) {
        const b = new THREE.Mesh(blade, i % 2 ? tissue : fil);
        const a = -0.9 + (i / 6) * 1.8;
        b.position.set(Math.cos(a) * r * 0.5, 0, Math.sin(a) * r * 0.5);
        b.rotation.z = a * 0.7;
        b.scale.setScalar(r * 0.85);
        g.add(b);
      }
      break;
    }
  }
  g.userData.kind = 'alienGrowth';
  g.userData.moduleId = moduleId;
  return g;
}
