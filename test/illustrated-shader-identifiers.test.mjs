// Static guard for the illustrated-surface shader chunks.
//
// 2026-09-25: one dropped GLSL declaration (`float sfFineVisibility` in HULL_LAYOUT_GLSL)
// made every hull/rock program fail to link and nothing caught it before a live walk.
// This test collects every `sf*` identifier the injected chunks USE and asserts each one
// is DECLARED somewhere in the assembly — the same set a GLSL compiler resolves.
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { HULL_LAYOUT_GLSL } from '../src/render/illustratedHullLayout.js';
import { ILLUSTRATED_SURFACE_GLSL } from '../src/render/illustratedSurface.js';

const SURFACE_SOURCE_URL = new URL('../src/render/illustratedSurface.js', import.meta.url);

// Declarator lists can continue across commas (`vec3 sfDx = …, sfDy = …`). Split a
// declaration tail on top-level commas only — initializer argument lists must not
// masquerade as new declarators or they would mask a genuinely undeclared identifier.
function splitTopLevelCommas(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Every `sf*` name the corpus declares: uniforms/varyings/attributes, #defines,
 * locals (including comma-chained declarators and for-loop locals), GLSL function
 * signatures, and the JS-side `shader.uniforms.<name>` slots the hook fills. */
export function declaredSfIdentifiers(corpus) {
  const declared = new Set();
  const collectDeclName = (part) => {
    const match = /^\s*([A-Za-z_]\w*)/.exec(part);
    if (match && /^sf[A-Z]/.test(match[1])) declared.add(match[1]);
  };
  for (const match of corpus.matchAll(
    /\b(?:uniform|varying|attribute|in|out)\s+(?:highp|mediump|lowp\s+)?\w+\s+([^;\n]+)/g)) {
    for (const part of splitTopLevelCommas(match[1])) collectDeclName(part);
  }
  for (const match of corpus.matchAll(
    /\b(?:float|int|bool|vec2|vec3|vec4|mat2|mat3|mat4|void)\s+([^;]+)/g)) {
    for (const part of splitTopLevelCommas(match[1])) collectDeclName(part);
  }
  for (const match of corpus.matchAll(/#\s*define\s+(sf[A-Z]\w*)/g)) declared.add(match[1]);
  for (const match of corpus.matchAll(/\buniforms\s*\.\s*(sf[A-Z]\w*)/g)) declared.add(match[1]);
  for (const match of corpus.matchAll(/\bsetAttribute\s*\(\s*['"`](sf[A-Z]\w*)/g)) declared.add(match[1]);
  return declared;
}

/** Every `sf*` name used anywhere in the corpus. */
export function usedSfIdentifiers(corpus) {
  const used = new Set();
  for (const match of corpus.matchAll(/\bsf[A-Z]\w*/g)) used.add(match[0]);
  return used;
}

export function undeclaredSfIdentifiers(corpus) {
  const declared = declaredSfIdentifiers(corpus);
  return [...usedSfIdentifiers(corpus)].filter((name) => !declared.has(name));
}

test('illustrated surface chunks use no undeclared sf identifiers', async () => {
  const surfaceSource = await readFile(SURFACE_SOURCE_URL, 'utf8');
  const corpus = `${surfaceSource}\n${HULL_LAYOUT_GLSL}`;
  const missing = undeclaredSfIdentifiers(corpus);
  assert.deepEqual(missing, [],
    `sf identifiers used without a declaration: ${missing.join(', ')}`);
});

test('the guard reports the sfFineVisibility regression that broke every hull link', async () => {
  const surfaceSource = await readFile(SURFACE_SOURCE_URL, 'utf8');
  // Replay the b09093705 breakage on a copy: the declaration line is gone, the uses stay.
  const broken = HULL_LAYOUT_GLSL.replace(/^[ \t]*float sfFineVisibility[^\n]*\n/m, '');
  assert.notEqual(broken, HULL_LAYOUT_GLSL, 'fixture must actually remove the declaration line');
  assert.ok(/\bsfFineVisibility\b/.test(broken), 'fixture still uses sfFineVisibility');
  const missing = undeclaredSfIdentifiers(`${surfaceSource}\n${broken}`);
  assert.ok(missing.includes('sfFineVisibility'),
    `expected sfFineVisibility reported undeclared, got: ${missing.join(', ') || 'none'}`);
});

test('the guard reports an undeclared identifier anywhere in the chunk surface', async () => {
  const surfaceSource = await readFile(SURFACE_SOURCE_URL, 'utf8');
  const withUndeclaredUse = `${surfaceSource}\n${HULL_LAYOUT_GLSL}\nfloat sfProbe = sfNeverDeclared * 2.0;\n`;
  const missing = undeclaredSfIdentifiers(withUndeclaredUse);
  assert.ok(missing.includes('sfNeverDeclared'),
    `expected sfNeverDeclared reported undeclared, got: ${missing.join(', ') || 'none'}`);
});
