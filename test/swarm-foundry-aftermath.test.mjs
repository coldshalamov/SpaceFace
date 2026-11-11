import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { resolvePhysicsBodySpec, markPhysicsBodyNativeFailure } from '../src/core/physicsAuthority.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { combat } from '../src/systems/combat.js';
import { createBroodEngine, BROOD_PHASE_WINDUP } from '../src/systems/swarmBrood.js';
import { planSwarmOpeningWreck } from '../src/systems/swarmOpeningWreck.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { foundryAftermathIntermission } from '../src/ui/screens/crucibleDraft.js';

const DT = 1 / 60, TOTAL = swarmBroodPopulation(6);
const plan = wave => planWave({ seed: 4242, wave, arenaId: 'helios_core', ruleset: 'swarm' });
function fixture(t) {
  const sim = createSimulation({ seed: 4242, systems: [] });
  t.after(() => sim.dispose());
  const { state, bus } = sim, events = [];
  state.mode = 'flight'; state.rockCore = { ratingT: 0 };
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    arenaId: 'helios_core', phase: 'active', wave: 6 };
  const add = spec => { const e = sim.spawn({ collides: true, vel: { x: 0, z: 0 }, ...spec }); resolvePhysicsBodySpec(e); return e; };
  const player = add({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 8, mass: 40, hull: 100, hullMax: 100 });
  state.playerId = player.id;
  const rock = add({ type: 'wreck', pos: { x: 88, z: 0 }, radius: 7, mass: 35,
    physicsBody: { dynamic: true, radius: 7, mass: 35 }, data: { swarmBossChunk: true,
      physicalRole: 'throw_mass', capitalBossEncounterId: 'capital_boss_hulk', capitalBossActorKey: 'swarm:w5/boss_chunk/0' } });
  state.run.telemetry.foundryMawOffcut = { id: rock.id, generation: rock.occupantGeneration, fightId: 'swarm:w5' };
  for (const event of ['swarm:broodKills', 'run:awardRequested']) bus.on(event, payload => events.push({ event, ...payload }));
  const engine = createBroodEngine({ getState: () => state, bus });
  engine.prepareWave(state.run, 6, plan(6));
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { state.tick++; state.simTime += DT; engine.step(state); } };
  return { sim, state, bus, add, player, rock, engine, events, tick };
}
const layout = h => planSwarmOpeningWreck(h.state, h.state.run, h.state.run.wave, [{ id: 'mite', count: 50 }], 2.4);

test('the surviving original fronts three finite Mites without moving bodies or changing the RNG', t => {
  const h = fixture(t), before = structuredClone(h.state.entityList), run = structuredClone(h.state.run);
  assert.deepEqual(layout(h).points, [{ x: 133, z: 0 }, { x: 148, z: 0 }, { x: 163, z: 0 }]);
  assert.equal(layout(h).rockId, h.rock.id);
  assert.deepEqual(structuredClone(h.state.entityList), before); assert.deepEqual(h.state.run, run);
  noteSwarmPilotAction(h.state); assert.equal(h.engine.spawnWave(h.state), 3);
  assert.equal(h.engine.view.pendingCount, TOTAL - 3);
  assert.deepEqual(h.events, []);
});

for (const [name, change] of [
  ['missing original', h => h.state.entities.delete(h.rock.id)],
  ['copied receipt generation', h => h.rock.occupantGeneration++],
  ['retiring original', h => h.rock.data.despawnAt = 20],
  ['destroyed original', h => h.rock.alive = false],
  ['disabled collider', h => h.rock.collides = false],
  ['bodyless original', h => h.rock.physicsBody = false],
  ['failed native body', h => markPhysicsBodyNativeFailure(h.rock, 'test')],
  ['ghost projectile', h => { h.rock.physicsBody.material = 'projectile'; h.rock.physicsBody.revision++; }],
  ['sensor body', h => { h.rock.physicsBody.material = 'sensor'; h.rock.physicsBody.revision++; }],
  ['flying original', h => h.rock.vel.x = 6.1],
  ['remote original', h => h.rock.pos.x = 221],
  ['touching original', h => h.rock.pos.x = 44],
  ['carried load', h => h.state.rockCore.ratingT = 35],
  ['other arena', h => h.state.run.arenaId = 'the_hive'],
  ['mutated run', h => h.state.run.arenaMutators = ['dense']],
  ['Circuit', h => h.state.run.telemetry.circuit = {}],
  ['later round', h => h.state.run.wave = 7],
  ['blocked final throw', h => h.add({ type: 'asteroid', pos: { x: 162, z: 10 }, radius: 3, mass: 20 })],
  ['blocked ordinary latch', h => h.add({ type: 'asteroid', pos: { x: 44, z: 0 }, radius: 10, mass: 20 })],
]) test(`${name} keeps ordinary finite fallback instead of manufacturing a wreck scene`, t => {
  const h = fixture(t); change(h); assert.equal(layout(h), null);
  h.state.run.wave = 6; noteSwarmPilotAction(h.state); h.engine.spawnWave(h.state);
  assert.equal(h.engine.view.aliveCount + h.engine.view.pendingCount, TOTAL);
});

test('catching the original as the first action does not disqualify its own scene', t => {
  const h = fixture(t); h.state.rockCore.ratingT = 35;
  h.state.player.tether = { active: true, targetId: h.rock.id };
  assert.equal(layout(h)?.rockId, h.rock.id);
});

test('no admission or reward during idle; first real action begins a six-second clock, frozen in pause', t => {
  const h = fixture(t); assert.equal(h.engine.spawnWave(h.state), 0); h.tick(600);
  assert.equal(h.engine.view.aliveCount, 0); assert.equal(h.engine.view.pendingCount, TOTAL); assert.deepEqual(h.events, []);
  noteSwarmPilotAction(h.state); h.engine.spawnWave(h.state); assert.equal(h.engine.view.aliveCount, 3);
  // Clock seam: hold the three ordinary lives in their existing windup state so
  // their early defeat cannot legitimately shorten the read window.
  const b = h.engine._bodies;
  for (let i = 0; i < 3; i++) { b.phase[i] = BROOD_PHASE_WINDUP; b.timer[i] = 100; }
  for (let i = 0; i < 400; i++) h.engine.step(h.state);
  h.tick(120); h.state.mode = 'pause'; h.tick(300); h.state.mode = 'flight';
  h.tick(239); assert.equal(h.engine.view.aliveCount, 3);
  h.tick(); assert.equal(h.engine.view.aliveCount, 21); assert.equal(h.engine.view.pendingCount, TOTAL - 21);
});

test('an existing blast can end the wreck beat early; no forced throw or extra population', t => {
  const h = fixture(t); noteSwarmPilotAction(h.state); h.engine.spawnWave(h.state);
  h.engine.onExplosion({ pos: { x: 148, z: 0 }, radius: 50, ownerId: h.player.id });
  assert.equal(h.engine.view.aliveCount, 0); h.tick();
  assert.equal(h.engine.view.aliveCount, 18); assert.equal(h.engine.view.pendingCount, TOTAL - 21);
});

test('the round-six ship plan gives six active seconds before normal arrivals and Jackal follows at eight', () => {
  const p = plan(6); assert.equal(p.swarm.foundry.shipReadTicks, 360); assert.equal(p.swarm.foundry.debutReadTicks, 480);
  assert.equal(p.swarm.killTarget, 42); assert.equal(p.swarm.foundry.massGap, false);
});

test('Foundry Maw death stays in flight and does not claim that the round cleared or pay twice', t => {
  const sim = createSimulation({ seed: 4242, systems: [combat, createProductionCapitalBossEncounters()] });
  t.after(() => sim.dispose()); const { state, bus } = sim, events = [];
  state.mode = 'flight'; state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    arenaId: 'helios_core', wave: 5, phase: 'active' };
  const p = sim.spawn({ type: 'ship', team: 0, pos: { x: -150, z: 0 }, radius: 8, mass: 46, hull: 100 }); state.playerId = p.id;
  const boss = sim.spawn({ type: 'ship', team: 1, pos: { x: 0, z: 0 }, radius: 28, mass: 1000, hull: 1000, data: {} });
  sim.registry.get('capitalBossEncounters').start({ fightId: 'swarm:w5', encounterId: 'capital_boss_hulk', bossId: boss.id, targetId: p.id });
  for (const type of ['ui:pushScreen', 'swarm:announce', 'run:waveCleared', 'run:awardRequested']) bus.on(type, payload => events.push({ type, payload }));
  sim.registry.get('combat').onHit({ targetId: boss.id, ownerId: p.id, damage: 100000, damageType: 'kinetic', pos: { ...boss.pos } });
  assert.equal(state.run.phase, 'active'); assert.equal(state.mode, 'flight');
  assert.equal(state.run.telemetry.firstBossDown.pending, false);
  assert.equal(events.filter(e => e.type === 'ui:pushScreen' || e.type === 'run:waveCleared').length, 0);
  assert.equal(events.filter(e => e.type === 'swarm:announce').length, 1);
  assert.equal(foundryAftermathIntermission(state.run), null);
  const before = structuredClone(events); bus.emit('entity:killed', { id: boss.id }); assert.deepEqual(events, before);
  state.run.phase = 'draft'; state.run.credits = 25;
  assert.match(foundryAftermathIntermission(state.run, [{ kind: 'service', service: 'hull_patch', available: true, name: 'Hull Patch', price: 12 }]), /Iron Maw down\. Round 5 cleared\. Hull Patch: 12 cr/);
  assert.match(foundryAftermathIntermission(state.run), /extraction opens after round 10/);
  state.run.wave = 6; assert.match(foundryAftermathIntermission(state.run), /next charge/);
  state.run.wave = 7; assert.equal(foundryAftermathIntermission(state.run), null);
});

test('aftermath never promises unaffordable repairs, invented boss history or other modes', () => {
  const run = { kind: 'survival', ruleset: 'swarm', arenaId: 'helios_core', phase: 'draft', wave: 5,
    credits: 10, telemetry: { firstBossDown: { wave: 5 } } };
  assert.doesNotMatch(foundryAftermathIntermission(run, [{ kind: 'service', service: 'weld', available: true, name: 'Weld', price: 40 }]), /Weld/);
  for (const patch of [{ phase: 'defeat' }, { arenaId: 'the_hive' }, { telemetry: {} }, { arenaMutators: ['dense'] }])
    assert.equal(foundryAftermathIntermission({ ...run, ...patch }), null);
});

test('native first RMB admits the original-wreck scene; ordinary flight and cut keep the original body and real rewards', async t => {
  const { bootRealPath } = await import('../scripts/lib/bench/realPath.mjs');
  const { input } = await import('../src/systems/input.js');
  const { runSession } = await import('../src/systems/runSession.js');
  const { actions } = await import('../src/systems/actions.js');
  const { tetherGameplay } = await import('../src/systems/tetherGameplay.js');
  const { masslineThrow } = await import('../src/systems/masslineThrow.js');
  const { tumbleStates } = await import('../src/systems/tumbleStates.js');
  const { swarmArena } = await import('../src/systems/swarmArena.js');
  const { COMBAT_LAB_STARTER_PACKAGES } = await import('../src/data/combatLabSetups.js');
  const kit = COMBAT_LAB_STARTER_PACKAGES.find(k => k.id === 'ricochet_runner');
  const fittings = Array(13).fill(null); for (const row of kit.loadout) fittings[row.slotIndex] = row.defId;
  async function play(control) {
    const h = await bootRealPath({ seed: 4242,
      systems: [input, runSession, combat, actions, tetherGameplay, masslineThrow, tumbleStates,
        swarmArena, createProductionCapitalBossEncounters(), 'flightV3', 'physics'],
      hulls: [{ hullId: kit.hullId, fittings, isPlayer: true, pos: { x: -150, z: 0 }, rot: 0.627 }] });
    try {
      const s = h.state, p = h.player;
      // Historical W5 battle, starting heading and champion damage are explicit
      // fixtures. No later prop/target placement, attachment or impulse is injected.
      s.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
        phase: 'active', wave: 5, arenaId: 'helios_core' }; s.input.autoFire = false;
      const boss = h.runtime.spawn({ type: 'ship', team: 1, pos: { x: 0, z: 0 }, radius: 28,
        mass: 1000, hull: 1000, hullMax: 1000, collides: true, data: { scanLabel: 'Iron Maw' } });
      h.runtime.getSystem('capitalBossEncounters').start({ encounterId: 'capital_boss_hulk', fightId: 'swarm:w5', bossId: boss.id, targetId: p.id });
      h.withFeatures(() => h.runtime.getSystem('combat').onHit({ targetId: boss.id, ownerId: p.id,
        damage: 100000, damageType: 'kinetic', pos: { ...boss.pos } }));
      const offcut = s.entities.get(s.run.telemetry.foundryMawOffcut.id), generation = offcut.occupantGeneration;
      h.step(240); // Real native separation of the dropped pieces, not a teleported clear lane.
      s.run.phase = 'wave_intro'; s.run.wave = 6;
      h.bus.emit('run:wavePlanned', { wave: 6, plan: plan(6) });
      s.run.phase = 'active'; h.bus.emit('run:waveStarted', { wave: 6 });
      const engine = h.runtime.getSystem('swarmArena')._brood;
      assert.equal(engine.view.aliveCount, 0); assert.equal(engine.view.pendingCount, TOTAL);
      assert.ok(planSwarmOpeningWreck(s, s.run, 6, [{ id: 'mite', count: 50 }], 2.4));
      const atStart = { ...offcut.pos }, hull = p.hull, events = [], inputs = [];
      for (const event of ['tether:latched', 'tether:released', 'tether:latchDenied', 'swarm:broodKills'])
        h.bus.on(event, payload => events.push({ event, tick: s.tick, ...payload }));
      const inp = h.runtime.getSystem('input');
      const send = event => { inputs.push({ tick: s.tick, ...event }); inp.ingestLaneDomEvent(event); };
      const rmb = pressed => send({ type: pressed ? 'mousedown' : 'mouseup', button: 2,
        clientX: 600, clientY: 400, blocked: false, offCanvas: false });
      send({ type: 'pointermove', clientX: 600, clientY: 400 });
      send({ type: 'cursorProjection', x: offcut.pos.x, z: offcut.pos.z });
      rmb(true); h.step(1); rmb(false);
      assert.equal(engine.view.aliveCount, 3); assert.equal(engine.view.pendingCount, TOTAL - 3);
      assert.equal(events.find(e => e.event === 'tether:latched')?.targetId, offcut.id);
      if (control) offcut.data.physicalRole = 'cover'; // Only Brood mover admission, after the identical scene admitted.
      send({ type: 'keydown', code: 'KeyW', pressed: true, blocked: false });
      for (let tick = 0; tick < 250; tick++) {
        if (tick === 80) rmb(true);
        if (tick === 81) {
          rmb(false); send({ type: 'keyup', code: 'KeyW', pressed: false });
          send({ type: 'keydown', code: 'Digit0', pressed: true, blocked: false });
        }
        h.step(1);
      }
      assert.equal(s.entities.get(offcut.id), offcut); assert.equal(offcut.occupantGeneration, generation);
      assert.equal(offcut.alive, true); assert.equal(p.hull, hull);
      assert.ok(Math.hypot(offcut.pos.x - atStart.x, offcut.pos.z - atStart.z) > 150);
      assert.equal(events.filter(e => e.event === 'tether:latched').length, 1);
      assert.equal(events.filter(e => e.event === 'tether:released').length, 1);
      assert.equal(events.filter(e => e.event === 'tether:latchDenied').length, 0);
      assert.equal(s.massline2?.throw?.lastThrow ?? null, null, 'RMB cut is not a synthetic throw-owner gesture');
      return { events, inputs, credits: s.run.credits, score: s.run.score,
        distance: Math.hypot(offcut.pos.x - atStart.x, offcut.pos.z - atStart.z), proof: h.proof() };
    } finally { h.dispose(); }
  }
  const actual = await play(false), control = await play(true);
  assert.deepEqual(actual.inputs, control.inputs); assert.deepEqual(actual.events, control.events);
  assert.equal(actual.credits, 2); assert.equal(actual.score, 24);
  assert.equal(actual.credits, control.credits); assert.equal(actual.score, control.score);
  // This maneuver's two kills are pilot contacts, not offcut bonus credit. The
  // separate unchanged wreck-payoff suite proves actual post-release offcut pay.
  assert.equal(actual.proof.backend, 'rapier-dynamic'); assert.equal(actual.proof.flightBackend, 'v3');
  t.diagnostic(JSON.stringify({ inputs: actual.inputs, events: actual.events, offcutTravel: actual.distance,
    credits: actual.credits, score: actual.score, matchingMoverRemovalControl: true, proof: actual.proof }));
});

test('mounted Armory shows the earned Maw handover and keeps the ordinary launch intent', async () => {
  const { fakeDom, textLines } = await import('./helpers/fake-dom.mjs');
  const { crucibleDraftScreen } = await import('../src/ui/screens/crucibleDraft.js');
  const { createBus } = await import('../src/core/eventBus.js');
  const previous = globalThis.document, doc = fakeDom(); globalThis.document = doc;
  const bus = createBus(), requests = [];
  bus.on('run:draftPickRequested', p => requests.push(p));
  const run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'draft', arenaId: 'helios_core', wave: 5, credits: 280,
    telemetry: { firstBossDown: { wave: 5, pending: false, presentation: 'foundry_intermission' } } };
  const owner = { currentOffers: () => [], currentWave: () => run.wave, lastNotice: () => null,
    rerollState: () => null, recommendedOffers: () => [] };
  const ctx = { bus, state: { run, player: { ownedShips: [] } },
    registry: { get: name => name === 'survivalDraft' ? owner : null }, screenManager: { top: () => 'crucibleDraft' } };
  const screen = Object.create(crucibleDraftScreen), root = doc._make('div');
  try {
    screen.mount(root, ctx); screen.refresh(ctx);
    assert.match(screen._sub.textContent, /Iron Maw down\. Round 5 cleared/);
    assert.match(textLines(root).join(' '), /Launch round 6/);
    assert.match(screen._preview.textContent, /If the Maw offcut survives nearby/);
    screen._skip.click(); assert.equal(requests.length, 1);
    assert.equal(run.credits, 280); assert.equal(run.phase, 'draft', 'the UI only requests launch');
  } finally { screen.unmount?.(); globalThis.document = previous; }
});
