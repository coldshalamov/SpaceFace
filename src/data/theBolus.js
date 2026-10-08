// The Bolus — interior sector data. Pure. No sectors.js import. No Math.random.
// Layout, cone, iris, and latch rules are the single source for the spawner and the test.

import { hash32, mulberry32 } from '../core/rng.js';

export const BOLUS_SECTOR_ID = 'sector_the_bolus';
export const BOLUS_STATION_ID = 'station_bolus_rib';
export const BOLUS_MAP = Object.freeze({ x: 2, y: 10 });
export const BOLUS_WORLD_RADIUS = 3200;

export const BOLUS_PALETTE = Object.freeze({
  key: 0xffc4b0,
  rim: 0x7a3040,
  fill: 0xc49890,
  ambient: 0x684844,
  fog: 0x14060a,
  fogDensity: 0.0022,
  nebulaTint: 0x2a0810,
  dust: 0x8a4038,
});

export const BOLUS_CONE_RANGE = 280;
export const BOLUS_CONE_COS = Math.cos((18 * Math.PI) / 180);
export const BOLUS_IRIS_PERIOD = 20;
export const BOLUS_IRIS_OPEN_AT = 2;
export const BOLUS_IRIS_WINDOW = 6;
export const BOLUS_IRIS_Z = 400;
export const BOLUS_ACID_X0 = 200;
export const BOLUS_ACID_X1 = 700;
export const BOLUS_WALL_X = -700;

export const BOLUS_CHARON_GATE_POS = Object.freeze({ x: 0, z: 3936 });
export const BOLUS_ASHFALL_GATE_POS = Object.freeze({ x: -4034, z: -2017 });
export const BOLUS_MOUTH_POS = Object.freeze({ x: 0, z: -2624 });
export const BOLUS_COUGH_POS = Object.freeze({ x: 2347, z: 1173 });

export const BOLUS_LATCHES = Object.freeze({
  nerve: Object.freeze({ seconds: 3, flag: 'bolus:sampled', cargo: 'cmdty_live_specimen', qty: 1, exposure: 0.08, toast: 'The cord gives. Concord will call it a specimen.' }),
  valve: Object.freeze({ seconds: 1.2, flagPrefix: 'bolus:valve:', event: 'suture', toast: 'The lip keeps the stitch.' }),
  bezoar: Object.freeze({ seconds: 1, flagPrefix: 'bolus:bezoar:', cargo: 'cmdty_crystal_lumin', qty: 1, toast: 'Grit. The gut would not keep it.' }),
  blister: Object.freeze({ seconds: 2, flag: 'bolus:blister', cargo: 'cmdty_medical', qty: 1, toast: 'The blister drinks clean. A dressing, still warm.' }),
  cyst: Object.freeze({ seconds: 1.2, flag: 'bolus:cyst', cargo: 'cmdty_crystal_lumin', qty: 1, toast: 'The cyst gives up a stone and stays on the line.' }),
  polyp: Object.freeze({ seconds: 3, flag: 'bolus:polyp', cargo: 'cmdty_medical', qty: 1, exposure: 0.05, toast: 'The polyp pays a dressing. The hull keeps a little of it.' }),
  concretion: Object.freeze({ seconds: 1, flag: 'bolus:concretion', cargo: 'cmdty_crystal_lumin', qty: 1, toast: 'A pebble comes off the scrap. The heap stays.' }),
  papilla: Object.freeze({ seconds: 1, flag: 'bolus:papilla', toast: 'The tooth goes sour. It still lies.' }),
  hush: Object.freeze({ seconds: 2, until: 'bolus:hushUntil', dur: 12, toast: 'The slab holds. Twelve seconds of quiet.' }),
  spur: Object.freeze({ seconds: 0.8, until: 'bolus:spurUntil', dur: 6, toast: 'The nearby drums go deaf to thrust.' }),
  frenum: Object.freeze({ seconds: 1, until: 'bolus:frenumUntil', dur: 12, toast: 'The mouth only points. It does not snatch.' }),
  comb: Object.freeze({ seconds: 1.5, until: 'bolus:acidQuietUntil', dur: 8, toast: 'The trench stops biting. It does not stop watching.' }),
  pleat: Object.freeze({ seconds: 0.5, until: 'bolus:pleatUntil', dur: 9, event: 'pleat', toast: 'The pleat coughs you up-tract.' }),
});

const LABELS = Object.freeze({
  bolus_knob: 'Cartilage Knob',
  bolus_tendon: 'Tract Tendon',
  bolus_tooth: 'False Tooth',
  bolus_tendril: 'Filament Curtain',
  bolus_lantern: 'Gall Lantern',
  bolus_fingerling: 'Fingerling',
  bolus_louse: 'Coin-Louse',
  bolus_drum: 'Blind Drum',
  bolus_valve: 'Valve Lip',
  bolus_suture: 'White Suture',
  bolus_glove: 'Glove-Tick',
  bolus_hauler: 'Digesting Hauler',
  bolus_rib: 'Loose Rib',
  bolus_bezoar: 'Bezoar',
  bolus_mite: 'Line Mite',
  bolus_nerve: 'Nerve Cord',
  bolus_ring: 'Stitch-Ring',
  bolus_hairball: 'Hairball',
  bolus_baleen: 'Baleen Toll',
  bolus_floater: 'Gall Sac',
  bolus_blister: 'Gall Blister',
  bolus_cyst: 'Milk Cyst',
  bolus_polyp: 'Polyp',
  bolus_concretion: 'Cough Concretion',
  bolus_papilla: 'Sour Papilla',
  bolus_hush: 'Iris Pin',
  bolus_spur: 'Drum Spur',
  bolus_frenum: 'Mouth Frenum',
  bolus_comb: 'Filter Comb',
  bolus_uvula: 'Road Uvula',
  bolus_crook: 'Louse Crook',
  bolus_pleat: 'Tract Pleat',
});

export function bolusLabel(speciesId) {
  return LABELS[speciesId] || 'Tissue';
}

export function bolusInCone(px, pz, rot, tx, tz, range = BOLUS_CONE_RANGE, cosMin = BOLUS_CONE_COS) {
  const dx = tx - px;
  const dz = tz - pz;
  const dist = Math.hypot(dx, dz);
  if (!(dist > 0) || dist > range) return false;
  const fx = Math.cos(rot);
  const fz = Math.sin(rot);
  return (dx * fx + dz * fz) / dist >= cosMin;
}

export function bolusIrisOpen(simTime, period = BOLUS_IRIS_PERIOD, openAt = BOLUS_IRIS_OPEN_AT, window = BOLUS_IRIS_WINDOW) {
  const t = Number(simTime) || 0;
  const span = period > 0 ? period : 20;
  const m = ((t % span) + span) % span;
  return m >= openAt && m < openAt + window;
}

export function bolusResolvedSpec(spec, flags) {
  if (spec && spec.role === 'valve' && flags && flags[`bolus:valve:${spec.key}`]) {
    return {
      ...spec,
      role: 'suture',
      speciesId: 'bolus_suture',
      name: LABELS.bolus_suture,
      dynamic: false,
      mass: 2400,
    };
  }
  return spec;
}

/** One-shot latch commit. Mutates flags. Returns null when the hold is short or already spent. */
export function commitBolusLatch(flags, role, key, held, simTime) {
  const rule = BOLUS_LATCHES[role];
  if (!rule || !(held >= rule.seconds)) return null;
  const flag = rule.flag || (rule.flagPrefix ? `${rule.flagPrefix}${key}` : null);
  if (flag && flags[flag]) return null;
  if (rule.until) {
    const until = Number(flags[rule.until]) || 0;
    if (until > simTime) return null;
  }
  if (flag) flags[flag] = true;
  if (rule.until) flags[rule.until] = simTime + rule.dur;
  return {
    cargo: rule.cargo || null,
    qty: rule.qty || 0,
    exposure: rule.exposure || 0,
    toast: rule.toast || null,
    event: rule.event || null,
  };
}

function body(role, speciesId, x, z, extra) {
  const dynamic = !!(extra && extra.dynamic);
  return {
    key: (extra && extra.key) || role,
    role,
    speciesId,
    name: (extra && extra.name) || LABELS[speciesId] || role,
    x,
    z,
    dynamic,
    mass: extra && extra.mass != null ? extra.mass : (dynamic ? 140 : 2400),
    radius: extra && extra.radius != null ? extra.radius : (dynamic ? 12 : 22),
    rot: extra && extra.rot ? extra.rot : 0,
    phase: extra && extra.phase ? extra.phase : 0,
  };
}

export function planBolusLayout(seed) {
  const rng = mulberry32(hash32(seed == null ? 1 : seed, BOLUS_SECTOR_ID, 'bolus-layout'));
  const bezoarMass = [0, 1, 2, 3].map(() => 80 + Math.floor(rng() * 161));
  const drumRot = [0, 1, 2, 3].map(() => rng() * Math.PI * 2);
  const fingerOff = [0, 1, 2, 3, 4, 5, 6, 7].map(() => ({ x: (rng() - 0.5) * 90, z: (rng() - 0.5) * 90 }));
  const floaterPhase = [0, 1, 2, 3, 4, 5].map(() => rng() * Math.PI * 2);
  const lousePhase = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => rng() * Math.PI * 2);
  const out = [];

  for (let i = 0; i < 14; i++) {
    const z = -2000 + i * (3400 / 13);
    out.push(body('knob', 'bolus_knob', BOLUS_WALL_X, Math.round(z), { key: `bolus_knob_${i}`, radius: 22 }));
  }
  out.push(body('tendon', 'bolus_tendon', BOLUS_WALL_X, -40, { key: 'bolus_tendon', radius: 24 }));
  out.push(body('tooth', 'bolus_tooth', -180, -220, { key: 'bolus_tooth', radius: 22 }));
  out.push(body('baleen', 'bolus_baleen', BOLUS_WALL_X, -1600, { key: 'bolus_baleen', radius: 28 }));
  out.push(body('nerve', 'bolus_nerve', BOLUS_WALL_X, 1050, { key: 'bolus_nerve', radius: 20 }));
  out.push(body('ring', 'bolus_ring', BOLUS_WALL_X, 260, { key: 'bolus_ring', radius: 26 }));
  out.push(body('hairball', 'bolus_hairball', 1900, 860, { key: 'bolus_hairball', radius: 36 }));
  out.push(body('hauler', 'bolus_hauler', -80, -500, { key: 'bolus_hauler', radius: 48, mass: 4000 }));
  out.push(body('rib', 'bolus_rib', -20, -460, { key: 'bolus_rib', dynamic: true, mass: 200, radius: 16 }));

  const valves = [[-480, -1100], [-480, 20], [-480, 780]];
  for (let i = 0; i < valves.length; i++) {
    out.push(body('valve', 'bolus_valve', valves[i][0], valves[i][1], { key: `bolus_valve_${i}`, radius: 24 }));
  }
  const lanterns = [-1800, -1200, -600, 0, 600];
  for (let i = 0; i < lanterns.length; i++) {
    out.push(body('lantern', 'bolus_lantern', -560, lanterns[i], { key: `bolus_lantern_${i}`, radius: 14 }));
  }
  const tendrils = [[-360, -1700], [-280, -1300], [-200, -900], [-320, -500], [-240, -100], [-300, 300], [-220, 700], [-340, 1100]];
  for (let i = 0; i < tendrils.length; i++) {
    out.push(body('tendril', 'bolus_tendril', tendrils[i][0], tendrils[i][1], { key: `bolus_tendril_${i}`, radius: 26 }));
  }
  const drums = [[300, -800], [500, -200], [400, 300], [600, 900]];
  for (let i = 0; i < drums.length; i++) {
    out.push(body('drum', 'bolus_drum', drums[i][0], drums[i][1], {
      key: `bolus_drum_${i}`, dynamic: true, mass: 140, radius: 16, rot: drumRot[i],
    }));
  }
  const bezoars = [[250, -1400], [550, 100], [350, 700], [450, -400]];
  for (let i = 0; i < bezoars.length; i++) {
    out.push(body('bezoar', 'bolus_bezoar', bezoars[i][0], bezoars[i][1], {
      key: `bolus_bezoar_${i}`, dynamic: true, mass: bezoarMass[i], radius: 14,
    }));
  }
  for (let i = 0; i < fingerOff.length; i++) {
    out.push(body('fingerling', 'bolus_fingerling', Math.round(-560 + fingerOff[i].x), Math.round(-400 + fingerOff[i].z), {
      key: `bolus_fingerling_${i}`, dynamic: true, mass: 40, radius: 8,
    }));
  }
  const lice = [[-200, -1500], [80, -1100], [520, -900], [-100, -600], [300, -300], [120, 200], [640, 500], [-40, 900], [400, 1200], [180, -1800]];
  for (let i = 0; i < lice.length; i++) {
    out.push(body('louse', 'bolus_louse', lice[i][0], lice[i][1], {
      key: `bolus_louse_${i}`, dynamic: true, mass: 30, radius: 8, phase: lousePhase[i], rot: lousePhase[i],
    }));
  }
  const mites = [[280, -1000], [420, -500], [610, -100], [330, 200], [540, 600], [250, 1000]];
  for (let i = 0; i < mites.length; i++) {
    out.push(body('mite', 'bolus_mite', mites[i][0], mites[i][1], {
      key: `bolus_mite_${i}`, dynamic: true, mass: 20, radius: 6,
    }));
  }
  const floaters = [[-120, -1400], [40, -800], [-60, -200], [80, 400], [-140, 800], [20, 1300]];
  for (let i = 0; i < floaters.length; i++) {
    out.push(body('floater', 'bolus_floater', floaters[i][0], floaters[i][1], {
      key: `bolus_floater_${i}`, dynamic: true, mass: 60, radius: 18, phase: floaterPhase[i],
    }));
  }
  out.push(body('glove', 'bolus_glove', -200, -2400, { key: 'bolus_glove', dynamic: true, mass: 800, radius: 20 }));

  out.push(body('blister', 'bolus_blister', -840, -1280, { key: 'bolus_blister' }));
  out.push(body('cyst', 'bolus_cyst', -860, -240, { key: 'bolus_cyst', dynamic: true, mass: 100, radius: 14 }));
  out.push(body('polyp', 'bolus_polyp', -300, 160, { key: 'bolus_polyp' }));
  out.push(body('concretion', 'bolus_concretion', 1680, 820, { key: 'bolus_concretion', dynamic: true, mass: 120, radius: 12 }));
  out.push(body('papilla', 'bolus_papilla', 40, 520, { key: 'bolus_papilla' }));
  out.push(body('hush', 'bolus_hush', -560, 400, { key: 'bolus_hush', mass: 2600 }));
  out.push(body('spur', 'bolus_spur', 640, 80, { key: 'bolus_spur' }));
  out.push(body('frenum', 'bolus_frenum', -240, -2300, { key: 'bolus_frenum' }));
  out.push(body('comb', 'bolus_comb', 980, 640, { key: 'bolus_comb' }));
  out.push(body('uvula', 'bolus_uvula', -40, 880, { key: 'bolus_uvula' }));
  out.push(body('crook', 'bolus_crook', 480, -1680, { key: 'bolus_crook' }));
  out.push(body('pleat', 'bolus_pleat', -240, 1280, { key: 'bolus_pleat', mass: 2800 }));
  return out;
}

export function bolusSectorCard() {
  return {
    id: BOLUS_SECTOR_ID,
    name: 'The Bolus',
    tier: 4,
    security: 0.08,
    charted: false,
    factionId: 'faction_free',
    industries: { research: true },
    position: { x: BOLUS_MAP.x, y: BOLUS_MAP.y },
    worldRadius: BOLUS_WORLD_RADIUS,
    interiorHost: true,
    trafficPerMin: 0,
    enemyDensity: 0,
    enemyLevel: [1, 1],
    neighbors: ['sector_charon_expanse', 'sector_ashfall_reach'],
    stations: [
      {
        id: BOLUS_STATION_ID,
        name: 'The Swallowed Rib',
        type: 'research',
        factionId: 'faction_free',
        size: 'S',
        archetypeGlb: 'place_station_research',
        services: ['repair', 'refuel'],
        chartNote: 'Concord files this volume as Lane Contamination. Pilots who come back say Gullet. The machine still sells a patch.',
      },
    ],
    fields: [
      { id: 'f_bolus_grit', type: 'ast_rare_exotic', countWeight: 0, count: 0, center: { x: 420, z: -40 } },
    ],
    hazards: [],
    pois: [
      {
        id: 'poi_bolus_charon_buoy',
        type: 'beacon',
        name: 'Swallowed Charon Buoy',
        pos: { x: -1100, z: -1700 },
        scannerSignalKind: 'anomaly',
      },
    ],
  };
}

export const BOLUS_ANCHORS = Object.freeze({
  [BOLUS_SECTOR_ID]: Object.freeze({
    stations: Object.freeze([
      Object.freeze({ id: BOLUS_STATION_ID, pos: Object.freeze({ x: -980, z: -900 }), archetypeGlb: 'place_station_research' }),
    ]),
    gates: Object.freeze([
      Object.freeze({ to: 'sector_charon_expanse', pos: Object.freeze({ x: BOLUS_MOUTH_POS.x, z: BOLUS_MOUTH_POS.z }) }),
      Object.freeze({ to: 'sector_ashfall_reach', pos: Object.freeze({ x: BOLUS_COUGH_POS.x, z: BOLUS_COUGH_POS.z }) }),
    ]),
    fields: Object.freeze([
      Object.freeze({ id: 'f_bolus_grit', center: Object.freeze({ x: 420, z: -40 }), clusterRadius: 40 }),
    ]),
    pois: Object.freeze([
      Object.freeze({ id: 'poi_bolus_charon_buoy', pos: Object.freeze({ x: -1100, z: -1700 }) }),
    ]),
  }),
});

export const BOLUS_ZONES = Object.freeze({
  [BOLUS_SECTOR_ID]: Object.freeze([
    Object.freeze({
      id: 'zone_bolus_wall',
      name: 'Cartilage Road',
      type: 'anomaly_deep',
      factionId: 'faction_free',
      reason: 'The wall still has a lane. Cilia do the coasting if you let them.',
      center: Object.freeze({ x: -700, z: -300 }),
      radius: 980,
    }),
    Object.freeze({
      id: 'zone_bolus_lumen',
      name: 'The Lumen',
      type: 'radiation_field',
      factionId: 'faction_free',
      reason: 'The trench digests metal. The chart calls it radiation. It is not.',
      center: Object.freeze({ x: 450, z: 0 }),
      radius: 1100,
    }),
    Object.freeze({
      id: 'zone_bolus_cough',
      name: 'The Cough',
      type: 'derelict_field',
      factionId: 'faction_free',
      reason: 'The far lip opens on Ashfall. What the gut would not keep is piled here.',
      center: Object.freeze({ x: 1800, z: 900 }),
      radius: 700,
    }),
  ]),
});
