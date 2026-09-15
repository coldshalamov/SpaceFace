// PQ-033.03 — achievement definitions: valid, unique, localizable, and every rule bound to a signal
// that a live system really emits. Headless, data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_COPY_EN,
  ACHIEVEMENT_COPY_KEYS,
  ACHIEVEMENT_COUNTERS,
  CRUCIBLE_FACTS,
  HIDDEN_ACHIEVEMENT_COPY,
  achievementById,
  describeAchievementRule,
  isKnownAchievementId,
  validateAchievementDefinitions,
} from '../src/data/achievements.js';
import { ACHIEVEMENT_EVENT_HANDLERS } from '../src/systems/achievements.js';
import { messages as englishCatalog } from '../src/localization/catalogs/en-US.generated.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

test('definitions are valid, unique and sized for the store', () => {
  const verdict = validateAchievementDefinitions();
  assert.equal(verdict.ok, true, verdict.issues.join('\n'));
  assert.ok(ACHIEVEMENTS.length >= 12 && ACHIEVEMENTS.length <= 16, `12-16 achievements, got ${ACHIEVEMENTS.length}`);

  const ids = ACHIEVEMENTS.map((def) => def.id);
  const apiNames = ACHIEVEMENTS.map((def) => def.steamApiName);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.equal(new Set(apiNames).size, apiNames.length, 'Steam API names are unique');
  for (const def of ACHIEVEMENTS) {
    assert.equal(def.steamApiName, `SF_${def.id.toUpperCase()}`, 'API name derives from the stable id');
    assert.ok(Object.isFrozen(def) && Object.isFrozen(def.rule), `${def.id} is frozen`);
    assert.equal(achievementById(def.id), def);
    assert.equal(isKnownAchievementId(def.id), true);
  }
  assert.equal(isKnownAchievementId('../steam_api'), false);
  assert.equal(achievementById('nope'), null);

  for (const category of ACHIEVEMENT_CATEGORIES) {
    assert.ok(ACHIEVEMENTS.some((def) => def.category === category.id), `category ${category.id} is used`);
  }
  assert.ok(ACHIEVEMENTS.some((def) => def.hidden), 'at least one hidden achievement');
  const firstSession = ACHIEVEMENTS.filter((def) => def.category === 'adventure' && def.rule.target === 1);
  assert.ok(firstSession.length >= 4, 'several first-session adventure achievements');
  assert.ok(ACHIEVEMENTS.filter((def) => def.category === 'crucible').length >= 3, 'several from the Crucible records');

  const broken = validateAchievementDefinitions([
    ...ACHIEVEMENTS,
    ACHIEVEMENTS[0],
    { ...ACHIEVEMENTS[1], id: 'Bad Id', icon: 'dock.svg', rule: { source: 'counter', key: 'nope', target: 0 } },
  ]);
  assert.equal(broken.ok, false);
  assert.ok(broken.issues.some((issue) => /duplicate id/.test(issue)));
  assert.ok(broken.issues.some((issue) => /unknown counter/.test(issue)));
  assert.ok(broken.issues.some((issue) => /positive integer/.test(issue)));
  assert.ok(broken.issues.some((issue) => /icon must name a kit glyph/.test(issue)));

  for (const def of ACHIEVEMENTS) {
    console.log(`PQ-033.03 achievement ${def.steamApiName}${def.hidden ? ' (hidden)' : ''}: ${describeAchievementRule(def)}`);
  }
});

test('every counter is fed by a live emit site and a ledger handler that reads real payload fields', () => {
  for (const [key, counter] of Object.entries(ACHIEVEMENT_COUNTERS)) {
    const src = read(counter.emitSite);
    assert.ok(src.includes(`emit('${counter.event}'`), `${key}: ${counter.event} is emitted in ${counter.emitSite}`);
    if (counter.event !== 'run:resultsReady') {
      assert.equal(typeof ACHIEVEMENT_EVENT_HANDLERS[counter.event], 'function', `${key}: the ledger handles ${counter.event}`);
    }
  }
  for (const event of Object.keys(ACHIEVEMENT_EVENT_HANDLERS)) {
    assert.ok(Object.values(ACHIEVEMENT_COUNTERS).some((counter) => counter.event === event), `${event} feeds a declared counter`);
  }
  for (const def of ACHIEVEMENTS) {
    if (def.rule.source === 'counter') assert.ok(ACHIEVEMENT_COUNTERS[def.rule.key], `${def.id} counter exists`);
    else assert.ok(CRUCIBLE_FACTS[def.rule.key], `${def.id} crucible fact exists`);
  }

  // The payload fields the filters read are the ones the emitters write.
  assert.match(read('src/systems/tetherGameplay.js'), /classification = 'razor'/);
  assert.match(read('src/systems/masslineImpacts.js'), /'crushing'/);
  assert.match(read('src/systems/heat.js'), /wantedCrossed: wanted !== wasWanted/);
  assert.match(read('src/systems/mining.js'), /minerId: miner \? miner\.id : null/);
  assert.match(read('src/systems/economy.js'), /emit\('credits:changed', \{ delta: amount/);
  const records = read('src/systems/survivalRecords.js');
  for (const field of ['runs', 'deepestWave', 'byDate', 'attempts']) assert.ok(records.includes(field), `survivalRecords writes ${field}`);
  assert.match(read('src/systems/survivalResults.js'), /settleCrucibleRun\(\{ result, run \}\)[\s\S]*?_emit\('run:resultsReady', result\)/,
    'the Crucible profile is settled before run:resultsReady fires');
});

test('achievement copy is localizable: stable keys, English source, no clash with shipped catalogs', () => {
  assert.equal(new Set(ACHIEVEMENT_COPY_KEYS).size, ACHIEVEMENT_COPY_KEYS.length);
  assert.equal(ACHIEVEMENT_COPY_KEYS.length, ACHIEVEMENTS.length * 2 + 2);
  for (const key of ACHIEVEMENT_COPY_KEYS) {
    assert.match(key, /^achievements\.[a-z0-9_]+\.(name|description)$/);
    assert.equal(typeof ACHIEVEMENT_COPY_EN[key], 'string');
    assert.ok(ACHIEVEMENT_COPY_EN[key].trim().length > 0);
    assert.ok(!(key in englishCatalog) || englishCatalog[key] === ACHIEVEMENT_COPY_EN[key], `${key} does not collide with the extracted catalog`);
  }
  for (const def of ACHIEVEMENTS) {
    assert.equal(ACHIEVEMENT_COPY_EN[def.nameKey], def.name);
    assert.equal(ACHIEVEMENT_COPY_EN[def.descriptionKey], def.description);
  }
  assert.equal(ACHIEVEMENT_COPY_EN[HIDDEN_ACHIEVEMENT_COPY.nameKey], 'Hidden achievement');
  console.log(`PQ-033.03 localization keys: ${ACHIEVEMENT_COPY_KEYS.length}`);
});
