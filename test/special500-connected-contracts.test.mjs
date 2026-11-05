import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSpecial500Confessional } from '../src/systems/special500Confessional.js';
import { createSpecial500DeathBell } from '../src/systems/special500DeathBell.js';
import { economy } from '../src/systems/economy.js';
import { rememberMoralDebt } from '../src/systems/moralMemory.js';
import { MAIL_LETTERS } from '../src/data/mail.js';
import { PRODUCTION_INIT_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';

function fixture() {
  const state = createGameState(4242), bus = createBus();
  state.simTime = 20;
  state.player.credits = 100;
  state.story = { flags: {} };
  rememberMoralDebt(state, { id: 'incoming-test-debt', cause: 'moral_trap:test', partyId: 'test-party' });
  const owner = Object.create(economy);
  owner.state = state; owner.bus = bus;
  bus.on('economy:chargeCredits', p => owner._onChargeCreditsRequest(p));
  const system = createSpecial500Confessional();
  system.init({ state, bus });
  const offers = [], receipts = [];
  bus.on('special500:confessional', p => offers.push(p));
  bus.on('special500:confessionalReceipt', p => receipts.push(p));
  return { state, bus, system, offers, receipts };
}

test('three incoming owners resolve in the production Node factory and manifest', () => {
  const lookup = getNodeSystemFactoryTable();
  for (const id of ['special500Confessional', 'special500DeathBell', 'special500ForgeKaraoke']) {
    assert.ok(PRODUCTION_INIT_ORDER.includes(id), id);
    assert.equal(lookup.get(id)?.name, id);
  }
});

test('confessional public choice is in the main-to-simulation bridge', () => {
  assert.ok(MAIN_TO_SIM_BUS_EVENTS.has('ui:confessionalChoose'));
});

test('offered confession pays exactly once through real economy exact-charge contract', () => {
  const f = fixture();
  f.bus.emit('dock:docked', { stationId: 'station_forge' });
  assert.equal(f.offers.length, 1, 'real moral ledger produces an offer');
  const choice = { ...f.offers[0], choice: 'file' };
  f.bus.emit('ui:confessionalChoose', choice);
  assert.equal(f.state.player.credits, 60);
  assert.ok(f.state.story.flags.guilt_filed);
  f.bus.emit('ui:confessionalChoose', choice);
  assert.equal(f.state.player.credits, 60);
});

test('unsolicited decline cannot permanently close a booth never offered', () => {
  const f = fixture();
  f.bus.emit('ui:confessionalChoose', { choice: 'decline' });
  assert.equal(f.state.story.flags.guilt_tithe_declined, undefined);
});

test('death cue uses death position rather than velocity to select nearest station', () => {
  const state = createGameState(4242), bus = createBus();
  state.story = { flags: {} };
  state.world.activeSector = { stations: [
    { id: 'wrong-origin', pos: { x: 0, z: 0 } },
    { id: 'near-death', pos: { x: 1000, z: 0 } },
  ] };
  const cues = [];
  bus.on('audio:cue', p => cues.push(p));
  const system = createSpecial500DeathBell(); system.init({ state, bus });
  bus.emit('player:death', { pos: { x: 999, z: 0 }, victimVel: { x: 0, z: 0 } });
  assert.deepEqual(cues[0]?.position, { x: 1000, z: 0 });
});

test('both promised actual mail readers exist', () => {
  for (const id of ['mail_guilt_read_back', 'mail_heard_the_count'])
    assert.ok(MAIL_LETTERS.find(row => row.id === id), id);
});
