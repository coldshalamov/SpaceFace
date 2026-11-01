import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapitalBossFight, stepCapitalBossFight } from '../src/combat/capitalBossScore.js';
import { IRON_KRAKEN_PROFILES } from '../src/data/ironKraken.js';
import { applyDomainPathUpdate, configureDomainMirroring, createDomainDiffer,
  createDomainProbeChecker } from '../scripts/lib/simReadModel.mjs';

test('worker fight clocks, locked attacks and recovery reach the renderer in the same body reply', () => {
  configureDomainMirroring({});
  const p = IRON_KRAKEN_PROFILES.heavy;
  const fight = createCapitalBossFight({ encounterId: p.scoreId, fightId: 'swarm:w7:kraken', bossId: 2, targetId: 1 });
  const state = { capitalBossEncounters: { version: 1,
    fights: { [fight.fightId]: fight }, orders: { privateAuthority: { forward: 1 } }, swarmWingLedgers: { private: true } } };
  const boss = { id: 2, alive: true, pos: { x: 0, z: 0 }, rot: 0, radius: p.coreRadius, hull: p.hull, hullMax: p.hull };
  const target = { id: 1, alive: true, pos: { x: 130, z: 0 }, radius: 14, hull: 1000, hullMax: 1000 };
  const differ = createDomainDiffer({ probe: true }), mirror = new Map(), checker = createDomainProbeChecker(mirror);
  const phases = new Set(); let didRecover = false, sawLocked = false;
  for (let tick = 0; tick < 720; tick++) {
    stepCapitalBossFight(fight, { boss, target, tick, simTime: tick / 60, active: true });
    const output = differ.diff(state, tick);
    for (const update of output.updates) applyDomainPathUpdate(mirror, update, new WeakSet());
    assert.deepEqual(checker.consume(output.probe).events, [], `wire parity at tick ${tick}`);
    const rendered = mirror.get('capitalBossEncounters.fights')?.[fight.fightId];
    assert.ok(rendered, 'the production read model exposes the score to native animation');
    assert.equal(rendered.clock, fight.clock, `a moving boss cannot carry a stale animation clock (${tick})`);
    assert.equal(rendered.phase, fight.phase);
    assert.deepEqual(rendered.cast, fight.cast, 'damage, tell geometry and active lifetime are transported together');
    assert.deepEqual(rendered.recovery, fight.recovery);
    assert.notEqual(rendered, fight, 'presentation has a clone, not mutation authority');
    phases.add(rendered.phase);
    didRecover ||= !!rendered.recovery;
    sawLocked ||= rendered.cast?.locked === true;
    assert.equal(output.updates.some(update => update.segs[0] === 'capitalBossEncounters'), false,
      'private orders and spawn ledgers are not copied for visual convenience');
  }
  assert.ok(phases.has('tell') && phases.has('active') && phases.has('recovery'));
  assert.equal(didRecover, true); assert.equal(sawLocked, true);
  delete state.capitalBossEncounters.fights[fight.fightId];
  const output = differ.diff(state, 720);
  for (const update of output.updates) applyDomainPathUpdate(mirror, update, new WeakSet());
  assert.equal(mirror.get('capitalBossEncounters.fights')[fight.fightId], undefined,
    'wave cleanup removes old attack effects immediately');
  assert.deepEqual(checker.consume(output.probe).events, []);
  const next = createCapitalBossFight({ encounterId: p.scoreId, fightId: 'swarm:w19:kraken', bossId: 3, targetId: 1, tick: 721 });
  state.capitalBossEncounters.fights[next.fightId] = next;
  const admitted = differ.diff(state, 721);
  for (const update of admitted.updates) applyDomainPathUpdate(mirror, update, new WeakSet());
  assert.deepEqual(mirror.get('capitalBossEncounters.fights')[next.fightId], next,
    'a new role binds on its first reply, without the cold-domain enumeration delay');
  assert.deepEqual(checker.consume(admitted.probe).events, []);
});
