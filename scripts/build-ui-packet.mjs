#!/usr/bin/env node
// Build one UI production hand-off zip.
//
//   node scripts/build-ui-packet.mjs S1             → .devshots/ui-packets/S1-design-system.zip  (a session — the hand-off unit)
//   node scripts/build-ui-packet.mjs P01            → .devshots/ui-packets/P01-frames-title-crucible.zip (a phase spec alone; normally bundled into a session)
//   node scripts/build-ui-packet.mjs S1 --list      → print what would be included, build nothing
//   node scripts/build-ui-packet.mjs --all          → build every session and packet
//
// Sessions live under design/frontend/direction/sessions/<S#-slug>/PACKET.md, phase specs under
// design/frontend/direction/packets/<P##-slug>/PACKET.md. PACKET.md starts with a fenced yaml block:
//   current: [surface ids]   copied from test/ui-frame-references/<id>-default-1920x1080.png → current/
//   inputs:  [repo paths]    files → inputs/<basename>; directories → inputs/<dirname>/ (prior returns, fonts, libs)
//   phases:  [P01, P10, …]   each phase spec's PACKET.md → phases/<P##>.md
//   source:  [repo paths]    files/dirs snapshotted under source/<repo path> (engine-port sessions), commit stamped in README.txt
//   returns: <zip name>      echoed into README.txt
// Missing inputs are listed in inputs/MISSING.txt rather than failing, so a packet can be built for
// reading before its dependencies exist; a packet with MISSING.txt must not be handed off.
// Everything under packets/_COMMON is copied into every zip. Zips are written with bsdtar (`tar -a`):
// Windows ships it in System32 (Git Bash's GNU tar reads "C:\…" as a remote host, so it is bypassed).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKETS_DIR = path.join(ROOT, 'design', 'frontend', 'direction', 'packets');
const SESSIONS_DIR = path.join(ROOT, 'design', 'frontend', 'direction', 'sessions');
const COMMON_DIR = path.join(PACKETS_DIR, '_COMMON');
const REF_DIR = path.join(ROOT, 'test', 'ui-frame-references');
const OUT_DIR = path.join(ROOT, '.devshots', 'ui-packets');
const LIST_KEYS = new Set(['current', 'inputs', 'dependsOn', 'phases', 'source']);
const SIZE_WARN_MB = 400;

function parseHeader(md) {
  const m = md.match(/^```yaml\r?\n([\s\S]*?)\r?\n```/);
  const out = { current: [], inputs: [], phases: [], source: [], returns: '', title: '' };
  if (!m) return out;
  for (const raw of m[1].split(/\r?\n/)) {
    const kv = raw.trim().match(/^([A-Za-z]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    if (LIST_KEYS.has(key)) {
      const inner = value.replace(/^\[|\]$/g, '').trim();
      out[key] = inner ? inner.split(',').map((s) => s.trim()).filter(Boolean) : [];
    } else out[key] = value.trim();
  }
  return out;
}

function packetDirFor(id) {
  const base = /^S\d$/.test(id) ? SESSIONS_DIR : PACKETS_DIR;
  const dirs = fs.readdirSync(base).filter((d) => d.startsWith(id + '-'));
  if (dirs.length !== 1) throw new Error(`${id}: expected one folder under ${path.relative(ROOT, base)}, found ${dirs.length}`);
  return path.join(base, dirs[0]);
}

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(s, d); else fs.copyFileSync(s, d);
  }
}

function copyAny(src, dst) {
  if (fs.statSync(src).isDirectory()) copyTree(src, dst);
  else { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
}

function dirSize(p) {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.size;
  let n = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) n += dirSize(path.join(p, e.name));
  return n;
}

function gitHead() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}

function build(id, { list = false } = {}) {
  const dir = packetDirFor(id);
  const slug = path.basename(dir);
  const head = parseHeader(fs.readFileSync(path.join(dir, 'PACKET.md'), 'utf8'));
  const plan = { zip: path.join(OUT_DIR, `${slug}.zip`), current: [], inputs: [], phases: [], source: [], missing: [] };

  for (const surface of head.current) {
    const f = path.join(REF_DIR, `${surface}-default-1920x1080.png`);
    if (fs.existsSync(f)) plan.current.push(f); else plan.missing.push(`current/${surface} (no reference frame)`);
  }
  for (const rel of head.inputs) {
    const f = path.join(ROOT, rel.replace(/\/$/, ''));
    if (fs.existsSync(f)) plan.inputs.push(rel.replace(/\/$/, '')); else plan.missing.push(`inputs/${rel}`);
  }
  for (const pid of head.phases) {
    try { plan.phases.push([pid, path.join(packetDirFor(pid), 'PACKET.md')]); }
    catch (e) { plan.missing.push(`phases/${pid} (${e.message})`); }
  }
  for (const rel of head.source) {
    const f = path.join(ROOT, rel.replace(/\/$/, ''));
    if (fs.existsSync(f)) plan.source.push(rel.replace(/\/$/, '')); else plan.missing.push(`source/${rel}`);
  }

  if (list) {
    console.log(`${id} ${head.title}`);
    console.log(`  zip:      ${path.relative(ROOT, plan.zip)}`);
    console.log(`  current:  ${plan.current.map((f) => path.basename(f)).join(', ') || '(none)'}`);
    console.log(`  inputs:   ${plan.inputs.join(', ') || '(none)'}`);
    console.log(`  phases:   ${plan.phases.map(([p]) => p).join(', ') || '(none)'}`);
    console.log(`  source:   ${plan.source.join(', ') || '(none)'}`);
    console.log(`  missing:  ${plan.missing.join(', ') || '(none)'}`);
    return plan;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stage = fs.mkdtempSync(path.join(OUT_DIR, `.stage-${id}-`));
  const stageRoot = path.join(stage, slug);
  copyTree(COMMON_DIR, path.join(stageRoot, '_COMMON'));
  copyTree(dir, stageRoot);
  fs.mkdirSync(path.join(stageRoot, 'current'), { recursive: true });
  for (const f of plan.current) fs.copyFileSync(f, path.join(stageRoot, 'current', path.basename(f)));
  fs.mkdirSync(path.join(stageRoot, 'inputs'), { recursive: true });
  for (const rel of plan.inputs) copyAny(path.join(ROOT, rel), path.join(stageRoot, 'inputs', path.basename(rel)));
  if (plan.phases.length) {
    fs.mkdirSync(path.join(stageRoot, 'phases'), { recursive: true });
    for (const [pid, file] of plan.phases) fs.copyFileSync(file, path.join(stageRoot, 'phases', `${pid}.md`));
  }
  const sha = plan.source.length ? gitHead() : null;
  for (const rel of plan.source) copyAny(path.join(ROOT, rel), path.join(stageRoot, 'source', rel));
  if (plan.missing.length) {
    fs.writeFileSync(path.join(stageRoot, 'inputs', 'MISSING.txt'),
      'These inputs were not available when the packet was built. Do not hand this packet off until they exist:\n'
      + plan.missing.map((m) => `- ${m}`).join('\n') + '\n');
  }
  fs.writeFileSync(path.join(stageRoot, 'README.txt'),
    `SpaceFace UI hand-off ${id} — ${head.title}\n\n`
    + `Read _COMMON/00_READ_ME_FIRST.md first, then PACKET.md. Phase specs are under phases/, prior returns and\n`
    + `reference files under inputs/, the current game screens under current/`
    + (sha ? `, and a repository source snapshot under source/ (commit ${sha}).\n` : `.\n`)
    + `Return one zip named ${head.returns || id + '-return.zip'} with manifest.json, NOTES.md and QA.md.\n`
    + `Built ${new Date().toISOString().slice(0, 10)}.\n`);

  if (fs.existsSync(plan.zip)) fs.rmSync(plan.zip);
  const winTar = process.platform === 'win32' && process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : null;
  const tarBin = winTar && fs.existsSync(winTar) ? winTar : 'tar';
  const tar = spawnSync(tarBin, ['-a', '-cf', plan.zip, '-C', stage, slug], { stdio: 'inherit' });
  const staged = dirSize(stageRoot);
  fs.rmSync(stage, { recursive: true, force: true });
  if (tar.status !== 0) throw new Error(`tar failed for ${id} (exit ${tar.status}); is bsdtar available?`);
  const mb = fs.statSync(plan.zip).size / 1024 / 1024;
  console.log(`built ${path.relative(ROOT, plan.zip)} (${mb.toFixed(1)} MB zipped, ${(staged / 1024 / 1024).toFixed(1)} MB unpacked)`
    + (sha ? `  source @ ${sha.slice(0, 10)}` : '')
    + (plan.missing.length ? `  — ${plan.missing.length} missing input(s), see inputs/MISSING.txt` : '')
    + (mb > SIZE_WARN_MB ? `  — WARNING: over ${SIZE_WARN_MB} MB, trim inputs before handing off` : ''));
  return plan;
}

const args = process.argv.slice(2);
const list = args.includes('--list');
const ids = args.includes('--all')
  ? [...fs.readdirSync(SESSIONS_DIR).filter((d) => /^S\d-/.test(d)).map((d) => d.slice(0, 2)),
     ...fs.readdirSync(PACKETS_DIR).filter((d) => /^P\d\d-/.test(d)).map((d) => d.slice(0, 3))]
  : args.filter((a) => /^(S\d|P\d\d)$/.test(a));
if (!ids.length) {
  console.error('usage: node scripts/build-ui-packet.mjs S1 [P01 ...] [--list] | --all');
  process.exit(2);
}
for (const id of ids) build(id, { list });
