// The Crucible door's character-select marks: every starter build and every swarm stake carries
// its own authored sigil, drawn in the same decorative SVG contract as the equipment glyphs.
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { BUILD_SIGILS, STAKE_MARKS, sigilSvg } from '../src/ui/orrery/buildSigils.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { SWARM_STAKES } from '../src/data/swarmStakes.js';

test('every starter build has a sigil, and every sigil belongs to a starter build', () => {
  const ids = new Set(COMBAT_LAB_STARTER_PACKAGES.map(s => s.id));
  for (const id of ids) assert.ok(BUILD_SIGILS[id], `no sigil for ${id}`);
  for (const id of Object.keys(BUILD_SIGILS)) assert.ok(ids.has(id), `stale sigil ${id}`);
});

test('every swarm stake has a mark, and every mark belongs to a stake', () => {
  const ids = new Set(SWARM_STAKES.map(s => s.id));
  for (const id of ids) assert.ok(STAKE_MARKS[id], `no mark for ${id}`);
  for (const id of Object.keys(STAKE_MARKS)) assert.ok(ids.has(id), `stale mark ${id}`);
});

test('marks share the 128-unit frame, draw only stroked primitives, and stay pure data', () => {
  for (const set of [BUILD_SIGILS, STAKE_MARKS]) {
    for (const [key, shapes] of Object.entries(set)) {
      assert.ok(shapes.length >= 2, `${key} needs a body and detail`);
      for (const { tag, ...attrs } of shapes) {
        assert.ok(['path', 'circle'].includes(tag), `${key}: ${tag}`);
        if (tag === 'path') assert.match(attrs.d, /^[MLQCHVZmlqchvz0-9 ,.\-]+$/, `${key} path data`);
        if (tag === 'circle') {
          for (const k of ['cx', 'cy', 'r']) assert.ok(Number.isFinite(attrs[k]), `${key} circle ${k}`);
        }
      }
    }
  }
});

test('sigilSvg decorates like the equipment glyphs and fails closed without a document', () => {
  const doc = { createElementNS: (_ns, tag) => ({ tag, attrs: {}, children: [],
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(n) { this.children.push(n); } }) };
  const svg = sigilSvg(BUILD_SIGILS, 'ricochet_runner', doc);
  assert.equal(svg.attrs.viewBox, '0 0 128 128');
  assert.equal(svg.attrs['aria-hidden'], 'true');
  assert.equal(svg.attrs.focusable, 'false');
  assert.equal(svg.attrs['data-sigil'], 'ricochet_runner');
  assert.ok(svg.children.length > 0);
  const mark = sigilSvg(STAKE_MARKS, 'ironbound', doc, 'orr-sigil orr-prep-stake-mark');
  assert.equal(mark.attrs.class, 'orr-sigil orr-prep-stake-mark');
  assert.equal(sigilSvg(BUILD_SIGILS, 'not_a_build', doc), null);
  assert.equal(sigilSvg(BUILD_SIGILS, 'ricochet_runner', null), null);
});
