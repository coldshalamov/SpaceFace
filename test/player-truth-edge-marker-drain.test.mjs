import test from 'node:test';
import assert from 'node:assert/strict';
import { drainPlayerTruth, observeEdgeMarkers } from '../scripts/player-truth/driver.mjs';
import { checkOffscreenMarker } from '../scripts/player-truth/checks.mjs';

async function observeDrainFixture({ rawId = '7', placement = 'valid', tick = 12, shooter = null, entityRows = [[1000007]] } = {}) {
  const prior = Object.fromEntries(['window', 'document', 'getComputedStyle'].map(key => [key, globalThis[key]]));
  const at = performance.now();
  const producer = placement === 'valid' ? { version: 1, id: 7, generation: 17, tick,
    at, expiresAt: at + 250, frame: 1, checkedAt: at, x: 480, y: 600, onScreen: false, behind: false } : placement;
  const sample = { f: 1, tick: 12, sim: 1, mode: 'flight', vw: 960, vh: 540, e: entityRows };
  globalThis.window = { innerWidth: 960, innerHeight: 540,
    __playerTruth: { drain: () => ({ samples: [sample], events: [], keys: [] }), identityFor: () => 1000007 },
    SF: { state: { tick: 12, entities: new Map(shooter ? [[7, shooter]] : []) } } };
  globalThis.document = { querySelectorAll: () => [{
    getAttribute: key => key === 'data-entity-id' ? rawId
      : key === 'data-placement-read' ? JSON.stringify(producer) : 'bottom',
    getBoundingClientRect: () => ({ left: 470, top: 518, width: 20, height: 20 }),
    parentNode: { getAttribute: () => '1' },
  }] };
  globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
  const page = { async evaluate(fn, arg) { return fn(arg); } };
  try {
    return await drainPlayerTruth(page);
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
}

const eligibleShooter = (overrides = {}) => ({ id: 7, occupantGeneration: 17, type: 'ship', alive: true, data: {}, ...overrides });

test('a drain observes each visible marker and its exact live shooter in one browser task', async () => {
  const prior = Object.fromEntries(['window', 'document', 'getComputedStyle'].map(key => [key, globalThis[key]]));
  const sourceIdentity = 1000007;
  const samples = [{ f: 1, tick: 12, sim: 1, e: [[sourceIdentity]] }];
  const at = performance.now();
  const placement = { version: 1, id: 7, generation: 17, tick: 12, at, expiresAt: at + 250, frame: 1, checkedAt: at,
    x: 480, y: 600, onScreen: false, behind: false };
  let evaluations = 0;
  globalThis.window = { innerWidth: 960, innerHeight: 540,
    __playerTruth: { drain: () => ({ samples, events: [], keys: [] }), identityFor: () => sourceIdentity },
    // A later sim state has already removed this actor; the marker still belongs to tick 12.
    SF: { state: { tick: 13, entities: new Map() }, ctx: { helpers: { worldToScreen() {
      throw new Error('a newer sim projection must not replace the producer placement');
    } } } } };
  globalThis.document = { querySelectorAll: () => [{
    getAttribute: key => key === 'data-entity-id' ? '7'
      : key === 'data-placement-read' ? JSON.stringify(placement) : 'bottom',
    getBoundingClientRect: () => ({ left: 470, top: 518, width: 20, height: 20 }),
    parentNode: { getAttribute: () => '1' },
  }] };
  globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
  const page = { async evaluate(fn, arg) { evaluations++; return fn(arg); } };
  try {
    const result = await drainPlayerTruth(page);
    assert.equal(evaluations, 1, 'a second evaluation could observe a newer HUD frame');
    assert.deepEqual(result.samples[0].edgeMarkers, [{ edge: 'bottom', x: 480, y: 528,
      shooter: { id: 7, alive: true, onScreen: false, behind: false, x: 480, y: 600 } }],
    'the marker is joined to the source sample even after the current entity has disappeared');
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('a same-tick marker without its living shooter remains a failure', async () => {
  const prior = Object.fromEntries(['window', 'document', 'getComputedStyle'].map(key => [key, globalThis[key]]));
  const sourceIdentity = 1000007;
  const samples = [{ f: 1, tick: 12, sim: 1, mode: 'flight', vw: 960, vh: 540, e: [] }];
  const at = performance.now();
  const placement = { version: 1, id: 7, generation: 17, tick: 12, at, expiresAt: at + 250, frame: 1, checkedAt: at,
    x: 480, y: 600, onScreen: false, behind: false };
  globalThis.window = { innerWidth: 960, innerHeight: 540,
    __playerTruth: { drain: () => ({ samples, events: [], keys: [] }), identityFor: () => sourceIdentity },
    SF: { state: { tick: 12, entities: new Map() } } };
  globalThis.document = { querySelectorAll: () => [{
    getAttribute: key => key === 'data-entity-id' ? '7'
      : key === 'data-placement-read' ? JSON.stringify(placement) : 'bottom',
    getBoundingClientRect: () => ({ left: 470, top: 518, width: 20, height: 20 }),
    parentNode: { getAttribute: () => '1' },
  }] };
  globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
  const page = { async evaluate(fn, arg) { return fn(arg); } };
  try {
    const result = await drainPlayerTruth(page);
    assert.equal(result.samples[0].edgeMarkers[0].shooter, null);
    assert.equal(checkOffscreenMarker({ meta: { rounds: false, playStartSim: 0 }, samples: result.samples }).status, 'FAIL');
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('a marker with no retained publication tick stays unmeasured', async () => {
  const prior = Object.fromEntries(['window', 'document', 'getComputedStyle'].map(key => [key, globalThis[key]]));
  const at = performance.now();
  const placement = { version: 1, id: 7, generation: 17, tick: 12, at, expiresAt: at + 250, frame: 1, checkedAt: at,
    x: 480, y: 600, onScreen: false, behind: false };
  const samples = [{ f: 1, tick: 11, sim: 1, mode: 'flight', vw: 960, vh: 540, e: [] }];
  globalThis.window = { innerWidth: 960, innerHeight: 540,
    __playerTruth: { drain: () => ({ samples, events: [], keys: [] }), identityFor: () => 1000007 },
    SF: { state: { tick: 12, entities: new Map() } } };
  globalThis.document = { querySelectorAll: () => [{
    getAttribute: key => key === 'data-entity-id' ? '7'
      : key === 'data-placement-read' ? JSON.stringify(placement) : 'bottom',
    getBoundingClientRect: () => ({ left: 470, top: 518, width: 20, height: 20 }),
    parentNode: { getAttribute: () => '1' },
  }] };
  globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
  const page = { async evaluate(fn, arg) { return fn(arg); } };
  try {
    const result = await drainPlayerTruth(page);
    assert.equal(Object.hasOwn(result.samples[0], 'edgeMarkers'), false);
    assert.equal(checkOffscreenMarker({ meta: { rounds: false, playStartSim: 0 }, samples: result.samples }).status, 'UNKNOWN');
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('drain failures retain malformed and missing identities and reject same-tick ineligible or recycled lives', async () => {
  const cases = [
    { name: 'malformed placement', placement: null, shooter: eligibleShooter() },
    { name: 'invalid publication tick', tick: null, shooter: eligibleShooter() },
    { name: 'missing shooter id', rawId: null, shooter: eligibleShooter() },
    { name: 'same-tick ineligible shooter', shooter: eligibleShooter({ data: { unarmed: true } }) },
    { name: 'same-tick recycled life', shooter: eligibleShooter({ occupantGeneration: 18 }) },
  ];
  for (const scenario of cases) {
    const result = await observeDrainFixture(scenario);
    const markers = result.samples[0].edgeMarkers;
    assert.equal(markers?.length, 1, `${scenario.name} stays attached to a retained sample`);
    assert.equal(markers[0].shooter, null, `${scenario.name} cannot earn a live-shooter binding`);
    assert.equal(checkOffscreenMarker({ meta: { rounds: false, playStartSim: 0 }, samples: result.samples }).status, 'FAIL', scenario.name);
  }
});

test('producer placement cannot excuse a stale, dead, disarmed, recycled or wrong-side chip', () => {
  const prior = Object.fromEntries(['window', 'document', 'getComputedStyle'].map(key => [key, globalThis[key]]));
  const at = performance.now();
  const shooter = { id: 7, occupantGeneration: 17, type: 'ship', alive: true, data: {}, pos: { x: 15, z: 25 } };
  let placement = { version: 1, id: 7, generation: 17, at, expiresAt: at + 250, frame: 1, checkedAt: at,
    x: 480, y: 600, onScreen: false, behind: false };
  globalThis.window = { innerWidth: 960, innerHeight: 540, SF: { state: { entities: new Map([[7, shooter]]) } } };
  globalThis.document = { querySelectorAll: () => [{
    getAttribute: key => key === 'data-entity-id' ? '7' : key === 'data-placement-read'
      ? (placement ? JSON.stringify(placement) : null) : 'bottom',
    getBoundingClientRect: () => ({ left: 470, top: 518, width: 20, height: 20 }),
    parentNode: { getAttribute: () => '1' },
  }] };
  globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
  const verdict = () => checkOffscreenMarker({ meta: { rounds: false }, samples: [{ mode: 'flight', vw: 960,
    vh: 540, e: [], edgeMarkers: observeEdgeMarkers() }] });
  try {
    assert.equal(verdict().status, 'PASS');
    for (const invalidate of [
      () => { placement.expiresAt = at - 1; },
      () => { shooter.alive = false; },
      () => { shooter.data.unarmed = true; },
      () => { shooter.data.weapons = []; },
      () => { shooter.occupantGeneration = 18; },
      () => { placement = null; },
      () => { placement.x = -10; placement.y = 270; },
    ]) {
      placement = { version: 1, id: 7, generation: 17, at, expiresAt: at + 250, frame: 1, checkedAt: at,
        x: 480, y: 600, onScreen: false, behind: false };
      shooter.alive = true; shooter.occupantGeneration = 17; shooter.data = {};
      invalidate(); assert.equal(verdict().status, 'FAIL');
    }
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('crossing grace expiry between HUD publications cannot revoke the unchanged painted chip', () => {
  const prior = Object.fromEntries(['window', 'document', 'getComputedStyle', 'performance'].map(key => [key, globalThis[key]]));
  const placement = { version: 1, id: 7, generation: 17, at: 1000, expiresAt: 1250,
    frame: 2, checkedAt: 1240, x: 480, y: 600, onScreen: false, behind: false };
  let frame = 2; let observedAt = 1260;
  globalThis.performance = { now: () => observedAt };
  const shooter = { id: 7, occupantGeneration: 17, type: 'ship', alive: true, data: {} };
  globalThis.window = { SF: { state: { entities: new Map([[7, shooter]]) } } };
  globalThis.document = { querySelectorAll: () => [{
    getAttribute: key => key === 'data-entity-id' ? '7' : key === 'data-placement-read'
      ? JSON.stringify(placement) : 'bottom',
    getBoundingClientRect: () => ({ left: 470, top: 518, width: 20, height: 20 }),
    parentNode: { getAttribute: () => String(frame) },
  }] };
  globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
  try {
    assert.equal(observeEdgeMarkers()[0].shooter.id, 7,
      'producer approved grace at1240; wall time1260 does not change that painted publication');
    observedAt = 1600;
    assert.equal(observeEdgeMarkers()[0].shooter.id, 7, 'an unchanged presented frame retains custody');
    frame = 3;
    const stale = observeEdgeMarkers()[0];
    assert.equal(stale.shooter, null, 'a slot left over from an older publication is stale');
    assert.equal(stale.placementFailure.reason, 'older halo publication');
    assert.deepEqual(stale.placementFailure.placement, placement, 'invalid observations retain their exact producer read');
    placement.frame = 3; placement.checkedAt = 1260;
    const expired = observeEdgeMarkers()[0];
    assert.equal(expired.shooter, null, 'the producer cannot renew grace after expiry');
    assert.equal(expired.placementFailure.reason, 'expired at halo publication');
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
