// No-GPU contract test for the combat-feel bench. It proves the catalog, production weapon rows,
// deterministic shot/beat timing, the production hitstun tumble law, and the capture-manifest
// schema. It does not prove the rendered picture; the Python driver + manifest validator do that
// on a machine with a browser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  ALL_EVIDENCE,
  CATALOG_VERSION,
  FIXED_ARENA,
  REQUIRED_SCENARIOS,
  SCENARIOS,
  STEP_SECONDS,
  catalogSummary,
  resolveScenarioTumbleLaw,
  scenarioById,
  validateCatalog,
  weaponForShot,
} from '../scripts/combat-feel/catalog.mjs';
import {
  beatIds,
  buildBeatTimes,
  buildShotPlan,
  estimateTumbleYaw,
  frameForTime,
  roundTime,
  shotPlanSummary,
} from '../scripts/combat-feel/beatMath.mjs';
import {
  CAPTURE_KIND,
  CAPTURE_SCHEMA_VERSION,
  sampleCaptureManifest,
  validateCaptureManifest,
  verifySourceFiles,
} from '../scripts/combat-feel/manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const clone = (value) => JSON.parse(JSON.stringify(value));

test('catalog is valid and exposes every required scenario', () => {
  assert.deepEqual(validateCatalog(), []);
  assert.equal(CATALOG_VERSION, 1);
  for (const id of REQUIRED_SCENARIOS) {
    assert.ok(scenarioById(id), `missing required scenario ${id}`);
  }
  assert.equal(new Set(SCENARIOS.map((scenario) => scenario.id)).size, SCENARIOS.length);
  for (const scenario of SCENARIOS) {
    assert.ok(scenario.durationSeconds > 0, `${scenario.id}: duration`);
    assert.ok(scenario.shots.length > 0, `${scenario.id}: shots`);
    assert.ok(scenario.weaponIds.length > 0, `${scenario.id}: weapons`);
    for (const weaponId of scenario.weaponIds) {
      assert.ok(weaponForShot({ weaponIds: [weaponId] }, 0), `${scenario.id}: ${weaponId} missing from WEAPONS`);
    }
    for (const evidence of scenario.requiredEvidence) {
      assert.ok(ALL_EVIDENCE.includes(evidence), `${scenario.id}: bad evidence ${evidence}`);
    }
  }
  assert.ok(FIXED_ARENA.ownerNoseOffsetWu > 0);
  assert.ok(FIXED_ARENA.targetX > FIXED_ARENA.ownerX);
});

test('fixed-seed shot and beat plans are deterministic and chronological', () => {
  for (const scenario of SCENARIOS) {
    const firstShots = buildShotPlan(scenario);
    const secondShots = buildShotPlan(scenario);
    assert.deepEqual(firstShots, secondShots, `${scenario.id}: shot plan is not deterministic`);
    for (const shot of firstShots) {
      assert.equal(shot.weaponId, weaponForShot(scenario, shot.index).id);
      assert.ok(shot.fireAt >= 0);
      assert.ok(shot.contactAt >= shot.fireAt);
      assert.ok(Number.isInteger(shot.flightFrames));
      if (!shot.beam) {
        assert.ok(shot.flightFrames >= 1, `${scenario.id}: a projectile needs a birth frame`);
        assert.ok(shot.travelSeconds > 0);
      } else {
        assert.equal(shot.flightFrames, 0);
        assert.equal(shot.travelSeconds, 0);
        assert.ok(shot.releaseAt > shot.contactAt);
      }
    }
    const firstBeats = buildBeatTimes(scenario);
    const secondBeats = buildBeatTimes(scenario);
    assert.deepEqual(firstBeats, secondBeats, `${scenario.id}: beat plan is not deterministic`);
    const ids = beatIds(firstBeats);
    for (const required of scenario.requiredEvidence) {
      assert.ok(ids.includes(required), `${scenario.id}: missing ${required} beat`);
    }
    let previous = -1;
    for (const beat of firstBeats) {
      assert.ok(beat.atS >= 0);
      assert.ok(beat.atS <= scenario.durationSeconds + 1e-6, `${scenario.id}: ${beat.beat} past duration`);
      assert.ok(beat.atS >= previous, `${scenario.id}: ${beat.beat} is out of order`);
      previous = beat.atS;
      assert.equal(beat.frame, frameForTime(beat.atS), `${scenario.id}: ${beat.beat} frame mismatch`);
      assert.equal(beat.atS, roundTime(beat.frame * STEP_SECONDS), `${scenario.id}: ${beat.beat} not on the clock`);
    }
    assert.deepEqual(shotPlanSummary(firstShots).map((shot) => shot.weaponId), scenario.shots.map((_, index) => weaponForShot(scenario, index).id));
  }
});

test('the production hitstun law separates a pulse plink from a concussion tumble', () => {
  const pulse = scenarioById('pulse-hull');
  const concussion = scenarioById('concussion-tumble');
  assert.equal(resolveScenarioTumbleLaw(pulse), null);
  const law = resolveScenarioTumbleLaw(concussion);
  assert.ok(law, 'concussion must produce a hitstun law');
  assert.ok(law.durationS > 0.5, `expected a visible tumble, got ${law.durationS}s`);
  assert.ok(law.entrySpin > 1, `expected a real entry spin, got ${law.entrySpin} rad/s`);
  assert.ok(law.u > 0.3, `expected a shove-class u, got ${law.u}`);
  const yaw = estimateTumbleYaw(law, law.durationS);
  assert.ok(Math.abs(yaw) > 0.2, `expected visible root yaw, got ${yaw} rad`);
  assert.ok(scenarioById('concussion-tumble').shots.length === 1);
  assert.equal(scenarioById('concussion-tumble').tumble.shove, true);
});

test('multi-shot and beam scenarios keep their authored contact order', () => {
  const shieldBreak = scenarioById('shield-break');
  const shieldPlan = buildShotPlan(shieldBreak);
  assert.equal(shieldPlan.length, 2);
  assert.equal(shieldPlan[0].contact, 'shield');
  assert.equal(shieldPlan[1].contact, 'hull');
  assert.ok(shieldPlan[1].fireAt > shieldPlan[0].fireAt);
  assert.ok(shieldPlan[1].contactAt > shieldPlan[0].contactAt);

  const beam = scenarioById('beam-cut');
  const beamPlan = buildShotPlan(beam);
  assert.equal(beamPlan.length, 1);
  assert.equal(beamPlan[0].beam, true);
  assert.equal(beamPlan[0].contactAt, beamPlan[0].fireAt);
  assert.ok(beamPlan[0].releaseAt > beamPlan[0].contactAt);
  const beats = buildBeatTimes(beam, beamPlan);
  const muzzle = beats.find((beat) => beat.beat === 'muzzle');
  const travel = beats.find((beat) => beat.beat === 'travel');
  const contact = beats.find((beat) => beat.beat === 'contact');
  assert.ok(muzzle.atS <= travel.atS);
  assert.ok(travel.atS <= contact.atS);
});

test('fixed seed changes the catalog seed but not the authored timing', () => {
  const first = catalogSummary(17);
  const second = catalogSummary(17);
  const third = catalogSummary(29);
  assert.deepEqual(first, second);
  assert.equal(first.seed, 17);
  assert.equal(third.seed, 29);
  assert.deepEqual(first.scenarios, third.scenarios);
  assert.deepEqual(first.requiredScenarios, REQUIRED_SCENARIOS);
  assert.equal(first.errors.length, 0);
});

test('capture manifest schema accepts a complete capture', () => {
  for (const id of REQUIRED_SCENARIOS) {
    const manifest = sampleCaptureManifest({ seed: 17, scenarioId: id });
    const result = validateCaptureManifest(manifest);
    assert.deepEqual(result.errors, [], `${id}: ${result.errors.join('; ')}`);
    assert.equal(result.ok, true);
  }
  assert.equal(sampleCaptureManifest().kind, CAPTURE_KIND);
  assert.equal(sampleCaptureManifest().schemaVersion, CAPTURE_SCHEMA_VERSION);
});

test('capture manifest schema rejects a broken contract', () => {
  const valid = sampleCaptureManifest();
  const reject = (mutate, matcher) => {
    const broken = clone(valid);
    mutate(broken);
    const result = validateCaptureManifest(broken);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => matcher.test(error)), `expected ${matcher}; got ${result.errors.join(' | ')}`);
  };

  reject((manifest) => { manifest.schemaVersion = 99; }, /schemaVersion/);
  reject((manifest) => { manifest.kind = 'other'; }, /kind/);
  reject((manifest) => { manifest.run.seed = -1; }, /run\.seed/);
  reject((manifest) => { manifest.run.scenarios.push('shield-break'); }, /requested scenario shield-break/);
  reject((manifest) => {
    manifest.scenarios['pulse-hull'].beats = manifest.scenarios['pulse-hull'].beats.filter((beat) => beat.beat !== 'contact');
  }, /missing required contact beat/);
  reject((manifest) => { manifest.scenarios['pulse-hull'].evidence.contact = false; }, /required evidence was not observed/);
  reject((manifest) => { manifest.scenarios['pulse-hull'].checks[0].ok = false; }, /cannot carry a failed check/);
  reject((manifest) => {
    manifest.scenarios['pulse-hull'].errors.push({ kind: 'capture', message: 'boom' });
  }, /cannot carry errors/);
  reject((manifest) => { manifest.outputs.manifest = 'C:/absolute/manifest.json'; }, /must not be an absolute Windows path/);
  reject((manifest) => { manifest.outputs.review = '../escape.html'; }, /must not escape the output directory/);
  reject((manifest) => {
    const beats = manifest.scenarios['pulse-hull'].beats;
    beats[1].atS = beats[0].atS - STEP_SECONDS;
    beats[1].frame = frameForTime(beats[1].atS);
  }, /chronological/);
  reject((manifest) => { manifest.errors.push({ kind: 'driver', message: 'boom' }); }, /capture recorded errors/);
});

test('source freshness is evidence: a stale capture is rejected by recomputation', () => {
  const source = 'package.json';
  const hash = createHash('sha256').update(readFileSync(resolve(ROOT, source))).digest('hex');
  assert.deepEqual(verifySourceFiles({ run: { sourceFiles: { [source]: hash } } }, ROOT), [],
    'a capture made from the current tree verifies');
  const stale = verifySourceFiles({ run: { sourceFiles: { [source]: '0'.repeat(64) } } }, ROOT);
  assert.equal(stale.length, 1);
  assert.match(stale[0], /stale/);
  assert.ok(verifySourceFiles({ run: { sourceFiles: {} } }, ROOT).length > 0,
    'a manifest without recorded sources cannot prove freshness');
});

test('the bench files mount the production owners, not a second VFX renderer', () => {
  const benchSource = readFileSync(resolve(ROOT, 'scripts/combat-feel/bench.js'), 'utf8');
  const sequenceSource = readFileSync(resolve(ROOT, 'scripts/combat-feel/sequence.js'), 'utf8');
  const importsOf = (source) => {
    const matches = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)];
    return matches.map((match) => match[1]);
  };
  const benchImports = importsOf(benchSource);
  const sequenceImports = importsOf(sequenceSource);
  for (const required of [
    '../../src/render/weapons/presenter.js',
    '../../src/render/combat/persistentBeams.js',
    '../../src/render/shipMicroMotion.js',
    '../../src/render/shipPitchPresentation.js',
    '../../src/render/bloom.js',
    '../../src/render/assetLoader.js',
    '../../src/render/weapons/shieldBubblePresentation.js',
    '../../src/render/ships/shipKit.js',
  ]) {
    assert.ok(
      benchImports.includes(required) || sequenceImports.includes(required),
      `bench must import production owner ${required}`,
    );
  }
  assert.ok(benchImports.some((specifier) => specifier === './sequence.js'));
  assert.ok(sequenceSource.includes('new WeaponVfxPresenter'));
  assert.ok(sequenceSource.includes('new PersistentCombatBeamPool'));
  assert.ok(!benchImports.some((specifier) => /vfx-gameplay-demo/.test(specifier)));
});
