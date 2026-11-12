import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { varianceAdjustmentBerth } from '../src/systems/varianceAdjustmentBerth.js';
import { createSlateColumn } from '../src/systems/slateColumn.js';
import { scanner } from '../src/systems/scanner.js';
import { VARIANCE_ADJUSTMENT_BERTH as VA } from '../src/data/varianceAdjustmentBerth.js';
import { sectorGlobalOrigin, sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  contactHailAvailability,
  createContactHailOffer,
  createContactHailResponse,
} from '../src/data/contactHail.js';

function setup() {
  const state = createGameState(7781);
  state.world.currentSectorId = VA.sectorId;
  state.mode = 'flight';
  state.run = { ...(state.run || {}), kind: 'adventure' };
  state.story = { ...(state.story || {}), flags: {} };
  state.spawnBudget = { max: 24 };
  const sim = createSimulation({
    state,
    systems: [spawnBudget, varianceAdjustmentBerth],
    updateOrder: [],
  });
  return { state, sim, bus: sim.bus, helpers: sim.helpers };
}

function stationSpec() {
  const pos = sectorLocalToGlobalForSector({ x: -820, z: 280 }, VA.sectorId, {});
  const origin = sectorGlobalOrigin(VA.sectorId);
  const corridorBearingDeg = Math.atan2(origin.z - pos.z, origin.x - pos.x) * 180 / Math.PI;
  return {
    type: 'station', factionId: 'faction_dmc', pos,
    radius: 26, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
    data: { stationId: VA.stationId, collisionProxy: 'station_ring_hub',
      dockRadius: 60, corridorBearingDeg },
  };
}

function hail(state, sim, target) {
  const player = sim.spawn({
    type: 'ship', isPlayer: true, team: 2, pos: { x: target.pos.x + 50, y: 0, z: target.pos.z },
    radius: 12, mass: 18, data: { defId: 'ship_kestrel', hullDefId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  state.player.targetId = target.id;
  const availability = contactHailAvailability(state);
  const offer = createContactHailOffer(state, availability, 'va-test', 20);
  return { player, availability, offer };
}

test('ring-hub fixture: VA hail reads the exact live identity and Slate ledger without mutation', () => {
  const h = setup();
  h.sim.spawn(stationSpec());
  h.bus.emit('sector:enter', { sectorId: VA.sectorId });
  const target = [...h.state.entities.values()].find((entity) => entity.data?.varianceAdjustmentId === VA.actorId);
  assert.ok(target);

  const slate = createSlateColumn();
  slate.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  const { player, availability, offer } = hail(h.state, h.sim, target);
  assert.equal(availability.kind, 'variance_adjustment');
  assert.equal(offer.kind, 'variance_adjustment');
  const before = structuredClone(h.state.story.flags);
  const zero = createContactHailResponse(h.state, offer, 'status');
  const identify = createContactHailResponse(h.state, offer, 'identify');
  assert.match(zero.lines[0], /CURRENT SLATE LEDGER: NO WELD-SPIKES LOGGED YET/);
  assert.match(identify.lines[0], /WORKSHOP RECORD/);
  assert.doesNotMatch(identify.lines[0], /failed at four/);
  assert.deepEqual(h.state.story.flags, before, 'hail and identify do not write story state');

  h.bus.emit('service:completed', { type: 'repair', restoredHull: 8, shipId: player.id });
  assert.equal(h.state.story.flags.slate_spikes, 1, 'the existing Slate owner records the actual weld receipt');
  const afterRepair = createContactHailResponse(h.state, offer, 'status');
  assert.match(afterRepair.lines[0], /CURRENT SLATE LEDGER: 1 WELD-SPIKE LOGGED/);
  const ledgerAfterRepair = h.state.story.flags.slate_spikes;
  h.bus.emit('save:loaded', {});
  const afterContinue = createContactHailResponse(h.state, offer, 'status');
  assert.match(afterContinue.lines[0], /CURRENT SLATE LEDGER: 1 WELD-SPIKE LOGGED/);
  assert.equal(h.state.story.flags.slate_spikes, ledgerAfterRepair,
    'Continue leaves the serialized ledger intact and the response only reads it');

  assert.equal(createContactHailResponse(h.state, { ...offer, targetId: 'wrong-id' }, 'status'), null);
  const unrelated = h.sim.spawn({
    type: 'ship', isPlayer: false, team: 2, pos: { x: player.pos.x + 40, y: 0, z: player.pos.z },
    radius: 12, mass: 68, data: { defId: 'ship_hawser', hullDefId: 'ship_hawser',
      trafficRole: 'tug', ai: { passive: true } },
  });
  h.state.player.targetId = unrelated.id;
  assert.notEqual(contactHailAvailability(h.state).kind, 'variance_adjustment',
    'ordinary Hawser/tug traffic cannot inherit the named berth identity');
  slate.destroy();
  h.sim.dispose();
});

test('ring-hub fixture: real scanner choices return VA STATUS/IDENTIFY and reject expiry/recycled body', () => {
  const h = setup();
  h.sim.spawn(stationSpec());
  h.bus.emit('sector:enter', { sectorId: VA.sectorId });
  const target = [...h.state.entities.values()].find((entity) => entity.data?.varianceAdjustmentId === VA.actorId);
  assert.ok(target);
  const { player } = hail(h.state, h.sim, target);
  h.state.simTime = 10;

  const offers = [];
  const responses = [];
  const clears = [];
  h.bus.on('contactHail:offer', (payload) => offers.push(payload));
  h.bus.on('contactHail:response', (payload) => responses.push(payload));
  h.bus.on('contactHail:clear', (payload) => clears.push(payload));
  const scannerOwner = Object.create(scanner);
  scannerOwner.init({ state: h.state, bus: h.bus, helpers: h.helpers, registry: h.sim.registry });
  const before = structuredClone({
    flags: h.state.story.flags,
    credits: h.state.player.credits,
    cargo: h.state.player.cargo,
    ownedShips: h.state.player.ownedShips,
    activeShipIndex: h.state.player.activeShipIndex,
    targetId: h.state.player.targetId,
    actorData: target.data,
  });

  h.bus.emit('contactHail:request', { targetId: target.id });
  const statusOffer = offers.at(-1);
  assert.equal(statusOffer.kind, 'variance_adjustment');
  assert.deepEqual(statusOffer.actions.map((row) => row.id), ['status', 'identify']);
  h.bus.emit('contactHail:choice', {
    requestId: statusOffer.requestId, targetId: target.id, choice: 'status',
  });
  assert.match(responses.at(-1).lines[0], /CURRENT SLATE LEDGER/);

  h.bus.emit('contactHail:request', { targetId: target.id });
  const identifyOffer = offers.at(-1);
  h.bus.emit('contactHail:choice', {
    requestId: identifyOffer.requestId, targetId: target.id, choice: 'identify',
  });
  assert.match(responses.at(-1).lines[0], /WORKSHOP RECORD/);
  assert.equal(responses.length, 2);

  h.bus.emit('contactHail:request', { targetId: target.id });
  const expiredOffer = offers.at(-1);
  h.state.simTime = expiredOffer.expiresAt;
  h.bus.emit('contactHail:choice', {
    requestId: expiredOffer.requestId, targetId: target.id, choice: 'status',
  });
  assert.equal(responses.length, 2, 'scanner refuses a choice exactly at expiry');
  assert.equal(clears.at(-1)?.reason, 'choice_invalid');

  h.state.simTime += 1;
  h.bus.emit('contactHail:request', { targetId: target.id });
  const recycledOffer = offers.at(-1);
  const recycled = structuredClone(target);
  recycled.id = target.id;
  recycled.alive = true;
  h.state.entities.set(target.id, recycled);
  h.bus.emit('contactHail:choice', {
    requestId: recycledOffer.requestId, targetId: target.id, choice: 'status',
  });
  assert.equal(responses.length, 2, 'scanner binds its offer to the exact live body, not only its ID');
  assert.equal(clears.at(-1)?.reason, 'choice_invalid');
  assert.deepEqual(structuredClone({
    flags: h.state.story.flags,
    credits: h.state.player.credits,
    cargo: h.state.player.cargo,
    ownedShips: h.state.player.ownedShips,
    activeShipIndex: h.state.player.activeShipIndex,
    targetId: h.state.player.targetId,
    actorData: target.data,
  }), before, 'the actual scanner HAIL path does not write player, actor, or story state');

  assert.equal(h.state.entities.get(player.id), player);
  scannerOwner.destroy();
  h.sim.dispose();
});
