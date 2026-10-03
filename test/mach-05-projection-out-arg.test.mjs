// INFERENCE MACH-05: "Hot callers of the screen projection never allocate: the out parameter
// is required or checked."
//
// Contract: every worldToScreen / raycastToPlane call under src/ui and src/render passes an
// `out` scratch (second argument present), so per-frame projection never allocates a result
// object on the hot path. The scan below is the pin: a call with a single argument allocates
// inside renderer.worldToScreen and is the defect this line exists to keep out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.js')) yield p;
  }
}

// Call sites for the renderer-exposed projections. A call is "out-arg safe" when its argument
// list contains at least one top-level comma — i.e. a scratch `out` is supplied.
const PROJECTION_FNS = ['worldToScreen', 'raycastToPlane'];

// Positions inside comments or string literals are not call sites — build the mask once per file.
function codeMask(src) {
  const mask = new Uint8Array(src.length).fill(1); // 1 = real code
  let i = 0;
  let state = 'code';
  let quote = '';
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (state === 'code') {
      if (c === '/' && n === '/') { state = 'line'; mask[i] = mask[i + 1] = 0; i += 2; continue; }
      if (c === '/' && n === '*') { state = 'block'; mask[i] = mask[i + 1] = 0; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { state = 'string'; quote = c; mask[i] = 0; i += 1; continue; }
      i += 1;
    } else if (state === 'line') {
      mask[i] = 0;
      if (c === '\n') state = 'code';
      i += 1;
    } else if (state === 'block') {
      mask[i] = 0;
      if (c === '*' && n === '/') { mask[i + 1] = 0; state = 'code'; i += 2; continue; }
      i += 1;
    } else { // string
      mask[i] = 0;
      if (c === '\\') { mask[i + 1] = 0; i += 2; continue; }
      if (c === quote) state = 'code';
      i += 1;
    }
  }
  return mask;
}

function* projectionCallSites(src) {
  const mask = codeMask(src);
  for (const fn of PROJECTION_FNS) {
    const needle = fn + '(';
    let i = -1;
    while ((i = src.indexOf(needle, i + 1)) >= 0) {
      if (mask[i] === 0) continue; // comment or string mention, not a call
      const before = src.slice(Math.max(0, i - 40), i);
      // Skip declarations and type checks — call sites only.
      if (/function\s+\w*$/.test(before)) continue;
      if (/\btypeof\s*$/.test(before)) continue;
      let depth = 0;
      let j = i + needle.length - 1; // index of the '('
      for (; j < src.length; j += 1) {
        const c = src[j];
        if (c === '(') depth += 1;
        else if (c === ')') { depth -= 1; if (depth === 0) break; }
      }
      const args = src.slice(i + needle.length, j);
      let d2 = 0;
      let commas = 0;
      for (const c of args) {
        if (c === '(' || c === '[' || c === '{') d2 += 1;
        else if (c === ')' || c === ']' || c === '}') d2 -= 1;
        else if (c === ',' && d2 === 0) commas += 1;
      }
      const line = src.slice(0, i).split('\n').length;
      yield { fn, line, commas, args: args.replace(/\s+/g, ' ').trim().slice(0, 80) };
      i = j;
    }
  }
}

test('every projection call site supplies an out scratch — no per-call allocation', () => {
  const bare = [];
  let checked = 0;
  for (const root of ['src/ui', 'src/render']) {
    for (const file of walk(join(ROOT, root))) {
      const src = readFileSync(file, 'utf8');
      for (const site of projectionCallSites(src)) {
        checked += 1;
        if (site.commas === 0) {
          bare.push(`${file.slice(ROOT.length + 1).replace(/\\/g, '/')}:${site.line} ${site.fn}(${site.args})`);
        }
      }
    }
  }
  assert.ok(checked > 0, 'the scan found projection call sites');
  assert.deepEqual(bare, [], `projection calls missing an out argument (each allocates a fresh result on the hot path):\n${bare.join('\n')}`);
});

test('the renderer contract itself documents out as the non-allocating path', () => {
  const src = readFileSync(join(ROOT, 'src/render/renderer.js'), 'utf8');
  assert.ok(/worldToScreen\(v, out\)/.test(src), 'worldToScreen accepts the out scratch');
  assert.ok(/writeScreenProjection\(out,/.test(src), 'results are written into the caller scratch');
  assert.ok(/raycastToPlane\(ndc, out\)/.test(src), 'raycastToPlane accepts the out scratch');
});
