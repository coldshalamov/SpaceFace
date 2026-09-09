// PQ-155.03 — stunts pay reputation and salvage rights, never raw credits.
// Seed 15530. Equal-kill physics tape vs gun tape.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createVictimRewardRng } from '../src/combat/rewardEligibility.js';
import {
  CREDIT_CHIP_KIND,
  creditChipTotal,
  isCreditChipItem,
  isSalvageRightsItem,
  makeSalvageRightsItem,
  materialItemsOf,
  rollKillRewardItems,
  SALVAGE_RIGHTS_KIND,
  salvageRightsItemsOf,
} from '../src/data/killRewards.js';
import { factions } from '../src/systems/factions.js';
import {
  comboPay,
  STUNT_PAY_FACTION_ID,
  STUNT_REP_BY_RARITY,
  trickPay,
} from '../src/systems/stuntCombo.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { createSimulation } from '../src/core/sim.js';

const SEED = 15530;
const KILLS = 4;

function lightVictim(i) {
  return {
    id: 100 + i,
    type: 'ship',
    mass: 12,
    data: { shipClass: 'fighter', worldRecordId: `pq15503-${SEED}-${i}` },
  };
}

function killBurstCredits() {
  let total = 0;
  for (let i = 0; i < KILLS; i += 1) {
    const victim = lightVictim(i);
    const rng = createVictimRewardRng(SEED, victim, 'loot_shards_reward_v3');
    total += creditChipTotal(rollKillRewardItems(rng, victim));
  }
  return total;
}

function drive(kind) {
  const sim = createSimulation({ seed: SEED, systems: [stuntGrammar, factions] });
  const { state, bus, registry } = sim;
  const grammar = registry.get('stuntGrammar');
  state.mode = 'flight';
  state.playerId = 1;

  const grants = [];
  const repChanged = [];
  const salvage = [];
  const tricks = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('faction:repChanged', (p) => repChanged.push(p));
  bus.on('stunt:salvageRights', (p) => salvage.push(p));
  bus.on('stunt:trickDetected', (p) => tricks.push({ id: p.trickId, rarity: p.rarity }));

  bus.emit('game:started', {});
  bus.emit('run:started', {});

  const kill = (tick, id, weaponId, extra = {}) => {
    bus.emit('entity:killed', {
      tick,
      id,
      killerId: state.playerId,
      type: 'ship',
      factionId: 'faction_reach',
      victimClass: 'fighter',
      witnessed: true,
      weaponId,
      ...extra,
    });
  };

  if (kind === 'physics') {
    bus.emit('tether:releaseRated', {
      tick: 100, sourceId: 1, targetId: 'rock_A', classification: 'razor',
      releaseScore: 0.92, angularSpeed: 4.5, tangentialSpeed: 42.0,
    });
    bus.emit('tether:whipImpact', {
      tick: 160, sourceId: 1, targetId: 'rock_A', victimId: 101,
      relSpeed: 58.5, mass: 45.0, momentum: 2632.5,
    });
    bus.emit('combat:hitstunImpulse', {
      tick: 220, actorId: 1, victimId: 102,
      weaponId: 'wpn_concussion_cannon_m', deltaV: 25.0,
    });
    bus.emit('combat:collisionConsequence', {
      tick: 240, targetId: 103, otherId: 102, surface: 'craft',
      deltaV: 18.0, exchangedMomentum: 950, provenance: { actorId: 1 },
    });
    kill(300, 101, 'wpn_concussion_cannon_m');
    bus.emit('tether:attached', { tick: 320, sourceId: 1, targetId: 'ore_pod', isTow: true, relSpeed: 10 });
    kill(340, 102, undefined, { cause: 'ship_collision' });
    kill(360, 103, 'wpn_concussion_cannon_m');
    kill(380, 104, 'wpn_concussion_cannon_m');
  } else {
    for (let i = 0; i < KILLS; i += 1) {
      kill(300 + i * 20, 101 + i, 'wpn_autocannon_m');
    }
  }

  state.tick = 100000;
  grammar.update(state, 1 / 60);

  const pay = comboPay(state.stunts && state.stunts.combo);
  const session = state.stunts && state.stunts.pay
    ? { ...state.stunts.pay, credits: 0 }
    : { reputation: 0, salvageRights: 0, credits: 0 };
  const positiveRep = repChanged
    .filter((p) => (p.delta || 0) > 0)
    .reduce((sum, p) => sum + p.delta, 0);
  const pitborn = state.factions[STUNT_PAY_FACTION_ID]
    ? state.factions[STUNT_PAY_FACTION_ID].rep
    : 0;
  const rightsFromEvents = salvage.reduce((sum, p) => sum + (Number(p.salvageRights) || 0), 0);
  const grantCredits = grants.reduce((sum, g) => sum + (Number(g.amount) || 0), 0);

  const out = {
    kind,
    tricks: tricks.length,
    trickList: tricks,
    positiveRep,
    pitborn,
    credits: killBurstCredits(),
    pay,
    session,
    salvageEvents: salvage.length,
    rightsFromEvents,
    grants: grants.length,
    grantCredits,
  };
  sim.dispose();
  return out;
}

test('trick pay is reputation and salvage rights, never credits', () => {
  const empty = trickPay(null);
  assert.equal(empty.credits, 0);
  assert.equal(empty.reputation, 0);
  assert.equal(empty.salvageRights, 0);

  const common = trickPay({ rarity: 'common' });
  const rare = trickPay({ rarity: 'rare' });
  assert.equal(common.credits, 0);
  assert.equal(rare.credits, 0);
  assert.equal(common.reputation, STUNT_REP_BY_RARITY.common);
  assert.ok(rare.reputation > common.reputation);
  assert.ok(rare.salvageRights > common.salvageRights);
  assert.equal(common.factionId, STUNT_PAY_FACTION_ID);

  const chit = makeSalvageRightsItem(2, 'wrecking_ball');
  assert.equal(chit.kind, SALVAGE_RIGHTS_KIND);
  assert.equal(chit.credits, 0);
  assert.equal(isSalvageRightsItem(chit), true);
  assert.equal(isCreditChipItem(chit), false);
  assert.equal(creditChipTotal([chit, { kind: CREDIT_CHIP_KIND, credits: 40 }]), 40);
  assert.equal(salvageRightsItemsOf([chit]).length, 1);
});

test('kill burst credits ignore style; salvage rights are not chips', () => {
  const base = lightVictim(0);
  const styled = {
    ...base,
    data: { ...base.data, killStyle: 'wrecking_ball', style: 'physics', styleMultiplier: 4 },
  };
  const a = rollKillRewardItems(createVictimRewardRng(SEED, base, 'loot_shards_reward_v3'), base);
  const b = rollKillRewardItems(createVictimRewardRng(SEED, styled, 'loot_shards_reward_v3'), styled);
  assert.equal(creditChipTotal(a), creditChipTotal(b));
  assert.deepEqual(materialItemsOf(a), materialItemsOf(b));
  assert.equal(salvageRightsItemsOf(a).length, 0);
  assert.equal(salvageRightsItemsOf(b).length, 0);
});

test('seed 15530: physics run earns ≥ gun reputation; credits equal; stunts never pay credits', () => {
  const physics = drive('physics');
  const gun = drive('gun');

  console.log(`[PQ-155.03 seed ${SEED}] physics rep=${physics.positiveRep} pitborn=${physics.pitborn} credits=${physics.credits} rights=${physics.pay.salvageRights} tricks=${physics.tricks}`);
  console.log(`[PQ-155.03 seed ${SEED}] gun     rep=${gun.positiveRep} pitborn=${gun.pitborn} credits=${gun.credits} rights=${gun.pay.salvageRights} tricks=${gun.tricks}`);
  console.log(`[PQ-155.03 seed ${SEED}] combo pay physics=${JSON.stringify(physics.pay)} gun=${JSON.stringify(gun.pay)}`);

  assert.equal(physics.tricks, 6);
  assert.equal(gun.tricks, 0);
  assert.equal(physics.credits, gun.credits, 'kill credits must stay equal');
  assert.ok(physics.credits > 0, 'the gun path still pays its chips');
  assert.ok(
    physics.positiveRep >= gun.positiveRep,
    `physics reputation (${physics.positiveRep}) must be ≥ gun (${gun.positiveRep})`,
  );
  assert.ok(physics.pitborn > gun.pitborn, 'Pitborn yards pay the physics tape');
  assert.ok(physics.pay.reputation > 0);
  assert.ok(physics.pay.salvageRights > 0);
  assert.equal(physics.pay.credits, 0);
  assert.equal(gun.pay.reputation, 0);
  assert.equal(gun.pay.salvageRights, 0);
  assert.equal(gun.pay.credits, 0);
  assert.equal(physics.session.credits, 0);
  assert.equal(physics.rightsFromEvents, physics.pay.salvageRights);
  assert.equal(physics.grants, 0);
  assert.equal(gun.grants, 0);
  assert.equal(physics.grantCredits, 0);
  assert.equal(gun.grantCredits, 0);
});
