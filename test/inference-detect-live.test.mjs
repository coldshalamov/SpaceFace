// Live smoke test: scripts/inference-detect.mjs runs against the real repo,
// produces a well-formed v2 director board, and its liveness distinctions hold.
// Pins relationships, not exact counts (registries move under concurrent work).
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CERES_CAUSAL_CHAIN } from '../src/systems/traffic.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'test', '.inference-detect-live.tmp.json');

let failures = 0;
function check(name, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

let stdout = '';
try {
  stdout = execFileSync(process.execPath, [
    resolve(ROOT, 'scripts', 'inference-detect.mjs'),
    `--out=${OUT}`,
  ], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
} catch (err) {
  console.error(`inference-detect exited nonzero: ${err.message}`);
  console.error(String(err.stdout || '').slice(0, 2000));
  process.exit(1);
}

check('prints-board', stdout.includes('INFERENCE DIRECTOR BOARD'));
check('prints-mode', stdout.includes('SUGGESTED MODE:'));
check('prints-starved-cell', stdout.includes('STARVED'));
check('prints-opportunity-cell', stdout.includes('OPPORTUNITY'));

const report = JSON.parse(readFileSync(OUT, 'utf8'));
check('schema-v2', report.schema === 'spaceface.inferenceDetect.v2');
check('board-present', report.board && typeof report.board.suggestedMode === 'string');
check('mode-valid', ['recovery', 'integration', 'starved', 'opportunity', 'repair'].includes(report.board.suggestedMode));

// Every gap names its workflows and its blind spots — a score with no stated
// blindness invites treating the count as an experience verdict.
for (const gap of report.gaps) {
  check('gap-has-wfs', Array.isArray(gap.wfs) && gap.wfs.length > 0, gap.id);
  check('gap-has-blindspots', typeof gap.blindSpots === 'string' && gap.blindSpots.length > 10, gap.id);
}

// Liveness distinctions hold on real data:
const s = report.snapshots;
check('hulls-live-bounded', s.hullsLive <= s.hullsLive + s.hullsSourceOnly);
check('hulls-live-from-manifest', s.hullsLive > 0, 'release manifest hulls should exist');
check('fabricated-doctrines-clean', Array.isArray(s.fabricatedDoctrines) && s.fabricatedDoctrines.length === 0,
  `live enemy defs carry fabricated doctrine ids: ${(s.fabricatedDoctrines || []).join(', ')} — these silently null behavior`);
check('ghost-job-kinds-clean', Array.isArray(s.ghostJobKinds) && s.ghostJobKinds.length === 0,
  `enum-only job kinds with no phase graph: ${(s.ghostJobKinds || []).join(', ')}`);
check('integration-debt-visible', Array.isArray(report.board.integration));
for (const debt of report.board.integration) {
  check('integration-debt-has-wfs', Array.isArray(debt.wfs) && debt.wfs.length > 0, debt.id);
}

// The microevent catalog is a promotion queue, not a permanent score. Once an
// event id is actually consumed by src, it must leave unwired debt while the
// report continues to account for the entire catalog.
const microeventDir = resolve(ROOT, 'design', 'incubator', 'microevent_library', 'catalog');
let catalogMicroevents = 0;
const catalogMicroeventIds = new Set();
for (const file of readdirSync(microeventDir)) {
  if (!file.endsWith('.json')) continue;
  const parsed = JSON.parse(readFileSync(join(microeventDir, file), 'utf8'));
  const entries = Array.isArray(parsed) ? parsed : (parsed.events || parsed.entries || []);
  catalogMicroevents += entries.length;
  for (const entry of entries) {
    const id = entry && (entry.id || entry.eventId || entry.name);
    if (id) catalogMicroeventIds.add(id);
  }
}
const { microeventsWired, microeventsUnwired, microeventWiredIds } = s;
const expectedWiredIds = [...new Set(CERES_CAUSAL_CHAIN.map((entry) => entry.id))]
  .filter((id) => catalogMicroeventIds.has(id))
  .sort();
check('microevent-snapshot-complete', Number.isInteger(microeventsWired) && Number.isInteger(microeventsUnwired));
check('microevent-snapshot-partitions-catalog', microeventsWired + microeventsUnwired === catalogMicroevents,
  `${microeventsWired} wired + ${microeventsUnwired} unwired vs ${catalogMicroevents} catalog`);
check('microevent-runtime-registry-identified', s.microeventRuntimeRegistry === 'traffic.CERES_CAUSAL_CHAIN');
check('microevent-wiring-matches-runtime-registry', JSON.stringify(microeventWiredIds) === JSON.stringify(expectedWiredIds),
  `reported=${JSON.stringify(microeventWiredIds)} expected=${JSON.stringify(expectedWiredIds)}`);
check('microevent-unwired-is-runtime-complement', microeventsUnwired === catalogMicroevents - expectedWiredIds.length,
  `${microeventsUnwired} unwired vs ${catalogMicroevents - expectedWiredIds.length} expected`);
const microeventDebt = report.board.integration.find((d) => d.id === 'microevent_catalog');
if (microeventsUnwired > 0) {
  check('microevent-debt-uses-unwired-count', microeventDebt && microeventDebt.count === microeventsUnwired,
    JSON.stringify(microeventDebt));
  check('microevent-debt-routes-workflows', microeventDebt && microeventDebt.wfs.includes('WF-08') && microeventDebt.wfs.includes('WF-17'),
    JSON.stringify(microeventDebt));
}

// The starved cell must include structurally unmeasured domains whenever no
// memory records work for them — this is the anti-starvation guarantee.
const starvedWfs = report.board.starved.map((d) => d.wf);
const memoryPath = resolve(ROOT, 'design/program/inference-memory.json');
const memory = existsSync(memoryPath) ? JSON.parse(readFileSync(memoryPath, 'utf8')) : { units: [], runs: [] };
const touched = new Set([
  ...(memory.units || []).map((u) => u.wf),
  ...(memory.runs || []).flatMap((r) => r.domains || []),
]);
for (const wf of ['WF-06', 'WF-09', 'WF-10', 'WF-13']) {
  if (!touched.has(wf)) {
    check('unmeasured-untouched-is-starved', starvedWfs.includes(wf), `${wf} absent from starved cell`);
  }
}

try { unlinkSync(OUT); } catch { /* leave temp file on failure for debugging */ }

if (failures) {
  console.error(`inference-detect-live.test: ${failures} failures`);
  process.exit(1);
}
console.log('inference-detect-live.test: ok (board well-formed; liveness distinctions hold)');
process.exit(0);
