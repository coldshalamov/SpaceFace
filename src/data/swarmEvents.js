// Swarm arena event tables — the semi-curated layer of the Crucible (SWARM_PROGRAM S4).
//
// Pure data + two deterministic picks. A MAJOR event round lands every SWARM_EVENT_EVERY
// waves, skipping boss rounds (the boss room IS the event); a MINOR round lands on the
// off-beats — waves ≡2 and ≡8 of each ten-wave block — so the five-wave cadence never
// leaves four identical rounds. Each pick is seeded on (arenaId, wave, seed) so a replay,
// a ghost and a share code all see the same card.
//
// Event spend kinds, all through shipped seams — the director owns no new write path:
//   surge — a window where an installed environmental field runs hot (fields.updateExternal)
//   pulse — a temporary field registered for the window, unregistered on calm
//   mines — mines ride in on a bearing (mines:placeRequest, per-owner cap still applies)
//   supply — a salvage pod worth run credits, claimed off pickup:collected
//
// The `wager` block is the bet the telegraph lays (CRUCIBLE mid-run wager):
//   score    — run score paid the moment the event engages (run:awardRequested,
//              reason 'swarm:eventBounty'). Modest on purpose — a few kills' worth.
//              Supply cards carry one too: the pod's credit stamp stays authored, the
//              score rides on top of it.
//   timeout  — the verdict an unanswered wager resolves to at the fire line.
//              Every authored telegraph declares its event as already INBOUND — "about to
//              run hot", "riding in", "sends a crate" — so all current cards are 'accept':
//              opt-out pressure. REFUSE is the player's verb. A card that frames itself as
//              an invitation (a gift that only lands if taken) should say 'refuse'.
//
// `install` specs are pre-placed by planArenaInstall at wave-plan time — the inevitability comes
// from placement: the lane the sluice floods, the mines' berth, the plate the storm rides.

import { isSwarmBossWave, swarmWaveOf } from './swarmMode.js';

export const SWARM_EVENT_SCHEMA_VERSION = 1;

/** Event rounds land on waves 5, 15, 25… — the odd multiples of five the boss round skips. */
export const SWARM_EVENT_EVERY = 5;

/**
 * The minor band: waves ≡2 and ≡8 of each ten-wave block (2, 8, 12, 18…). Those residues
 * can never be a major round (≡0,5 mod 10) or a boss round (≡0), so the band fills empty
 * slots only — no wave books two events.
 */
export const SWARM_MINOR_EVENT_PERIOD = 10;
export const SWARM_MINOR_EVENT_RESIDUES = Object.freeze([2, 8]);

/** A minor event's bounty is its card's authored wager scaled down — half the bet. */
export const SWARM_MINOR_WAGER_SCALE = 0.5;

function event(def) { return Object.freeze(def); }

/** Every event card, keyed by id. `window: 0` events are a single spend, not a held room state. */
export const SWARM_EVENT_BY_ID = Object.freeze({

  // ── helios_core (the Foundry): shutters, furnace, loose plates — the room it already is ──
  shutter_storm: event({
    id: 'shutter_storm', name: 'Shutter storm', kind: 'surge', factor: 2.4, windupS: 5, windowS: 12,
    telegraph: 'SHUTTER STORM — the drag is about to run hot',
    wager: { score: 60, timeout: 'accept' },
    install: {
      fields: [{ kind: 'well', bearing: 'spin', dist: 280, radius: 520, strength: 92, falloff: 1.25 }],
    },
  }),
  furnace_flare: event({
    id: 'furnace_flare', name: 'Furnace flare', kind: 'surge', factor: 2.2, windupS: 5, windowS: 10,
    telegraph: 'FURNACE FLARE — the middle is about to get meaner',
    wager: { score: 55, timeout: 'accept' },
    install: {
      fields: [{ kind: 'repulsor', bearing: 'center', radius: 430, strength: 150, falloff: 1.55 }],
    },
  }),
  plate_drift: event({
    id: 'plate_drift', name: 'Plate drift', kind: 'surge', factor: 1.6, windupS: 4, windowS: 14,
    telegraph: 'PLATE DRIFT — cover is tearing loose',
    wager: { score: 45, timeout: 'accept' },
    install: {
      cover: true,
      fields: [{ kind: 'well', bearing: 'spin', dist: 340, radius: 470, strength: 58, damping: 0.85, falloff: 1.15 }],
    },
  }),

  // ── lagrange_crucible: the pull and the sling ──
  well_swing: event({
    id: 'well_swing', name: 'Well swing', kind: 'pulse', windupS: 4, windowS: 9,
    telegraph: 'WELL SWING — a pull is walking the room',
    wager: { score: 40, timeout: 'accept' },
    field: { kind: 'well', bearing: 'across', dist: 220, radius: 360, strength: 150, falloff: 1.2 },
  }),
  sling_gust: event({
    id: 'sling_gust', name: 'Sling gust', kind: 'surge', factor: 1.8, windupS: 4, windowS: 8, minor: true,
    telegraph: 'SLING GUST — the slingshot is about to bite',
    wager: { score: 40, timeout: 'accept' },
  }),
  // Same chord the swing walks, opposite sign: the gather point becomes a throw line.
  pylon_flip: event({
    id: 'pylon_flip', name: 'Pylon flip', kind: 'pulse', windupS: 4, windowS: 9,
    telegraph: 'PYLON FLIP — one anchor is about to shove',
    wager: { score: 45, timeout: 'accept' },
    field: { kind: 'repulsor', bearing: 'across', dist: 220, radius: 380, strength: 175, falloff: 1.2 },
  }),
  // The sling as river: the wedge apex sits UP-current of the fight (a negative dist on the
  // across bearing), so the tide enters one rail, pours through the anchor and carries the
  // pack crosswise — ride it out or be raked across the room.
  sling_tide: event({
    id: 'sling_tide', name: 'Sling tide', kind: 'pulse', windupS: 4, windowS: 9,
    telegraph: 'SLING TIDE — the room pours crosswise. Ride it or be raked.',
    wager: { score: 45, timeout: 'accept' },
    field: {
      kind: 'cone', bearing: 'across', dist: -240, radius: 560, strength: 140,
      falloff: 1.1, halfAngleRad: 0.55,
    },
  }),

  // ── cinder_sluice: the lane and its undertow ──
  sluice_surge: event({
    id: 'sluice_surge', name: 'Sluice surge', kind: 'surge', factor: 2.0, windupS: 4, windowS: 10,
    telegraph: 'SLUICE SURGE — the lane is about to flood',
    wager: { score: 50, timeout: 'accept' },
  }),
  undertow_snap: event({
    id: 'undertow_snap', name: 'Undertow snap', kind: 'pulse', windupS: 3, windowS: 6,
    telegraph: 'UNDERTOW — mind the deck',
    wager: { score: 45, timeout: 'accept' },
    field: { kind: 'well', bearing: 'player', radius: 280, strength: 210, falloff: 1.0 },
  }),

  // ── cryo_drift: cold fronts and breaking plates ──
  freeze_front: event({
    id: 'freeze_front', name: 'Freeze front', kind: 'pulse', windupS: 4, windowS: 8,
    telegraph: 'FREEZE FRONT — a wall of cold is sweeping in',
    wager: { score: 40, timeout: 'accept' },
    field: {
      kind: 'cone', bearing: 'lane', dist: 300, radius: 560, strength: 130,
      falloff: 1.1, halfAngleRad: 0.55, damping: 0.7,
    },
  }),
  plate_shatter: event({
    id: 'plate_shatter', name: 'Plate shatter', kind: 'surge', factor: 1.5, windupS: 4, windowS: 10,
    telegraph: 'PLATE SHATTER — the ice is about to give',
    wager: { score: 40, timeout: 'accept' },
    install: {
      cover: true,
      fields: [{ kind: 'well', bearing: 'spin', dist: 340, radius: 470, strength: 58, damping: 0.85, falloff: 1.15 }],
    },
  }),
  // The freeze stores pressure; the thaw lets it all go at once. The middle is the throw.
  thaw_burst: event({
    id: 'thaw_burst', name: 'Thaw burst', kind: 'pulse', windupS: 4, windowS: 7,
    telegraph: 'THAW BURST — the middle is about to let go',
    wager: { score: 45, timeout: 'accept' },
    field: { kind: 'repulsor', bearing: 'center', radius: 460, strength: 190, falloff: 1.3 },
  }),
  // The front finds the heat: the pocket lands where the player is at the fire line, so the
  // windup is the bet — drag the grab across the pack and be somewhere else when it bites.
  // Damping is the freeze here: the snare drinks momentum instead of only pulling.
  cold_snap: event({
    id: 'cold_snap', name: 'Cold snap', kind: 'pulse', windupS: 4, windowS: 8,
    telegraph: 'COLD SNAP — the drift has your scent. Spend it on them.',
    wager: { score: 40, timeout: 'accept' },
    field: { kind: 'well', bearing: 'player', radius: 320, strength: 140, damping: 2.2, falloff: 1.15 },
  }),

  // ── storm_lattice: the relay graph and the grid ──
  // The lattice's own fields are occupancy markers authored at strength 0 — a multiplier has
  // nothing to bite, so its signature cards are pulses: temporary fields for the window only.
  relay_arc: event({
    id: 'relay_arc', name: 'Relay arc', kind: 'pulse', windupS: 4, windowS: 9,
    telegraph: 'RELAY ARC — the lattice is about to energize',
    wager: { score: 40, timeout: 'accept' },
    field: { kind: 'repulsor', bearing: 'spin', dist: 300, radius: 340, strength: 170, falloff: 1.2 },
  }),
  grid_surge: event({
    id: 'grid_surge', name: 'Grid surge', kind: 'pulse', windupS: 4, windowS: 12,
    telegraph: 'GRID SURGE — the whole room is hot',
    wager: { score: 45, timeout: 'accept' },
    field: { kind: 'well', bearing: 'center', radius: 520, strength: 140, falloff: 1.15 },
  }),

  // ── asteroid_mill (SWARM-07 B4): the grind and the seam that pays ──
  mill_surge: event({
    id: 'mill_surge', name: 'Mill surge', kind: 'surge', factor: 2.2, windupS: 5, windowS: 11,
    telegraph: 'MILL SURGE — the seam is about to turn hard',
    wager: { score: 55, timeout: 'accept' },
  }),
  seam_burst: event({
    id: 'seam_burst', name: 'Seam burst', kind: 'pulse', windupS: 4, windowS: 7,
    telegraph: 'SEAM BURST — the middle is about to give',
    wager: { score: 40, timeout: 'accept' },
    field: { kind: 'repulsor', bearing: 'center', radius: 420, strength: 190, falloff: 1.3 },
  }),

  // ── the_hive (SWARM-07 B4): the breath, the walls, the eggs ──
  spore_breath: event({
    id: 'spore_breath', name: 'Spore breath', kind: 'surge', factor: 1.9, windupS: 5, windowS: 10,
    telegraph: 'SPORE BREATH — the hive inhales',
    wager: { score: 45, timeout: 'accept' },
  }),
  wall_bloom: event({
    id: 'wall_bloom', name: 'Wall bloom', kind: 'pulse', windupS: 4, windowS: 9,
    telegraph: 'WALL BLOOM — the room flexes inward',
    wager: { score: 40, timeout: 'accept' },
    field: { kind: 'well', bearing: 'center', radius: 480, strength: 160, falloff: 1.2 },
  }),
  egg_drift: event({
    id: 'egg_drift', name: 'Egg drift', kind: 'mines', count: 4, windupS: 5, windowS: 0, minor: true,
    telegraph: 'EGG DRIFT — the hive seeds the lane',
    wager: { score: 30, timeout: 'accept' },
  }),

  // ── shared cards — every arena can draw these ──
  mine_drift: event({
    id: 'mine_drift', name: 'Mine drift', kind: 'mines', count: 4, windupS: 5, windowS: 0, minor: true,
    telegraph: 'MINE DRIFT — hazards riding a bearing',
    wager: { score: 30, timeout: 'accept' },
  }),
  supply_drop: event({
    id: 'supply_drop', name: 'Supply pod', kind: 'supply', credits: 60, windupS: 6, windowS: 0, minor: true,
    telegraph: 'SUPPLY POD — salvage riding in. Staying for it is a choice.',
    wager: { score: 40, timeout: 'accept' },
  }),

  // EXP-07 / EXP-08 — same kinds and install keys as the named donors, scaled.
  rock_rain: event({
    id: 'rock_rain', name: 'Rock rain', kind: 'surge', factor: 1.9, windupS: 4, windowS: 12,
    telegraph: 'ROCK RAIN — catch what you can, throw what you catch',
    wager: { score: 50, timeout: 'accept' },
    install: {
      cover: true,
      fields: [{ kind: 'well', bearing: 'spin', dist: 300, radius: 520, strength: 70, damping: 0.85, falloff: 1.15 }],
    },
  }),
  slag_spill: event({
    id: 'slag_spill', name: 'Slag spill', kind: 'surge', factor: 2.4, windupS: 5, windowS: 9,
    telegraph: 'SLAG SPILL — the floor runs hot, and so does anything you throw through it',
    wager: { score: 55, timeout: 'accept' },
    install: {
      fields: [{ kind: 'repulsor', bearing: 'center', radius: 480, strength: 170, falloff: 1.55 }],
    },
  }),
  lantern_drift: event({
    id: 'lantern_drift', name: 'Lantern drift', kind: 'mines', count: 4, windupS: 5, windowS: 0, minor: true,
    telegraph: "LANTERN DRIFT — they want your heat. Give them someone else's.",
    wager: { score: 30, timeout: 'accept' },
  }),
  reef_surge: event({
    id: 'reef_surge', name: 'Reef surge', kind: 'pulse', windupS: 4, windowS: 8,
    telegraph: 'REEF SURGE — the room moves. Let it throw for you.',
    wager: { score: 45, timeout: 'accept' },
    field: { kind: 'well', bearing: 'player', radius: 320, strength: 180, falloff: 1.0 },
  }),
  shepherd_pulse: event({
    id: 'shepherd_pulse', name: 'Shepherd pulse', kind: 'pulse', windupS: 4, windowS: 8,
    telegraph: 'SHEPHERD PULSE — they fly as one. Break the one.',
    wager: { score: 40, timeout: 'accept' },
    field: { kind: 'repulsor', bearing: 'spin', dist: 280, radius: 380, strength: 190, falloff: 1.2 },
  }),
  sprocket_crate: event({
    id: 'sprocket_crate', name: "Sprocket's crate", kind: 'supply', credits: 80, windupS: 6, windowS: 0, minor: true,
    telegraph: 'MA SPROCKET SENDS A CRATE — catch it before they do.',
    wager: { score: 40, timeout: 'accept' },
  }),
});

/** The signature cards each arena can draw — its own name for its own tricks. */
export const SWARM_EVENT_TABLES = Object.freeze({
  helios_core: Object.freeze(['shutter_storm', 'furnace_flare', 'plate_drift', 'sprocket_crate']),
  lagrange_crucible: Object.freeze(['well_swing', 'sling_gust', 'pylon_flip', 'sling_tide']),
  cinder_sluice: Object.freeze(['sluice_surge', 'undertow_snap', 'slag_spill']),
  cryo_drift: Object.freeze(['freeze_front', 'plate_shatter', 'thaw_burst', 'cold_snap']),
  storm_lattice: Object.freeze(['relay_arc', 'grid_surge', 'reef_surge']),
  asteroid_mill: Object.freeze(['mill_surge', 'seam_burst', 'rock_rain']),
  the_hive: Object.freeze(['spore_breath', 'wall_bloom', 'egg_drift', 'lantern_drift', 'shepherd_pulse']),
});

/** Cards every room can draw — hazards and salvage are not the arena's law. */
export const SWARM_SHARED_EVENTS = Object.freeze(['mine_drift', 'supply_drop']);

/** The pool a wave draws from: the arena's signatures first, then the shared cards. */
export function swarmEventPool(arenaId) {
  const own = (arenaId && SWARM_EVENT_TABLES[arenaId]) || [];
  return own.concat(SWARM_SHARED_EVENTS);
}

/**
 * Is this wave an event round at all — deterministic on wave alone, before the seeded pick.
 * Boss rounds always carry the boss room instead.
 */
export function isSwarmEventWave(wave) {
  const w = swarmWaveOf(wave);
  return w % SWARM_EVENT_EVERY === 0 && !isSwarmBossWave(w);
}

/**
 * Is this wave a MINOR event round — deterministic on wave alone. The residues keep the
 * band disjoint from majors and bosses by construction; the explicit guards stay so a
 * future residue edit can never double-book.
 */
export function isSwarmMinorEventWave(wave) {
  const w = swarmWaveOf(wave);
  return SWARM_MINOR_EVENT_RESIDUES.includes(w % SWARM_MINOR_EVENT_PERIOD)
    && !isSwarmBossWave(w) && !isSwarmEventWave(w);
}

/**
 * The draw stream both bands share — same mixing idiom as arenaStreamSeed: a label-salted
 * uint32 feeding mulberry32, never Math.random.
 */
function seededEventDraw(label, seed, w) {
  let h = ((Number(seed) >>> 0) || 1) ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  h = (h ^ Math.imul(w, 0x85ebca6b)) >>> 0;
  let a = h || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The card a wave draws. Deterministic: same (arenaId, wave, seed) → same event, so a ghost
 * replay and a share code see the same room do the same thing. Returns the frozen def or null.
 */
export function swarmEventFor({ arenaId, wave, seed } = {}) {
  const w = swarmWaveOf(wave);
  if (!isSwarmEventWave(w)) return null;
  const own = (arenaId && SWARM_EVENT_TABLES[arenaId]) || [];
  if (own.length === 0 && SWARM_SHARED_EVENTS.length === 0) return null;
  const draw = seededEventDraw(`swarm-event-v1|${arenaId || 'arena'}|w${w}`, seed, w);
  // Two seeded draws: WHICH pool first (signatures lead 70/30 over shared cards, so the
  // arena's own tricks stay the headline), then which card inside it.
  const pool = draw() < 0.7 && own.length > 0 ? own : SWARM_SHARED_EVENTS;
  const pick = draw();
  const id = pool[Math.min(pool.length - 1, Math.floor(pick * pool.length))];
  return SWARM_EVENT_BY_ID[id] || null;
}

/**
 * The minor pool: the `minor`-tagged cards in the arena's ordinary pool. A tag admits the
 * card to the off-beat band — it stays major-drawable, so old seeds keep their majors.
 * Minor cards never carry `install`: the wave plan pre-places only the major band's card.
 */
export function swarmMinorEventPool(arenaId) {
  return swarmEventPool(arenaId).filter((id) => SWARM_EVENT_BY_ID[id] && SWARM_EVENT_BY_ID[id].minor);
}

/**
 * The card a minor-band wave deals — supply and mine cards weigh double, so the quiet band
 * serves salvage and hazards far more often than even a small surge. The returned def is a
 * frozen copy stamped `band: 'minor'` whose wager.score is scaled by SWARM_MINOR_WAGER_SCALE:
 * the same wager seam, proportionally smaller pressure and bounty.
 */
export function swarmMinorEventFor({ arenaId, wave, seed } = {}) {
  const w = swarmWaveOf(wave);
  if (!isSwarmMinorEventWave(w)) return null;
  const pool = swarmMinorEventPool(arenaId);
  if (pool.length === 0) return null;
  const draw = seededEventDraw(`swarm-event-minor-v1|${arenaId || 'arena'}|w${w}`, seed, w);
  const weightOf = (id) => {
    const kind = SWARM_EVENT_BY_ID[id] && SWARM_EVENT_BY_ID[id].kind;
    return kind === 'supply' || kind === 'mines' ? 2 : 1;
  };
  let total = 0;
  for (const id of pool) total += weightOf(id);
  let pick = draw() * total;
  let id = pool[pool.length - 1];
  for (const candidate of pool) {
    pick -= weightOf(candidate);
    if (pick < 0) { id = candidate; break; }
  }
  const def = SWARM_EVENT_BY_ID[id];
  if (!def) return null;
  return Object.freeze({
    ...def,
    band: 'minor',
    wager: def.wager
      ? { ...def.wager, score: Math.max(1, Math.round((Number(def.wager.score) || 0) * SWARM_MINOR_WAGER_SCALE)) }
      : def.wager,
  });
}

/** Validate the tables — run by the data test, not at import. */
export function validateSwarmEvents() {
  const issues = [];
  for (const [id, def] of Object.entries(SWARM_EVENT_BY_ID)) {
    if (def.id !== id) issues.push(`${id}: def.id mismatch`);
    if (!['surge', 'pulse', 'mines', 'supply'].includes(def.kind)) {
      issues.push(`${id}: unknown kind ${def.kind}`);
    }
    if (typeof def.name !== 'string' || !def.name) issues.push(`${id}: no display name`);
    if (typeof def.telegraph !== 'string' || !def.telegraph) issues.push(`${id}: no telegraph`);
    if (def.kind === 'pulse' && !def.field) issues.push(`${id}: pulse without field spec`);
    if (def.kind === 'surge' && !(def.factor > 0)) issues.push(`${id}: surge without factor`);
    if (def.kind === 'mines' && !(def.count >= 1)) issues.push(`${id}: mines without count`);
    if (def.kind === 'supply' && !(def.credits > 0)) issues.push(`${id}: supply without credits`);
    if (def.minor && def.install) {
      issues.push(`${id}: minor cards cannot carry install — the wave plan pre-places only the major band`);
    }
    if (!def.wager || typeof def.wager !== 'object') {
      issues.push(`${id}: no wager — a telegraph that lays no bet is ambient pressure`);
    } else {
      if (def.wager.timeout !== 'accept' && def.wager.timeout !== 'refuse') {
        issues.push(`${id}: wager.timeout must be accept|refuse — the unanswered default`);
      }
      if (!(def.wager.score > 0)) issues.push(`${id}: wager pays nothing`);
    }
  }
  for (const [arenaId, table] of Object.entries(SWARM_EVENT_TABLES)) {
    for (const id of table) {
      if (!SWARM_EVENT_BY_ID[id]) issues.push(`${arenaId}: table names unknown event ${id}`);
    }
  }
  return issues;
}
