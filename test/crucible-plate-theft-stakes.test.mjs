// PRI-05 commit 3 — the wave-20 stakes: keeping the contested bank pays half the wave's
// authored purse through the run wallet's usual intent, and the announcer warns, then
// resolves the bank on the clear line — including 'secured', which arrives during the
// arena's teardown after the clear line was already composed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalAnnounce, waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import { survivalRewards } from '../src/systems/survivalRewards.js';
import { runSession } from '../src/systems/runSession.js';
import { WAVE_20_SYSTEM_EVENT } from '../src/data/survivalActs.js';

const ARENA = 'helios_core';
const SEED = 4242;

function boot() {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'scored', seed: SEED }),
    arenaId: ARENA, wave: 20, phase: 'active', retireToken: 7 };
  const awards = [];
  bus.on('run:awardRequested', p => awards.push(p));
  return { state, bus, emitted, awards };
}

const plan20 = () => {
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 20 });
  assert.notEqual(plan.ok, false);
  assert.equal(plan.systemEvent?.id, WAVE_20_SYSTEM_EVENT.id);
  return plan;
};

const secured = (state, wave = 20) => ({
  wave, status: 'secured', runToken: state.run.retireToken, plateId: 9,
  plateGeneration: 9, pos: { x: 0, z: 0 }, actorIds: [],
});

test('keeping the bank pays half the authored purse through the wallet intent, once', () => {
  const h = boot();
  runSession.init({ state: h.state, bus: h.bus, helpers: {} });
  survivalRewards.init({ state: h.state, bus: h.bus, helpers: {} });
  h.bus.emit('run:wavePlanned', { wave: 20, plan: plan20() });
  const walletBefore = h.state.run.credits || 0;
  h.bus.emit('survivalArena:plateTheft', { ...secured(h.state), status: 'targeted' });
  h.bus.emit('survivalArena:plateTheft', { ...secured(h.state), status: 'stolen' });
  assert.equal(h.awards.filter(a => a.reason === 'plate_kept').length, 0,
    'a warning or a loss pays nothing');
  h.bus.emit('survivalArena:plateTheft', secured(h.state));
  const kept = h.awards.filter(a => a.reason === 'plate_kept');
  assert.equal(kept.length, 1);
  // Wave-20 purse is the wave-10 recipe's 48 plus the act-2 rider's 6: 54, so the stake is 27.
  assert.equal(kept[0].credits, 27);
  assert.equal(kept[0].wave, 20);
  // The intent really lands in the run wallet through runSession.award.
  assert.equal(h.state.run.credits, walletBefore + 27);
  h.bus.emit('survivalArena:plateTheft', secured(h.state));
  assert.equal(h.awards.filter(a => a.reason === 'plate_kept').length, 1, 'verdicts do not pay twice');
  h.bus.emit('survivalArena:plateTheft', { ...secured(h.state), runToken: 999 });
  assert.equal(h.awards.filter(a => a.reason === 'plate_kept').length, 1, 'a stale run cannot pay');
  h.bus.emit('survivalArena:plateTheft', secured(h.state, 19));
  assert.equal(h.awards.filter(a => a.reason === 'plate_kept').length, 1, 'the wrong wave cannot pay');
  survivalRewards.destroy();
});

test('the announcer names the tow, then banks the verdict onto the clear line', () => {
  const h = boot();
  survivalAnnounce.init({ state: h.state, bus: h.bus, helpers: {} });
  const lines = () => h.emitted.filter(e => e.event === 'voice:say');
  const opening = waveOpeningLine(20, { objective: { kind: 'system_event' },
    packages: [{ count: 4, gateGroup: 'n', role: 'escort', enemyId: 'pd_screen_escort' }] });
  assert.match(opening, /They want the bank plate\. Stop the tow\./);
  h.bus.emit('run:wavePlanned', { wave: 20, plan: plan20() });
  h.bus.emit('run:waveStarted', { wave: 20, tick: 1 });
  h.bus.emit('survivalArena:plateTheft', { ...secured(h.state), status: 'targeted', actorIds: [44] });
  const warned = lines().filter(e => e.payload.text === "They're on the plate.");
  assert.equal(warned.length, 1, JSON.stringify(lines().map(e => e.payload.text)));
  // The wave clears before the arena teardown emits 'secured' — the same emission order
  // as production (survivalAnnounce inits before survivalArena).
  h.bus.emit('run:waveCleared', { wave: 20, killed: 12, admitted: 12 });
  const clear = lines().find(e => e.payload.id === 'survival:w20:clear');
  assert.ok(clear, 'a clear line exists to amend');
  h.bus.emit('survivalArena:plateTheft', secured(h.state));
  const amended = lines().filter(e => e.payload.id === 'survival:w20:clear');
  assert.ok(amended.some(e => e.payload.text.endsWith('Plate kept.')),
    JSON.stringify(amended.map(e => e.payload.text)));
  survivalAnnounce.destroy();
});

test('stolen and lost verdicts suffix the clear line when they precede it', () => {
  for (const [status, suffix] of [
    ['stolen', "Plate's gone."],
    ['lost', "Plate's gone."],
  ]) {
    const h = boot();
    survivalAnnounce.init({ state: h.state, bus: h.bus, helpers: {} });
    h.bus.emit('run:wavePlanned', { wave: 20, plan: plan20() });
    h.bus.emit('run:waveStarted', { wave: 20, tick: 1 });
    h.bus.emit('survivalArena:plateTheft', { ...secured(h.state), status });
    h.bus.emit('run:waveCleared', { wave: 20, killed: 12, admitted: 12 });
    const clear = h.emitted.find(e => e.event === 'voice:say' && e.payload.id === 'survival:w20:clear');
    assert.ok(clear?.payload.text.endsWith(suffix), `${status}: ${clear?.payload.text}`);
    survivalAnnounce.destroy();
  }
});
