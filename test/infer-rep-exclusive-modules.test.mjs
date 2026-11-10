// Reputation finally buys hardware: three faction-exclusive modules answer the standing ledger
// (rep >= 400, the 'Allied' tier), never the research tree, never a station-rack bypass.
import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { FACTION_META } from '../src/data/factions.js';
import {
  ships,
  defLockReasonText,
  exclusivityLockLabel,
  exclusivityRepMet,
} from '../src/systems/ships.js';
import { describeOutfittingPurchase } from '../src/ui/station/outfittingGuidance.js';

const EXCLUSIVES = [
  { id: 'mod_sanction_spool', factionId: 'faction_scn' },
  { id: 'mod_deep_scoop_array_m', factionId: 'faction_dmc' },
  { id: 'mod_splitburner_m', factionId: 'faction_reach' },
];

// The keys the derived-stats fold in systems/ships.js actually reads (verified by reading the
// fold): tetherSpoolMult — max-wins capability; magnetRange — max-wins, the freeflight ore scoop
// resolves max(floor, derived.magnetRange) in systems/mining.js; boostTopSpeedPct/boostDurS/
// boostCdS — the afterburner envelope, capability ratings that land in derived.boost and drive
// the boost cap in systems/flightV3.js. Unwired promises are not claimed.
const WIRED_MODS_KEYS = new Set([
  'tetherSpoolMult', 'magnetRange', 'boostTopSpeedPct', 'boostDurS', 'boostCdS',
]);

const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const FACTION_IDS = new Set(FACTION_META.map((f) => f.id));

function shipsWithState(state) {
  return Object.assign(Object.create(ships), {
    state,
    bus: { emit() {} },
  });
}

function factionsWith(repByFaction) {
  const factions = {};
  for (const [id, rep] of Object.entries(repByFaction)) factions[id] = { rep };
  return factions;
}

test('the three faction exclusives exist, are faction-tagged at Allied, and promise only wired stats', () => {
  for (const row of EXCLUSIVES) {
    const def = MODULE_BY_ID.get(row.id);
    assert.ok(def, `${row.id} exists in the catalog`);
    assert.ok(def.exclusivity, `${row.id} carries exclusivity`);
    assert.equal(def.exclusivity.factionId, row.factionId);
    assert.equal(def.exclusivity.minRep, 400, `${row.id} opens at the Allied rung`);
    assert.ok(FACTION_IDS.has(def.exclusivity.factionId), `${row.factionId} is a real faction`);
    assert.ok(def.price > 0, `${row.id} is a purchase, not salvage`);
    const keys = Object.keys(def.mods || {});
    assert.ok(keys.length > 0, `${row.id} promises something`);
    for (const key of keys) {
      assert.ok(WIRED_MODS_KEYS.has(key), `${row.id} mods.${key} is read by the ships.js fold`);
    }
    assert.ok(typeof def.sentence === 'string' && def.sentence.trim(), `${row.id} has its air sentence`);
  }
});

test('isUnlocked answers the standing ledger: 399 no, 400 yes, a rival rep no', () => {
  const sys = shipsWithState({ factions: factionsWith({ faction_scn: 399 }) });
  const def = MODULE_BY_ID.get('mod_sanction_spool');
  assert.equal(sys.isUnlocked(def), false, 'rep 399 stays locked');

  sys.state.factions = factionsWith({ faction_scn: 400 });
  assert.equal(sys.isUnlocked(def), true, 'rep 400 opens the yard');

  sys.state.factions = factionsWith({ faction_dmc: 900 });
  assert.equal(sys.isUnlocked(def), false, 'another faction\'s rep is not this gate');

  sys.state.factions = {};
  assert.equal(sys.isUnlocked(def), false, 'no standing record fails closed');
});

test('a def without exclusivity unlocks exactly as before', () => {
  const sys = shipsWithState({ factions: {}, player: { researchedNodes: [] } });
  const plain = MODULE_BY_ID.get('mod_cargo_pod_m');
  assert.ok(plain && !plain.exclusivity && !plain.requiresTech);
  assert.equal(sys.isUnlocked(plain), true, 'unchanged behavior for ungated defs');
});

test('describeOutfittingPurchase reports the standing lock below the rung and a normal buy at it', () => {
  const def = MODULE_BY_ID.get('mod_splitburner_m');
  const player = { credits: 200000, researchedNodes: [] };
  const slots = [{ type: 'utility', size: 'M', index: 0 }];
  const fittings = [null];

  const locked = describeOutfittingPurchase(def, player, slots, fittings, null, {
    factions: factionsWith({ faction_reach: 399 }),
  });
  assert.equal(locked.state, 'standing');
  assert.equal(locked.disabled, true);
  assert.equal(locked.label, 'Requires Allied — Crimson Reach');

  const open = describeOutfittingPurchase(def, player, slots, fittings, null, {
    factions: factionsWith({ faction_reach: 400 }),
  });
  assert.equal(open.state, 'fit');
  assert.equal(open.disabled, false);

  // No rep source at all: fail closed, in words.
  const noSource = describeOutfittingPurchase(def, player, slots, fittings, null, {});
  assert.equal(noSource.state, 'standing');
  assert.equal(noSource.disabled, true);
});

test('adversarial: an unknown faction or a broken threshold stays locked', () => {
  const ghost = { factionId: 'faction_ghost', minRep: 400 };
  const sys = shipsWithState({ factions: factionsWith({ faction_ghost: 999, faction_scn: 999 }) });
  assert.equal(sys.isUnlocked({ id: 'mod_ghost', exclusivity: ghost }), false,
    'rep somewhere else never opens an unknown faction\'s yard');
  assert.equal(exclusivityRepMet(ghost, factionsWith({ faction_ghost: 999 })), false);

  assert.equal(exclusivityRepMet({ factionId: 'faction_scn' }, factionsWith({ faction_scn: 999 })), false,
    'a missing minRep fails closed');
  assert.equal(exclusivityRepMet({ factionId: 'faction_scn', minRep: 400 }, null), false,
    'no factions record fails closed');
  assert.equal(exclusivityRepMet({ factionId: 'faction_scn', minRep: 400 }, 'not a record'), false,
    'a malformed factions record fails closed');

  assert.equal(exclusivityLockLabel({ factionId: 'faction_ghost' }), 'Requires Allied — its faction',
    'an unknown faction still names the rung instead of crashing');
});

test('the refusal line names the standing rung, never a tech', () => {
  const def = MODULE_BY_ID.get('mod_deep_scoop_array_m');
  assert.match(defLockReasonText(def), /^Requires Allied — Drift Miners Collective$/);
  assert.doesNotMatch(defLockReasonText(def), /Research required/);
});
