// test/fun-critic.test.mjs — Unit tests for the critic fun loop harness.
//
// Vision authority: design/program/FUN_CONVERGENCE_LOOP.md section 3.3.
// "A vision-capable model that did not make the change reads the frame strips and the metrics
// and answers ten yes/no questions, each with the frame index that proves the answer.
// Prose without a frame is not a verdict."

import test from 'node:test';
import { resolve, join } from 'node:path';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

import {
  RUBRIC_QUESTIONS,
  QUESTION_7_INVERTED,
  PASS_THRESHOLD,
  computePassCount,
  isPass,
} from '../scripts/lib/critic/rubric.mjs';

import {
  extractBalancedJson,
} from '../scripts/lib/critic/jsonExtract.mjs';

import {
  CONTENT_ANSWER_PATTERNS,
  matchesContentPatterns,
  validateVerdict,
  validateStripAdmission,
  CANONICAL_NORMAL_SPEED_FLOOR,
} from '../scripts/lib/critic/validation.mjs';

import {
  selectCriticFrames,
} from '../scripts/lib/critic/frameSelect.mjs';

import {
  buildCriticPrompt,
  buildFrameListText,
  buildManifestFactsText,
  buildCameraFactsText,
  buildMomentsListText,
} from '../scripts/lib/critic/prompt.mjs';

import {
  compareCritics,
} from '../scripts/lib/critic/multiCritic.mjs';

/**
 * Creates a valid fake manifest with non-consecutive frame indices.
 */
function createFakeManifest(indices = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18], overrides = {}) {
  return {
    schema: 'spaceface.frameStripManifest.v2',
    bench: 'crucible',
    scenarioId: 'swarm_idle',
    scenarioLabel: 'Crucible swarm, hands off the stick',
    loadoutId: 'physics_toolkit',
    arenaId: 'helios_core',
    ruleset: 'swarm',
    seed: 4242,
    runKind: 'survival',
    camera: 'shipping_chase',
    cameraMeasured: {
      available: true,
      heightWU: 199.57,
      fovDeg: 50,
      aspect: 1.7778,
      visibleDepthWU: 186.12,
      controller: 'cameraCtrl',
    },
    hudText: 'off',
    hudTextVerified: true,
    hullDrawn: {
      medianPartsPerFrame: 3,
      framesWithHull: indices.length,
      framesTotal: indices.length,
      sampleCount: indices.length,
      inspectedSampleCount: indices.length,
    },
    normalSpeed: true,
    realtimeFraction: 0.85,
    normalSpeedFloor: 0.60,
    contactSheet: 'C:/fake/strip/dir/contact-sheet.png',
    receiptDir: 'C:/fake/strip/dir',
    sourceIdentity: {
      gitHead: '4691400baf96ffa5abb7f3df9ab9e1c83c55221a',
      gitTree: 'tree12345',
      productionDirty: false,
      productionDiffHash: '0'.repeat(64),
    },
    harnessDigest: 'sha256-critic-harness-digest-test-0123456789abcdef',
    frameFormat: 'jpeg',
    sampleHz: 8,
    baselineFps: 4,
    momentFps: 8,
    simHz: 60,
    runStartTick: 14,
    tickBasis: 'run-relative',
    requestedDurationS: 22,
    capturedSpanS: 12.0,
    stoppedBecause: 'duration reached',
    framesCount: indices.length,
    stripDir: 'C:/fake/strip/dir',
    moments: [
      {
        type: 'physics:impact',
        tick: 40,
        simTime: 1.5,
        magnitude: 12.4,
        playerInvolved: true,
      },
    ],
    frames: indices.map((idx, i) => ({
      index: idx,
      file: `frame_${String(idx).padStart(3, '0')}.jpg`,
      tick: i * 10,
      simTime: Number((i * 0.25).toFixed(3)),
      phase: 'active',
      wave: 1,
      hostilesAlive: 8,
      playerSpeed: 110.5,
      nearMoment: i === 6,
    })),
    ...overrides,
  };
}

/**
 * Creates valid 9 answers for the rubric using a given valid frameIndex.
 */
function createValidAnswers(frameIndex = 4, overrides = {}) {
  const answers = [];
  for (let q = 1; q <= 9; q++) {
    const rq = RUBRIC_QUESTIONS.find((item) => item.q === q);
    const ansVal = overrides[q] !== undefined ? overrides[q] : rq.goodAnswer;
    answers.push({
      q,
      question: rq.question,
      answer: ansVal,
      frameIndex,
      note: `Proof seen at frame ${frameIndex}`,
    });
  }
  return answers;
}

/**
 * Creates a valid fundamental object.
 */
function createValidFundamental(frameIndex = 4, overrides = {}) {
  return {
    rule: 'the velocity rule in the physics layer discards given momentum',
    file: 'src/physics/sg02DynamicBodyOwner.js',
    does: 'truncates NPC velocity to 1.15x maxSpeed each tick',
    breaksSentence: 'Light ships are ammunition.',
    frameIndex,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Frame index validation against manifest real indices
// ─────────────────────────────────────────────────────────────────────────────
test('verdict with frameIndex not in the strip is rejected, while a valid frameIndex is accepted', () => {
  const manifest = createFakeManifest([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);

  // Frame index 3 is not in the strip (indices are 0, 2, 4, ...)
  const invalidCandidate = {
    answers: createValidAnswers(3),
    fundamental: createValidFundamental(4),
  };
  const rejectedVerdict = validateVerdict(invalidCandidate, manifest);

  assert.equal(rejectedVerdict.rejected, true, 'Prose without a frame is not a verdict.');
  assert.ok(
    rejectedVerdict.rejectReasons.some((r) => r.includes('frameIndex 3') && r.includes('outside')),
    'Reject reasons must explicitly call out the out-of-strip frameIndex 3',
  );

  // Frame index 4 IS in the strip
  const validCandidate = {
    answers: createValidAnswers(4),
    fundamental: createValidFundamental(4),
  };
  const acceptedVerdict = validateVerdict(validCandidate, manifest);

  assert.equal(acceptedVerdict.rejected, false, 'Valid frameIndex 4 must be accepted without rejection');
  assert.equal(acceptedVerdict.rejectReasons.length, 0);
});

test('fundamental with frameIndex outside strip is rejected', () => {
  const manifest = createFakeManifest([0, 2, 4, 6]);

  const candidate = {
    answers: createValidAnswers(2),
    fundamental: createValidFundamental(3), // 3 is not in [0, 2, 4, 6]
  };
  const verdict = validateVerdict(candidate, manifest);

  assert.equal(verdict.rejected, true, 'Fundamental with frameIndex not in strip must be rejected');
  assert.ok(
    verdict.rejectReasons.some((r) => r.includes('fundamental references frameIndex 3')),
    'Reject reasons must note fundamental frameIndex outside strip',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: CONTENT_ANSWER_PATTERNS asserts rule change, never more content
// ─────────────────────────────────────────────────────────────────────────────
test('CONTENT_ANSWER_PATTERNS rejects content additions and accepts rule adjustments', () => {
  const forbiddenFundamental = 'add more enemies to the arena';
  const allowedFundamental = 'the velocity rule in the physics layer discards given momentum';

  const matchesForbidden = CONTENT_ANSWER_PATTERNS.some((pattern) => pattern.test(forbiddenFundamental));
  assert.equal(matchesForbidden, true, 'Forbidden phrase "add more enemies to the arena" must match CONTENT_ANSWER_PATTERNS');

  const matchesAllowed = CONTENT_ANSWER_PATTERNS.some((pattern) => pattern.test(allowedFundamental));
  assert.equal(matchesAllowed, false, 'Rule proposal "the velocity rule in the physics layer discards given momentum" must not match CONTENT_ANSWER_PATTERNS');

  // Verify in full verdict validation
  const manifest = createFakeManifest();

  const badCandidate = {
    answers: createValidAnswers(4),
    fundamental: createValidFundamental(4, {
      rule: 'add more enemies to the arena to make it interesting',
    }),
  };
  const badVerdict = validateVerdict(badCandidate, manifest);
  assert.equal(badVerdict.rejected, true);
  assert.ok(badVerdict.rejectReasons.some((r) => r.includes('names content')));

  const goodCandidate = {
    answers: createValidAnswers(4),
    fundamental: createValidFundamental(4, {
      rule: 'the velocity rule in the physics layer discards given momentum',
    }),
  };
  const goodVerdict = validateVerdict(goodCandidate, manifest);
  assert.equal(goodVerdict.rejected, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Balanced-brace JSON extraction
// ─────────────────────────────────────────────────────────────────────────────
test('extractBalancedJson pulls result out of text wrapped in prose and markdown code fences', () => {
  const wrappedText = 'Sure! Here you go:\n```json\n{\n  "answers": [],\n  "fundamental": "rule_here"\n}\n```\nHope that helps';
  const extracted = extractBalancedJson(wrappedText);

  assert.ok(extracted, 'Should extract JSON object');
  assert.deepEqual(extracted.answers, []);
  assert.equal(extracted.fundamental, 'rule_here');
});

test('extractBalancedJson handles nested braces and braces inside string values', () => {
  const complexText = `
    Some preamble from LLM...
    {
      "key": "value with {braces} and \\"escaped quotes\\"",
      "nested": {
        "deep": true,
        "count": 42
      }
    }
    Trailing explanation.
  `;
  const parsed = extractBalancedJson(complexText);
  assert.equal(parsed.key, 'value with {braces} and "escaped quotes"');
  assert.equal(parsed.nested.deep, true);
  assert.equal(parsed.nested.count, 42);
});

test('extractBalancedJson throws meaningful error when no valid JSON is present', () => {
  assert.throws(
    () => extractBalancedJson('This text contains no braces at all.'),
    /No JSON object found/,
  );
  assert.throws(
    () => extractBalancedJson('{ unclosed json object'),
    /Failed to extract valid balanced JSON/,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Question 7 inversion in passCount
// ─────────────────────────────────────────────────────────────────────────────
test('passCount counts question 7 inverted: "no" is a point, "yes" is not', () => {
  assert.equal(QUESTION_7_INVERTED, 7);

  // All 9 matching their goodAnswers: Q7 is 'no', others 'yes'
  const allGoodAnswers = createValidAnswers(4);
  assert.equal(computePassCount(allGoodAnswers), 9);
  assert.equal(isPass(9), true);

  // If Q7 is answered "yes", it should NOT get a point (passCount drops to 8)
  const q7YesAnswers = createValidAnswers(4, { 7: 'yes' });
  assert.equal(computePassCount(q7YesAnswers), 8);

  // If Q7 is answered "no", it DOES get a point
  const q7NoAnswers = createValidAnswers(4, { 7: 'no' });
  assert.equal(computePassCount(q7NoAnswers), 9);

  // Edge case: all "no" answers -> only Q7 gets a point
  const allNoAnswers = [];
  for (let q = 1; q <= 9; q++) {
    allNoAnswers.push({ q, answer: 'no', frameIndex: 4 });
  }
  assert.equal(computePassCount(allNoAnswers), 1, 'Only question 7 should earn a point when all answers are "no"');

  // Verify pass threshold (>= 7)
  assert.equal(isPass(7), true);
  assert.equal(isPass(6), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Response with eight answers is rejected
// ─────────────────────────────────────────────────────────────────────────────
test('a response with eight answers is rejected', () => {
  const manifest = createFakeManifest();
  const nineAnswers = createValidAnswers(4);
  const eightAnswers = nineAnswers.slice(0, 8); // remove question 9

  const candidate = {
    answers: eightAnswers,
    fundamental: createValidFundamental(4),
  };

  const verdict = validateVerdict(candidate, manifest);
  assert.equal(verdict.rejected, true, 'Verdict with 8 answers must be rejected');
  assert.ok(
    verdict.rejectReasons.some((r) => r.includes('Expected exactly 9 answers')),
    'Reject reasons must state exactly 9 answers were expected',
  );
  assert.ok(
    verdict.rejectReasons.some((r) => r.includes('Missing answer for question q=9')),
    'Reject reasons must state missing answer for q=9',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Answer format validation (must be 'yes' or 'no') and duplicate q check
// ─────────────────────────────────────────────────────────────────────────────
test('non-yes/no answers and duplicate questions are rejected', () => {
  const manifest = createFakeManifest();

  // Answer is 'maybe'
  const badAnswerCandidate = {
    answers: createValidAnswers(4, { 1: 'maybe' }),
    fundamental: createValidFundamental(4),
  };
  const v1 = validateVerdict(badAnswerCandidate, manifest);
  assert.equal(v1.rejected, true);
  assert.ok(v1.rejectReasons.some((r) => r.includes("must be exactly 'yes' or 'no'")));

  // Duplicate question q=2
  const duplicateAnswers = createValidAnswers(4);
  duplicateAnswers[8] = { q: 2, answer: 'yes', frameIndex: 4 }; // replace q9 with another q2
  const dupCandidate = {
    answers: duplicateAnswers,
    fundamental: createValidFundamental(4),
  };
  const v2 = validateVerdict(dupCandidate, manifest);
  assert.equal(v2.rejected, true);
  assert.ok(v2.rejectReasons.some((r) => r.includes('Duplicate answer for question q=2')));
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Prompt generation adheres to contract
// ─────────────────────────────────────────────────────────────────────────────
test('prompt generator includes frames, manifest facts, hard content instruction, and no headless bars', () => {
  const manifest = createFakeManifest();
  const prompt = buildCriticPrompt(manifest);

  // Check required facts
  assert.ok(prompt.includes('Crucible swarm, hands off the stick'), 'Scenario label must be in prompt');
  assert.ok(prompt.includes('physics_toolkit'), 'Loadout must be in prompt');
  assert.ok(prompt.includes('helios_core'), 'Arena must be in prompt');
  assert.ok(prompt.includes('4242'), 'Seed must be in prompt');
  assert.ok(prompt.includes('shipping_chase'), 'Camera must be in prompt');
  assert.ok(prompt.includes('199.57 WU'), 'Camera height must be in prompt');

  // Check frame paths and marker
  // The prompt resolves each frame to an absolute path, so on Windows the separators are
  // backslashes. Assert on the resolved form, not on the literal we happened to type.
  assert.ok(prompt.includes(resolve('C:/fake/strip/dir', manifest.frames[0].file)), 'Strip directory path must be present');
  assert.ok(prompt.includes('[NEAR MOMENT]'), 'Near moment marker must be attached to frame near moment');

  // Check hard instruction
  assert.ok(
    prompt.includes('Never answer with content. Do not propose more enemies, ships, weapons, missions, particles, camera shake, or more health.'),
    'Prompt must include hard anti-content instruction verbatim',
  );

  // Check vision authority sentence
  assert.ok(prompt.includes('Prose without a frame is not a verdict.'), 'Vision sentence must be in prompt');

  // Verify all 10 questions are present verbatim
  for (const rq of RUBRIC_QUESTIONS) {
    assert.ok(prompt.includes(rq.question), `Rubric question ${rq.q} must be present verbatim in prompt`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Multi-critic agreement comparison
// ─────────────────────────────────────────────────────────────────────────────
test('compareCritics reports agreement on matching questions and isolates disagreement on fundamentals', () => {
  const run1 = {
    model: 'agy',
    result: {
      answers: createValidAnswers(4, { 3: 'no' }),
      fundamental: createValidFundamental(4, { rule: 'rule A in physics' }),
    },
  };

  const run2 = {
    model: 'kimi',
    result: {
      answers: createValidAnswers(4, { 3: 'yes' }), // disagrees on Q3
      fundamental: createValidFundamental(4, { rule: 'rule B in propulsion' }),
    },
  };

  const comparison = compareCritics([run1, run2]);

  assert.equal(comparison.agreedQuestions.length, 8);
  assert.equal(comparison.disagreedQuestions.length, 1);
  assert.equal(comparison.disagreedQuestions[0].q, 3);
  assert.equal(comparison.fundamentals.length, 2);

  assert.ok(comparison.summaryText.includes('Total Agreement: 8/9 questions agreed.'));
  assert.ok(comparison.summaryText.includes('Q3: DISAGREE'));
  assert.ok(comparison.summaryText.includes('rule A in physics'));
  assert.ok(comparison.summaryText.includes('rule B in propulsion'));
});


// ---------------------------------------------------------------------------------------------
// The frames the critic is SHOWN. Added 2026-09-04 after the harness was found handing a vision
// model all 403 absolute paths in a strip: a prompt no model reads to the end, and an invitation
// to answer from the frame list's numbers instead of from the pictures.
// ---------------------------------------------------------------------------------------------

function stripOf(count, moments = []) {
  const frames = [];
  for (let i = 0; i < count; i++) {
    frames.push({
      index: i,
      file: `frame_${String(i).padStart(3, '0')}.png`,
      tick: i * 8,
      simTime: Number((i * 0.133).toFixed(3)),
      hostilesAlive: 10,
      playerSpeed: 3,
      hullPartsDrawn: 6,
      nearMoment: false,
    });
  }
  return {
    schema: 'spaceface.frameStripManifest.v2',
    bench: 'crucible',
    scenarioId: 'swarm_piloted',
    seed: 4242,
    stripDir: 'C:/strip',
    framesCount: count,
    frames,
    moments,
  };
}

test('the critic is shown a bounded set, and the biggest hit the ship was in arrives as before/at/after', () => {
  const manifest = stripOf(400, [
    { type: 'physics:impact', tick: 600, simTime: 20.0, playerInvolved: true, magnitude: 900 },
    { type: 'physics:impact', tick: 100, simTime: 3.0, playerInvolved: false, magnitude: 4000 },
  ]);
  const { frames, reason } = selectCriticFrames(manifest, { maxFrames: 16 });

  assert.equal(frames.length, 16, 'a vision model is shown a set it can actually open, not the whole strip');
  assert.equal(frames[0].index, 0, 'the strip starts where it starts');
  assert.equal(frames[frames.length - 1].index, 399, 'and ends where it ends');

  const times = frames.map((f) => f.simTime);
  const near = (t) => times.some((x) => Math.abs(x - t) < 0.25);
  assert.ok(near(20.0), 'the moment the ship was in must be shown');
  assert.ok(near(19.85), 'and the instant before it, or "did the hit get an answer" cannot be asked');
  assert.ok(near(20.45), 'and the half-second after it, which is where the answer would be');
  assert.ok(/ship was in/.test(reason), `the selection says why it chose these: ${reason}`);

  const indices = frames.map((f) => f.index);
  assert.equal(new Set(indices).size, indices.length, 'no frame is shown twice');
  assert.deepEqual(indices.slice().sort((a, b) => a - b), indices, 'frames are shown in the order they happened');
});

test('a verdict may cite only a frame it was shown', () => {
  const manifest = stripOf(40);
  const shown = selectCriticFrames(manifest, { maxFrames: 8 }).frames;
  const unshown = manifest.frames.find((f) => !shown.some((x) => x.index === f.index));

  const answers = [];
  for (let q = 1; q <= 9; q++) {
    answers.push({ q, answer: q === 7 ? 'no' : 'yes', frameIndex: shown[0].index, note: 'n' });
  }
  const fundamental = {
    rule: 'the governor brake bleeds given speed',
    file: 'the flight rules',
    does: 'eats momentum the player earned',
    breaksSentence: 'physics-earned speed does not get eaten by the brakes',
    frameIndex: shown[1].index,
  };

  const good = validateVerdict({ answers, fundamental }, manifest, { shownFrames: shown });
  assert.equal(good.rejected, false, 'citing a shown frame is a verdict');
  assert.equal(good.strip.framesShown, shown.length, 'the verdict records how many frames were looked at');

  const bad = validateVerdict(
    { answers: answers.map((a, i) => (i === 0 ? { ...a, frameIndex: unshown.index } : a)), fundamental },
    manifest,
    { shownFrames: shown },
  );
  assert.equal(bad.rejected, true, 'a frame index the critic never opened is a hallucination, not evidence');
  assert.ok(bad.rejectReasons.some((r) => r.includes(`frameIndex ${unshown.index}`)));
});

test('naming a lazy answer is the critic\'s job; proposing one is not', () => {
  const manifest = stripOf(20);
  const shown = manifest.frames;
  const answers = [];
  for (let q = 1; q <= 9; q++) answers.push({ q, answer: q === 7 ? 'no' : 'yes', frameIndex: 2, note: 'n' });

  // Audit finding A11 in the critic's own words. This MUST survive: it is the finding.
  const diagnosis = validateVerdict({
    answers,
    fundamental: {
      rule: 'the impact response rule',
      file: 'the collision rules',
      does: 'answers every hit with the same particle burst and no hitstop, so a heavy hit and a graze look identical',
      breaksSentence: 'Impacts should answer instantly.',
      frameIndex: 4,
    },
  }, manifest, { shownFrames: shown });
  assert.equal(diagnosis.rejected, false,
    'naming the particle burst as the lazy answer is audit finding A11, not a content proposal');

  // The same noun, proposed as the fix. This must be refused.
  const proposal = validateVerdict({
    answers,
    fundamental: {
      rule: 'the impact response rule',
      file: 'the collision rules',
      does: 'is too quiet; add more particles and camera shake on every hit',
      breaksSentence: 'Impacts should answer instantly.',
      frameIndex: 4,
    },
  }, manifest, { shownFrames: shown });
  assert.equal(proposal.rejected, true, 'the critic proposes a rule change, never more stuff');
  assert.ok(proposal.rejectReasons.some((r) => r.includes('names content')));
});

test('validateStripAdmission fails closed on bad schema, slow-motion, missing camera, unverified HUD, and missing hull', () => {
  const base = createFakeManifest([0, 2, 4]);

  const check = (patch, reasonPattern) => {
    const res = validateStripAdmission({ ...base, ...patch }, { checkFiles: false });
    assert.equal(res.ok, false, `Expected failure for patch ${JSON.stringify(patch)}`);
    assert.match(res.reason, reasonPattern);
  };

  // Schema mismatch
  check({ schema: 'spaceface.frameStripManifest.v1' }, /expected 'spaceface\.frameStripManifest\.v2'/);

  // Slow motion (normalSpeed false or missing)
  check({ normalSpeed: false }, /normalSpeed|slow-motion/i);
  check({ normalSpeed: undefined }, /normalSpeed|slow-motion/i);

  // Missing shipping camera
  check({ camera: 'chase_orbit' }, /shipping-camera/i);
  check({ cameraMeasured: { available: false, heightWU: 0 } }, /shipping-camera/i);

  // Unverified HUD text
  check({ hudText: 'on' }, /HUD/i);
  check({ hudTextVerified: false }, /HUD/i);

  // Missing or empty drawn hull
  check({ hullDrawn: null }, /drawn-hull/i);
  check({ hullDrawn: { framesTotal: 3, medianPartsPerFrame: 0, framesWithHull: 0 } }, /drawn-hull/i);

  // Missing sourceIdentity or harnessDigest
  check({ sourceIdentity: null }, /sourceIdentity/i);
  check({ harnessDigest: '' }, /harnessDigest/i);

  // Valid manifest passes with checkFiles: false
  const validRes = validateStripAdmission(base, { checkFiles: false });
  assert.equal(validRes.ok, true);
});

test('validateStripAdmission checks exact disk frames, rejecting missing frames, stale unlisted frames, or format mismatch', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sf-strip-test-'));
  try {
    const indices = [0, 2, 4];
    const contactSheetPath = join(tmp, 'contact-sheet.png');
    await writeFile(contactSheetPath, 'fake-contact-png-bytes', 'utf8');
    const manifest = createFakeManifest(indices, {
      stripDir: tmp,
      receiptDir: tmp,
      frameFormat: 'jpeg',
      contactSheet: contactSheetPath,
      frames: indices.map((idx) => ({
        index: idx,
        file: `frame_${String(idx).padStart(3, '0')}.jpg`,
      })),
    });

    // Case 1: missing listed frames
    const res1 = validateStripAdmission(manifest, { stripDir: tmp, checkFiles: true });
    assert.equal(res1.ok, false);
    assert.match(res1.reason, /Nonexistent manifest-listed frame file/);

    // Create the expected frames
    for (const f of manifest.frames) {
      await writeFile(join(tmp, f.file), 'fake-jpg-data', 'utf8');
    }

    // Now all listed frames exist -> passes
    const resOk = validateStripAdmission(manifest, { stripDir: tmp, checkFiles: true });
    assert.equal(resOk.ok, true);

    // Case 2: stale unlisted frame in directory
    const staleFile = join(tmp, 'frame_001.jpg');
    await writeFile(staleFile, 'stale-data', 'utf8');
    const res2 = validateStripAdmission(manifest, { stripDir: tmp, checkFiles: true });
    assert.equal(res2.ok, false);
    assert.match(res2.reason, /Stale or unlisted frame file/);
    await rm(staleFile);

    // Case 3: format mismatch (e.g. stale .png in a jpeg strip)
    const pngFile = join(tmp, 'frame_000.png');
    await writeFile(pngFile, 'png-data', 'utf8');
    const res3 = validateStripAdmission(manifest, { stripDir: tmp, checkFiles: true });
    assert.equal(res3.ok, false);
    assert.match(res3.reason, /Stale or unlisted frame file|format mismatch/);
    await rm(pngFile);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('validateVerdict carries sourceIdentity, harnessDigest, frameFormat, contactSheet, and exact frames', () => {
  const manifest = createFakeManifest([0, 2, 4]);
  manifest.contactSheet = 'C:/fake/strip/dir/contact_sheet.jpg';

  const candidate = {
    answers: createValidAnswers(2),
    fundamental: createValidFundamental(2),
  };

  const verdict = validateVerdict(candidate, manifest);
  assert.equal(verdict.rejected, false);
  assert.equal(verdict.strip.frameFormat, 'jpeg');
  assert.equal(verdict.strip.contactSheet, 'C:/fake/strip/dir/contact_sheet.jpg');
  assert.deepEqual(verdict.strip.sourceIdentity, manifest.sourceIdentity);
  assert.equal(verdict.strip.harnessDigest, manifest.harnessDigest);
  assert.equal(verdict.strip.frames.length, 3);
  assert.equal(verdict.strip.frames[0].file, 'frame_000.jpg');
  assert.equal(verdict.strip.receiptDir, manifest.receiptDir);
});

test('validateStripAdmission refuses slow-but-true, lowered floor, dirty alias, and incomplete camera', () => {
  const base = createFakeManifest([0, 2, 4]);
  assert.equal(CANONICAL_NORMAL_SPEED_FLOOR, 0.6);
  assert.equal(validateStripAdmission({
    ...base,
    normalSpeed: true,
    realtimeFraction: 0.26,
  }, { checkFiles: false }).ok, false);

  assert.equal(validateStripAdmission({
    ...base,
    normalSpeed: true,
    normalSpeedFloor: 0.20,
    realtimeFraction: 0.26,
  }, { checkFiles: false }).ok, false);

  const dirtyOnly = createFakeManifest([0, 2, 4], {
    sourceIdentity: {
      gitHead: '4691400baf96ffa5abb7f3df9ab9e1c83c55221a',
      gitTree: 'tree12345',
      dirty: false,
      productionDiffHash: '0'.repeat(64),
    },
  });
  delete dirtyOnly.sourceIdentity.productionDirty;
  dirtyOnly.sourceIdentity.dirty = false;
  assert.match(validateStripAdmission(dirtyOnly, { checkFiles: false }).reason, /sourceIdentity/);

  assert.match(validateStripAdmission({
    ...base,
    cameraMeasured: { available: true, heightWU: 180, fovDeg: 50, aspect: 1.78 },
  }, { checkFiles: false }).reason, /shipping-camera/);

  assert.match(validateStripAdmission({
    ...base,
    hudTextLeftovers: [{ text: 'CREDITS 12' }],
  }, { checkFiles: false }).reason, /leftover/i);

  assert.match(validateStripAdmission({
    ...base,
    framesCount: 99,
  }, { checkFiles: false }).reason, /Frame count mismatch/);

  const dup = createFakeManifest([0, 2, 4]);
  dup.frames[1].index = 0;
  assert.match(validateStripAdmission(dup, { checkFiles: false }).reason, /Duplicate frame index/);

  assert.match(validateStripAdmission({
    ...base,
    harnessDigest: 'stale-digest',
  }, { checkFiles: false, expectedHarnessDigest: 'live-digest' }).reason, /Mismatched harnessDigest/);
});

test('validateStripAdmission refuses empty, wrong-format, duplicate, and path-escaped frames', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sf-strip-adv-'));
  try {
    const indices = [0, 1];
    await writeFile(join(tmp, 'contact-sheet.png'), 'png-bytes', 'utf8');
    const manifest = createFakeManifest(indices, {
      stripDir: tmp,
      receiptDir: tmp,
      contactSheet: join(tmp, 'contact-sheet.png'),
    });

    await writeFile(join(tmp, 'frame_000.jpg'), '', 'utf8');
    await writeFile(join(tmp, 'frame_001.jpg'), 'bytes', 'utf8');
    assert.match(validateStripAdmission(manifest, { stripDir: tmp }).reason, /empty \(0 bytes\)/);

    await writeFile(join(tmp, 'frame_000.jpg'), 'bytes', 'utf8');
    const pngDecl = createFakeManifest(indices, {
      stripDir: tmp,
      receiptDir: tmp,
      contactSheet: join(tmp, 'contact-sheet.png'),
      frameFormat: 'png',
      frames: indices.map((idx) => ({ index: idx, file: `frame_${String(idx).padStart(3, '0')}.png` })),
    });
    assert.match(validateStripAdmission(pngDecl, { stripDir: tmp, checkFiles: false }).reason, /frameFormat/);

    const escaped = createFakeManifest(indices, {
      stripDir: tmp,
      receiptDir: tmp,
      contactSheet: join(tmp, 'contact-sheet.png'),
      frames: [
        { index: 0, file: 'frame_000.jpg' },
        { index: 1, file: '../outside.jpg' },
      ],
    });
    escaped.framesCount = 2;
    escaped.hullDrawn.framesTotal = 2;
    assert.match(validateStripAdmission(escaped, { stripDir: tmp, checkFiles: false }).reason, /unsafe|path-escaping/);

    const dupFile = createFakeManifest(indices, {
      stripDir: tmp,
      receiptDir: tmp,
      contactSheet: join(tmp, 'contact-sheet.png'),
      frames: [
        { index: 0, file: 'frame_000.jpg' },
        { index: 1, file: 'frame_000.jpg' },
      ],
    });
    assert.match(validateStripAdmission(dupFile, { stripDir: tmp, checkFiles: false }).reason, /Duplicate frame filename/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('validateStripAdmission keeps JPEG frames in stripDir and PNG contact sheet in receiptDir', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sf-strip-split-'));
  try {
    const targetDir = join(tmp, 'target');
    const receiptDir = join(tmp, 'receipt');
    await mkdir(targetDir);
    await mkdir(receiptDir);
    const indices = [0, 1];
    await writeFile(join(targetDir, 'frame_000.jpg'), 'jpeg-bytes', 'utf8');
    await writeFile(join(targetDir, 'frame_001.jpg'), 'jpeg-bytes', 'utf8');
    await writeFile(join(receiptDir, 'contact-sheet.png'), 'png-bytes', 'utf8');
    const manifest = createFakeManifest(indices, {
      stripDir: targetDir,
      receiptDir,
      contactSheet: join(receiptDir, 'contact-sheet.png'),
    });
    const ok = validateStripAdmission(manifest, { stripDir: targetDir, receiptDir });
    assert.equal(ok.ok, true, ok.reason);

    const escapedSheet = createFakeManifest(indices, {
      stripDir: targetDir,
      receiptDir,
      contactSheet: join(tmp, 'outside.png'),
    });
    await writeFile(join(tmp, 'outside.png'), 'png-bytes', 'utf8');
    assert.match(validateStripAdmission(escapedSheet, { stripDir: targetDir, receiptDir }).reason, /escaped receipt/);

    const missingSheet = createFakeManifest(indices, {
      stripDir: targetDir,
      receiptDir,
      contactSheet: join(receiptDir, 'contact-sheet.png'),
    });
    delete missingSheet.contactSheet;
    assert.match(validateStripAdmission(missingSheet, { stripDir: targetDir, receiptDir, checkFiles: false }).reason, /contactSheet/);

    await writeFile(join(receiptDir, 'contact-sheet.png'), '', 'utf8');
    assert.match(validateStripAdmission(manifest, { stripDir: targetDir, receiptDir }).reason, /empty \(0 bytes\)/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('validateStripAdmission fails closed when the strip directory cannot be read', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sf-strip-nodir-'));
  try {
    const notDir = join(tmp, 'not-a-dir');
    await writeFile(notDir, 'i-am-a-file', 'utf8');
    await writeFile(join(tmp, 'contact-sheet.png'), 'png', 'utf8');
    const manifest = createFakeManifest([0], {
      stripDir: notDir,
      receiptDir: tmp,
      contactSheet: join(tmp, 'contact-sheet.png'),
      frames: [{ index: 0, file: 'frame_000.jpg' }],
    });
    const res = validateStripAdmission(manifest, { stripDir: notDir, receiptDir: tmp });
    assert.equal(res.ok, false);
    assert.match(res.reason, /Failed to read strip directory|not a regular file|Nonexistent|escapes/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('critic CLI refuses a stale harness digest before launching a model', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sf-critic-cli-'));
  try {
    await writeFile(join(tmp, 'frame_000.jpg'), 'jpeg', 'utf8');
    await writeFile(join(tmp, 'frame_001.jpg'), 'jpeg', 'utf8');
    await writeFile(join(tmp, 'contact-sheet.png'), 'png', 'utf8');
    const manifest = createFakeManifest([0, 1], {
      stripDir: tmp,
      receiptDir: tmp,
      contactSheet: join(tmp, 'contact-sheet.png'),
      harnessDigest: 'stale-not-the-live-digest',
    });
    const manifestPath = join(tmp, 'strip-manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
    const { spawnSync } = await import('node:child_process');
    const res = spawnSync(process.execPath, ['scripts/critic-fun-loop.mjs', '--strip', manifestPath], {
      encoding: 'utf8',
      cwd: resolve('.'),
    });
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /failed critic admission|Mismatched harnessDigest|harnessDigest/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
