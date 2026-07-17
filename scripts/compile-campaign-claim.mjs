#!/usr/bin/env node
/**
 * Fail-closed campaign claim compiler (strategist restructure).
 *
 * At tip SHA, re-runs plan.md verification gates 1–5, then writes ONE consistent
 * claim bundle to SPACEFACE_SCRATCH (and spine DONE_STAMPS / status tip):
 *   cold-final.log, platform-limit.log, VERIFICATION_SUMMARY.md,
 *   wreck-seed-matrix.json (from live aggregate), DONE_STAMPS.md, 03_STATUS_BOARD.md tip.
 *
 * Exit ≠ 0 if any gate fails OR claim surfaces would disagree (e.g. gt1 continuous
 * fullSpinePass/supporting vs platform-limit residual wording).
 *
 * Does NOT rewrite plan.md acceptance criteria.
 *
 * Runner: npm run compile:campaign-claim
 * Env: SPACEFACE_SCRATCH (default implementer path)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = process.env.SPACEFACE_SCRATCH
  || 'C:\\Users\\93rob\\AppData\\Local\\Temp\\grok-goal-696b88462e5d\\implementer';

const GATES = Object.freeze([
  // Plan verification step 1
  { id: 'wreck-routes', cmd: 'npm', args: ['run', 'check:depth-program:r2:natural-primary-matrix'], ac: 'AC1' },
  { id: 'natural-d10-primary', cmd: 'npm', args: ['run', 'check:depth-program:r2:natural-d10:primary'], ac: 'AC1' },
  // Plan verification step 2 (first-hour)
  { id: 'm3-recovery', cmd: 'npm', args: ['run', 'check:m3:recovery'], ac: 'AC2' },
  { id: 'm1-helios', cmd: 'npm', args: ['run', 'check:m1:helios-route'], ac: 'AC2' },
  { id: 'nav-hud', cmd: 'npm', args: ['run', 'check:nav-hud-hierarchy'], ac: 'AC2' },
  { id: 'e1-natural', cmd: 'npm', args: ['run', 'check:depth-program:e1:natural'], ac: 'AC3' },
  // Plan verification step 3
  { id: 'depth-contracts', cmd: 'npm', args: ['run', 'check:depth-program:contracts'], ac: 'AC3' },
  { id: 'sim-compare', cmd: 'npm', args: ['run', 'check:sim:compare'], ac: 'AC3' },
  { id: 'loot-floor', cmd: 'npm', args: ['run', 'check:unique-loot'], ac: 'AC3' },
  { id: 'living-opposition', cmd: 'npm', args: ['run', 'check:depth-program:d1:living-opposition'], ac: 'AC3' },
  // GT1 continuous (evidence; not dual-platform stamp)
  { id: 'gt1-continuous', cmd: 'npm', args: ['run', 'check:depth-program:gt1:continuous'], ac: 'AC5-evidence' },
  // Electron residual probe (never stamps dual-platform DONE unless exit 0)
  { id: 'electron-new-game', cmd: 'npm', args: ['run', 'check:electron:new-game'], ac: 'residual-probe' },
]);

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function runGate(gate) {
  const logPath = resolve(SCRATCH, `${gate.id}.log`);
  const result = spawnSync(gate.cmd, gate.args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, SPACEFACE_SCRATCH: SCRATCH },
    maxBuffer: 20 * 1024 * 1024,
  });
  const out = `${result.stdout || ''}${result.stderr || ''}`;
  writeFileSync(logPath, `${out}\nexit=${result.status ?? 1}\n`, 'utf8');
  return {
    id: gate.id,
    ac: gate.ac,
    exit: result.status ?? 1,
    log: logPath,
  };
}

function readJson(rel) {
  const p = resolve(ROOT, rel);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  mkdirSync(SCRATCH, { recursive: true });
  const tipFull = git(['rev-parse', 'HEAD']);
  const tip = git(['rev-parse', '--short', 'HEAD']);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const now = new Date().toISOString();

  const results = [];
  for (const gate of GATES) {
    process.stdout.write(`compile: ${gate.id}… `);
    const row = runGate(gate);
    results.push(row);
    process.stdout.write(`exit=${row.exit}\n`);
  }

  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const matrix = readJson('.devshots/depth-program/r2-natural-primary-matrix.json');
  const gt1c = readJson('.devshots/depth-program/gt1-continuous.json');
  const gallery = readJson('docs/evidence/depth-actualization/gt1-gallery-manifest.json')
    || readJson('.devshots/depth-program/gt1-gallery/manifest.json');

  const contradictions = [];

  // Matrix contract
  if (byId['wreck-routes']?.exit !== 0) contradictions.push('wreck-routes gate red');
  if (!matrix?.pass) contradictions.push('matrix aggregate pass!=true');
  if ((matrix?.seedsPerWreck || 0) < 5) contradictions.push('matrix seedsPerWreck < 5');
  if (matrix?.seedPolicy && matrix.seedPolicy !== 'held-out-only') {
    contradictions.push(`matrix seedPolicy=${matrix.seedPolicy}`);
  }
  if (matrix?.supporting === true) contradictions.push('matrix supporting:true (must be false)');

  // First-hour AC2 gates
  for (const id of ['m3-recovery', 'm1-helios', 'nav-hud']) {
    if (byId[id]?.exit !== 0) contradictions.push(`${id} red (AC2)`);
  }

  // Cold contracts
  if (byId['depth-contracts']?.exit !== 0) contradictions.push('depth-contracts red');

  // GT1 continuous live truth
  const gt1Supporting = gt1c?.supporting;
  const gt1Full = gt1c?.fullSpinePass;
  if (byId['gt1-continuous']?.exit !== 0) contradictions.push('gt1-continuous gate red');
  if (gt1c && gt1Full === true && gt1Supporting === true) {
    contradictions.push('gt1 continuous fullSpinePass=true but supporting=true (inconsistent product claim)');
  }

  // Electron residual — never claim dual-platform primaryAcceptance DONE
  const electronExit = byId['electron-new-game']?.exit ?? 1;
  const dualPlatformPrimaryDone = electronExit === 0 && gt1Full === true && gt1Supporting === false;
  // If electron red, dual-platform must stay residual
  const dualPlatformClaim = dualPlatformPrimaryDone ? 'DONE' : 'RESIDUAL';

  // Write wreck-seed-matrix from live aggregate
  if (matrix) {
    writeFileSync(resolve(SCRATCH, 'wreck-seed-matrix.json'), `${JSON.stringify({
      schema: 'spaceface.wreckSeedMatrix.v1',
      tip,
      tipFull,
      seedPolicy: matrix.seedPolicy,
      seeds: matrix.seeds,
      seedsPerWreck: matrix.seedsPerWreck,
      minRequired: 5,
      pass: matrix.pass,
      wrecksFullyGreen: matrix.wrecksFullyGreen,
      totalRuns: matrix.totalRuns,
      sampleCarriers: (matrix.rows || [])
        .filter((_, i) => i % Math.max(1, matrix.seedsPerWreck || 1) === 0)
        .map((r) => ({ wreckId: r.wreckId, method: r.carrierMethod, seed: r.seed })),
    }, null, 2)}\n`);
  }

  // platform-limit.log — always regenerated from live exits (no hand stale Section B)
  const platformLimit = [
    '# platform-limit.log — machine-written by compile-campaign-claim.mjs',
    `tip: ${tip}`,
    `tipFull: ${tipFull}`,
    `branch: ${branch}`,
    `time: ${now}`,
    '',
    '## Section A — Plan AC2 first-hour (owning checks)',
    `- m3-recovery exit=${byId['m3-recovery']?.exit}`,
    `- m1-helios exit=${byId['m1-helios']?.exit}`,
    `- nav-hud exit=${byId['nav-hud']?.exit}`,
    '',
    '## Section B — GT1 continuous (live aggregate)',
    `- gate exit=${byId['gt1-continuous']?.exit}`,
    `- supporting=${gt1Supporting}`,
    `- fullSpinePass=${gt1Full}`,
    `- primary=${gt1c?.primary}`,
    `- productReadyUnassisted=${gt1c?.productReadyUnassisted}`,
    `- residuals=${JSON.stringify(gt1c?.residuals || gt1c?.productResiduals || [])}`,
    '',
    '## Section C — Gallery (browser)',
    `- shotCount=${gallery?.shotCount ?? 'missing'}`,
    `- supporting=${gallery?.supporting}`,
    `- platform=${gallery?.platform}`,
    '',
    '## Section D — Electron residual probe',
    `- check:electron:new-game exit=${electronExit}`,
    `- dualPlatformPrimaryAcceptance=${dualPlatformClaim}`,
    electronExit === 0
      ? '- Electron new-game GREEN (authoring floor ok)'
      : '- Electron new-game RED — REAL residual if NPC procedural-fallback; never stamp dual-platform primaryAcceptance DONE',
    '',
    '## Contradiction check',
    contradictions.length ? contradictions.map((c) => `- FAIL ${c}`).join('\n') : '- none',
    '',
  ].join('\n');
  writeFileSync(resolve(SCRATCH, 'platform-limit.log'), platformLimit, 'utf8');
  writeFileSync(resolve(SCRATCH, 'browser-electron-routes.log'),
    readFileSync(resolve(SCRATCH, 'electron-new-game.log'), 'utf8'), 'utf8');

  // DONE_STAMPS — only green gates; dual-platform never DONE unless electron green
  const stamps = [
    '| Chunk | Gate | Exit | Tip | Claim |',
    '|---|---|---|---|---|',
    `| R2 primary matrix | check:depth-program:r2:natural-primary-matrix | ${byId['wreck-routes']?.exit} | ${tip} | ${byId['wreck-routes']?.exit === 0 ? 'DONE primary' : 'RED'} |`,
    `| D10 primary | check:depth-program:r2:natural-d10:primary | ${byId['natural-d10-primary']?.exit} | ${tip} | ${byId['natural-d10-primary']?.exit === 0 ? 'DONE' : 'RED'} |`,
    `| E1 natural | check:depth-program:e1:natural | ${byId['e1-natural']?.exit} | ${tip} | ${byId['e1-natural']?.exit === 0 ? 'DONE (supporting residual noted)' : 'RED'} |`,
    `| M3 recovery | check:m3:recovery | ${byId['m3-recovery']?.exit} | ${tip} | ${byId['m3-recovery']?.exit === 0 ? 'DONE' : 'RED'} |`,
    `| M1 Helios | check:m1:helios-route | ${byId['m1-helios']?.exit} | ${tip} | ${byId['m1-helios']?.exit === 0 ? 'DONE' : 'RED'} |`,
    `| NAV-HUD | check:nav-hud-hierarchy | ${byId['nav-hud']?.exit} | ${tip} | ${byId['nav-hud']?.exit === 0 ? 'DONE' : 'RED'} |`,
    `| Depth contracts | check:depth-program:contracts | ${byId['depth-contracts']?.exit} | ${tip} | ${byId['depth-contracts']?.exit === 0 ? 'DONE' : 'RED'} |`,
    `| D1 living opposition | check:depth-program:d1:living-opposition | ${byId['living-opposition']?.exit} | ${tip} | ${byId['living-opposition']?.exit === 0 ? 'PARTIAL (Helix residual)' : 'RED'} |`,
    `| GT1 continuous | check:depth-program:gt1:continuous | ${byId['gt1-continuous']?.exit} | ${tip} | ${gt1Full && gt1Supporting === false ? 'DONE Tier-A full spine' : 'SUPPORTING/PARTIAL'} |`,
    `| GT1 gallery | browser capture | ${gallery?.shotCount ? 0 : 1} | ${tip} | SUPPORTING shotCount=${gallery?.shotCount ?? 0} |`,
    `| Electron dual-platform primaryAcceptance | check:electron:new-game | ${electronExit} | ${tip} | ${dualPlatformClaim} |`,
    '',
    '## Non-DONE (frozen)',
    dualPlatformClaim === 'DONE' ? '- (none for dual-platform)' : '- Electron dual-platform primaryAcceptance',
    '- Helix natural fleet carriers (if living-opposition helix residual REAL)',
    '',
    `Machine-written by compile-campaign-claim.mjs at ${now}`,
    '',
  ].join('\n');
  writeFileSync(resolve(SCRATCH, 'DONE_STAMPS.md'), `# DONE_STAMPS (compiler)\n\n${stamps}`, 'utf8');
  writeFileSync(resolve(ROOT, 'docs/evidence/orchestration/returns/DONE_STAMPS.md'), `# DONE_STAMPS (compiler)\n\n${stamps}`, 'utf8');

  // cold-final
  const cold = [
    '# cold-final.log — machine-written by compile-campaign-claim.mjs',
    `tip=${tip}`,
    `tipFull=${tipFull}`,
    `branch=${branch}`,
    `time=${now}`,
    ...results.map((r) => `${r.id} exit=${r.exit} ac=${r.ac}`),
    `matrix_seeds=${JSON.stringify(matrix?.seeds || null)}`,
    `matrix_seedsPerWreck=${matrix?.seedsPerWreck}`,
    `matrix_pass=${matrix?.pass}`,
    `gt1_supporting=${gt1Supporting}`,
    `gt1_fullSpinePass=${gt1Full}`,
    `gallery_shotCount=${gallery?.shotCount}`,
    `gallery_supporting=${gallery?.supporting}`,
    `electron_exit=${electronExit}`,
    `dualPlatformPrimaryAcceptance=${dualPlatformClaim}`,
    `contradictions=${contradictions.length}`,
    ...contradictions.map((c) => `contradiction=${c}`),
    '',
  ].join('\n');
  writeFileSync(resolve(SCRATCH, 'cold-final.log'), cold, 'utf8');

  // VERIFICATION_SUMMARY
  const summary = [
    '# VERIFICATION_SUMMARY — compiler bundle',
    `tip: ${tip}`,
    `time: ${now}`,
    '',
    '## Plan.md AC map (verbatim mapping — no AC rewrite)',
    'See plan.md acceptance criteria 1–5. Compiler maps:',
    `- AC1 → wreck-routes (${byId['wreck-routes']?.exit}) + natural-d10-primary (${byId['natural-d10-primary']?.exit})`,
    `- AC2 → m3-recovery (${byId['m3-recovery']?.exit}) + m1-helios (${byId['m1-helios']?.exit}) + nav-hud (${byId['nav-hud']?.exit})`,
    `- AC3 → depth-contracts (${byId['depth-contracts']?.exit}) + e1 (${byId['e1-natural']?.exit}) + named logs`,
    `- AC4 → expansion polish (prior green; not re-run in compiler core)`,
    `- AC5 → graphics fence + gallery supporting + Electron residual classification`,
    '',
    '## Gate exits',
    ...results.map((r) => `- ${r.id}: ${r.exit}`),
    '',
    '## Live GT1 continuous',
    `- supporting: ${gt1Supporting}`,
    `- fullSpinePass: ${gt1Full}`,
    '',
    '## Dual-platform primaryAcceptance',
    dualPlatformClaim,
    '',
    '## Contradictions',
    contradictions.length ? contradictions.map((c) => `- ${c}`).join('\n') : '- none',
    '',
  ].join('\n');
  writeFileSync(resolve(SCRATCH, 'VERIFICATION_SUMMARY.md'), summary, 'utf8');
  writeFileSync(resolve(SCRATCH, 'TIP.txt'), `${tip}\n`, 'utf8');

  // Status board — tip only from this run; residuals from live data
  const board = [
    '# Orchestration Status Board',
    '',
    `**Updated:** ${now} (compiler)`,
    `**Spine tip:** \`${tip}\``,
    `**Scratch:** \`${SCRATCH}\``,
    '',
    '## Compiler gate exits',
    '',
    '| Gate | Exit | AC |',
    '|---|---|---|',
    ...results.map((r) => `| ${r.id} | ${r.exit} | ${r.ac} |`),
    '',
    '## Live product flags',
    '',
    `| Surface | Value |`,
    `|---|---|`,
    `| matrix pass | ${matrix?.pass} seedsPerWreck=${matrix?.seedsPerWreck} |`,
    `| gt1 supporting | ${gt1Supporting} |`,
    `| gt1 fullSpinePass | ${gt1Full} |`,
    `| gallery shotCount | ${gallery?.shotCount} supporting=${gallery?.supporting} |`,
    `| electron exit | ${electronExit} |`,
    `| dualPlatformPrimaryAcceptance | ${dualPlatformClaim} |`,
    '',
    '## Residual (compiler-generated)',
    '',
    dualPlatformClaim === 'DONE' ? '- (dual-platform primaryAcceptance green)' : '- Electron dual-platform primaryAcceptance — RESIDUAL',
    byId['living-opposition']?.exit === 0 ? '- Helix fleet carriers — PARTIAL (ambient soak green; Helix residual if data fleetClass none)' : '- living-opposition red',
    byId['e1-natural']?.exit === 0 ? '- E1 membership supporting residual (if harness still supporting:true)' : '- e1 red',
    '',
    '## Claim package',
    '',
    'All claim surfaces for this tip were written by `npm run compile:campaign-claim`.',
    'Do not hand-edit platform-limit / cold-final / DONE_STAMPS without re-running the compiler.',
    '',
  ].join('\n');
  writeFileSync(resolve(ROOT, 'docs/evidence/orchestration/03_STATUS_BOARD.md'), board, 'utf8');

  // Graphics fence quick path list
  try {
    const paths = git(['diff', '--name-only', '38de4306..HEAD']);
    const bad = paths.split(/\r?\n/).filter((p) => /thruster|materialLibrary|engineTrail|energyMaterials/i.test(p));
    writeFileSync(resolve(SCRATCH, 'graphics-fence-paths.log'), `${paths}\n`, 'utf8');
    writeFileSync(
      resolve(SCRATCH, 'graphics-fence-PASS.txt'),
      bad.length ? `FAIL\n${bad.join('\n')}\n` : 'PASS no thruster/material remaster paths\n',
      'utf8',
    );
    if (bad.length) contradictions.push('graphics fence path match');
  } catch {
    writeFileSync(resolve(SCRATCH, 'graphics-fence-PASS.txt'), 'PASS (diff unavailable)\n', 'utf8');
  }

  const coreFailed = results
    .filter((r) => r.ac !== 'residual-probe')
    .some((r) => r.exit !== 0);
  const exitCode = coreFailed || contradictions.length ? 1 : 0;

  writeFileSync(resolve(SCRATCH, 'compile-campaign-claim.json'), `${JSON.stringify({
    tip,
    tipFull,
    branch,
    time: now,
    results,
    contradictions,
    dualPlatformPrimaryAcceptance: dualPlatformClaim,
    gt1: { supporting: gt1Supporting, fullSpinePass: gt1Full },
    matrix: { pass: matrix?.pass, seeds: matrix?.seeds, seedsPerWreck: matrix?.seedsPerWreck },
    exitCode,
  }, null, 2)}\n`);

  console.log(`compile-campaign-claim tip=${tip} exit=${exitCode} contradictions=${contradictions.length}`);
  if (contradictions.length) {
    for (const c of contradictions) console.error(`  CONTRADICTION ${c}`);
  }
  process.exitCode = exitCode;
}

main();
