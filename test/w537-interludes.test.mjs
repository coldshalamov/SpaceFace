// W-CANON (build_map row 537): the six §34.7 interludes play as quiet vignette scenes on
// the live route between books — not as metadata, not as a new system. Each authored
// shape (src/data/encounters/926–931) is externalOnly and selfRegistered; missions'
// interlude stepper requests it through encounterDirector.requestAuthoredEncounter once
// the book cursor has passed the boundary, the player approaches the log object, the
// scene resolves, and story.flags + the campaign sidecar ledger keep the receipt.
//
// Run: node --test test/w537-interludes.test.mjs

import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { story as storyProto } from '../src/systems/story.js';
import { encounterDirector as encounterDirectorProto } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import {
  CAMPAIGN_INTERLUDES,
  CAMPAIGN_INTERLUDE_ENCOUNTER_PREFIX,
  interludeById,
  interludeEligible,
} from '../src/story/campaign47a/index.js';

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (err) {
    failures += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err && err.message ? err.message : err}`);
    if (err && err.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  }
}

function makeHarness(seed = 47) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.heat = 0;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200 };
  state.factions = state.factions || {};
  for (const id of ['faction_scn', 'faction_mts', 'faction_free', 'faction_dmc']) {
    state.factions[id] = state.factions[id] || { rep: 0 };
  }
  state.entities = state.entities || new Map();
  state.entities.set(1, { id: 1, team: 'player', pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 }, flags: {}, hull: 100 });
  state.entityList = [state.entities.get(1)];
  state.onboarding = { active: false, finished: true };
  if (state.settings && state.settings.gameplay) state.settings.gameplay.tutorialHints = false;
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_helios_prime';

  const bus = createBus();
  const popups = [];
  const resolved = [];
  bus.on('comms:popup', (p) => popups.push(p || {}));
  bus.on('encounter:resolved', (p) => resolved.push(p || {}));
  bus.on('economy:grantCredits', (p) => {
    if (p && p.amount) state.player.credits = (state.player.credits | 0) + (p.amount | 0);
  });

  const helpers = {
    voice: { say: () => true },
    spawnEntity: (spec) => {
      const id = state.entities.size ? Math.max(...state.entities.keys()) + 1 : 1;
      const entity = { id, alive: true, ...spec, data: structuredClone(spec.data || {}) };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity: (id) => {
      const e = state.entities.get(id);
      if (e) e.alive = false;
      state.entityList = (state.entityList || []).filter((row) => row !== e);
      state.entities.delete(id);
    },
  };
  const missions = Object.assign({}, missionsProto);
  const story = Object.assign({}, storyProto);
  const director = Object.assign({}, encounterDirectorProto);
  const registry = {
    get: (n) => (n === 'missions' ? missions
      : n === 'story' ? story
      : n === 'encounterDirector' ? director
      : null),
  };
  const ctx = { state, bus, helpers, registry };
  missions.init(ctx);
  story.init(ctx);
  director.init(ctx);
  missions.newGame();
  story._ensureState && story._ensureState(true);
  return { state, bus, missions, story, director, helpers, popups, resolved };
}

function playerEnt(state) { return state.entities.get(state.playerId); }

/** The scene's story prop — the log object the player has to reach. */
function sceneProp(state, live) {
  const propId = live.ids && live.ids.find((id) => live.roles && live.roles[id] === 'prop');
  return propId != null ? state.entities.get(propId) : null;
}

/** Advance sim time and drive the encounter director's 1 Hz tick until the live
 *  encounter closes (or `seconds` elapse). Returns the resolved payload or null. */
function runScene(h, encounterId, seconds = 60) {
  const { state, director, resolved } = h;
  const end = state.simTime + seconds;
  while (state.simTime < end) {
    state.simTime += 1.2;
    director.update(0.016, state);
    const row = resolved.find((r) => r.encounterId === encounterId);
    if (row) return row;
  }
  return null;
}

console.log('w537-interludes');

// ── Catalog presence: all six authored quiet scenes are registered and self-running. ──
check('catalog: all six interlude shapes are registered, external-only, self-registered', () => {
  assert.equal(CAMPAIGN_INTERLUDES.length, 6);
  for (const def of CAMPAIGN_INTERLUDES) {
    const shape = ENCOUNTERS[def.shapeId];
    assert.ok(shape, `ENCOUNTERS missing ${def.shapeId}`);
    assert.equal(shape.script, 'selfRegistered', `${def.shapeId} must be self-registered`);
    assert.equal(shape.gates && shape.gates.externalOnly, true, `${def.shapeId} must be externalOnly`);
    assert.equal(shape.livedVignette, true, `${def.shapeId} must be a lived vignette`);
    assert.notEqual(shape.livedRotation, true, `${def.shapeId} must never enter ambient rotation`);
  }
});

// ── Gate: no scene fires before its book boundary; authored sector only until stale. ──
check('gate: interludes are closed before their book boundary and outside their sector', () => {
  const h = makeHarness(47);
  const { state, missions, director } = h;
  const uv = interludeById('unknown_vessel'); // minBeat 1, sector_helios_prime
  assert.equal(interludeEligible(state, uv).ok, false, 'beatIndex 0 is before the boundary');
  state.story.beatIndex = 0;
  state.world.currentSectorId = uv.sectorId;
  missions.update(0.016, state);
  assert.equal(Object.keys(state.encounterDirector.live).length, 0, 'no scene before the boundary');

  // At the boundary but in the wrong sector — not yet stale, so the scene stays home.
  state.story.beatIndex = 1;
  state.world.currentSectorId = 'sector_tethys_junction';
  assert.equal(interludeEligible(state, uv).ok, false, 'wrong sector before staleness');
  missions.update(0.016, state);
  assert.equal(Object.keys(state.encounterDirector.live).length, 0, 'no scene in the wrong sector');
});

// ── Reachability: all six scenes request, stage, play, resolve, and record. ──────────
check('reachability: all six interludes request, play, resolve, and record', () => {
  const h = makeHarness(48);
  const { state, missions, director } = h;
  const player = playerEnt(state);

  for (const def of CAMPAIGN_INTERLUDES) {
    // Land the book boundary and stand in the authored sector.
    state.story.beatIndex = def.minBeat;
    state.world.currentSectorId = def.sectorId;
    state.simTime += 20;
    player.pos.x = 0; player.pos.z = 0;

    missions.update(0.016, state);
    const encounterId = `${CAMPAIGN_INTERLUDE_ENCOUNTER_PREFIX}${def.id}`;
    const live = state.encounterDirector.live[encounterId];
    assert.ok(live, `${def.id} did not request its scene at beatIndex ${def.minBeat} in ${def.sectorId}`);
    assert.equal(live.shapeId, def.shapeId);

    // The log object exists on the plane — find it and fly to it.
    const prop = sceneProp(state, live);
    assert.ok(prop && prop.pos, `${def.id} staged no prop`);
    assert.equal(prop.data && prop.data.storyPropKind, def.shapeId);
    player.pos.x = prop.pos.x - 30;
    player.pos.z = prop.pos.z;

    const row = runScene(h, encounterId, 40);
    assert.ok(row, `${def.id} scene did not resolve`);
    assert.equal(row.outcome, 'seen', `${def.id} resolved ${row.outcome}, expected 'seen'`);
    assert.equal(state.story.flags[def.flag], true, `${def.flag} flag not recorded`);
  }

  // The sidecar ledger kept all six in order.
  const log = (state.story.campaign47a && state.story.campaign47a.choiceLog) || [];
  const seen = log.filter((row) => row.kind === 'campaign_interlude').map((row) => row.id);
  assert.deepEqual(seen, CAMPAIGN_INTERLUDES.map((d) => d.id), 'choiceLog kept all six interludes in order');
  const openInterludes = Object.keys(state.encounterDirector.live)
    .filter((id) => id.startsWith(CAMPAIGN_INTERLUDE_ENCOUNTER_PREFIX));
  assert.deepEqual(openInterludes, [], 'no interlude stays live after the sextet');
});

// ── Staleness: a scene the player flew past still finds them on the route. ───────────
check('staleness: two books past the boundary, the owed scene follows into any sector', () => {
  const h = makeHarness(49);
  const { state, missions } = h;
  const uv = interludeById('unknown_vessel');
  state.story.beatIndex = uv.minBeat + uv.staleBeats; // two books late
  state.world.currentSectorId = 'sector_charon_expanse'; // never the authored sector
  missions.update(0.016, state);
  const encounterId = `${CAMPAIGN_INTERLUDE_ENCOUNTER_PREFIX}unknown_vessel`;
  const live = state.encounterDirector.live[encounterId];
  assert.ok(live, 'roaming scene did not request in a foreign sector');
  // Roaming anchors off the player, not the home station.
  const player = playerEnt(state);
  const prop = sceneProp(state, live);
  const dx = prop.pos.x - (player.pos.x + uv.anchorOffset.x);
  const dz = prop.pos.z - (player.pos.z + uv.anchorOffset.z);
  assert.ok(Math.hypot(dx, dz) < 120, 'roaming anchor did not ride the player-side lane offset');
});

// ── Abort: an unseen scene marks nothing and re-requests on a later pass. ────────────
check('abort: leaving the scene marks nothing and the stepper re-requests it', () => {
  const h = makeHarness(50);
  const { state, missions, director } = h;
  const uv = interludeById('unknown_vessel');
  state.story.beatIndex = 1;
  state.world.currentSectorId = uv.sectorId;
  missions.update(0.016, state);
  const encounterId = `${CAMPAIGN_INTERLUDE_ENCOUNTER_PREFIX}unknown_vessel`;
  assert.ok(state.encounterDirector.live[encounterId]);
  director.abort(state.encounterDirector.live[encounterId], 'physical_timeout');
  assert.equal(state.story.flags[uv.flag], undefined, 'aborted scene must not mark the flag');
  assert.equal(state.encounterDirector.live[encounterId], undefined, 'live record cleared');
  // Next quiet pass: the owed scene requests again.
  state.simTime += 8;
  missions.update(0.016, state);
  assert.ok(state.encounterDirector.live[encounterId], 'owed scene re-requested after abort');
});

// ── Idempotence: a seen scene never requests again. ──────────────────────────────────
check('idempotence: a seen interlude never requests again', () => {
  const h = makeHarness(51);
  const { state, missions } = h;
  state.story.beatIndex = 8; // everything eligible
  state.world.currentSectorId = 'sector_helios_prime';
  for (const def of CAMPAIGN_INTERLUDES) state.story.flags[def.flag] = true;
  missions.update(0.016, state);
  assert.equal(Object.keys(state.encounterDirector.live).length, 0, 'no scene re-requests once seen');
});

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nw537: all checks passed');
