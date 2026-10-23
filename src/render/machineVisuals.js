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

// A working machine DEPLOYS its tool: the arm/spindle eases from stowed to working pose
// while `isWorking(live)` reads the sim's work flag true, then stows again (board 384).
// `apply(deploy, motionTime, liveEntity)` poses the parts; deploy is a smoothed 0..1.
function registerWorkMotion(entity, isWorking, apply) {
  let motionTime = 0;
  let deploy = 0;
  return (arg1, arg2) => {
    let dt = 0.016;
    let live = null;
    if (typeof arg1 === 'number') {
      dt = arg1;
      live = arg2;
    } else if (arg1 && typeof arg1 === 'object') {
      live = arg1;
      if (typeof arg2 === 'number') dt = arg2;
    } else if (typeof arg2 === 'number') {
      dt = arg2;
    }
    const current = (live && typeof live === 'object') ? live : (entity && typeof entity === 'object' ? entity : null);
    if (typeof arg2 === 'number' && typeof arg1 !== 'number') {
      motionTime = arg2;
    } else {
      motionTime += Math.max(0, Math.min(1, dt));
    }
    const step = Math.max(0, Math.min(1, dt)) * 3.2;
    deploy += ((isWorking(current) ? 1 : 0) - deploy) * Math.min(1, step);
    apply(deploy, motionTime, current);
  };
}

// A slim articulated arm segment that can stow folded and extend while working.
function buildToolArm(parent, { pivot, stowRotX = 0.5, workRotX = -0.6, length = 16, tipScale = 5, tipIntensity = 2.0 } = {}) {
  const root = new THREE.Group();
  root.position.set(pivot.x || 0, pivot.y || 0, pivot.z || 0);
  if (pivot.rotY != null) root.rotation.y = pivot.rotY;
  const arm = new THREE.Mesh(geo('tool_arm_seg', () => {
    const s = new THREE.BoxGeometry(0.14, 0.1, 1.6);
    s.translate(0, 0, -0.8);
    return s;
  }), seamMat());
  arm.scale.setScalar(length / 1.6);
  const tipMat = lightMat(tipIntensity);
  const tip = new THREE.Mesh(geo('tool_arm_tip', () => new THREE.OctahedronGeometry(0.16, 0)), tipMat);
  tip.position.z = -length;
  tip.scale.setScalar(tipScale);
  root.add(arm, tip);
  parent.add(root);
  return { root, tipMat, apply: (t) => { root.rotation.x = stowRotX + (workRotX - stowRotX) * t; } };
}

// A telescoping spindle that extends along -Y while working (drill/weld/read).
function buildToolSpindle(parent, { length = 18, y = 0, tipScale = 5, tipIntensity = 2.4 } = {}) {
  const rod = new THREE.Mesh(geo('tool_spindle', () => {
    const s = new THREE.CylinderGeometry(0.07, 0.05, 1, 6);
    s.translate(0, -0.5, 0);
    return s;
  }), metalMat());
  rod.position.y = y;
  const tipMat = lightMat(tipIntensity);
  const tip = new THREE.Mesh(geo('tool_spindle_tip', () => new THREE.SphereGeometry(0.12, 8, 6)), tipMat);
  tip.position.y = y;
  tip.scale.setScalar(tipScale);
  parent.add(rod, tip);
  return { tipMat, apply: (t) => {
    const len = Math.max(0.001, length * t);
    rod.scale.y = len;
    rod.visible = tip.visible = t > 0.02;
    tip.position.y = y - len;
  } };
}

// ── Machine entity bodies ────────────────────────────────────────────────────────────────

// Surveyor Prism: a slowly tumbling tetrahedral instrument — pure procedure, no menace.
// Its scanner arm unfolds while the inspection sweep winds toward the ping (row 384).
function buildSurveyorPrism(entity = null) {
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
  const scanArm = buildToolArm(g, { pivot: { y: 4 }, length: 14 });
  g.name = 'SF_Machine_surveyor_prism';
  const scanPeriod = machineKindById('surveyor_prism')?.scanPeriodS || 14;
  g.userData.updateAuthoredMotion = registerWorkMotion(entity,
    (live) => {
      const sweep = live?.data?.machine?.sweepT;
      return typeof sweep === 'number' && sweep > scanPeriod * 0.55;
    },
    (t, time) => {
      scanArm.apply(t);
      scanArm.tipMat.emissiveIntensity = 1.2 + t * (1.2 + Math.sin(time * 9) * 0.4);
      scanArm.root.rotation.y = time * 0.7;
    });
  return g;
}

// Custodian: a low radial shell with articulated maintenance arms — reads industrious.
// While `machine.repairing` the four arms pitch down to the work face and the centre
// repair spindle telescopes out of the shell (row 384).
function buildCustodian(entity = null) {
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
  const tipMat = lightMat(1.8);
  const tips = [];
  const arms = [];
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const m = new THREE.Mesh(arm, seamMat());
    m.position.set(Math.cos(a) * 12, -3, Math.sin(a) * 12);
    m.rotation.y = -a;
    m.scale.setScalar(8);
    g.add(m);
    arms.push(m);
    const tip = new THREE.Mesh(geo('cust_tip', () => new THREE.SphereGeometry(0.14, 8, 6)), tipMat);
    tip.name = 'cust_tip';
    // Child of the arm: the tip rides the deploy pitch instead of floating at the
    // flat pose. Local z -1.75 lands where the world offset -14 used to put it.
    tip.position.set(0, 0, -1.75);
    tip.scale.setScalar(0.75);
    m.add(tip);
    tips.push(tip);
  }
  const eye = new THREE.Mesh(geo('cust_eye', () => new THREE.SphereGeometry(0.22, 8, 6)), lightMat(1.5));
  eye.position.y = 5;
  eye.scale.setScalar(10);
  g.add(eye);
  const spindle = buildToolSpindle(g, { length: 15, y: -4 });
  g.name = 'SF_Machine_custodian';

  g.userData.updateAuthoredMotion = registerWorkMotion(entity,
    (live) => Boolean(live?.data?.machine?.repairing),
    (deploy, motionTime) => {
      const targetIntensity = 0.25 + deploy * (1.55 + (Math.sin(motionTime * 6) * 0.5 + 0.5) * 0.6);
      tipMat.emissiveIntensity = targetIntensity;
      for (const t of tips) {
        if (t.material) t.material.emissiveIntensity = targetIntensity;
      }
      for (const a of arms) a.rotation.x = 0.35 - deploy * 0.9;
      spindle.apply(deploy);
      spindle.tipMat.emissiveIntensity = 0.4 + deploy * 2.0;
    });

  return g;
}

// Gate Auditor: a tall open ring — a standing frame that waits. Read: customs arch.
// While a hull sits inside its interrogate radius the audit bar sweeps the ring
// opening (`machine.interrogating`, written by the sim tick) (row 384).
function buildGateAuditor(entity = null) {
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
  const scanMat = lightMat(0.0);
  const scanBar = new THREE.Mesh(geo('aud_scanbar', () => new THREE.BoxGeometry(2, 0.04, 0.04)), scanMat);
  scanBar.position.y = 6;
  scanBar.scale.set(0.001, 18, 18);
  scanBar.visible = false;
  g.add(scanBar);
  g.name = 'SF_Machine_gate_auditor';
  g.userData.updateAuthoredMotion = registerWorkMotion(entity,
    (live) => Boolean(live?.data?.machine?.interrogating),
    (t, time) => {
      scanBar.visible = t > 0.02;
      // The bar grows to span the ring opening and sweeps around its centre.
      scanBar.scale.set(Math.max(0.001, 18 * t), 18, 18);
      scanBar.rotation.y = time * 1.9;
      scanMat.emissiveIntensity = t * (1.4 + Math.sin(time * 11) * 0.5);
    });
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
// While `machine.working` the weld spindle thrusts forward through the cradle and
// the gantry arms flex open (row 384).
function buildMason(entity = null) {
  const g = new THREE.Group();
  const arm = geo('msn_arm', () => {
    const s = new THREE.TorusGeometry(1.0, 0.09, 6, 24, Math.PI);
    return s;
  });
  const gantry = [];
  for (let i = 0; i < 2; i += 1) {
    const a = new THREE.Mesh(arm, metalMat());
    a.scale.setScalar(14);
    a.rotation.z = i === 0 ? 0 : Math.PI;
    a.position.x = i === 0 ? -2 : 2;
    g.add(a);
    gantry.push(a);
  }
  const weldMat = lightMat(2.8);
  const weld = new THREE.Mesh(geo('msn_weld', () => new THREE.SphereGeometry(0.12, 8, 6)), weldMat);
  weld.name = 'msn_weld';
  weld.scale.setScalar(14);
  g.add(weld);
  const spindle = buildToolSpindle(g, { length: 20, y: 0, tipScale: 6 });
  g.name = 'SF_Machine_mason';

  g.userData.updateAuthoredMotion = registerWorkMotion(entity,
    (live) => Boolean(live?.data?.machine?.working),
    (deploy, motionTime) => {
      const targetIntensity = 0.25 + deploy * (2.55 + (Math.sin(motionTime * 8) * 0.5 + 0.5) * 0.8);
      weldMat.emissiveIntensity = targetIntensity;
      if (weld.material) weld.material.emissiveIntensity = targetIntensity;
      gantry[0].rotation.y = -deploy * 0.5;
      gantry[1].rotation.y = deploy * 0.5;
      spindle.apply(deploy);
      spindle.tipMat.emissiveIntensity = 0.4 + deploy * 2.4;
      weld.position.z = deploy * -14;
    });

  return g;
}

// Executor: the revocation enforcer — a narrow dark dart with one cold ring aft.
// While `machine.awakened` the purge spindle drives forward out of the nose (row 384).
function buildExecutor(entity = null) {
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
  const purge = buildToolArm(g, { pivot: { z: 8 }, stowRotX: Math.PI / 2, workRotX: 0, length: 20, tipIntensity: 2.8 });
  g.name = 'SF_Machine_executor';
  g.userData.updateAuthoredMotion = registerWorkMotion(entity,
    (live) => Boolean(live?.data?.machine?.awakened),
    (t, time) => {
      purge.apply(t);
      purge.tipMat.emissiveIntensity = 0.4 + t * (2.4 + Math.sin(time * 14) * 0.6);
    });
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
// While it has a claimed workpiece (`machine.collectId`) the mouth opens and the
// collector spine extends toward the staged body (row 384).
function buildDebrisSorter(entity = null) {
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
  g.userData.updateAuthoredMotion = registerWorkMotion(entity,
    (live) => live?.data?.machine?.collectId != null,
    (t, time) => {
      spine.scale.z = 14 * (1 + t * 0.8);
      mouth.scale.x = mouth.scale.y = 14 * (1 + t * 0.25);
      mouth.position.z = t * 6;
      eye.material.emissiveIntensity = 1.5 + t * (1.0 + Math.sin(time * 10) * 0.4);
    });
  return g;
}

// Sleeping Jury: three joined sealed verdict pods — a body that convenes, not fights.
// While `machine.awake` the seal lifts off the pods and glows like an open session
// (row 384).
function buildSleepingJury(entity = null) {
  const g = new THREE.Group();
  const pod = geo('sj_pod', () => {
    const s = new THREE.SphereGeometry(0.5, 14, 10);
    s.scale(1, 0.7, 1);
    return s;
  });
  const pods = [];
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    const p = new THREE.Mesh(pod, metalMat());
    p.position.set(Math.cos(a) * 10, 0, Math.sin(a) * 10);
    p.scale.setScalar(12);
    g.add(p);
    pods.push(p);
  }
  const sealMat = lightMat(0.5);
  const seal = new THREE.Mesh(geo('sj_seal', () => new THREE.TorusGeometry(1.3, 0.05, 6, 36)), sealMat);
  seal.rotation.x = Math.PI / 2;
  seal.scale.setScalar(12);
  g.add(seal);
  g.name = 'SF_Machine_sleeping_jury';
  g.userData.updateAuthoredMotion = registerWorkMotion(entity,
    (live) => Boolean(live?.data?.machine?.awake),
    (t, time) => {
      seal.position.y = t * 6;
      sealMat.emissiveIntensity = 0.5 + t * (1.6 + Math.sin(time * 5) * 0.4);
      for (let i = 0; i < pods.length; i += 1) {
        pods[i].rotation.z = t * 0.35 * (i % 2 ? 1 : -1);
      }
    });
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

export function buildMachineMesh(entityOrKind) {
  const kindId = typeof entityOrKind === 'string'
    ? entityOrKind
    : (entityOrKind?.data?.machine?.kind || entityOrKind?.kind || entityOrKind?.machineKind);
  const kind = machineKindById(kindId);
  if (!kind) return null;
  const builder = MACHINE_BUILDERS[kind.id];
  const root = builder ? builder(typeof entityOrKind === 'object' ? entityOrKind : null) : null;
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
      // The boundary grows to the field radius; the reference needle stays human-scale.
      needle.scale.setScalar(Math.min(r, 26) * 0.5);
      g.add(needle);
      const ref = new THREE.Mesh(geo('mp_ref', () => new THREE.TorusGeometry(1, 0.004, 6, 96)), lightMat(1.2));
      ref.rotation.x = Math.PI / 2;
      ref.scale.setScalar(r);
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
