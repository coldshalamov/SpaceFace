// Plan 31 — the reduced-flash variant is MANDATORY ("no screen-clearing white flashes; 10's flash
// caps; reduced-flash variant mandatory"), and it has to cover every element the size-tier layer
// adds, not the aggregate.
//
// Why this is a source check rather than a particle count: an aggregate assertion ("reduced emits
// fewer particles") passes as soon as ANY element responds to the setting, so a new element with no
// reduced branch hides behind the ones that already have one. That is a check that fails toward
// good news, which this repo has shipped before. This asserts per emission call instead.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  EXPLOSION_STYLE_IDS,
  explosionScheduleFor,
} from '../src/render/combat/phasedExplosions.js';

const VFX_SOURCE = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');

/** Every phase `_emitSizeTierBeats` actually handles. Kept in sync by the coverage test below. */
const SIZE_TIER_PHASES = Object.freeze([
  'internal', 'internal-secondary', 'breakup', 'debris', 'residue',
]);

const EMITTERS = Object.freeze([
  '_spawnSprite',
  '_spawnProjectileTrailStreak',
  '_spawnParticle',
  '_flashLight',
  '_impactParticleCone',
  '_spawnCauseFragment',
]);

/** Pull one method body out of the VFX object literal by brace matching from its opening `{`. */
function methodBody(source, name) {
  const start = source.indexOf(`\n  ${name}(`);
  assert.notEqual(start, -1, `${name} must exist in src/render/vfx.js`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    const ch = source[index];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

/**
 * Split a method body into individual emitter call argument lists. Brace/paren matching rather than
 * a regex, because these calls are multi-line and contain nested ternaries and calls of their own.
 */
function emitterCalls(body) {
  const calls = [];
  for (const emitter of EMITTERS) {
    let cursor = 0;
    for (;;) {
      const found = body.indexOf(`this.${emitter}(`, cursor);
      if (found === -1) break;
      const open = body.indexOf('(', found + `this.${emitter}`.length - 1);
      let depth = 0;
      let end = open;
      for (let index = open; index < body.length; index++) {
        const ch = body[index];
        if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth === 0) { end = index; break; }
        }
      }
      calls.push({ emitter, args: body.slice(open + 1, end), at: found });
      cursor = end;
    }
  }
  return calls.sort((a, b) => a.at - b.at);
}

test('every element the size-tier layer emits carries its own reduced-flash branch', () => {
  const body = methodBody(VFX_SOURCE, '_emitSizeTierBeats');
  const calls = emitterCalls(body);
  assert.ok(calls.length >= 5,
    `expected the size-tier layer to emit several elements, found ${calls.length}`);
  for (const call of calls) {
    assert.match(call.args, /\breduced\b/,
      `${call.emitter} in _emitSizeTierBeats has no reduced-flash branch in its own arguments`);
  }
});

test('the flash budget of every element is itself reduced-branched', () => {
  const body = methodBody(VFX_SOURCE, '_emitSizeTierBeats');
  // This is the assertion that actually bites, and it exists because the looser version above did
  // NOT: stripping the reduced branch off one element's OPACITY left other `reduced` references in
  // the same call, so "reduced appears somewhere in the arguments" stayed true and the check passed
  // its own mutation. Opacity IS the flash budget, so every use of the accessibility opacity scale
  // must be multiplied by a reduced-flash ternary — no exceptions, counted rather than sampled.
  // `* opacityScale` counts APPLICATIONS of the budget; a bare `opacityScale` also matches its own
  // `const` declaration, which is not an element and would leave the counts permanently unequal.
  const opacityUses = [...body.matchAll(/\* opacityScale/g)].length;
  const branchedUses = [...body.matchAll(/\(reduced \? [^()]*\) \* opacityScale/g)].length;
  assert.ok(opacityUses >= 4, `expected several opacity-bearing elements, found ${opacityUses}`);
  assert.equal(branchedUses, opacityUses,
    `${opacityUses - branchedUses} element(s) in _emitSizeTierBeats apply opacityScale without a reduced-flash branch`);

  // Every sprite/streak must go through the profile at all, not a bare literal opacity.
  const opacityBearing = emitterCalls(body)
    .filter((call) => call.emitter === '_spawnSprite' || call.emitter === '_spawnProjectileTrailStreak');
  assert.equal(opacityBearing.length, opacityUses,
    'a sprite or streak here bypasses the accessibility opacity scale entirely');
  assert.match(body, /accessibility\.eventLightPeakScale > 0/,
    'event lights must respect the accessibility light budget');
});

test('every element count in the size-tier layer collapses under reduced flash', () => {
  const body = methodBody(VFX_SOURCE, '_emitSizeTierBeats');
  // Each `for (let k = 0; k < <count>; k++)` loop must be bounded by a reduced-aware count. A loop
  // that always runs the full count emits the same number of elements at every accessibility level.
  const counts = [...body.matchAll(/const (points|plates|fires) = ([^;]+);/g)];
  assert.equal(counts.length, 3, 'the layer has three counted element groups');
  for (const [, name, expression] of counts) {
    assert.match(expression, /\breduced\b/, `${name} does not collapse under reduced flash`);
  }
});

test('the size tier stacks under every cause skin instead of being replaced by it', () => {
  const styleBody = methodBody(VFX_SOURCE, '_emitStyleExplosionPhase');
  assert.match(styleBody, /this\._emitSizeTierBeats\(/,
    'the style path must emit the size tier; replacing it is the defect Plan 31 names');
  assert.match(styleBody, /this\._emitDestructionLightBeats\(/,
    'ship-death beats must fire for every style, not only terrain smash');

  // Every style/class schedule must reach at least one phase the size tier handles, otherwise a
  // whole (cause x size) combination would silently lose its class identity.
  for (const styleId of EXPLOSION_STYLE_IDS) {
    for (const classId of ['small', 'ordinary', 'capital']) {
      const scheduleDef = explosionScheduleFor(classId, 'generic', styleId);
      const reached = scheduleDef.events.filter((event) => SIZE_TIER_PHASES.includes(event.phase));
      assert.ok(reached.length > 0,
        `${styleId} x ${classId} never reaches a size-tier phase`);
    }
  }
});

test('every capital-class skin walks the full multi-point cook-off before the main burst', () => {
  // Plan 31's Heavy row: "3-6 staggered secondary detonations walk the hull". Two detonation points
  // land on each of the three walk beats (one each under reduced flash), so the authored range holds.
  const walk = ['internal', 'internal-secondary', 'breakup'];
  for (const styleId of EXPLOSION_STYLE_IDS) {
    const scheduleDef = explosionScheduleFor('capital', 'generic', styleId);
    const phases = scheduleDef.events.map((event) => event.phase);
    for (const beat of walk) {
      assert.ok(phases.includes(beat),
        `capital ${styleId} is missing the ${beat} cook-off beat`);
    }
    const walkTimes = walk.map((beat) => scheduleDef.events.find((event) => event.phase === beat).at);
    // Staggered, not simultaneous, and all of it ahead of the main burst.
    assert.ok(walkTimes[0] < walkTimes[1] && walkTimes[1] < walkTimes[2],
      `capital ${styleId} cook-off beats are not staggered`);
    const main = scheduleDef.events.find((event) => event.phase === 'rupture' || event.phase === 'debris');
    assert.ok(walkTimes[2] <= main.at,
      `capital ${styleId} walks its hull after the main burst instead of before it`);
    // Lower tiers must NOT get the capital walk — the ladder still has to separate the classes.
    const ordinary = explosionScheduleFor('ordinary', 'generic', styleId)
      .events.map((event) => event.phase);
    assert.equal(ordinary.includes('internal-secondary') && ordinary.includes('breakup'), false,
      `${styleId} gives an ordinary hull the capital cook-off`);
  }
});

test('schedules stay monotonic and inside their own duration after the walk is inserted', () => {
  for (const styleId of EXPLOSION_STYLE_IDS) {
    for (const classId of ['small', 'ordinary', 'capital']) {
      const scheduleDef = explosionScheduleFor(classId, 'generic', styleId);
      for (let index = 1; index < scheduleDef.events.length; index++) {
        assert.ok(scheduleDef.events[index].at >= scheduleDef.events[index - 1].at,
          `${styleId} x ${classId} schedule is out of order`);
      }
      const last = scheduleDef.events[scheduleDef.events.length - 1];
      assert.ok(last.at < scheduleDef.duration,
        `${styleId} x ${classId} schedules a beat at or past its own retirement`);
    }
  }
});
