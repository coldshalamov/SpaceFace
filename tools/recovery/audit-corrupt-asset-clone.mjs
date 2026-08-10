#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, relative, extname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..').replace(/\\/g, '/');
const CLONE_ROOT = 'C:/Users/93rob/.grok/worktrees/github-spaceface/subagent-019f50fb-0f1e-7a41-84dc-20c752d5c041';
const REPORT_PATH = join(REPO_ROOT, 'design/program/roadmap/receipts/REC-GROK-KES-SALVAGE-REPORT.md').replace(/\\/g, '/');

const ASSET_EXT = new Set(['.blend', '.glb', '.gltf', '.png', '.jpg', '.jpeg', '.ktx2', '.exr']);
const EVIDENCE_EXT = new Set(['.json', '.md', '.py']);
const AUDIT_EXT = new Set([...ASSET_EXT, ...EVIDENCE_EXT]);
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const KIND_ORDER = ['.blend', '.glb', '.gltf', '.exr', '.ktx2', '.png', '.jpg', '.jpeg', '.json', '.py', '.md'];

function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    const s = createReadStream(p);
    s.on('data', d => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

function isUnderNodeModules(rel) {
  return rel.split('/').includes('node_modules');
}

function relOf(root, full) {
  return relative(root, full).split(sep).join('/');
}

function stemOf(filename) {
  let s = basename(filename).toLowerCase();
  const ext = extname(filename).toLowerCase();
  if (ext) s = s.slice(0, -ext.length);
  s = s.replace(/_lod\d+$/, '').replace(/[_-]v?\d{1,3}$/, '').replace(/[_-]\d{1,3}$/, '');
  return s;
}

function kindOf(ext) {
  if (ext === '.blend') return 'blend';
  if (ext === '.glb') return 'glb';
  if (ext === '.gltf') return 'gltf';
  if (ext === '.png') return 'png';
  if (ext === '.jpg' || ext === '.jpeg') return 'jpg';
  if (ext === '.ktx2') return 'ktx2';
  if (ext === '.exr') return 'exr';
  if (ext === '.json') return 'json';
  if (ext === '.md') return 'md';
  if (ext === '.py') return 'py';
  return ext.replace('.', '');
}

function kindRank(ext) {
  const i = KIND_ORDER.indexOf(ext);
  return i === -1 ? 99 : i;
}

async function walkClone() {
  const auditFiles = [];
  const totals = { totalFiles: 0, totalBytes: 0, byExt: {}, nodeModulesPresent: false, skippedDirs: SKIP_DIRS };
  async function rec(dir) {
    let ents;
    try { ents = await readdir(dir, { withFileTypes: true }); }
    catch (e) { return; }
    for (const e of ents) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) {
          if (e.name === 'node_modules') totals.nodeModulesPresent = true;
          continue;
        }
        await rec(full);
      } else if (e.isFile()) {
        let st;
        try { st = await stat(full); } catch { continue; }
        totals.totalFiles++;
        totals.totalBytes += st.size;
        const ext = extname(e.name).toLowerCase();
        totals.byExt[ext] = (totals.byExt[ext] || 0) + 1;
        if (AUDIT_EXT.has(ext)) {
          const rel = relOf(CLONE_ROOT, full);
          if (isUnderNodeModules(rel)) continue;
          let sha;
          try { sha = await sha256File(full); } catch (e) { continue; }
          auditFiles.push({ rel, full, ext, bytes: st.size, sha, kind: kindOf(ext) });
        }
      }
    }
  }
  await rec(CLONE_ROOT);
  return { auditFiles, totals };
}

async function gitFingerprint() {
  const g = join(CLONE_ROOT, '.git');
  const out = { root: g, head: null, headTarget: null, headResolvable: false, index: null, packedRefs: null, refs: [], objects: null, commitEditmsg: null, config: null };
  try { out.head = (await readFile(join(g, 'HEAD'), 'utf8')).replace(/\r?\n$/, ''); } catch (e) { out.head = `READ_FAIL: ${e.message}`; }
  try {
    const ip = join(g, 'index');
    const st = await stat(ip);
    out.index = { size: st.size, sha256: await sha256File(ip) };
  } catch (e) { out.index = { error: e.message }; }
  try { out.packedRefs = (await readFile(join(g, 'packed-refs'), 'utf8')).replace(/\r?\n$/, '\n'); } catch (e) { out.packedRefs = `MISSING: ${e.message}`; }
  try { out.commitEditmsg = (await readFile(join(g, 'COMMIT_EDITMSG'), 'utf8')).replace(/\r?\n$/, ''); } catch (e) { out.commitEditmsg = `MISSING: ${e.message}`; }
  try { out.config = (await readFile(join(g, 'config'), 'utf8')).replace(/\r?\n$/, '\n'); } catch (e) { out.config = `MISSING: ${e.message}`; }
  async function recRefs(d, prefix = '') {
    let ents;
    try { ents = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const full = join(d, e.name);
      if (e.isDirectory()) await recRefs(full, prefix + e.name + '/');
      else {
        let c;
        try { c = (await readFile(full, 'utf8')).replace(/\r?\n$/, ''); } catch { c = 'READ_FAIL'; }
        out.refs.push({ path: 'refs/' + prefix + e.name, target: c });
      }
    }
  }
  await recRefs(join(g, 'refs'));
  const objs = { looseDirs: 0, looseObjects: 0, packfiles: 0, other: [] };
  try {
    const oe = await readdir(join(g, 'objects'), { withFileTypes: true });
    for (const e of oe) {
      if (e.isDirectory()) {
        if (e.name === 'pack') {
          try { const ps = await readdir(join(g, 'objects', 'pack')); objs.packfiles = ps.filter(p => p.endsWith('.pack')).length; } catch {}
        } else if (/^[0-9a-f]{2}$/.test(e.name)) {
          objs.looseDirs++;
          try { objs.looseObjects += (await readdir(join(g, 'objects', e.name))).length; } catch {}
        } else { objs.other.push(e.name + '/'); }
      } else { objs.other.push(e.name); }
    }
  } catch (e) { objs.error = e.message; }
  out.objects = objs;
  if (out.head && out.head.startsWith('ref: ')) {
    out.headTarget = out.head.slice(5).trim();
    out.headResolvable = out.refs.some(r => r.path === out.headTarget) || (typeof out.packedRefs === 'string' && out.packedRefs.includes(out.headTarget));
  } else {
    out.headResolvable = /^[0-9a-f]{40}$/.test(out.head || '');
  }
  return out;
}

function repoTrackedList() {
  return new Promise((resolve, reject) => {
    const p = spawn('git', ['ls-tree', '-r', 'HEAD', '--name-only'], { cwd: REPO_ROOT, shell: false });
    let out = '';
    let err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => {
      if (code !== 0) reject(new Error('git ls-tree failed code=' + code + ' stderr=' + err));
      else resolve(out.split('\n').map(s => s.trim()).filter(Boolean));
    });
    p.on('error', reject);
  });
}

async function buildRepoIndexes(trackedPaths) {
  const bySha = new Map();
  const byBasename = new Map();
  const byStem = new Map();
  const auditableTracked = [];
  for (const rel of trackedPaths) {
    const ext = extname(rel).toLowerCase();
    const base = basename(rel);
    const stem = stemOf(rel);
    if (!byBasename.has(base)) byBasename.set(base, []);
    byBasename.get(base).push(rel);
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(rel);
    if (AUDIT_EXT.has(ext)) auditableTracked.push(rel);
  }
  for (const rel of auditableTracked) {
    const full = join(REPO_ROOT, ...rel.split('/'));
    let sha;
    try { sha = await sha256File(full); } catch (e) { continue; }
    if (!bySha.has(sha)) bySha.set(sha, []);
    bySha.get(sha).push(rel);
  }
  return { bySha, byBasename, byStem, auditableTrackedCount: auditableTracked.length };
}

function nearNameCandidates(rel, repoIdx) {
  const base = basename(rel);
  const stem = stemOf(rel);
  const exactBasename = (repoIdx.byBasename.get(base) || []).filter(p => p !== rel);
  const sameStem = (repoIdx.byStem.get(stem) || []).filter(p => p !== rel && basename(p) !== base);
  const uniq = [...new Set([...exactBasename, ...sameStem])];
  return { exactBasename, sameStem, all: uniq };
}

function dispositionOf(family, repoIdx) {
  if (family.bytes === 0) return { d: 'DROP', why: 'empty file (worthless)' };
  const exact = repoIdx.bySha.get(family.sha);
  if (exact && exact.length) return { d: 'DROP', why: 'byte-identical to tracked repo file(s)', trackedMatches: exact };
  const sample = family.members[0];
  const nn = nearNameCandidates(sample.rel, repoIdx);
  const isAsset = ASSET_EXT.has(family.ext);
  if (!isAsset) {
    if (nn.all.length) return { d: 'DROP', why: 'distinct evidence file superseded by current tracked counterpart', trackedMatches: [], nearName: nn };
    return { d: 'PRESERVE', why: `distinct ${family.kind} evidence, no current tracked owner`, trackedMatches: [], nearName: nn, evidence: `orphan ${family.kind} (${family.bytes}B); may correspond to a deleted index row (unknown)` };
  }
  if (nn.all.length) return { d: 'ADAPT', why: 'distinct asset variant; near-name candidate in current repo', trackedMatches: [], nearName: nn, relation: nn.all[0] };
  return { d: 'PRESERVE', why: `distinct ${family.kind} asset, no current tracked owner`, trackedMatches: [], nearName: nn, evidence: `orphan authored ${family.kind} (${family.bytes}B); no current asset family owns it` };
}

function reduceFamilies(auditFiles, repoIdx) {
  const bySha = new Map();
  for (const f of auditFiles) {
    if (!bySha.has(f.sha)) bySha.set(f.sha, { sha: f.sha, ext: f.ext, kind: f.kind, bytes: f.bytes, members: [] });
    bySha.get(f.sha).members.push(f);
  }
  const families = [...bySha.values()];
  for (const fam of families) {
    fam.members.sort((a, b) => a.rel.localeCompare(b.rel));
  }
  for (const fam of families) {
    fam.disposition = dispositionOf(fam, repoIdx);
  }
  families.sort((a, b) => {
    const ka = kindRank(a.ext), kb = kindRank(b.ext);
    if (ka !== kb) return ka - kb;
    return b.bytes - a.bytes;
  });
  return families;
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KiB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MiB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GiB';
}

function trunc(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '\u2026';
}

function topExtBreakdown(byExt) {
  return Object.entries(byExt).sort((a, b) => b[1] - a[1]);
}

function renderReport(freeze, ledger, repoIdx, tallies, generatedAt) {
  const L = [];
  const push = (s) => L.push(s);

  push('<!-- LIFETIME: STABLE -->');
  push('# REC-GROK-KES-SALVAGE \u2014 Corrupt Grok clone forensic ledger');
  push('');
  push('> **Phase: Ledger only (steps 1\u20132 of the route).** This phase never deletes anything and never');
  push('> mutates the source clone. Preservation copies (route step 4) and the destructive close (route step 5)');
  push('> are a separate controller-gated action \u2014 see **PHASE 2 (not executed)** below.');
  push('');
  push('- **Authority:** `CANONICAL_BUILD_MAP.md` \u00a7 REC-GROK-KES-SALVAGE; `design/program/WORKTREE_RECOVERY.md`.');
  push('- **Source (frozen, read-only):** `' + freeze.cloneRoot + '`');
  push('- **Auditing tool:** `tools/recovery/audit-corrupt-asset-clone.mjs` (this run).');
  push('- **Generated:** ' + generatedAt + ' (idempotent; re-running regenerates an identical ledger).');
  push('- **Read policy:** the tool inspected `.git` files via plain filesystem reads only (no `git` subprocess');
  push('  ran against the clone, no object-store walking that could rewrite anything) and read the **contents** of');
  push('  only Blender/GLB/image/build-evidence files. It never wrote to, repaired, checked out, cleaned, or merged');
  push('  anything inside the clone.');
  push('');

  push('## 1. Freeze record (as found)');
  push('');
  push('| field | value |');
  push('|---|---|');
  push('| Clone path | `' + freeze.cloneRoot + '` |');
  push('| Total working files (excludes `.git`, `node_modules`) | ' + freeze.totals.totalFiles.toLocaleString() + ' |');
  push('| Total working bytes (excludes `.git`, `node_modules`) | ' + fmtBytes(freeze.totals.totalBytes) + ' (' + freeze.totals.totalBytes.toLocaleString() + ' B) |');
  push('| `node_modules` present in clone | ' + (freeze.totals.nodeModulesPresent ? 'yes (excluded from audit)' : 'no') + ' |');
  push('| `.git/HEAD` content | `' + (freeze.git.head || '') + '` |');
  push('| HEAD target ref | `' + (freeze.git.headTarget || '(literal SHA)') + '` |');
  push('| HEAD resolvable to a ref/SHA | **' + (freeze.git.headResolvable ? 'YES' : 'NO \u2014 corrupt/unresolvable') + '** |');
  push('| `.git/index` | ' + (freeze.git.index && freeze.git.index.size != null ? fmtBytes(freeze.git.index.size) + ' (' + freeze.git.index.size.toLocaleString() + ' B), SHA-256 `' + freeze.git.index.sha256 + '`' : (freeze.git.index && freeze.git.index.error ? 'MISSING (' + freeze.git.index.error + ')' : 'n/a')) + ' |');
  push('| `packed-refs` | ' + (typeof freeze.git.packedRefs === 'string' && freeze.git.packedRefs.startsWith('MISSING') ? 'MISSING' : 'present') + ' |');
  push('| `.git/COMMIT_EDITMSG` | `' + trunc(freeze.git.commitEditmsg, 80) + '` |');
  push('| `.git/objects` loose object dirs | ' + freeze.git.objects.looseDirs + ' |');
  push('| `.git/objects` loose objects (approx) | ' + freeze.git.objects.looseObjects.toLocaleString() + ' |');
  push('| `.git/objects` packfiles | ' + freeze.git.objects.packfiles + ' |');
  push('');
  push('**Ref table as found** (refs actually present on disk):');
  if (freeze.git.refs.length === 0) {
    push('');
    push('- _None._ `refs/heads/` exists but contains no `master` ref, so the `ref: refs/heads/master` HEAD is');
  push('  unresolvable. This is the known corrupt/incomplete object-store state: loose objects exist but no ref');
  push('  points anywhere reachable, and there are no packfiles.');
  } else {
    push('');
    push('| ref path | target |');
    push('|---|---|');
    for (const r of freeze.git.refs) push('| `' + r.path + '` | `' + trunc(r.target, 64) + '` |');
  }
  push('');
  push('**Top extension breakdown of all working files** (as found, excludes `.git`/`node_modules`):');
  push('');
  push('| ext | count | ext | count |');
  push('|---|---:|---|---:|');
  const extRows = topExtBreakdown(freeze.totals.byExt);
  const cols = 4;
  const rows = Math.ceil(extRows.length / cols);
  for (let i = 0; i < rows; i++) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const idx = i + c * rows;
      if (idx < extRows.length) cells.push('`' + (extRows[idx][0] || '(none)') + '`', extRows[idx][1].toLocaleString());
      else cells.push('', '');
    }
    push('| ' + cells.join(' | ') + ' |');
  }
  push('');
  push('> Note: `.blend1`/`.blend11` Blender auto-save backups (' + (freeze.totals.byExt['.blend1'] || 0) + ' / ' + (freeze.totals.byExt['.blend11'] || 0) + ' files) exist on disk but are **outside** the packet\'s audited extension set (`.blend` only). They are recorded here for the freeze record and would be scoped in Phase 2 if any prove valuable.');
  push('');

  push('## 2. Audit methodology');
  push('');
  push('- **Audited extensions (content-hashed):** ' + [...AUDIT_EXT].join(', ') + '.');
  push('- **Exclusions:** `.git/`, `node_modules/`, and any file whose extension is not in the audited set.');
  push('- **Per file recorded:** relative path (clone-relative, forward slashes), kind, bytes, SHA-256.');
  push('- **Reduce:** byte-identical files are grouped into one unique **family** (by SHA-256). Each family receives');
  push('  one disposition; member files inherit it. Per-file detail is retained in the family\'s member list.');
  push('- **Current-repo comparison:** tracked files at **this worktree\'s HEAD** (via `git ls-tree -r HEAD');
  push('  --name-only` run in the current repo \u2014 never against the clone). Exact-hash matches and near-name');
  push('  candidates (exact basename, or same normalized stem after stripping `_lodN`/`_vN`/`_N` suffixes) are recorded.');
  push('- **Disposition rules (mechanistic, no guesswork):**');
  push('  - `DROP` \u2014 byte-identical to a tracked file, or empty, or a distinct *evidence* file (`.json`/`.md`/`.py`) that has a current tracked near-name counterpart (superseded).');
  push('  - `ADAPT` \u2014 a distinct *asset* file (`.blend`/`.glb`/`.gltf`/`.png`/`.jpg`/`.jpeg`/`.ktx2`/`.exr`) with a near-name candidate in the current repo; the related current asset family is named.');
  push('  - `PRESERVE` \u2014 distinct and non-empty with **no** current tracked owner (no exact hash, no near-name). Evidence for the value is stated; deleted git index rows are recorded as unknowns, never reconstructed by guesswork.');
  push('  - Visual alternatives default to `ADAPT`, not replacement: a donor is not a candidate and carries no inherited G0\u2013G7 acceptance.');
  push('');

  push('## 3. Duplicate-reduction stats');
  push('');
  push('| metric | value |');
  push('|---|---:|');
  push('| Audited files (clone) | ' + ledger.auditFiles.length.toLocaleString() + ' |');
  push('| Audited bytes (clone) | ' + fmtBytes(ledger.auditBytes) + ' (' + ledger.auditBytes.toLocaleString() + ' B) |');
  push('| Unique families (by SHA-256) | ' + ledger.families.length.toLocaleString() + ' |');
  push('| Families byte-identical to tracked (DROP-by-hash) | ' + tallies.dropByHash + ' |');
  push('| Distinct families (no exact tracked match) | ' + (ledger.families.length - tallies.dropByHash) + ' |');
  push('| Current-repo auditable tracked files hashed | ' + repoIdx.auditableTrackedCount.toLocaleString() + ' |');
  push('| Current-repo unique hashes | ' + repoIdx.bySha.size.toLocaleString() + ' |');
  push('');
  push('**Audited files by kind (clone):**');
  push('');
  push('| kind | files | unique families | bytes |');
  push('|---|---:|---:|---:|');
  for (const k of tallies.kindRows) push('| ' + k.kind + ' | ' + k.files + ' | ' + k.families + ' | ' + fmtBytes(k.bytes) + ' |');
  push('');
  push('**Disposition tallies (per unique family):**');
  push('');
  push('| disposition | families | member files | bytes |');
  push('|---|---:|---:|---:|');
  for (const d of ['DROP', 'ADAPT', 'PRESERVE']) {
    const t = tallies.byDisp[d] || { families: 0, files: 0, bytes: 0 };
    push('| `' + d + '` | ' + t.families + ' | ' + t.files + ' | ' + fmtBytes(t.bytes) + ' |');
  }
  push('');

  push('## 4. Full ledger (one row per unique family, reduced)');
  push('');
  push('Families are sorted by kind (`.blend` first) then bytes descending. `members` shows the count of clone');
  push('files sharing this exact hash with up to 3 sample relative paths. `tracked#` is the count of current-repo');
  push('tracked files with the identical SHA-256. `near-name` lists up to 2 current-repo near-name candidates.');
  push('');
  push('| # | kind | bytes | members | SHA-256 (16) | tracked# | near-name candidates | disp | relation / evidence |');
  push('|---:|---|---:|---|---|---:|---|---|---|');
  for (let i = 0; i < ledger.families.length; i++) {
    const f = ledger.families[i];
    const d = f.disposition;
    const memberPaths = f.members.slice(0, 3).map(m => '`' + trunc(m.rel, 48) + '`').join('<br>');
    const trackedCount = (d.trackedMatches || []).length;
    const trackedPaths = (d.trackedMatches || []).slice(0, 2).map(p => '`' + trunc(p, 48) + '`').join('<br>');
    const near = (d.nearName ? d.nearName.all : []).slice(0, 2).map(p => '`' + trunc(p, 44) + '`').join('<br>');
    let relEv = '';
    if (d.d === 'DROP') relEv = d.why + (trackedPaths ? '<br>=' + trackedPaths : '');
    else if (d.d === 'ADAPT') relEv = 'family: `' + trunc(d.relation || '', 56) + '`';
    else relEv = d.evidence || d.why;
    push('| ' + (i + 1) + ' | ' + f.kind + ' | ' + fmtBytes(f.bytes) + ' | ' + f.members.length + ' (' + memberPaths + ') | `' + f.sha.slice(0, 16) + '` | ' + trackedCount + ' | ' + (near || '\u2014') + ' | ' + d.d + ' | ' + relEv + ' |');
  }
  push('');
  push('**Full SHA-256 index** (family # \u2192 full 64-char hash, for forensic verification):');
  push('');
  push('| # | kind | bytes | SHA-256 |');
  push('|---:|---|---:|---|');
  for (let i = 0; i < ledger.families.length; i++) {
    const f = ledger.families[i];
    push('| ' + (i + 1) + ' | ' + f.kind + ' | ' + fmtBytes(f.bytes) + ' | `' + f.sha + '` |');
  }
  push('');

  push('## 5. PHASE 2 (not executed): preservation copies + deletion gate');
  push('');
  push('> **This ledger phase does not perform Phase 2.** The following is the exact, pre-staged plan for a future');
  push('> controller-gated action. No copies have been made. No deletion has occurred or is recommended by this report');
  push('> beyond listing the gate conditions below.');
  push('');
  push('Phase 2 of the route (CANONICAL_BUILD_MAP steps 4\u20135) may, only after separate authorization:');
  push('');
  push('1. **Preservation copies.** Copy only selected non-runtime donors from ADAPT/PRESERVE families into a stable');
  push('  `assets/ships/<new-family>/reference/recovered_grok/` path with provenance and frozen current-asset hashes.');
  push('  Any actual Kestrel/player-ship replacement or reauthor becomes its own G0\u2013G7 packet.');
  push('2. **Deletion gate.** Delete only the exact clone path, and only when **all** of the following hold:');
  push('   - every unique family has a recorded disposition (`DROP`/`ADAPT`/`PRESERVE`);');
  push('   - every `ADAPT`/`PRESERVE` family whose bytes are to survive has a tracked, hash-verified copy;');
  push('   - the complete decision matrix is committed and pushed in this report; and');
  push('   - the exact clone path is re-resolved and confirmed to have no live writer/process.');
  push('');
  push('**ADAPT/PRESERVE families that would need preservation copies before any deletion**');
  push('(sorted by kind then bytes descending; the highest-salvage-value rows are at the top):');
  push('');
  let adaptPreserve = ledger.families.filter(f => f.disposition.d === 'ADAPT' || f.disposition.d === 'PRESERVE');
  const apCount = adaptPreserve.length;
  push('Total ADAPT/PRESERVE families: **' + apCount + '** (' + tallies.byDisp.ADAPT.families + ' ADAPT, ' + tallies.byPreserve.families + ' PRESERVE).');
  push('');
  if (apCount === 0) {
    push('_None \u2014 every audited family is `DROP` (byte-identical to tracked or superseded evidence)._');
  } else {
    push('| # | kind | bytes | disp | SHA-256 (16) | clone members (sample) | relation / evidence |');
    push('|---:|---|---:|---|---|---|---|');
    for (let i = 0; i < adaptPreserve.length; i++) {
      const f = adaptPreserve[i];
      const d = f.disposition;
      const members = f.members.slice(0, 3).map(m => '`' + trunc(m.rel, 50) + '`').join('<br>');
      let relEv = d.d === 'ADAPT' ? ('family: `' + trunc(d.relation || '', 60) + '`') : (d.evidence || d.why);
      push('| ' + (i + 1) + ' | ' + f.kind + ' | ' + fmtBytes(f.bytes) + ' | ' + d.d + ' | `' + f.sha.slice(0, 16) + '` | ' + members + ' | ' + relEv + ' |');
    }
  }
  push('');
  push('If Phase 2 is later authorized, the integrator must: copy each chosen donor, commit and push the donor with');
  push('provenance, re-verify the clone path is still the exact frozen path with no live writer, delete only that');
  push('clone path, then update this report and the worktree-recovery catalog. **Stop without deletion if any ledger');
  push('row lacks a disposition or any selected bytes are not durably tracked.**');
  push('');

  push('## 6. Tool run + idempotency');
  push('');
  push('- Command: `node tools/recovery/audit-corrupt-asset-clone.mjs`');
  push('- Writes only this report (`' + REPORT_PATH + '`). Writes nothing to the clone. No JSON sidecar.');
  push('- Deterministic: file walk, `git ls-tree` output, and SHA-256 are all order-stable, so re-running');
  push('  regenerates a byte-identical ledger (modulo the `Generated` timestamp).');
  push('- This phase changed no product code; `npm run check:baseline` is expected to remain untouched-green.');
  push('');

  return L.join('\n');
}

async function main() {
  const started = Date.now();
  process.stderr.write('[audit] freezing source + reading .git fingerprint ...\n');
  const [cloneWalk, git] = await Promise.all([walkClone(), gitFingerprint()]);
  const freeze = { cloneRoot: CLONE_ROOT, totals: cloneWalk.totals, git };
  process.stderr.write('[audit] clone working files: ' + cloneWalk.totals.totalFiles + ' (' + fmtBytes(cloneWalk.totals.totalBytes) + '); auditable: ' + cloneWalk.auditFiles.length + '\n');
  process.stderr.write('[audit] enumerating current-repo tracked files at HEAD ...\n');
  const tracked = await repoTrackedList();
  process.stderr.write('[audit] hashing ' + tracked.filter(p => AUDIT_EXT.has(extname(p).toLowerCase())).length + ' current-repo auditable files ...\n');
  const repoIdx = await buildRepoIndexes(tracked);
  process.stderr.write('[audit] reducing ' + cloneWalk.auditFiles.length + ' clone files to unique families + dispositions ...\n');
  const families = reduceFamilies(cloneWalk.auditFiles, repoIdx);
  const auditBytes = cloneWalk.auditFiles.reduce((s, f) => s + f.bytes, 0);
  const ledger = { auditFiles: cloneWalk.auditFiles, auditBytes, families };

  const byDisp = { DROP: { families: 0, files: 0, bytes: 0 }, ADAPT: { families: 0, files: 0, bytes: 0 }, PRESERVE: { families: 0, files: 0, bytes: 0 } };
  let dropByHash = 0;
  for (const f of families) {
    const t = byDisp[f.disposition.d];
    t.families++; t.files += f.members.length; t.bytes += f.bytes * f.members.length;
    if (f.disposition.why && f.disposition.why.startsWith('byte-identical')) dropByHash++;
  }
  const kindMap = new Map();
  for (const f of families) {
    if (!kindMap.has(f.kind)) kindMap.set(f.kind, { kind: f.kind, files: 0, families: 0, bytes: 0 });
    const k = kindMap.get(f.kind);
    k.families++; k.bytes += f.bytes;
  }
  for (const f of cloneWalk.auditFiles) {
    if (!kindMap.has(f.kind)) kindMap.set(f.kind, { kind: f.kind, files: 0, families: 0, bytes: 0 });
    kindMap.get(f.kind).files++;
  }
  const kindRows = [...kindMap.values()].sort((a, b) => kindRank('.' + a.kind) - kindRank('.' + b.kind) || b.bytes - a.bytes);
  const tallies = { byDisp, dropByHash, kindRows, byPreserve: byDisp.PRESERVE };

  const generatedAt = new Date().toISOString();
  const md = renderReport(freeze, ledger, repoIdx, tallies, generatedAt);
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await import('node:fs/promises').then(m => m.writeFile(REPORT_PATH, md, 'utf8'));
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  process.stderr.write('[audit] wrote ' + REPORT_PATH + ' in ' + elapsed + 's\n');
  const out = {
    freeze: { totalFiles: freeze.totals.totalFiles, totalBytes: freeze.totals.totalBytes, headResolvable: freeze.git.headResolvable, looseObjects: freeze.git.objects.looseObjects, packfiles: freeze.git.objects.packfiles, refs: freeze.git.refs.length },
    audit: { files: ledger.auditFiles.length, bytes: ledger.auditBytes, families: ledger.families.length, repoAuditableHashed: repoIdx.auditableTrackedCount, repoUniqueHashes: repoIdx.bySha.size },
    dispositions: { DROP: byDisp.DROP.families, ADAPT: byDisp.ADAPT.families, PRESERVE: byDisp.PRESERVE.families, dropByHash }
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

main().catch(e => { process.stderr.write('[audit] FATAL: ' + (e && e.stack || e) + '\n'); process.exit(1); });
