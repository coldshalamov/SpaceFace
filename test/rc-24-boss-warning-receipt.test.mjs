import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { capitalBossWarningReceipt, bindCapitalBossReceipts } from '../src/ui/toasts.js';
import { admitReceipt } from '../src/ui/hudAttention.js';

const DT = 1 / 60;
const SEED = 4242;

// RC-24: a boss warning shows "title — counter" on the receipt line, minted on the
// cast's first telegraph so it lands well before the attack it announces.

test('capitalBossWarningReceipt renders "title — counter" and survives a fight', () => {
  const receipt = capitalBossWarningReceipt({
    castId: 'f:1', title: 'TOLL GATE',
    counter: 'Centre or outside, never the two rails. Ballast does not owe a transit fee.',
    fightId: 'f', simTime: 10,
  });
  assert.equal(receipt.text, 'TOLL GATE — Centre or outside, never the two rails');
  assert.equal(receipt.kind, 'warn');
  assert.equal(receipt.channel, 'capitalBoss');
  // The fight job silences ordinary receipts; the boss warning is the one line it keeps.
  assert.equal(admitReceipt({ ...receipt, combat: true }).admit, true);
  assert.equal(capitalBossWarningReceipt({ title: 'X', counter: 'Y' }), null);
  assert.equal(capitalBossWarningReceipt(null), null);
});

test('one telegraph burst mints one receipt per cast', () => {
  const toasts = [];
  const handlers = new Map();
  const bus = {
    on: (name, fn) => handlers.set(name, fn),
    emit: (name, payload) => { if (name === 'toast') toasts.push(payload); },
  };
  bindCapitalBossReceipts(bus);
  const telegraph = handlers.get('capitalBoss:telegraph');
  telegraph({ castId: 'f:1', title: 'TOLL GATE', counter: 'Hold the centre lane.' });
  telegraph({ castId: 'f:1', title: 'TOLL GATE', counter: 'Hold the centre lane.', locked: true });
  telegraph({ castId: 'f:2', title: 'AUDIT FAN', counter: 'Move through the gap.' });
  assert.equal(toasts.length, 2);
  assert.equal(toasts[0].text, 'TOLL GATE — Hold the centre lane.');
  assert.equal(toasts[1].text, 'AUDIT FAN — Move through the gap.');
});

// The done check, end to end: the Tollman's first five attacks each get a receipt
// at least one second early.
test('the Tollman fight shows a warning before each of its first five attacks', () => {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  bindCapitalBossReceipts(bus);
  const helpers = {
    spawnBudget: makeBudgetApi(state),
    routeCombatDamage(packet) { return packet; },
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
      state.entities.set(id, entity); state.entityList.push(entity);
      return entity;
    },
    getCombatCapabilities() { return null; },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player); state.entityList.push(player);
  state.playerId = player.id;
  const boss = { id: state.nextEntityId++, alive: true, pos: { x: 300, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, radius: 20, type: 'ship', team: 1 };
  state.entities.set(boss.id, boss); state.entityList.push(boss);
  const fightId = 'contract:capital_boss_tollman';
  state.missions.active.push({ id: fightId, status: 'active', destSectorId: 'contract_room' });
  state.world.currentSectorId = 'contract_room';
  const capSys = createProductionCapitalBossEncounters();
  capSys.init({ state, bus, helpers });
  bus.emit('capitalBoss:start', { encounterId: 'capital_boss_tollman', fightId, bossId: boss.id, targetId: player.id });

  const attacks = [], receipts = [];
  for (let i = 0; i < 2600 && attacks.length < 5; i++) {
    state.tick += 1; state.simTime += DT; capSys.update(DT);
  }
  for (const e of emitted) {
    if (e.event === 'capitalBoss:attack') attacks.push(e.payload);
    if (e.event === 'toast' && e.payload?.channel === 'capitalBoss' && e.payload?.castId != null) receipts.push(e.payload);
  }
  assert.ok(attacks.length >= 5, `expected ≥5 attacks, saw ${attacks.length}`);
  assert.ok(receipts.length >= 5, `expected ≥5 warning receipts, saw ${receipts.length}`);
  const attackByCast = new Map(attacks.map((a) => [a.castId, a]));
  for (const r of receipts.slice(0, 5)) {
    const attack = attackByCast.get(r.castId);
    assert.ok(attack, `receipt cast ${r.castId} fired no attack`);
    assert.ok(r.text.includes(' — '), `receipt is "title — counter": ${r.text}`);
    assert.ok(attack.simTime - r.simTime >= 1,
      `receipt ${r.castId} preceded attack by ${attack.simTime - r.simTime}s`);
  }
});
