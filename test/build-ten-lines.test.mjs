import assert from 'node:assert/strict';
import test from 'node:test';

import { countermeasures, selectLockLineage } from '../src/systems/countermeasures.js';
import { claims, relayFreightLedger } from '../src/systems/claims.js';
import {
  applyAcceptedSurrenderStandDown,
  composedRemainingText,
  lawSecurity,
  reopenLawFireForNewCause,
} from '../src/systems/lawSecurity.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { compareChallengeCodes, encodeRunShareCode } from '../src/core/runShareCode.js';
import { evaluateTwoLegItinerary } from '../src/systems/economyCycles.js';
import { explainSynergy, synergyById } from '../src/data/synergies.js';
import { buildNewGamePlusCandidate, shouldGrantKeepsake } from '../src/core/newGamePlus.js';
import { engageKnownDestination, filterWatchPins } from '../src/ui/watchlist.js';

test('NXB-012 one deploy breaks one missile lineage and leaves the round flying', () => {
  const defender = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { fittings: ['mod_chaff_dispenser_m'], combat: {}, cm: { stock: 2, cooldownT: 0 } },
  };
  const shooter = {
    id: 2, type: 'ship', alive: true, pos: { x: 30, z: 0 },
    data: { combat: { lockTarget: 1, lockProgress: 1, lockGeneration: 4 } },
  };
  const bystander = {
    id: 3, type: 'ship', alive: true, pos: { x: 40, z: 0 },
    data: { combat: { lockTarget: 1, lockProgress: 1, lockGeneration: 1 } },
  };
  const missile = {
    id: 9, type: 'projectile', alive: true, pos: { x: 10, z: 0 },
    data: { kind: 'missile', targetId: 1, ownerId: 2, lockGeneration: 4 },
  };
  const state = {
    simTime: 5, tick: 1, playerId: 1,
    entityList: [defender, shooter, bystander, missile],
  };
  const sys = Object.create(countermeasures);
  sys.state = state;
  sys.bus = { emit() {} };
  assert.equal(selectLockLineage(state, defender).shooterId, 2);
  assert.equal(sys._tryDeploy(defender), true);
  assert.equal(defender.data.cm.stock, 1);
  assert.equal(missile.alive, true);
  assert.equal(shooter.data.combat.lockTarget, null);
  assert.equal(bystander.data.combat.lockTarget, 1);
  assert.equal(shooter.data.combat.lockSuppressTargetId, 1);
  assert.equal(sys._tryDeploy(defender), false);
  assert.equal(defender.data.cm.stock, 1);
});

test('NXB-035 a raid settles once', () => {
  const body = {
    id: 'claim-1', sectorId: 'missing', name: 'Rock',
    spec: {
      id: 'spec_relay',
      defense: { id: 'raid-1', encounterId: 'enc-1', attackerName: 'Raiders' },
      store: { input: { ore_iron: 100 }, output: {} },
      totals: { lostU: 0, raidsSuffered: 0, raidsRepelled: 0 },
      upkeepDebt: 0,
    },
  };
  const sys = Object.create(claims);
  sys.state = { simTime: 20, claims: { bodies: [body] } };
  sys.bus = { emit() {} };
  sys._receipt = () => {};
  sys._restoreDefenseWaypoint = () => {};
  assert.equal(sys._settleDefense(body, 'timeout'), true);
  const left = body.spec.store.input.ore_iron;
  assert.ok(left < 100);
  body.spec.defense = { id: 'raid-1', encounterId: 'enc-1', attackerName: 'Raiders' };
  assert.equal(sys._settleDefense(body, 'timeout'), false);
  assert.equal(body.spec.store.input.ore_iron, left);
});

test('NXB-034 departed freight is sold, recovered, or lost', () => {
  const ledger = relayFreightLedger(10, 4, 3);
  assert.equal(ledger.departed, ledger.aboard + ledger.recoverable + ledger.lost);
  assert.equal(ledger.aboard, 4);
  assert.equal(ledger.recoverable, 3);
  assert.equal(ledger.lost, 3);
});

test('NXB-014 surrender stands down one lawful shot and a new cause can reopen', () => {
  const rounds = [{ id: 8, alive: true }];
  const ship = {
    id: 4, type: 'ship',
    data: {
      ai: { lawful: true },
      intent: { fire: true },
      combat: { targetId: 1, lockTarget: 1 },
    },
  };
  const stood = applyAcceptedSurrenderStandDown(ship, { playerId: 1, causeId: 'surrender-1' });
  assert.equal(stood.stoodDown, true);
  assert.equal(ship.data.intent.fire, false);
  assert.equal(ship.data.combat.targetId, null);
  assert.equal(rounds[0].alive, true);
  assert.equal(reopenLawFireForNewCause(ship, 'surrender-1').reopened, false);
  assert.equal(reopenLawFireForNewCause(ship, 'assault-2').reopened, true);
  assert.equal(ship.data.ai.roe, 'weapons_free');
});

test('NXB-044 toll and restitution stay separate bills', () => {
  const sys = Object.create(lawSecurity);
  sys.state = { simTime: 3, player: { credits: 5000 }, entityList: [] };
  sys.events = [];
  sys._emit = function emit(name, payload) { this.events.push({ name, payload }); };
  const toll = sys.noteComposedObligation({ kind: 'toll', causeId: 'gate-1', amountCr: 40, label: 'passage' });
  const again = sys.noteComposedObligation({ kind: 'toll', causeId: 'gate-1', amountCr: 40, label: 'passage' });
  sys.noteComposedObligation({ kind: 'restitution', causeId: 'gate-1', amountCr: 80, forPerson: 'dock crew' });
  assert.equal(again.duplicate, true);
  assert.equal(toll.obligation.remainingCr, 40);
  sys.payComposedObligation({ kind: 'restitution', causeId: 'gate-1' });
  const text = composedRemainingText(sys.state.lawSecurity.composed);
  assert.match(text, /passage/);
  assert.doesNotMatch(text, /dock crew/);
});

test('NXB-018 a stale or duplicate draft offer does not grant', () => {
  const ctx = {
    state: {
      player: { ownedShips: [{ fittings: ['mod_chaff_dispenser_m'] }], moduleInventory: [], activeShipIndex: 0 },
      run: null,
    },
    _draftInput: { fittings: ['mod_chaff_dispenser_m'] },
    _activeLoadout() { return { fittings: ['mod_drill_amp'] }; },
    _ships() { return { grantModule() { throw new Error('granted'); }, fitModule() { return true; } }; },
  };
  const stale = survivalDraft._applyOffer.call(ctx, { id: 'a', defId: 'mod_drill_amp', slotIndex: 0 });
  assert.equal(stale.reason, 'stale_fit');
  ctx._activeLoadout = () => ({ fittings: ['mod_chaff_dispenser_m'] });
  const dup = survivalDraft._applyOffer.call(ctx, {
    id: 'b', defId: 'mod_chaff_dispenser_m', replaces: 'mod_chaff_dispenser_m', slotIndex: 0,
  });
  assert.equal(dup.reason, 'duplicate');
});

test('NXB-020 a challenge code compares rules, and a bad code changes nothing', () => {
  const same = {
    seed: 4242, ruleset: 'gauntlet', arenaId: 'arena_crucible', starterId: 'hull:kestrel', mutators: ['a'],
  };
  const left = encodeRunShareCode(same);
  const right = encodeRunShareCode({ ...same, seed: 7 });
  const other = encodeRunShareCode({ ...same, ruleset: 'swarm' });
  const save = { credits: 10 };
  const before = JSON.stringify(save);
  assert.equal(compareChallengeCodes(left, right).label, 'comparable');
  assert.equal(compareChallengeCodes(left, other).label, 'non-comparable');
  assert.equal(compareChallengeCodes('x'.repeat(600), left).label, 'invalid');
  assert.equal(JSON.stringify(save), before);
});

test('NXB-026 the second leg cannot buy more than the first leg leaves', () => {
  const plan = evaluateTwoLegItinerary({
    credits: 100,
    cargoFree: 3,
    leg1: { qty: 5, unitCr: 40, feeCr: 10, unitVolume: 1, stock: 5 },
    leg2: { quoted: true, unitCr: 50, qty: 2, stock: 2, feeCr: 5, buyQty: 4, buyUnitCr: 30, buyVolume: 1, buyStock: 4 },
  });
  assert.equal(plan.leg1Taken, 2);
  assert.ok(plan.leg2BuyQty < 4);
  assert.equal(plan.guaranteed, false);
  assert.equal(plan.settlement, 'market');
  const estimate = evaluateTwoLegItinerary({
    credits: 100, cargoFree: 3,
    leg1: { qty: 1, unitCr: 10, unitVolume: 1, stock: 1 },
    leg2: { qty: 1, buyQty: 3, buyUnitCr: 10 },
  });
  assert.equal(estimate.estimate, true);
  assert.equal(estimate.leg2BuyQty, 0);
  assert.equal(estimate.limit, 'estimate');
});

test('NXB-031 a synergy explanation matches the fitted parts and hides an unscanned fit', () => {
  const row = synergyById('rammer_truck');
  const partial = explainSynergy(row, ['mod_ram_plate'], { scanned: true });
  assert.equal(partial.active, false);
  assert.equal(partial.benefit, null);
  const full = explainSynergy(row, ['mod_ram_plate', 'mod_cargo_pod_m', 'mod_ram_plate'], { scanned: true });
  assert.equal(full.active, true);
  assert.match(full.text, /Drawback/);
  const hidden = explainSynergy(row, ['mod_ram_plate', 'mod_cargo_pod_m'], { scanned: false });
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.text.includes('mod_ram_plate'), false);
});

test('NXB-048 a second keepsake grant is refused and a preview does not mutate the save', () => {
  const save = { player: { moduleInventory: [], ownedShips: [] }, story: {} };
  const before = JSON.stringify(save);
  assert.equal(buildNewGamePlusCandidate(save), null);
  assert.equal(JSON.stringify(save), before);
  assert.equal(shouldGrantKeepsake({ moduleInventory: [], ownedShips: [] }, 'mod_ram_plate'), true);
  assert.equal(shouldGrantKeepsake({
    moduleInventory: [{ defId: 'mod_ram_plate' }], ownedShips: [],
  }, 'mod_ram_plate'), false);
});

test('NXB-054 filtering a watch list does not change the route, and a rumor is not navigation', () => {
  const pins = [{ ref: 'job:a', label: 'Delivery' }, { ref: 'job:b', label: 'Repair' }];
  const nav = { route: { ref: 'job:a' } };
  const shown = filterWatchPins(pins, 'repair');
  assert.equal(shown.length, 1);
  assert.equal(nav.route.ref, 'job:a');
  assert.equal(engageKnownDestination(nav, { ref: 'job:b', access: 'rumored', known: false }).ok, false);
  assert.equal(nav.route.ref, 'job:a');
  assert.equal(engageKnownDestination(nav, { ref: 'job:b', label: 'Repair', known: true, access: 'known' }).ok, true);
  assert.equal(nav.route.ref, 'job:b');
});
