const { execSync } = require('child_process');
const status = execSync('git status --short').toString().split('\n');
const dirty = new Set(status.filter((l) => /^ M|^M |^A |^\?\?/.test(l)).map((l) => l.slice(3).trim()));
const untracked = status.filter((l) => l.startsWith('??')).map((l) => l.slice(3).trim())
  .filter((f) => f.startsWith('src/') && f.endsWith('.js'));
for (const f of untracked) {
  const base = f.replace(/.*\//, '').replace(/\.js$/, '');
  const pat = base.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '.');
  let hits;
  try {
    hits = execSync('grep -rln "' + pat + '" src/ scripts/ test/ --include=*.js --include=*.mjs')
      .toString().split('\n').filter(Boolean);
  } catch (e) { hits = []; }
  const clean = hits.filter((h) => h !== f && !dirty.has(h));
  if (clean.length) console.log('UNTRACKED-SEAM', f, '<-', clean.join(', '));
}
