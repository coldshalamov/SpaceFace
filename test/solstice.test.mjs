import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSolstice, solsticeEntitySpec, SOLSTICE_GLOBAL_ANCHOR } from '../src/systems/solstice.js';
import { SOLSTICE as C, SOLSTICE_LINES, SOLSTICE_AUDIO_RECIPES, freshSolsticeMemory, normalizeSolsticeMemory } from '../src/data/solstice.js';
import { prismFocalGoal, isPrismInFocalZone, isPlayerInBeam, wispFollowServo } from '../src/characters/solsticeRules.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { SECTORS } from '../src/data/sectors.js';

function createFixture(memory = freshSolsticeMemory()) {
  const state = {
    simTime: 0,
    tick: 0,
    mode: 'flight',
    timeScale: 1,
    run: { kind: 'adventure' },
    world: { currentSectorId: C.sectorId },
    entities: new Map(),
    entityList: [],
    combat: { attachments: { byId: {} } },
    solstice: memory,
  };

  const bus = createBus();
  const events = [];
  let id = 0;
  let seq = 0;

  const helpers = {
    spawnEntity(spec) {
      const e = makeEntity({ ...spec, id: ++id });
      state.entities.set(e.id, e);
      state.entityList.push(e);
      return e;
    },
    removeEntity(eid) {
      const e = state.entities.get(eid);
      if (e) e.alive = false;
      state.entities.delete(eid);
      const idx = state.entityList.findIndex(x => x.id === eid);
      if (idx >= 0) state.entityList.splice(idx, 1);
    },
    voice: {
      say(p) {
        events.push(['voice', p]);
        return true;
      },
    },
  };

  const player = helpers.spawnEntity({
    type: 'ship',
    team: 0,
    isPlayer: true,
    pos: { x: SOLSTICE_GLOBAL_ANCHOR.x + 80, z: SOLSTICE_GLOBAL_ANCHOR.z + 80 },
    vel: { x: 0, y: 0, z: 0 },
    radius: 4,
    mass: 18,
    hull: 100,
    hullMax: 100,
    shield: 20,
    shieldMax: 100,
    energy: 20,
    energyMax: 100,
    flags: {},
    physicsBody: { dynamic: true, shape: 'ball', radius: 4, mass: 18 },
  });
  state.playerId = player.id;

  for (const name of ['solstice:voice', 'solstice:beam_enter', 'solstice:charged', 'solstice:bloom', 'solstice:wisp_toggle', 'audio:cue']) {
    bus.on(name, p => events.push([name, p]));
  }

  const system = createSolstice();
  system.init({ state, bus, helpers });

  const step = (dt = 1 / 60) => {
    state.simTime += dt;
    state.tick++;
    system.update(dt);
    for (const e of state.entityList) {
      if (e.data?.solsticePart === 'wisp') continue;
      const cmd = consumePhysicsCommand(e);
      if (cmd && cmd.impulses) {
        for (const imp of cmd.impulses) {
          const m = e.physicsBody?.mass ?? e.mass ?? 1;
          e.vel.x += imp.x / m;
          e.vel.z += imp.z / m;
        }
      }
      e.pos.x += (e.vel.x || 0) * dt;
      e.pos.z += (e.vel.z || 0) * dt;
    }
  };
  const advance = (seconds) => {
    const steps = Math.ceil(seconds * 60);
    for (let i = 0; i < steps; i++) step();
  };
  const scan = (overrides = {}) => {
    bus.emit('scan:pulse', {
      source: 'player-scanner',
      scannerId: player.id,
      seq: ++seq,
      pos: { x: player.pos.x, z: player.pos.z },
      radius: 350,
      ...overrides,
    });
  };

  step(); // initial tick
  return { state, bus, helpers, player, events, system, step, advance, scan };
}

test('solstice system is wired into production manifests and factory tables', async () => {
  assert.equal(PRODUCTION_INIT_ORDER.filter(x => x === 'solstice').length, 1);
  assert.equal(PRODUCTION_UPDATE_ORDER.filter(x => x === 'solstice').length, 1);
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('solstice') < PRODUCTION_UPDATE_ORDER.indexOf('physics'));

  const registrySrc = await readFile(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(registrySrc, /\['solstice', solstice\]/);

  const nodeFactorySrc = await readFile(new URL('../src/runtime/nodeSystemFactoryTable.js', import.meta.url), 'utf8');
  assert.match(nodeFactorySrc, /\['solstice', solstice\]/);
});

test('global entity, sector POI and entity specifications agree in Ceres Belt', () => {
  const f = createFixture();
  const core = f.system._core();
  assert.ok(core, 'Solstice core is spawned');
  assert.deepEqual({ x: core.pos.x, z: core.pos.z }, { x: SOLSTICE_GLOBAL_ANCHOR.x, z: SOLSTICE_GLOBAL_ANCHOR.z });

  const ceres = SECTORS.find(s => s.id === C.sectorId);
  assert.ok(ceres, 'Ceres sector found');
  const poi = ceres.pois.find(p => p.id === 'poi_solstice_lantern');
  assert.ok(poi, 'poi_solstice_lantern exists');
  assert.deepEqual(poi.pos, C.anchor);

  assert.equal(core.data.solsticePart, 'core');
  assert.equal(core.flags.invuln, true);
  assert.equal(core.physicsBody.dynamic, false);

  assert.equal(f.system._prisms.length, 3);
  for (let i = 0; i < 3; i++) {
    const prism = f.system._entity(f.system._prisms[i]);
    assert.ok(prism, `Prism ${i} is spawned`);
    assert.equal(prism.data.solsticePart, 'prism');
    assert.equal(prism.physicsBody.dynamic, true);
    assert.equal(prism.physicsBody.ccd, true);
  }

  f.system.destroy();
});

test('does not spawn in another sector, survival mode, or lab', () => {
  for (const [kind, sector] of [['survival', C.sectorId], ['lab', C.sectorId], ['adventure', 'sector_helios_prime']]) {
    const f = createFixture();
    f.state.run.kind = kind;
    f.state.world.currentSectorId = sector;
    f.bus.emit('sector:enter', {});
    f.step();
    assert.equal(f.system._core(), null);
    f.system.destroy();
  }
});

test('scan pulse hails solstice and validates provenance', () => {
  const f = createFixture();
  assert.equal(f.state.solstice.met, false);

  // Invalid scan: distant
  f.player.pos.x += 1000;
  f.scan();
  assert.equal(f.state.solstice.met, false);
  f.player.pos.x -= 1000;

  // Valid scan: hails solstice
  f.scan();
  assert.equal(f.state.solstice.met, true);
  const voiceEvents = f.events.filter(x => x[0] === 'solstice:voice');
  assert.equal(voiceEvents.length, 1);
  assert.equal(voiceEvents[0][1].key, 'hello');

  // Second scan with duplicate seq is rejected
  const currentSeq = f.system._scanSeq;
  f.scan({ seq: currentSeq });
  assert.equal(f.events.filter(x => x[0] === 'solstice:voice').length, 1);

  f.system.destroy();
});

test('beam riding recharges shields and energy, and grants Lumen Charge buff', () => {
  const f = createFixture();
  // Aim beam directly at player (+X axis)
  f.system._beamAngle = 0;
  f.player.pos.x = SOLSTICE_GLOBAL_ANCHOR.x + 80;
  f.player.pos.z = SOLSTICE_GLOBAL_ANCHOR.z;
  f.player.shield = 20;
  f.player.energy = 20;

  f.step();
  assert.ok(f.events.some(x => x[0] === 'solstice:beam_enter'), 'beam_enter emitted');

  f.advance(2.6); // Stay in beam long enough for full charge
  assert.ok(f.player.shield > 40, 'Shields recharged');
  assert.ok(f.player.energy > 40, 'Energy recharged');
  assert.equal(f.player.flags?.lumenCharged, true, 'Lumen Charge buff granted');
  assert.ok(f.events.some(x => x[0] === 'solstice:charged'), 'solstice:charged emitted');

  f.system.destroy();
});

test('aligning focus prisms triggers Supernova Bloom and drops rare crystal reward', () => {
  const f = createFixture();
  f.scan();
  assert.equal(f.state.solstice.bloomed, false);

  // Hold prisms aligned with the beam during the bloom hold window
  const steps = Math.ceil((C.bloomHoldTime + 0.2) * 60);
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < 3; i++) {
      const prism = f.system._entity(f.system._prisms[i]);
      const goal = prismFocalGoal(i, f.system._beamAngle, SOLSTICE_GLOBAL_ANCHOR);
      prism.pos.x = goal.x;
      prism.pos.z = goal.z;
      prism.vel.x = 0;
      prism.vel.z = 0;
    }
    f.step();
  }

  assert.equal(f.state.solstice.bloomed, true);
  assert.ok(f.events.some(x => x[0] === 'solstice:bloom'), 'solstice:bloom event fired');

  const crystals = f.state.entityList.filter(e => e.type === 'pickup');
  assert.ok(crystals.length >= 3, 'Reward crystals spawned');
  assert.equal(crystals[0].data?.commodity, 'cmdty_ore_rare');

  f.system.destroy();
});

test('scanning after bloom toggles the Lumen Wisp follower', () => {
  const f = createFixture();
  f.state.solstice.bloomed = true;
  f.state.solstice.met = true;

  assert.equal(f.state.solstice.wispActive, false);
  f.scan();
  assert.equal(f.state.solstice.wispActive, true);
  assert.ok(f.events.some(x => x[0] === 'solstice:wisp_toggle' && x[1].active === true));

  const wisp = f.system._wispRef;
  assert.ok(wisp, 'Lumen Wisp entity exists');

  // Wisp follows player motion
  const initialWispX = wisp.pos.x;
  f.player.pos.x += 40;
  f.advance(1.5);
  assert.ok(wisp.pos.x > initialWispX, 'Wisp moved forward following player');

  // Scan again recalls wisp
  f.scan();
  assert.equal(f.state.solstice.wispActive, false);
  assert.equal(f.system._wispRef, null);

  f.system.destroy();
});

test('easter eggs: speed orbit and quiet stillness trigger distinct barks', () => {
  const f = createFixture();
  f.scan();

  // 1. Speed orbit easter egg
  f.player.pos.x = SOLSTICE_GLOBAL_ANCHOR.x + 80;
  f.player.pos.z = SOLSTICE_GLOBAL_ANCHOR.z;
  f.player.vel.x = 120;
  f.player.vel.z = 20;
  f.step();
  assert.equal(f.state.solstice.orbitHeard, true);
  assert.ok(f.events.some(x => x[0] === 'solstice:voice' && x[1].key === 'speedOrbit'));

  // 2. Quiet stillness easter egg
  f.player.pos.x = SOLSTICE_GLOBAL_ANCHOR.x + 45;
  f.player.pos.z = SOLSTICE_GLOBAL_ANCHOR.z;
  f.player.vel.x = 0;
  f.player.vel.z = 0;
  f.advance(5.2);
  assert.equal(f.state.solstice.quietHeard, true);
  assert.ok(f.events.some(x => x[0] === 'solstice:voice' && x[1].key === 'quiet'));

  f.system.destroy();
});

test('memory normalization rejects malformed data and preserves valid states', () => {
  assert.deepEqual(normalizeSolsticeMemory({ version: 99 }), freshSolsticeMemory());

  const m = normalizeSolsticeMemory({
    version: 1,
    met: true,
    bloomed: true,
    wispActive: true,
    visits: 5,
    bloomsCount: 2,
    chargesCount: 8,
    hull: 1500,
  });

  assert.equal(m.met, true);
  assert.equal(m.bloomed, true);
  assert.equal(m.wispActive, true);
  assert.equal(m.visits, 5);
  assert.equal(m.bloomsCount, 2);
  assert.equal(m.chargesCount, 8);
  assert.equal(m.hull, 1500);
});

test('all solstice audio recipes are unique and registered in live audio recipe bank', () => {
  assert.equal(SOLSTICE_AUDIO_RECIPES.length, 5);
  for (const recipe of SOLSTICE_AUDIO_RECIPES) {
    assert.ok(RECIPES.some(r => r.id === recipe.id), `Recipe ${recipe.id} in live RECIPES list`);
  }
});
