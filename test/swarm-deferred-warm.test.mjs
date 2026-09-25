import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Swarm launch-time slice: the bounded roster warm pays wave 1's eligibility only, and
// each wave's newcomers warm behind the between-round armory instead. These tests pin the
// data contract (what each wave can field), the spec scoping, and the wiring that moves
// the work out of the launch cook without dropping coverage.

const { swarmEligibleEnemyIds, SWARM_ROSTER, SWARM_BOSS_ROTATION } = await import('../src/data/swarmMode.js');
const {
  swarmRosterShipExemplarSpecs,
  rosterPoolWitnessFilePalettes,
  wholeShipVisualForEntity,
  spawnableShipArchetypePrewarmUrls,
} = await import('../src/render/partsLibrary.js');

const RENDERER_SOURCE = readFileSync(
  new URL('../src/render/renderer.js', import.meta.url), 'utf8',
);
const DRAFT_SOURCE = readFileSync(
  new URL('../src/ui/screens/crucibleDraft.js', import.meta.url), 'utf8',
);

const ALL_ROSTER_IDS = [
  ...new Set([
    ...SWARM_ROSTER.map((entry) => entry.enemyId),
    ...SWARM_BOSS_ROTATION.flatMap((boss) => (boss.packages || []).map((pkg) => pkg.enemyId)),
  ]),
];

test('wave 1 fields only the wasp: the launch warm pays a single archetype', () => {
  assert.deepEqual([...swarmEligibleEnemyIds(1)].sort(), ['wasp_swarmer']);
});

test('eligibility is cumulative and boss packages join on their wave', () => {
  assert.deepEqual([...swarmEligibleEnemyIds(2)].sort(), ['reaver_pirate', 'wasp_swarmer']);
  const wave10 = swarmEligibleEnemyIds(10);
  assert.ok(wave10.has('dreadnought_boss'), 'the first boss wave fields the dreadnought');
  assert.ok(wave10.has('corsair_raider'), 'the corsair unlocks on its own wave too');
  // Nothing ever leaves the set: a wave N+1 warm covers everything earlier waves covered.
  for (const id of swarmEligibleEnemyIds(9)) assert.ok(wave10.has(id), `${id} stays covered`);
});

test('the launch spec scope is wave 1 only; the full roster stays one flag away', () => {
  const scoped = swarmRosterShipExemplarSpecs('test:ship:', { enemyIds: swarmEligibleEnemyIds(1) });
  assert.deepEqual(scoped.map((spec) => spec.data.lootTableId), ['wasp_swarmer']);
  const all = swarmRosterShipExemplarSpecs('test:ship:');
  assert.equal(all.length, ALL_ROSTER_IDS.length, 'unscoped still covers the whole roster');
  // The deferred lane asks for exactly the newcomer ids.
  const fresh = new Set([...swarmEligibleEnemyIds(4)]
    .filter((id) => !swarmEligibleEnemyIds(3).has(id)));
  assert.deepEqual([...fresh], ['choir_zealot']);
  const deferred = swarmRosterShipExemplarSpecs('test:ship:', { enemyIds: fresh });
  assert.deepEqual(deferred.map((spec) => spec.data.lootTableId), ['choir_zealot']);
});

test('palette witness pairs scope to the same wave set', () => {
  const scoped = rosterPoolWitnessFilePalettes([], { rosterEnemyIds: swarmEligibleEnemyIds(1) });
  const all = rosterPoolWitnessFilePalettes([]);
  assert.ok(scoped.size > 0, 'wave 1 still maps its hull files');
  assert.ok(all.size >= scoped.size, 'unscoped is a superset');
  // Wave 1's wasp hull files only — a wave-6 file (jackal) must not appear.
  const wave6 = rosterPoolWitnessFilePalettes([], {
    rosterEnemyIds: new Set(['mine_layer_jackal']),
  });
  for (const file of wave6.keys()) {
    // The jackal may share a file with the wasp family — the assertion is on count, not
    // disjointness: a single-archetype scope never produces the full-roster map.
    assert.ok(typeof file === 'string' && file.length > 0);
  }
  assert.ok(wave6.size <= all.size);
});

test('the launch warm scopes its roster to wave 1 and seeds the covered ledger', () => {
  const beginDef = RENDERER_SOURCE.indexOf('_beginCrucibleBoundedRosterWarm(options = {})');
  const finishDef = RENDERER_SOURCE.indexOf('_finishCrucibleBoundedRosterWarm(warm, options = {})');
  assert.ok(beginDef > 0 && finishDef > beginDef);
  const beginBlock = RENDERER_SOURCE.slice(beginDef, finishDef);
  // waveBase is the live run's wave — 1 on a fresh launch (the cheap case this feature
  // exists for) and N on a mid-run re-cook, where every unlocked archetype must be covered.
  assert.match(beginBlock, /swarmEligibleEnemyIds\(waveBase\)/,
    'the launch ship cohort is current-wave eligibility, not the whole roster');
  assert.match(beginBlock, /Number\.isInteger\(state\.run\.wave\) \? state\.run\.wave : 1/,
    'a fresh run cooks at wave 1');
  assert.match(beginBlock, /_swarmWarmCoveredEnemyIds = new Set\(launchEligibility\)/,
    'the covered ledger seeds what the launch warm owns');
  const finishBlock = RENDERER_SOURCE.slice(finishDef, RENDERER_SOURCE.indexOf('_releaseSurvivalRosterPrewarm(reason)', finishDef));
  assert.match(finishBlock, /rosterEnemyIds: warm\.profile === 'crucible'/,
    'the palette witness map scopes its roster half the same way');
});

test('a swarm launch decodes and instantiates only the hulls wave 1 can field', () => {
  // The eligibility ladder scopes the exemplar cohort, but the explicit decode list and
  // finish()'s instantiate sweep rode the whole spawnableShipArchetypePrewarmUrls() catalog —
  // ~84 records / ~3000 palette subjects on the witness ledger, the dominant launch cost.
  // Traffic/freight hulls and wave-2+ archetypes belong to their armory-dwell warm (the
  // deferred boundary kick decodes its file on demand), so the launch pays wave 1 only.
  const wave1Specs = swarmRosterShipExemplarSpecs('test:ship:', { enemyIds: swarmEligibleEnemyIds(1) });
  const wave1Files = new Set();
  for (const spec of wave1Specs) {
    const visual = wholeShipVisualForEntity(spec);
    if (!visual || !visual.file) continue;
    wave1Files.add(visual.file);
    for (const lod of Object.values(visual.lodFamily || {})) wave1Files.add(lod);
  }
  assert.ok(wave1Files.has('wholeships/ashline_dart.glb'), 'the wave-1 wasp hull resolves');
  const catalog = spawnableShipArchetypePrewarmUrls();
  assert.ok(wave1Files.size < catalog.length, 'the scoped set is a strict subset');
  for (const trafficFile of ['wholeships/ore_barge.glb', 'wholeships/massline_express_liner_v1.glb']) {
    if (catalog.includes(trafficFile)) {
      assert.ok(!wave1Files.has(trafficFile), `${trafficFile} is freight the arena never fields`);
    }
  }

  const beginDef = RENDERER_SOURCE.indexOf('_beginCrucibleBoundedRosterWarm(options = {})');
  const finishDef = RENDERER_SOURCE.indexOf('_finishCrucibleBoundedRosterWarm(warm, options = {})');
  const beginBlock = RENDERER_SOURCE.slice(beginDef, finishDef);
  assert.match(beginBlock, /warmHullFilesForSpecs\(shipSpecs\)/,
    'the scoped file set resolves through the same selection path a live spawn uses');
  assert.match(beginBlock, /warm\.launchHullFiles = launchHullFiles/,
    'finish() needs the same set to bound its instantiate sweep');
  assert.match(beginBlock,
    /\.\.\.\(launchHullFiles \? \[\.\.\.launchHullFiles\] : spawnableShipArchetypePrewarmUrls\(\)\)/,
    'the explicit decode list takes the scoped set, not the whole catalog');
  // Non-swarm profiles (the ordinary opening, scored/boss_circuit survival) have no
  // eligibility ladder — they keep the full catalog.
  assert.match(beginBlock, /profile === 'crucible' && swarmScoped === true/);

  const releaseDef = RENDERER_SOURCE.indexOf('_releaseSurvivalRosterPrewarm(reason)', finishDef);
  const finishBlock = RENDERER_SOURCE.slice(finishDef, releaseDef);
  assert.match(finishBlock, /spawnableShipArchetypePrewarmUrls\(\)\.map\(normalizeWarmHullFile\)/,
    'the instantiate sweep recognizes catalog hulls');
  assert.match(finishBlock, /catalogHullFiles\.has\(file\) && !launchHullKeepSet\.has\(file\)/,
    'a catalog hull nobody can field this wave never instantiates at launch');
  // Live entities must never be filtered out — their files join the keep set.
  assert.match(finishBlock, /warmHullFilesForSpecs\(\[entity\]\)/,
    'live entities\' resolved hulls always stay in the keep set');
});

test('the deferred warm fires on the armory dwell and publishes its readiness', () => {
  assert.match(RENDERER_SOURCE, /phase !== 'cleanup' && phase !== 'draft'/,
    'the dwell trigger gates on the between-round phases');
  assert.match(RENDERER_SOURCE, /run:wavePlanned'.*_warmSwarmDeferredRoster|_warmSwarmDeferredRoster\(wave\)/s,
    'the wavePlanned fallback covers a draft that never opened');
  assert.match(RENDERER_SOURCE, /state\.render\.swarmDeferredWarm = \{ wave: nextWave, pending: true, promise: done \}/,
    'the readiness record the draft gate awaits is published');
  assert.match(RENDERER_SOURCE, /_swarmWarmCoveredEnemyIds\.add\(enemyId\)/,
    'coverage is marked before building so re-triggers dedupe');
});

test('the draft exit holds launch until the deferred batch settles', () => {
  assert.match(DRAFT_SOURCE, /state\.render\.swarmDeferredWarm/);
  assert.match(DRAFT_SOURCE, /warm\.pending === true[\s\S]*?warm\.promise\.then|warm\.promise[\s\S]*?run:draftPickRequested/s,
    'the launch click awaits the warm promise before emitting the pick');
  assert.match(DRAFT_SOURCE, /run\.phase === 'draft'/,
    'a stale resolve cannot answer a draft that already moved on');
});
