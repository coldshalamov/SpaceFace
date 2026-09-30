// Commit ONLY your own edits to files that other lanes have uncommitted changes in (a hunk-only commit).
//
// Why: `git add -- <path>` stages the WHOLE file, so a pathspec commit of a file another lane is still editing sweeps
// their half-finished hunks into your commit (AGENTS.md section 3). This builds the commit from the committed (HEAD)
// blob plus ONLY your replacements, with a temporary index and a compare-and-swap update-ref, and never touches the
// working tree except to apply the same replacements to the working file.
//
// usage: node scripts/commit-mine.cjs <spec.json>   (spec shape below; then read `git show --stat HEAD`)
// spec: { "message": "...",
//         "files": [ { "path": "src/x.js", "replacements": [ ["old exact text", "new text"], ... ] } ],
//         "whole": [ "path/of/a/file/that/is/entirely/mine.js", ... ]   // optional: new/clean files, taken as on disk
//       }
//
// For each `files` entry: take the COMMITTED (HEAD) content, apply my replacements to it (each `old`
// must appear exactly once), write that blob into a temporary index built from HEAD, commit-tree it,
// and move the branch with a compare-and-swap update-ref (fails safely if HEAD moved). Then apply the
// same replacements to the WORKING file (skipped when the working file already contains the new text)
// and set the real index entry to the new blob so `git status` shows only the other lane's remaining
// diff. `whole` files are hashed from disk as-is (use only for files no other lane is editing).
// Replacement text is written with \n in the spec; when the file uses CRLF it is converted per file.
// It never touches any other path, so nothing else can be swept in.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 28, encoding: 'utf8', ...opts });
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const head = git(['rev-parse', 'HEAD']).trim();
const tmpIndex = path.join(require('os').tmpdir(), `commit-mine-${process.pid}.index`);
const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
try { fs.unlinkSync(tmpIndex); } catch (_) { /* fresh */ }
git(['read-tree', head], { env });
const CRLF = '\r\n';
const toCrlf = (t) => t.replace(/\r?\n/g, CRLF);
const newBlobs = [];
for (const file of spec.files || []) {
  let text = git(['show', `${head}:${file.path}`]);
  const crlf = text.includes(CRLF);
  for (const [f, t] of file.replacements) {
    const from = crlf ? toCrlf(f) : f;
    const to = crlf ? toCrlf(t) : t;
    const first = text.indexOf(from);
    if (first < 0) throw new Error(`${file.path}: anchor not in HEAD: ${f.slice(0, 70)}`);
    if (text.indexOf(from, first + 1) >= 0) throw new Error(`${file.path}: anchor not unique: ${f.slice(0, 70)}`);
    text = text.replace(from, () => to);
  }
  const tmp = path.join(require('os').tmpdir(), `commit-mine-${process.pid}-${newBlobs.length}.txt`);
  fs.writeFileSync(tmp, text);
  const blob = git(['hash-object', '-w', tmp]).trim();
  fs.unlinkSync(tmp);
  const mode = git(['ls-tree', head, '--', file.path]).split(' ')[0] || '100644';
  git(['update-index', '--cacheinfo', `${mode},${blob},${file.path}`], { env });
  newBlobs.push({ path: file.path, blob, mode });
}
for (const rel of spec.whole || []) {
  const blob = git(['hash-object', '-w', path.join(ROOT, rel)]).trim();
  const inHead = git(['ls-tree', head, '--', rel]).trim();
  const mode = inHead ? inHead.split(' ')[0] : '100644';
  git(['update-index', '--add', '--cacheinfo', `${mode},${blob},${rel}`], { env });
  newBlobs.push({ path: rel, blob, mode });
}
const tree = git(['write-tree'], { env }).trim();
const msgFile = path.join(require('os').tmpdir(), `commit-mine-${process.pid}.msg`);
fs.writeFileSync(msgFile, spec.message);
const commit = git(['commit-tree', tree, '-p', head, '-F', msgFile]).trim();
git(['update-ref', 'refs/heads/master', commit, head]); // compare-and-swap on the old head
// working files: apply the same edits (skip a file the other lane has since changed at the anchor)
for (const file of spec.files || []) {
  const abs = path.join(ROOT, file.path);
  let text = fs.readFileSync(abs, 'utf8');
  const crlf = text.includes(CRLF);
  let ok = true;
  for (const [f, t] of file.replacements) {
    const from = crlf ? toCrlf(f) : f;
    const to = crlf ? toCrlf(t) : t;
    if (text.includes(to)) continue; // already present in the worktree
    const first = text.indexOf(from);
    if (first < 0 || text.indexOf(from, first + 1) >= 0) { ok = false; break; }
    text = text.replace(from, () => to);
  }
  if (ok) fs.writeFileSync(abs, text);
  else console.log(`WARN ${file.path}: worktree anchor moved; worktree left untouched (HEAD has the change)`);
}
for (const b of newBlobs) git(['update-index', '--add', '--cacheinfo', `${b.mode},${b.blob},${b.path}`]);
console.log('committed', commit, 'files:', newBlobs.map((b) => b.path).join(', '));
console.log(git(['show', '--stat', '--format=%h %s', commit]));
