#!/usr/bin/env node
// Re-grade a recorded player-truth run without a browser: reruns every check over trace.json.gz,
// rebuilds the contact sheet from the run's frames and rewrites verdict.md/json.
//   node scripts/player-truth/regrade.mjs scratch/player-truth/<label> [--evidence]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { gradeAndWrite } from './run.mjs';

const argv = process.argv.slice(2);
const dir = argv.find((x) => !x.startsWith('--'));
if (!dir) { console.error('usage: node scripts/player-truth/regrade.mjs <run dir> [--evidence]'); process.exit(3); }
const outDir = path.resolve(dir);
const trace = JSON.parse(gunzipSync(readFileSync(path.join(outDir, 'trace.json.gz'))).toString());
const shots = (trace.shots || []).map((s) => ({ ...s, file: path.join(outDir, 'frames', s.file) }));
delete trace.shots;
const [vw, vh] = String(trace.meta.resolution || '960x540').split('x').map(Number);
const verdict = await gradeAndWrite({ trace, shots, outDir, label: trace.meta.label || path.basename(outDir), evidence: argv.includes('--evidence'), vw, vh });
process.exitCode = verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : verdict === 'ENVIRONMENT' ? 4 : 2;
