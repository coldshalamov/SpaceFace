// X-04 (row 562): the first gate jump prices its toll inside the pay — three one-shot lines and
// one refusal remedy. All numbers are computed at speak time from gateTollFor and the run's
// reward; nothing is a literal.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { onboarding } from '../src/systems/onboarding.js';
import { world } from '../src/systems/world.js';
import { jumpAbortText } from '../src/ui/jumpNotice.js';
import { SECTORS } from '../src/data/sectors.js';
import { FIRST_TRADE_CONTRACT, buildFirstTradeOffer } from '../src/data/economyContractTemplates.js';

const SEED = 4242;
const DEST_SECTOR = FIRST_TRADE_CONTRACT.destSectorId;
const RUN = {
  ...buildFirstTradeOffer(SEED),
  status: 'active',
};

function rig(withRun = true) {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.missions.active = withRun ? [{ ...RUN }] : [];
  state.world.currentSectorId = 'sector_helios_prime';
  state.onboarding = { active: false, finished: true };
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(e, p) { emitted.push({ event: e, payload: p }); raw.emit(e, p); },
  };
  onboarding.init({ state, bus, helpers: { hash32, mulberry32, voice: { say: () => true } }, registry: { get: () => null } });
  const hints = (verb) => emitted.filter((e) => e.event === 'hud:firstUse' && e.payload.verbId === verb);
  return { state, bus, emitted, hints };
}

test('X-04 run + matching gate quotes the round-trip tolls against the pay, once', () => {
  const h = rig();
  h.bus.emit('gate:range', { gateTo: DEST_SECTOR, inRange: true });
  const line = h.hints('firstGateToll');
  assert.equal(line.length, 1);
  assert.equal(line[0].payload.text, 'Toll 180 out, 246 home. The run pays 760. Jump.');
  assert.equal(h.state.player.hints.firstGate, true, 'generic firstGate is stamped spent');
  h.bus.emit('gate:range', { gateTo: DEST_SECTOR, inRange: true });
  assert.equal(h.hints('firstGateToll').length, 1, 'second approach stays silent');
  assert.equal(h.hints('firstGate').length, 0, '"Plot a jump." never follows it');
});

test('X-04 no run, or a gate to another sector, gives the generic line', () => {
  const none = rig(false);
  none.bus.emit('gate:range', { gateTo: DEST_SECTOR, inRange: true });
  assert.equal(none.hints('firstGateToll').length, 0);
  assert.equal(none.hints('firstGate').length, 1);
  assert.equal(none.hints('firstGate')[0].payload.text, 'Plot a jump.');

  const wrong = rig();
  wrong.bus.emit('gate:range', { gateTo: 'sector_io_reach', inRange: true });
  assert.equal(wrong.hints('firstGateToll').length, 0);
  assert.equal(wrong.hints('firstGate').length, 1);
});

test('X-04 the line follows gateTollFor — no literals', () => {
  const h = rig();
  const destination = SECTORS.find((s) => s.id === DEST_SECTOR);
  const helios = SECTORS.find((s) => s.id === 'sector_helios_prime');
  const keepDestination = destination.security, keepHelios = helios.security;
  try {
    destination.security = 0.99; helios.security = 0.99;
    h.bus.emit('gate:range', { gateTo: DEST_SECTOR, inRange: true });
    assert.equal(h.hints('firstGateToll')[0].payload.text,
      'Toll 248 out, 248 home. The run pays 760. Jump.');
  } finally {
    destination.security = keepDestination; helios.security = keepHelios;
  }
});

test('X-04 arrival names the first-trade delivery berth once', () => {
  const h = rig();
  const fromHelios = { sectorId: DEST_SECTOR, fromSectorId: 'sector_helios_prime' };
  h.bus.emit('jump:arrive', fromHelios);
  const line = h.hints('firstGateArrive');
  assert.equal(line.length, 1);
  assert.equal(line[0].payload.text, 'Dock at Tethys Trade Hub to deliver the sealed cargo.');
  h.bus.emit('jump:arrive', fromHelios);
  assert.equal(h.hints('firstGateArrive').length, 1);
  const none = rig(false);
  none.bus.emit('jump:arrive', fromHelios);
  assert.equal(none.hints('firstGateArrive').length, 0);
  const wrongLeg = rig();
  wrongLeg.bus.emit('jump:arrive', { sectorId: DEST_SECTOR, fromSectorId: 'sector_io_reach' });
  assert.equal(wrongLeg.hints('firstGateArrive').length, 0, 'only the outbound Helios leg gives the instruction');
});

test('X-04 the live jump:arrive payload carries the departure sector the arrival gate reads', () => {
  // The arrival gate keys on p.fromSectorId; state.world keeps no previous-sector field, so the
  // world writer must stamp it or the line can never speak in play.
  const state = createGameState(SEED);
  state.world.currentSectorId = 'sector_helios_prime';
  state.jump = { state: 'JUMPING', _jumpT: 99, targetSectorId: DEST_SECTOR, via: 'gate' };
  const seen = [];
  const host = Object.create(world);
  host.state = state;
  host.bus = { emit: (e, p) => { if (e === 'jump:arrive') seen.push(p); }, on() {}, off() {} };
  host.enterSector = (id) => { state.world.currentSectorId = id; };
  host._activeDrive = () => null;
  host._tickJumping(1 / 60, state);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].sectorId, DEST_SECTOR);
  assert.equal(seen[0].fromSectorId, 'sector_helios_prime');
});

test('X-04 completion names the pay and the kept home toll, once', () => {
  const h = rig(false); // live order: missions.js removes the run from active before emitting
  h.state.world.currentSectorId = DEST_SECTOR;
  h.bus.emit('mission:completed', { source: RUN.source, missionId: RUN.id, rewardCr: RUN.reward_cr });
  const line = h.hints('firstTradePaid');
  assert.equal(line.length, 1);
  assert.equal(line[0].payload.text, 'Paid 760. Keep 246 for the gate home.');
  h.bus.emit('mission:completed', { source: RUN.source, missionId: RUN.id, rewardCr: RUN.reward_cr });
  assert.equal(h.hints('firstTradePaid').length, 1);
});

test('X-04 the refusal remedy names the earning path with world numbers', () => {
  assert.equal(
    jumpAbortText({ reason: 'credits', creditsNeeded: 194, creditsHeld: 120 }),
    'Gate toll 194 cr — purse holds 120 cr. Earn it at a dock.',
  );
});
