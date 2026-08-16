import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { economy } from '../src/systems/economy.js';
import {
  heat,
  heatClearSecondsForLevel,
  heatLevelFor,
  heatRestitutionCost,
  isPlayerWanted,
} from '../src/systems/heat.js';
import { serviceQuote } from '../src/ui/screens/services.js';

function runtime({ heatValue = 0, credits = 5000, dockedStationId = 'station_helios' } = {}) {
  const bus = createBus();
  const playerEntity = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    flags: { docked: !!dockedStationId },
  };
  const state = {
    mode: dockedStationId ? 'station' : 'flight',
    simTime: 0,
    playerId: playerEntity.id,
    entityList: [playerEntity],
    entities: new Map([[playerEntity.id, playerEntity]]),
    ui: { dockedStationId },
    player: { credits, heat: heatValue, flags: { docked: !!dockedStationId } },
    factions: { faction_scn: { rep: 23, aggro: false } },
  };
  const heatSystem = Object.create(heat);
  heatSystem.init({ state, bus });
  const economySystem = Object.create(economy);
  economySystem.state = state;
  economySystem.bus = bus;
  economySystem._lastDockedStation = dockedStationId;
  return { bus, state, playerEntity, heatSystem, economySystem };
}

test('a witnessed crime cools only after one bounded local search window and never changes reputation', () => {
  const h = runtime({ dockedStationId: null });
  const factionsBefore = structuredClone(h.state.factions);
  h.bus.emit('entity:killed', {
    killerId: h.state.playerId,
    victimClass: 'ship',
    targetHostileToPlayer: false,
  });

  assert.equal(isPlayerWanted(h.state), true);
  assert.equal(heatLevelFor(h.state.player.heat), 1);
  assert.equal(h.state.player.heatZone.active, true);
  const clearAfterS = h.state.player.heatZone.clearAfterS;
  assert.equal(clearAfterS, heatClearSecondsForLevel(1));
  assert.ok(clearAfterS >= 300 && clearAfterS <= 900);

  h.playerEntity.pos.x = h.state.player.heatZone.radius + 10;
  h.heatSystem.update(clearAfterS / 2, h.state);
  assert.equal(isPlayerWanted(h.state), true, 'leaving briefly does not erase a witnessed response');

  h.playerEntity.pos.x = 0;
  h.heatSystem.update(1, h.state);
  assert.equal(h.state.player.heatZone.outsideS, 0, 'returning to the witnessed area resets escape');

  h.playerEntity.pos.x = h.state.player.heatZone.radius + 10;
  h.heatSystem.update(clearAfterS - 1, h.state);
  assert.equal(isPlayerWanted(h.state), true, 'response remains through the final second');
  h.heatSystem.update(1, h.state);

  assert.equal(h.state.player.heat, 0);
  assert.equal(isPlayerWanted(h.state), false);
  assert.equal(h.state.player.heatZone.active, false);
  assert.deepEqual(h.state.factions, factionsBefore, 'an ordinary local incident never becomes reputation');
});

test('local search windows are monotonic and stay inside the authored five-to-fifteen-minute band', () => {
  const windows = [1, 2, 3, 4, 5].map(heatClearSecondsForLevel);
  assert.deepEqual(windows, [300, 450, 600, 750, 900]);
});

test('every station quotes restitution from canonical heat tier and payment clears WANTED once', () => {
  for (const stationId of ['station_helios', 'station_beltout', 'station_tethys_black']) {
    const h = runtime({ heatValue: 0.62, credits: 5000, dockedStationId: stationId });
    const cost = heatRestitutionCost(h.state.player.heat);
    const quote = serviceQuote('restitution', h.state, h.playerEntity);
    const creditChanges = [];
    const heatChanges = [];
    const completions = [];
    h.bus.on('credits:changed', (payload) => creditChanges.push(payload));
    h.bus.on('heat:changed', (payload) => heatChanges.push(payload));
    h.bus.on('service:completed', (payload) => completions.push(payload));

    assert.equal(quote.disabled, false);
    assert.equal(quote.cost, cost);
    assert.match(quote.detail, /settle at any station/);
    h.economySystem.handleService({ type: 'restitution', amount: 0 });

    assert.equal(h.state.player.credits, 5000 - cost);
    assert.equal(h.state.player.heat, 0);
    assert.equal(creditChanges.length, 1);
    assert.equal(creditChanges[0].reason, 'service:restitution');
    assert.equal(heatChanges.length, 1);
    assert.equal(heatChanges[0].reason, 'restitution paid');
    assert.deepEqual(completions, [{
      type: 'restitution', cost, stationId, atT: 0,
    }]);
  }
});

test('restitution fails closed when undocked or short of credits and is reachable on the default station shell', () => {
  const undocked = runtime({ heatValue: 0.4, credits: 5000, dockedStationId: null });
  const hotBefore = undocked.state.player.heat;
  undocked.economySystem.handleService({ type: 'restitution' });
  assert.equal(undocked.state.player.heat, hotBefore);
  assert.equal(undocked.state.player.credits, 5000);

  const poor = runtime({ heatValue: 0.4, credits: 1 });
  const quote = serviceQuote('restitution', poor.state, poor.playerEntity);
  assert.equal(quote.disabled, true);
  poor.economySystem.handleService({ type: 'restitution' });
  assert.equal(poor.state.player.heat, 0.4);
  assert.equal(poor.state.player.credits, 1);

  const stationSource = readFileSync(new URL('../src/ui/station/stationApp.js', import.meta.url), 'utf8');
  assert.match(stationSource, /data-vital-act="\$\{id\}"/);
  assert.match(stationSource, /vitalActHtml\('restitution'/);
  assert.match(stationSource, /restitution:\s*'restitution'/);
});
