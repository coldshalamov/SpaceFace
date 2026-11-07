import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { requireCapitalBossEncounter } from '../src/data/encounters/capital-boss.js';
import {
  SWARM_BOSS_FIRST,
  SWARM_BOSS_EVERY,
  SWARM_BOSS_ROTATION,
  isSwarmBossWave,
  swarmBossFor,
} from '../src/data/swarmMode.js';
import { mountScreen, textLines } from './helpers/fake-dom.mjs';
import { crucibleResultsScreen } from '../src/ui/screens/crucible.js';

function fixture() {
  const emitted = [];
  let sim;
  const helpers = {
    routeCombatDamage(packet) { return packet; },
    spawnEntity(spec) {
      const state = sim.state;
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  sim = createSimulation({ seed: 73311,
    systems: [createProductionCapitalBossEncounters()], helpers });
  const { state } = sim;
  for (const id of ['swarm:announce', 'ui:pushScreen', 'swarm:bossMilestoneAck']) {
    sim.bus.on(id, (p) => emitted.push({ id, p }));
  }
  state.run = {
    kind: 'survival', ruleset: 'swarm', phase: 'active', wave: SWARM_BOSS_FIRST,
    telemetry: {},
  };
  const boss = sim.spawn({ type: 'ship', alive: true, pos: { x: 40, z: 10 },
    hull: 1000, hullMax: 1000, radius: 28, team: 1,
    data: { scanLabel: "Dreadnought 'Iron Maw'" } });
  const player = sim.spawn({ type: 'ship', alive: true, pos: { x: 200, z: 0 },
    hull: 260, hullMax: 260, radius: 16, team: 0 });
  state.playerId = player.id;
  const owner = sim.registry.get('capitalBossEncounters');
  owner.start({ encounterId: 'capital_boss_hulk', fightId: 'swarm:w5:iron_maw',
    bossId: boss.id, targetId: player.id });
  const record = () => state.capitalBossEncounters.fights['swarm:w5:iron_maw'];
  return { sim, state, boss, owner, record, emitted, dispose() { sim.dispose(); } };
}

test('S14 — capital rows land at 5, 15, 25 and every score act carries a short callout', () => {
  assert.equal(isSwarmBossWave(SWARM_BOSS_FIRST), true);
  assert.equal(isSwarmBossWave(SWARM_BOSS_FIRST + SWARM_BOSS_EVERY), true);
  for (const w of [1, 4, 10, 20, 30]) assert.equal(isSwarmBossWave(w), false);
  assert.equal(swarmBossFor(SWARM_BOSS_FIRST).id, 'iron_maw');
  assert.equal(swarmBossFor(SWARM_BOSS_FIRST).scoreId, 'capital_boss_hulk');
  const capitalIds = new Set(['capital_boss_hulk', 'capital_boss_foreman', 'capital_boss_regent']);
  for (const row of SWARM_BOSS_ROTATION.filter((r) => capitalIds.has(r.scoreId))) {
    const score = requireCapitalBossEncounter(row.scoreId).score;
    for (const act of score.acts) {
      assert.equal(typeof act.callout, 'string', `${row.id}/${act.id} callout`);
      assert.ok(act.callout.trim().split(/\s+/).length <= 5, `${act.callout} stays one glance`);
    }
    assert.ok(row.line.trim().split(/\s+/).length <= 6, `${row.id} card line stays a glance`);
  }
});

test('S14 — an act change announces the score callout once, and only for swarm fights', () => {
  const h = fixture();
  try {
    h.record().actIndex = 1;
    h.sim.bus.emit('capitalBoss:actChanged', { type: 'actChanged', index: 1 });
    const calls = h.emitted.filter((e) => e.id === 'swarm:announce' && e.p.kind === 'bossact');
    assert.deepEqual(calls.map((e) => e.p.text), ['RIP ITS RUDDER']);
    // A non-swarm record at the same index announces nothing.
    h.record().fightId = 'mission:x:boss';
    h.record().actIndex = 2;
    h.sim.bus.emit('capitalBoss:actChanged', { type: 'actChanged', index: 2 });
    assert.equal(h.emitted.filter((e) => e.id === 'swarm:announce').length, 1);
  } finally { h.dispose(); }
});

test('S14 — a fallen champion pays its mass forward: throwable chunks spawn once, persist, and stamp the milestone', () => {
  const h = fixture();
  try {
    h.sim.bus.emit('entity:killed', { id: h.boss.id });
    const record = h.record();
    assert.ok(Array.isArray(record.swarmAmmoChunks), 'chunk ledger stamped');
    assert.ok(record.swarmAmmoChunks.length >= 4 && record.swarmAmmoChunks.length <= 6,
      `four-to-six chunks, got ${record.swarmAmmoChunks.length}`);
    for (const id of record.swarmAmmoChunks) {
      const e = h.state.entities.get(id);
      assert.ok(e, `chunk ${id} exists`);
      assert.equal(e.data.tetherable, true, 'tetherable');
      assert.equal(e.data.physicalRole, 'throw_mass', 'throw-mass role');
      assert.equal(e.flags.persistent, true, 'outlives the round');
      assert.ok(Number.isFinite(e.pos.x) && Number.isFinite(e.pos.z));
    }
    // The run's first boss stamps the milestone and pushes the victory plate.
    const stamp = h.state.run.telemetry.firstBossDown;
    assert.ok(stamp && stamp.pending === true && stamp.name === 'IRON MAW', `stamp ${stamp && stamp.name}`);
    assert.deepEqual(h.emitted.filter((e) => e.id === 'ui:pushScreen').map((e) => e.p.id),
      ['crucibleResults']);
    h.sim.bus.emit('swarm:bossMilestoneAck', { wave: SWARM_BOSS_FIRST });
    assert.equal(stamp.pending, false, 'ack consumes the pending stamp');
    // Killing the same record's boss again mints no second field.
    const chunkCount = () => [...h.state.entities.values()].filter((e) => e.data && e.data.swarmBossChunk).length;
    const before = chunkCount();
    h.sim.bus.emit('entity:killed', { id: h.boss.id });
    assert.equal(chunkCount(), before, 'no duplicate chunks');
  } finally { h.dispose(); }
});

test('S14 — the first champion down plays the victory variant of Run Over, focused on Keep going', () => {
  const { root, emitted, buttons } = mountScreen(crucibleResultsScreen, { ctx: {
    state: { run: { kind: 'survival', ruleset: 'swarm', telemetry: { firstBossDown:
      { name: 'IRON MAW', line: 'IRON MAW: Drive gone. Guns gone. Still moving.',
        lesson: 'Mass beats plate. Spend what the arena gives you.', wave: 5, pending: true } } },
      ui: {}, entities: new Map(), simTime: 12 } } });
  const text = textLines(root).join(' | ');
  assert.ok(text.includes('IRON MAW DOWN'), 'the champion names the plate');
  assert.ok(text.includes('Mass beats plate'), 'the authored lesson moved to the plate');
  const keep = buttons.find((b) => (b.textContent || '').includes('Keep going'));
  assert.ok(keep && keep.className.includes('k-word--primary'), 'Keep going is the focused word');
  for (const w of ['Run it again', 'Back to the hangar', 'Main menu']) {
    assert.ok(text.includes(w), `${w} offered`);
  }
  assert.equal(emitted.filter((e) => e.event === 'swarm:bossMilestoneAck').length, 1,
    'mounting the plate acknowledges the milestone once');
  // A settled stamp renders the ordinary record instead.
  const settled = mountScreen(crucibleResultsScreen, { ctx: {
    state: { run: { kind: 'survival', ruleset: 'swarm', telemetry: { firstBossDown:
      { name: 'IRON MAW', line: '', lesson: '', wave: 5, pending: false } } },
      ui: {}, entities: new Map(), simTime: 12 } } });
  assert.ok(!textLines(settled.root).join(' ').includes('FIRST CHAMPION DOWN'),
    'a consumed stamp never shadows the run end');
});
