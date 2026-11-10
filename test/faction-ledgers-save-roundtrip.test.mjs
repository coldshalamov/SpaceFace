// Meridian's obligations, the Archive's book and Tallyho's hunts used to live only in
// the session: a Continue wiped a warrant, laundered a black-file mark, and kept a
// bet's charge while dropping the bet. They now ride the save envelope like the
// Helix docket and the Vael ledger. This pins the real seam: serializeData writes the
// keys, the restore driver's _callDeserialize brings them back, an older save with no
// key heals to a fresh book, and a corrupt bag never throws.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';
import { factionMeridian, ensureMeridianState } from '../src/systems/faction_meridian.js';
import { archiveRedaction, ensureArchiveState } from '../src/systems/faction_archive.js';
import { tallyho, ensureTallyhoState } from '../src/systems/tallyho.js';
import { choirResonance, ensureChoirState } from '../src/systems/faction_choir.js';
import { factionConcord } from '../src/systems/faction_concord.js';
import { fulfillmentRoutes, ensureFulfillmentState } from '../src/systems/faction_fulfillment.js';

function boot() {
  const bus = createBus();
  const sim = createSimulation({
    seed: 4242, bus,
    systems: [factionMeridian, archiveRedaction, tallyho, choirResonance, factionConcord, fulfillmentRoutes],
  });
  const { state } = sim;
  state.mode = 'flight';
  save.init({ state, bus, helpers: {}, registry: sim.registry });
  return { sim, state, bus };
}

test('the envelope carries meridian, archive and tallyho — a Continue cannot launder them', () => {
  const { sim, state } = boot();
  try {
    ensureMeridianState(state).paid['spine:test:dividend'] = true;
    ensureArchiveState(state).seq = 7;
    const t = ensureTallyhoState(state);
    t.marks = 9; t.huntsRun = 4; t.paid['bet:1'] = true;

    const data = save.serializeData();
    for (const key of ['meridian', 'archive', 'tallyho']) {
      assert.ok(data[key] && typeof data[key] === 'object' && !Array.isArray(data[key]),
        `data.${key} is an envelope key — it is not session-only`);
    }
    assert.equal(data.meridian.paid['spine:test:dividend'], true, 'once-only payout latch rides the envelope');
    assert.equal(data.archive.seq, 7, 'archive sequence rides the envelope');
    assert.equal(data.tallyho.marks, 9, 'tallyho marks ride the envelope');
    assert.equal(data.tallyho.paid['bet:1'], true, 'the once-only bet stamp rides the envelope');

    // The serialized bag is a defensive copy: mutating the live book after capture
    // must not rewrite the snapshot.
    state.tallyho.marks = 99;
    assert.equal(data.tallyho.marks, 9, 'the snapshot does not alias the live book');

    // The load lane: wipe the live books, restore through the same calls the restore
    // driver makes.
    state.meridian = {}; state.archive = {}; state.tallyho = {};
    save._callDeserialize('faction_meridian', data.meridian);
    save._callDeserialize('archiveRedaction', data.archive);
    save._callDeserialize('tallyho', data.tallyho);

    assert.equal(state.meridian.paid['spine:test:dividend'], true, 'the payout latch survives a restore (no double pay)');
    assert.equal(state.archive.seq, 7, 'the archive sequence survives a restore');
    assert.equal(state.tallyho.marks, 9, 'tallyho standing survives a restore');
    assert.equal(state.tallyho.huntsRun, 4);
    assert.equal(state.tallyho.paid['bet:1'], true, 'a paid bet is not re-paid after Continue');
    assert.notEqual(state.tallyho, data.tallyho, 'the restored book does not alias the envelope');
  } finally { sim.dispose(); }
});

test('the envelope carries choir, concord and fulfillment — save then restore through the real seam', () => {
  const a = boot();
  let data;
  try {
    const c = ensureChoirState(a.state);
    c.pilgrimage.paidLegs['shrine_a>shrine_b'] = 321;
    c.sites.down.shrine_vesta_first_chord = 900;
    c.sites.relics.relic_vesta_helios_approach = true;
    a.state.concord = { lockedFormations: { sq1: { at: 5 } }, clamps: {}, mastSeen: { sq1: true } };
    const f = ensureFulfillmentState(a.state);
    f.orders[1].status = 'closed';
    f.nextSpawnAt.route_charon_spine = 4321;

    data = JSON.parse(JSON.stringify(save.serializeData()));
    for (const key of ['choir', 'concord', 'fulfillment']) {
      assert.ok(data[key] && typeof data[key] === 'object' && !Array.isArray(data[key]),
        `data.${key} is an envelope key — it is not session-only`);
    }
  } finally { a.sim.dispose(); }

  // A fresh run (a Continue) restores through the same calls the restore driver makes.
  const b = boot();
  try {
    save._callDeserialize('choirResonance', data.choir);
    save._callDeserialize('faction_concord', data.concord);
    save._callDeserialize('fulfillmentRoutes', data.fulfillment);
    const c = ensureChoirState(b.state);
    assert.equal(c.pilgrimage.paidLegs['shrine_a>shrine_b'], 321, 'a paid pilgrim leg is not paid again');
    assert.equal(c.sites.down.shrine_vesta_first_chord, 900, 'a slain shrine stays down across Continue');
    assert.equal(c.sites.relics.relic_vesta_helios_approach, true, 'the relic is not minted twice');
    assert.equal(b.state.concord.mastSeen.sq1, true, 'concord mast latch survives');
    assert.ok(b.state.concord.lockedFormations.sq1, 'concord lock row survives');
    const f = ensureFulfillmentState(b.state);
    assert.equal(f.orders[1].status, 'closed', 'Order #0000001 stays closed');
    assert.equal(f.nextSpawnAt.route_charon_spine, 4321, 'route respawn clock survives');
    assert.equal(b.sim.registry.get('fulfillmentRoutes').deliverOrderOne(b.state), false, 'no second payoff');
  } finally { b.sim.dispose(); }

  // An older save with none of the three keys loads clean to fresh books.
  const o = boot();
  try {
    assert.doesNotThrow(() => {
      save._callDeserialize('choirResonance', undefined);
      save._callDeserialize('faction_concord', undefined);
      save._callDeserialize('fulfillmentRoutes', undefined);
    });
    assert.deepEqual(ensureChoirState(o.state).pilgrimage.paidLegs, {});
    assert.equal(ensureFulfillmentState(o.state).orders[1].status, 'open');
  } finally { o.sim.dispose(); }
});

test('an older save with no ledger keys restores to fresh books', () => {
  const { sim, state } = boot();
  try {
    ensureMeridianState(state).paid.stale = true;
    ensureArchiveState(state).seq = 5;
    ensureTallyhoState(state).marks = 3;
    save._callDeserialize('faction_meridian', undefined);
    save._callDeserialize('archiveRedaction', undefined);
    save._callDeserialize('tallyho', undefined);
    assert.equal(state.meridian.paid.stale, undefined, 'another run’s obligations are not inherited');
    assert.equal(state.archive.seq, 0, 'the archive book is fresh');
    assert.equal(state.tallyho.marks, 0, 'the tallyho board is fresh');
  } finally { sim.dispose(); }
});

test('a corrupt bag heals without throwing', () => {
  const { sim, state } = boot();
  try {
    for (const bad of [null, 'junk', 42, [1, 2, 3], { sightings: 'nope', hunts: 7, paid: [] }]) {
      assert.doesNotThrow(() => save._callDeserialize('faction_meridian', bad));
      assert.doesNotThrow(() => save._callDeserialize('archiveRedaction', bad));
      assert.doesNotThrow(() => save._callDeserialize('tallyho', bad));
    }
    assert.ok(Array.isArray(state.tallyho.hunts), 'tallyho hunts re-normalize to a list');
    assert.ok(state.meridian && typeof state.meridian === 'object');
    assert.ok(state.archive && typeof state.archive === 'object');
  } finally { sim.dispose(); }
});

test('the incremental capture plan walks the same keys, in the same order, as the full serializer', () => {
  const { sim } = boot();
  try {
    const planKeys = save._saveCapturePlan().map(([key]) => key);
    const dataKeys = Object.keys(save.serializeData());
    // The envelope checksum is insertion-order sensitive and the worker-encoded lane
    // restores by the plan's keys: a key one lane writes and the other omits (or files
    // under another name — the frontier/frontierHomesteads mismatch) silently drops a
    // whole subsystem from Continue.
    const ours = ['frontier', 'helix', 'vael', 'meridian', 'archive', 'tallyho', 'choir', 'concord', 'fulfillment'];
    for (const key of ours) {
      assert.ok(planKeys.includes(key), `capture plan carries ${key}`);
      assert.ok(dataKeys.includes(key), `serializeData carries ${key}`);
    }
    assert.deepEqual(planKeys.filter((k) => ours.includes(k)), dataKeys.filter((k) => ours.includes(k)),
      'the two lanes order these keys identically');
    const missingFromPlan = dataKeys.filter((k) => !planKeys.includes(k));
    assert.deepEqual(missingFromPlan, [], `serializeData writes keys the capture plan omits: ${missingFromPlan.join(', ')}`);
  } finally { sim.dispose(); }
});
