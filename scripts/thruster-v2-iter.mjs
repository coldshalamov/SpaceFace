#!/usr/bin/env node
/**
 * Mechanical mid-loop harness for thruster-iter-v2.
 * Refuses capture unless:
 *  - change.md for this iter exists and names exactly one residual
 *  - prior iter (if >1) has subagent-review.md + side-by-side-rear34.jpg
 * Writes rear/rear34/bloom-off via capture-thruster-lookdev, then side-by-side.
 *
 * Usage:
 *   node scripts/thruster-v2-iter.mjs --iter 03
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCRATCH = process.env.SF_THRUSTER_SCRATCH
  || 'C:\\Users\\93rob\\AppData\\Local\\Temp\\grok-goal-84ac37de3291\\implementer';
const V2 = path.join(SCRATCH, 'thruster-iter-v2');
const REFS = path.join(SCRATCH, 'refs');
const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const ITER = String(arg('iter', '01')).padStart(2, '0');
const n = Number(ITER);
if (!(n >= 1 && n <= 20)) {
  console.error('iter must be 01..20');
  process.exit(2);
}

const dir = path.join(V2, `iter-${ITER}`);
const changePath = path.join(dir, 'change.md');
if (!existsSync(changePath)) {
  console.error(`REFUSE: missing ${changePath} — write substantive change.md first (one residual).`);
  process.exit(3);
}
const changeText = await readFile(changePath, 'utf8');
const residualMatch = changeText.match(/^\s*residual:\s*(.+)$/im);
if (!residualMatch) {
  console.error('REFUSE: change.md must contain a line `residual: <name>` naming exactly one residual.');
  process.exit(4);
}
console.log(`residual target: ${residualMatch[1].trim()}`);

if (n > 1) {
  const prev = String(n - 1).padStart(2, '0');
  const prevDir = path.join(V2, `iter-${prev}`);
  const need = ['subagent-review.md', 'side-by-side-rear34.jpg', 'rear34.png'];
  for (const f of need) {
    if (!existsSync(path.join(prevDir, f))) {
      console.error(`REFUSE: prior iter-${prev} missing ${f} — complete prior mid-loop first.`);
      process.exit(5);
    }
  }
  const rev = await readFile(path.join(prevDir, 'subagent-review.md'), 'utf8');
  if (!/keep|revise/i.test(rev)) {
    console.error(`REFUSE: prior review must state keep or revise.`);
    process.exit(6);
  }
}

await mkdir(dir, { recursive: true });

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: true });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))));
  });
}

// Capture into scratch v2
await run('node', [
  'scripts/capture-thruster-lookdev.mjs',
  '--out', V2,
  '--iter', ITER,
  '--frames', '140',
]);

// Side-by-side via python PIL
const py = `
from pathlib import Path
from PIL import Image, ImageDraw
ref = Path(r${JSON.stringify(path.join(REFS, 'ref-single-jet.jpg'))})
cand = Path(r${JSON.stringify(path.join(dir, 'rear34-bloom-off.png'))})
if not cand.exists():
  cand = Path(r${JSON.stringify(path.join(dir, 'rear34.png'))})
out = Path(r${JSON.stringify(path.join(dir, 'side-by-side-rear34.jpg'))})
a = Image.open(ref).convert('RGB')
b = Image.open(cand).convert('RGB')
h = 400
a = a.resize((int(a.width*h/a.height), h), Image.Resampling.LANCZOS)
b = b.resize((int(b.width*h/b.height), h), Image.Resampling.LANCZOS)
c = Image.new('RGB', (a.width+b.width+36, h+36), (10,14,22))
c.paste(a, (12, 24)); c.paste(b, (24+a.width, 24))
d = ImageDraw.Draw(c)
d.text((12, 4), 'REF liquid plasma', fill=(180,220,255))
d.text((24+a.width, 4), f'v2 iter-${ITER} bloom-off', fill=(180,220,255))
c.save(out, quality=90)
print('wrote', out)
`;
const pyPath = path.join(dir, '_sidebyside.py');
await writeFile(pyPath, py);
await run('python', [pyPath]);

await writeFile(path.join(dir, 'CAPTURED.md'), `Captured ${new Date().toISOString()}\nresidual: ${residualMatch[1].trim()}\nAwaiting fresh subagent-review.md before next iter.\n`);
console.log(`OK iter-${ITER} captures + side-by-side ready for independent review`);
