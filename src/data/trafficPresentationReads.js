// Read-only traffic identity and authored warm planning shared with presentation.
import { isRunSealed } from '../core/runSeal.js';
import { massline2Flag } from './featureFlags.js';
import { FACTION_KITS } from './factions.js';
import { PRIORITY_COURIER_SERVICE, NAMED_LANE_CONTACTS } from './laneContacts.js';
import { CERES_ACTIVITY_POCKETS, CERES_ACTIVITY_SERVICE_SLOTS, CERES_ACTIVITY_SECTOR_ID, activityPocketsForSector } from './sectorActivityPockets.js';
import { regionalTrafficDensityMultiplier, regionalTrafficRoleWeights } from '../systems/regionalEcology.js';
import { RECORD_KIND, stableRecordId } from '../world/worldRecords.js';

export const MAX_PER_SECTOR = 8;
export const CORE_MIN_TRAFFIC = 6;    // high-security / high-tpm cores never feel empty
export const DEFAULT_TRAFFIC = 3;     // sectors without explicit trafficPerMin get a small ambient count

export function priorityCourierServiceForSector(sectorId) {
  return sectorId === PRIORITY_COURIER_SERVICE.sectorId ? PRIORITY_COURIER_SERVICE : null;
}


export const FLEET_BY_FACTION = new Map();
for (const kit of FACTION_KITS) {
  const groups = (Array.isArray(kit.shipRoles) ? kit.shipRoles : [])
    .filter((entry) => Array.isArray(entry.hullIds) && entry.hullIds.length > 0);
  if (groups.length) FLEET_BY_FACTION.set(kit.id, groups);
}


export const TRAFFIC_ROLES = {
  hauler:   { ship: 'ship_mule',     team: 2, speed: 26, archetype: 'fleeing_trader', weight: 30,
              label: 'Cargo Hauler', docks: true, trades: true },
  courier:  { ship: 'ship_kestrel',  team: 2, speed: 52, archetype: 'fleeing_trader', weight: 18,
              label: 'Courier', docks: true, trades: true },
  miner:    { ship: 'ship_pelican',  team: 2, speed: 30, archetype: 'fleeing_trader', weight: 16,
              label: 'Mining Barge', docks: true, trades: true, seeks: 'asteroid' },
  patrol:   { ship: 'ship_wasp',     team: 2, speed: 44, archetype: 'passive', weight: 14,
              label: 'System Patrol', docks: false, orbits: true },
  escort:   { ship: 'ship_wasp',     team: 2, speed: 40, archetype: 'passive', weight: 8,
              label: 'Convoy Escort', docks: false, escorts: true },
  smuggler: { ship: 'ship_drifter',  team: 2, speed: 46, archetype: 'fleeing_trader', weight: 6,
              label: 'Smuggler', docks: true, trades: true },
  pirate:   { ship: 'ship_hornet',   team: 2, speed: 50, archetype: 'fleeing_trader', weight: 5,
              label: 'Raider', docks: false, flees: true },
  rescue:   { ship: 'ship_drifter',  team: 2, speed: 48, archetype: 'passive', weight: 3,
              label: 'Rescue Craft', docks: true, trades: false },
  // A heavy neutral liner on a real station route. `speed` is descriptive only; the live motion
  // path is the V3 NPC boost intent in update(), which keeps momentum honest and tether-shareable.
  express:  { ship: 'ship_mule',     team: 2, speed: 247, archetype: 'fleeing_trader', weight: 3,
              label: 'Express Liner', docks: true, trades: true, express: true },
  // ── The working trades (design/fiction/THE_WORKING_TRADES.md) ─────────────────────────────────
  // Hulls chosen from the dossiers, not from what was convenient: the Ranger's long-endurance
  // utility spine is why a surveyor flies one and why "surveyors who cannot afford a Ranger fake
  // the trade on a Hitch and die of range"; the Pelican is a barge frame, which is what a salvor
  // needs to drag cut plate home; the Drifter's speed is why a tender gets off the berth fast when
  // somebody is venting.
  surveyor: { ship: 'ship_ranger',   team: 2, speed: 34, archetype: 'passive', weight: 9,
              label: 'Survey Rig', docks: true, trades: false },
  salvor:   { ship: 'ship_pelican',  team: 2, speed: 40, archetype: 'fleeing_trader', weight: 7,
              label: 'Salvage Cutter', docks: true, trades: false },
  tender:   { ship: 'ship_drifter',  team: 2, speed: 66, archetype: 'passive', weight: 6,
              label: 'Repair Tender', docks: true, trades: false },
  // PQ-045: the ore barge is its own presentation role, NOT a hauler reskin — `hauler` already
  // owns the accepted helios_span whole-ship, so a barge keyed as `hauler` would replace that
  // asset in every sector while silently wearing the "Cargo Hauler" label. `ore_carrier` has its
  // own TRAFFIC_ROLES entry and its own whole-ship binding (wholeships/ore_barge.glb), so ship,
  // team, speed, label and hull all resolve to the barge. The Ironback def was the unused
  // mining_barge hull class this trade always implied (ROLE_MATRIX row "ore carrier"). It docks
  // at stations like any bulk hull. PQ-048.01 closes its formerly inert seam by reusing the miner
  // work kernel: the Ironback cuts one ore-only lot, carries it under this stable role identity,
  // and settles it through freight/economy ownership.
  ore_carrier: { ship: 'ship_ironback', team: 2, speed: 22, archetype: 'fleeing_trader', weight: 4,
              label: 'Ore Barge', docks: true, trades: true, seeks: 'asteroid' },
  // PQ-136.02 — packaged work-fleet hulls on existing job kinds. Weights add variety
  // inside the current ambient cap; they do not raise MAX_PER_SECTOR.
  //
  // PQ-193.08: tanker and customs are Helios fixtures (mix weight zeroed below), not
  // ambient rolls. They do not remap hauler/Span, Atlas, Arclight, or hostile customs.
  prospector: { ship: 'ship_drifter',  team: 2, speed: 32, archetype: 'fleeing_trader', weight: 5,
              label: 'Prospector', docks: true, trades: false, seeks: 'asteroid' },
  sweeper:    { ship: 'ship_pelican',  team: 2, speed: 28, archetype: 'fleeing_trader', weight: 4,
              label: 'Scrap Sweeper', docks: true, trades: false },
  shuttle:    { ship: 'ship_mule',     team: 2, speed: 38, archetype: 'fleeing_trader', weight: 4,
              label: 'Apron Shuttle', docks: true, trades: true },
  // The tug carries a finite freight lot through the existing hauler graph. Its lower planning
  // speed keeps the working hull visibly distinct; the Hawser def is the yard-tug hull the
  // role already renders (wholeships/yard_tug.glb), so its sim mass and radius now match the body.
  tug:        { ship: 'ship_hawser',   team: 2, speed: 20, archetype: 'passive', weight: 4,
              label: 'Yard Tug', docks: true, trades: true },
  // PQ-193.07: rare Helios heavy. Own role and body — never remaps hauler/Span or Atlas.
  // Ambient mix weight is zeroed below so the seeded hauler draw stays Span.
  arclight:   { ship: 'ship_mule',     team: 2, speed: 22, archetype: 'fleeing_trader', weight: 2,
              label: 'Helios Arclight', docks: true, trades: true },
  // PQ-193.08: rare Helios extras. Own roles and bodies. Ambient mix is zeroed so
  // seeded haulers stay Span and goldens stay byte-identical.
  tanker:     { ship: 'ship_mule',     team: 2, speed: 24, archetype: 'fleeing_trader', weight: 2,
              label: 'Volatiles Tanker', docks: true, trades: true },
  customs:    { ship: 'ship_wasp',     team: 2, speed: 40, archetype: 'passive', weight: 2,
              label: 'Inspection Cutter', docks: true, trades: false },
  tourist:    { ship: 'ship_drifter',  team: 2, speed: 24, archetype: 'passive', weight: 4,
              label: 'Sightseer', docks: true, trades: false, loiters: true },
};


export const CERES_TENDER_SLOT_ID = 'ceres_refinery_tender';

export const CERES_ACTIVITY_CAST = Object.freeze([
  ...CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots
    .filter((slot) => slot.id !== CERES_TENDER_SLOT_ID)
    .map((slot) => Object.freeze({ pocket, slot, service: false }))),
  ...CERES_ACTIVITY_SERVICE_SLOTS.map((slot) => Object.freeze({ pocket: null, slot, service: true })),
]);
export const CERES_ACTIVITY_CAST_BY_SLOT_ID = new Map(CERES_ACTIVITY_CAST.map((entry) => [entry.slot.id, entry]));

function embodimentDensityPayload(state, sectorId) {
  const bySector = state && state.world && state.world.embodiment
    && state.world.embodiment.bySector;
  const rec = bySector && sectorId ? bySector[sectorId] : null;
  const intents = rec && Array.isArray(rec.intents) ? rec.intents : null;
  if (!intents) return null;
  for (const it of intents) {
    if (it && it.kind === 'traffic_density' && it.payload && typeof it.payload === 'object') {
      return it.payload;
    }
  }
  return null;
}

function sectorServiceSet(sector) {
  const set = new Set();
  const stations = sector && sector.stations;
  if (!Array.isArray(stations)) return set;
  for (const station of stations) {
    const services = station && station.services;
    if (!Array.isArray(services)) continue;
    for (const service of services) {
      if (typeof service === 'string' && service) set.add(service);
    }
  }
  return set;
}

function hazardTypeSet(sector) {
  const set = new Set();
  const hazards = sector && sector.hazards;
  if (!Array.isArray(hazards)) return set;
  for (const hazard of hazards) {
    if (hazard && typeof hazard.type === 'string' && hazard.type) set.add(hazard.type);
  }
  return set;
}

/**
 * FB-029 / FB-133 — flags the mixer already knows how to read, plus the service gates
 * that field the volatiles tanker and the inspection cutter. Synthetic pockets that
 * set none of these flags keep the prior weights. Ambient count is not touched.
 */
function applySectorPopulationFlags(weights, sector) {
  const sec = sector || {};
  const out = weights;
  const ind = sec.industries && typeof sec.industries === 'object' ? sec.industries : null;
  const mining = !!(ind && ind.mining);
  const refinery = !!(ind && ind.refinery);
  const research = !!(ind && ind.research);
  if (research && !mining && !refinery) {
    out.surveyor *= 2.2;
    out.courier *= 1.25;
  } else if (research) {
    out.surveyor *= 1.45;
  }
  if (refinery && !mining) {
    out.hauler *= 1.35;
    out.ore_carrier *= 1.2;
  }
  if (mining && !refinery) out.prospector *= 1.35;
  if (sec.threat === 'vael') {
    out.surveyor *= 1.55;
    out.escort *= 1.18;
  } else if (sec.threat === 'quiet') {
    out.smuggler *= 1.9;
    out.courier *= 0.75;
  }
  const hazards = hazardTypeSet(sec);
  if (hazards.has('nebula')) out.surveyor *= 1.12;
  if (hazards.has('radiation')) out.tender *= 1.18;
  if (hazards.has('debris')) out.sweeper *= 1.22;
  if (hazards.has('dense_asteroid')) out.prospector *= 1.08;
  const numericSecurity = Number.isFinite(sec.security) ? sec.security : null;
  const tier = Number.isFinite(sec.tier) ? sec.tier : 0;
  const threat = sec.threat || sec.danger;
  const lowBand = threat === 'high' || sec.security === 'lawless'
    || (numericSecurity != null && numericSecurity <= 0.35) || tier >= 3;
  if (lowBand && numericSecurity != null) out.patrol *= (0.85 + numericSecurity);
  const services = sectorServiceSet(sec);
  const highCore = numericSecurity != null && numericSecurity >= 0.9;
  const escorted = (out.escort || 0) > 0 || (out.patrol || 0) > 0;
  if (!highCore && services.has('refuel') && ((out.pirate || 0) <= 0 || escorted)) out.tanker = 6;
  if (!highCore && (services.has('scan') || services.has('toll'))) out.customs = 6;
  return out;
}

// A sector with authored rock is a sector somebody cuts. Field records exist in three shapes: the
// authored def (`count`), the embodied runtime record (`asteroidIds`), and the live view (`rocks`).
export function sectorHasAuthoredRock(sec) {
  return Array.isArray(sec && sec.fields) && sec.fields.some((f) => f && (
    (f.count | 0) > 0
    || (Array.isArray(f.asteroidIds) && f.asteroidIds.length > 0)
    || (Array.isArray(f.rocks) && f.rocks.length > 0)
  ));
}


export function trafficRoleMixForSector(sector, state = null) {
  const sec = sector || {};
  const out = {};
  for (const [id, role] of Object.entries(TRAFFIC_ROLES)) out[id] = role.weight;
  const numericSecurity = Number.isFinite(sec.security) ? sec.security : null;
  const tier = Number.isFinite(sec.tier) ? sec.tier : 0;
  // Industrial (mining/refinery) sectors: more miners + haulers. The ore barge plies the same
  // declared extraction economy (it is the heavy logistics end of the miner's trade, not a
  // contents-derived read — a sector that merely HAS rocks does not attract bulk carriers).
  if (sec.industries && (sec.industries.mining || sec.industries.refinery)) {
    out.miner *= 2.5; out.hauler *= 1.5; out.ore_carrier *= 2.5;
    out.prospector *= 2.5; out.sweeper *= 1.7;
  }
  // A sector with authored ROCK is a sector somebody cuts, whether or not an `industries` flag was
  // ever set on it. Read the contents, not only the label.
  //
  // Concrete case this exists for: `sector_helios_prime` authors 70 asteroids across two named
  // fields — the comments in sectors.js call one of them "the starter seam" — and Helios Station
  // carries a standing iron shortage (`marketEquilibriumFactors: { cmdty_ore_iron: 0.09 }`). It has
  // no `industries` flag, so the miner weight stayed at its base 16 while the `security >= 0.9`
  // branch below multiplied patrol x1.6 and hauler x1.4 on top of it. Measured result across
  // repeated live captures of the sector every new player starts in: **zero barges**, consistently
  // 1 hauler + 4 patrols. The economy said iron was short and nobody was mining it.
  //
  // Deliberately weaker than the explicit flag (x1.7 vs x2.5) and NOT applied on top of it: a
  // declared mining economy should still out-mine a core sector that merely happens to have rocks.
  else if (sectorHasAuthoredRock(sec)) {
    out.miner *= 1.7;
  }
  // Hostile/danger sectors: more suspicious raiders, fewer civilians.
  const threat = sec.threat || sec.danger;
  if (threat === 'high' || sec.security === 'lawless' || (numericSecurity != null && numericSecurity <= 0.35) || tier >= 3) {
    out.pirate *= 4; out.courier *= 0.4; out.escort *= 2;
  }
  // Secure faction sectors: more patrols + escorts, no suspicious raider traffic in the safe lanes.
  if (sec.security === 'secure' || sec.factionControl === 'strong' || (numericSecurity != null && numericSecurity >= 0.6)) {
    out.patrol *= 2.5; out.escort *= 1.8; out.pirate = 0;
  }
  // Professional core pocket (Helios-class): licensed traders + one lawful presence — no smuggler
  // scenery in the first-hour safe lane (smugglers still exist elsewhere via lower security).
  if (numericSecurity != null && numericSecurity >= 0.9) {
    out.smuggler = 0;
    out.pirate = 0;
    out.hauler *= 1.4;
    out.courier *= 1.2;
    out.patrol *= 1.6;
  }
  // Call-time gate: headless/golden and explicit flag-off sessions retain the exact prior role mix.
  if (!massline2Flag('hitchhiking')) out.express = 0;
  // General salvors are demand-driven from live wrecks/payloads (see _dispatchGeneralSalvors).
  // Zero ambient weight so golden scenarios and ordinary pockets never roll a cutter from the
  // role mix alone — the cleanup profession only appears when there is something to clean.
  out.salvor = 0;
  // The yard tug follows the same doctrine, and for a stronger reason: a tug whose whole job is to
  // drag a body somewhere is a decorative hull if it rolls into a pocket with nothing to drag. It is
  // dispatched against a real towable body by `_dispatchYardTugs`, so ambient weight is zero here.
  // This also keeps the weighted draw byte-identical to the pre-tug distribution, which is why the
  // sim/massline goldens are untouched by fielding the role.
  out.tug = 0;
  // PQ-193.07: the Arclight is a dedicated Helios fixture, not a mix roll. Zero here keeps
  // every seeded hauler as Span and leaves goldens byte-identical.
  out.arclight = 0;
  // PQ-193.08: tanker and inspection cutter are the same fixture doctrine.
  out.tanker = 0;
  out.customs = 0;
  out.tourist = (sec.scenic || sec.tourism) ? 4 : 0;
  let weights = state ? regionalTrafficRoleWeights(state, sec.id, out) : out;
  // Live field read: the retained traffic_density recipe's roleMixBias tilts the mix toward what
  // the sector's danger/scarcity/influence actually projects (more miners under mining industry,
  // more raiders under Reach pressure). Deterministic per epoch; absent cache → authored mix.
  const bias = state && sec && sec.id ? embodimentDensityPayload(state, sec.id) : null;
  const mix = bias && bias.roleMixBias;
  if (mix && typeof mix === 'object') {
    const adjusted = { ...weights };
    for (const role of Object.keys(adjusted)) {
      const factor = Number(mix[role]);
      if (Number.isFinite(factor)) adjusted[role] = Math.max(0, adjusted[role] * factor);
    }
    weights = adjusted;
  }
  return applySectorPopulationFlags(weights, sec);
}

export function sectorEnterTrafficShipStubs(sector, state) {
  const out = [];
  const seen = new Set();
  const sectorId = sector && sector.id;
  const factionId = (sector && sector.factionId) || 'faction_free';
  // Rows carry the mount's trafficRole: wholeShipVisualForEntity resolves role before defId
  // and the role/defId whole-ship maps are near-disjoint, so a stub without the role warms
  // the wrong GLB. Dedupe on defId|role — two roles mapping to one hull still need both
  // role files warmed.
  const push = (defId, role) => {
    if (typeof defId !== 'string' || !defId) return;
    const key = defId + '|' + (role || '');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ defId, factionId, trafficRole: role || null });
  };
  const pushWithFactionGroup = (anchorDefId, role) => {
    push(anchorDefId, role);
    const groups = FLEET_BY_FACTION.get(factionId);
    const group = groups && groups.find((entry) => entry.hullIds.includes(anchorDefId));
    if (group && group.hullIds.length > 1) {
      for (const hullId of group.hullIds) push(hullId, role);
    }
  };
  if (!sector) return out;
  if (ambientCountForSector(sector, state) > 0) {
    const mix = trafficRoleMixForSector(sector, state);
    for (const [roleId, w] of Object.entries(mix)) {
      if (!Number.isFinite(w) || w <= 0) continue;
      const def = TRAFFIC_ROLES[roleId];
      if (def && def.ship) pushWithFactionGroup(def.ship, roleId);
    }
  }
  for (const pocket of activityPocketsForSector(sectorId) || []) {
    for (const slot of (pocket && pocket.actorSlots) || []) {
      const def = TRAFFIC_ROLES[slot && slot.presentationRole];
      if (def && def.ship) push(def.ship, slot.presentationRole);
    }
  }
  if (sectorId === CERES_ACTIVITY_SECTOR_ID) {
    for (const slot of CERES_ACTIVITY_SERVICE_SLOTS) {
      const def = TRAFFIC_ROLES[slot && slot.presentationRole];
      if (def && def.ship) push(def.ship, slot.presentationRole);
    }
  }
  for (const contact of NAMED_LANE_CONTACTS) {
    if (!contact || !Array.isArray(contact.sectorIds)
        || contact.sectorIds.indexOf(sectorId) < 0) continue;
    // The spawn stamps trafficRole = contact.role || 'hauler' whether the hull is the
    // contact's own or a role-default faction pick — the stub mirrors that role so the
    // warm resolves the same whole-ship file the mount reads. A named contact's own hull
    // outranks the faction fleet: the spawn does not run factionHullFor for it, so neither
    // does the stub.
    const contactRole = contact.role || 'hauler';
    if (contact.ship) {
      push(contact.ship, contactRole);
    } else {
      const def = TRAFFIC_ROLES[contactRole];
      if (def && def.ship) pushWithFactionGroup(def.ship, contactRole);
    }
  }
  return out;
}

/** Ambient count from trafficPerMin — core pockets floor at CORE_MIN_TRAFFIC. Exported for tests. */
export function ambientCountForSector(sector, state = null) {
  // NO AMBIENT FREIGHT IN A CRUCIBLE RUN (PQ-135). Helios carries eighteen haulers a minute, and a
  // live arena walk had nineteen of them on the board: they filled the contact list with things the
  // player must not shoot, held spawn slots the wave needed, and turned a match into rush hour.
  // The run is a sealed box; the only ships in it should be the ones it put there.
  if (isRunSealed(state)) return 0;
  const tpm = sector && sector.trafficPerMin;
  let count;
  if (typeof tpm === 'number') {
    // denser reading for high-tpm cores: tpm/3 instead of /4 so Helios (18) → 6
    count = Math.min(MAX_PER_SECTOR, Math.round(tpm / 3));
  } else {
    count = DEFAULT_TRAFFIC;
  }
  const sec = Number.isFinite(sector && sector.security) ? sector.security : null;
  if (sec != null && sec >= 0.85 && count > 0) {
    count = Math.min(MAX_PER_SECTOR, Math.max(CORE_MIN_TRAFFIC, count));
  }
  // Explicit zero remains authored silence. Otherwise ecology changes embodied freight density
  // within the existing cap; the corresponding role mix also changes actual market manifests.
  if (count > 0 && state) {
    count = Math.min(MAX_PER_SECTOR, Math.max(1, Math.round(
      count * regionalTrafficDensityMultiplier(state, sector && sector.id),
    )));
    // Live field read: the retained sectorSim traffic_density recipe scales the pocket with the
    // field's projected density (danger surges thin the lanes; scarcity draws hulls). Same cap
    // and floor as the ecology multiplier; absent cache → authored density unchanged.
    const density = embodimentDensityPayload(state, sector && sector.id);
    if (density && Number.isFinite(density.densityMultiplier)) {
      count = Math.min(MAX_PER_SECTOR, Math.max(1, Math.round(
        count * Math.max(0.35, Math.min(2.75, density.densityMultiplier)),
      )));
    }
  }
  return count;
}


export function ceresActivityActorWorldRecordId(state, slotId) {
  if (typeof slotId !== 'string' || !slotId) return null;
  const entry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(slotId);
  const worldRecordSlotId = entry && entry.slot && entry.slot.worldRecordSlotId
    ? entry.slot.worldRecordSlotId
    : `ceres:activity:${slotId}`;
  const seed = (state && state.meta && state.meta.seed) || 1;
  return stableRecordId(
    seed,
    CERES_ACTIVITY_SECTOR_ID,
    RECORD_KIND.CONVOY,
    worldRecordSlotId,
  );
}

