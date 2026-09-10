#!/usr/bin/env node
// Build one UI production packet zip for hand-off (design/frontend/direction/packets/<ID>-*/).
//
//   node scripts/build-ui-packet.mjs P01            → .devshots/ui-packets/P01-<slug>.zip
//   node scripts/build-ui-packet.mjs P01 --list     → print what would be included, build nothing
//   node scripts/build-ui-packet.mjs --all          → build every packet
//
// The packet's PACKET.md starts with a fenced yaml block; only three keys are read here:
//   current: [surface ids]   copied from test/ui-frame-references/<id>-default-1920x1080.png → current/
//   inputs:  [repo paths]    copied into inputs/ (missing ones are listed in inputs/MISSING.txt)
//   returns: <name>          echoed into the zip's root README for the worker
// Everything under packets/_COMMON is copied into every zip. Zips are written with bsdtar (`tar -a`),
// which ships with Windows 10+ and macOS; on Linux install libarchive-tools.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKETS_DIR = path.join(ROOT, 'design', 'frontend', 'direction', 'packets');
const COMMON_DIR = path.join(PACKETS_DIR, '_COMMON');
const REF_DIR = path.join(ROOT, 'test', 'ui-frame-references');
const OUT_DIR = path.join(ROOT, '.devshots', 'ui-packets');

function parseHeader(md) {
  const m = md.match(/^```yaml\r?\n([\s\S]*?)\r?\n```/);
  const out = { current: [], inputs: [], returns: '', title: '', packet: '' };
  if (!m) return out;
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim();
    const kv = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    if (key === 'current' || key === 'inputs' || key === 'dependsOn') {
      const inner = value.replace(/^\[|\]$/g, '').trim();
      out[key] = inner ? inner.split(',').map((s) => s.trim()).filter(Boolean) : [];
    } else {
      out[key] = value.trim();
    }
  }
  return out;
}

function packetDirFor(id) {
  const dirs = fs.readdirSync(PACKETS_DIR).filter((d) => d.startsWith(id + '-'));
  if (dirs.length !== 1) throw new Error(`packet ${id}: expected one folder, found ${dirs.length}`);
  return path.join(PACKETS_DIR, dirs[0]);
}

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

function build(id, { list = false } = {}) {
  const dir = packetDirFor(id);
  const slug = path.basename(dir);
  const md = fs.readFileSync(path.join(dir, 'PACKET.md'), 'utf8');
  const head = parseHeader(md);
  const plan = { zip: path.join(OUT_DIR, `${slug}.zip`), current: [], inputs: [], missing: [] };

  for (const surface of head.current) {
    const f = path.join(REF_DIR, `${surface}-default-1920x1080.png`);
    if (fs.existsSync(f)) plan.current.push(f); else plan.missing.push(`current/${surface} (no reference frame)`);
  }
  for (const rel of head.inputs) {
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f)) plan.inputs.push(rel); else plan.missing.push(`inputs/${rel}`);
  }

  if (list) {
    console.log(`${id} ${head.title}`);
    console.log(`  zip:      ${path.relative(ROOT, plan.zip)}`);
    console.log(`  current:  ${plan.current.map((f) => path.basename(f)).join(', ') || '(none)'}`);
    console.log(`  inputs:   ${plan.inputs.join(', ') || '(none)'}`);
    console.log(`  missing:  ${plan.missing.join(', ') || '(none)'}`);
    return plan;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stage = fs.mkdtempSync(path.join(OUT_DIR, `.stage-${id}-`));
  const rootName = slug;
  const stageRoot = path.join(stage, rootName);
  copyTree(COMMON_DIR, path.join(stageRoot, '_COMMON'));
  copyTree(dir, stageRoot);
  fs.mkdirSync(path.join(stageRoot, 'current'), { recursive: true });
  for (const f of plan.current) fs.copyFileSync(f, path.join(stageRoot, 'current', path.basename(f)));
  fs.mkdirSync(path.join(stageRoot, 'inputs'), { recursive: true });
  for (const rel of plan.inputs) {
    const dst = path.join(stageRoot, 'inputs', rel.replace(/[\\/]/g, '__'));
    fs.copyFileSync(path.join(ROOT, rel), dst);
  }
  if (plan.missing.length) {
    fs.writeFileSync(path.join(stageRoot, 'inputs', 'MISSING.txt'),
      'These inputs were not available when the packet was built. Do not hand this packet off until they exist:\n'
      + plan.missing.map((m) => `- ${m}`).join('\n') + '\n');
  }
  fs.writeFileSync(path.join(stageRoot, 'README.txt'),
    `SpaceFace UI packet ${id} — ${head.title}\n\nRead _COMMON/00_READ_ME_FIRST.md first, then PACKET.md.\n`
    + `Return one zip named ${head.returns || id + '-return.zip'} with manifest.json and NOTES.md.\n`
    + `Built ${new Date().toISOString().slice(0, 10)}.\n`);

  if (fs.existsSync(plan.zip)) fs.rmSync(plan.zip);
  // Git Bash puts GNU tar first on PATH, which reads "C:\..." as a remote host and cannot write zip;
  // Windows ships bsdtar in System32, which does both.
  const winTar = process.platform === 'win32' && process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : null;
  const tarBin = winTar && fs.existsSync(winTar) ? winTar : 'tar';
  const tar = spawnSync(tarBin, ['-a', '-cf', plan.zip, '-C', stage, rootName], { stdio: 'inherit' });
  fs.rmSync(stage, { recursive: true, force: true });
  if (tar.status !== 0) throw new Error(`tar failed for ${id} (exit ${tar.status}); is bsdtar available?`);
  const bytes = fs.statSync(plan.zip).size;
  console.log(`built ${path.relative(ROOT, plan.zip)} (${(bytes / 1024 / 1024).toFixed(1)} MB)`
    + (plan.missing.length ? `  — ${plan.missing.length} missing input(s), see inputs/MISSING.txt` : ''));
  return plan;
}

const args = process.argv.slice(2);
const list = args.includes('--list');
const ids = args.includes('--all')
  ? fs.readdirSync(PACKETS_DIR).filter((d) => /^P\d\d-/.test(d)).map((d) => d.slice(0, 3))
  : args.filter((a) => /^P\d\d$/.test(a));
if (!ids.length) {
  console.error('usage: node scripts/build-ui-packet.mjs P01 [P02 ...] [--list] | --all');
  process.exit(2);
}
for (const id of ids) build(id, { list });
