import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { BROOD_PHASE_WINDUP } from '../src/systems/swarmBrood.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { physics } from '../src/core/physics.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';

const DT = 1 / 60;
async function fixture(t, kind = 'repair_drone') {
  const sim = createSimulation({ seed: 4242, systems: [swarmArena, actions, physics, combat, tetherGameplay] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  state.input.aimIntentActive = true; state.input.aimWorld = { x: 10, z: 0 };
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.render.sectorShellAdmission = false;
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), phase: 'active', wave: 58 };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: -60, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 40, hull: 100, hullMax: 100, collides: true, data: {} });
  state.playerId = player.id; noteSwarmPilotAction(state);
  const engine = sim.registry.get('swarmArena')._brood;
  engine.prepareWave(state.run, 58); engine.spawnWave(state);
  const b = engine._bodies;
  const builder = b.alive.findIndex((n, i) => n && b.liveFamilyId[b.family[i]] === kind);
  assert.ok(builder >= 0, 'ordinary finite roster contains the builder');
  for (let i = 0; i < b.alive.length; i++) if (i !== builder) b.alive[i] = 0;
  b.px[builder] = 0; b.pz[builder] = 0; b.vx[builder] = 0; b.vz[builder] = 0;
  const remains = [];
  for (let i = 0; i < (kind === 'assembler' ? 2 : 1); i++) {
    bus.emit('swarm:broodRemains', { familyId: 'mite', kind: 'husk_shards', name: 'Husk shards',
      mass: 12, radius: 2.6, pos: { x: 10 + i * 10, z: 0 }, vel: { x: 0, z: 0 }, wave: 58 });
    remains.push(state.entityList.filter(e => e.type === 'payload').at(-1));
  }
  const spent = [], awards = [];
  bus.on('swarm:broodRemainsSpent', p => spent.push(p)); bus.on('run:awardRequested', p => awards.push(p));
  const step = (ticks = 1) => { for (let i = 0; i < ticks; i++) { state.tick++; state.simTime += DT; engine.step(state); } };
  const arm = () => { for (let i = 0; i < 600 && b.phase[builder] !== BROOD_PHASE_WINDUP; i++) step();
    assert.equal(b.phase[builder], BROOD_PHASE_WINDUP); };
  const service = sim.registry.get('actions').kernel.attachments;
  const catchRemain = (remain = remains[0]) => {
    const result = service.create({ defId: 'tether_standard', ownerId: player.id, targetId: remain.id });
    assert.equal(result.ok, true, JSON.stringify(result)); return result.attachment;
  };
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  sim.step(DT);
  return { sim, state, bus, engine, b, builder, player, remains, spent, awards, step, arm, service, catchRemain };
}

for (const kind of ['repair_drone', 'assembler']) {
  test(`${kind}: catching its stock interrupts the weld without spending the original`, async t => {
    const h = await fixture(t, kind); h.arm();
    const reserve = h.engine._machine().reserve;
    const held = h.remains.at(-1), line = h.catchRemain(held);
    h.step();
    assert.notEqual(h.b.phase[h.builder], BROOD_PHASE_WINDUP, 'the active weld stops on the catch tick');
    h.step(360);
    assert.equal(held.alive, true); assert.equal(line.state, 'active');
    assert.equal(h.engine._machine().reserve, reserve); assert.deepEqual(h.spent, []); assert.deepEqual(h.awards, []);
    assert.equal(h.service.cut(line.id, h.player.id, 'manual_cut').ok, true);
    h.arm(); const started = h.state.simTime;
    for (let i = 0; i < 420 && h.engine._machine().reserve === reserve; i++) h.step();
    assert.equal(h.engine._machine().reserve, reserve - 1);
    assert.ok(h.state.simTime - started >= (kind === 'assembler' ? 5 : 3) - DT, 'release earns a fresh full weld');
    assert.equal(h.spent.length, h.remains.length); assert.ok(h.remains.every(e => e.alive === false));
  });
}

test('native real catch preserves a welding husk through physics, then ordinary release permits rebuilding', async t => {
  const h = await fixture(t);
  const tick = () => h.sim.step(DT);
  for (let i = 0; i < 600 && h.b.phase[h.builder] !== BROOD_PHASE_WINDUP; i++) tick();
  assert.equal(h.b.phase[h.builder], BROOD_PHASE_WINDUP);
  const held = h.remains[0], reserve = h.engine._machine().reserve, original = held;
  for (let i = 0; i < 90 && h.state.masslineAcquisition?.selected?.targetId !== held.id; i++) tick();
  assert.equal(h.state.masslineAcquisition?.selected?.targetId, held.id);
  h.state.input.actions.tetherFire = true; tick(); h.state.input.actions.tetherFire = false;
  const line = Object.values(h.state.combat.attachments.byId).find(a => a.state === 'active' && a.targetId === held.id);
  assert.ok(line, 'ordinary F input catches the original husk');
  tick(); assert.notEqual(h.b.phase[h.builder], BROOD_PHASE_WINDUP);
  assert.equal(h.sim.registry.get('physics')._sg02.diagnostics().attachments, 1);
  const caughtAt = h.state.simTime;
  for (let i = 0; i < 240; i++) tick();
  assert.equal(h.state.entities.get(held.id), original); assert.equal(held.alive, true);
  assert.equal(line.state, 'active'); assert.equal(h.engine._machine().reserve, reserve);
  assert.deepEqual(h.spent, []); assert.deepEqual(h.awards, []);
  h.state.input.actions.tetherCut = true; tick(); h.state.input.actions.tetherCut = false; tick();
  assert.equal(line.state, 'broken', 'ordinary cut input releases the original');
  const releasedAt = h.state.simTime;
  for (let i = 0; i < 600 && h.engine._machine().reserve === reserve; i++) tick();
  assert.equal(h.engine._machine().reserve, reserve - 1); assert.equal(h.spent.length, 1);
  assert.equal(held.alive, false);
  assert.ok(h.state.simTime - releasedAt >= 3 - DT, 'native release also starts a full new weld');
  assert.equal(h.sim.registry.get('physics')._sg02.diagnostics().attachments, 0);
  t.diagnostic(`Native F catch held the original for ${(releasedAt - caughtAt).toFixed(3)} s; cut-to-rebuild ${(h.state.simTime - releasedAt).toFixed(3)} s; reserve ${reserve} -> ${reserve - 1}; no award requests.`);
});

for (const kind of ['repair_drone', 'assembler']) {
  test(`${kind}: held stock cannot start a new channel`, async t => {
    const h = await fixture(t, kind); h.catchRemain(h.remains.at(-1));
    const reserve = h.engine._machine().reserve; h.step(420);
    assert.equal(h.b.channelEntity[h.builder], -1); assert.equal(h.engine._machine().reserve, reserve);
    assert.deepEqual(h.spent, []);
  });
  test(`${kind}: a last-tick catch wins over completion`, async t => {
    const h = await fixture(t, kind); h.arm(); h.b.timer[h.builder] = DT / 2;
    const reserve = h.engine._machine().reserve; h.catchRemain(h.remains.at(-1)); h.step();
    assert.equal(h.b.channelEntity[h.builder], -1); assert.equal(h.engine._machine().reserve, reserve);
    assert.deepEqual(h.spent, []);
  });
}

for (const [name, mutate] of [
  ['broken', (h, a) => { a.state = 'broken'; }],
  ['stale target life', (h, a) => { a.targetGeneration++; }],
  ['stale owner life', (h, a) => { a.ownerGeneration++; }],
  ['foreign owner', (h, a) => { a.ownerId = h.remains[0].id; }],
  ['other target', (h, a) => { a.targetId = h.player.id; }],
  ['other attachment kind', (h, a) => { a.defId = 'attachment_boarding'; }],
]) test(`${name} attachment cannot protect loose welding stock`, async t => {
  const h = await fixture(t); h.arm(); const a = h.catchRemain(); mutate(h, a);
  const reserve = h.engine._machine().reserve;
  for (let i = 0; i < 240 && h.engine._machine().reserve === reserve; i++) h.step();
  assert.equal(h.engine._machine().reserve, reserve - 1); assert.equal(h.spent.length, 1);
});

test('a HUD-only tether selection does not claim the stock', async t => {
  const h = await fixture(t); h.arm();
  h.state.player.tether = { active: true, targetId: h.remains[0].id };
  const reserve = h.engine._machine().reserve;
  for (let i = 0; i < 240 && h.engine._machine().reserve === reserve; i++) h.step();
  assert.equal(h.engine._machine().reserve, reserve - 1);
});

for (const kind of ['generation', 'replacement']) test(`${kind} cannot inherit an almost-finished weld`, async t => {
  const h = await fixture(t); h.arm(); h.b.timer[h.builder] = DT / 2;
  const old = h.remains[0], reserve = h.engine._machine().reserve;
  if (kind === 'generation') old.occupantGeneration++;
  else {
    const replacement = { ...old, pos: { ...old.pos }, vel: { ...old.vel } };
    h.state.entities.set(old.id, replacement);
    h.state.entityList[h.state.entityList.indexOf(old)] = replacement;
    h.state.entityIndex.payloads[h.state.entityIndex.payloads.indexOf(old)] = replacement;
    h.remains[0] = replacement;
  }
  h.step(); assert.equal(h.b.channelEntity[h.builder], -1);
  assert.equal(h.engine._machine().reserve, reserve); assert.deepEqual(h.spent, []);
  h.arm(); assert.ok(h.b.timer[h.builder] > 2.9, 'fresh identity requires a fresh channel');
});

for (const [name, mutate] of [
  ['dead', e => { e.alive = false; }],
  ['noncolliding', e => { e.collides = false; }],
  ['body removed', e => { e.physicsBody = false; }],
  ['expired', (e, h) => { e.data.despawnAt = h.state.simTime; }],
]) test(`${name} stock cannot finish an old weld`, async t => {
  const h = await fixture(t); h.arm(); h.b.timer[h.builder] = DT / 2;
  const reserve = h.engine._machine().reserve; mutate(h.remains[0], h); h.step();
  assert.equal(h.b.channelEntity[h.builder], -1); assert.equal(h.engine._machine().reserve, reserve);
  assert.deepEqual(h.spent, []);
});

test('pause preserves the clock and resume observes the real catch before spending', async t => {
  const h = await fixture(t); h.arm(); const remaining = h.b.timer[h.builder];
  h.state.mode = 'pause'; h.catchRemain(); h.step(90);
  assert.equal(h.b.timer[h.builder], remaining); assert.deepEqual(h.spent, []);
  h.state.mode = 'flight'; h.step(); assert.equal(h.b.channelEntity[h.builder], -1);
});

test('the held husk remains physical ammunition against its former welder', async t => {
  const h = await fixture(t); h.arm(); const held = h.remains[0]; h.catchRemain();
  held.pos.x = h.b.px[h.builder]; held.pos.z = h.b.pz[h.builder]; held.vel.x = 80;
  h.step(); assert.equal(h.b.alive[h.builder], 0); assert.equal(held.alive, true);
  assert.deepEqual(h.spent, [], 'custody changes salvage, never ordinary mass contact');
});

for (const builder of ['repair_drone', 'assembler']) {
  for (const change of ['clear', 'pause', 'replace run', 'restart same wave', 'kill builder']) {
    test(`${builder}: spending callback cannot continue after ${change}`, async t => {
      const h = await fixture(t, builder); h.arm(); h.b.timer[h.builder] = DT / 2;
      let reserveAfterCallback;
      h.bus.once('swarm:broodRemainsSpent', () => {
        if (change === 'clear') h.state.run.phase = 'cleared';
        if (change === 'pause') h.state.mode = 'pause';
        if (change === 'replace run') h.state.run = { ...h.state.run };
        if (change === 'restart same wave') {
          h.engine.clear(); h.engine.prepareWave(h.state.run, 58); h.engine.spawnWave(h.state);
        }
        if (change === 'kill builder') h.engine._killDirectForTest(h.builder, 'direct');
        reserveAfterCallback = h.engine._machine().reserve;
      });
      h.step();
      assert.equal(h.spent.length, 1, 'the cancelled recipe never spends its next ingredient');
      assert.equal(h.engine._machine().reserve, reserveAfterCallback, 'the old completion cannot mint');
      if (builder === 'assembler') assert.equal(h.remains[1].alive, true);
    });
  }
}

test('a fresh round forgets the old partial weld and current custody stays authoritative', async t => {
  const h = await fixture(t); h.arm(); h.b.timer[h.builder] = 0.1; h.catchRemain();
  h.engine.clear(); h.engine.prepareWave(h.state.run, 58); h.engine.spawnWave(h.state);
  const builder = h.b.alive.findIndex((n, i) => n && h.b.liveFamilyId[h.b.family[i]] === 'repair_drone');
  assert.ok(builder >= 0);
  for (let i = 0; i < h.b.alive.length; i++) if (i !== builder) h.b.alive[i] = 0;
  h.b.px[builder] = 0; h.b.pz[builder] = 0;
  const reserve = h.engine._machine().reserve; h.step(240);
  assert.equal(h.b.channelEntity[builder], -1); assert.equal(h.engine._machine().reserve, reserve);
  assert.deepEqual(h.spent, []); assert.equal(h.remains[0].alive, true);
});
