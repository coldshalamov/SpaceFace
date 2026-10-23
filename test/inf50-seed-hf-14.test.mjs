// SEED-HF-14 — glance, solid, and crushing stay on the MASSLINE IMPACT lane and read apart.
// Seed 4242 is the script clock. Detection, throttle, and damage stay where they were.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';

const SEED = 4242;

function harness() {
  const state = {
    tick: SEED,
    simTime: SEED / 60,
    mode: 'flight',
    playerId: 1,
    settings: { video: {}, accessibility: {} },
    entities: new Map([[1, { id: 1, pos: { x: 0, y: 0, z: 0 } }]]),
  };
  const bus = createBus();
  const alerts = [];
  const captions = [];
  bus.on('alert', (payload) => alerts.push(payload));
  bus.on('presentation:caption', (payload) => captions.push(payload));
  const presenter = Object.create(presentationOrchestrator);
  const adapters = Object.create(presentationAdapters);
  presenter.init({ state, bus });
  adapters.init({ state, bus });
  return { state, bus, alerts, captions };
}

function whip(h, rating, victimId) {
  h.bus.emit('tether:whipImpact', {
    targetId: 2,
    victimId,
    rating,
    slung: false,
    severity: rating === 'crushing' ? 1 : rating === 'solid' ? 0.62 : 0.2,
    relSpeed: rating === 'crushing' ? 100 : rating === 'solid' ? 60 : 20,
  });
  h.bus.flush();
}

function weight(alert) {
  const sev = alert.sev === 'danger' ? 3 : alert.sev === 'warn' ? 2 : 1;
  return sev * 10 + alert.ttl;
}

test('SEED-HF-14 seed 4242 crushing reads heavier than solid, and glance is the lightest', () => {
  const h = harness();
  whip(h, 'glance', 3);
  whip(h, 'solid', 4);
  whip(h, 'crushing', 5);

  assert.equal(h.alerts.length, 3);
  assert.equal(h.captions.length, 3);
  for (const alert of h.alerts) {
    assert.equal(alert.key, 'presentation:tether:whip-impact');
  }

  const glance = h.alerts[0];
  const solid = h.alerts[1];
  const crushing = h.alerts[2];
  assert.equal(glance.text, 'MASSLINE GLANCE');
  assert.equal(solid.text, 'MASSLINE IMPACT');
  assert.equal(crushing.text, 'MASSLINE CRUSHING');
  assert.equal(glance.sev, 'info');
  assert.equal(solid.sev, 'info');
  assert.equal(crushing.sev, 'warn');
  assert.ok(weight(crushing) > weight(solid) && weight(solid) > weight(glance));

  assert.equal(h.captions[0].text, 'Glancing massline impact.');
  assert.equal(h.captions[1].text, 'Massline impact landed.');
  assert.equal(h.captions[2].text, 'Crushing massline impact.');
  assert.equal(h.captions[0].id, 'tether.whip_impact');
  assert.equal(h.captions[2].id, 'tether.whip_impact');
});
