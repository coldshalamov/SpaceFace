// 367 — THE SALVAGE TAIL. The opening raid's second chapter. The mule captain who survived
// the corridor is running it again with the replacement lot — and the cutter that took her
// once is shadowing her for round two. The world remembers the first fight, and this one
// asks for a decision instead of a reflex: fly cover until the raider commits, peel off and
// sell the bait, or leave her to the lane. The gate is the memory: this beat cannot fire
// unless the opening raid actually happened in this save.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 367;
export const trigger = deepFreeze({
  id: 'salvage_tail',
  tier: 'minor',
  deck: 'combat',
  weight: 1.4,
  zoneTypes: ['trade_lane', 'civilian_core'],
  script: 'convoy',
  fallbackScript: 'convoy',
  pressureCost: 15,
  cooldownS: 3600,
  proximity: true,
  earlyWindowGuaranteeDay: 1,
  earlyDelayS: [180, 420],
  fireWithinWu: 230,
  gates: {
    requiresCompletedShape: 'opening_hauler_raid', // the corridor remembers round one
    sectorIds: ['sector_helios_prime'],
  },
});

// The raid dissolving must not take its cast with it (same release as 344/362).
function releaseSquadToWorld(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

const COMMIT_S = 26;          // shadow window before the cutter stops being careful
const TAIL_DEADLINE_S = 150;

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + TAIL_DEADLINE_S;
    live.data.tail = { phase: 'offer', t: 0, chosen: null };

    const ids = d.spawnShips(live, live.plan.ships);
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'raider') < 1) {
      return d.abort(live, 'no_budget');
    }

    const hauler = d.entsOf(live, 'hauler')[0];
    if (hauler) {
      // The same captain, the same lot, one more run: the replacement cargo is the stake.
      const qty = 5 + Math.round(d.stream(live, 'cargo')() * 4);
      const hdata = hauler.data || (hauler.data = {});
      hdata.jobKind = 'hauler';
      hdata.cargo = { cmdty_fuel_cells: qty };
      hdata.bountyCr = 0;
      hdata.loot = null;
      hdata.freightRewardOwner = 'manifest_custody';
      live.data.freightManifest = {
        manifestId: `fm_tail_${live.id}`,
        freighterKey: `encounter:${live.id}`,
        role: 'hauler',
        lines: [{ commodityId: 'cmdty_fuel_cells', qty }],
        totalQty: qty,
      };
      hdata.cargoManifest = {
        manifestId: live.data.freightManifest.manifestId,
        freighterKey: live.data.freightManifest.freighterKey,
        role: 'hauler',
        lines: [{ commodityId: 'cmdty_fuel_cells', qty }],
        totalQty: qty,
      };
    }

    // Round one was caution; round two is a hunt. The raiders hold their first fire while
    // the decision is offered — the stalk IS the choice window.
    for (const raider of d.entsOf(live, 'raider')) {
      const data = raider.data || (raider.data = {});
      if (data.ai) data.ai.targetId = hauler.id;
      (data.combat || (data.combat = {})).targetId = null; // committed only after the fork
    }

    live.phase = 'conflict';
    d.say(live, 'alert',
      'MTS MULE: You again — small lane. Replacement lot is aboard and something is shadowing me again. I remember last time. Your call how this one goes.',
      null, { literal: true, primary: true });
    d.offerChoices(live, ['shadow', 'bait', 'decline'], 'decline', live.deadlineAt);
  },

  choose(d, live, state, choiceId) {
    const w = live.data.tail || (live.data.tail = { phase: 'offer', t: 0, chosen: null });
    if (w.chosen) return;
    const hauler = d.entsOf(live, 'hauler')[0];
    if (!hauler) return;

    if (choiceId === 'shadow') {
      // Cover until the commit: raiders open on her, and she holds course because you said so.
      w.chosen = 'shadow';
      w.phase = 'run';
      w.t = 0;
      for (const raider of d.entsOf(live, 'raider')) {
        const data = raider.data || (raider.data = {});
        (data.combat || (data.combat = {})).targetId = hauler.id;
      }
      d.say(live, 'info',
        'MTS MULE: Copy cover. I hold course and speed — you make their commit expensive.',
        null, { literal: true });
      return;
    }

    if (choiceId === 'bait') {
      // Sell the helplessness: the raiders sprint, she drifts wide, you own their rear.
      w.chosen = 'bait';
      w.phase = 'run';
      w.t = 0;
      for (const raider of d.entsOf(live, 'raider')) {
        const data = raider.data || (raider.data = {});
        (data.combat || (data.combat = {})).targetId = hauler.id;
      }
      d.say(live, 'info',
        'MTS MULE: …you are leaving? Fine. FINE. Drifting helpless, like you want. Make it count.',
        null, { literal: true });
      return;
    }

    if (choiceId === 'decline') {
      // The lane keeps its own score. The raid is already happening — the world does not
      // wait for consent; declining only means she runs it alone.
      w.chosen = 'decline';
      w.phase = 'run';
      w.t = 0;
      for (const raider of d.entsOf(live, 'raider')) {
        const data = raider.data || (raider.data = {});
        (data.combat || (data.combat = {})).targetId = hauler.id;
      }
      d.say(live, 'bark',
        'MTS MULE: Understood. See you on the next run — or not.',
        null, { literal: true });
    }
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const w = live.data.tail || (live.data.tail = { phase: 'offer', t: 0, chosen: null });
    const step = Math.max(0, now - (w.lastNow == null ? now : w.lastNow));
    w.lastNow = now;

    const custody = live.data.freightCargoCustody;
    const custodyOpen = !!(custody && custody.terminal !== true);
    const haulerAlive = d.aliveCount(live, 'hauler') > 0;
    const raidersAlive = d.aliveCount(live, 'raider') > 0;

    // Round one's grade follows the captain: lose her twice and the corridor knows why.
    const firstLost = !!(state.story && state.story.depthProgramEncounters
      && state.story.depthProgramEncounters.completed
      && state.story.depthProgramEncounters.completed.opening_hauler_raid
      && state.story.depthProgramEncounters.completed.opening_hauler_raid.outcome !== 'defended');

    if (!haulerAlive) {
      if (custodyOpen) return;
      d.rep('faction_mts', firstLost ? -6 : -3, 'salvage_tail_lost');
      d.emit('news:publish', {
        text: firstLost
          ? 'THE CORRIDOR LOST HER TWICE: the mule captain who survived the first raid went down with the replacement lot. The lane keeps what it takes.'
          : 'FREIGHTER DOWN ON THE START CORRIDOR: the replacement lot never reached the dock. The watch channel has nothing polite to say.',
        kind: 'incidents', source: 'watch-relay', sourceRef: `salvage_tail:${live.id}`,
        eventId: `salvage_tail:${live.id}`,
      });
      releaseSquadToWorld(live);
      return d.resolve(live, 'hauler_lost', { speak: true });
    }

    if (!raidersAlive) {
      if (custodyOpen) return;
      d.grant(320, 'salvage_tail:defended');
      d.rep('faction_mts', 7, 'salvage_tail_defended');
      d.emit('comms:log', {
        from: 'MTS MULE',
        text: 'Twice now. Twice you have been the reason I make this dock. The lot is yours to skim and the station will hear the whole thing.',
        kind: 'encounter',
      });
      d.emit('news:publish', {
        text: 'THE CORRIDOR HOLDS: the twice-raided mule made her dock under escort. The station pays for captains it keeps, and it keeps this one.',
        kind: 'incidents', source: 'watch-relay', sourceRef: `salvage_tail:${live.id}`,
        eventId: `salvage_tail:${live.id}`,
      });
      if (haulerAlive && d.entsOf(live, 'hauler')[0].data) d.entsOf(live, 'hauler')[0].data.despawnAt = now + 20;
      releaseSquadToWorld(live);
      return d.resolve(live, 'defended', { speak: false });
    }

    if (w.phase === 'offer' && now - live.startedAt >= COMMIT_S) {
      // The stalk does not wait forever: no answer reads as an answer.
      d.say(live, 'danger',
        'RAIDER: She is stalling. Take her — the escort never showed.',
        null, { literal: true });
      const hauler = d.entsOf(live, 'hauler')[0];
      if (hauler) {
        for (const raider of d.entsOf(live, 'raider')) {
          const data = raider.data || (raider.data = {});
          (data.combat || (data.combat = {})).targetId = hauler.id;
        }
      }
      w.phase = 'run';
      w.chosen = w.chosen || 'unanswered';
    }

    if (now >= live.deadlineAt) {
      // The tail ends: raiders break off hungry, the captain keeps her lot, the corridor
      // keeps its rumor. Everything alive stays alive.
      releaseSquadToWorld(live);
      return d.resolve(live, 'tail_over', { speak: false });
    }
  },

});

export default defineEncounter(trigger, {
  shape: {
    situation: 'convoy',
    place: trigger.zoneTypes,
    twist: 'named',
    actor: 'faction_reach',
  },
  motive: 'revenge_raid',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE SALVAGE TAIL',
  primaryLine: 'MTS MULE: Replacement lot aboard, and something is shadowing me again. Your call how this one goes.',
  squad: {
    anchorArchetype: 'corsair_raider',
    archetypes: ['corsair_raider', 'reaver_pirate'],
    size: [2, 3],
    clusterRadius: 120,
    minSeparation: 40,
    doctrine: 'thief',
    formation: 'line',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  choices: [
    { id: 'shadow', label: 'Fly cover until they commit', playerLine: 'Hold course. Make their commit expensive.' },
    { id: 'bait', label: 'Peel off and sell the bait', playerLine: 'Drift helpless. Let them sprint.' },
    { id: 'decline', label: 'Leave her to the lane', playerLine: 'Not my run.' },
  ],
  timeoutChoice: 'decline',
  receipts: {
    defended: 'THE TAIL IS BROKEN — the twice-raided captain made her dock, and the corridor has a name for the escort now.',
    hauler_lost: 'THE CORRIDOR LOST HER — the replacement lot is spillage on the start lane, and the watch channel is not polite about it.',
    tail_over: 'THE TAIL SLIPPED — the raider broke off hungry and the captain kept her lot this time. Next run is nobody\'s promise.',
  },
});
