/**
 * inf-adrift-confession — a failing hull confesses before it is a distress mission.
 *
 * When an NPC hull's main drive dies (combat:subsystemDisabled, subsystemId 'subsystem_drive' —
 * the same seam the yard dispatch and surrender recovery read), the hull itself tells the band
 * once per drive-down episode, inside combat-radio reach, in its own faction register: what
 * failed and where it is adrift. Until now the hull was silent between the hit and the
 * posthumous distress — the tender came, or the scavvies came, and nobody spoke.
 *
 * Owner = src/systems/barkDirector.js + src/data/barks.js. Seed 4242.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { ADRIFT_CONFESSION_BARKS, adriftConfessionBarkFor } from '../src/data/barks.js';

function boot(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.tick = 600;
  state.simTime = 10;
  const bus = createBus();
  const said = [];
  const helpers = { voice: { say(p) { said.push(p); return true; } } };
  core.init({ state, bus, helpers, registry: null });
  state.world.currentSectorId = 'sector_helios_prime';

  const spawn = (spec) => helpers.spawnEntity({
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 12, hull: 100, hullMax: 100,
    collides: true, ...spec, data: { ...(spec.data || {}) },
  });
  const player = spawn({ type: 'ship', team: 0 });
  state.playerId = player.id;

  const barkSys = Object.assign({}, barkDirector);
  barkSys.init({ state, bus, helpers, registry: null });
  const voices = [];
  bus.on('barkDirector:voice', (p) => voices.push(p));
  return { state, bus, helpers, spawn, player, barkSys, said, voices };
}

const confessions = (h) => h.said.filter((s) => s.kind === 'adriftConfession');

function driveDown(h, hull, over = {}) {
  h.bus.emit('combat:subsystemDisabled', {
    attackerId: h.player.id,
    targetId: hull.id,
    subsystemId: 'subsystem_drive',
    dependencyDisabled: false,
    cueId: null,
    ...over,
  });
}

test('a hull whose drive dies confesses once, naming what failed and where', () => {
  const h = boot();
  h.player.pos = { x: 0, z: 0 };
  const hauler = h.spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 300, z: 0 },
    data: { trafficRole: 'hauler' },
  });

  driveDown(h, hauler);
  const lines = confessions(h);
  assert.equal(lines.length, 1, 'one confession on the drive-down flip');
  const line = lines[0];
  assert.equal(line.channel, 'bark');
  assert.equal(line.id, `barkDirector:${hauler.id}:adrift-confession`);
  assert.equal(line.factionId, 'faction_free', 'the hull speaks in its own register');
  assert.match(line.text, /[Dd]rive/);
  assert.match(line.text, /Helios Prime/, 'the confession names where to look');
  assert.ok(ADRIFT_CONFESSION_BARKS.some((bark) => bark.replace('{place}', 'Helios Prime') === line.text),
    'the spoken line is the authored family');

  // The audio receipt carries the same voiceId, distress register treatment, and the cause.
  const receipts = h.voices.filter((v) => v.situation === 'adrift-confession');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].voiceId, line.id);
  assert.equal(receipts[0].text, line.text);
  assert.equal(receipts[0].factionId, 'faction_free');
  assert.equal(receipts[0].attackerId, h.player.id, 'the receipt names who broke it when known');
  assert.equal(receipts[0].entityId, hauler.id);

  // One per episode: a repeated emission for the same flip never machine-guns the band.
  driveDown(h, hauler);
  driveDown(h, hauler);
  assert.equal(confessions(h).length, 1);
});

test('the gap buckets repair churn: a re-broken drive confesses again, not immediately', () => {
  const h = boot();
  h.player.pos = { x: 0, z: 0 };
  const hauler = h.spawn({
    type: 'ship', team: 2, factionId: 'faction_dmc', pos: { x: 120, z: -40 },
    data: { trafficRole: 'hauler' },
  });
  driveDown(h, hauler);
  assert.equal(confessions(h).length, 1);

  // Repaired, then broken again 10 s later: a new episode, but inside the gap.
  h.state.simTime += 10;
  driveDown(h, hauler, { dependencyDisabled: true });
  assert.equal(confessions(h).length, 1, 'churn inside the gap stays one voice');

  // Past the gap the hull honestly confesses again.
  h.state.simTime += 40;
  driveDown(h, hauler);
  assert.equal(confessions(h).length, 2, 'a genuinely new drive-down speaks again');
});

test('a hull outside combat-radio reach stays quiet; the moment is not the band\'s', () => {
  const h = boot();
  h.player.pos = { x: 0, z: 0 };
  const far = h.spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 2600, z: 0 },
    data: { trafficRole: 'hauler' },
  });
  driveDown(h, far);
  assert.equal(confessions(h).length, 0, 'far drive-downs do not spend the band');
});

test('patrols, authored combatants, fleeing crews, and player-side hulls keep their own voice', () => {
  const h = boot();
  h.player.pos = { x: 0, z: 0 };

  const patrol = h.spawn({
    type: 'ship', team: 1, factionId: 'faction_scn', pos: { x: 100, z: 0 },
    data: { trafficRole: 'patrol' },
  });
  driveDown(h, patrol);
  assert.equal(confessions(h).length, 0, 'law owns the patrol voice');

  const ace = h.spawn({
    type: 'ship', team: 2, factionId: 'faction_reach', pos: { x: 100, z: 20 },
    data: { missionTag: 'story_hull' },
  });
  driveDown(h, ace);
  assert.equal(confessions(h).length, 0, 'authored hulls keep their authored contract');

  const fleeing = h.spawn({
    type: 'ship', team: 2, factionId: 'faction_reach', pos: { x: 120, z: -20 },
    data: { ai: { pirateDisengaged: true } },
  });
  driveDown(h, fleeing);
  assert.equal(confessions(h).length, 0, 'morale owns a crew already breaking off');

  driveDown(h, h.player);
  assert.equal(confessions(h).length, 0, 'the player hull never confesses to itself');

  // A crewed civilian just beside them still speaks — the exclusions are per-hull, not a zone mute.
  const hauler = h.spawn({
    type: 'ship', team: 2, factionId: 'faction_mts', pos: { x: 140, z: 0 },
    data: { trafficRole: 'hauler' },
  });
  driveDown(h, hauler);
  assert.equal(confessions(h).length, 1);
});

test('the floor-validity gate drops the line when the hull dies or the drive is re-welded', () => {
  const h = boot();
  h.player.pos = { x: 0, z: 0 };
  const hauler = h.spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 200, z: 0 },
    data: { trafficRole: 'hauler' },
  });
  driveDown(h, hauler);
  const line = confessions(h)[0];
  assert.equal(typeof line.valid, 'function', 'the say carries a validity gate');

  // Drive still down, hull alive: the line is owed.
  h.state.combat = { entities: { [String(hauler.id)]: { subsystems: { subsystem_drive: { destroyed: true } } } } };
  assert.equal(line.valid(), true, 'a live adrift hull still owes the line');

  // Hull dies before the floor frees: the confession drops unspoken.
  hauler.alive = false;
  assert.equal(line.valid(), false, 'a dead hull confesses nothing');

  // A re-welded drive: the line must not describe a state that no longer holds.
  const h2 = boot();
  h2.player.pos = { x: 0, z: 0 };
  const hauler2 = h2.spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 200, z: 0 },
    data: { trafficRole: 'hauler' },
  });
  driveDown(h2, hauler2);
  const line2 = confessions(h2)[0];
  h2.state.combat = { entities: { [String(hauler2.id)]: { subsystems: { subsystem_drive: { destroyed: false, effectiveDisabled: false } } } } };
  assert.equal(line2.valid(), false, 'a re-welded drive makes the adrift line a lie');
});

test('non-drive subsystem losses are not confessions; the selector interpolates the place', () => {
  const h = boot();
  h.player.pos = { x: 0, z: 0 };
  const hauler = h.spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 100, z: 0 },
    data: { trafficRole: 'hauler' },
  });
  driveDown(h, hauler, { subsystemId: 'subsystem_weapon' });
  assert.equal(confessions(h).length, 0, 'losing a gun is not losing the road');

  assert.match(adriftConfessionBarkFor(0, 'Helios Prime'), /Helios Prime/);
  assert.ok(adriftConfessionBarkFor(3, '').includes('the drift'), 'unknown place falls back honestly');
  assert.equal(adriftConfessionBarkFor(0, null).includes('{place}'), false, 'the placeholder never leaks');
});
