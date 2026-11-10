// Unique-wreck save fidelity (Lane 3 fix-uniquewrecks-persist):
//  - a charted/salvaged Ceres or expansion activity hull survives normalization (no re-rumor/re-pay)
//  - an elapsed reactor fuse is not restored onto the reminted hull; the claim still opens
//  - a claim that cannot fit its bonus cargo stays open instead of discarding the cargo
//  - claiming Choir-Tender starts the SCN investigator (D10 no longer swallowed)
//  - story-data rewards grant their unlock flag and buyer choices, and both survive a reload
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { cargo } from '../src/systems/cargo.js';
import { ships } from '../src/systems/ships.js';
import { uniqueWrecks, normalizeUniqueWreckState } from '../src/systems/uniqueWrecks.js';
import { runShareWreckId } from '../src/core/runShareCode.js';
import { CERES_ACTIVITY_WRECKS, EXPANSION_ACTIVITY_WRECKS, UNIQUE_WRECKS } from '../src/data/uniqueWrecks.js';

const TENDER = 'wreck_choir_tender';

function boot(seed = 77231, sectorId = 'sector_helios_prime') {
  const sim = createSimulation({ seed, systems: [salvageActions, uniqueWrecks, cargo, ships] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  state.player.cargo.capVolume = 40;
  state.player.cargo.capMass = 1e9;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const events = [];
  for (const name of ['uniqueWreck:encounterRequested', 'uniqueWreck:choiceBlocked',
    'uniqueWreck:storyRewardGranted', 'uniqueWreck:decisionReady']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  return { sim, state, bus, events, system: sim.registry.get('uniqueWrecks') };
}

function hearTender(t) {
  t.bus.emit('news:headline', { wreckId: TENDER, sourceRef: 'news.tragedy_at_helios', channelId: 'news' });
  return t.state.player.uniqueWrecks.bearings[TENDER];
}
const tenderEntity = (t) => t.state.entityList.find((e) => e.alive !== false && e.data?.uniqueWreckId === TENDER);

test('Ceres and expansion activity bearings survive save normalization instead of re-rumoring', () => {
  const ceres = CERES_ACTIVITY_WRECKS[0], expansion = EXPANSION_ACTIVITY_WRECKS[0];
  const raw = {
    bearings: {
      [ceres.id]: { phase: 'salvaged', fixedAtS: 10, salvagedAtS: 20, choiceId: 'claim_hardware', outcome: 'claimed' },
      [expansion.id]: { phase: 'fixed', fixedAtS: 5 },
    },
    published: { [ceres.id]: true, [expansion.id]: true },
  };
  const out = normalizeUniqueWreckState(raw, 4242);
  assert.equal(out.bearings[ceres.id]?.phase, 'salvaged');
  assert.equal(out.bearings[ceres.id].outcome, 'claimed');
  assert.equal(out.bearings[expansion.id]?.phase, 'fixed');
  assert.equal(out.published[ceres.id], true);
  assert.equal(out.published[expansion.id], true);
  // Re-normalizing is stable (save → load → save).
  assert.deepEqual(normalizeUniqueWreckState(JSON.parse(JSON.stringify(out)), 4242).bearings, out.bearings);
});

test('an elapsed reactor fuse is not restored onto the reminted hull; the claim still opens', () => {
  const a = boot();
  try {
    const record = hearTender(a);
    a.bus.emit('scan:pulse', { pos: { ...record.exactPos } });
    const fixed = a.state.player.uniqueWrecks.bearings[TENDER];
    assert.equal(fixed.phase, 'fixed');
    assert.ok(Number.isFinite(fixed.reactorDueAt), 'the fixed tender arms its reactor');
    const checkpoint = JSON.parse(JSON.stringify(a.system.serialize()));

    const b = boot();
    try {
      b.state.simTime = fixed.reactorDueAt + 600; // the player was away well past the fuse
      b.system.deserialize(checkpoint);
      b.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
      const hull = tenderEntity(b);
      assert.ok(hull, 'the fixed hull is present on return');
      const fuse = hull.data.unstableReactor;
      assert.ok(!fuse || fuse.dueAt > b.state.simTime, 'no already-due fuse rides the reminted hull');
      for (let i = 0; i < 30; i++) b.sim.step(1 / 60);
      const still = tenderEntity(b);
      assert.ok(still, 'the hull was not detonated on return');
      b.bus.emit('salvage:completed', { wreckId: still.id, loot: {} });
      assert.equal(b.state.player.uniqueWrecks.bearings[TENDER].phase, 'decision', 'the recovery claim opens');
    } finally { b.sim.dispose(); }
  } finally { a.sim.dispose(); }
});

test('claim with no room for bonus cargo stays open; claiming Choir-Tender starts the SCN investigator', () => {
  const t = boot();
  try {
    const record = hearTender(t);
    t.bus.emit('scan:pulse', { pos: { ...record.exactPos } });
    t.bus.emit('salvage:completed', { wreckId: tenderEntity(t).id, loot: {} });
    assert.equal(t.state.player.uniqueWrecks.bearings[TENDER].phase, 'decision');

    // Fill the hold: the 50-medical claim (40 volume) cannot be paid.
    t.state.player.cargo.usedVolume = 39;
    t.bus.emit('uniqueWreck:choose', { wreckId: TENDER, choiceId: 'claim_hardware', source: 'test' });
    assert.equal(t.state.player.uniqueWrecks.bearings[TENDER].phase, 'decision', 'choice stays open');
    assert.ok(t.events.some((e) => e.name === 'uniqueWreck:choiceBlocked' && e.payload.reason === 'cargo_full'));

    t.state.player.cargo.usedVolume = 0;
    t.bus.emit('uniqueWreck:choose', { wreckId: TENDER, choiceId: 'claim_hardware', source: 'test' });
    assert.equal(t.state.player.uniqueWrecks.bearings[TENDER].phase, 'salvaged');
    assert.ok((t.state.player.cargo.items.cmdty_medical || 0) > 0, 'bonus cargo paid once there is room');
    assert.ok(t.events.some((e) => e.name === 'uniqueWreck:encounterRequested'
      && e.payload.encounterId === 'unique_wreck_choir_tender_investigator'),
    'the D10 investigator request is no longer swallowed');
  } finally { t.sim.dispose(); }
});

test('a pulled cross-run black box stays pulled across save normalization (additive ledger)', () => {
  const wreck = {
    v: 2, sectorId: 'sector_helios_prime', pos: { x: 100, z: -50 }, hullId: 'ship_kestrel', loadout: [],
    killReplay: { durationS: 5, hullLength: 12, samples: [{ x: 0, z: 0, bx: 1, bz: 1 }, { x: 1, z: 1, bx: 2, bz: 2 }] },
  };
  const first = normalizeUniqueWreckState({ crossRunWrecks: [wreck] }, 4242);
  assert.equal(first.crossRunWrecks?.length, 1, 'fixture is a valid shared wreck');
  assert.equal('crossRunBlackBoxes' in first, false, 'older saves carry no ledger and gain none');
  const id = runShareWreckId(first.crossRunWrecks[0]);
  const saved = JSON.parse(JSON.stringify({ ...first, crossRunBlackBoxes: { [id]: true, 'cross-run:stale:0': true } }));
  const reloaded = normalizeUniqueWreckState(saved, 4242);
  assert.deepEqual(reloaded.crossRunBlackBoxes, { [id]: true }, 'the pulled box survives; an unknown id drops');
  assert.equal(runShareWreckId(reloaded.crossRunWrecks[0]), id, 'shared-wreck identity hash is untouched');
});

test('story-data rewards grant unlock flag + buyer choices, and both survive normalization', () => {
  const def = UNIQUE_WRECKS.find((row) => (row.uniqueDrops || []).some((d) => d.unlockFlag));
  const drop = def.uniqueDrops.find((d) => d.unlockFlag);
  const raw = { storyRewards: { [drop.id]: { wreckId: def.id, kind: drop.kind, flagKey: drop.flagKey,
    grantedAtS: 3, unlockFlag: drop.unlockFlag, choices: ['a', 7, 'b'] } } };
  const out = normalizeUniqueWreckState(raw, 4242);
  assert.equal(out.storyRewards[drop.id].unlockFlag, drop.unlockFlag);
  assert.deepEqual(out.storyRewards[drop.id].choices, ['a', 'b']);
  // An older save without the additive fields still loads unchanged.
  const old = normalizeUniqueWreckState({ storyRewards: { [drop.id]: { wreckId: def.id, kind: drop.kind, grantedAtS: 1 } } }, 4242);
  assert.equal('unlockFlag' in old.storyRewards[drop.id], false);
});
