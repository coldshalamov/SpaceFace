import { Quaternion } from 'three';
import { fitLegacyMultiroleCockpit } from './modularMultiroleCockpitPlacement.js';
import { fitLegacyMultiroleFins } from './modularMultiroleFinPlacement.js';

// Candidate seats for the exact released legacy hulls and V5 cockpit. These are
// deliberately not connected to composition until the assembled combinations
// have been visually reviewed. A changed package or marker must keep its own fit.
const PROFILES = Object.freeze({
  SF_HULL_MULTIROLE: {
    url: 'hulls/hull_multirole.glb',
    hash: '5d61b94af689c4e3901111a88ec65e8d6b9d00b8402bc763dd4a28d6048a5cb8',
    normal: 0.14010628434949612, cockpit: [1.1, 0, 0.66],
    engine: [-4.7, 0.62, 0.10], fin: [-0.8, 1.7, 0.05], leftSign: 1,
    seatY: 0.2520811811864766, seatQ: [0, 0, -0.14188997085178007, 0.9898824355304426],
    finY: null, finZ: 0.15, fins: ['SF_FIN_WEDGE', 'SF_FIN_DELTA', 'SF_PART_FIN_SWEPT_SMUGGLER'],
  },
  SF_HULL_STARTER: {
    url: 'hulls/hull_starter.glb',
    hash: '8ce8f7c5a4d598472db2971bc4f5016abe4fc6cced35d566b8744d5cd695cd43',
    normal: 1.72 / 10.927536487579346, cockpit: [1.1, 0, -0.66],
    engine: [-4.7, 0.62, -0.10], fin: [-0.8, 1.7, -0.05], leftSign: -1,
    seatY: 0.138031, seatQ: [0, 0, 0, 1], finY: null, finZ: 0.20,
    fins: ['SF_FIN_WEDGE', 'SF_FIN_DELTA', 'SF_PART_FIN_SWEPT_SMUGGLER'],
  },
  SF_HULL_FRIGATE: {
    url: 'hulls/hull_frigate.glb',
    hash: 'af28ac7bce455efb8fd387751a60b025c01f2291726ed6574c4dbfe0354937de',
    normal: 1.72 / 13.044034957885742, cockpit: [1.76, 0, 0.55],
    engine: [-5.06, 0.816, 0.06], fin: [-0.88, 2.208, 0.04], leftSign: 1,
    seatY: 0.232278, seatQ: [0, 0, 0, 1], finY: 0.12527444143505666, finZ: 0.12,
    fins: ['SF_FIN_WEDGE', 'SF_FIN_DELTA', 'SF_PART_FIN_SWEPT_SMUGGLER'],
  },
});
const ENGINE_HASH = '904936d385f73d4f0bf95c669e6c5a3a051d7299577d0eca24266a2ce77f775e';
const COCKPIT_HASH = 'bb174bbc411f41e30fbc65a13171284006d475476dac0a6e6b826fcc9105e461';
const FINS = Object.freeze({
  SF_FIN_WEDGE: ['fins/fin_wedge.glb', '5f7c799e2c3d126474057eddf05065ad0b30ed680a497b8a1d8eca09ad60ac3e'],
  SF_FIN_DELTA: ['fins/fin_delta.glb', '990e17bee99feed80f7d3894acdc9620908364c4de4c80d0df0b8dc5ed6f5e69'],
  SF_PART_FIN_SWEPT_SMUGGLER: ['fins/fin_swept_smuggler.glb', '5fe85c7fc4ad599ba82ebc390d7e7b357eb672a8082bbe32b259e24f7b0535f0'],
});
const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 1e-6;
const MOUNT_KEYS = Object.freeze({
  MOUNT_COCKPIT: 'cockpit', MOUNT_ENGINE_L: 'engine_l', MOUNT_ENGINE_R: 'engine_r',
  MOUNT_FIN_L: 'fin_l', MOUNT_FIN_R: 'fin_r',
  cockpit: 'cockpit', engine_l: 'engine_l', engine_r: 'engine_r', fin_l: 'fin_l', fin_r: 'fin_r',
});
const mountKey = placement => MOUNT_KEYS[placement?.mountKey] || null;

function exactPackage(record, assetId, url, hash) {
  return record?.assetId === assetId && record.url === `assets/ships/release/parts/${url}`
    && record.renderPackage?.contentHash === hash;
}

function identityMount(p) {
  const q = p?.quaternion, s = p?.mountScale;
  return !!q && near(q.x, 0) && near(q.y, 0) && near(q.z, 0) && near(Math.abs(q.w), 1)
    && Array.isArray(s) && s.length === 3 && s.every(n => near(n, 1));
}

function matchesCockpit(p, profile) {
  return mountKey(p) === 'cockpit' && identityMount(p) && p.position?.length === 3
    && profile.cockpit.every((n, i) => near(p.position[i], n * profile.normal));
}

function matchesPair(placements, slot, xyz, profile) {
  if (!Array.isArray(placements) || placements.length !== 2) return false;
  const seen = new Set();
  for (const p of placements) {
    const key = mountKey(p);
    const side = key === `${slot}_l` ? -1 : key === `${slot}_r` ? 1 : 0;
    if (!side || seen.has(side) || !identityMount(p) || p.position?.length !== 3
      || !near(p.position[0], xyz[0] * profile.normal)
      || !near(p.position[1], -side * profile.leftSign * xyz[1] * profile.normal)
      || !near(p.position[2], xyz[2] * profile.normal)) return false;
    seen.add(side);
  }
  return seen.size === 2;
}

/**
 * Trial a complete V5 assembly fit or return `placements` unchanged. The check
 * is intentionally atomic: altered, asymmetric, missing or modded markers must
 * not receive only half of a legacy correction.
 */
export function fitLegacyModularMounts(hull, cockpit, engine, fin, placements) {
  const profile = PROFILES[hull?.assetId], finIdentity = FINS[fin?.assetId];
  if (!profile || !finIdentity || !profile.fins.includes(fin.assetId)
    || !exactPackage(hull, hull.assetId, profile.url, profile.hash)
    || cockpit?.assetId !== 'SF_COCKPIT_RECESSED'
    || (cockpit.metadata || cockpit.blueprint?.metadata)?.spacefaceCockpitDesign !== 'recessed-v5'
    || cockpit.renderPackage?.contentHash !== COCKPIT_HASH
    || !exactPackage(engine, 'SF_ENGINE_ION_SMALL', 'engines/engine_ion_small.glb', ENGINE_HASH)
    || !exactPackage(fin, fin.assetId, finIdentity[0], finIdentity[1])
    || !matchesCockpit(placements?.cockpit, profile)
    || !matchesPair(placements?.engines, 'engine', profile.engine, profile)
    || !matchesPair(placements?.fins, 'fin', profile.fin, profile)) return placements;

  const correctedEngines = placements.engines.map(p => ({
    ...p, position: [p.position[0], p.position[2], mountKey(p) === 'engine_l' ? -0.20 : 0.20],
  }));
  if (hull.assetId === 'SF_HULL_MULTIROLE' && fin.assetId === 'SF_PART_FIN_SWEPT_SMUGGLER') {
    // Keep the previously reviewed, signature-gated cockpit and swept-fin fit.
    const fittedFins = fitLegacyMultiroleFins(hull, cockpit, fin, placements.fins);
    const fittedCockpit = fitLegacyMultiroleCockpit(hull, cockpit, fin, placements.cockpit, () => placements.fins);
    if (fittedFins === placements.fins || fittedCockpit === placements.cockpit) return placements;
    return { ...placements, cockpit: fittedCockpit, engines: correctedEngines, fins: fittedFins };
  }
  return {
    ...placements,
    cockpit: { ...placements.cockpit, position: [placements.cockpit.position[0], profile.seatY, 0],
      quaternion: new Quaternion().fromArray(profile.seatQ) },
    engines: correctedEngines,
    fins: placements.fins.map(p => ({ ...p,
      position: [p.position[0], profile.finY ?? p.position[2], mountKey(p) === 'fin_l' ? -profile.finZ : profile.finZ],
    })),
  };
}
