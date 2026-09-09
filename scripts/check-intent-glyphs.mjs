#!/usr/bin/env node
// BP-03.1 overview_intent_strip backend/data gate.
//
// The packet is intentionally data-only: it names the seven canonical strip
// verbs/glyph ids so future HUD/map work can consume them without inventing
// labels or mutating SG-06/scanner behavior.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/data/intentGlyphs.js', import.meta.url)),
  'src/data/intentGlyphs.js exists');

const mod = await import('../src/data/intentGlyphs.js');
const {
  INTENT_GLYPH_IDS,
  INTENT_GLYPHS,
  intentGlyphById,
  intentGlyphForState,
  intentGlyphForContact,
  intentStripReadout,
} = mod;

const REQUIRED = Object.freeze([
  ['intercepting', 'INTERCEPT', 'intercept'],
  ['fleeing', 'FLEE', 'flee'],
  ['scanning', 'SCAN', 'scan'],
  ['docking', 'DOCK', 'dock'],
  ['mining', 'MINE', 'mine'],
  ['escorting', 'ESCORT', 'escort'],
  ['interdicting', 'INTERDICT', 'interdict'],
]);

let sections = 0;
function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in intent glyph path'); };
  Date.now = () => { throw new Error('Date.now in intent glyph path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testRoster);
guarded(testStateAliases);
guarded(testContactReadouts);
testDataOnlyScope();

console.log(`[check-intent-glyphs] PASS - ${sections} sections green`);

function testRoster() {
  assert.deepEqual(INTENT_GLYPH_IDS, REQUIRED.map(([id]) => id),
    'intent glyph ids stay in spec order and remain exactly seven');
  const seenVerbs = new Set();
  const seenGlyphs = new Set();
  for (const [id, verb, glyph] of REQUIRED) {
    const row = intentGlyphById(id);
    assert.equal(row, INTENT_GLYPHS[id], `${id}: lookup returns exported row`);
    assert.equal(row.verb, verb, `${id}: required strip verb`);
    assert.equal(row.glyph, glyph, `${id}: required glyph token`);
    assert.match(row.verb, /^[A-Z-]+$/, `${id}: verb is compact strip copy`);
    assert.match(row.glyph, /^[a-z0-9-]+$/, `${id}: glyph is a stable token, not display art`);
    assert.ok(Number.isFinite(row.priority), `${id}: priority is numeric for readout arbitration`);
    assert.ok(Array.isArray(row.aliases), `${id}: aliases are present for SG-06/contact states`);
    assert.ok(row.aliases.length >= 4, `${id}: aliases cover real state vocabulary`);
    assert.equal(seenVerbs.has(row.verb), false, `${id}: duplicate strip verb ${row.verb}`);
    assert.equal(seenGlyphs.has(row.glyph), false, `${id}: duplicate glyph ${row.glyph}`);
    seenVerbs.add(row.verb);
    seenGlyphs.add(row.glyph);
  }
  assert.equal(intentGlyphById('unknown'), null, 'unknown id returns null');
  ok('the seven overview intent verbs/glyphs are pinned');
}

function testStateAliases() {
  const samples = [
    ['Fleeing', 'fleeing'],
    ['forceFlee', 'fleeing'],
    ['retreat', 'fleeing'],
    ['scan', 'scanning'],
    ['inspect', 'scanning'],
    ['docking', 'docking'],
    ['station approach', 'docking'],
    ['mine', 'mining'],
    ['drilling', 'mining'],
    ['escort', 'escorting'],
    ['screening', 'escorting'],
    ['interdict', 'interdicting'],
    ['demand-cargo', 'interdicting'],
    ['pursue', 'intercepting'],
    ['attack', 'intercepting'],
  ];
  for (const [state, expected] of samples) {
    assert.equal(intentGlyphForState(state).id, expected, `${state}: maps to ${expected}`);
  }
  assert.equal(intentGlyphForState('idle'), null, 'idle/unknown state stays blank, not UNKNOWN spam');
  ok('SG-06/contact state aliases map to one canonical intent each');
}

function testContactReadouts() {
  assert.equal(intentGlyphForContact({ data: { ai: { forceFlee: true, fsm: 'attack' } } }).id, 'fleeing',
    'forceFlee wins over attack/intercept');
  assert.equal(intentGlyphForContact({ data: { ai: { demandCargo: true, fsm: 'scan' } } }).id, 'interdicting',
    'cargo demand wins over scan');
  assert.equal(intentGlyphForContact({ data: { ai: { fsm: 'scan' } } }).id, 'scanning',
    'scan fsm maps to scanning');
  assert.equal(intentGlyphForContact({ data: { ai: { fsm: 'dock' } } }).id, 'docking',
    'dock fsm maps to docking');
  assert.equal(intentGlyphForContact({ data: { ai: { role: 'escort' } } }).id, 'escorting',
    'escort role maps to escorting');
  assert.equal(intentGlyphForContact({ data: { ai: { preferredRole: 'miner' } }, mining: true }).id, 'mining',
    'mining flag maps to mining');
  assert.equal(intentGlyphForContact({ data: { ai: { fsm: 'pursue' } } }).id, 'intercepting',
    'pursue maps to intercepting');
  assert.equal(intentGlyphForContact({ data: { ai: { fsm: 'idle' } } }), null,
    'idle contact stays blank');

  const readout = intentStripReadout({ data: { ai: { fsm: 'flee' } } });
  assert.deepEqual(Object.keys(readout).sort(), ['glyph', 'id', 'label', 'verb'].sort(),
    'strip readout shape stays compact for future UI consumers');
  assert.equal(readout.verb, 'FLEE', 'SG-06 fleeing state shows FLEE as required');
  assert.equal(Object.isFrozen(readout), true, 'strip readout is immutable data');
  ok('contact readout arbitration is deterministic and compact');
}

function testDataOnlyScope() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:intent-glyphs'], 'node scripts/check-intent-glyphs.mjs',
    'package exposes check:intent-glyphs');

  const dataSource = readFileSync(new URL('../src/data/intentGlyphs.js', import.meta.url), 'utf8');
  assert.doesNotMatch(dataSource, /^\s*import\s/m, 'intent glyph data imports no systems or UI');
  assert.doesNotMatch(dataSource, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'intent glyph data does not use RNG, wall-clock time, or timers');
  assert.doesNotMatch(dataSource, /bus\.emit|ctx\.|state\.|document|window|new\s+THREE|credits|cargo\s*=|faction:repDelta|combat:/,
    'intent glyph data does not mutate sim, economy, cargo, reputation, combat, DOM, or render state');

  const registry = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  const hud = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  const aiPorts = readFileSync(new URL('../src/systems/aiPorts.js', import.meta.url), 'utf8');
  const scanner = readFileSync(new URL('../src/systems/scanner.js', import.meta.url), 'utf8');
  assert.doesNotMatch(registry, /intentGlyphs/, 'data-only packet registers no runtime system');
  assert.doesNotMatch(hud, /intentGlyphs/, 'data-only packet does not edit HUD wiring');
  assert.doesNotMatch(aiPorts, /intentGlyphs/, 'data-only packet does not alter SG-06 ports');
  assert.doesNotMatch(scanner, /intentGlyphs/, 'data-only packet does not alter scanner behavior');
  ok('package script and no-touch data-only scope are pinned');
}
