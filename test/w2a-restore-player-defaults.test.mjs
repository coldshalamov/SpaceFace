// W2-A / O9 — Loading a save must not keep progress from the run you left.
//
// _restorePlayer used to lay the saved player record over the LIVE one: every property the
// snapshot omitted survived, and nested bags were unioned with the live bag. Loading an earlier
// save therefore kept researchFirsts["signal:S"] earned later, so re-investigating the signal paid
// nothing (the grant key was still on the ledger), plus hot-customs flags, debt clocks and every
// extra counter in stats/hints. The record is now rebuilt from the defaults a New Game starts from.
// Run: node --test test/w2a-restore-player-defaults.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { defaultPlayer } from '../src/core/gameState.js';
import { fnv1a } from '../src/save/checksum.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { salvage } from '../src/systems/salvage.js';
import { missions } from '../src/systems/missions.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { createDomainDiffer, applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';

const SECTOR = 'sector_helios_prime';
const SYSTEMS = [spawnBudget, cargo, economy, factions, heat, encounterDirector, salvage, missions, world, save];

function boot(seed) {
  const sim = createSimulation({ seed, systems: SYSTEMS });
  const { state } = sim;
  state.mode = 'flight';
  sim.registry.get('world').enterSector(SECTOR);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 120, z: -80 }, vel: { x: 10, z: 0 },
    hull: 140, hullMax: 140, radius: 6,
  });
  state.playerId = player.id;
  state.player.credits = 4200;
  sim.runTicks(120);
  return sim;
}

const clone = (value) => JSON.parse(JSON.stringify(value));

// Re-seal an envelope after editing its data, the way the production encoder would.
function resealed(envelope, edit) {
  const out = clone(envelope);
  edit(out.data);
  out.checksum = fnv1a(JSON.stringify(out.data));
  return out;
}

function investigate(sim, signalId) {
  const before = sim.state.player.researchPoints || 0;
  sim.bus.emit('signal:investigated', { signalId });
  return (sim.state.player.researchPoints || 0) - before;
}

test('an earlier save does not keep a discovery first earned after it, so the first pays again', () => {
  const sim = boot(4747);
  const saver = sim.registry.get('save');
  const earlier = clone(saver.serialize('quick'));
  const rpAtSave = sim.state.player.researchPoints || 0;
  assert.equal('signal:S' in (sim.state.player.researchFirsts || {}), false);

  assert.equal(investigate(sim, 'S'), 3, 'the first investigation of a signal pays');
  assert.equal(investigate(sim, 'S'), 0, 'the same signal never pays twice in one run');
  assert.ok('signal:S' in sim.state.player.researchFirsts);

  assert.equal(saver.loadEnvelope(earlier, 'quick'), true);
  assert.equal(sim.state.player.researchPoints || 0, rpAtSave, 'RP is the saved balance');
  assert.equal('signal:S' in (sim.state.player.researchFirsts || {}), false,
    'the later run\'s ledger entry did not survive the load');
  assert.equal(investigate(sim, 'S'), 3, 'loading the earlier save, re-investigating pays again');
  sim.dispose();
});

test('progress properties and nested counters the save omits are cleared, not inherited', () => {
  const sim = boot(4748);
  const saver = sim.registry.get('save');
  const earlier = clone(saver.serialize('quick'));
  const p = sim.state.player;

  // The run goes on and accumulates state the earlier save never had.
  p.customsHotUntil = { faction_free: 99999 };
  p.debtSinceDay = 3;
  p.emergencyRepairBudget = { day: 2, usedHull: 80 };
  p.researchGrantDays = { 'research:bounty': { dayKey: 'd9', count: 8 } };
  p.researchContractDay = { dayKey: 'd9', count: 4 };
  p.heat = 0.9;
  p.bounty = 500;
  p.stats.laterRunCounter = 41;
  p.hints.firstFlight = true;
  p.hints.laterHint = true;
  p.massSeed.cooldownUntil = 9999;
  p.tradeLedger = [{ id: 'later-trade' }];
  p.tradeLots = { later: { qty: 1 } };

  assert.equal(saver.loadEnvelope(earlier, 'quick'), true);
  const q = sim.state.player;
  assert.equal(q, p, 'the player record is rebuilt in place: other owners hold the object');
  for (const key of ['customsHotUntil', 'debtSinceDay', 'emergencyRepairBudget', 'researchGrantDays',
    'researchContractDay']) {
    assert.equal(key in q, false, `${key} from the run left behind is gone`);
  }
  assert.equal(q.heat, earlier.data.player.heat ?? 0);
  assert.equal(q.bounty, earlier.data.player.bounty ?? 0);
  assert.equal('laterRunCounter' in q.stats, false, 'a nested bag is the save\'s, not the union with the live bag');
  assert.equal('laterHint' in q.hints, false);
  assert.equal(q.hints.firstFlight, earlier.data.player.hints.firstFlight);
  assert.equal(q.massSeed.cooldownUntil, earlier.data.player.massSeed.cooldownUntil);
  assert.deepEqual(q.tradeLedger || [], earlier.data.player.tradeLedger || []);
  assert.equal('later' in (q.tradeLots || {}), false);
  sim.dispose();
});

test('fields an older save legitimately omits come back as the New Game defaults, not the live values', () => {
  const sim = boot(4749);
  const saver = sim.registry.get('save');
  const base = clone(saver.serialize('quick'));
  const old = resealed(base, (data) => {
    for (const key of ['hints', 'massSeed', 'stats', 'efficiencyMods', 'insurance', 'miningBeam',
      'heatZone', 'fireGroups', 'heat', 'debt', 'bounty', 'researchPoints', 'salvageRights']) {
      delete data.player[key];
    }
  });

  const p = sim.state.player;
  p.hints.firstFlight = true;
  p.massSeed.cooldownUntil = 777;
  p.stats.kills = 99;
  p.heat = 0.8;
  p.debt = 1234;
  p.researchPoints = 55;
  p.insurance.rate = 0.1;

  assert.equal(saver.loadEnvelope(old, 'quick'), true);
  const fresh = defaultPlayer();
  const q = sim.state.player;
  assert.deepEqual(q.hints, fresh.hints);
  assert.deepEqual(q.massSeed, fresh.massSeed);
  assert.deepEqual(q.stats, fresh.stats);
  assert.deepEqual(q.insurance, fresh.insurance);
  assert.deepEqual(q.heatZone, fresh.heatZone);
  assert.deepEqual(q.fireGroups, fresh.fireGroups);
  assert.equal(q.heat, 0);
  assert.equal(q.debt, 0);
  assert.equal(q.bounty, 0);
  assert.equal(q.researchPoints, 0);
  assert.equal(q.credits, base.data.player.credits, 'what the save does carry is restored as written');
  assert.ok(q.efficiencyMods && q.efficiencyMods.miningYieldMult === 1, 'normalised bags still default');
  sim.dispose();
});

test('a restore leaves the saved player record exactly what was saved, and the sim keeps ticking', () => {
  const sim = boot(4750);
  const saver = sim.registry.get('save');
  investigate(sim, 'S2');
  sim.state.player.customsHotUntil = { faction_free: 5 };
  const saved = clone(saver.serialize('quick'));

  // A different, later run in the same session.
  investigate(sim, 'S3');
  sim.state.player.debtSinceDay = 1;
  sim.state.player.stats.kills = 12;

  assert.equal(saver.loadEnvelope(saved, 'quick'), true);
  // This harness has no ships system, so a hull-less save is repaired to a starter hull on load;
  // everything else must come back byte for byte.
  const after = clone(saver.serialize('quick').data.player);
  delete after.ownedShips;
  const before = clone(saved.data.player);
  delete before.ownedShips;
  assert.deepEqual(after, before,
    'the player section round-trips exactly through a restore into a dirtied session');
  sim.runTicks(120);
  const entity = sim.state.entities.get(sim.state.playerId);
  assert.ok(entity && entity.alive !== false, 'the restored sim ticks cleanly with the rebuilt record');
  sim.dispose();
});

test('the main-thread mirror drops what the restore deleted (the screen cannot show the old run)', () => {
  const sim = boot(4751);
  const saver = sim.registry.get('save');
  const earlier = clone(saver.serialize('quick'));

  // The default route reads state through a mirror kept by the domain differ, not the sim object.
  const domains = new Map();
  const differ = createDomainDiffer();
  // The differ re-signs each node on its own staggered tick, so pump a few frames per read.
  let frame = sim.state.tick;
  const mirror = () => {
    for (let i = 0; i < 16; i++) {
      for (const update of differ.diff(sim.state, frame++).updates) {
        applyDomainPathUpdate(domains, update, new Set());
      }
    }
  };
  mirror();
  investigate(sim, 'S');
  sim.state.player.customsHotUntil = { faction_free: 99999 };
  sim.state.player.stats.laterRunCounter = 41;
  mirror();
  assert.ok('signal:S' in domains.get('player').researchFirsts, 'sanity: the mirror saw the later run');
  assert.ok('customsHotUntil' in domains.get('player'));

  assert.equal(saver.loadEnvelope(earlier, 'quick'), true);
  mirror();
  const shown = domains.get('player');
  assert.equal('customsHotUntil' in shown, false, 'a deleted property is deleted in the mirror');
  assert.equal('signal:S' in (shown.researchFirsts || {}), false, 'and so is the ledger entry');
  assert.equal('laterRunCounter' in shown.stats, false, 'and a nested key that disappeared');
  assert.deepEqual(clone(shown.hints), clone(sim.state.player.hints));
  assert.equal(shown.credits, sim.state.player.credits);
  sim.dispose();
});
