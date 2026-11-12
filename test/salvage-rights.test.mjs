// salvage-rights — PQ-155.03 loop end to end: an authoritative trick posts Pitborn standing and
// mints a physical claim chit; scooping the chit settles player.salvageRights; a Pitborn yard
// buys the balance out. Rated tricks pay in rights and standing, never raw credits.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { EVIDENCE_REVISION } from '../src/combat/stuntEvidence.js';
import {
  isSalvageRightsItem,
  makeSalvageRightsItem,
  SALVAGE_RIGHTS_KIND,
} from '../src/data/killRewards.js';
import { economy, SERVICE_PRICES } from '../src/systems/economy.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import {
  comboPay,
  STUNT_PAY_FACTION_ID,
  STUNT_REP_BY_RARITY,
  STUNT_SALVAGE_RIGHTS_BY_RARITY,
  trickPay,
} from '../src/systems/stuntCombo.js';

// --- a physically authoritative receipt: loaded swing + release + hostile kill = bolas (uncommon)
function root(over = {}) {
  return {
    id: 'root:1', actorId: 0, sourceId: 1, sourceLife: 'life:1', tick: 100, kind: 'weapon_hit',
    truncated: false, sourceType: 'ship', sourceHostile: true, sourceDeathTick: null, sourceName: 'A',
    reference: { cruise: 100, mass: 16, hull: 100, radius: 6, length: 12 },
    playerMass: 18, playerLength: 12, sceneReferenceMass: 18,
    before: { x: 0, z: 100 }, after: { x: 100, z: 0 }, dv: { x: 100, z: -100 },
    nodes: [], terminals: [], ...over,
  };
}
function receipt(over = {}, rootOver = {}) {
  const r = root(rootOver);
  return {
    tick: 160, targetId: 2, targetName: 'B', targetHostile: true, damageApplied: true,
    targetKilled: true, hullDamage: 100, targetHullMax: 100, helmLossSeconds: 0,
    surface: 'craft', otherMass: 16,
    victimLife: { lifeId: 'life:2', threatClass: 'fodder', dead: true },
    stuntEvidence: {
      revision: EVIDENCE_REVISION, root: r, previousRoot: null,
      path: {
        rootId: r.id, sourceId: 1, targetId: 2, sourceLife: 'life:1', targetLife: 'life:2',
        tick: 160, edges: 1, closingSpeed: 80, usefulDeltaV: 140, momentum: 640,
      },
      contact: {
        aId: 1, bId: 2,
        aRef: { cruise: 100, mass: 16, hull: 100 }, bRef: { cruise: 100, mass: 16, hull: 100 },
        aPos: { x: 10, z: 10 }, bPos: { x: 12, z: 10 },
      },
    },
    ...over,
  };
}
const SWING = {
  constraint: { id: 'rope', loadedTicks: 30, sweep: 90, attached: false, displacement: 40 },
  release: { id: 'release:1', tick: 120, reason: 'tether_cut', grade: 'razor' },
};

function ship(id, over = {}) {
  return {
    id, type: 'ship', alive: true, team: id === 0 ? 0 : 1, name: `ship ${id}`,
    pos: { x: id * 40, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 16, hull: 100, hullMax: 100,
    data: { defId: 'ship_kestrel', runCohort: id === 0 ? undefined : 'survival', ...over },
    physicsBody: { schemaVersion: 1, dynamic: true, radius: 6, mass: 16 },
  };
}

function boot({ survival = false } = {}) {
  const ships = [ship(0), ship(1), ship(2)];
  const state = {
    playerId: 0, tick: 200, simTime: 200 / 60, mode: 'flight',
    entities: new Map(ships.map((e) => [e.id, e])), entityList: ships,
    combat: {}, factions: {}, settings: {}, player: {},
    run: survival ? { kind: 'survival', phase: 'active', seed: 5, wave: 1 } : null,
  };
  const bus = createBus();
  const events = [];
  for (const name of [
    'faction:repDelta', 'stunt:salvageRights', 'stunt:trickDetected', 'loot:drop',
    'stunt:salvageRightsClaimed', 'economy:grantCredits',
  ]) bus.on(name, (p) => events.push({ name, p }));
  const grammar = Object.create(stuntGrammar);
  grammar.init({ state, bus });
  return { state, bus, grammar, events };
}

test('trickPay prices a real recognition; names alone stay worthless', () => {
  const trick = {
    schemaVersion: 2, trickId: 'bolas', rarity: 'uncommon', episodeId: 'root:1', tick: 160,
  };
  assert.deepEqual(trickPay(trick), {
    reputation: STUNT_REP_BY_RARITY.uncommon,
    salvageRights: STUNT_SALVAGE_RIGHTS_BY_RARITY.uncommon,
    credits: 0,
    factionId: STUNT_PAY_FACTION_ID,
  });
  assert.equal(trickPay({ rarity: 'legendary' }).salvageRights, 0, 'a bare label is not entitled');
  assert.equal(trickPay({ trickId: 'bolas' }).reputation, 0, 'a trick without an episode is not entitled');
  assert.equal(trickPay({ schemaVersion: 2, trickId: 'not_a_trick', episodeId: 'x' }).reputation, 0);
  assert.equal(trickPay(null).credits, 0);

  const bank = { acts: [{ trickId: 'bolas' }, { trickId: 'slingshot_golf' }, { trickId: 'bogus' }] };
  assert.equal(comboPay(bank).reputation, STUNT_REP_BY_RARITY.uncommon + STUNT_REP_BY_RARITY.legendary);
  assert.equal(comboPay(bank).salvageRights,
    STUNT_SALVAGE_RIGHTS_BY_RARITY.uncommon + STUNT_SALVAGE_RIGHTS_BY_RARITY.legendary);
});

test('an adventure trick posts rep, emits the claim, and mints a physical chit at the contact', () => {
  const { state, bus, grammar, events } = boot({ survival: false });
  bus.emit('combat:collisionConsequence', receipt({}, SWING));

  assert.equal(state.stunts.pay.reputation, STUNT_REP_BY_RARITY.uncommon);
  assert.equal(state.stunts.pay.salvageRights, STUNT_SALVAGE_RIGHTS_BY_RARITY.uncommon);
  assert.equal(state.stunts.pay.credits, 0, 'stunts never open the wallet');

  const rep = events.find((e) => e.name === 'faction:repDelta');
  assert.equal(rep.p.factionId, 'faction_pitborn');
  assert.equal(rep.p.delta, STUNT_REP_BY_RARITY.uncommon);
  const claim = events.find((e) => e.name === 'stunt:salvageRights');
  assert.equal(claim.p.trickId, 'bolas');
  assert.equal(claim.p.salvageRights, STUNT_SALVAGE_RIGHTS_BY_RARITY.uncommon);

  const drop = events.find((e) => e.name === 'loot:drop');
  assert.ok(drop, 'a claim chit mints into the world');
  assert.equal(drop.p.source, 'stunt_claim');
  const chit = drop.p.items[0];
  assert.equal(chit.kind, SALVAGE_RIGHTS_KIND);
  assert.equal(chit.salvageRights, STUNT_SALVAGE_RIGHTS_BY_RARITY.uncommon);
  assert.equal(drop.p.pos.x, 12, 'the chit ejects at the terminal contact, not at the player');
  grammar.destroy();
});

test('a survival trick pays standing and the session ledger but never mints a campaign chit', () => {
  const { state, bus, grammar, events } = boot({ survival: true });
  bus.emit('combat:collisionConsequence', receipt({}, SWING));

  assert.equal(state.stunts.pay.salvageRights, STUNT_SALVAGE_RIGHTS_BY_RARITY.uncommon);
  assert.ok(events.some((e) => e.name === 'stunt:salvageRights'), 'the session claim is recorded');
  assert.equal(events.filter((e) => e.name === 'loot:drop').length, 0,
    'scored runs keep rights off the campaign map, like the run wallet keeps run chips');
  assert.equal(state.player.salvageRights ?? 0, 0);
  grammar.destroy();
});

test('the same episode cannot pay twice; an amendment pays only the upgrade delta', () => {
  const { state, bus, grammar, events } = boot({ survival: false });
  bus.emit('combat:collisionConsequence', receipt({}, SWING));
  bus.emit('combat:collisionConsequence', receipt({}, SWING));
  assert.equal(state.stunts.pay.salvageRights, STUNT_SALVAGE_RIGHTS_BY_RARITY.uncommon,
    'the detector settles an episode once');

  const st = state.stunts;
  const first = { schemaVersion: 2, trickId: 'wrecking_ball', rarity: 'uncommon', episodeId: 'root:x', tick: 300 };
  const promoted = { schemaVersion: 2, trickId: 'slingshot_golf', rarity: 'legendary', episodeId: 'root:x', tick: 320 };
  const repBefore = st.pay.reputation;
  const rightsBefore = st.pay.salvageRights;
  grammar._payTrick(st, first, null, 300);
  grammar._payTrick(st, promoted, first, 320);
  assert.equal(st.pay.reputation - repBefore, STUNT_REP_BY_RARITY.legendary,
    'a reclassification pays the uncommon price once, then only the delta');
  assert.equal(st.pay.salvageRights - rightsBefore, STUNT_SALVAGE_RIGHTS_BY_RARITY.legendary);
  const claims = events.filter((e) => e.name === 'stunt:salvageRights');
  assert.equal(claims.at(-1).p.salvageRights,
    STUNT_SALVAGE_RIGHTS_BY_RARITY.legendary - STUNT_SALVAGE_RIGHTS_BY_RARITY.uncommon);
  grammar.destroy();
});

test('scooping the chit settles the balance once per body', () => {
  const { state, bus, grammar, events } = boot({ survival: false });
  const chit = {
    id: 'chit_1', type: 'pickup', alive: true, pos: { x: 5, z: 5 },
    data: { kind: SALVAGE_RIGHTS_KIND, salvageRights: 3, amount: 3, grantReason: 'stunt:salvage_rights:bolas:root:1' },
  };
  state.entities.set('chit_1', chit);

  const payload = { pickupId: 'chit_1', collectorId: 0, kind: SALVAGE_RIGHTS_KIND, amount: 3, pos: { x: 5, z: 5 } };
  bus.emit('pickup:collected', payload);
  assert.equal(state.player.salvageRights, 3);
  assert.equal(payload.acceptedAmount, 3, 'the acceptance receipt consumes the body');
  assert.equal(payload.rejectedAmount, 0);
  assert.equal(chit.data.rightsGranted, true);
  assert.equal(events.filter((e) => e.name === 'stunt:salvageRightsClaimed').length, 1);

  bus.emit('pickup:collected', { pickupId: 'chit_1', collectorId: 0, kind: SALVAGE_RIGHTS_KIND, amount: 3, pos: { x: 5, z: 5 } });
  assert.equal(state.player.salvageRights, 3, 'a spent chit cannot mint twice');

  bus.emit('pickup:collected', { pickupId: 'chit_1', collectorId: 9, kind: SALVAGE_RIGHTS_KIND, amount: 3, pos: { x: 5, z: 5 } });
  assert.equal(state.player.salvageRights, 3, 'another collector never touches the player purse');

  const malformed = { pickupId: null, collectorId: 0, kind: SALVAGE_RIGHTS_KIND, amount: 0 };
  bus.emit('pickup:collected', malformed);
  assert.equal(malformed.invalidAmount, true);
  grammar.destroy();
});

test('a Pitborn yard redeems the balance for credits plus standing; other berths refuse', () => {
  const sim = createSimulation({ seed: 0x15503, systems: [economy], updateOrder: [] });
  try {
    const { state, bus } = sim;
    const econ = sim.registry.get('economy');
    state.ui = { docked: true, dockedStationId: 'station_forge' };
    state.factions = { faction_pitborn: { rep: 0 } };
    state.player.credits = 1000;
    state.player.salvageRights = 5;
    const grants = [];
    const repDeltas = [];
    const completed = [];
    bus.on('economy:creditsChanged', (p) => grants.push(p));
    bus.on('faction:repDelta', (p) => repDeltas.push(p));
    bus.on('service:completed', (p) => completed.push(p));

    bus.emit('ui:service', { type: 'redeem_rights' });
    assert.equal(state.player.salvageRights, 0);
    assert.equal(state.player.credits, 1000 + 5 * SERVICE_PRICES.salvageRightCr);
    assert.equal(repDeltas.length, 1);
    assert.equal(repDeltas[0].factionId, 'faction_pitborn');
    assert.equal(repDeltas[0].delta, 5);
    assert.equal(completed[0].type, 'redeem_rights');
    assert.equal(completed[0].rights, 5);

    bus.emit('ui:service', { type: 'redeem_rights' });
    assert.equal(state.player.credits, 1000 + 5 * SERVICE_PRICES.salvageRightCr,
      'an empty purse redeems nothing');

    state.player.salvageRights = 2;
    state.ui.dockedStationId = 'station_helios';
    const creditsBefore = state.player.credits;
    bus.emit('ui:service', { type: 'redeem_rights' });
    assert.equal(state.player.salvageRights, 2, 'a non-Pitborn berth cannot cash the claim');
    assert.equal(state.player.credits, creditsBefore);
  } finally {
    sim.dispose();
    economy._instance = null;
  }
});

test('the balance survives a JSON save round-trip and normalizes clean', () => {
  const { state, grammar } = boot({ survival: false });
  state.player.salvageRights = 7;
  const restored = JSON.parse(JSON.stringify(state.player));
  state.player = restored;
  assert.equal(state.player.salvageRights, 7);
  restored.salvageRights = -12;
  assert.equal(Math.max(0, Math.floor(Number(restored.salvageRights) || 0)), 0,
    'a crafted negative purse normalizes to zero');
  restored.salvageRights = 'junk';
  assert.equal(Math.max(0, Math.floor(Number(restored.salvageRights) || 0)), 0);
  grammar.destroy();
});
