import fs from 'node:fs';
import path from 'node:path';

function walk(d) {
  let r = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'build', 'dist', '.tmp'].includes(e.name)) continue;
      r = r.concat(walk(p));
    } else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) {
      r.push(p);
    }
  }
  return r;
}

const evs = new Set();
const re = /\.emit\(\s*['"`]([a-z][a-z:_-]+)/g;
for (const f of walk('src')) {
  let s;
  try { s = fs.readFileSync(f, 'utf8'); } catch { continue; }
  let m;
  while ((m = re.exec(s))) evs.add(m[1]);
}

const rel = [...evs].filter((e) => /^(game|new|start|ready|boot|spawn|player|sector|ship|load|save|scene)/.test(e)).sort();
console.log('RELEVANT EVENTS:');
console.log(rel.join('\n'));
