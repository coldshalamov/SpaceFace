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
  if (!cache.has(key)) {
    const g = make();
    // Shared across every creature of this species and across sector teardowns: the per-entity
    // disposer (renderer disposeObject) honors spacefaceSharedAsset and never frees the cache.
    g.userData = { ...(g.userData || {}), spacefaceSharedAsset: true };
    cache.set(key, g);
  }
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

// Lantern Cyst: a translucent bioluminescent sac — drifts warm-facing, ruptures if killed.
function buildLanternCyst(colors) {
  const g = new THREE.Group();
  const sac = new THREE.Mesh(
    geo('lc_sac', () => {
      const s = new THREE.SphereGeometry(1, 14, 10);
      s.scale(1, 1.25, 1);
      return s;
    }),
    new THREE.MeshStandardMaterial({
      color: colors.tissue, roughness: 0.35, metalness: 0.0,
      transparent: true, opacity: 0.55,
      emissive: colors.glow, emissiveIntensity: 0.35,
    }),
  );
  sac.scale.setScalar(7);
  g.add(sac);
  const core = new THREE.Mesh(geo('lc_core', () => new THREE.SphereGeometry(0.42, 10, 8)), glowMat(colors.glow, 1.6));
  core.scale.setScalar(7);
  core.position.y = -1;
  g.add(core);
  const rootlet = geo('lc_root', () => {
    const s = new THREE.CylinderGeometry(0.03, 0.09, 1.6, 5);
    s.translate(0, -0.8, 0);
    return s;
  });
  for (let i = 0; i < 5; i += 1) {
    const r = new THREE.Mesh(rootlet, tissueMat(colors.filament));
    const a = (i / 5) * Math.PI * 2;
    r.position.set(Math.cos(a) * 2.2, -4.5, Math.sin(a) * 2.2);
    r.rotation.z = Math.cos(a) * 0.4;
    r.rotation.x = Math.sin(a) * 0.4;
    g.add(r);
  }
  g.name = 'SF_Fauna_lantern_cyst';
  return g;
}

// Casket Worm: a low segmented hull-crawler — armored plates, no glow until it moves.
function buildCasketWorm(colors) {
  const g = new THREE.Group();
  const seg = geo('cw_seg', () => {
    const s = new THREE.BoxGeometry(1.4, 0.5, 1.1);
    s.scale(1, 1, 1);
    return s;
  });
  for (let i = 0; i < 6; i += 1) {
    const m = new THREE.Mesh(seg, tissueMat(i % 2 ? colors.tissue : colors.filament));
    m.position.set(0, (i % 2) * 0.5 - 0.3, -i * 2.2);
    m.scale.set(8 - i * 0.6, 6, 8);
    g.add(m);
  }
  const head = new THREE.Mesh(geo('cw_head', () => {
    const s = new THREE.ConeGeometry(0.8, 1.6, 6);
    s.rotateX(Math.PI / 2);
    return s;
  }), tissueMat(colors.tissue));
  head.position.z = 2.4;
  head.scale.setScalar(8);
  g.add(head);
  g.name = 'SF_Fauna_casket_worm';
  return g;
}

// Bristle Ram: a blunt wedge of plate and quill — reads dangerous at a glance.
function buildBristleRam(colors) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(geo('br_hull', () => {
    const s = new THREE.SphereGeometry(1, 14, 8);
    s.scale(1.5, 0.5, 1.1);
    return s;
  }), tissueMat(colors.tissue));
  hull.scale.setScalar(11);
  g.add(hull);
  const wedge = new THREE.Mesh(geo('br_wedge', () => {
    const s = new THREE.ConeGeometry(0.7, 2.8, 4);
    s.rotateX(Math.PI / 2);
    return s;
  }), tissueMat(colors.filament));
  wedge.position.z = 13;
  wedge.scale.set(10, 8, 10);
  g.add(wedge);
  const quill = geo('br_quill', () => {
    const s = new THREE.ConeGeometry(0.09, 1.8, 4);
    s.translate(0, 0.9, 0);
    return s;
  });
  const quillMat = tissueMat(colors.filament);
  for (let i = 0; i < 9; i += 1) {
    const q = new THREE.Mesh(quill, quillMat);
    const a = -0.8 + (i / 8) * 1.6;
    q.position.set(Math.sin(a) * 8, 4.2, -Math.cos(a) * 6);
    q.rotation.z = a * 0.6;
    q.rotation.x = -0.7;
    q.scale.setScalar(5);
    g.add(q);
  }
  g.name = 'SF_Fauna_bristle_ram';
  return g;
}

// Mourning Kite: a tall thin sail on a filament tether — reads mournful and aware.
function buildMourningKite(colors) {
  const g = new THREE.Group();
  const sail = new THREE.Mesh(geo('mk_sail', () => {
    const s = new THREE.SphereGeometry(1, 10, 14);
    s.scale(0.35, 2.6, 1.4);
    return s;
  }), new THREE.MeshStandardMaterial({
    color: colors.tissue, roughness: 0.5, metalness: 0.0,
    transparent: true, opacity: 0.7, emissive: colors.glow, emissiveIntensity: 0.15,
  }));
  sail.scale.setScalar(9);
  g.add(sail);
  const line = new THREE.Mesh(geo('mk_line', () => new THREE.CylinderGeometry(0.05, 0.05, 9, 4)), tissueMat(colors.filament));
  line.position.y = -11;
  g.add(line);
  const knot = new THREE.Mesh(geo('mk_knot', () => new THREE.SphereGeometry(0.3, 8, 6)), glowMat(colors.glow, 0.9));
  knot.position.y = -15.5;
  knot.scale.setScalar(6);
  g.add(knot);
  g.name = 'SF_Fauna_mourning_kite';
  return g;
}

// Anchor Beast: a mound fused to the wreck — sessile, the size of a small station module.
function buildAnchorBeast(colors) {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(geo('ab_mound', () => {
    const s = new THREE.SphereGeometry(1, 18, 10);
    s.scale(1.4, 0.6, 1.4);
    return s;
  }), tissueMat(colors.tissue));
  mound.scale.setScalar(26);
  g.add(mound);
  const spike = geo('ab_spike', () => {
    const s = new THREE.ConeGeometry(0.4, 3.4, 6);
    s.translate(0, 1.7, 0);
    return s;
  });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const sp = new THREE.Mesh(spike, i % 3 ? tissueMat(colors.tissue) : glowMat(colors.glow, 0.6));
    sp.position.set(Math.cos(a) * 24, 6, Math.sin(a) * 24);
    sp.rotation.z = Math.cos(a) * 1.1;
    sp.rotation.x = -Math.sin(a) * 1.1;
    sp.scale.setScalar(9);
    g.add(sp);
  }
  const crown = new THREE.Mesh(geo('ab_crown', () => new THREE.SphereGeometry(0.5, 12, 8)), glowMat(colors.glow, 1.2));
  crown.position.y = 18;
  crown.scale.setScalar(14);
  g.add(crown);
  g.name = 'SF_Fauna_anchor_beast';
  return g;
}

// Furnace Maw: a squat vent-bowl with a heat core — reads as a static hazard until it moves.
function buildFurnaceMaw(colors) {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(geo('fm_bowl', () => {
    const s = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55);
    return s;
  }), tissueMat(colors.tissue));
  bowl.scale.set(18, 14, 18);
  bowl.rotation.x = Math.PI;
  g.add(bowl);
  const throat = new THREE.Mesh(geo('fm_throat', () => new THREE.SphereGeometry(0.55, 12, 8)), glowMat(0xff6a28, 2.2));
  throat.position.y = 2;
  throat.scale.setScalar(16);
  g.add(throat);
  const jaw = geo('fm_jaw', () => {
    const s = new THREE.ConeGeometry(0.3, 2.2, 5);
    s.translate(0, 1.1, 0);
    return s;
  });
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    const j = new THREE.Mesh(jaw, tissueMat(colors.filament));
    j.position.set(Math.cos(a) * 13, 8, Math.sin(a) * 13);
    j.rotation.z = Math.cos(a) * 0.9;
    j.rotation.x = -Math.sin(a) * 0.9;
    j.scale.setScalar(7);
    g.add(j);
  }
  g.name = 'SF_Fauna_furnace_maw';
  return g;
}

// Glassback: a translucent dome-carapace quadruped — beam-resistant, reads delicate.
function buildGlassback(colors) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(geo('gb_dome', () => {
    const s = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    return s;
  }), new THREE.MeshStandardMaterial({
    color: 0xbfd8d4, roughness: 0.15, metalness: 0.1,
    transparent: true, opacity: 0.5, emissive: colors.glow, emissiveIntensity: 0.2,
  }));
  dome.scale.setScalar(10);
  g.add(dome);
  const leg = geo('gb_leg', () => new THREE.CylinderGeometry(0.14, 0.22, 3.2, 5));
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    const l = new THREE.Mesh(leg, tissueMat(colors.tissue));
    l.position.set(Math.cos(a) * 7, -3.5, Math.sin(a) * 7);
    l.rotation.z = Math.cos(a) * 0.5;
    l.rotation.x = -Math.sin(a) * 0.5;
    l.scale.setScalar(4);
    g.add(l);
  }
  const node = new THREE.Mesh(geo('gb_node', () => new THREE.SphereGeometry(0.22, 8, 6)), glowMat(colors.glow, 1.0));
  node.position.y = 3;
  node.scale.setScalar(8);
  g.add(node);
  g.name = 'SF_Fauna_glassback';
  return g;
}

// Wake Eel: a ribbon of tapering segments — its visual IS its motion.
function buildWakeEel(colors) {
  const g = new THREE.Group();
  const segMat = tissueMat(colors.tissue);
  const seg = geo('we_seg', () => {
    const s = new THREE.SphereGeometry(1, 8, 6);
    s.scale(0.9, 0.5, 1.3);
    return s;
  });
  for (let i = 0; i < 9; i += 1) {
    const m = new THREE.Mesh(seg, i === 0 ? glowMat(colors.glow, 0.7) : segMat);
    const w = 1 - i * 0.09;
    m.scale.setScalar(7 * w);
    m.position.set(Math.sin(i * 0.7) * 3.5, 0, -i * 4.5);
    g.add(m);
  }
  g.name = 'SF_Fauna_wake_eel';
  return g;
}

// Spindle Mother: a vertical spindle ringed with spore sacs — unmistakably a carrier.
function buildSpindleMother(colors) {
  const g = new THREE.Group();
  const spindle = new THREE.Mesh(geo('sm_spindle', () => {
    const s = new THREE.CylinderGeometry(0.35, 0.55, 4.6, 10);
    s.translate(0, 2.3, 0);
    return s;
  }), tissueMat(colors.tissue));
  spindle.scale.setScalar(8);
  g.add(spindle);
  const sacMat = glowMat(colors.glow, 0.8);
  const sac = geo('sm_sac', () => new THREE.SphereGeometry(0.34, 8, 6));
  for (let ring = 0; ring < 3; ring += 1) {
    const y = 6 + ring * 8;
    const rr = 5.5 - ring * 1.2;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + ring * 0.5;
      const s = new THREE.Mesh(sac, sacMat);
      s.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
      s.scale.setScalar(5);
      g.add(s);
    }
  }
  const crown = new THREE.Mesh(geo('sm_crown', () => new THREE.SphereGeometry(0.5, 10, 8)), glowMat(colors.glow, 1.4));
  crown.position.y = 32;
  crown.scale.setScalar(8);
  g.add(crown);
  g.name = 'SF_Fauna_spindle_mother';
  return g;
}

// Archive Crab: a low scavenger platform carrying stacked debris plates on its back.
function buildArchiveCrab(colors) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo('ac_body', () => {
    const s = new THREE.SphereGeometry(1, 12, 7);
    s.scale(1.6, 0.4, 1.2);
    return s;
  }), tissueMat(colors.tissue));
  body.scale.setScalar(7);
  g.add(body);
  const plate = geo('ac_plate', () => new THREE.BoxGeometry(1.6, 0.12, 1.1));
  const plateMat = tissueMat(colors.filament);
  for (let i = 0; i < 4; i += 1) {
    const p = new THREE.Mesh(plate, plateMat);
    p.position.set((i % 2) * 2 - 1, 2.6 + i * 0.5, -1 + i * 0.6);
    p.rotation.y = i * 0.4;
    p.rotation.z = (i % 2 ? 1 : -1) * 0.12;
    p.scale.setScalar(6);
    g.add(p);
  }
  const leg = geo('ac_leg', () => new THREE.CylinderGeometry(0.1, 0.16, 2.4, 4));
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const l = new THREE.Mesh(leg, segLegMat(colors));
    l.position.set(Math.cos(a) * 8, -2, Math.sin(a) * 8);
    l.rotation.z = Math.cos(a) * 1.0;
    l.rotation.x = -Math.sin(a) * 1.0;
    l.scale.setScalar(3);
    g.add(l);
  }
  g.name = 'SF_Fauna_archive_crab';
  return g;
}

function segLegMat(colors) {
  return tissueMat(colors.tissue);
}

// Cold Bell (AE-160): a hollow resonant bell — inverted cup of tissue over a glowing
// piezo clapper. Reads motionless between tolls.
function buildColdBell(colors) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(geo('cb_shell', () => {
    const s = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
    s.scale(1, 1.35, 1);
    return s;
  }), tissueMat(colors.tissue));
  shell.scale.setScalar(16);
  shell.rotation.x = Math.PI; // cup faces down
  g.add(shell);
  const clapper = new THREE.Mesh(geo('cb_clapper', () => new THREE.SphereGeometry(0.3, 10, 8)),
    glowMat(colors.glow, 0.7));
  clapper.position.y = -14;
  clapper.scale.setScalar(10);
  g.add(clapper);
  const ribs = geo('cb_rib', () => {
    const s = new THREE.BoxGeometry(0.06, 1.4, 0.06);
    s.translate(0, 0.7, 0);
    return s;
  });
  for (let i = 0; i < 6; i += 1) {
    const rib = new THREE.Mesh(ribs, tissueMat(colors.filament));
    const a = (i / 6) * Math.PI * 2;
    rib.position.set(Math.cos(a) * 9, -2, Math.sin(a) * 9);
    rib.rotation.z = Math.cos(a) * 0.5;
    rib.rotation.x = Math.sin(a) * 0.5;
    rib.scale.setScalar(8);
    g.add(rib);
  }
  g.name = 'SF_Fauna_cold_bell';
  return g;
}

// Suture Mite (AE-161): a palm-sized knitter — a low crab body with two spinneret cones.
function buildSutureMite(colors) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo('sm_body', () => {
    const s = new THREE.SphereGeometry(1, 10, 7);
    s.scale(1.1, 0.5, 1.5);
    return s;
  }), tissueMat(colors.tissue));
  body.scale.setScalar(3);
  g.add(body);
  const spinneret = geo('sm_spin', () => {
    const s = new THREE.ConeGeometry(0.16, 0.9, 5);
    s.rotateX(Math.PI / 2);
    return s;
  });
  for (const side of [-1, 1]) {
    const sp = new THREE.Mesh(spinneret, tissueMat(colors.filament));
    sp.position.set(side * 1.4, 0.4, -3.4);
    sp.rotation.y = side * 0.4;
    g.add(sp);
  }
  const eye = new THREE.Mesh(geo('sm_eye', () => new THREE.SphereGeometry(0.22, 6, 5)),
    glowMat(colors.glow, 0.8));
  eye.position.set(0, 0.8, 2.6);
  g.add(eye);
  g.name = 'SF_Fauna_suture_mite';
  return g;
}

// Black Sail (AE-162): an edge-on photophore sheet — a tall thin membrane that reads as
// a debris panel until it turns broadside.
function buildBlackSail(colors) {
  const g = new THREE.Group();
  const sail = new THREE.Mesh(geo('bs_sail', () => {
    const s = new THREE.SphereGeometry(1, 20, 12);
    s.scale(0.06, 1.15, 1.5);
    return s;
  }), new THREE.MeshStandardMaterial({
    color: 0x14161a, roughness: 0.4, metalness: 0.35,
    emissive: colors.glow, emissiveIntensity: 0.12,
  }));
  sail.scale.setScalar(18);
  g.add(sail);
  const cord = new THREE.Mesh(geo('bs_cord', () => {
    const s = new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6);
    s.rotateX(Math.PI / 2);
    return s;
  }), tissueMat(colors.filament));
  cord.scale.setScalar(14);
  g.add(cord);
  g.name = 'SF_Fauna_black_sail';
  return g;
}

// Stone Lung (AE-163): an asteroid that breathes — a rock-textured mound with a vent
// throat that cycles open on the exhale period.
function buildStoneLung(colors) {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(geo('sl_mound', () => {
    const s = new THREE.DodecahedronGeometry(1, 1);
    s.scale(1.2, 0.6, 1.2);
    return s;
  }), new THREE.MeshStandardMaterial({
    color: 0x5c564d, roughness: 0.95, metalness: 0.05,
    emissive: colors.tissue, emissiveIntensity: 0.06,
  }));
  mound.scale.setScalar(22);
  g.add(mound);
  const throat = new THREE.Mesh(geo('sl_throat', () => {
    const s = new THREE.CylinderGeometry(0.4, 0.9, 0.7, 12);
    s.translate(0, 0.35, 0);
    return s;
  }), tissueMat(colors.tissue));
  throat.scale.setScalar(18);
  throat.position.y = 10;
  g.add(throat);
  const wetCore = new THREE.Mesh(geo('sl_core', () => new THREE.SphereGeometry(0.3, 10, 8)),
    glowMat(colors.glow, 0.5));
  wetCore.position.y = 14;
  wetCore.scale.setScalar(16);
  g.add(wetCore);
  g.name = 'SF_Fauna_stone_lung';
  return g;
}

// Pilgrim Spine (AE-164): a linked vertebra segment — wedge head, cord tail; a line of
// them reads as a procession when chainFollowed.
function buildPilgrimSpine(colors) {
  const g = new THREE.Group();
  const wedge = new THREE.Mesh(geo('ps_wedge', () => {
    const s = new THREE.ConeGeometry(0.8, 2.4, 6);
    s.rotateX(Math.PI / 2);
    return s;
  }), tissueMat(colors.tissue));
  wedge.scale.setScalar(7);
  g.add(wedge);
  const cord = new THREE.Mesh(geo('ps_cord', () => {
    const s = new THREE.CylinderGeometry(0.12, 0.22, 2.2, 6);
    s.rotateX(-Math.PI / 2);
    s.translate(0, 0, -1.4);
    return s;
  }), tissueMat(colors.filament));
  cord.scale.setScalar(8);
  g.add(cord);
  const nodeGlow = new THREE.Mesh(geo('ps_glow', () => new THREE.SphereGeometry(0.2, 8, 6)),
    glowMat(colors.glow, 1.0));
  nodeGlow.position.set(0, 1.2, 0);
  nodeGlow.scale.setScalar(8);
  g.add(nodeGlow);
  g.name = 'SF_Fauna_pilgrim_spine';
  return g;
}

const BUILDERS = {
  veil_ray: (c, s) => buildVeilRay(c),
  needle_swarm: (c, s) => buildNeedleSwarm(c, s),
  blind_shepherd: (c, s) => buildBlindShepherd(c),
  hull_leech: (c, s) => buildHullLeech(c),
  lantern_cyst: (c) => buildLanternCyst(c),
  casket_worm: (c) => buildCasketWorm(c),
  bristle_ram: (c) => buildBristleRam(c),
  mourning_kite: (c) => buildMourningKite(c),
  anchor_beast: (c) => buildAnchorBeast(c),
  furnace_maw: (c) => buildFurnaceMaw(c),
  glassback: (c) => buildGlassback(c),
  wake_eel: (c) => buildWakeEel(c),
  spindle_mother: (c) => buildSpindleMother(c),
  archive_crab: (c) => buildArchiveCrab(c),
  // AE-112: hull-scale carrier — the spindle-mother body plan at vessel scale.
  void_carrier: (c) => { const m = buildSpindleMother(c); m.scale.setScalar(3.6); return m; },
  // ── Phase 16 species (AE-160..AE-164) ──
  cold_bell: (c) => buildColdBell(c),
  suture_mite: (c) => buildSutureMite(c),
  black_sail: (c) => buildBlackSail(c),
  stone_lung: (c) => buildStoneLung(c),
  pilgrim_spine: (c) => buildPilgrimSpine(c),
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
    case 'lung_bladder':
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
    case 'nerve_lace':
    case 'false_cable': {
      // Phase 16 B-table: a cable-run of filament strands crossing like wiring — for
      // false_cable the cable is the lure (it reads as dead conduit until close).
      const strand = geo('gr_lace', () => {
        const s = new THREE.CylinderGeometry(0.05, 0.09, 2.8, 5);
        s.translate(0, 1.4, 0);
        return s;
      });
      for (let i = 0; i < 8; i += 1) {
        const t = new THREE.Mesh(strand, i % 2 ? fil : tissue);
        const a = (i / 8) * Math.PI * 2;
        t.position.set(Math.cos(a) * r * 0.5, 0, Math.sin(a) * r * 0.5);
        t.rotation.z = Math.cos(a) * 1.0;
        t.rotation.x = -Math.sin(a) * 1.0;
        t.scale.setScalar(r * 0.7);
        g.add(t);
      }
      if (moduleId === 'false_cable') {
        const tip = new THREE.Mesh(geo('gr_lace_tip', () => new THREE.SphereGeometry(0.12, 6, 5)), glow);
        tip.position.y = r * 1.2;
        tip.scale.setScalar(r * 0.4);
        g.add(tip);
      }
      break;
    }
    case 'red_core': {
      // B-table: a hard glowing node — the field's reactor organ.
      const core = new THREE.Mesh(geo('gr_redcore', () => new THREE.SphereGeometry(0.62, 14, 10)),
        glowMat(0xff3b2f, 1.8));
      core.scale.setScalar(r * 0.9);
      core.position.y = r * 0.5;
      g.add(core);
      const cage = new THREE.Mesh(geo('gr_redcage', () => new THREE.TorusGeometry(0.8, 0.1, 6, 16)), fil);
      cage.rotation.x = Math.PI / 2;
      cage.scale.setScalar(r * 0.8);
      g.add(cage);
      break;
    }
    case 'memory_knot': {
      // B-table: a dense folded knot — the site’s archive organ.
      const knot = new THREE.Mesh(geo('gr_knot', () => new THREE.TorusKnotGeometry(0.55, 0.2, 48, 8)), tissue);
      knot.scale.setScalar(r * 0.75);
      knot.position.y = r * 0.6;
      g.add(knot);
      const bead = new THREE.Mesh(geo('gr_knot_bead', () => new THREE.SphereGeometry(0.16, 8, 6)), glow);
      bead.position.y = r * 0.6;
      bead.scale.setScalar(r * 0.6);
      g.add(bead);
      break;
    }
    case 'mirror_membrane': {
      // B-table: a flat mirrored sheet standing off the hull — phantom-echo organ.
      const pane = new THREE.Mesh(geo('gr_mirror', () => {
        const s = new THREE.SphereGeometry(1, 16, 8);
        s.scale(1, 0.05, 1);
        return s;
      }), new THREE.MeshStandardMaterial({
        color: 0x2a2f38, roughness: 0.25, metalness: 0.7,
        emissive: 0x223344, emissiveIntensity: 0.2,
      }));
      pane.scale.setScalar(r);
      pane.position.y = r * 0.3;
      g.add(pane);
      break;
    }
    case 'dead_crown': {
      // B-table: the severed-state crown — a ring of dried spike blades, no glow.
      const spike = geo('gr_deadspike', () => {
        const s = new THREE.ConeGeometry(0.14, 2.6, 5);
        s.translate(0, 1.3, 0);
        return s;
      });
      const dead = new THREE.MeshStandardMaterial({
        color: 0x6e6a5e, roughness: 0.95, metalness: 0.0,
      });
      for (let i = 0; i < 9; i += 1) {
        const s2 = new THREE.Mesh(spike, dead);
        const a = (i / 9) * Math.PI * 2;
        s2.position.set(Math.cos(a) * r * 0.55, 0, Math.sin(a) * r * 0.55);
        s2.rotation.z = Math.cos(a) * 0.8;
        s2.rotation.x = -Math.sin(a) * 0.8;
        s2.scale.setScalar(r * 0.7);
        g.add(s2);
      }
      break;
    }
    case 'silt_root': {
      // B-table: a low mineral root ridge — the underground half of the colony.
      const ridge = geo('gr_ridge', () => {
        const s = new THREE.BoxGeometry(0.5, 0.5, 2.2);
        s.translate(0, 0.25, 0);
        return s;
      });
      for (let i = 0; i < 4; i += 1) {
        const seg = new THREE.Mesh(ridge, tissue);
        const a = i * 0.7;
        seg.position.set(Math.cos(a) * r * 0.4, 0, Math.sin(a) * r * 0.4);
        seg.rotation.y = a;
        seg.scale.setScalar(r * 0.75);
        g.add(seg);
      }
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
