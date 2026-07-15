import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { save } from '../src/save/saveSystem.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { ships } from '../src/systems/ships.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { uniqueWreckMapReadouts } from '../src/ui/uniqueWreckMapLayer.js';

const WRECK_ID = 'wreck_choir_tender';
const UNIQUE_DROP_ID = 'unique_knitbots';

function boot(seed = 98271) {
  const sim = createSimulation({
    seed,
    systems: [salvageActions, uniqueWrecks, cargo, economy, ships, factions],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.cargo.capVolume = 100;
  state.player.cargo.capMass = 1e9;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  sim.registry.get('factions').newGame();
  const events = [];
  for (const name of [
    'uniqueWreck:decisionReady', 'uniqueWreck:resolved', 'uniqueWreck:salvaged',
    'module:granted', 'economy:grantCredits', 'faction:repDelta', 'toast',
  ]) bus.on(name, (payload) => events.push({ name, payload }));
  return { sim, state, bus, events, system: sim.registry.get('uniqueWrecks') };
}

function reachDecision(t) {
  t.bus.emit('news:headline', {
    wreckId: WRECK_ID,
    sourceRef: 'news.tragedy_at_helios',
    channelId: 'news',
  });
  const record = t.state.player.uniqueWrecks.bearings[WRECK_ID];
  t.bus.emit('scan:pulse', { pos: { ...record.exactPos } });
  const wreck = t.state.entityList.find((entity) => entity.data?.uniqueWreckId === WRECK_ID);
  assert.ok(wreck, 'named wreck is physically present before recovery');
  t.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
  return t.state.player.uniqueWrecks.bearings[WRECK_ID];
}

function moduleCount(t) {
  return t.state.player.moduleInventory.filter((item) => item?.defId === UNIQUE_DROP_ID).length;
}

test('beam recovery opens a named take-or-handover decision before any named reward settles', () => {
  const t = boot();
  try {
    const record = reachDecision(t);
    assert.equal(record.phase, 'decision');
    assert.equal(record.choiceId, null);
    assert.equal(moduleCount(t), 0, 'unique hardware is withheld until the player chooses');
    assert.equal(t.state.player.cargo.items.cmdty_medical || 0, 0);

    const event = t.events.find((entry) => entry.name === 'uniqueWreck:decisionReady');
    assert.equal(event.payload.wreckId, WRECK_ID);
    assert.match(event.payload.headline, /CHOIR-TENDER/i);
    assert.equal(event.payload.choices.length, 2);
    assert.deepEqual(event.payload.choices.map((choice) => choice.id), ['claim_hardware', 'authority_handover']);
    assert.equal(event.payload.choices.every((choice) => choice.label && choice.consequence), true);

    const [map] = uniqueWreckMapReadouts(t.state, 'sector_helios_prime');
    assert.equal(map.phase, 'decision');
    assert.equal(map.courseTarget, null, 'a dismantled wreck cannot remain a stale course target');
    assert.match(map.statusLabel, /decision/i);
    assert.match(map.objective, /choose/i);
  } finally {
    t.sim.dispose();
  }
});

test('claiming unique hardware uses ship and cargo authorities once and records the legal consequence', () => {
  const t = boot();
  try {
    reachDecision(t);
    const repBefore = t.state.factions.faction_scn.rep;
    t.bus.emit('uniqueWreck:choose', { wreckId: WRECK_ID, choiceId: 'claim_hardware', source: 'test' });

    const record = t.state.player.uniqueWrecks.bearings[WRECK_ID];
    assert.equal(record.phase, 'salvaged');
    assert.equal(record.choiceId, 'claim_hardware');
    assert.equal(record.outcome, 'claimed');
    assert.equal(moduleCount(t), 1);
    assert.equal(t.state.player.cargo.items.cmdty_medical, 50);
    assert.equal(t.state.factions.faction_scn.rep < repBefore, true);
    assert.match(record.rewardReceipt.title, /KNITBOTS/i);
    assert.match(record.rewardReceipt.detail, /Choir-Tender/i);

    t.bus.emit('uniqueWreck:choose', { wreckId: WRECK_ID, choiceId: 'claim_hardware', source: 'duplicate' });
    assert.equal(moduleCount(t), 1);
    assert.equal(t.state.player.cargo.items.cmdty_medical, 50);
    assert.equal(t.events.filter((entry) => entry.name === 'module:granted').length, 1);
    assert.equal(t.events.filter((entry) => entry.name === 'uniqueWreck:resolved').length, 1);
    assert.equal(t.events.filter((entry) => entry.name === 'toast'
      && /KNITBOTS CLAIMED/i.test(String(entry.payload?.text || ''))).length, 0,
    'the dedicated recovery receipt owns settlement presentation without a duplicate long toast');
  } finally {
    t.sim.dispose();
  }
});

test('authority handover is a mutually exclusive credits-and-reputation settlement', () => {
  const t = boot();
  try {
    reachDecision(t);
    const creditsBefore = t.state.player.credits;
    const repBefore = t.state.factions.faction_scn.rep;
    t.bus.emit('uniqueWreck:choose', { wreckId: WRECK_ID, choiceId: 'authority_handover', source: 'test' });

    const record = t.state.player.uniqueWrecks.bearings[WRECK_ID];
    assert.equal(record.phase, 'salvaged');
    assert.equal(record.outcome, 'handed_over');
    assert.equal(moduleCount(t), 0);
    assert.equal(t.state.player.cargo.items.cmdty_medical || 0, 0);
    assert.equal(t.state.player.credits > creditsBefore, true);
    assert.equal(t.state.factions.faction_scn.rep > repBefore, true);
    assert.match(record.rewardReceipt.title, /RELIEF CLAIM/i);

    assert.equal(t.events.filter((entry) => entry.name === 'economy:grantCredits').length, 1);
    assert.equal(t.events.filter((entry) => entry.name === 'faction:repDelta').length, 1);
    t.bus.emit('uniqueWreck:choose', { wreckId: WRECK_ID, choiceId: 'claim_hardware', source: 'duplicate' });
    assert.equal(moduleCount(t), 0, 'the alternate branch cannot be collected after settlement');
  } finally {
    t.sim.dispose();
  }
});

test('an unresolved decision survives player save/load and re-publishes its actionable readout', () => {
  const a = boot(17731);
  try {
    reachDecision(a);
    const serializedPlayer = save._serializePlayer.call({ state: a.state });

    const b = boot(17731);
    try {
      save._restorePlayer.call({ state: b.state }, serializedPlayer);
      b.bus.emit('save:loaded', {});
      const restored = b.state.player.uniqueWrecks.bearings[WRECK_ID];
      assert.equal(restored.phase, 'decision');
      assert.equal(restored.choiceId, null);
      assert.equal(b.state.entityList.some((entity) => entity.data?.uniqueWreckId === WRECK_ID), false,
        'Continue cannot respawn the dismantled physical wreck while settlement is pending');
      assert.equal(b.events.filter((entry) => entry.name === 'uniqueWreck:decisionReady').length, 1);

      b.bus.emit('uniqueWreck:decisionRequest', { source: 'priority-alert-cleared' });
      assert.equal(b.events.filter((entry) => entry.name === 'uniqueWreck:decisionReady').length, 2,
        'a suppressed recovery panel can request the same durable decision again');

      b.bus.emit('uniqueWreck:choose', { wreckId: WRECK_ID, choiceId: 'claim_hardware', source: 'continue' });
      assert.equal(moduleCount(b), 1);
      assert.equal(b.state.player.uniqueWrecks.bearings[WRECK_ID].phase, 'salvaged');
    } finally {
      b.sim.dispose();
    }
  } finally {
    a.sim.dispose();
  }
});
