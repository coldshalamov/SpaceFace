// A bus handler that calls a method the class does not define throws inside the sim worker, and the
// worker then closes the simulation ("FLIGHT INTERRUPTED"). shadowCoachPlant's run:ended handler
// called this._reset() (it only has _resetRun) and ended every Swarm run at the end of round 2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Plants, plus the Swarm/survival systems that share the run:ended reset pattern. (missions.js mixes
// its handlers in from other modules, so a same-file check would be wrong there.)
const DIRS = ['src/systems/plants', 'src/systems'];
const INCLUDE = (dir, f) => dir.endsWith('plants') || /^(swarm|survival)/.test(f);
const HANDLER = /on\(\s*'[^']+'\s*,\s*\([^)]*\)\s*=>\s*this\.(_[A-Za-z0-9]+)\(/g;

function defines(src, name) {
  const lines = src.split('\n');
  return lines.some((line) => {
    const t = line.trim();
    return t.startsWith(`${name}(`) || t.startsWith(`async ${name}(`)
      || t.includes(`${name} = (`) || t.includes(`${name} = function`) || t.includes(`${name}: function`)
      || t.includes(`this.${name} =`);
  });
}

test('every on(event, () => this._name(...)) handler calls a method its file defines', () => {
  const missing = [];
  for (const dir of DIRS) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.js') && INCLUDE(dir, n))) {
      const src = readFileSync(join(dir, f), 'utf8');
      const names = new Set([...src.matchAll(HANDLER)].map((m) => m[1]));
      for (const name of names) if (!defines(src, name)) missing.push(`${dir}/${f}: this.${name}()`);
    }
  }
  assert.deepEqual(missing, []);
});
