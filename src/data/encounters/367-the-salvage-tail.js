// 367 — THE SALVAGE TAIL. The opening raid's second chapter: a replacement fuel lot
// runs the corridor under a Reach tail. The first raid's recorded outcome may have been
// a loss, so continuity belongs to the cargo run, not an invented surviving captain. The world remembers the first fight, and this one
// asks for a decision instead of a reflex: fly cover until the raider commits, peel off and
// sell the bait, or leave her to the lane. The gate is the memory: this beat cannot fire
// unless the opening raid actually happened in this save.
import { deepFreeze, defineEncounter } from './catalog.js';
import { ensurePhysicsBodySpec } from '../../core/physicsAuthority.js';

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


const tails = new WeakMap();
const BAIT_SLIP_S = 3;

// Temporary control of original occupants, never a persistent traffic job.
function sameActor(state, live, item) {
  const e = item.actor;
  return state.entities.get(e.id) === e && e.occupantGeneration === item.generation
    && e.physicsBody === item.body && e.data?.ai === item.ai
    && !e.flags?.persistent && e.id !== state.playerId
    && e.data.ai.encounterId === live.id && e.data.ai.encounterRole === item.role
    && e.data.ai.sectorId === live.sectorId
    && live.roles[e.id] === item.role && live.ids.includes(e.id);
}
function releaseFireHold(state, own) {
  for (const item of own.raiders) {
    const e = item.actor;
    if (state.entities.get(e.id) !== e || e.occupantGeneration !== item.generation
      || e.physicsBody !== item.body || e.data?.ai !== item.ai || item.ai.arrivalHoldUntil !== item.hold) continue;
    if (item.previousHold === undefined) delete item.ai.arrivalHoldUntil;
    else item.ai.arrivalHoldUntil = item.previousHold;
  }
}
function stopTail(state, live, custody = false) {
  const own = tails.get(live);
  if (!own || own.stopped) return;
  own.stopped = true;
  releaseFireHold(state, own);
  const e = own.mule.actor;
  if (state.entities.get(e.id) === e && e.occupantGeneration === own.mule.generation
    && e.physicsBody === own.mule.body && e.data?.ai === own.mule.ai
    && e.data?.intent === own.intent) {
    own.intent.moveX = own.intent.moveZ = 0;
    if (custody || own.previousIntent === undefined) delete e.data.intent;
    else e.data.intent = own.previousIntent;
  }
  for (const off of own.off) if (typeof off === 'function') off();
  own.off.length = 0;
}
function commitTail(d, state, live, own, reason) {
  if (own.committed || own.stopped || live.data.tail.terminalPending) return;
  own.committed = true;
  releaseFireHold(state, own);
  for (const item of own.raiders) {
    if (sameActor(state, live, item) && item.actor.alive) {
      (item.actor.data.combat ||= {}).targetId = own.mule.actor.id;
    }
  }
  live.data.tail.phase = 'run';
  if (!live.data.tail.chosen) {
    live.data.tail.chosen = 'unanswered';
    live.offerConsumed = true;
    // The same decision becomes an honest choiceless watch, not an ignored live button.
    d.emit('encounter:waitStarted', {
      encounterId: live.id, reason: 'tail_committed', deadlineAt: live.deadlineAt,
    });
  }
  if (own.stopped || live.phase === 'done') return;
  if (reason !== 'bait' && reason !== 'decline') d.say(live, 'danger',
    reason === 'damage'
      ? 'RAIDER: Forget the stalk — take the lot!'
      : 'RAIDER: Enough shadowing. Take the replacement lot!',
    null, { literal: true });
}
function beginTail(d, state, live, hauler) {
  const snapshot = (actor, role) => {
    ensurePhysicsBodySpec(actor);
    return { actor, role, generation: actor.occupantGeneration,
      body: actor.physicsBody, ai: actor.data.ai };
  };
  const own = {
    mule: snapshot(hauler, 'hauler'),
    raiders: d.entsOf(live, 'raider').map(e => snapshot(e, 'raider')),
    previousIntent: hauler.data.intent,
    intent: { moveX: 0, moveZ: 0.22, boost: false, fire: false,
      turnIntent: 0, aimAngle: hauler.rot, assistMode: 'assisted' },
    commitAt: live.startedAt + COMMIT_S, committed: false, stopped: false, off: [],
  };
  tails.set(live, own);
  hauler.data.intent = own.intent;
  for (const item of own.raiders) {
    item.previousHold = item.ai.arrivalHoldUntil;
    item.hold = Math.max(own.commitAt, Number(item.previousHold) || 0);
    item.ai.arrivalHoldUntil = item.hold;
  }
  if (d.bus?.on) {
    own.off.push(d.bus.on('encounter:resolved', p => {
      if (p?.encounterId === live.id) stopTail(state, live);
    }));
    for (const event of ['save:restoring', 'sector:exit', 'game:exitToMenu', 'game:new']) {
      own.off.push(d.bus.on(event, () => stopTail(state, live)));
    }
    own.off.push(d.bus.on('ship:controlChanging', p => {
      if ([own.mule, ...own.raiders].some(item => state.entities.get(item.actor.id) === item.actor
        && item.actor.occupantGeneration === item.generation && item.actor.physicsBody === item.body
        && (p?.toId === item.actor.id || p?.fromId === item.actor.id))) stopTail(state, live, true);
    }));
    own.off.push(d.bus.on('ship:captured', p => {
      if ([own.mule, ...own.raiders].some(item => state.entities.get(item.actor.id) === item.actor
        && item.actor.occupantGeneration === item.generation && item.actor.physicsBody === item.body
        && p?.targetId === item.actor.id && item.actor.flags?.persistent
        && p.vesselId === item.actor.data?.vesselId)) stopTail(state, live, true);
    }));
    own.off.push(d.bus.on('combat:damage', p => {
      if (!(p?.amount > 0) || p.attackerId === p.targetId) return;
      if ([own.mule, ...own.raiders].some(item => item.actor.id === p.targetId
        && sameActor(state, live, item))) commitTail(d, state, live, own, 'damage');
    }));
  }
  return own;
}

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
      // Another corridor run: the replacement cargo is the stake.
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

    beginTail(d, state, live, hauler);
    live.phase = 'conflict';
    d.say(live, 'alert',
      'MTS MULE: The first raid is on the watch record. Replacement fuel cells aboard, and a Reach pack is stalking this run. Cover my burn or let me sell the bait?',
      null, { literal: true, primary: true });
    d.offerChoices(live, ['shadow', 'bait', 'decline'], 'decline', live.startedAt + COMMIT_S);
  },

  choose(d, live, state, choiceId) {
    const w = live.data.tail || (live.data.tail = { phase: 'offer', t: 0, chosen: null });
    if (w.chosen || w.terminalPending) return;
    const hauler = d.entsOf(live, 'hauler')[0];
    if (!hauler) return;

    const own = tails.get(live);
    if (!own || own.stopped || !sameActor(state, live, own.mule)) return;
    if (choiceId === 'shadow') {
      w.chosen = 'shadow';
      w.phase = 'shadow';
      d.say(live, 'info',
        'MTS MULE: Copy cover. Holding a steady burn. Stay with me until they open fire; shooting first breaks their stalk.',
        null, { literal: true });
      return;
    }
    if (choiceId === 'bait') {
      w.chosen = 'bait';
      own.slipUntil = d.now() + BAIT_SLIP_S;
      own.intent.moveX = 0.5;
      own.intent.moveZ = 0;
      own.intent.assistMode = 'newtonian';
      commitTail(d, state, live, own, 'bait');
      d.say(live, 'info',
        'MTS MULE: Selling the bait. Brief side burn, then engines idle. They are coming for my lot — peel round behind them.',
        null, { literal: true });
      return;
    }
    if (choiceId === 'decline') {
      w.chosen = 'decline';
      commitTail(d, state, live, own, 'decline');
      d.say(live, 'bark',
        'MTS MULE: Understood. Keeping my burn. See you on the next run — or not.',
        null, { literal: true });
    }
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const w = live.data.tail || (live.data.tail = { phase: 'offer', t: 0, chosen: null });
    if (w.terminalPending) return;
    const step = Math.max(0, now - (w.lastNow == null ? now : w.lastNow));
    w.lastNow = now;

    const own = tails.get(live);
    // Missing/replaced/captured occupants are interruptions, not evidence of destruction.
    if (!own || own.stopped || state.mode !== 'flight'
      || state.world.currentSectorId !== live.sectorId
      || [own.mule, ...own.raiders].some(item =>
        !sameActor(state, live, item)
        && !(item.actor.alive === false && !item.actor.flags?.persistent
          && item.actor.occupantGeneration === item.generation && item.actor.data?.ai === item.ai
          && (state.entities.get(item.actor.id) === item.actor || !state.entities.has(item.actor.id))))
      || (own.mule.actor.alive !== false && own.mule.actor.data?.intent !== own.intent)) {
      stopTail(state, live, true);
      releaseSquadToWorld(live);
      return d.resolve(live, 'interrupted', { speak: false });
    }
    if (own.slipUntil != null && now >= own.slipUntil) own.intent.moveX = 0;
    if (!own.committed && now >= own.commitAt) commitTail(d, state, live, own, 'elapsed');

    const custody = live.data.freightCargoCustody;
    const custodyOpen = !!(custody && custody.terminal !== true);
    const haulerAlive = d.aliveCount(live, 'hauler') > 0;
    const raidersAlive = d.aliveCount(live, 'raider') > 0;

    // The first lot's recorded outcome grades a second loss; it does not prove captain identity.
    const firstLost = !!(state.story && state.story.depthProgramEncounters
      && state.story.depthProgramEncounters.completed
      && state.story.depthProgramEncounters.completed.opening_hauler_raid
      && state.story.depthProgramEncounters.completed.opening_hauler_raid.outcome !== 'defended');

    if (!haulerAlive) {
      if (custodyOpen) return;
      w.terminalPending = true;
      d.rep('faction_mts', firstLost ? -6 : -3, 'salvage_tail_lost');
      if (own.stopped || live.phase === 'done') return;
      d.emit('news:publish', {
        text: firstLost
          ? 'SECOND LOT LOST: after the first raid went against the convoy, the replacement run lost its hauler too. The lane keeps what it takes.'
          : 'FREIGHTER DOWN ON THE START CORRIDOR: the replacement lot never reached the dock. The watch channel has nothing polite to say.',
        kind: 'incidents', source: 'watch-relay', sourceRef: `salvage_tail:${live.id}`,
        eventId: `salvage_tail:${live.id}`,
      });
      if (own.stopped || live.phase === 'done') return;
      stopTail(state, live);
      releaseSquadToWorld(live);
      return d.resolve(live, 'hauler_lost', { speak: true });
    }

    if (!raidersAlive) {
      if (custodyOpen) return;
      w.terminalPending = true;
      d.grant(320, 'salvage_tail:defended');
      if (own.stopped || live.phase === 'done') return;
      d.rep('faction_mts', 7, 'salvage_tail_defended');
      if (own.stopped || live.phase === 'done') return;
      d.emit('comms:log', {
        from: 'MTS MULE',
        text: 'The tail is broken. This replacement lot is still aboard, and the station will hear about your cover.',
        kind: 'encounter',
      });
      if (own.stopped || live.phase === 'done') return;
      d.emit('news:publish', {
        text: 'THE CORRIDOR HOLDS: the replacement-run mule survived its pursuers under escort. The lot is still aboard; the station paid for the cover.',
        kind: 'incidents', source: 'watch-relay', sourceRef: `salvage_tail:${live.id}`,
        eventId: `salvage_tail:${live.id}`,
      });
      if (own.stopped || live.phase === 'done') return;
      if (haulerAlive && d.entsOf(live, 'hauler')[0].data) d.entsOf(live, 'hauler')[0].data.despawnAt = now + 20;
      stopTail(state, live);
      releaseSquadToWorld(live);
      return d.resolve(live, 'defended', { speak: false });
    }

    if (now >= live.deadlineAt) {
      w.terminalPending = true;
      // This local watch ends, not the world fight. No offscreen victory or stolen cargo.
      stopTail(state, live);
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
  primaryLine: 'MTS MULE: Replacement lot aboard, and a Reach pack is shadowing this run. Your call how this one goes.',
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
    defended: 'THE TAIL IS BROKEN — the replacement-run captain and lot survived, and the corridor has a name for the escort now.',
    hauler_lost: 'THE CORRIDOR LOST HER — the replacement lot is spillage on the start lane, and the watch channel is not polite about it.',
    tail_over: 'THE WATCH ENDED — the captain and her pursuers are still in the lane. No dock arrival or broken tail is confirmed.',
  },
});
