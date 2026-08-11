// Behavioral evals for the INFERENCE director logic (scripts/lib/inferenceCore.mjs).
// Synthetic fixtures only — no live game data. Each numbered section pins one
// failure mode the system must resist (see design/program/INFERENCE_LANES.md).
import {
  idBreadth, liveAssetBreadth, objectLiteralKeys, concentration,
  emptyMemory, normalizeMemory, decayWeight, domainStaleness,
  isBlockedCandidate, failedTwicePatterns, overusedReferences, pruneMemory,
  recordUnit, suggestMode, buildDirectorBoard, resolveScope,
  slateRequirements, checkSlate, sameIdea, DOMAINS,
} from '../scripts/lib/inferenceCore.mjs';

let failures = 0;
function check(name, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

const TODAY = '2026-08-11';

// --- 1. Duplicate ids must not reduce perceived thinness -------------------
{
  const base = idBreadth(['a', 'b', 'c']);
  const padded = idBreadth(['a', 'b', 'c', 'a', 'a', 'a', 'a', 'a']);
  check('dup-ids-no-breadth', padded.unique === base.unique, `unique ${padded.unique} vs ${base.unique}`);
  check('dup-ids-flagged', padded.duplicates.length === 1 && padded.duplicates[0] === 'a');
}

// --- 2. Source-only assets must not make live breadth look solved ----------
{
  const before = liveAssetBreadth({ onDisk: ['h1', 'h2'], released: ['h1', 'h2'] });
  const after = liveAssetBreadth({ onDisk: ['h1', 'h2', 'h3', 'h4', 'h5'], released: ['h1', 'h2'] });
  check('source-only-not-live', after.liveCount === before.liveCount, `live ${after.liveCount}`);
  check('source-only-is-debt', after.sourceOnlyCount === 3);
}

// --- 3. Repeated repair runs must not starve unmeasured domains forever ----
{
  const memory = emptyMemory(TODAY);
  for (let i = 0; i < 6; i++) {
    memory.runs.push({ date: `2026-08-0${i + 3}`, mode: 'repair', domains: ['WF-02'] });
  }
  const starved = DOMAINS.filter((d) => !d.measured)
    .map((d) => ({ ...d, staleness: domainStaleness(memory, d.wf, TODAY) }));
  const s = suggestMode({ memory, today: TODAY, starved });
  check('repair-streak-yields-starved', s.mode === 'starved', `got ${s.mode}: ${s.reason}`);
}

// --- 4. Three recolors are not 3x: identical fingerprints must collide -----
{
  const recolors = [
    'verb=haul,subject=freighter,sector=ceres,layer=midground,tempo=ambient,domain=wf-01',
    'verb=haul,subject=freighter,sector=ceres,layer=midground,tempo=ambient,domain=wf-01',
    'verb=haul,subject=freighter,sector=ceres,layer=midground,tempo=ambient,domain=wf-01',
  ];
  const res = checkSlate(recolors, { nx: 3 });
  check('recolor-slate-rejected', !res.ok && res.collisions.length >= 3, `collisions=${res.collisions.length}`);

  const distinct = [
    'verb=haul,subject=freighter,sector=ceres,layer=midground,tempo=ambient,domain=wf-01',
    'verb=repair,subject=tender,sector=ceres,layer=foreground,tempo=burst,domain=wf-01',
    'verb=steal,subject=cargo-pod,sector=helios,layer=foreground,tempo=burst,domain=wf-01',
  ];
  check('distinct-slate-ok', checkSlate(distinct, { nx: 3 }).ok);
}

// --- 5. 5x POLISH must span multiple layers, not five VFX tweaks -----------
{
  const scope = resolveScope('POLISH');
  check('polish-is-multidomain', Array.isArray(scope) && scope.length >= 3);
  const fiveVfx = [
    'verb=see,subject=boost-trail,layer=foreground,tempo=burst,domain=wf-12,sector=any',
    'verb=see,subject=impact-flash,layer=foreground,tempo=burst,domain=wf-12,sector=ceres',
    'verb=see,subject=explosion,layer=midground,tempo=burst,domain=wf-12,sector=helios',
    'verb=see,subject=engine-glow,layer=background,tempo=ambient,domain=wf-12,sector=tethys',
    'verb=see,subject=debris,layer=foreground,tempo=decay,domain=wf-12,sector=vesta',
  ];
  const res = checkSlate(fiveVfx, { scopeWfs: scope, nx: 5 });
  check('five-vfx-violates-polish', !res.ok && res.domainViolation != null, res.domainViolation || 'no violation raised');
  const spread = fiveVfx.slice(0, 3).concat([
    'verb=hear,subject=refinery,layer=midground,tempo=ambient,domain=wf-13,sector=ceres',
    'verb=read,subject=target-info,layer=foreground,tempo=instant,domain=wf-14,sector=any',
  ]);
  check('spread-satisfies-polish', checkSlate(spread, { scopeWfs: scope, nx: 5 }).ok);
}

// --- 6. Broken base mechanic routes to recovery before content ------------
{
  const memory = emptyMemory(TODAY);
  const defect = { id: 'drill-feel-broken', wf: 'WF-15', severity: 'foundation', status: 'open', date: TODAY, note: 'x' };
  const s = suggestMode({ memory, today: TODAY, scopeWfs: resolveScope('FEEL'), knownDefects: [defect] });
  check('foundation-defect-routes-recovery', s.mode === 'recovery', `got ${s.mode}`);
  // A defect OUTSIDE the scope must not hijack the run.
  const s2 = suggestMode({ memory, today: TODAY, scopeWfs: resolveScope('AUDIO'), knownDefects: [defect] });
  check('out-of-scope-defect-ignored', s2.mode !== 'recovery', `got ${s2.mode}`);
  // suspected defects are listed but never force the mode.
  const s3 = suggestMode({
    memory, today: TODAY, scopeWfs: resolveScope('FEEL'),
    knownDefects: [{ ...defect, severity: 'suspected-foundation' }],
  });
  check('suspected-defect-does-not-force', s3.mode !== 'recovery', `got ${s3.mode}`);
}

// --- 7. A recently rejected idea must not silently resurrect ---------------
{
  const memory = emptyMemory(TODAY);
  recordUnit(memory, {
    id: 'gravity-toll', date: '2026-08-01', wf: 'WF-05', mode: 'repair', verdict: 'cut',
    reason: 'redundant', rootReason: 'no new tactic',
    fingerprint: 'verb=push,subject=chokepoint,sector=ceres,tempo=burst,domain=wf-05',
  });
  const sameAgain = isBlockedCandidate(memory, 'verb=push,subject=chokepoint,sector=ceres,tempo=burst,domain=wf-05', TODAY);
  check('rejected-idea-blocked', sameAgain.blocked === true);
  const differentIdea = isBlockedCandidate(memory, 'verb=pull,subject=convoy,sector=helios,tempo=sustained,domain=wf-05', TODAY);
  check('different-idea-not-blocked', differentIdea.blocked === false);
  // The block DECAYS: after the window the idea may be retried.
  const later = isBlockedCandidate(memory, 'verb=push,subject=chokepoint,sector=ceres,tempo=burst,domain=wf-05', '2026-11-01');
  check('block-decays-after-window', later.blocked === false);
}

// --- 8. Fabricated vocabulary must not count (comment/ghost handling) ------
{
  const src = `
    // fake: { commented: 1 }
    const VOCAB = {
      real_one: build1,
      real_two: build2, // trailing note
      nested: { inner_key: 3 },
    };
  `;
  const keys = objectLiteralKeys(src, 'const VOCAB =');
  check('scan-finds-real-keys', keys.includes('real_one') && keys.includes('real_two') && keys.includes('nested'), keys.join(','));
  check('scan-skips-nested', !keys.includes('inner_key'), keys.join(','));
  check('scan-skips-comments', !keys.includes('fake') && !keys.includes('commented'), keys.join(','));
  // Unknown strings collapse instead of counting: concentration on a
  // recognized-filtered list must not grow from a fabricated value.
  const recognized = new Set(['a', 'b']);
  const withFake = concentration(['a', 'b', 'zz'].map((v) => (recognized.has(v) ? v : null)));
  check('fabricated-string-not-counted', withFake.unique === 2, `unique=${withFake.unique}`);
}

// --- 9. Nx is an effort target: accepting fewer is legal -------------------
{
  const req = slateRequirements(5, resolveScope('POLISH'));
  check('nx-min-zero', req.acceptedMin === 0);
  check('nx-max-five', req.acceptedMax === 5);
  check('nx-candidates-scale', req.minCandidates === 16);
}

// --- 10. Corrupt or racing memory degrades safely, never crashes -----------
{
  for (const garbage of [null, 'not json', 42, [], { schema: 'wrong', units: 'nope', runs: { a: 1 } }]) {
    const { memory, warnings } = normalizeMemory(garbage, TODAY);
    check('corrupt-memory-tolerated', Array.isArray(memory.units) && Array.isArray(memory.runs), JSON.stringify(garbage).slice(0, 30));
    if (garbage && typeof garbage === 'object' && !Array.isArray(garbage)) {
      check('corrupt-memory-warns', warnings.length > 0);
    }
  }
}

// --- 11. Integration debt beats more authoring when the warehouse is full --
{
  const memory = emptyMemory(TODAY);
  const s = suggestMode({
    memory, today: TODAY,
    integrationDebt: [{ id: 'incubator', count: 121 }, { id: 'microevents', count: 58 }],
  });
  check('debt-suggests-integration', s.mode === 'integration', `got ${s.mode}`);
  // ...but a recent integration run releases the pressure.
  memory.runs.push({ date: TODAY, mode: 'integration', domains: ['WF-17'] });
  const s2 = suggestMode({
    memory, today: TODAY,
    integrationDebt: [{ id: 'incubator', count: 121 }],
  });
  check('recent-integration-releases', s2.mode !== 'integration', `got ${s2.mode}`);
  // ...and a SCOPED run keeps its scope: global debt must not hijack POLISH.
  const s3 = suggestMode({
    memory: emptyMemory(TODAY), today: TODAY, scopeWfs: resolveScope('POLISH'),
    integrationDebt: [{ id: 'incubator', count: 121 }],
  });
  check('scoped-run-not-hijacked-by-debt', s3.mode !== 'integration', `got ${s3.mode}`);
}

// --- 11b. A scope with no structural metric must route to starved, not fake repair
{
  const memory = emptyMemory(TODAY);
  const scope = resolveScope('POLISH');
  const structural = [
    { id: 'enemy_gap', score: 40, wfs: ['WF-02'], why: 'x', blindSpots: 'y', metric: { unique: 1, n: 1, topShare: 0 } },
  ];
  const board = buildDirectorBoard({ structural, memory, today: TODAY, integrationDebt: [], scopeWfs: scope });
  check('unmeasured-scope-routes-starved', board.suggestedMode === 'starved', `got ${board.suggestedMode}: ${board.modeReason}`);
  check('unmeasured-scope-repair-empty', board.repair.length === 0);
  const starvedWfs = board.starved.map((d) => d.wf);
  check('starved-cell-scoped', starvedWfs.every((wf) => scope.includes(wf)), starvedWfs.join(','));
}

// --- 12. Saturation: pile-on domains get flagged, and decay clears them ----
{
  const memory = emptyMemory(TODAY);
  for (let i = 0; i < 4; i++) {
    recordUnit(memory, {
      id: `u${i}`, date: '2026-08-10', wf: 'WF-15', mode: 'repair', verdict: 'accepted',
      reason: 'tuning', fingerprint: `verb=tune,subject=s${i},sector=any,domain=wf-15`,
    });
  }
  const structural = [
    { id: 'feel_gap', score: 50, wfs: ['WF-15'], why: 'x', blindSpots: 'y', metric: { unique: 1, n: 1, topShare: 0 } },
    { id: 'other_gap', score: 30, wfs: ['WF-06'], why: 'x', blindSpots: 'y', metric: { unique: 1, n: 1, topShare: 0 } },
  ];
  const board = buildDirectorBoard({ structural, memory, today: TODAY, integrationDebt: [] });
  const feel = board.repair.find((g) => g.id === 'feel_gap');
  check('pile-on-flagged-saturated', feel && feel.saturated === true);
  const boardLater = buildDirectorBoard({ structural, memory, today: '2026-12-01', integrationDebt: [] });
  const feelLater = boardLater.repair.find((g) => g.id === 'feel_gap');
  check('saturation-decays', feelLater && feelLater.saturated === false);
}

// --- 13. Failed-twice patterns surface; memory prunes but keeps them -------
{
  const memory = emptyMemory(TODAY);
  recordUnit(memory, { id: 'a', date: '2026-05-01', wf: 'WF-09', mode: 'repair', verdict: 'cut', reason: 'x', rootReason: 'lore with no physical evidence', fingerprint: 'verb=read,subject=lore,sector=a,domain=wf-09' });
  recordUnit(memory, { id: 'b', date: '2026-06-01', wf: 'WF-09', mode: 'repair', verdict: 'cut', reason: 'y', rootReason: 'lore with no physical evidence', fingerprint: 'verb=read,subject=lore,sector=b,domain=wf-09' });
  const patterns = failedTwicePatterns(memory);
  check('failed-twice-detected', patterns.length === 1 && patterns[0].count === 2);
  // Prune far in the future: ordinary old units drop; failed-twice survive.
  recordUnit(memory, { id: 'old-ok', date: '2026-05-01', wf: 'WF-01', mode: 'repair', verdict: 'accepted', reason: 'z', fingerprint: 'verb=haul,subject=x,sector=y,domain=wf-01' });
  pruneMemory(memory, '2027-06-01');
  check('prune-keeps-failed-twice', failedTwicePatterns(memory).length === 1, `units=${memory.units.length}`);
  check('prune-drops-stale-accepted', !memory.units.some((u) => u.id === 'old-ok'));
}

// --- 14. Reference overuse is visible so rotation can be enforced ----------
{
  const memory = emptyMemory(TODAY);
  for (let i = 0; i < 3; i++) {
    recordUnit(memory, { id: `r${i}`, date: '2026-08-09', wf: 'WF-01', mode: 'repair', verdict: 'accepted', reason: 'x', fingerprint: `verb=v${i},subject=s${i},sector=ceres,domain=wf-01`, references: ['watch dogs'] });
  }
  const over = overusedReferences(memory, TODAY);
  check('reference-overuse-detected', over.length === 1 && over[0].uses === 3);
}

// --- 15. sameIdea needs real overlap, not shared vocabulary ----------------
{
  check('same-idea-true', sameIdea(
    'verb=steal,subject=hauler,sector=ceres,tempo=burst,domain=wf-01',
    'verb=steal,subject=hauler,sector=ceres,tempo=sustained,domain=wf-01',
  ));
  check('same-idea-false-two-axes', !sameIdea(
    'verb=steal,subject=hauler,sector=ceres,tempo=burst,domain=wf-01',
    'verb=protect,subject=hauler,sector=helios,tempo=burst,domain=wf-01',
  ));
  check('same-idea-false-sparse', !sameIdea('verb=steal', 'verb=steal'));
}

// --- 16. Decay sanity ------------------------------------------------------
{
  check('decay-today-full', Math.abs(decayWeight(TODAY, TODAY) - 1) < 1e-9);
  check('decay-halflife', Math.abs(decayWeight('2026-07-21', TODAY, 21) - 0.5) < 1e-9);
  check('decay-bad-date-zero', decayWeight('garbage', TODAY) === 0);
}

if (failures) {
  console.error(`inference-core.test: ${failures} failures`);
  process.exit(1);
}
console.log('inference-core.test: ok (16 behavioral eval sections)');
process.exit(0);
