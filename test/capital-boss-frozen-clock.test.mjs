import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createAuthoritativeStepper } from '../src/core/authoritativeSimStep.js';
import { partitionUpdateSystems } from '../src/core/catchupPolicy.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';

function fixture() {
  const commands = [];
  const sim = createSimulation({ seed: 73311, systems: [createProductionCapitalBossEncounters()],
    helpers: { routeCombatDamage: p => commands.push(p) } });
  const { state } = sim;
  state.mode = 'flight'; state.ui.screenStack = [];
  state.run = { kind: 'survival', phase: 'active', wave: 7 };
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({ type: 'ship', alive: true, pos: { x: 120, z: 0 },
    hull: 260, hullMax: 260, radius: 16, team: 0 });
  state.playerId = player.id;
  const boss = sim.spawn({ type: 'ship', alive: true, pos: { x: 0, z: 0 },
    hull: 1000, hullMax: 1000, radius: 28, team: 1 });
  const owner = sim.registry.get('capitalBossEncounters');
  const partitions = partitionUpdateSystems([owner], { state, bus: sim.bus });
  const stepper = createAuthoritativeStepper({ state, core: sim.registry.get('core'),
    postInputPartitions: partitions, getSystem: name => sim.registry.get(name) });
  owner.start({ encounterId: 'capital_boss_iron_kraken', fightId: 'swarm:w7:kraken',
    bossId: boss.id, targetId: player.id });
  const read = () => state.capitalBossEncounters.fights['swarm:w7:kraken'];
  const step = () => stepper.step(SIM_DT);
  for (let n = 0; n < 1000 && !(read().cast?.beatId === 'arm_rake' && read().phase === 'active'); n++) step();
  assert.equal(read().cast?.beatId, 'arm_rake');
  assert.equal(read().phase, 'active');
  return { sim, state, owner, boss, player, read, step, commands,
    dispose() { partitions.dispose(); sim.dispose(); } };
}

test('default authoritative pause freezes an active rake without losing or catching up score ticks', () => {
  const h = fixture(), control = fixture();
  try {
    const before = structuredClone(h.read()), time = h.state.simTime, damageCount = h.commands.length;
    h.state.mode = 'paused'; h.state.ui.screenStack.push('pause'); h.sim.bus.emit('sim:pause', {});
    for (let n = 0; n < 12; n++) h.step();
    assert.equal(h.state.tick, before.lastTick + 12, 'the real frozen worker path still consumes raw counter ticks');
    assert.equal(h.state.simTime, time);
    assert.deepEqual(h.read(), before, 'pause neither advances nor cancels the current authored cast');
    assert.equal(h.commands.length, damageCount, 'no authored damage executes behind Pause');
    h.state.ui.screenStack.length = 0; h.state.mode = 'flight'; h.sim.bus.emit('sim:resume', {});
    assert.doesNotThrow(() => h.step());
    control.step();
    const resumed = structuredClone(h.read()), uninterrupted = structuredClone(control.read());
    delete resumed.lastTick; delete uninterrupted.lastTick;
    assert.deepEqual(resumed, uninterrupted, 'resume executes exactly the same one active score tick');
    assert.equal(h.read().clock, before.clock + 1);
  } finally { h.dispose(); control.dispose(); }
});

test('an actually missed active simulation step remains a strict capital score failure', () => {
  const h = fixture();
  try {
    // Initial staging of a genuinely omitted owner invocation: core advanced active time.
    h.sim.registry.get('core').preStep(SIM_DT, h.state);
    assert.throws(() => h.step(), /Missing fixed ticks/);
  } finally { h.dispose(); }
});

for (const boundary of ['sector-enter', 'context-restore', 'restored-record', 'replacement-body']) {
  test(`${boundary} cannot borrow an earlier fight clock observation`, () => {
    const h = fixture();
    try {
      h.state.tick += 12;
      if (boundary === 'sector-enter') h.state.world.enterSerial = (h.state.world.enterSerial || 0) + 1;
      if (boundary === 'context-restore') h.state.contextRestoreSeq = (h.state.contextRestoreSeq || 0) + 1;
      if (boundary === 'restored-record') h.owner.restore(h.owner.serialize());
      if (boundary === 'replacement-body') h.boss.occupantGeneration++;
      assert.throws(() => h.step(), /Missing fixed ticks/,
        'a changed lifecycle needs its canonical suspension/rebind, not an old pause receipt');
    } finally { h.dispose(); }
  });
}

test('canonical restored-role suspension retains its resume warning instead of catching up the cast', () => {
  const h = fixture();
  try {
    const clock = h.read().clock;
    h.owner.restore(h.owner.serialize());
    h.owner.rebind('swarm:w7:kraken', { bossId: h.boss.id, targetId: h.player.id });
    h.state.tick += 12;
    h.step();
    assert.equal(h.read().clock, clock + 1);
    assert.equal(h.read().cast, null);
    assert.equal(h.read().phase, 'transition');
    assert.ok(h.read().nextAt > h.read().clock, 'restored roles retain the authored warmup');
  } finally { h.dispose(); }
});

test('a newly started fight retains its own intro and never borrows the departed score clock', () => {
  const h = fixture();
  try {
    h.owner.detach('swarm:w7:kraken');
    h.owner.start({ encounterId: 'capital_boss_iron_kraken', fightId: 'swarm:w7:kraken',
      bossId: h.boss.id, targetId: h.player.id });
    h.state.tick += 12;
    h.step();
    assert.equal(h.read().clock, 1);
    assert.equal(h.read().phase, 'intro');
    assert.equal(h.read().cast, null);
  } finally { h.dispose(); }
});
