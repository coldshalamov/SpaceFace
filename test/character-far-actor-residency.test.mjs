// The far-actor table shelves any drone/ship/wreck once the pilot is past its exit radius, and the
// owner systems of the hand-built story characters re-mint a missing body on their own census.
// Together that thrashed: a pilot arriving from a gate (far from the character) saw the body spawn,
// vanish within two ticks, respawn a second later, and finally meet an anonymous promoted twin.
// Vesper and Bracket hold residency on the data.authoredCharacter stamp. Solstice and Ravel stream
// by distance like Rubric does (nothing is minted for a far pilot; the cohort withdraws past the
// stream-out radius), keeping the stamp as belt-and-braces for any body that still reaches the
// table. Run: node --test test/character-far-actor-residency.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createSolstice, SOLSTICE_GLOBAL_ANCHOR } from '../src/systems/solstice.js';
import { createRavel, RAVEL_GLOBAL_ANCHOR } from '../src/systems/ravel.js';
import { createVesper } from '../src/systems/vesper.js';
import { createBracket } from '../src/systems/bracket.js';
import { SOLSTICE } from '../src/data/solstice.js';
import { RAVEL } from '../src/data/ravel.js';
import { VESPER } from '../src/data/vesper.js';
import { BRACKET } from '../src/data/bracket.js';
import { SIM_TIER } from '../src/world/activityClassification.js';
import { farActorCensus, farActorTableRadius, shouldVirtualizeFarActor, tickFarActors } from '../src/world/farActorTable.js';

const CHARACTERS = [
  { name: 'solstice', make: createSolstice, sectorId: SOLSTICE.sectorId, owns: (e) => !!e.data?.solsticePart,
    anchor: SOLSTICE_GLOBAL_ANCHOR, owner: 'solstice', streamed: true },
  { name: 'ravel', make: createRavel, sectorId: RAVEL.sectorId, owns: (e) => !!e.data?.ravelPart,
    anchor: RAVEL_GLOBAL_ANCHOR, owner: 'ravel', streamed: true },
  { name: 'vesper', make: createVesper, sectorId: VESPER.sectorId, owns: (e) => e.data?.vesper === true },
  { name: 'bracket', make: createBracket, sectorId: BRACKET.sectorId, owns: (e) => !!e.data?.bracketPart },
];

function boot(sectorId) {
  const state = createGameState(21);
  state.mode = 'flight';
  state.meta.seed = 21;
  state.world.currentSectorId = sectorId;
  const bus = createBus();
  const helpers = { sectorCookProviders: [] };
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({ type: 'ship', pos: { x: 0, z: 0 }, radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true });
  state.playerId = player.id;
  player.isPlayer = true;
  return { state, bus, helpers, player };
}

const parts = (state, owns) => state.entityList.filter((e) => e.alive && owns(e));

for (const c of CHARACTERS) {
  if (c.streamed) {
    test(`${c.name}: a pilot arriving from far away mints nothing; the cohort streams in whole and withdraws whole`, () => {
      const { state, bus, helpers, player } = boot(c.sectorId);
      const system = c.make();
      system.init({ state, bus, helpers });
      bus.emit('sector:enter', {});
      system.update(1 / 60, state);

      const exit = farActorTableRadius(state).exit;
      const anchor = c.anchor;
      const shelved = [];
      bus.on('world:farActorShelved', (p) => shelved.push(p));
      const run = (seconds) => {
        for (let n = 0; n < 60 * seconds; n++) {
          state.tick++;
          state.simTime += 1 / 60;
          system.update(1 / 60, state);
          tickFarActors(state, helpers, bus);
          bus.flush?.();
        }
      };

      // Gate arrival: the pilot lands well past the exit radius, so nothing exists yet — there is
      // nothing for the far table to shelve and no census thrash can start.
      player.pos.x = anchor.x + exit + 3000;
      player.pos.z = anchor.z;
      run(6);
      assert.deepEqual(parts(state, c.owns), [], 'nothing is minted for a far pilot');
      assert.deepEqual(shelved.map((p) => p.id), [], 'the far table never saw a body to shelve');
      assert.equal(farActorCensus(state).farActors, 0, 'nothing of it sits on the far shelf');

      // Approaching past the stream-in radius (exit - 350) mints the cohort once and keeps it.
      player.pos.x = anchor.x + exit - 450;
      player.pos.z = anchor.z;
      run(2);
      const born = parts(state, c.owns);
      assert.ok(born.length >= 3, `${c.name} minted its cohort (${born.length})`);
      const ids = born.map((e) => e.id).sort((a, b) => a - b);
      run(4);
      assert.deepEqual(parts(state, c.owns).map((e) => e.id).sort((a, b) => a - b), ids, 'the same bodies: no thrash, no twins');
      assert.deepEqual(shelved.map((p) => p.id), []);

      // Past the stream-out radius (exit - 200) the census withdraws the cohort whole: no body of
      // ours live, no shelved row, and no anonymous shell left carrying the owner stamp.
      player.pos.x = anchor.x + exit + 300;
      player.pos.z = anchor.z;
      run(3);
      assert.deepEqual(parts(state, c.owns), [], 'withdrawn whole past the stream-out radius');
      assert.deepEqual(state.entityList.filter((e) => e.alive && e.data?.persistenceOwner === c.owner), [], 'no shell left behind');
      assert.equal(farActorCensus(state).farActors, 0, 'nothing of it sits on the far shelf');
      system.destroy();
    });
  } else {
    test(`${c.name}: a pilot arriving from far away finds its bodies resident, never shelved or re-minted`, () => {
      const { state, bus, helpers, player } = boot(c.sectorId);
      const system = c.make();
      system.init({ state, bus, helpers });
      bus.emit('sector:enter', {});
      system.update(1 / 60, state);

      const born = parts(state, c.owns);
      assert.ok(born.length >= 3, `${c.name} minted its cohort (${born.length})`);
      const ids = born.map((e) => e.id).sort((a, b) => a - b);

      // The pilot arrives well past the exit radius of the character, like a gate arrival does.
      const exit = farActorTableRadius(state).exit;
      const anchor = born[0].pos;
      player.pos.x = anchor.x + exit + 3000;
      player.pos.z = anchor.z;

      const shelved = [];
      bus.on('world:farActorShelved', (p) => shelved.push(p));
      let spawned = 0;
      bus.on('entity:spawned', (p) => { if (p.entity && c.owns(p.entity)) spawned++; });

      for (let n = 0; n < 6 * 60; n++) {
        state.tick++;
        state.simTime += 1 / 60;
        system.update(1 / 60, state);
        tickFarActors(state, helpers, bus);
        bus.flush?.();
      }

      assert.deepEqual(shelved.map((p) => p.id), [], 'no body of the character was shelved by the far-actor table');
      assert.equal(farActorCensus(state).farActors, 0, 'nothing of it sits on the far shelf');
      assert.deepEqual(parts(state, c.owns).map((e) => e.id).sort((a, b) => a - b), ids, 'the same bodies, no twins and no re-minting');
      assert.equal(spawned, 0, 'nothing was spawned after the first census');
      system.destroy();
    });
  }

  test(`${c.name}: every body carries the authored-character stamp the far-actor table honours`, () => {
    const { state, bus, helpers } = boot(c.sectorId);
    const system = c.make();
    system.init({ state, bus, helpers });
    bus.emit('sector:enter', {});
    system.update(1 / 60, state);
    for (const e of parts(state, c.owns)) {
      assert.ok(e.data.authoredCharacter, `${c.name} body ${e.data.identityKey || e.name} is stamped`);
      e.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
      assert.equal(shouldVirtualizeFarActor(e, state), false);
    }
    system.destroy();
  });
}

test('the stamp is narrow: an ordinary far drone is still shelved', () => {
  const { state, helpers } = boot('sector_ceres_belt');
  const drone = helpers.spawnEntity({ type: 'drone', pos: { x: 9000, z: 0 }, radius: 6, mass: 5, hull: 10, hullMax: 10, data: { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' } });
  drone.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  assert.equal(shouldVirtualizeFarActor(drone, state), true);
});
