import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import {
  MARKER_MIN_LEGIBLE_RADIUS,
  REACTIVE_BUDGETS,
  REACTIVE_CONFIGURATION_IDS,
  REACTIVE_CONFIGURATIONS,
  REACTIVE_MARKERS,
} from '../src/data/reactiveMatter/index.js';
import { probeSolid, runConfiguration } from '../src/matter/reactive/liveSession.js';
import { createReactiveMarkerPass, markerPixels } from '../src/render/reactiveMatter/pass.js';
import { installReactiveEntity } from '../src/systems/reactiveMatter.js';

function body(run, id) {
  const row = run.snapshot.bodies.find((entry) => entry.id === id);
  assert.ok(row, `${run.id} missing ${id}; have ${run.snapshot.bodies.map((entry) => entry.id).join(',')}`);
  return row;
}

function early(run, id, tick) {
  const sample = run.samples.find((row) => row.tick === tick);
  assert.ok(sample, `${run.id} missing tick ${tick}`);
  const row = sample.bodies.find((entry) => entry.id === id);
  assert.ok(row, `${run.id} tick ${tick} missing ${id}`);
  return row;
}

test('sixteen configurations cover playable problems, hazards, and every crossing', async () => {
  assert.equal(REACTIVE_CONFIGURATIONS.length, 16);
  assert.equal(new Set(REACTIVE_CONFIGURATION_IDS).size, 16);
  const playable = REACTIVE_CONFIGURATIONS.filter((row) => row.kind === 'playable');
  const hazard = REACTIVE_CONFIGURATIONS.filter((row) => row.kind === 'hazard');
  assert.ok(playable.length >= 8, playable.length);
  assert.ok(hazard.length >= 4, hazard.length);
  const crosses = new Set(REACTIVE_CONFIGURATIONS.flatMap((row) => row.crosses));
  for (const name of ['massline', 'fields', 'traffic', 'machinery']) assert.ok(crosses.has(name), name);
  const families = new Set(REACTIVE_CONFIGURATIONS.flatMap((row) => row.families));
  for (const name of ['ferromagnetic', 'volatile', 'brittle', 'elastic']) assert.ok(families.has(name), name);
});

test('ferro-haul: reeling away leaves the crate farther from the crane than drifting', async () => {
  const authored = await runConfiguration('ferro-haul');
  const idle = await runConfiguration('ferro-haul', { tape: 'idle' });
  const crane = { x: 36, z: 28 };
  const dist = (run) => {
    const crate = body(run, 'crate');
    return Math.hypot(crate.x - crane.x, crate.z - crane.z);
  };
  assert.ok(dist(authored) > dist(idle) + 3, `authored ${dist(authored)} idle ${dist(idle)} crate ${JSON.stringify(body(authored, 'crate'))}`);
  assert.equal(body(authored, 'crate').phase, 'intact');
  assert.ok(authored.cues.some((cue) => cue.kind === 'ferro-couple'));
});

test('ferro-sort: flying away keeps the latched crate; the free crate rides its crane', async () => {
  const authored = await runConfiguration('ferro-sort');
  const idle = await runConfiguration('ferro-sort', { tape: 'idle' });
  assert.ok(body(authored, 'left').z < body(idle, 'left').z - 4, JSON.stringify({
    authored: body(authored, 'left'),
    idle: body(idle, 'left'),
  }));
  assert.ok(body(authored, 'right').z > 8, body(authored, 'right').z);
  assert.ok(body(idle, 'left').z > 8, body(idle, 'left').z);
});

test('ferro-anchor-cut: cutting leaves the ship and gives the crate to the crane', async () => {
  const cut = await runConfiguration('ferro-anchor-cut');
  const held = await runConfiguration('ferro-anchor-cut', { tape: 'idle' });
  assert.equal(cut.world.hitches.get('line').alive, false);
  assert.equal(cut.world.hitches.get('line').broken, 'cut');
  assert.equal(held.world.hitches.get('line').alive, true);
  assert.ok(body(cut, 'player').z < 0, JSON.stringify(body(cut, 'player')));
  assert.ok(body(held, 'player').z > body(cut, 'player').z + 5, JSON.stringify({
    held: body(held, 'player'),
    cut: body(cut, 'player'),
    crate: body(cut, 'crate'),
  }));
  assert.ok(body(cut, 'crate').z > body(cut, 'player').z + 8, JSON.stringify(body(cut, 'crate')));
});

test('volatile-cook: reeling out of the kiln saves the canister', async () => {
  const saved = await runConfiguration('volatile-cook');
  const cooked = await runConfiguration('volatile-cook', { tape: 'idle' });
  assert.equal(body(saved, 'can').phase, 'intact', JSON.stringify(body(saved, 'can')));
  assert.ok(body(saved, 'can').heat < 36, body(saved, 'can').heat);
  assert.equal(body(cooked, 'can').phase, 'spent', JSON.stringify(body(cooked, 'can')));
  assert.equal(cooked.creditsGranted, 0);
});

test('volatile-impact: towing off the lane avoids the hauler', async () => {
  const clear = await runConfiguration('volatile-impact');
  const hit = await runConfiguration('volatile-impact', { tape: 'idle' });
  assert.equal(body(clear, 'can').phase, 'intact', JSON.stringify(body(clear, 'can')));
  assert.equal(body(hit, 'can').phase, 'spent', JSON.stringify(body(hit, 'can')));
  assert.ok(hit.chemicalInjected > 0 && hit.chemicalInjected <= REACTIVE_BUDGETS.volatileImpulseCap);
  const debris = hit.snapshot.bodies.filter((row) => row.parentId === 'can' || String(row.id).startsWith('can:debris'));
  assert.equal(debris.length, 3);
});

test('brittle-tow retargets onto the lug shard', async () => {
  const run = await runConfiguration('brittle-tow');
  assert.equal(body(run, 'spar').phase, 'fractured');
  assert.equal(body(run, 'spar').radius, 0);
  const hitch = run.snapshot.hitches.find((row) => row.id === 'line');
  assert.equal(hitch.alive, true, JSON.stringify(hitch));
  assert.ok(hitch.targetId.startsWith('spar:shard'), hitch.targetId);
  assert.equal(run.snapshot.bodies.filter((row) => row.id.startsWith('spar:shard')).length, 2);
});

test('brittle-gate opens a gap the thrusting player can cross', async () => {
  const run = await runConfiguration('brittle-gate');
  assert.ok(early(run, 'player', 8).x < -30, early(run, 'player', 8).x);
  assert.ok(body(run, 'player').x > 8, body(run, 'player').x);
  assert.equal(body(run, 'slab').phase, 'fractured');
  assert.equal(probeSolid(run, 0, 0), null);
});

test('elastic-sling stores against the bumper and the cut throws the puck', async () => {
  const fired = await runConfiguration('elastic-sling');
  const held = await runConfiguration('elastic-sling', { segments: [{ from: 0, to: 160, reel: 1 }] });
  assert.ok(fired.peakStored.pod > 1, fired.peakStored.pod);
  assert.ok(fired.peakStored.pod <= REACTIVE_BUDGETS.elasticMaxStored + 1e-6);
  assert.equal(body(fired, 'pod').stored, 0);
  assert.ok(fired.cues.some((cue) => cue.kind === 'elastic-release'));
  assert.ok(body(held, 'pod').stored > 0 || held.peakStored.pod > fired.peakStored.pod * 0.5);
});

test('elastic-buffer stops the hauler and only nudges the player', async () => {
  const run = await runConfiguration('elastic-buffer');
  const player = body(run, 'player');
  const hauler = body(run, 'hauler');
  const playerSpeed = Math.hypot(player.vx, player.vz);
  const haulerSpeed = Math.hypot(hauler.vx, hauler.vz);
  assert.ok(playerSpeed > haulerSpeed + 5, `player ${playerSpeed} hauler ${haulerSpeed}`);
  assert.ok(haulerSpeed < 55, haulerSpeed);
  assert.ok(run.peakStored['pad-hauler'] > run.peakStored['pad-player'] + 20, JSON.stringify(run.peakStored));
  assert.ok(run.peakStored['pad-hauler'] <= REACTIVE_BUDGETS.elasticMaxStored + 1e-6);
});

test('ferro-volatile housing cooks an idle can and spares a reeled one', async () => {
  const saved = await runConfiguration('ferro-volatile-housing');
  const cooked = await runConfiguration('ferro-volatile-housing', { tape: 'idle' });
  assert.equal(body(saved, 'can').phase, 'intact', JSON.stringify(body(saved, 'can')));
  assert.equal(body(cooked, 'can').phase, 'spent', JSON.stringify(body(cooked, 'can')));
  assert.ok(cooked.maxReactions <= REACTIVE_BUDGETS.maxReactionsPerTick);
});

test('hazard convoy cooks each canister once inside the per-tick budget', async () => {
  const run = await runConfiguration('hazard-convoy-cook');
  for (const id of ['can-a', 'can-b', 'can-c', 'can-d']) assert.equal(body(run, id).phase, 'spent', id);
  assert.equal(run.reactionCount, 4);
  assert.ok(run.maxReactions <= REACTIVE_BUDGETS.maxReactionsPerTick);
  assert.equal(run.creditsGranted, 0);
  assert.ok(run.chemicalInjected <= 4 * REACTIVE_BUDGETS.volatileImpulseCap);
});

test('hazard cryo breakup fractures once and does not duplicate shards', async () => {
  const run = await runConfiguration('hazard-cryo-breakup');
  assert.equal(body(run, 'spar').phase, 'fractured');
  assert.equal(run.snapshot.bodies.filter((row) => row.id.startsWith('spar:shard')).length, 2);
  assert.equal(run.reactionCount, 1);
  const hitch = run.snapshot.hitches[0];
  assert.ok(hitch.targetId !== 'spar' || hitch.alive === false, JSON.stringify(hitch));
});

test('hazard magnet storm flips polarity and moves debris without going non-finite', async () => {
  const run = await runConfiguration('hazard-magnet-storm');
  assert.equal(run.world.machines.get('storm').polarity, -1);
  const moved = run.snapshot.bodies.some((row) => Math.hypot(row.x, row.z) > 2 && row.id.startsWith('d'));
  assert.equal(moved, true);
  for (const row of run.snapshot.bodies) {
    assert.ok(Number.isFinite(row.x) && Number.isFinite(row.z) && Number.isFinite(row.vx));
    assert.equal(row.y, 0);
  }
  assert.ok(run.cues.some((cue) => cue.kind === 'ferro-couple' && cue.worldRadius >= MARKER_MIN_LEGIBLE_RADIUS));
});

test('hazard elastic pileup never stores past the cap and does not cascade forever', async () => {
  const run = await runConfiguration('hazard-elastic-pileup');
  for (const sample of run.samples) {
    for (const row of sample.bodies) {
      assert.ok(row.stored <= REACTIVE_BUDGETS.elasticMaxStored + 1e-6, `${row.id} ${row.stored}`);
      assert.ok(Number.isFinite(row.vx) && Number.isFinite(row.vz));
    }
  }
  assert.ok(run.reactionCount <= 1, run.reactionCount);
  assert.equal(run.creditsGranted, 0);
  const tail = run.samples.slice(-30);
  const tailReactions = tail.reduce((sum, sample) => sum + sample.reactions, 0);
  assert.equal(tailReactions, 0);
});

test('massline elastic snap returns stored impulse when the line is cut', async () => {
  const cut = await runConfiguration('massline-elastic-snap');
  const held = await runConfiguration('massline-elastic-snap', { segments: [{ from: 0, to: 140, reel: 1 }] });
  assert.ok(cut.peakStored.pod > 1, cut.peakStored.pod);
  assert.ok(body(cut, 'pod').stored < cut.peakStored.pod);
  assert.ok(Math.hypot(body(cut, 'pod').vx, body(cut, 'pod').vz) > Math.hypot(body(held, 'pod').vx, body(held, 'pod').vz));
  assert.ok(cut.cues.some((cue) => cue.kind === 'elastic-release'));
});

test('field heat fractures a towed spar and the hitch follows a shard', async () => {
  const run = await runConfiguration('field-brittle-retarget');
  assert.equal(body(run, 'spar').phase, 'fractured');
  const hitch = run.snapshot.hitches.find((row) => row.id === 'line');
  assert.equal(hitch.alive, true, JSON.stringify(hitch));
  assert.ok(hitch.targetId.startsWith('spar:shard'));
  assert.ok(run.cues.some((cue) => cue.kind === 'brittle-fracture'));
  assert.ok(run.cues.some((cue) => cue.kind === 'tow-retarget'));
});

test('every configuration replays to the same snapshot', async () => {
  for (const id of REACTIVE_CONFIGURATION_IDS) {
    const a = (await runConfiguration(id)).snapshot;
    const b = (await runConfiguration(id)).snapshot;
    assert.deepEqual(a, b, id);
  }
});

test('marker manifest matches the sim markers', async () => {
  const manifest = JSON.parse(readFileSync('assets/reactive-matter/marker-manifest.json', 'utf8'));
  const silhouettes = JSON.parse(readFileSync('assets/reactive-matter/silhouettes.json', 'utf8'));
  assert.equal(manifest.camera, 'top-down-xz');
  assert.equal(manifest.minLegibleRadiusWu, MARKER_MIN_LEGIBLE_RADIUS);
  assert.equal(silhouettes.plane, 'xz');
  assert.equal(silhouettes.y, 0);
  const byId = {
    ferro: REACTIVE_MARKERS.ferro,
    volatile: REACTIVE_MARKERS.volatile,
    'volatile-ferro': REACTIVE_MARKERS.volatileFerro,
    brittle: REACTIVE_MARKERS.brittle,
    elastic: REACTIVE_MARKERS.elastic,
    debris: REACTIVE_MARKERS.debris,
    machine: REACTIVE_MARKERS.machine,
  };
  for (const row of manifest.markers) {
    const marker = byId[row.id];
    assert.equal(row.tint, marker.tint, row.id);
    assert.equal(row.signature, marker.signature, row.id);
    assert.equal(row.minWorldRadius, marker.minWorldRadius, row.id);
  }
  for (const family of ['ferro', 'volatile', 'brittle', 'elastic', 'debris']) {
    assert.ok(silhouettes.silhouettes[family].length >= 3, family);
  }
  assert.ok(REACTIVE_MARKERS.debris.minWorldRadius >= MARKER_MIN_LEGIBLE_RADIUS);
});

test('markers instance on the chase camera and debris meets the legibility floor', () => {
  const state = createGameState(1);
  installReactiveEntity(state, { id: 'bit', modelId: 'reactive_debris', x: 0, z: 0, radius: 1.05, mass: 1.3, runtime: true });
  installReactiveEntity(state, { id: 'crate', modelId: 'ferro_crate', x: 6, z: 0 });
  const pass = createReactiveMarkerPass();
  pass.update(state);
  assert.equal(pass.group.children.length, 2);
  const debris = pass.group.children.find((mesh) => mesh.userData.signature === 'wedge');
  const ferro = pass.group.children.find((mesh) => mesh.userData.signature === 'ring+bar');
  assert.ok(debris && ferro);
  assert.ok(debris.userData.worldRadius >= MARKER_MIN_LEGIBLE_RADIUS);
  assert.equal(debris.position.y, 0);
  const radiusPx = markerPixels(debris.userData.worldRadius, { width: 1600, height: 900, zoom: 144 });
  const familyPx = markerPixels(2.6, { width: 1600, height: 900, zoom: 144 });
  assert.ok(radiusPx * 2 >= 30, radiusPx);
  assert.ok(familyPx * 2 >= 30, familyPx);
  pass.dispose();
});
