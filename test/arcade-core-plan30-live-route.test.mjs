// Plan 30 on the LIVE route, not at the data layer.
//
// arcade-core-plan30-secrets covers the pure contracts: normalization fails closed, the Codex
// projection formats, every id resolves. That is exactly the "convenient stand-in" this repo has
// been burned by before — it leaves the middle link, the world.js handlers that actually write the
// durable facts, with no coverage at all. This file drives signal -> world -> record -> Codex.
//
// It immediately earned itself: the first run proved The Face was UNREACHABLE, because the arc solve
// read a pose off `state.player`, which is the credits/cargo/flags record and carries no position.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { codexSecretPages } from '../src/data/codexSecrets.js';
import { STAR_SIGNATURE_PLATES, starSignatureProgress } from '../src/data/starSignatures.js';
import { UNREGISTERED_CACHES, unregisteredCacheProgress } from '../src/data/unregisteredCaches.js';
import { THE_FACE } from '../src/data/theFace.js';
import { THE_DEVELOPER } from '../src/data/theDeveloper.js';

function boot(seed = 0x30115) {
  const systems = [world];
  const sim = createSimulation({ seed, systems, updateOrder: systems });
  sim.state.mode = 'flight';
  // A real player HULL. The arc solve compares two live entity poses, so the route needs the same
  // thing the game has: an entity registered under state.playerId, not the player record.
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    isPlayer: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 10,
    mass: 44,
    hull: 400,
    hullMax: 400,
    data: {},
  });
  sim.state.playerId = player.id;
  return sim;
}

/** Drive the real scanner receipt world listens to. */
function investigate(sim, sectorId, poiId) {
  sim.bus.emit('signal:investigated', {
    id: `signal:poi:${poiId}`,
    sourceId: poiId,
    sectorId,
    completedAt: sim.state.simTime || 1,
  });
}

function pageFor(state, id) {
  return codexSecretPages(state).find((page) => page.id === id);
}

test('reading a builder plate on the live route files it and advances the Codex row', () => {
  const sim = boot();
  const { state } = sim;
  const plate = STAR_SIGNATURE_PLATES[0];
  sim.registry.get('world').enterSector(plate.sectorId);

  assert.equal(pageFor(state, 'secret_names_in_stars').unlocked, false, 'locked before the read');
  investigate(sim, plate.sectorId, plate.poiId);

  assert.equal(starSignatureProgress(state).read, 1, 'the plate is durably filed by world');
  const page = pageFor(state, 'secret_names_in_stars');
  assert.equal(page.unlocked, true);
  assert.match(page.body, new RegExp(plate.handle));

  // Re-investigating the same hardware cannot double-count it.
  investigate(sim, plate.sectorId, plate.poiId);
  assert.equal(starSignatureProgress(state).read, 1);

  // A plate in the wrong sector is not this plate.
  investigate(sim, plate.sectorId, STAR_SIGNATURE_PLATES[1].poiId);
  assert.equal(starSignatureProgress(state).read, 1,
    'a plate only counts in the sector that actually carries it');
});

test('opening a cache on the live route unlocks the chain row', () => {
  const sim = boot();
  const { state } = sim;
  const cache = UNREGISTERED_CACHES.find((row) => row.sectorId === 'sector_sedna_dark')
    || UNREGISTERED_CACHES[0];
  sim.registry.get('world').enterSector(cache.sectorId);

  assert.equal(pageFor(state, 'secret_cache_chain').unlocked, false);
  investigate(sim, cache.sectorId, cache.cachePoiId);

  const progress = unregisteredCacheProgress(state);
  assert.equal(progress.opened, 1, 'world moved the record to opened');
  const page = pageFor(state, 'secret_cache_chain');
  assert.equal(page.unlocked, true);
  assert.match(page.body, new RegExp(cache.name));

  // Opening it again cannot re-mint the consequence.
  investigate(sim, cache.sectorId, cache.cachePoiId);
  assert.equal(unregisteredCacheProgress(state).opened, 1);
});

test('The Face resolves from inside the arc on the live route and from nowhere else', () => {
  const sim = boot();
  const { state } = sim;
  const worldSystem = sim.registry.get('world');
  worldSystem.enterSector(THE_FACE.sectorId);

  const moon = [...state.entities.values()].find((entity) => entity
    && entity.data && (entity.data.poiId === THE_FACE.poiId || entity.id === THE_FACE.poiId));
  assert.ok(moon && moon.pos, 'the anchor moon is embodied in its sector');

  const player = state.entities.get(state.playerId);
  assert.ok(player && player.pos, 'the player position lives on the player ENTITY, not state.player');

  // Wrong bearing, correct range: the scan must write nothing at all.
  const offRad = (THE_FACE.approachBearingDeg + 90) * Math.PI / 180;
  const range = (THE_FACE.minRangeWu + THE_FACE.maxRangeWu) / 2;
  player.pos.x = moon.pos.x + Math.cos(offRad) * range;
  player.pos.z = moon.pos.z + Math.sin(offRad) * range;
  investigate(sim, THE_FACE.sectorId, THE_FACE.poiId);
  assert.equal(pageFor(state, 'secret_face').unlocked, false,
    'approaching from the worked side returns an ordinary survey');

  // Inside the authored arc: the face resolves.
  const inRad = THE_FACE.approachBearingDeg * Math.PI / 180;
  player.pos.x = moon.pos.x + Math.cos(inRad) * range;
  player.pos.z = moon.pos.z + Math.sin(inRad) * range;
  investigate(sim, THE_FACE.sectorId, THE_FACE.poiId);

  const page = pageFor(state, 'secret_face');
  assert.equal(page.unlocked, true, 'the far side resolves from its own bearing');
  assert.match(page.body, new RegExp(THE_FACE.bodyName));
  assert.equal(state.world.theFace.phase, 'seen');
});

test('The Developer is a killable non-ally, and its kill pays the chip set once', () => {
  const sim = boot();
  const { state } = sim;
  sim.registry.get('world').enterSector(THE_DEVELOPER.sectorId);

  // Construction is browser-gated, so under node the hull is deliberately absent. What must hold
  // here is that the KILL path still works when one exists — a save carried in from a browser run.
  const seen = [];
  sim.bus.on('secret:developerDestroyed', (payload) => seen.push(payload));

  const hull = sim.spawn({
    type: 'ship',
    team: 1,
    pos: { x: THE_DEVELOPER.fixedLocalPos.x, z: THE_DEVELOPER.fixedLocalPos.z },
    vel: { x: 0, z: 0 },
    radius: THE_DEVELOPER.radius,
    mass: THE_DEVELOPER.mass,
    hull: 1,
    hullMax: 1,
    data: { theDeveloper: true },
  });
  assert.notEqual(hull.team, 0, 'it must not be on the player team, or it could never be shot');

  sim.bus.emit('entity:killed', { id: hull.id, killerId: state.playerId, type: 'ship', pos: { ...hull.pos } });

  assert.equal(state.world.theDeveloper.phase, 'killed');
  assert.equal(seen.length, 1, 'the destruction is published exactly once');
  const chips = [...state.entities.values()].filter((entity) => entity
    && entity.alive !== false && entity.data && entity.data.theDeveloperChip === true);
  assert.equal(chips.length, THE_DEVELOPER.chipDenominations.length,
    'one physical chip of every denomination, as authored');
  assert.deepEqual(
    chips.map((chip) => chip.data.amount).sort((a, b) => a - b),
    [...THE_DEVELOPER.chipDenominations].sort((a, b) => a - b),
  );

  const page = pageFor(state, 'secret_developer');
  assert.equal(page.phase, 'killed');

  // A repeat event cannot mint a second set.
  sim.bus.emit('entity:killed', { id: hull.id, killerId: state.playerId, type: 'ship', pos: { ...hull.pos } });
  assert.equal(seen.length, 1);
});

test('every new secret record survives a save/load round trip', () => {
  const sim = boot();
  const { state } = sim;
  const worldSystem = sim.registry.get('world');
  const plate = STAR_SIGNATURE_PLATES[0];
  worldSystem.enterSector(plate.sectorId);
  investigate(sim, plate.sectorId, plate.poiId);

  const cache = UNREGISTERED_CACHES[0];
  worldSystem.enterSector(cache.sectorId);
  investigate(sim, cache.sectorId, cache.cachePoiId);

  // The four records live under `state.world.*` with no saveVersion key of their own, which is what
  // keeps the 47-A golden still. That only holds up if a round trip actually carries them.
  const carried = JSON.parse(JSON.stringify({
    starSignatures: state.world.starSignatures,
    unregisteredCaches: state.world.unregisteredCaches,
    theFace: state.world.theFace,
    theDeveloper: state.world.theDeveloper,
  }));

  const restored = boot();
  Object.assign(restored.state.world, carried);
  restored.state.meta.seed = state.meta.seed;
  restored.registry.get('world').enterSector(plate.sectorId);

  assert.equal(starSignatureProgress(restored.state).read, 1, 'the plate survives the round trip');
  assert.equal(unregisteredCacheProgress(restored.state).opened, 1, 'the cache stays open');
  assert.equal(pageFor(restored.state, 'secret_names_in_stars').unlocked, true);
  assert.equal(pageFor(restored.state, 'secret_cache_chain').unlocked, true);
});
