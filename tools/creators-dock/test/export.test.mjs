import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyRequest } from '../lib/agent.mjs';
import { compositionIds, getComposition } from '../lib/compositions.mjs';
import { exportProject, importScenario, packFileText } from '../lib/export.mjs';
import { objectById } from '../lib/scene.mjs';
import { stableStringify } from '../lib/stableJson.mjs';
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
