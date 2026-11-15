import test from 'node:test';
import assert from 'node:assert/strict';
import { handlineSenseLine } from '../src/ui/stuntCallout.js';

test('the first latch has a centre word; the throw keeps its own', () => {
  assert.equal(handlineSenseLine('tether:latched', { sourceId: 1, targetId: 2 }).name, 'LATCHED');
  assert.equal(handlineSenseLine('massline:throw', { payloadSpeed: 80, releaseId: 3 }).name, 'THROWN');
});

import { createStuntCallout, calloutTextFor } from '../src/ui/stuntCallout.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { makeCalloutMount } from './helpers/calloutSeam.mjs';

// The shared seam harness (fake document + bus) mounts the real createStuntCallout wiring.
const mount = makeCalloutMount({ createStuntCallout, seed: 4242 });

function words(bus) { const heard = []; bus.on('callout:firstBeat', (p) => heard.push(p.text)); return heard; }

test('lane: the pilots first latch says LATCHED once; a flail or foreign latch says nothing', () => {
  const { bus, callout } = mount();
  try {
    const heard = words(bus);
    bus.emit('tether:latched', { sourceId: 99, targetId: 2 });
    bus.emit('tether:latched', { targetId: 2, flail: true, sourceId: 1 });
    assert.deepEqual(heard, [], 'not the player line, and a flail is not a first success');
    bus.emit('tether:latched', { sourceId: 1, targetId: 2 });
    assert.deepEqual(heard, ['LATCHED']);
    bus.emit('tether:latched', { sourceId: 1, targetId: 3 });
    assert.deepEqual(heard, ['LATCHED'], 'once per run');
    bus.emit('run:started', {});
    bus.emit('tether:latched', { sourceId: 1, targetId: 3 });
    assert.deepEqual(heard, ['LATCHED', 'LATCHED'], 'a new run earns the word again');
  } finally { callout.destroy(); }
});

test('lane: the first throw and the first physics kill speak once; a gun kill stays with DESTROYED', () => {
  const { bus, callout } = mount();
  try {
    const heard = words(bus);
    bus.emit('massline:throw', { releaseId: 'a', payloadSpeed: 100 });
    bus.emit('massline:throw', { releaseId: 'b', payloadSpeed: 120 });
    bus.emit('entity:killed', { id: 5, killerId: 1, cause: 'bullet' });
    bus.emit('entity:killed', { id: 6, killerId: 1, styleCause: 'collision' });
    bus.emit('entity:killed', { id: 7, killerId: 1, styleCause: 'collision' });
    assert.deepEqual(heard, ['THROWN', 'CRUSHED']);
  } finally { callout.destroy(); }
});

test('the centre presenter shows a first-beat word, claims the one voice, and hands back', async () => {
  const { ensureFirstBeatCentre, releaseFirstBeatCentre } = await import('../src/ui/firstBeatCentre.js');
  const { resetCalloutVoice, claimCalloutVoice } = await import('../src/ui/calloutVoice.js');
  const made = [];
  const el = () => ({ style: {}, hidden: true, className: '', textContent: '', offsetWidth: 0,
    setAttribute() {}, appendChild(c) { made.push(c); }, parentNode: null });
  const doc = { body: { appendChild(c) { c.parentNode = this; made.push(c); }, removeChild() {} },
    head: { appendChild() {} }, getElementById: () => null, createElement: () => el() };
  const handlers = {};
  const bus = { on(ev, cb) { handlers[ev] = cb; return () => {}; } };
  resetCalloutVoice();
  const presenter = ensureFirstBeatCentre({ bus, doc });
  try {
    handlers['callout:firstBeat']({ text: 'LATCHED' });
    assert.equal(presenter.node.hidden, false);
    assert.equal(presenter.node.textContent, 'LATCHED');
    assert.equal(claimCalloutVoice('sj:collateral', 3, 1000), false, 'a kill word waits for the first beat');
  } finally { presenter.destroy(); resetCalloutVoice(); releaseFirstBeatCentre(); }
});

const mountSwarm = makeCalloutMount({ createStuntCallout, seed: 4242,
  run: { kind: 'survival', phase: 'wave', ruleset: SWARM_RULESET } });

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

test('THROW-01: letting go of a fixed anchor gets a short word in the one voice', () => {
  assert.equal(handlineSenseLine('anchor:released', {}).name, 'LET GO');
});
