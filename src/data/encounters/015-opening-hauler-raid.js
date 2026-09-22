// 015 — Opening hauler raid on the starter freight corridor.
// Guaranteed day-0 teaching encounter: a hauler is actually under attack by pirates close to
// Helios Station so the player can fly in, defend the hauler, steal the spilled cargo, or leave.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 15;
export const trigger = deepFreeze({
  id: 'opening_hauler_raid',
  tier: 'minor',
  deck: 'combat',
  weight: 2.0,
  zoneTypes: ['trade_lane', 'civilian_core'],
  script: 'selfRegistered',
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
    live.phase = 'conflict';
    d.say(live, 'alert', 'curtain_convoy_alert', null, { primary: true });
    d.offerChoices(live, ['defend', 'raid', 'pass'], 'pass', live.deadlineAt);
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const haulerAlive = d.aliveCount(live, 'hauler') > 0;
    const raidersAlive = d.aliveCount(live, 'raider') > 0;

    if (!haulerAlive) {
      d.despawnAll(live, 12);
      return d.resolve(live, 'hauler_destroyed', { speak: false });
    }

    if (!raidersAlive) {
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
      // The raiders gave up and the hauler survived — 'hauler_destroyed' would misreport the
      // outcome into stats, receipts, and resolved fingerprints.
      // The scripted beat closes; the cast does not delete itself. Released from the live
      // record, the hauler keeps flying and the raiders keep being pirates as ordinary world
      // entities the player can still fight, save, or rob after the encounter has ended.
      releaseSquadToWorld(live);
      return d.resolve(live, 'raid_over', { speak: false });
    }
  },

  choose(d, live, state, choiceId) {
    if (choiceId === 'defend') {
      d.emit('comms:log', {
        from: 'FLIGHT COMPUTER',
        text: 'Target lock assigned: defending civilian hauler.',
        kind: 'info',
      });
    } else if (choiceId === 'raid') {
      d.rep('faction_mts', -4, 'hauler_raided');
      d.rep('faction_reach', 2, 'pirate_complicity');
      d.emit('comms:log', {
        from: 'FLIGHT COMPUTER',
        text: 'IFF reclassified: joining cargo raid.',
        kind: 'info',
      });
    } else if (choiceId === 'pass') {
      d.emit('comms:log', {
        from: 'FLIGHT COMPUTER',
        text: 'Holding neutral flight lane.',
        kind: 'info',
      });
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
  engagementTrigger: 'player_in_range',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'HAULER UNDER ATTACK',
  primaryLine: 'DISTRESS RELAY: Local hauler taking heavy fire from raiders on the freight corridor!',
  squad: {
    anchorArchetype: 'reaver_pirate',
    archetypes: ['reaver_pirate', 'wasp_swarmer'],
    size: [2, 2],
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
  bark: 'curtain_convoy_alert',
  transitS: 60,
  unitsPerHauler: [6, 10],
  choices: [
    { id: 'defend', label: 'Protect the hauler' },
    { id: 'raid', label: 'Take the cargo' },
    { id: 'pass', label: 'Keep clear' },
  ],
  timeoutChoice: 'pass',
});
