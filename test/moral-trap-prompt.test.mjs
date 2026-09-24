// The moral trap's missing consumer. moralTrap._maybeReveal emits `moralTrap:revealed` once
// mid-run and stashes the fork on state.ui.moralTrap; until this adapter nothing answered it.
// The deck voids every entry on sector:exit / dock:docked and the reveal never re-fires, so
// the adapter re-derives the pending fork from the mission record on every edge that can
// follow a deck clear — the mission flags serialize, the stash does not.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { moralTrapSystem } from '../src/systems/moralTrap.js';
import { moralTrapPrompt } from '../src/ui/moralTrapPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { MORAL_TRAPS } from '../src/data/moralTraps.js';

const TRAP = MORAL_TRAPS.cargo_is_weapons;

function trapMission(id = 'm1', extra = {}) {
  return {
    id, type: 'cargo_delivery', stationId: 'station_tethys', status: 'active',
    trap: { id: TRAP.id, revealAt: 'mid_run', revealLine: TRAP.revealLine, choice: TRAP.choice },
    ...extra,
  };
}

function boot(missions = [trapMission()]) {
  const bus = createBus();
  const state = { simTime: 12, tick: 5, ui: {}, missions: { active: missions } };
  // Production init order has the adapter before the system — mirror it so handler order
  // on sector:enter matches the real boot (restore runs before _maybeReveal).
  const adapter = Object.assign({}, moralTrapPrompt);
  adapter.init({ state, bus, helpers: {} });
  const trap = Object.assign({}, moralTrapSystem);
  trap.init({ state, bus, helpers: {} });

  const specs = [];
  const resolved = [];
  setPromptDeck({
    offerDecision: (spec) => { specs.push(spec); return true; },
    resolveDecision: (id) => resolved.push(id),
  });
  const chosen = [];
  bus.on('moralTrap:choose', (p) => chosen.push(p));
  return { bus, state, specs, resolved, chosen, adapter };
}

test('the mid-run reveal becomes a deck decision whose verbs carry the fork', () => {
  const { bus, state, specs } = boot();
  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });

  assert.equal(specs.length, 1, 'one reveal, one decision');
  assert.deepEqual(state.ui.moralTrap.missionId, 'm1');
  const spec = specs[0];
  assert.equal(spec.detail, TRAP.choice.prompt);
  assert.deepEqual(spec.choices.map((c) => c.id), TRAP.choice.options.map((o) => o.id));
  assert.equal(spec.choices[0].title, TRAP.choice.options[0].blurb,
    'each verb keeps its consequence blurb');
});

test('choosing a verb emits the shipped moralTrap:choose intent — consequences stay systemic', () => {
  const { bus, state, specs, resolved, chosen } = boot();
  const rep = [];
  bus.on('faction:repDelta', (p) => rep.push(p));
  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  specs[0].onChoose('divert');

  assert.deepEqual(chosen, [{ missionId: 'm1', optionId: 'divert' }],
    'the deck verb emits the intent the system always listened for');
  assert.ok(resolved.includes('moral-trap'), 'the card closes on choose');
  assert.ok(state.missions.active[0]._trapResolved, 'the system marks the fork answered');
  assert.equal(state.ui.moralTrap, undefined, 'the system clears its own stash');
  assert.deepEqual(rep, [{ factionId: 'faction_scn', delta: 12, reason: 'moralTrap' }],
    'the consequence routes through the shipped rep channel');
});

test('the card survives the next sector jump — the deck clears, the fork re-asserts', () => {
  const { bus, specs } = boot();
  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  assert.equal(specs.length, 1);

  // The real deck clears every entry on sector:exit / dock:docked; the reveal is once-only,
  // so the adapter re-derives the pending fork on the next enter / undock.
  bus.emit('sector:exit', {});
  bus.emit('sector:enter', { sectorId: 'sector_io' });
  bus.emit('dock:docked', {});
  bus.emit('dock:undocked', {});
  assert.equal(specs.length, 3, 're-asserted after each deck clear');
  assert.ok(specs.every((s) => s.id === 'moral-trap' && s.choices.length === 2));
});

test('a job that ends unanswered closes the fork instead of resurrecting it', () => {
  const { bus, state, specs, resolved, chosen } = boot();
  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  assert.equal(specs.length, 1);

  // status flips before the emit — the mission-scan gate sees the ending.
  state.missions.active[0].status = 'completed';
  bus.emit('mission:completed', { missionId: 'm1' });
  assert.ok(resolved.includes('moral-trap'));
  bus.emit('sector:enter', { sectorId: 'sector_io' });
  assert.equal(specs.length, 1, 'a settled job cannot answer later');
  assert.equal(chosen.length, 0);
});

test('a different mission ending leaves the open fork standing', () => {
  const m2 = trapMission('m2');
  const { bus, specs, resolved } = boot([trapMission(), m2]);
  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  assert.equal(specs.length, 1);
  m2.status = 'failed';
  bus.emit('mission:failed', { missionId: 'm2' });
  assert.equal(resolved.length, 0, 'unrelated endings do not clear the card');
});

test('cold restart: the pending fork is rebuilt from mission flags — the stash never serialized', () => {
  // Simulate quit+Continue: state.ui is not serialized; mission.trap/_trapRevealed are.
  const { bus, state, specs } = boot();
  state.missions.active[0]._trapRevealed = true;
  delete state.ui.moralTrap;
  bus.emit('save:loaded', {});
  assert.equal(specs.length, 1, 'the fork re-offers without the stash');
  assert.equal(specs[0].detail, TRAP.choice.prompt);
});

test('two trapped missions queue: resolving the showing fork surfaces the other', () => {
  const { bus, specs } = boot([trapMission('m1'), trapMission('m2')]);
  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' }); // reveals m1
  bus.emit('sector:enter', { sectorId: 'sector_io' });         // reveals m2 (card overwrites)
  assert.equal(specs.length, 3, 'reveal + re-assert + second reveal');
  bus.emit('moralTrap:choose', { missionId: 'm2', optionId: 'deliver' });
  assert.equal(specs.length, 4, "m1's pending fork resurfaces once m2 settles");
});

test('a Helios-seeded trap still reaches its fork mid-run — the accept line is flavor, not the reveal', () => {
  const { bus, state, specs } = boot();
  state.missions.active[0].stationId = 'station_helios';
  const toasts = [];
  bus.on('toast', (p) => toasts.push(p));
  bus.emit('mission:accepted', { missionId: 'm1' });
  assert.ok(state.missions.active[0]._acceptLineSpoken, 'the accept line is marked spoken');
  assert.ok(!state.missions.active[0]._trapRevealed, 'the fork is NOT consumed at accept');

  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  assert.equal(specs.length, 1, 'the choice card presents mid-run like any trap');
  assert.equal(toasts.filter((t) => t.text === TRAP.revealLine).length, 1,
    'the reveal line speaks once, not twice');
});

test('production wiring: the manifest materializes the adapter — a lookup-only row is dead', () => {
  const state = createGameState(7);
  const registry = createRegistry({ state, bus: createBus(), helpers: {} });
  assert.ok(registry.systems.includes(moralTrapPrompt),
    'adapter must be in the manifest init order, not just the registry lookup');
  assert.equal(registry.get('moralTrapPrompt'), moralTrapPrompt);
  assert.ok(!registry.updateOrder.includes(moralTrapPrompt));
});
