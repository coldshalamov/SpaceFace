import assert from 'node:assert/strict';
import test from 'node:test';

import { MODULES } from '../src/data/modules.js';
import { ACE_TROPHY_HEADS, aceTrophyHeadByTier, trophyFromFittings } from '../src/data/sectors.js';
import { ACE_TROPHY_BARKS, aceTrophyBarkFor, aceTrophyNewsLine } from '../src/data/conflictReactions.js';
import { aceById } from '../src/data/namedAces.js';
import {
  ACE_TROPHY_TIER_MAX,
  claims as claimsBase,
  fittedTrophyFromState,
} from '../src/systems/claims.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { PIRATE_PROMOTION_MAX_TIER } from '../src/data/namedAces.js';

const SEED = 17003;
const CORE_ACES = ['ace_yara_no_cut', 'ace_toll_saint_venn', 'ace_mako_broken_ring'];

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off() {},
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function bootClaims() {
  const player = {
    id: 'player',
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    data: { fittings: [] },
  };
  const state = {
    simTime: 900,
    meta: { seed: SEED },
    playerId: player.id,
    mode: 'flight',
    player: { credits: 1, moduleInventory: [], cargo: { items: {} }, stats: {} },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map([[player.id, player]]),
    claims: { bodies: [] },
  };
  const bus = makeBus();
  const ships = {
    grantModule({ defId, reason }) {
      state.player.moduleInventory.push({ instanceId: `inv_${state.player.moduleInventory.length}`, defId, reason });
      return true;
    },
  };
  const sys = { ...claimsBase };
  sys.init({ state, bus, helpers: {}, registry: { get: (name) => (name === 'ships' ? ships : null) } });
  return { state, bus, sys, player, ships };
}

function defeat(h, aceId, returnTier = 1) {
  const ace = aceById(aceId);
  return h.sys._onAceTrophyDefeat({
    aceId,
    aceName: ace && ace.name,
    transition: 'defeated',
    record: { aceId, returnTier },
  });
}

test('PQ-170.03 one legendary Massline head per ace tier, same law as the stock head', () => {
  assert.equal(ACE_TROPHY_HEADS.length, ACE_TROPHY_TIER_MAX);
  assert.equal(PIRATE_PROMOTION_MAX_TIER, ACE_TROPHY_TIER_MAX);
  for (const row of ACE_TROPHY_HEADS) {
    const def = MODULES.find((module) => module.id === row.id);
    const base = MODULES.find((module) => module.id === row.baseId);
    assert.ok(def && base, row.id);
    assert.equal(def.unique, true);
    assert.equal(def.purchasable, false);
    assert.equal(def.mods.masslineHeadId, row.masslineHeadId);
    assert.equal(base.mods.masslineHeadId, row.masslineHeadId);
    assert.equal(aceTrophyHeadByTier(row.tier).id, row.id);
    assert.ok(aceById(row.defaultAceId), row.defaultAceId);
  }
  const stationFactions = ['faction_scn', 'faction_mts', 'faction_dmc', 'faction_reach', 'faction_quiet', 'faction_choir', 'faction_free', 'faction_vael'];
  for (const factionId of stationFactions) {
    const lines = ACE_TROPHY_BARKS[factionId];
    assert.ok(Array.isArray(lines) && lines.length >= 2, `${factionId} trophy barks`);
    assert.match(aceTrophyBarkFor(factionId, 0, { ace: 'Yara No-Cut', head: 'No-Cut Filament' }), /Yara No-Cut/);
  }
  assert.match(aceTrophyBarkFor('faction_helix', 0, { ace: 'Yara No-Cut', head: 'No-Cut Filament' }), /Yara No-Cut/);
});

test('PQ-170.03 defeating aces grants one trophy per tier with lineage; a fourth ace grants nothing', () => {
  const h = bootClaims();
  const first = defeat(h, CORE_ACES[0], 1);
  assert.equal(first.tier, 1);
  assert.equal(first.moduleId, 'unique_no_cut_filament');
  assert.equal(first.aceId, CORE_ACES[0]);
  assert.equal(h.state.player.moduleInventory.filter((item) => item.defId === first.moduleId).length, 1);
  const news = h.bus.emitLog.filter((e) => e.evt === 'news:publish');
  assert.equal(news.length, 1);
  assert.equal(news[0].payload.text, aceTrophyNewsLine({ ace: first.aceName, head: first.name, tier: 1 }));

  const second = defeat(h, CORE_ACES[1], 1);
  assert.equal(second.tier, 2, 'preferred tier already taken falls through to the next open head');
  assert.equal(second.moduleId, 'unique_toll_saint_bridle');
  assert.equal(second.aceName, aceById(CORE_ACES[1]).name);

  const third = defeat(h, CORE_ACES[2], 3);
  assert.equal(third.tier, 3);
  assert.equal(third.moduleId, 'unique_broken_ring_whip');
  assert.equal(h.sys.legendaryHeads().heads.length, 3);

  assert.equal(defeat(h, 'ace_maw_rake_veyra', 2), null, 'three heads is the cap');
  assert.equal(h.state.player.moduleInventory.length, 3);
  assert.equal(defeat(h, CORE_ACES[0], 1).aceId, CORE_ACES[0], 'repeat defeat of the same ace is a no-op on the ledger');

  h.state.run = { kind: 'survival', phase: 'active' };
  const sealed = bootClaims();
  sealed.state.run = { kind: 'survival', phase: 'active' };
  assert.equal(defeat(sealed, CORE_ACES[0], 1), null, 'a sealed Crucible run never takes a trophy home');
});

test('PQ-170.03 fitted trophy survives save/load and NPCs bark the lineage on scan', () => {
  const h = bootClaims();
  const granted = defeat(h, CORE_ACES[0], 1);
  h.player.data.fittings = [granted.moduleId];
  const worn = fittedTrophyFromState(h.state);
  assert.equal(worn.id, granted.moduleId);
  assert.equal(worn.aceName, granted.aceName);
  assert.equal(trophyFromFittings(h.player.data.fittings, h.sys.legendaryHeads()).aceId, CORE_ACES[0]);

  const snapshot = JSON.parse(JSON.stringify(h.sys.serialize()));
  const cold = bootClaims();
  cold.sys.deserialize(snapshot);
  cold.player.data.fittings = [granted.moduleId];
  const restored = fittedTrophyFromState(cold.state);
  assert.equal(restored.aceId, CORE_ACES[0]);
  assert.equal(restored.name, 'No-Cut Filament');

  const npc = {
    id: 'npc-1',
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 20, z: 0 },
    factionId: 'faction_reach',
    data: { ai: { fsm: 'scan' } },
  };
  cold.state.entities.set(npc.id, npc);
  const said = [];
  barkDirector.init({
    state: cold.state,
    bus: makeBus(),
    helpers: { voice: { say(payload) { said.push(payload); return true; } } },
  });
  assert.equal(barkDirector._speak(npc, 'scan', 'state'), true);
  assert.equal(said.length, 1);
  assert.match(said[0].text, /No-Cut Filament/);
  assert.match(said[0].text, /Yara No-Cut/);
  barkDirector.destroy();
});
