// 344 — Opening hauler raid on the starter freight corridor.
// Guaranteed day-0 teaching encounter: a hauler is actually under attack by pirates close to
// Helios Station so the player can fly in, defend the hauler, steal the spilled cargo, or leave.
// Appended after the migration-era catalogue prefix (orders 010–120): the depth-program loader
// fixture pins that prefix as an immutable migration proof, so post-migration modules take the
// next free order rather than slotting in by theme.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 344;
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
function releaseSquadToWorld(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    // Deadline lands before spawnShips so the spawned activities bake the real deadlineTick.
    live.deadlineAt = d.now() + (live.shape.transitS || 60);
    const ids = d.spawnShips(live, live.plan.ships);
    // A partial budget grant that lands the hauler alone would resolve 'defended' for a raid
    // that never existed — the premise needs a hauler AND at least one raider on the field.
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'raider') < 1) {
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
    if (hauler) {
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
      d.despawnAll(live, 12);
      return d.resolve(live, custody && custody.raiderEscaped ? 'robbed' : 'hauler_destroyed', { speak: false });
    }

    if (!raidersAlive) {
      if (custodyOpen) return;
      if (custody && custody.raiderEscaped) {
        // The winner already left reach with the pod — there is no rescue left to pay for.
        d.despawnAll(live, 15, 'hauler');
        return d.resolve(live, 'robbed', { speak: false });
      }
      d.grant(250, 'convoy:guard');
      d.rep('faction_mts', 5, 'hauler_rescued');
      d.emit('comms:log', {
        from: 'MTS HAULER',
        text: 'All raiders down! Thank you for the assist, pilot. Hazard pay transferred.',
        kind: 'encounter',
      });
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
      releaseSquadToWorld(live);
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
