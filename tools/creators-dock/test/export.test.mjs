import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyRequest } from '../lib/agent.mjs';
import { compositionIds, getComposition } from '../lib/compositions.mjs';
import { exportProject, importScenario, packFileText } from '../lib/export.mjs';
import { validateProject, runProject } from '../lib/labRun.mjs';
import { runLabScenario } from '../../../src/testing/lab/runScenario.js';
import { evaluateOracleKernel } from '../../../src/testing/lab/oracleKernel.js';
import { ACTOR_OVERRIDE_FIELDS, deletePath, discRadius, fieldStroke, fieldsFor, markerStroke, numberFieldValue, writePath } from '../lib/inspector.mjs';
import { objectById } from '../lib/scene.mjs';
import { byteLength, inspectValue } from '../lib/security.mjs';
import { stableStringify } from '../lib/stableJson.mjs';
import { send } from '../serve.mjs';
import { probePackFiles, probeUserContentDir } from '../lib/userProbe.mjs';

function firstDiff(a, b, where = '$') {
  if (Object.is(a, b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) {
    return `${where}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return `${where}: array ${Array.isArray(a) ? a.length : typeof a} != ${Array.isArray(b) ? b.length : typeof b}`;
    }
    for (let i = 0; i < a.length; i += 1) {
      const diff = firstDiff(a[i], b[i], `${where}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of [...keys].sort()) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return `${where}.${key} missing on the right`;
    if (!Object.prototype.hasOwnProperty.call(a, key)) return `${where}.${key} missing on the left`;
    const diff = firstDiff(a[key], b[key], `${where}.${key}`);
    if (diff) return diff;
  }
  return null;
}

test('eight compositions export schema-valid scenarios and round-trip', async () => {
  for (const id of compositionIds()) {
    const project = getComposition(id);
    const exported = await exportProject(project);
    assert.equal(exported.ok, true, `${id}\n${exported.issues.join('\n')}`);
    assert.equal(exported.scenario.schema, 'spaceface.simScenario.v1');
    assert.equal(exported.scenario.assertions.length > 0, true);
    const imported = importScenario(exported.scenario);
    assert.equal(imported.ok, true, `${id} import\n${imported.issues.join('\n')}`);
    const again = await exportProject(imported.project);
    assert.equal(again.ok, true, `${id} re-export\n${again.issues.join('\n')}`);
    assert.equal(firstDiff(exported.scenario, again.scenario), null);
    const saved = JSON.parse(stableStringify(project));
    assert.equal(firstDiff(saved, project), null);
  }
});

test('import refuses a second player and a single player keeps height', async () => {
  const project = structuredClone(getComposition('dock.intercept-cargo'));
  const player = project.objects.find((object) => object.isPlayer);
  player.y = 4.5;
  player.velY = -1.25;
  const exported = await exportProject(project);
  assert.equal(exported.ok, true, exported.issues.join('\n'));

  const scenario = structuredClone(exported.scenario);
  const donor = scenario.entities.find((row) => row.isPlayer);
  scenario.entities.push({
    ...donor,
    alias: 'second_player',
    isPlayer: true,
    pos: { ...donor.pos, y: 8 },
    vel: { ...donor.vel, y: 2.5 },
  });
  const imported = importScenario(scenario);
  assert.equal(imported.ok, false);
  assert.equal(imported.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 2')), true);
  const kept = imported.project && imported.project.objects
    ? imported.project.objects.filter((object) => object.isPlayer)
    : [];
  assert.equal(kept.length > 1, false);
  assert.equal(kept.some((object) => object.id === 'second_player'), false);

  const single = importScenario(exported.scenario);
  assert.equal(single.ok, true, single.issues.join('\n'));
  const back = single.project.objects.find((object) => object.isPlayer);
  assert.equal(back.y, 4.5);
  assert.equal(back.velY, -1.25);
  assert.equal(single.project.objects.filter((object) => object.isPlayer).length, 1);

  const doubled = structuredClone(project);
  const body = doubled.objects.find((object) => object.isPlayer);
  doubled.objects.push({ ...structuredClone(body), id: 'second_player', label: 'second player' });
  const refused = await exportProject(doubled);
  assert.equal(refused.ok, false);
  assert.equal(refused.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 2')), true);

  const cleared = structuredClone(exported.scenario);
  for (const entity of cleared.entities) entity.isPlayer = false;
  const none = importScenario(cleared);
  assert.equal(none.ok, false);
  assert.equal(none.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 0')), true);
  const importedPlayers = none.project && none.project.objects
    ? none.project.objects.filter((object) => object.isPlayer).length
    : null;
  assert.equal(importedPlayers, null);

  const emptyEntities = structuredClone(exported.scenario);
  emptyEntities.entities = [];
  const emptyImport = importScenario(emptyEntities);
  assert.equal(emptyImport.ok, false);
  assert.equal(emptyImport.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 0')), true);
  assert.equal(emptyImport.project, null);

  const zero = structuredClone(getComposition('dock.intercept-cargo'));
  for (const object of zero.objects) {
    if (object.isPlayer) object.isPlayer = false;
  }
  const zeroExport = await exportProject(zero);
  assert.equal(zeroExport.ok, false);
  assert.equal(zeroExport.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 0')), true);

  const stringFalse = structuredClone(exported.scenario);
  const playerEntity = stringFalse.entities.find((row) => row.isPlayer === true);
  playerEntity.isPlayer = 'false';
  const refusedFalse = importScenario(stringFalse);
  assert.equal(refusedFalse.ok, false);
  assert.equal(refusedFalse.project, null);
  assert.equal(refusedFalse.issues.some((issue) => issue.includes('isPlayer must be a boolean')), true);

  const withFalse = structuredClone(exported.scenario);
  const falseDonor = withFalse.entities.find((row) => row.isPlayer === true);
  withFalse.entities.push({ ...falseDonor, alias: 'not_the_player', isPlayer: false });
  const keptFalse = importScenario(withFalse);
  assert.equal(keptFalse.ok, true, keptFalse.issues.join('\n'));
  assert.equal(keptFalse.project.objects.filter((object) => object.isPlayer === true).length, 1);
  assert.equal(keptFalse.project.objects.find((object) => object.id === 'not_the_player').isPlayer, false);
});

test('actor height and vertical velocity survive export and import', async () => {
  const project = structuredClone(getComposition('dock.intercept-cargo'));
  const player = project.objects.find((object) => object.isPlayer);
  player.y = 4.5;
  player.velY = -1.25;
  const exported = await exportProject(project);
  assert.equal(exported.ok, true, exported.issues.join('\n'));
  const entity = exported.scenario.entities.find((row) => row.isPlayer);
  assert.equal(entity.pos.y, 4.5);
  assert.equal(entity.vel.y, -1.25);
  const imported = importScenario(exported.scenario);
  assert.equal(imported.ok, true, imported.issues.join('\n'));
  const back = imported.project.objects.find((object) => object.isPlayer);
  assert.equal(back.y, 4.5);
  assert.equal(back.velY, -1.25);
  assert.equal(objectById(imported.project, player.id).y, 4.5);
});

test('lab-only motion is withheld from the encounter file and a force field is refused', async () => {
  const project = getComposition('dock.intercept-cargo');
  const exported = await exportProject(project);
  assert.equal(exported.ok, true, exported.issues.join('\n'));
  const encounter = exported.pack.files['encounters/dock_intercept_cargo.json'];
  assert.equal(JSON.stringify(encounter).includes('velX'), false);
  assert.equal(exported.manifest.withheldFromUserContent.some((row) => row.labOnly && row.path.includes('player')), true);
  assert.equal(exported.scenario.entities.some((entity) => entity.alias === 'cargo' && entity.vel.x === 16), true);

  const forced = getComposition('dock.bank-shot');
  forced.objects.push({
    id: 'well',
    kind: 'field',
    fieldKind: 'force',
    gameplay: true,
    x: 0,
    z: 0,
    radius: 30,
    force: { kind: 'gravity', strength: 9 },
    label: 'fake well',
  });
  const refused = await exportProject(forced);
  assert.equal(refused.ok, false);
  assert.equal(refused.issues.some((issue) => issue.includes('no force-field')), true);
  assert.equal(JSON.stringify(refused.scenario).includes('"gravity"'), false);
});

test('negative controls: scripts, unknown fields, dropped overrides, bad init, gameplay routes', async () => {
  const scripted = getComposition('dock.legal-release');
  scripted.description = 'eval(1)';
  assert.equal((await exportProject(scripted)).ok, false);

  const weapon = getComposition('dock.bank-shot');
  weapon.weapon.notARealField = true;
  const weaponExport = await exportProject(weapon);
  assert.equal(weaponExport.ok, false);
  assert.equal(weaponExport.issues.some((issue) => issue.includes('unknown field')), true);

  const ship = getComposition('dock.intercept-cargo');
  const player = ship.objects.find((object) => object.id === 'player');
  player.overrides = { dynamic: false };
  const dropped = await exportProject(ship);
  assert.equal(dropped.ok, false);
  assert.equal(dropped.issues.some((issue) => issue.includes('Refusing to drop')), true);

  const init = getComposition('dock.intercept-cargo');
  init.ticks = 0;
  assert.equal((await exportProject(init)).ok, false);

  const profile = getComposition('dock.intercept-cargo');
  profile.objects.find((object) => object.id === 'cargo').profile = 'ship.does_not_exist';
  assert.equal((await exportProject(profile)).ok, false);

  const route = getComposition('dock.convoy-rescue');
  route.objects.find((object) => object.kind === 'route').gameplay = true;
  const routed = await exportProject(route);
  assert.equal(routed.ok, false);
  assert.equal(routed.issues.some((issue) => issue.includes('Refusing to drop a gameplay route')), true);

  const bare = getComposition('dock.intercept-cargo');
  bare.standardInvariants = false;
  bare.objects = bare.objects.filter((object) => object.kind === 'actor' || object.kind === 'route');
  assert.equal((await exportProject(bare)).ok, false);

  const removed = getComposition('dock.collision-chain');
  removed.objects = removed.objects.filter((object) => object.id !== 'rock_b');
  const chain = await exportProject(removed);
  assert.equal(chain.ok, true, chain.issues.join('\n'));
  assert.equal(chain.scenario.entities.some((entity) => entity.alias === 'rock_b'), false);
  assert.equal(chain.scenario.entities.some((entity) => entity.alias === 'rock_a'), true);
});

test('user-content probe accepts the eight packs and three agent packs, and rejects a bad record', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'creators-dock-packs-'));
  try {
    const ids = [
      ...compositionIds(),
    ];
    for (const id of ids) {
      const exported = await exportProject(getComposition(id));
      assert.equal(exported.ok, true, exported.issues.join('\n'));
      writePack(root, exported);
    }
    for (const file of ['01-create.json', '02-edit.json', '03-undo.json']) {
      const request = JSON.parse(fs.readFileSync(new URL(`../examples/agent-requests/${file}`, import.meta.url), 'utf8'));
      const applied = applyRequest(request);
      assert.equal(applied.ok, true, applied.issues.join('\n'));
      const exported = await exportProject(applied.project);
      assert.equal(exported.ok, true, `${file}\n${exported.issues.join('\n')}`);
      const again = await exportProject(applied.project);
      assert.equal(stableStringify(exported.scenario), stableStringify(again.scenario));
      writePack(root, exported);
    }
    const probe = await probeUserContentDir(root);
    assert.equal(probe.ok, true, JSON.stringify(probe.result || probe.stderr, null, 2));
    const accepted = probe.result.accepted;
    assert.equal(accepted.encounters.length >= 4, true);
    assert.equal(accepted.weapons.includes('wpn_dock_bank_needle'), true);
    assert.equal(accepted.modules.includes('mod_dock_lane_note'), true);
    assert.equal(accepted.places.includes('zone_dock_bank_corridor'), true);
    for (const id of [
      'dock_intercept_cargo', 'dock_brake_hulk', 'dock_legal_release', 'dock_collision_chain',
      'dock_dangerous_crossing', 'dock_convoy_rescue', 'dock_bank_shot', 'dock_hawser_quiet_drift',
    ]) {
      assert.equal(accepted.encounters.includes(id), true, id);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    assert.equal(fs.existsSync(root), false);
  }

  const bad = await probePackFiles('bad-mod', {
    'mod.json': stableStringify({
      id: 'bad-mod', name: 'Bad', version: '1.0.0', description: '', author: 'Creators Dock',
    }),
    'weapons/evil.json': stableStringify({
      id: 'wpn_dock_evil', name: 'Evil', slotType: 'weapon', size: 'S', tier: 1,
      mass: 1, price: 0, dmg: 1, rof: 1, damageType: 'kinetic', energyCost: 1,
      projSpeed: 10, range: 10, tracking: 'fixed', nope: true,
    }),
    'encounters/bad.json': stableStringify({
      id: 'dock_bad_script', order: 1099, tier: 'minor', deck: 'combat', weight: 1,
      zoneTypes: ['trade_lane'], script: 'notARealScript',
      shape: { situation: 'trade', place: 'trade_lane', twist: 'none', actor: 'mule_trader' },
    }),
  });
  assert.equal(bad.ok, false);
  const text = JSON.stringify(bad.result);
  assert.equal(text.includes('unknown field') || text.includes('nope'), true);
  assert.equal(text.includes('not a shipped encounter script') || text.includes('notARealScript'), true);
});

function writePack(root, exported) {
  const dir = path.join(root, exported.pack.modId);
  const files = packFileText(exported.pack.files);
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
}

test('a throwing toJSON on project.id does not escape the export manifest', async () => {
  const project = getComposition('dock.intercept-cargo');
  const boxed = new String(project.id);
  Object.defineProperty(boxed, 'toJSON', {
    enumerable: true,
    value() { throw new Error('boom'); },
  });
  project.id = boxed;
  const exported = await exportProject(project);
  assert.equal(exported.ok, false);
  assert.equal(exported.issues.some((issue) => issue.includes('scene could not be cloned')), true);
  assert.equal(typeof exported.manifest.projectId, 'string');
  assert.doesNotThrow(() => stableStringify(exported.manifest));
  assert.doesNotThrow(() => stableStringify({
    ok: false,
    issues: exported.issues,
    manifest: exported.manifest,
  }));
  assert.equal(project.objects.find((object) => object.isPlayer === true).isPlayer, true);

  const validated = await validateProject(project);
  assert.doesNotThrow(() => stableStringify(validated));
  assert.equal(validated.ok, false);
  const ran = await runProject(project);
  assert.doesNotThrow(() => stableStringify({
    ok: ran.ok,
    issues: ran.issues,
    manifest: ran.manifest,
    run: ran.run,
  }));
  assert.equal(ran.ok, false);

  const chunks = [];
  const res = {
    writeHead() {},
    end(body) { chunks.push(body); },
  };
  assert.doesNotThrow(() => send(res, 200, { manifest: { projectId: boxed } }));
  assert.equal(typeof chunks[0], 'string');
  assert.equal(chunks[0].includes('"0"'), false);
  assert.equal(chunks[0].includes('dock.intercept-cargo'), true);
});

test('exportProject records a throwing toJSON instead of throwing', async () => {
  const project = getComposition('dock.intercept-cargo');
  Object.defineProperty(project, 'toJSON', {
    enumerable: false,
    value() { throw new Error('boom'); },
  });
  const exported = await exportProject(project);
  assert.equal(exported.ok, false);
  assert.equal(exported.issues.some((issue) => issue.includes('scene could not be cloned')), true);
  assert.equal(project.objects.find((object) => object.isPlayer === true).isPlayer, true);
});

test('a null assertion clone is recorded and does not throw', async () => {
  const project = getComposition('dock.intercept-cargo');
  const trigger = project.objects.find((object) => object.kind === 'trigger');
  Object.defineProperty(trigger.assertion, 'toJSON', {
    enumerable: false,
    value() { return null; },
  });
  const exported = await exportProject(project);
  assert.equal(exported.ok, false);
  assert.equal(exported.issues.some((issue) => issue.includes(trigger.id) && issue.includes('assertion')), true);
  assert.equal(project.objects.find((object) => object.isPlayer === true).isPlayer, true);
  assert.equal(trigger.assertion.signal, 'playerZ');
});

test('an exported user encounter can reference shipped bark lines without aborting the loader', async () => {
  const exported = await exportProject(getComposition('dock.intercept-cargo'));
  assert.equal(exported.ok, true, exported.issues.join('\n'));
  const files = packFileText(exported.pack.files);
  const encounterPath = Object.keys(files).find((name) => name.startsWith('encounters/'));
  assert.ok(encounterPath);
  const encounter = JSON.parse(files[encounterPath]);
  encounter.bark = 'toll_demand';
  files[encounterPath] = stableStringify(encounter);
  const probe = await probePackFiles(exported.pack.modId, files);
  assert.equal(probe.ok, true, JSON.stringify(probe.result || probe.stderr));
  assert.ok(probe.result.accepted.encounters.includes(encounter.id));
});

test('exportProject does not let toJSON null the caller grid', async () => {
  const project = getComposition('dock.bank-shot');
  const grid = project.grid;
  const before = { size: grid.size, snap: grid.snap, pad: ['keep'] };
  grid.pad = ['keep'];
  Object.defineProperty(project, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return grid; },
  });
  Object.defineProperty(project, 'toJSON', {
    enumerable: false,
    value() {
      this.grid.snap = null;
      this.grid.size = null;
      this.grid.pad = [null];
      return this;
    },
  });
  const exported = await exportProject(project);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  assert.deepEqual(
    { size: grid.size, snap: grid.snap, pad: [...grid.pad] },
    before,
  );
});

test('export keeps authored y and velY when toJSON nulls them', async () => {
  const project = getComposition('dock.intercept-cargo');
  const player = objectById(project, 'player');
  player.y = 4.5;
  player.velY = -1.25;
  Object.defineProperty(project, 'toJSON', {
    enumerable: false,
    value() {
      const actor = project.objects.find((object) => object && object.isPlayer === true);
      actor.y = null;
      actor.velY = null;
      return this;
    },
  });
  const exported = await exportProject(project);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  const entity = exported.scenario.entities.find((row) => row.isPlayer);
  assert.deepEqual(entity.pos, { ...entity.pos, y: 4.5 });
  assert.equal(entity.pos.y, 4.5);
  assert.equal(entity.vel.y, -1.25);
  assert.equal(player.y, 4.5);
  assert.equal(player.velY, -1.25);
  const imported = importScenario(exported.scenario);
  assert.equal(imported.ok, true, (imported.issues || []).join('\n'));
  const roundTrip = objectById(imported.project, 'player');
  assert.equal(roundTrip.y, 4.5);
  assert.equal(roundTrip.velY, -1.25);
});

test('a null height is not exported or imported as zero', async () => {
  const project = getComposition('dock.intercept-cargo');
  const player = objectById(project, 'player');
  player.y = null;
  player.velY = null;
  const exported = await exportProject(project);
  assert.equal(exported.ok, false);
  assert.equal(player.y, null);
  assert.equal(player.velY, null);
  const entity = exported.scenario.entities.find((row) => row.isPlayer);
  assert.equal(entity.pos.y, null);
  assert.equal(entity.vel.y, null);

  const zeroed = getComposition('dock.intercept-cargo');
  const zeroPlayer = objectById(zeroed, 'player');
  zeroPlayer.y = 0;
  zeroPlayer.velY = 0;
  const zeros = await exportProject(zeroed);
  assert.equal(zeros.ok, true, (zeros.issues || []).join('\n'));
  const zeroEntity = zeros.scenario.entities.find((row) => row.isPlayer);
  assert.equal(zeroEntity.pos.y, 0);
  assert.equal(zeroEntity.vel.y, 0);
  const zeroImport = importScenario(zeros.scenario);
  assert.equal(zeroImport.ok, true, (zeroImport.issues || []).join('\n'));
  const zeroBack = objectById(zeroImport.project, 'player');
  assert.equal(zeroBack.y, 0);
  assert.equal(zeroBack.velY, 0);

  const nulled = structuredClone(zeros.scenario);
  const nulledPlayer = nulled.entities.find((row) => row.isPlayer);
  nulledPlayer.pos.y = null;
  nulledPlayer.vel.y = null;
  const imported = importScenario(nulled);
  assert.equal(imported.ok, false);
  assert.equal(imported.project, null);
});

test('export does not invoke a live grid getter', async () => {
  const project = getComposition('dock.intercept-cargo');
  const grid = project.grid;
  const size = grid.size;
  Object.defineProperty(project, 'grid', {
    enumerable: true,
    configurable: true,
    get() {
      grid.size = null;
      return grid;
    },
  });
  const exported = await exportProject(project);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  assert.equal(grid.size, size);
  assert.equal(size, 10);
});

test('a place disc edits the exported place and objectives follow the lab metric', async () => {
  const project = getComposition('dock.bank-shot');
  const zone = objectById(project, 'bank_zone');
  zone.x = 500;
  zone.z = -200;
  zone.radius = 5;
  const objective = objectById(project, 'turned');
  objective.metric = 'trace.final';
  objective.signal = 'playerRot';
  objective.op = '<';
  objective.value = -0.25;
  objective.x = 12;
  objective.z = -8;
  objective.radius = 12;
  const exported = await exportProject(project);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  const place = exported.pack.files['places/zone_dock_bank_corridor.json'];
  assert.deepEqual(place.center, { x: 500, z: -200 });
  assert.equal(place.radius, 5);
  const metric = exported.scenario.metrics.find((row) => row.name === 'trace.final');
  assert.deepEqual(metric.threshold, { op: '<', value: -0.25 });
  assert.deepEqual(metric.params, { signal: 'playerRot' });
  const scenarioText = JSON.stringify(exported.scenario);
  assert.equal(scenarioText.includes('12'), true);
  assert.equal(scenarioText.includes('-8'), true);
  const turned = exported.scenario.assertions.find((row) => row.metric === 'trace.final');
  assert.deepEqual(turned.expected, { x: 12, z: -8, radius: 12 });
  const imported = importScenario(exported.scenario);
  assert.equal(imported.ok, true, (imported.issues || []).join('\n'));
  const importedTurned = imported.project.objects.find((object) => object.kind === 'objective' && object.metric === 'trace.final');
  assert.equal(importedTurned.x, 12);
  assert.equal(importedTurned.z, -8);
  const nearRun = await runLabScenario(exported.scenario);
  const nearFail = (nearRun.oracle.failed || []).find((row) => row.expected && row.expected.x === 12 && row.expected.z === -8);
  assert.notEqual(nearFail, undefined);
  assert.equal(nearFail.expected.radius, 12);
  assert.equal(nearFail.closest > 12, true);
  const moved = getComposition('dock.bank-shot');
  const along = objectById(moved, 'along_x');
  along.x = 400;
  along.z = 400;
  along.radius = 99;
  const movedExport = await exportProject(moved);
  assert.equal(movedExport.ok, true, (movedExport.issues || []).join('\n'));
  const movedText = JSON.stringify(movedExport.scenario);
  assert.equal(movedText.includes('400'), true);
  assert.equal(movedText.includes('99'), true);
  const alongAssertion = movedExport.scenario.assertions.find((row) => row.kind === 'eventByTick' && row.signal === 'playerX');
  assert.equal(alongAssertion.expected.x, 400);
  assert.equal(alongAssertion.expected.z, 400);
  assert.equal(alongAssertion.expected.radius, 99);
  const movedImport = importScenario(movedExport.scenario);
  assert.equal(movedImport.ok, true, (movedImport.issues || []).join('\n'));
  const importedAlong = movedImport.project.objects.find((object) => object.kind === 'trigger' && object.assertion && object.assertion.signal === 'playerX');
  assert.equal(importedAlong.x, 400);
  assert.equal(importedAlong.z, 400);
  assert.equal(importedAlong.radius, 99);
  const wideRun = await runLabScenario(movedExport.scenario);
  const onPath = getComposition('dock.bank-shot');
  const onPathAlong = objectById(onPath, 'along_x');
  onPathAlong.x = 3.560842;
  onPathAlong.z = 0.410599;
  onPathAlong.radius = 1;
  const onPathExport = await exportProject(onPath);
  assert.equal(onPathExport.ok, true, (onPathExport.issues || []).join('\n'));
  const onPathRun = await runLabScenario(onPathExport.scenario);
  const tight = getComposition('dock.bank-shot');
  const tightZone = objectById(tight, 'bank_zone');
  tightZone.x = 500;
  tightZone.z = -200;
  tightZone.radius = 5;
  const tightTurned = objectById(tight, 'turned');
  tightTurned.metric = 'trace.final';
  tightTurned.signal = 'playerRot';
  tightTurned.op = '<';
  tightTurned.value = -0.25;
  tightTurned.x = 12;
  tightTurned.z = -8;
  const tightAlong = objectById(tight, 'along_x');
  tightAlong.x = 999;
  tightAlong.z = 999;
  tightAlong.radius = 1;
  const tightExport = await exportProject(tight);
  assert.equal(tightExport.ok, true, (tightExport.issues || []).join('\n'));
  const tightRun = await runLabScenario(tightExport.scenario);
  const eventRow = (result) => (result.oracle.failed || []).find((row) => String(row.id || '').includes('eventByTick'));
  const wideEvent = eventRow(wideRun);
  const onPathEvent = eventRow(onPathRun);
  const tightEvent = eventRow(tightRun);
  assert.notEqual(wideEvent, undefined);
  assert.equal(wideEvent.expected.x, 400);
  assert.equal(wideEvent.expected.z, 400);
  assert.equal(wideEvent.expected.radius, 99);
  assert.equal(Number.isFinite(wideEvent.closest), true);
  assert.equal(wideEvent.closest > 99, true);
  assert.equal(onPathEvent, undefined);
  assert.notEqual(tightEvent, undefined);
  assert.equal(tightEvent.expected.x, 999);
  assert.equal(tightEvent.expected.z, 999);
  assert.equal(tightEvent.expected.radius, 1);
  const farObjective = getComposition('dock.bank-shot');
  const farTurned = objectById(farObjective, 'turned');
  farTurned.metric = 'trace.final';
  farTurned.signal = 'playerRot';
  farTurned.op = '<';
  farTurned.value = -0.25;
  farTurned.x = 99999;
  farTurned.z = 99999;
  farTurned.radius = 1;
  const farExport = await exportProject(farObjective);
  assert.equal(farExport.ok, true, (farExport.issues || []).join('\n'));
  const farAuthored = farExport.scenario.assertions.find((row) => row.metric === 'trace.final');
  assert.deepEqual(farAuthored.expected, { x: 99999, z: 99999, radius: 1 });
  const farRun = await runLabScenario(farExport.scenario);
  const metricFail = (farRun.oracle.failed || []).find((row) => row.expected && row.expected.x === 99999 && row.expected.z === 99999);
  assert.notEqual(metricFail, undefined);
  assert.equal(metricFail.expected.radius, 1);
  assert.equal(Number.isFinite(metricFail.closest), true);
  assert.equal(metricFail.closest > metricFail.expected.radius, true);
  const bare = getComposition('dock.bank-shot');
  const bareTurned = objectById(bare, 'turned');
  delete bareTurned.radius;
  const bareExport = await exportProject(bare);
  assert.equal(bareExport.ok, true, (bareExport.issues || []).join('\n'));
  const bareAuthored = bareExport.scenario.assertions.find((row) => row.metric === 'trace.final');
  assert.equal(Object.prototype.hasOwnProperty.call(bareAuthored.expected, 'radius'), false);
  const bareRun = await runLabScenario(bareExport.scenario);
  assert.equal(bareRun.ok, false);
  const bareFail = (bareRun.oracle.failed || []).find((row) => row.expected && row.expected.x === bareTurned.x && row.expected.z === bareTurned.z);
  assert.notEqual(bareFail, undefined);
  assert.equal(Number.isFinite(bareFail.expected.radius), false);
  assert.notEqual(bareFail.expected.radius, 10);
  assert.notEqual(bareFail.expected.radius, 20);
  const alive = objectById(getComposition('dock.bank-shot'), 'alive_bank');
  for (const place of [{ x: -90, z: 10, radius: 12 }, { x: 999, z: 999, radius: 1 }]) {
    const project = getComposition('dock.bank-shot');
    const hold = objectById(project, 'alive_bank');
    hold.x = place.x;
    hold.z = place.z;
    hold.radius = place.radius;
    const holdExport = await exportProject(project);
    assert.equal(holdExport.ok, true, (holdExport.issues || []).join('\n'));
    const holdRun = await runLabScenario(holdExport.scenario);
    const holdFail = (holdRun.oracle.failed || []).find((row) => String(row.id || '').includes('holds'));
    assert.notEqual(holdFail, undefined);
    assert.equal(holdFail.expected.x, place.x);
    assert.equal(holdFail.expected.z, place.z);
    assert.equal(holdFail.expected.radius, place.radius);
    assert.equal(Number.isFinite(holdFail.expected.closest), true);
    assert.equal(holdFail.expected.closest > place.radius, true);
  }
  const missingDisc = getComposition('dock.bank-shot');
  const missingHold = objectById(missingDisc, 'alive_bank');
  missingHold.x = -90;
  missingHold.z = 10;
  delete missingHold.radius;
  const missingExport = await exportProject(missingDisc);
  assert.equal(missingExport.ok, true, (missingExport.issues || []).join('\n'));
  const missingAssertion = missingExport.scenario.assertions.find((row) => row.kind === 'holds' && row.signal === 'playerAlive');
  assert.deepEqual(missingAssertion.expected, { x: -90, z: 10, shape: 'circle' });
  assert.equal(Object.prototype.hasOwnProperty.call(missingAssertion.expected, 'radius'), false);
  const missingRun = await runLabScenario(missingExport.scenario);
  assert.equal(missingRun.ok, false);
  const missingFail = (missingRun.oracle.failed || []).find((row) => String(row.id || '').includes('holds:playerAlive'));
  assert.notEqual(missingFail, undefined);
  assert.equal(Number.isFinite(missingFail.expected && missingFail.expected.radius), false);
  const nullDisc = getComposition('dock.bank-shot');
  const nullHold = objectById(nullDisc, 'alive_bank');
  nullHold.x = -90;
  nullHold.z = 10;
  nullHold.radius = null;
  const nullExport = await exportProject(nullDisc);
  assert.equal(nullExport.ok, false);
  assert.equal(nullExport.scenario, null);
  const nullKernel = evaluateOracleKernel({
    trace: [{ tick: 0, playerX: 0.02682, playerZ: 0, hull: 140, playerAlive: true, playerVelX: 0 }],
    assertions: [
      {
        kind: 'holds',
        signal: 'playerAlive',
        holdsTicks: 1,
        expected: { x: -90, z: 10, radius: null },
      },
      {
        kind: 'never',
        signal: 'hull',
        op: '<',
        value: 0,
        expected: { x: -90, z: 10, radius: null },
      },
      {
        kind: 'settles',
        signal: 'playerVelX',
        value: 1e9,
        expected: { x: 0, z: 0, radius: null },
      },
    ],
  });
  assert.equal(nullKernel.ok, false);
  assert.equal(nullKernel.results.find((row) => row.id === 'holds:playerAlive').ok, false);
  assert.equal(nullKernel.results.find((row) => row.id === 'never:hull').ok, false);
  assert.equal(nullKernel.results.find((row) => row.id === 'settles').ok, false);
  assert.equal(Number.isFinite(nullKernel.results.find((row) => row.id === 'settles').expected.radius), false);
  assert.notEqual(nullKernel.results.find((row) => row.id === 'settles').expected.radius, 10);
  for (const kind of ['never', 'settles']) {
    const project = getComposition('dock.bank-shot');
    const hold = objectById(project, 'alive_bank');
    if (kind === 'never') {
      hold.x = -90;
      hold.z = 10;
    } else {
      hold.x = 0;
      hold.z = 0;
    }
    delete hold.radius;
    hold.assertion = kind === 'never'
      ? { kind: 'never', signal: 'hull', op: '<', value: 0 }
      : { kind: 'settles', signal: 'playerVelX', value: 1e9 };
    const exported = await exportProject(project);
    assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
    const assertion = exported.scenario.assertions.find((row) => row.kind === kind);
    assert.equal(Object.prototype.hasOwnProperty.call(assertion.expected, 'radius'), false);
    assert.notEqual(assertion.expected.radius, 10);
    const ran = await runLabScenario(exported.scenario);
    assert.equal(ran.ok, false, kind);
    const failed = (ran.oracle.failed || []).find((row) => String(row.id || '').includes(kind === 'never' ? 'never:hull' : 'settles'));
    assert.notEqual(failed, undefined, kind);
    assert.equal(Number.isFinite(failed.expected && failed.expected.radius), false, kind);
    assert.notEqual(failed.expected.radius, 10, kind);
  }
  const entered = getComposition('dock.bank-shot');
  const enteredHold = objectById(entered, 'alive_bank');
  enteredHold.x = 0;
  enteredHold.z = 0;
  enteredHold.radius = 10;
  enteredHold.assertion = { kind: 'never', signal: 'hull', op: '<', value: 0 };
  const enteredExport = await exportProject(entered);
  assert.equal(enteredExport.ok, true, (enteredExport.issues || []).join('\n'));
  const enteredAssertion = enteredExport.scenario.assertions.find((row) => row.kind === 'never');
  assert.equal(enteredAssertion.expected.radius, 10);
  const enteredRun = await runLabScenario(enteredExport.scenario);
  assert.equal(enteredRun.ok, true, (enteredRun.oracle && enteredRun.oracle.failed || []).map((row) => row.id).join(','));
  assert.equal((enteredRun.oracle.failed || []).some((row) => String(row.id || '').includes('never:hull')), false);
  const settledInside = getComposition('dock.bank-shot');
  const settledHold = objectById(settledInside, 'alive_bank');
  settledHold.x = 0;
  settledHold.z = 0;
  settledHold.radius = 1;
  settledHold.assertion = { kind: 'settles', signal: 'playerVelX', value: 1e9 };
  const settledExport = await exportProject(settledInside);
  assert.equal(settledExport.ok, true, (settledExport.issues || []).join('\n'));
  const settledRun = await runLabScenario(settledExport.scenario);
  const settledFail = (settledRun.oracle.failed || []).find((row) => row.id === 'settles');
  assert.equal(settledFail, undefined, JSON.stringify(settledRun.oracle && settledRun.oracle.failed));
  assert.equal(settledRun.ok, true, (settledRun.oracle && settledRun.oracle.failed || []).map((row) => row.id).join(','));
  assert.equal(discRadius({ kind: 'trigger', x: 0, z: 0 }), null);
  assert.notEqual(discRadius({ kind: 'trigger', x: 0, z: 0 }), 0);
  assert.notEqual(discRadius({ kind: 'trigger', x: 0, z: 0 }), 10);
  const clearedDisc = { kind: 'trigger', radius: 12 };
  deletePath(clearedDisc, 'radius');
  assert.equal(Object.prototype.hasOwnProperty.call(clearedDisc, 'radius'), false);
  assert.equal(discRadius(clearedDisc), null);
  assert.notEqual(discRadius(clearedDisc), 0);
  assert.equal(discRadius({ kind: 'trigger', radius: 12 }), 12);
  const markerSource = fs.readFileSync(new URL('../public/editor.js', import.meta.url), 'utf8');
  assert.equal(markerSource.includes('discRadius(object)'), true);
  assert.equal(markerSource.includes('radius || 10'), false);
  assert.equal(markerSource.includes('numberFieldValue(input.value)'), true);
  const paint = markerSource.slice(markerSource.indexOf('function paintInspector'), markerSource.indexOf('function profileOptions'));
  assert.equal(paint.includes('Number(input.value)'), false);
  const framesPaint = markerSource.slice(markerSource.indexOf('function paintFrames'), markerSource.indexOf('function profileOptions'));
  assert.equal(framesPaint.includes('Number(input.value)'), false);
  assert.equal(framesPaint.includes('numberFieldValue(input.value)'), true);
  assert.equal(framesPaint.includes('Number(tick.value)'), false);
  assert.equal(numberFieldValue(''), null);
  assert.equal(numberFieldValue('0'), 0);
  assert.equal(discRadius({ kind: 'trigger', radius: 0 }), 0);
  assert.equal(markerStroke({ kind: 'trigger', radius: 0 }, 3.2), 0);
  assert.equal(markerStroke({ kind: 'trigger' }, 3.2), 0);
  assert.notEqual(markerStroke({ kind: 'trigger' }, 1), 10);
  assert.notEqual(markerStroke({ kind: 'trigger' }, 1), 8);
  assert.equal(fieldStroke({ kind: 'field', fieldKind: 'place', radius: 0 }, 3.2), 0);
  assert.notEqual(fieldStroke({ kind: 'field', fieldKind: 'place', radius: 0 }, 3.2), 22.4);
  assert.equal(fieldStroke({ kind: 'field', fieldKind: 'place', radius: 0 }, 10), 0);
  assert.notEqual(fieldStroke({ kind: 'field', fieldKind: 'place', radius: 0 }, 10), 70);
  const drawFieldSource = markerSource.slice(markerSource.indexOf('function drawField'), markerSource.indexOf('function drawLink'));
  assert.equal(drawFieldSource.includes('|| 20'), false);
  assert.equal(drawFieldSource.includes('fieldStroke(object, cam.zoom)'), true);
  assert.equal(fieldStroke({ kind: 'field', fieldKind: 'place' }, 3.2), 0);
  assert.notEqual(fieldStroke({ kind: 'field', fieldKind: 'place' }, 3.2), 20);
  const zeroZoneProject = getComposition('dock.bank-shot');
  const zeroZone = objectById(zeroZoneProject, 'bank_zone');
  zeroZone.radius = 0;
  const zeroZoneExport = await exportProject(zeroZoneProject);
  assert.equal(zeroZoneExport.ok, true, (zeroZoneExport.issues || []).join('\n'));
  const zeroPlace = zeroZoneExport.pack.files['places/zone_dock_bank_corridor.json'];
  assert.equal(zeroPlace.radius, 0);
  assert.notEqual(zeroPlace.radius, 80);
  const zeroAuthored = getComposition('dock.bank-shot');
  const zeroAlive = objectById(zeroAuthored, 'alive_bank');
  zeroAlive.radius = 0;
  const zeroExport = await exportProject(zeroAuthored);
  assert.equal(zeroExport.ok, true, (zeroExport.issues || []).join('\n'));
  const zeroAssertion = zeroExport.scenario.assertions.find((row) => row.kind === 'holds' && row.signal === 'playerAlive');
  assert.equal(zeroAssertion.expected.radius, 0);
  const importedBare = importScenario(missingExport.scenario);
  assert.equal(importedBare.ok, true, (importedBare.issues || []).join('\n'));
  const importedHold = importedBare.project.objects.find((object) => object.kind === 'trigger' && object.assertion && object.assertion.kind === 'holds');
  assert.equal(Object.prototype.hasOwnProperty.call(importedHold, 'radius'), false);
  assert.notEqual(importedHold.radius, 10);
  const roundTrip = await exportProject(importedBare.project);
  assert.equal(roundTrip.ok, true, (roundTrip.issues || []).join('\n'));
  const roundHold = roundTrip.scenario.assertions.find((row) => row.kind === 'holds' && row.signal === 'playerAlive');
  assert.equal(Object.prototype.hasOwnProperty.call(roundHold.expected, 'radius'), false);
  const held = getComposition('dock.bank-shot');
  const heldAlive = objectById(held, 'alive_bank');
  assert.equal(heldAlive.x, 24.138);
  assert.equal(heldAlive.z, 11.272);
  assert.equal(heldAlive.radius, 49);
  const heldExport = await exportProject(held);
  assert.equal(heldExport.ok, true, (heldExport.issues || []).join('\n'));
  const heldRun = await runLabScenario(heldExport.scenario);
  const heldFail = (heldRun.oracle.failed || []).find((row) => String(row.id || '').includes('holds') && row.expected && row.expected.x === 24.138);
  assert.equal(heldFail, undefined);
  const editor = fs.readFileSync(new URL('../public/editor.js', import.meta.url), 'utf8');
  assert.equal(editor.includes('fieldsFor(object'), true);
  const objectiveFields = fieldsFor({ kind: 'objective', metric: 'trace.final' });
  assert.equal(objectiveFields.some((field) => field.key === 'metric'), true);
  assert.equal(objectiveFields.some((field) => field.key === 'signal'), true);
  assert.equal(objectiveFields.some((field) => field.key === 'op'), true);
  assert.equal(objectiveFields.some((field) => field.key === 'value'), true);
  assert.equal(objectiveFields.some((field) => field.key === 'radius' && field.kind === 'number'), true);
  assert.equal(alive.radius, 49);
});

test('a trigger disc that cannot be carried is refused', async () => {
  const project = getComposition('dock.bank-shot');
  const along = objectById(project, 'along_x');
  along.x = 999;
  along.z = 999;
  along.radius = 1;
  along.assertion.expected = { note: 1 };
  const refused = await exportProject(project);
  assert.equal(refused.ok, false);
  assert.equal(refused.scenario, null);
  assert.equal(refused.issues.some((issue) => issue.includes('along_x') && issue.includes('geometry') && issue.includes('999') && issue.includes('was dropped')), true);
  const hidden = getComposition('dock.bank-shot');
  const hiddenAlong = objectById(hidden, 'along_x');
  hiddenAlong.labOnly = false;
  const hiddenExport = await exportProject(hidden);
  assert.equal(hiddenExport.ok, false);
  assert.equal(hiddenExport.scenario, null);
  assert.equal(hiddenExport.issues.some((issue) => issue.includes('lab-only')), true);
  for (const badRadius of [null, '12', Number.NaN]) {
    const far = getComposition('dock.bank-shot');
    const turnedFar = objectById(far, 'turned');
    turnedFar.x = 99999;
    turnedFar.z = 99999;
    turnedFar.radius = badRadius;
    turnedFar.value = Number.isNaN(badRadius) ? 999 : -0.5;
    const farExport = await exportProject(far);
    assert.equal(farExport.ok, false, String(badRadius));
    assert.equal(farExport.scenario, null, String(badRadius));
    assert.equal(farExport.issues.some((issue) => issue.includes('radius must be a finite number')), true, String(badRadius));
  }
  const carried = getComposition('dock.bank-shot');
  const carriedAlong = objectById(carried, 'along_x');
  carriedAlong.x = 999;
  carriedAlong.z = 999;
  carriedAlong.radius = 1;
  const exported = await exportProject(carried);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  const ran = await runLabScenario(exported.scenario);
  const missed = (ran.oracle.failed || []).find((row) => row.expected && row.expected.x === 999 && row.expected.radius === 1);
  assert.notEqual(missed, undefined);
});

test('an actor collider radius and mass edit the exported overrides', async () => {
  const project = getComposition('dock.bank-shot');
  const stone = objectById(project, 'stone');
  assert.deepEqual(stone.overrides, { radius: 8, mass: 800 });
  assert.deepEqual(ACTOR_OVERRIDE_FIELDS.map((field) => field.key), ['overrides.radius', 'overrides.mass']);
  writePath(stone, 'overrides.radius', 11);
  writePath(stone, 'overrides.mass', 640);
  assert.deepEqual(stone.overrides, { radius: 11, mass: 640 });
  const exported = await exportProject(project);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  const entity = exported.scenario.entities.find((row) => row.alias === 'stone');
  assert.equal(entity.overrides.radius, 11);
  assert.equal(entity.overrides.mass, 640);
  const editor = fs.readFileSync(new URL('../public/editor.js', import.meta.url), 'utf8');
  assert.equal(editor.includes('fieldsFor(object'), true);
  const actorFields = fieldsFor({ kind: 'actor' });
  assert.equal(actorFields.some((field) => field.key === 'role'), true);
  assert.equal(actorFields.some((field) => field.key === 'overrides.radius'), true);
  assert.equal(actorFields.some((field) => field.key === 'overrides.mass'), true);
});

test('export does not invoke a frames element grid getter', async () => {
  const project = getComposition('dock.intercept-cargo');
  const grid = project.grid;
  const size = grid.size;
  project.frames = [{ tick: 0, input: { moveX: 1 } }];
  let reads = 0;
  Object.defineProperty(project.frames[0], 'grid', {
    enumerable: false,
    configurable: true,
    get() {
      reads += 1;
      grid.size = null;
      return 1;
    },
  });
  const inspected = inspectValue(project);
  assert.equal(inspected.length, 0);
  assert.equal(reads, 0);
  assert.equal(grid.size, size);
  const exported = await exportProject(project);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  assert.equal(exported.issues.length, 0);
  assert.equal(reads, 0);
  assert.equal(grid.size, size);
  assert.equal(size, 10);
});

test('validate runs the certifying lab and a run report keeps the failure window', { timeout: 180000 }, async () => {
  const project = getComposition('dock.intercept-cargo');
  const validated = await validateProject(project);
  assert.equal(validated.ok, true, (validated.issues || []).join('\n'));
  assert.equal(validated.certifying, true);
  assert.equal(validated.seed, project.seed);
  assert.equal(typeof validated.oracle, 'object');
  assert.notEqual(validated.oracle, null);
  assert.equal(validated.oracle.ok, true);
  const direct = await runLabScenario((await exportProject(project)).scenario);
  const certifyingTrace = direct.trace || direct.oracleTrace || direct.traceHash;
  assert.equal(validated.trace, certifyingTrace);
  assert.equal(validated.seed, direct.seed);
  assert.equal(validated.seed, project.seed);
  assert.equal(validated.oracle.ok, direct.oracle.ok);
  const longer = getComposition('dock.intercept-cargo');
  longer.ticks = project.ticks + 40;
  const longerRun = await validateProject(longer);
  assert.equal(longerRun.seed, longer.seed);
  assert.notEqual(longerRun.trace, validated.trace);

  const failing = getComposition('dock.intercept-cargo');
  failing.ticks = 60;
  const objective = failing.objects.find((object) => object.id === 'final_z');
  objective.value = 50000;
  const trigger = failing.objects.find((object) => object.id === 'cross');
  trigger.assertion.value = 50000;
  trigger.assertion.byTick = 59;
  const ran = await runProject(failing);
  assert.equal(ran.ok, false);
  assert.equal(ran.run.certifying, true);
  assert.notEqual(ran.run.failure, null);
  assert.equal(Array.isArray(ran.run.failure.metricWindow), true);
  assert.ok('stateSlice' in ran.run.failure);
  assert.equal(Array.isArray(ran.run.failure.inputWindow), true);
  assert.notEqual(ran.run.failure.checkpoints, null);
  assert.notEqual(ran.run.checkpoints, null);
});

test('export does not run a frames element marker getter', async () => {
  const project = getComposition('dock.intercept-cargo');
  const grid = project.grid;
  const size = grid.size;
  project.frames = [{ tick: 0, input: { moveX: 1 } }];
  let reads = 0;
  Object.defineProperty(project.frames[0], 'marker', {
    enumerable: false,
    configurable: true,
    get() {
      reads += 1;
      grid.size = null;
      return 1;
    },
  });
  const exported = await exportProject(project);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  assert.equal(reads, 0);
  assert.equal(grid.size, size);
  assert.equal(size, 10);
  assert.equal(Object.getOwnPropertyDescriptor(grid, 'size').writable, true);
});

test('export does not run getters on nested array elements', async () => {
  for (const install of [
    (project, grid, reads) => {
      project.notes = { ...(project.notes || {}), rows: [{}] };
      Object.defineProperty(project.notes.rows[0], 'cell', {
        enumerable: false,
        configurable: true,
        get() {
          reads.count += 1;
          grid.size = null;
          return 1;
        },
      });
    },
    (project, grid, reads) => {
      project.inputEvents = [{ tick: 0 }];
      Object.defineProperty(project.inputEvents[0], 'echo', {
        enumerable: false,
        configurable: true,
        get() {
          reads.count += 1;
          grid.size = null;
          return 1;
        },
      });
    },
    (project, grid, reads) => {
      Object.defineProperty(project.objects[0], 'marker', {
        enumerable: false,
        configurable: true,
        get() {
          reads.count += 1;
          grid.size = null;
          return 1;
        },
      });
    },
  ]) {
    const project = getComposition('dock.intercept-cargo');
    const grid = project.grid;
    const size = grid.size;
    const reads = { count: 0 };
    install(project, grid, reads);
    const exported = await exportProject(project);
    assert.equal(reads.count, 0);
    assert.equal(grid.size, size);
    assert.equal(size, 10);
    const unexpected = (exported.issues || []).filter((issue) => !issue.includes('unknown field "marker"'));
    assert.equal(unexpected.length, 0, (exported.issues || []).join('\n'));
  }
});

test('a get-only hold cannot seal pocket credits during export', async () => {
  const project = getComposition('dock.intercept-cargo');
  const pocket = { credits: 40 };
  Object.defineProperty(project.world, 'hold', {
    enumerable: true,
    configurable: true,
    get() { return pocket; },
  });
  project.world.toJSON = function () {
    Object.defineProperty(pocket, 'credits', { value: 7, writable: false, configurable: false });
    return this;
  };
  const sized = byteLength(project);
  assert.equal(typeof sized, 'number');
  assert.equal(pocket.credits, 40);
  assert.equal(Object.getOwnPropertyDescriptor(pocket, 'credits').writable, true);
  assert.equal(Object.getOwnPropertyDescriptor(pocket, 'credits').configurable, true);
  const exported = await exportProject(project);
  assert.equal(pocket.credits, 40);
  assert.equal(Object.getOwnPropertyDescriptor(pocket, 'credits').value, 40);
  assert.equal(Object.getOwnPropertyDescriptor(pocket, 'credits').writable, true);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
});

test('byteLength does not run an inherited frames marker getter', () => {
  const project = getComposition('dock.intercept-cargo');
  const grid = project.grid;
  const size = grid.size;
  const frame = { tick: 0, input: { moveX: 1 } };
  const proto = {};
  let reads = 0;
  Object.defineProperty(proto, 'marker', {
    enumerable: false,
    configurable: true,
    get() {
      reads += 1;
      Object.defineProperty(grid, 'size', { value: null, writable: false, configurable: false });
      return [{ n: 1 }];
    },
  });
  Object.setPrototypeOf(frame, proto);
  project.frames = [frame];
  const sized = byteLength(project);
  assert.equal(typeof sized, 'number');
  assert.equal(reads, 0);
  assert.equal(grid.size, size);
  assert.equal(size, 10);
  const desc = Object.getOwnPropertyDescriptor(grid, 'size');
  assert.equal(desc.value, 10);
  assert.equal(desc.writable, true);
  assert.equal(desc.configurable, true);
});
