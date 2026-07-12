// src/data/sectorZones.js — NAMED ZONES per sector (the "why does this exist here" layer).

import { FRONTIER_ZONES } from './frontierRegions/index.js';
//
// Problem this solves: content used to be scattered on random radial rings, so a sector read as a
// flat disc of unrelated dots — "a test room." This module gives every sector a set of NAMED zones,
// each with a faction, a one-line reason it exists, a geometry (center + radius aligned to the real
// stations/fields/POIs in sectorAnchors.js), a threat tier, and an optional `presence` describing who
// loiters there and how they behave. world.js spawns ambient hostiles/patrols FROM these zones as
// coherent faction squads instead of random rings; the map/HUD read zone names + threat for legibility.
//
// Design rules (see design/WORLD_OVERHAUL_2_1.md):
//   * Pure data + pure helpers. No imports, no Three.js, no RNG here (callers pass their sim RNG).
//   * factionId is READABILITY: it colors the squad on radar/HUD and is the kill-rep target. Hostility
//     is still decided by scanner.isHostileToPlayer (team/archetype/context), never by factionId.
//   * `presence.archetypes` reference src/data/enemies.js ENEMY_TYPES ids. A zone with no presence (or
//     a civilian/trade/mining role) is populated by ambient traffic (src/systems/traffic.js), not here.
//   * The starter neighbourhood (Helios + its neighbours) is authored richly; frontier sectors get a
//     core + a signature zone. Zones are additive: a sector with no entry keeps the legacy ring spawner.

/** Zone archetypes. `color` is the map/HUD tint; `threat` is the default 0..5 readability tier. */
export const ZONE_TYPES = {
  civilian_core:      { label: 'Civilian Core',      color: '#4DA8FF', threat: 0, safe: true },
  trade_lane:         { label: 'Trade Lane',         color: '#7FE0C0', threat: 1 },
  patrol_corridor:    { label: 'Patrol Corridor',    color: '#3A78FF', threat: 1 },
  border_checkpoint:  { label: 'Border Checkpoint',  color: '#5FA0FF', threat: 1 },
  refinery_approach:  { label: 'Refinery Approach',  color: '#C9772E', threat: 1 },
  mining_belt:        { label: 'Mining Belt',        color: '#FFB13D', threat: 1 },
  colony:             { label: 'Colony',             color: '#9FD08A', threat: 1 },
  derelict_field:     { label: 'Derelict Field',     color: '#B08A6A', threat: 2 },
  outlaw_zone:        { label: 'Outlaw Zone',        color: '#C86BD0', threat: 2 },
  radiation_field:    { label: 'Radiation Field',    color: '#7FE05F', threat: 2, hazard: true },
  nebula_fog:         { label: 'Nebula Fog',         color: '#8A5FB0', threat: 1, hazard: true },
  ambush_lane:        { label: 'Ambush Lane',        color: '#FF4D5E', threat: 3 },
  anomaly_deep:       { label: 'Deep-Space Anomaly', color: '#C8B6FF', threat: 3 },
};

// Presence templates keep zone entries terse. Each names the squad flavour the planner spawns.
const P = {
  pirates: (size = [2, 4], archetypes = ['reaver_pirate', 'wasp_swarmer']) => ({
    role: 'pirates', archetypes, size, doctrine: 'scavenger', formation: 'wedge',
    context: 'zone_hostile', hostile: true,
  }),
  raiders: (size = [3, 5]) => ({
    role: 'pirates', archetypes: ['corsair_raider', 'reaver_pirate', 'wasp_swarmer'], size,
    doctrine: 'scavenger', formation: 'wedge', context: 'zone_hostile', hostile: true,
  }),
  smugglers: (factionId = 'faction_quiet', size = [1, 2]) => ({
    role: 'smugglers', archetypes: ['reaver_pirate'], size, doctrine: 'scavenger',
    formation: 'loose', context: 'zone_hostile', hostile: true, factionId,
  }),
  scavengers: (size = [1, 2]) => ({
    role: 'scavengers', archetypes: ['wasp_swarmer', 'reaver_pirate'], size, doctrine: 'scavenger',
    formation: 'loose', context: 'zone_hostile', hostile: true,
  }),
  patrol: (size = [2, 3]) => ({
    role: 'patrol', archetypes: ['patrol_lawman'], size, doctrine: 'official', formation: 'wedge',
    context: 'patrol', hostile: false, factionId: 'faction_scn',
  }),
  vael: (size = [1, 3]) => ({
    role: 'vael', archetypes: ['lancer_sniper', 'bruiser_brawler'], size, doctrine: 'balanced',
    formation: 'ring', context: 'zone_hostile', hostile: true, factionId: 'faction_vael',
  }),
};

// Zone entries: { id, name, type, factionId, reason, center:{x,z}, radius, threat?, presence? }.
// Centers/radii align to src/data/sectorAnchors.js so a label sits on real content, not empty space.
const CORE_SECTOR_ZONES = {
  // ── S1 Helios Prime — safe Concord core (enemyDensity 0: NO hostile spawns; readability only) ──
  // Living pocket: civilian_core + trade_lane + patrol_corridor schedule ambient traders, one
  // civilian/economy beat (trader_run / convoy), and lawful patrol_scan / patrol_beat. Named lane
  // contacts are stamped by traffic.js (not combat named_hunter — Helios has no ambush zone).
  sector_helios_prime: [
    { id: 'zone_helios_core', name: 'Concord Core', type: 'civilian_core', factionId: 'faction_scn',
      reason: 'Solar Concord\'s clean, licensed heart — customs-scanned traffic, no open weapons.',
      center: { x: 400, z: 0 }, radius: 1700 },
    { id: 'zone_helios_claim', name: 'Sanctioned Claim', type: 'mining_belt', factionId: 'faction_scn',
      reason: 'A safe starter claim the Concord keeps clear so green pilots can learn to mine.',
      center: { x: 720, z: -260 }, radius: 420, threat: 0 },
    // Freight spine between Helios Station and Coalition — anchors convoy/trader economy beats.
    { id: 'zone_helios_freight', name: 'Helios Freight Spine', type: 'trade_lane', factionId: 'faction_mts',
      reason: 'Licensed bulk moves between Helios Station and the Coalition yard — the core economy\'s short hop.',
      center: { x: 180, z: 330 }, radius: 900, threat: 0 },
    { id: 'zone_helios_lane', name: 'Customs Corridor', type: 'patrol_corridor', factionId: 'faction_scn',
      reason: 'Every inbound ship is scanned here before it reaches the core.',
      center: { x: 0, z: 1900 }, radius: 1300, presence: P.patrol([2, 3]) },
    { id: 'zone_helios_memorial', name: 'Memorial Array', type: 'anomaly_deep', factionId: 'faction_scn',
      reason: 'A quiet beacon marking the Pit convoy lost decades ago — a signal that draws the curious.',
      center: { x: 1680, z: -820 }, radius: 340, threat: 0 },
  ],

  // ── S2–S3 Ceres Belt — Drift Miners refinery band, Reach skiffs in the belt shadow ──
  sector_ceres_belt: [
    { id: 'zone_ceres_belt', name: 'Ceres Mining Belt', type: 'mining_belt', factionId: 'faction_dmc',
      reason: 'The richest metallic seams in the core, worked under Drift Miners Collective charter.',
      center: { x: 300, z: -300 }, radius: 1100 },
    { id: 'zone_ceres_refinery', name: 'Ceres Refinery Approach', type: 'refinery_approach', factionId: 'faction_dmc',
      reason: 'Ore in, alloys out — a light Collective watch keeps the refinery lane open.',
      center: { x: -1100, z: 620 }, radius: 720, presence: P.patrol([1, 2]) },
    { id: 'zone_ceres_ambush', name: 'Belt-Shadow Ambush', type: 'ambush_lane', factionId: 'faction_reach',
      reason: 'Crimson Reach skiffs lurk in the asteroid shadow, waiting for loaded ore haulers.',
      center: { x: -400, z: -2400 }, radius: 640, presence: P.pirates([2, 4]) },
    { id: 'zone_ceres_derelict', name: 'The Abandoned Driller', type: 'derelict_field', factionId: 'faction_reach',
      reason: 'A refinery hauler gutted in a raid; scavengers still pick at the hull.',
      center: { x: 240, z: -1180 }, radius: 420, presence: P.scavengers([1, 2]) },
  ],

  // ── S2–S3 Tethys Junction — Meridian exchange, Concord customs, a Quiet cache ──
  sector_tethys_junction: [
    { id: 'zone_tethys_hub', name: 'Meridian Exchange', type: 'civilian_core', factionId: 'faction_mts',
      reason: 'The busiest market in the core; tolls collected here fund the patrols.',
      center: { x: 1050, z: 380 }, radius: 1500 },
    { id: 'zone_tethys_lane', name: 'Junction Trade Lane', type: 'trade_lane', factionId: 'faction_mts',
      reason: 'Convoys run this line between Helios, Ceres and Io — the arteries of the core economy.',
      center: { x: 500, z: 1500 }, radius: 1000 },
    { id: 'zone_tethys_checkpoint', name: 'Customs Checkpoint', type: 'border_checkpoint', factionId: 'faction_scn',
      reason: 'Concord scans inbound cargo here; contraband is seized, smugglers are flagged.',
      center: { x: -640, z: -1180 }, radius: 820, presence: P.patrol([2, 3]) },
    { id: 'zone_tethys_blackmkt', name: 'The Quiet Cache', type: 'outlaw_zone', factionId: 'faction_quiet',
      reason: 'Contraband changes hands off the exchange lanes, away from Meridian eyes.',
      center: { x: -1380, z: 420 }, radius: 520, presence: P.smugglers('faction_quiet', [1, 2]) },
  ],

  // ── S2–S3 Vesta Forge — foundry ring, feedstock belt, slag radiation, a dead freighter ──
  sector_vesta_forge: [
    { id: 'zone_vesta_forge', name: 'The Forge', type: 'refinery_approach', factionId: 'faction_dmc',
      reason: 'Modules assembled from Ceres alloys; the Choir keep a shrine in the foundry\'s shadow.',
      center: { x: -480, z: 720 }, radius: 820, presence: P.patrol([1, 2]) },
    { id: 'zone_vesta_belt', name: 'Feedstock Belt', type: 'mining_belt', factionId: 'faction_dmc',
      reason: 'Ore haulers shuttle from these seams to the foundry lines around the clock.',
      center: { x: 80, z: 260 }, radius: 1000 },
    { id: 'zone_vesta_slag', name: 'Slag Radiation Field', type: 'radiation_field', factionId: 'faction_dmc',
      reason: 'Spent reactor mass dumped from the Forge — shields degrade fast in the glow.',
      center: { x: 680, z: 320 }, radius: 520 },
    { id: 'zone_vesta_derelict', name: 'Dead Freighter Drift', type: 'derelict_field', factionId: 'faction_reach',
      reason: 'A freighter died at the sector edge; its manifest was never recovered.',
      center: { x: 860, z: -1240 }, radius: 420, presence: P.scavengers([1, 2]) },
  ],

  // ── S4–S5 Pallas Drift — Hollow Station smuggler market, Reach raider staging ──
  sector_pallas_drift: [
    { id: 'zone_pallas_drift', name: 'Hollow Station', type: 'outlaw_zone', factionId: 'faction_quiet',
      reason: 'A gutted hab turned smuggler market; The Quiet run it off the books.',
      center: { x: -1080, z: 540 }, radius: 900, presence: P.smugglers('faction_quiet', [1, 3]) },
    { id: 'zone_pallas_belt', name: 'Independent Seams', type: 'mining_belt', factionId: 'faction_dmc',
      reason: 'Unclaimed rock worked by independents; the Collective takes a cut and looks away.',
      center: { x: 200, z: 300 }, radius: 1000 },
    { id: 'zone_pallas_ambush', name: 'Sker-Run Ambush', type: 'ambush_lane', factionId: 'faction_reach',
      reason: 'Reach raiders stage here to hit the Sker run; the drifting wreck is one of their kills.',
      center: { x: 1420, z: 760 }, radius: 640, presence: P.raiders([3, 4]) },
  ],

  // ── S4–S5 Io Reach — contested Free Frontier border, jurisdiction overlap ──
  sector_io_reach: [
    { id: 'zone_io_reach', name: 'Reach Station', type: 'civilian_core', factionId: 'faction_free',
      reason: 'A Free Frontier waystation on contested ground — everyone docks, no one\'s in charge.',
      center: { x: -720, z: 940 }, radius: 1200 },
    { id: 'zone_io_contest', name: 'Contested Lane', type: 'patrol_corridor', factionId: 'faction_scn',
      reason: 'Concord and the Reach both claim this lane; border skirmishes are common.',
      center: { x: 200, z: 0 }, radius: 1300, presence: P.patrol([2, 3]) },
    { id: 'zone_io_derelict', name: 'Cruiser Graveyard', type: 'derelict_field', factionId: 'faction_free',
      reason: 'A Concord cruiser died here in the last border flare; salvage crews still comb the hull.',
      center: { x: -1420, z: -780 }, radius: 460, presence: P.scavengers([1, 2]) },
    { id: 'zone_io_merc', name: 'Mercenary Outpost', type: 'outlaw_zone', factionId: 'faction_quiet',
      reason: 'Guns for hire — if the price is right and your reputation isn\'t red.',
      center: { x: 1280, z: 620 }, radius: 420 },
  ],

  // ── S6–S7 Charon Expanse — Cinder refinery frontier, thin escort coverage ──
  sector_charon_expanse: [
    { id: 'zone_charon_refinery', name: 'Cinder Refinery', type: 'refinery_approach', factionId: 'faction_dmc',
      reason: 'Frontier ore processed under Collective license; pressurized air sold on the side.',
      center: { x: 880, z: -640 }, radius: 820, presence: P.patrol([1, 2]) },
    { id: 'zone_charon_belt', name: 'Deep Frontier Seams', type: 'mining_belt', factionId: 'faction_dmc',
      reason: 'Rich rock, far from help — the payoff for pilots who\'ll risk the distance.',
      center: { x: 0, z: 180 }, radius: 1100 },
    { id: 'zone_charon_ambush', name: 'Ashfall Approach Ambush', type: 'ambush_lane', factionId: 'faction_reach',
      reason: 'Reach packs hunt the Ashfall approach; the Collective can\'t spare escorts this far out.',
      center: { x: -980, z: -540 }, radius: 720, presence: P.raiders([3, 5]) },
    { id: 'zone_charon_colony', name: 'Colony Barge', type: 'colony', factionId: 'faction_free',
      reason: 'A struggling colony trades air and salvage for anything it can get.',
      center: { x: -620, z: 1420 }, radius: 420 },
  ],

  // ── S6–S7 Sker Haven — open pirate haven, gate-camped ──
  sector_sker_haven: [
    { id: 'zone_sker_haven', name: 'Skerris Deep', type: 'outlaw_zone', factionId: 'faction_reach',
      reason: 'An open pirate haven — the Reach fence stolen cargo and refit raiders here.',
      center: { x: -540, z: 680 }, radius: 1400, presence: P.raiders([3, 5]) },
    { id: 'zone_sker_gatecamp', name: 'Reach Gate-Camp', type: 'ambush_lane', factionId: 'faction_reach',
      reason: 'Anything that jumps in is scanned, then swarmed. Jump out fast or don\'t jump in.',
      center: { x: 1600, z: -1200 }, radius: 900, presence: P.raiders([3, 5]) },
    { id: 'zone_sker_belt', name: 'Press-Gang Seams', type: 'mining_belt', factionId: 'faction_reach',
      reason: 'Seams mined by press-ganged crews under Reach guns.',
      center: { x: 720, z: -420 }, radius: 520 },
  ],

  // ── S8 Veil Nebula — Free Frontier research + Vael-guarded anomaly ──
  sector_veil_nebula: [
    { id: 'zone_veil_research', name: 'Veil Research', type: 'civilian_core', factionId: 'faction_free',
      reason: 'Free Frontier scientists study the anomaly; the Vael tolerate them, barely.',
      center: { x: 420, z: -1120 }, radius: 820 },
    { id: 'zone_veil_fog', name: 'Blind Nebula', type: 'nebula_fog', factionId: 'faction_free',
      reason: 'Best air in the outer sectors, but sensors go blind in the dense gas.',
      center: { x: -280, z: 640 }, radius: 720 },
    { id: 'zone_veil_anomaly', name: 'The Veil Anomaly', type: 'anomaly_deep', factionId: 'faction_vael',
      reason: 'Sensors ghost, autopilot drifts; the Vael guard whatever waits inside.',
      center: { x: 0, z: 0 }, radius: 900, presence: P.vael([1, 3]) },
    { id: 'zone_veil_wormhole', name: 'Wormhole Threshold', type: 'anomaly_deep', factionId: 'faction_vael',
      reason: 'An unstable threshold — the only known path onward to Ashfall Reach.',
      center: { x: 680, z: 4120 }, radius: 420 },
  ],

  // ── S9 Ashfall Reach — endgame; the Iron Maw guards the vault ──
  sector_ashfall_reach: [
    { id: 'zone_ashfall_approach', name: 'Iron Maw Approach', type: 'ambush_lane', factionId: 'faction_vael',
      reason: 'The Iron Maw dreadnought holds the approach — the system\'s last enforcement.',
      center: { x: 240, z: 1180 }, radius: 900, presence: P.vael([2, 3]) },
    { id: 'zone_ashfall_vault', name: 'Kurtz\'s Cache', type: 'anomaly_deep', factionId: 'faction_vael',
      reason: 'A sealed records cache — the reason anyone flies this far.',
      center: { x: -1480, z: 320 }, radius: 420 },
    { id: 'zone_ashfall_belt', name: 'Edge Seams', type: 'mining_belt', factionId: 'faction_vael',
      reason: 'Cold rock at the edge of known space — thin air, thinner margins.',
      center: { x: 0, z: -500 }, radius: 820 },
  ],
};

export const SECTOR_ZONES = {
  ...CORE_SECTOR_ZONES,
  ...FRONTIER_ZONES,
};

/** All zones for a sector (empty array if the sector has no authored zones → legacy behaviour). */
export function zonesForSector(sectorId) {
  return SECTOR_ZONES[sectorId] || [];
}

/** Metadata (label/color/threat) for a zone type, or a neutral default. */
export function zoneTypeMeta(type) {
  return ZONE_TYPES[type] || { label: 'Zone', color: '#8899AA', threat: 1 };
}

/** The zone whose disc contains (x,z), preferring the smallest (most specific) match. Null if none. */
export function zoneAt(sectorId, x, z) {
  let best = null, bestR = Infinity;
  for (const zone of zonesForSector(sectorId)) {
    const c = zone.center; if (!c) continue;
    const dx = x - c.x, dz = z - c.z;
    const r = zone.radius || 0;
    if (dx * dx + dz * dz <= r * r && r < bestR) { best = zone; bestR = r; }
  }
  return best;
}

/** The readability threat tier (0..5) of a zone: explicit override else its type default. */
export function zoneThreat(zone) {
  if (!zone) return 0;
  if (Number.isFinite(zone.threat)) return zone.threat;
  return zoneTypeMeta(zone.type).threat || 0;
}

/**
 * Plan zone-anchored hostile/patrol spawns for a sector, distributed across a spawn budget so total
 * ship count (and therefore perf) matches the legacy ring spawner — the ships are RELOCATED onto
 * believable zones with faction identity + squad cohesion, not multiplied.
 *
 * @param sectorId       sector to plan for
 * @param budget         max ships to place (world.js passes its density-derived count)
 * @param enemyLevel     [lo,hi] level band from the sector
 * @param rng            the caller's deterministic sim RNG (state.world.rng) — REQUIRED, no Math.random
 * @returns Array<{ archetypeId, level, pos:{x,z}, factionId, squadId, doctrine, formation, context, zoneId, zoneName }>
 */
export function planZoneSpawns(sectorId, budget, enemyLevel, rng) {
  const out = [];
  if (!(budget > 0) || typeof rng !== 'function') return out;
  const zones = zonesForSector(sectorId).filter((z) => z.presence && z.presence.hostile !== undefined && z.presence.archetypes && z.presence.archetypes.length);
  if (!zones.length) return out;
  const [lvLo, lvHi] = Array.isArray(enemyLevel) && enemyLevel.length === 2 ? enemyLevel : [1, 2];

  // Target size per zone (deterministic), then trim proportionally to fit the budget.
  const plans = zones.map((zone) => {
    const p = zone.presence;
    const [lo, hi] = Array.isArray(p.size) && p.size.length === 2 ? p.size : [1, 2];
    const want = Math.max(1, Math.round(lo + rng() * Math.max(0, hi - lo)));
    return { zone, p, want };
  });
  let totalWant = plans.reduce((s, pl) => s + pl.want, 0);
  // Scale down to budget while guaranteeing each occupied zone keeps at least 1 ship.
  if (totalWant > budget) {
    let remaining = budget;
    for (const pl of plans) { pl.count = 1; remaining -= 1; }
    // hand out the remainder largest-want-first, deterministically
    const order = plans.map((pl, i) => i).sort((a, b) => plans[b].want - plans[a].want || a - b);
    let oi = 0;
    while (remaining > 0) {
      const pl = plans[order[oi % order.length]];
      if (pl.count < pl.want) { pl.count += 1; remaining -= 1; }
      oi += 1;
      if (oi > plans.length * (budget + 2)) break; // safety: all zones maxed
    }
  } else {
    for (const pl of plans) pl.count = pl.want;
  }

  for (const { zone, p, count } of plans) {
    const n = Math.max(0, count | 0);
    const factionId = p.factionId || zone.factionId;
    const clusterR = Math.min(zone.radius || 260, 260); // tight cluster so the roster forms one squad
    for (let i = 0; i < n; i++) {
      if (out.length >= budget) break;
      const archetypeId = p.archetypes[Math.floor(rng() * p.archetypes.length) % p.archetypes.length];
      const level = Math.round(lvLo + (lvHi - lvLo) * (0.4 + rng() * 0.6));
      const ang = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * clusterR;
      const pos = { x: zone.center.x + Math.cos(ang) * r, z: zone.center.z + Math.sin(ang) * r };
      out.push({
        archetypeId, level, pos, factionId,
        squadId: zone.id,                     // one squad per zone → coherent formation on the zone
        doctrine: p.doctrine || 'balanced',
        formation: p.formation || 'wedge',
        context: p.context || 'zone_hostile',
        zoneId: zone.id, zoneName: zone.name,
      });
    }
  }
  return out;
}
