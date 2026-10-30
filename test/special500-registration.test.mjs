// Lane 3 fix-special500: the 500-entry special catalog was exported, tested, and never
// registered in production — the whole catalog was inert. These proofs pin the manifest rows,
// both lookup tables, a booted production runtime firing a satisfiable entry exactly once,
// and the catalog-data invariants (no template tokens on player surfaces, every live anchor
// names a real station/POI, every chain names a live predecessor).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
  getDeclaredSystemClock,
  validateSystemClockDeclarations,
} from '../src/runtime/authoritativeSystemManifest.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { resolveRuntimeManifest } from '../src/runtime/resolveRuntimeManifest.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { createRegistry } from '../src/core/registry.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { SPECIAL500 } from '../src/data/special500/index.js';
import { SECTORS } from '../src/data/sectors.js';

const count = (list, id) => list.filter((x) => x === id).length;
const LIVE = SPECIAL500.filter((e) => !e.dormant);

test('manifest carries special500 once in both orders on the calendar clock', () => {
  assert.equal(count(PRODUCTION_INIT_ORDER, 'special500'), 1);
  assert.equal(count(PRODUCTION_UPDATE_ORDER, 'special500'), 1);
  assert.equal(getDeclaredSystemClock('special500'), 'calendar');
  assert.deepEqual(validateSystemClockDeclarations(), []);
  // Sweeps after story so same-tick flags are visible, and before voiceArbiter collects comms.
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('special500') > PRODUCTION_UPDATE_ORDER.indexOf('story'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('special500') < PRODUCTION_UPDATE_ORDER.indexOf('voiceArbiter'));
});

test('both lookup tables resolve special500', () => {
  const nodeLookup = getNodeSystemFactoryTable();
  assert.equal(nodeLookup.get('special500')?.name, 'special500');
  const resolved = resolveRuntimeManifest({ profileId: 'production', systemLookup: nodeLookup, nodeSafeOnly: true });
  assert.ok(resolved.authoritativeSystems.some((s) => s && s.name === 'special500'));
  assert.ok(resolved.authoritativeUpdateOrder.some((s) => s && s.name === 'special500'));
  const registry = createRegistry({ state: createGameState(11), bus: createBus(), helpers: {}, applyRuntimeFeatures: false });
  assert.equal(registry.get('special500')?.name, 'special500');
});

test('a booted production runtime fires a satisfiable receipt entry exactly once', () => {
  const entry = LIVE.find((e) => e.trigger?.type === 'receipt' && !(e.sectors && e.sectors.length)
    && !e.after && !e.notBeforeS && !(e.trigger.nth > 1) && !e.trigger.where
    && (e.channel === 'commsLog' || e.channel === 'comms' || e.channel === 'news'));
  assert.ok(entry, 'the catalog has an unconditional receipt entry');
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 4242 });
  try {
    const { state, bus } = runtime;
    assert.equal(runtime.getSystem('special500')?.name, 'special500');
    const text = entry.payload?.text || entry.title;
    const heard = [];
    for (const ev of ['comms:log', 'comms:popup', 'news:publish']) {
      bus.on(ev, (p) => { if (p && p.text === text) heard.push(ev); });
    }
    runtime.runTicks(2, 0.5);
    bus.emit(entry.trigger.event, {});
    runtime.runTicks(4, 0.5); // past the 0.5 s calendar cadence
    assert.ok(state.story?.flags?.[`special500.${entry.id}`] != null, `${entry.id} fired through the host step`);
    assert.equal(heard.length, 1, `${entry.id} reached its channel once`);
    bus.emit(entry.trigger.event, {});
    runtime.runTicks(4, 0.5);
    assert.equal(heard.length, 1, 'a once-per-save entry does not refire');
  } finally {
    runtime.dispose();
  }
});

test('no live catalog entry carries an unfilled template token to a player surface', () => {
  const template = /\[(TODAY'?S DATE|DAY OF FILING|YOUR [A-Z ]+|[a-z][a-z ]+)\]/;
  for (const e of LIVE) {
    const text = JSON.stringify(e.payload || {});
    assert.equal(template.test(text), false, `${e.id} ships a template token: ${text.match(template)?.[0]}`);
  }
});

test('every live proximity anchor names a real station/POI and every chain names a live entry', () => {
  const ids = new Set();
  for (const s of SECTORS) {
    for (const st of s.stations || []) ids.add(st.id);
    for (const p of s.pois || []) ids.add(p.id);
  }
  const byId = new Map(SPECIAL500.map((e) => [e.id, e]));
  for (const e of LIVE) {
    const t = e.trigger || {};
    if (t.type === 'proximity') assert.ok(ids.has(t.nearStation), `${e.id} anchor ${t.nearStation} resolves`);
    if (t.type === 'flag' && String(t.requires).startsWith('special500.')) {
      const dep = byId.get(t.requires.slice('special500.'.length));
      assert.ok(dep && !dep.dormant, `${e.id} chains on a live entry`);
    }
    for (const id of e.after || []) assert.ok(byId.get(id) && !byId.get(id).dormant, `${e.id} after ${id} is live`);
  }
  for (const e of SPECIAL500.filter((x) => x.dormant)) {
    assert.ok(typeof e.dormantReason === 'string' && e.dormantReason.length > 10, `${e.id} documents why it is dormant`);
  }
});
