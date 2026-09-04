#!/usr/bin/env node
// Record completed owner play; never manufacture session evidence.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { renderSessionReportMarkdown } from '../src/observability/sessionReport.js';
const DEFAULT_DIR = path.resolve('design/program/roadmap/receipts/playtests');
function nonemptyFile(file) {
  try { const stat = fs.statSync(file); return stat.isFile() && stat.size > 0; } catch { return false; }
}
export function validatePlaytestSession(session, baseDir = process.cwd()) {
  const issues = [], evidence = session?.playtestEvidence;
  if (!session?.sessionId || session.synthetic === true || session.evidenceKind === 'demo') issues.push('A real session export is required; demo data is not playtest evidence');
  if (!evidence || evidence.kind !== 'owner-playtest' || evidence.observedByOwner !== true) issues.push('Missing explicit owner-playtest record');
  if (!Number.isFinite(session?.startedAt) || !Number.isFinite(session?.endedAt) || session.endedAt > Date.now() || session.endedAt <= session.startedAt) issues.push('Session timestamps must describe completed play');
  if (!Number.isFinite(session?.durationMs) || session.durationMs < 2700000 || session.durationMs > session.endedAt - session.startedAt + 1000) issues.push('Session must contain at least 45 minutes of observed play');
  if (!/^[a-f0-9]{40}$/i.test(evidence?.buildCommit || '')) issues.push('Missing exact build commit');
  if (!evidence?.capture || !nonemptyFile(path.resolve(baseDir, evidence.capture))) issues.push('Missing recorded capture file');
  if (!Array.isArray(evidence?.findings) || evidence.findings.length !== 3 || evidence.findings.some(f => typeof f?.observation !== 'string' || !f.observation.trim() || !/^PQ-\d{3}(?:\.\d+)?$/.test(f.packet || ''))) issues.push('Exactly three observed findings with packet IDs are required');
  return { ok: issues.length === 0, issues };
}
export function auditWeeklyPlaytests(dir = DEFAULT_DIR) {
  const issues = [], weeks = [];
  if (!fs.existsSync(dir)) return { ok: false, issues: ['No playtest recordings found'], weeks, totalWeeks: 0 };
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('-session.json')).sort()) {
    try {
      const sessionData = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const verdict = validatePlaytestSession(sessionData, dir);
      if (!verdict.ok) { issues.push(...verdict.issues.map(i => `${file}: ${i}`)); continue; }
      const date = new Date(sessionData.startedAt).toISOString().slice(0, 10);
      const report = file.replace('-session.json', '-playtest.md');
      if (!nonemptyFile(path.join(dir, report))) { issues.push(`${file}: missing readable session report`); continue; }
      weeks.push({ file: report, date, sessionData, findingCount: 3, hasMatchingJson: true });
    } catch (error) { issues.push(`${file}: ${error.message}`); }
  }
  weeks.sort((a, b) => a.date.localeCompare(b.date));
  let consecutive = 0, longest = 0, lastDate = null;
  const seen = new Set();
  for (const week of weeks) {
    if (seen.has(week.sessionData.sessionId)) { issues.push('Duplicate session cannot count as another playtest'); continue; }
    seen.add(week.sessionData.sessionId);
    const date = Date.parse(week.date), gap = (date - lastDate) / 86400000;
    consecutive = lastDate !== null && gap >= 6 && gap <= 8 ? consecutive + 1 : 1;
    longest = Math.max(longest, consecutive); lastDate = date;
  }
  if (longest < 4) issues.push(`Four consecutive weeks required; longest observed sequence is ${longest}`);
  return { ok: issues.length === 0, issues, weeks, totalWeeks: weeks.length, consecutiveWeeks: longest };
}
export function recordNewPlaytest(options = {}) {
  if (!options.file || !options.capture || !options.findings || !options.commit || options.observedByOwner !== true) throw new Error('Provide --file, --capture, --findings, --commit and --observed-by-owner after the owner has played; no demo session is generated');
  const source = JSON.parse(fs.readFileSync(path.resolve(options.file), 'utf8'));
  const findings = typeof options.findings === 'string' ? JSON.parse(fs.readFileSync(path.resolve(options.findings), 'utf8')) : options.findings;
  const session = { ...source, playtestEvidence: { kind: 'owner-playtest', observedByOwner: true, buildCommit: options.commit, capture: path.resolve(options.capture), findings } };
  const verdict = validatePlaytestSession(session);
  if (!verdict.ok) throw new Error(verdict.issues.join('; '));
  const date = new Date(session.startedAt).toISOString().slice(0, 10), week = Number(options.week || 1);
  if (!Number.isInteger(week) || week < 1) throw new Error('Week must be a positive integer');
  const dir = path.resolve(options.out || DEFAULT_DIR), stem = `${date}-week-${week}`;
  const sessionJsonPath = path.join(dir, `${stem}-session.json`), mdPath = path.join(dir, `${stem}-playtest.md`);
  if (fs.existsSync(sessionJsonPath) || fs.existsSync(mdPath)) throw new Error('Recording already exists; choose a new output directory to preserve it');
  fs.mkdirSync(dir, { recursive: true });
  session.playtestEvidence.capture = path.relative(dir, session.playtestEvidence.capture);
  const markdown = `# Owner playtest — ${date}\n\nBuild: ${options.commit}\n\nCapture: ${session.playtestEvidence.capture}\n\n${renderSessionReportMarkdown(session)}\n\n## Three routed findings\n\n${findings.map((f,i) => `${i+1}. ${f.observation} (${f.packet})`).join('\n')}\n`;
  fs.writeFileSync(sessionJsonPath, JSON.stringify(session, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(mdPath, markdown, { flag: 'wx' });
  return { date, week, session, mdPath, sessionJsonPath };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { check: { type: 'boolean' }, record: { type: 'boolean' }, file: { type: 'string' }, capture: { type: 'string' }, findings: { type: 'string' }, commit: { type: 'string' }, week: { type: 'string' }, out: { type: 'string' }, 'observed-by-owner': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
    if (values.help) console.log('Record completed owner play: --record --file session.json --capture video.mp4 --findings findings.json --commit <40-character hash> --observed-by-owner [--week N] [--out dir]. Audit: --check [--out dir].');
    else if (values.record) console.log(recordNewPlaytest({ ...values, observedByOwner: values['observed-by-owner'] }).mdPath);
    else { const result = auditWeeklyPlaytests(values.out); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1; }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
