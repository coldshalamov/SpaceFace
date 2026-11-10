import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { ships } from '../src/systems/ships.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { uniqueWreckMapReadouts } from '../src/ui/uniqueWreckMapLayer.js';

const META_SEED = 4242;
const D10 = 'wreck_choir_tender';

function boot() {
  const sim = createSimulation({
    seed: META_SEED,
    systems: [salvageActions, uniqueWrecks, cargo, economy, ships],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.cargo.capVolume = 400;
  state.player.cargo.capMass = 1e9;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  return {
    sim, state, bus,
    system: sim.registry.get('uniqueWrecks'),
    dispose() { sim.dispose(); },
  };
}

function recordOf(t, wreckId = D10) {
  return t.state.player.uniqueWrecks.bearings[wreckId] || null;
}

function liveWreck(t, wreckId = D10) {
  return t.state.entityList.find((entity) => entity.alive !== false
    && entity.data && entity.data.uniqueWreckId === wreckId) || null;
}

function driveToDecision(t) {
  t.bus.emit('game:started', {});
  const wreck = liveWreck(t);
  assert.ok(wreck, 'the game-start rumor materializes the tender');
  t.bus.emit('scan:pulse', { pos: { ...recordOf(t).exactPos } });
  assert.equal(recordOf(t).phase, 'fixed');
  t.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
  assert.equal(recordOf(t).phase, 'decision');
  return wreck;
}

function posOf(entity) {
  return { x: entity.pos.x, z: entity.pos.z };
}

test(`seed ${META_SEED}: the site stays physical between recovery and choice (decision husk)`, () => {
  const t = boot();
  try {
    driveToDecision(t);
    const record = recordOf(t);
    const husk = liveWreck(t);
    assert.ok(husk, 'a claim-pending husk materializes the moment recovery completes');
    assert.notEqual(husk.id, undefined);
    assert.equal(husk.data.uniqueWreckId, D10);
    assert.equal(husk.data._salvaged, true);
    assert.deepEqual(posOf(husk), { x: record.fixedPos.x, z: record.fixedPos.z });
    assert.match(husk.data.scanLabel, /RECOVERY CLAIM PENDING/);
    assert.match(husk.data.scanDescription, /recovery claim is still open/i);
    assert.equal(husk.data.interactionPrompt, 'RECOVERY CLAIM PENDING');
    assert.deepEqual(husk.data.salvagePool, {}, 'the drained recovery pays no husk scrap before the choice');
    assert.equal(husk.data.unstableReactor, undefined, 'a husk never re-arms the reactor');

    // Leave (entities despawn) and re-enter: the pending site is still there.
    husk.alive = false;
    t.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
    const again = liveWreck(t);
    assert.ok(again, 're-entry keeps the claim-pending site physical');
    assert.match(again.data.scanLabel, /RECOVERY CLAIM PENDING/);
    assert.deepEqual(posOf(again), { x: record.fixedPos.x, z: record.fixedPos.z });
  } finally {
    t.dispose();
  }
});

test(`seed ${META_SEED}: a claimed site re-entry shows a choice-stamped husk with its residual pool`, () => {
  const t = boot();
  try {
    driveToDecision(t);
    t.bus.emit('uniqueWreck:choose', { wreckId: D10, choiceId: 'claim_hardware', source: 'test' });
    assert.equal(recordOf(t).phase, 'salvaged');
    assert.equal(recordOf(t).outcome, 'claimed');

    // The choice itself re-stamps the on-site husk immediately.
    const stamped = liveWreck(t);
    assert.ok(stamped, 'the outcome-stamped husk is legible on site right after the choice');
    assert.match(stamped.data.scanLabel, /CLAIMED AS SALVAGE/);

    // Leave and re-enter: the map ring still points at a real, stamped place.
    stamped.alive = false;
    t.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
    const site = liveWreck(t);
    assert.ok(site, 'flying back finds the husk, not empty space');
    assert.equal(site.data.uniqueWreckId, D10);
    assert.equal(site.data._salvaged, true);
    const record = recordOf(t);
    assert.deepEqual(posOf(site), { x: record.fixedPos.x, z: record.fixedPos.z });
    assert.match(site.data.scanLabel, /CHOIR-TENDER · REACTOR LEAK · CLAIMED AS SALVAGE/);
    assert.match(site.data.scanDescription, /repair swarm and relief cargo entered your manifest/);
    assert.equal(site.data.interactionPrompt, 'OUTCOME FILED — SEE SCAN');
    assert.deepEqual(site.data.salvagePool, { cmdty_scrap_metal: 1 }, 'the claim keeps salvage rights to the husk');
    assert.equal(site.data.unstableReactor, undefined);

    const [mapRow] = uniqueWreckMapReadouts(t.state, 'sector_helios_prime');
    assert.equal(mapRow.phase, 'salvaged');
    assert.equal(mapRow.statusLabel, 'OUTCOME RECORDED');

    // Nothing pays twice: the husk cannot reopen a decision, re-grant hardware, or re-run news.
    const grantsBefore = t.state.player.moduleInventory.filter((entry) => entry.defId === 'unique_knitbots').length;
    const newsBefore = (t.state.ui.marketNews ? t.state.ui.marketNews.log : []).length;
    t.bus.emit('salvage:completed', { wreckId: site.id, loot: {} });
    t.bus.emit('uniqueWreck:choose', { wreckId: D10, choiceId: 'claim_hardware', source: 'duplicate' });
    assert.equal(recordOf(t).phase, 'salvaged');
    assert.equal(t.state.player.moduleInventory.filter((entry) => entry.defId === 'unique_knitbots').length, grantsBefore);
    assert.equal((t.state.ui.marketNews ? t.state.ui.marketNews.log : []).length, newsBefore);
  } finally {
    t.dispose();
  }
});

test(`seed ${META_SEED}: a handed-over site is stamped and impounded — no salvage pays twice`, () => {
  const t = boot();
  try {
    driveToDecision(t);
    t.bus.emit('uniqueWreck:choose', { wreckId: D10, choiceId: 'authority_handover', source: 'test' });
    assert.equal(recordOf(t).phase, 'salvaged');
    assert.equal(recordOf(t).outcome, 'handed_over');

    liveWreck(t).alive = false;
    t.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
    const site = liveWreck(t);
    assert.ok(site, 'the handed-over site persists as a place with a past');
    assert.equal(site.data._salvaged, true);
    assert.match(site.data.scanLabel, /CHOIR-TENDER · REACTOR LEAK · RETURNED TO RELIEF CONTROL/);
    assert.match(site.data.scanDescription, /Relief control accepted the recovery manifest/);
    assert.deepEqual(site.data.salvagePool, {}, 'impounded custody leaves nothing to strip for a second pay');
  } finally {
    t.dispose();
  }
});
