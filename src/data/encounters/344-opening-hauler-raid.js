// 344 — Opening hauler raid on the starter freight corridor.
// Guaranteed day-0 teaching encounter: a hauler is actually under attack by pirates close to
// Helios Station so the player can fly in, defend the hauler, steal the spilled cargo, or leave.
// Appended after the migration-era catalogue prefix (orders 010–120): the depth-program loader
// fixture pins that prefix as an immutable migration proof, so post-migration modules take the
// next free order rather than slotting in by theme.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 344;

/** What the player hears when the opening raid ends on a choice other than the paid assist. */
export function openingRaidConsequence(outcome) {
  switch (outcome) {
    case 'robbed':
      return {
        from: 'MTS HAULER',
        text: 'The thief left with the cells. You did not stop them.',
      };
    case 'hauler_destroyed':
      return {
        from: 'LANE CONTROL',
        text: 'Hauler destroyed. No hazard pay — the corridor lost the ship.',
      };
    case 'raid_over':
      return {
        from: 'MTS HAULER',
        text: 'You flew on. The hauler and the raiders are still out here.',
      };
    default:
      return null;
  }
}

function sayOpeningConsequence(d, outcome) {
  const line = openingRaidConsequence(outcome);
  if (!line || !d || typeof d.emit !== 'function') return;
  d.emit('comms:log', { from: line.from, text: line.text, kind: 'encounter' });
}

export const trigger = deepFreeze({
  id: 'opening_hauler_raid',
  tier: 'minor',
  deck: 'combat',
  weight: 2.0,
  zoneTypes: ['trade_lane', 'civilian_core'],
  // F11: the live record's script label is the custody family it belongs to. The module's
  // self-registered runtime still wins fire/tick dispatch by shapeId, while 'convoy' lets the
  // freight events (pickup:collected, subsystemDisabled, lifecycle, entityGone) route here.
  script: 'convoy',
  fallbackScript: 'convoy',
  pressureCost: 20,
  cooldownS: 600,
  proximity: true,
  earlyWindowGuaranteeDay: 0,
  // A1: "a hauler is already under attack within three minutes of a new game, inside about two
  // screen-depths". The authored window pins the schedule; the fire reach slides the whole
  // formation to ~2 screen-depths (115 WU each) of the player when the gated fire comes due.
  earlyDelayS: [60, 170],
  fireWithinWu: 230,
  gates: {
    maxSecurity: 1.0,
    sectorIds: ['sector_helios_prime'],
  },
});

// The raid dissolving must not take its cast with it. Detach the squad from the live record
// (the same ids/roles bookkeeping the director's entity-gone handler maintains) so resolve()'s
// straggler sweep finds nothing to stamp with a despawn timer. Spawn budget stays with the ships
// through dir.active until each one actually leaves play — the ordinary population contract.
function stampOpeningFreight(live, manifest, carrier, adopted) {
  const causality = live && live.causality;
  if (!causality || !manifest || typeof manifest.manifestId !== 'string') return;
  const line = Array.isArray(manifest.lines) ? manifest.lines.find((row) => row && row.qty > 0) : null;
  causality.manifestId = manifest.manifestId;
  causality.freightRole = manifest.role || (adopted ? 'ore_carrier' : 'hauler');
  causality.totalQty = manifest.totalQty;
  causality.commodityId = line && line.commodityId || null;
  causality.carrierWorldRecordId = carrier && carrier.data && carrier.data.worldRecordId || null;
  causality.adoptedWorkingBarge = adopted === true;
  if (!adopted || !carrier || !carrier.data) return;
  causality.evidence = `The raid hit the working ore barge. Counted hold ${manifest.manifestId} (${manifest.totalQty}).`;
  carrier.data.encounterFingerprint = causality.fingerprint;
  carrier.data.encounterCausality = { ...causality };
}

function releaseSquadToWorld(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

const STARTER_CARRIER_SLOT_ID = 'helios_starter_ore_carrier';
const ADOPTED_AI_KEYS = Object.freeze(['encounterId', 'encounterKind', 'encounterRole', 'sectorId', 'zoneId']);
// The opening frame law (two screen depths + margin around the planned hauler) still holds: the
// raid takes the working ore barge only when the barge is already in the frame the raid lands in.
const STARTER_CARRIER_ADOPT_RANGE = 2 * 115 + 30;

// The starter seam's barge, when it is physically hauling real cut ore, is the corridor's actual
// freight. The raid targets that hull instead of inventing a second cargo nobody cut.
function loadedStarterCarrier(state, live) {
  // The frame law is measured from the player the raid is delivered to, not from the plan's hauler.
  const player = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
  const ships = live && live.plan && Array.isArray(live.plan.ships) ? live.plan.ships : [];
  const plannedHauler = ships.find((ship) => ship && ship.role === 'hauler');
  const anchor = (player && player.pos) || (plannedHauler && plannedHauler.pos) || (live && live.pos) || null;
  let best = null;
  let bestD2 = STARTER_CARRIER_ADOPT_RANGE * STARTER_CARRIER_ADOPT_RANGE;
  for (const entity of state.entityList || []) {
    const data = entity && entity.data;
    if (!data || entity.alive === false || entity.type !== 'ship' || !entity.pos
      || data.activityActorSlotId !== STARTER_CARRIER_SLOT_ID
      || data.disabled === true || data.predationEncounterId != null
      || (data.ai && data.ai.squadId)) continue;
    const manifest = data.cargoManifest;
    if (!manifest || typeof manifest.manifestId !== 'string' || !(manifest.totalQty > 0)
      || !Array.isArray(manifest.lines) || !manifest.lines.some((line) => line && line.qty > 0)) continue;
    const d2 = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.z)
      ? (entity.pos.x - anchor.x) ** 2 + (entity.pos.z - anchor.z) ** 2 : 0;
    if (d2 <= bestD2 && (!best || d2 < bestD2 || entity.id < best.id)) { best = entity; bestD2 = d2; }
  }
  return best;
}

// Read-only scheduling seam for the director owner: true while the starter barge is in the
// player's frame carrying real cut ore, i.e. when firing now would hit the corridor's real freight.
export function openingRaidCarrierReady(state) {
  return !!(state && loadedStarterCarrier(state, null));
}

// Raiders keep the authored curtain geometry, re-centred on the real barge.
function raidersAroundCarrier(ships, carrier) {
  const plannedHauler = ships.find((ship) => ship && ship.role === 'hauler');
  const origin = plannedHauler && plannedHauler.pos;
  return ships.filter((ship) => ship && ship.role !== 'hauler').map((ship) => {
    const shift = (pos) => (pos && origin && Number.isFinite(pos.x) && Number.isFinite(pos.z)
      ? { ...pos, x: pos.x - origin.x + carrier.pos.x, z: pos.z - origin.z + carrier.pos.z }
      : pos);
    const out = { ...ship, pos: shift(ship.pos) };
    if (ship.entitySpec && ship.entitySpec.pos) out.entitySpec = { ...ship.entitySpec, pos: shift(ship.entitySpec.pos) };
    return out;
  });
}

// The barge goes back to its own owner exactly as it was: custody suppression lasted for this raid.
function releaseAdoptedCarrier(d, live) {
  const adopted = live.data && live.data.adoptedCarrier;
  if (!adopted || adopted.released === true) return;
  adopted.released = true;
  const entity = d.state && d.state.entities && d.state.entities.get(adopted.entityId);
  if (Array.isArray(live.ids)) {
    const index = live.ids.indexOf(adopted.entityId);
    if (index >= 0) live.ids.splice(index, 1);
  }
  if (live.roles) delete live.roles[adopted.entityId];
  if (!entity || !entity.data || entity.data.worldRecordId !== adopted.worldRecordId) return;
  if (entity.alive === false) return;
  // A living barge goes back to its own work. The fingerprint stays only on a hull this raid
  // killed, so a later unrelated death does not inherit the opening cause.
  delete entity.data.encounterFingerprint;
  delete entity.data.encounterCausality;
  const restore = adopted.restore || {};
  for (const key of ['freightRewardOwner', 'bountyCr', 'loot']) {
    if (restore[key] === undefined) delete entity.data[key];
    else entity.data[key] = restore[key];
  }
  const ai = entity.data.ai;
  if (ai && ai.encounterId === live.id) {
    for (const key of ADOPTED_AI_KEYS) {
      const prior = adopted.restoreAi ? adopted.restoreAi[key] : undefined;
      if (prior === undefined) delete ai[key];
      else ai[key] = prior;
    }
  }
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    // Deadline lands before spawnShips so the spawned activities bake the real deadlineTick.
    live.deadlineAt = d.now() + (live.shape.transitS || 60);
    const carrier = loadedStarterCarrier(state, live);
    const ids = d.spawnShips(live, carrier ? raidersAroundCarrier(live.plan.ships, carrier) : live.plan.ships);
    if (carrier && ids.length) {
      const cdata = carrier.data;
      live.ids.push(carrier.id);
      live.roles[carrier.id] = 'hauler';
      const ai = cdata.ai || (cdata.ai = {});
      const restoreAi = {};
      for (const key of ADOPTED_AI_KEYS) restoreAi[key] = ai[key];
      // The same squad-frame stamps spawnShips gives a planned hull, so predation binds this barge.
      ai.encounterId = live.id;
      ai.encounterKind = live.shapeId;
      ai.encounterRole = 'hauler';
      ai.sectorId = live.sectorId;
      ai.zoneId = live.zoneId;
      live.data.adoptedCarrier = {
        entityId: carrier.id,
        worldRecordId: cdata.worldRecordId || null,
        slotId: STARTER_CARRIER_SLOT_ID,
        manifestId: cdata.cargoManifest.manifestId,
        restore: {
          freightRewardOwner: cdata.freightRewardOwner,
          bountyCr: cdata.bountyCr,
          loot: cdata.loot,
        },
        restoreAi,
      };
    }
    // A partial budget grant that lands the hauler alone would resolve 'defended' for a raid
    // that never existed — the premise needs a hauler AND at least one raider on the field.
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'raider') < 1) {
      releaseAdoptedCarrier(d, live);
      return d.abort(live, 'no_budget');
    }
    // VERB-02: the raid is already happening — no consent dialog, no pass-on-timeout. Every
    // raider opens committed onto the hauler through the combat focus track the squad frame
    // reads, under the thief doctrine's sanctioned first-fire on MTS hulls. The stamp is a
    // focus track, not an activity pin: a raider the player shoots stays free to turn and
    // answer. The player declares a side with guns (kill raiders = defend, kill the hauler
    // = raid) or just flies on.
    const hauler = d.entsOf(live, 'hauler')[0];
    for (const raider of d.entsOf(live, 'raider')) {
      const data = raider.data || (raider.data = {});
      if (data.ai) data.ai.targetId = hauler.id;
      (data.combat || (data.combat = {})).targetId = hauler.id;
    }
    // VERB-06: the opener hauls a volatile lot — fuel cells are the explosive class lootShards
    // already cooks off on a hard slam. Ordinary civilian role + cargo fields let the existing
    // violence-spill path shed the pods; no encounter-specific plumbing.
    if (hauler && live.data.adoptedCarrier) {
      const hdata = hauler.data;
      const real = hdata.cargoManifest;
      // F11 on the real hold: custody tracks the ore this barge physically collected at the seam.
      live.data.freightManifest = {
        manifestId: real.manifestId,
        freighterKey: real.freighterKey || hdata.worldRecordId || `encounter:${live.id}`,
        role: real.role || 'ore_carrier',
        lines: real.lines.filter((line) => line && line.qty > 0)
          .map((line) => ({ commodityId: line.commodityId, qty: line.qty })),
        totalQty: real.totalQty,
      };
      hdata.bountyCr = 0;
      hdata.loot = null;
      hdata.freightRewardOwner = 'manifest_custody';
      stampOpeningFreight(live, live.data.freightManifest, hauler, true);
    } else if (hauler) {
      const band = live.shape.unitsPerHauler || [6, 10];
      const qty = Math.max(1, Math.round(
        band[0] + d.stream(live, 'cargo')() * Math.max(0, band[1] - band[0]),
      ));
      const hdata = hauler.data || (hauler.data = {});
      hdata.jobKind = 'hauler';
      hdata.cargo = { cmdty_fuel_cells: qty };
      // F11: the same hold is the authored manifest the freight-custody stack tracks, so a
      // raider who wins the fight physically carries the cargo out — it does not vanish with
      // the hull. The generic bounty/loot roll is suppressed; custody owns the physical spill.
      live.data.freightManifest = {
        manifestId: `fm_encounter_${live.id}`,
        freighterKey: `encounter:${live.id}`,
        role: 'hauler',
        lines: [{ commodityId: 'cmdty_fuel_cells', qty }],
        totalQty: qty,
      };
      hdata.bountyCr = 0;
      hdata.loot = null;
      hdata.freightRewardOwner = 'manifest_custody';
      hdata.cargoManifest = {
        manifestId: live.data.freightManifest.manifestId,
        freighterKey: live.data.freightManifest.freighterKey,
        role: 'hauler',
        lines: [{ commodityId: 'cmdty_fuel_cells', qty }],
        totalQty: qty,
      };
      stampOpeningFreight(live, hdata.cargoManifest, hauler, false);
    }
    live.phase = 'conflict';
    d.say(live, 'alert', 'curtain_convoy_alert', null, { primary: true });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    // Cargo in play outranks the raid's own resolution: while the custody ledger is open the
    // winner is still flying, and nobody despawns with the pod.
    const custody = live.data.freightCargoCustody;
    const custodyOpen = !!(custody && custody.terminal !== true);
    const haulerAlive = d.aliveCount(live, 'hauler') > 0;
    const raidersAlive = d.aliveCount(live, 'raider') > 0;

    if (!haulerAlive) {
      if (custodyOpen) return;
      releaseAdoptedCarrier(d, live);
      d.despawnAll(live, 12);
      const outcome = custody && custody.raiderEscaped ? 'robbed' : 'hauler_destroyed';
      sayOpeningConsequence(d, outcome);
      return d.resolve(live, outcome, { speak: false });
    }

    if (!raidersAlive) {
      if (custodyOpen) return;
      if (custody && custody.raiderEscaped) {
        // The winner already left reach with the pod — there is no rescue left to pay for.
        releaseAdoptedCarrier(d, live);
        d.despawnAll(live, 15, 'hauler');
        sayOpeningConsequence(d, 'robbed');
        return d.resolve(live, 'robbed', { speak: false });
      }
      d.grant(250, 'convoy:guard');
      d.rep('faction_mts', 5, 'hauler_rescued');
      d.emit('comms:log', {
        from: 'MTS HAULER',
        text: 'All raiders down! Thank you for the assist, pilot. Hazard pay transferred.',
        kind: 'encounter',
      });
      releaseAdoptedCarrier(d, live);
      d.despawnAll(live, 15, 'hauler');
      return d.resolve(live, 'defended', { speak: true });
    }

    if (now >= live.deadlineAt) {
      if (custodyOpen) return;
      // The raiders gave up and the hauler survived — 'hauler_destroyed' would misreport the
      // outcome into stats, receipts, and resolved fingerprints.
      // The scripted beat closes; the cast does not delete itself. Released from the live
      // record, the hauler keeps flying and the raiders keep being pirates as ordinary world
      // entities the player can still fight, save, or rob after the encounter has ended.
      releaseAdoptedCarrier(d, live);
      releaseSquadToWorld(live);
      sayOpeningConsequence(d, 'raid_over');
      return d.resolve(live, 'raid_over', { speak: false });
    }
  },

});

export default defineEncounter(trigger, {
  shape: {
    situation: 'convoy',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'HAULER UNDER ATTACK',
  primaryLine: 'DISTRESS RELAY: Local hauler taking heavy fire from raiders on the freight corridor!',
  squad: {
    anchorArchetype: 'reaver_pirate',
    archetypes: ['reaver_pirate', 'wasp_swarmer'],
    // The opening fight must always field a throwable hull — a no-wasp draw leaves nothing
    // in the raid lighter than the player's ship, so the scripted tether beat cannot exist.
    guaranteeArchetypes: ['wasp_swarmer'],
    size: [3, 3],
    clusterRadius: 75,
    minSeparation: 38,
    doctrine: 'thief',
    formation: 'wedge',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  // F11: one raider is the designated thief under the shared freight-custody stack — hotStart
  // because the fight is already committed when custody opens: nobody stands down, the thief
  // opens on the active approach (its 3s no-fire window still gates real weapons release), and
  // once the carrier spills it picks the pods up physically and runs a finite in-sector
  // escape point.
  predation: {
    enabled: true,
    hotStart: true,
    raiderRole: 'raider',
    carrierRole: 'hauler',
    motive: 'cargo_raid',
    engagementTrigger: 'manifest_predation',
    responseWindowS: 3,
    objectiveS: 60,
    leashRadius: 2600,
    escapeHoldS: 3,
  },
  bark: 'curtain_convoy_alert',
  transitS: 60,
  unitsPerHauler: [6, 10],
});
