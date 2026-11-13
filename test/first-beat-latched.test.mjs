import test from 'node:test';
import assert from 'node:assert/strict';
import { handlineSenseLine } from '../src/ui/stuntCallout.js';

test('the first latch has a centre word; the throw keeps its own', () => {
  assert.equal(handlineSenseLine('tether:latched', { sourceId: 1, targetId: 2 }).name, 'LATCHED');
  assert.equal(handlineSenseLine('massline:throw', { payloadSpeed: 80, releaseId: 3 }).name, 'THROWN');
});

import { createStuntCallout, calloutTextFor } from '../src/ui/stuntCallout.js';
import { readFileSync } from 'node:fs';

// Reuse the existing seam harness (fake document + bus) without copying it.
const src = readFileSync(new URL('./handline-inference-senses.test.mjs', import.meta.url), 'utf8');
const harness = src.slice(src.indexOf('function fakeDocument'), src.indexOf("test('massline:releaseWindow"));
const { mount } = new Function('createStuntCallout', 'SEED', `${harness}; return { mount };`)(createStuntCallout, 4242);

test('lane: the pilot\'s first latch says LATCHED once; a flail or foreign latch says nothing', () => {
  const { bus, callout } = mount();
  try {
    bus.emit('tether:latched', { sourceId: 99, targetId: 2 });
    callout.update(0);
    assert.doesNotMatch(calloutTextFor(callout.root), /LATCHED/, 'not the player\'s line');
    bus.emit('tether:latched', { targetId: 2, flail: true, sourceId: 1 });
    callout.update(0);
    assert.doesNotMatch(calloutTextFor(callout.root), /LATCHED/, 'a flail is not a first success');
    bus.emit('tether:latched', { sourceId: 1, targetId: 2 });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /LATCHED/);
    bus.emit('run:started', {});
    bus.emit('tether:latched', { sourceId: 1, targetId: 3 });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /LATCHED/, 'a new run earns the word again');
  } finally { callout.destroy(); }
});

test('lane: the second latch and second throw of a run stay quiet', () => {
  const { bus, callout } = mount();
  try {
    bus.emit('tether:latched', { sourceId: 1, targetId: 2 });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /LATCHED/);
    bus.emit('massline:throw', { releaseId: 'a', payloadSpeed: 100 });
    callout.update(0);
    const first = calloutTextFor(callout.root);
    assert.match(first, /THROWN/);
    bus.emit('run:waveStarted', {});
    // Drain lines, then repeat both: nothing new appears.
    callout.update(1e9);
    bus.emit('tether:latched', { sourceId: 1, targetId: 4 });
    bus.emit('massline:throw', { releaseId: 'b', payloadSpeed: 120 });
    callout.update(1e9 + 1);
    assert.doesNotMatch(calloutTextFor(callout.root), /LATCHED|THROWN/);
  } finally { callout.destroy(); }
});

test('lane: the first physics kill says CRUSHED once; a gun kill stays with DESTROYED', () => {
  const { bus, callout } = mount();
  try {
    bus.emit('entity:killed', { id: 5, killerId: 1, cause: 'bullet' });
    callout.update(0);
    assert.doesNotMatch(calloutTextFor(callout.root), /CRUSHED/);
    bus.emit('entity:killed', { id: 6, killerId: 1, styleCause: 'collision' });
    callout.update(0);
    assert.match(calloutTextFor(callout.root), /CRUSHED/);
    callout.update(1e9);
    bus.emit('entity:killed', { id: 7, killerId: 1, styleCause: 'collision' });
    callout.update(1e9 + 1);
    assert.doesNotMatch(calloutTextFor(callout.root), /CRUSHED/);
  } finally { callout.destroy(); }
});

import { SWARM_RULESET } from '../src/data/swarmMode.js';
const swarmHarness = harness.replace('run: null', "run: { kind: 'survival', phase: 'wave', ruleset: SWARM_RULESET }");
const { mount: mountSwarm } = new Function('createStuntCallout', 'SEED', 'SWARM_RULESET', `${swarmHarness}; return { mount };`)(createStuntCallout, 4242, SWARM_RULESET);

test('Swarm: the first latch goes to the centre announcer, not the column', () => {
  const { bus, callout } = mountSwarm();
  try {
    const heard = [];
    bus.on('swarm:announce', (p) => heard.push(p));
    bus.emit('tether:latched', { sourceId: 1, targetId: 2 });
    callout.update(0);
    assert.deepEqual(heard.map((p) => [p.kind, p.text]), [['firstbeat', 'LATCHED']]);
    assert.doesNotMatch(calloutTextFor(callout.root), /LATCHED/);
    bus.emit('tether:latched', { sourceId: 1, targetId: 3 });
    assert.equal(heard.length, 1, 'once per run');
  } finally { callout.destroy(); }
});
