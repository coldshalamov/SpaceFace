// NXI-056 — do not reopen the same surrendered lot on a late arrival.
//
// `isHostileForAI` is the hostility oracle a lawful observer consults before the final fire
// gate (`authorizeAIEngagement`). After a player surrender is accepted, the disposition covers
// the bare WANTED sheet it settled — the surrendered lot — so a second patrol arriving late
// does not re-accuse it. Causes outside the lot keep their answer:
//
//   * a dispatch mark (`securityTargetId`) on a new incident still authorizes,
//   * retaliation for new harm (`retaliationTargetId`) still authorizes,
//   * declared faction aggro still authorizes,
//   * and a genuinely new lawful inspection is not globally suppressed — this check touches
//     only the hostility read, never the inspection ledger in lawSecurity.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizeAIEngagement,
  isHostileForAI,
} from '../src/ai/engagementAuthority.js';
import { normalizeActivity, ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';

const SEED = 4242;
const ACCEPTED_HOLD = {
  phase: 'accepted',
  causeId: `player-surrender:${SEED}`,
  responderId: 'patrol-1',
  priceCr: 2500,
  tier: 'nets',
  heldS: 4,
};
const STRIKE_REASON = 'combat_doctrine:interceptor_flyby:strike';

function makeShip(id, { team = 1, factionId = 'faction_scn', ai = {}, x = 300 } = {}) {
  return {
    id, type: 'ship', alive: true, team, factionId,
    pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { ai, intent: {}, combat: {} },
  };
}

function lawfulPatrol(id, aiOverrides = {}) {
  return makeShip(id, {
    ai: {
      lawful: true,
      passive: false,
      motive: 'wanted_warrant',
      engagementTrigger: 'wanted_status',
      zoneId: 'zone_law_patrol',
      approachTelegraph: 'hail_and_scan',
      noFireResponseWindowS: 1,
      combatDoctrineId: 'interceptor_flyby',
      roe: RulesOfEngagement.WEAPONS_FREE,
      activity: normalizeActivity({
        kind: ActivityKind.ATTACK_RUN,
        reason: 'wanted_pursuit',
        anchor: { x: 0, z: 0 },
        leashRadius: 2200,
        startedTick: 100,
      }),
      ...aiOverrides,
    },
  });
}

function makeState({ hold = null, extraShips = [], factions = null } = {}) {
  const player = makeShip('player', { team: 0, factionId: null, x: 0 });
  const patrol = lawfulPatrol('patrol-2', { x: 300 });
  const entities = new Map([[player.id, player], [patrol.id, patrol]]);
  for (const ship of extraShips) entities.set(ship.id, ship);
  return {
    meta: { seed: SEED },
    // Past the first-session attacker cap window so the cap never confounds the verdict.
    simTime: 1200,
    tick: 1000,
    mode: 'flight',
    playerId: 'player',
    player: { heat: 0.65 },
    world: { currentSectorId: 'sector_ceres_belt' },
    factions: factions || {},
    entities,
    entityList: [...entities.values()],
    lawSecurity: {
      incidents: {},
      ...(hold ? { playerSurrender: hold } : {}),
    },
  };
}

function authorize(state, patrol, player) {
  return authorizeAIEngagement({
    state,
    self: patrol,
    target: player,
    tick: state.tick,
    objectiveReason: STRIKE_REASON,
  });
}

test('NXI-056: a late lawful observer does not reopen the surrendered lot', () => {
  const state = makeState({ hold: { ...ACCEPTED_HOLD } });
  const player = state.entities.get('player');
  const patrol = state.entities.get('patrol-2');

  assert.equal(isHostileForAI(state, patrol, player), false,
    'the accepted disposition covers the bare wanted sheet the surrender settled');
  const denied = authorize(state, patrol, player);
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'target_not_hostile',
    'the final gate never reaches authorization while the disposition covers the lot');

  // The player's own read agrees: custodians are not re-flagged as attackers.
  assert.equal(isHostileForAI(state, player, patrol), false);
});

test('NXI-056: the same observer still hunts an unsettled wanted sheet (neighbor success)', () => {
  const state = makeState({ hold: null });
  const player = state.entities.get('player');
  const patrol = state.entities.get('patrol-2');

  assert.equal(isHostileForAI(state, patrol, player), true,
    'without an accepted disposition the wanted sheet still reads hostile');
  assert.equal(authorize(state, patrol, player).ok, true,
    'an ordinary wanted-status patrol stays authorized');

  // Provisional or malformed dispositions suppress nothing — only an accepted settlement
  // carrying its cause identity counts.
  for (const hold of [
    { phase: 'holding', causeId: ACCEPTED_HOLD.causeId },
    { phase: 'accepted' },
    { phase: 'cancelled', causeId: ACCEPTED_HOLD.causeId },
  ]) {
    state.lawSecurity.playerSurrender = hold;
    assert.equal(isHostileForAI(state, patrol, player), true,
      `hold phase ${hold.phase} (cause ${hold.causeId ?? 'none'}) is not a settled lot`);
  }
});

test('NXI-056: a second patrol still acts on genuinely new contraband or aggression', () => {
  // Dispatch mark: CONTROL sent this patrol on a NEW incident after the surrender.
  const dispatched = makeState({ hold: { ...ACCEPTED_HOLD } });
  const player = dispatched.entities.get('player');
  const patrol = dispatched.entities.get('patrol-2');
  patrol.data.ai.securityTargetId = 'player';
  patrol.data.ai.engagementTrigger = 'security_response';
  assert.equal(isHostileForAI(dispatched, patrol, player), true,
    'a dispatch mark on a new incident is a cause outside the surrendered lot');
  assert.equal(authorize(dispatched, patrol, player).ok, true);

  // Retaliation: the player damaged this observer after custody — fresh aggression.
  const harmed = makeState({ hold: { ...ACCEPTED_HOLD } });
  harmed.entities.get('patrol-2').data.ai.retaliationTargetId = 'player';
  assert.equal(isHostileForAI(harmed, harmed.entities.get('patrol-2'), player), true,
    'retaliation for new harm still authorizes');

  // Declared faction aggro: war is its own ledger, not the surrendered sheet.
  const war = makeState({
    hold: { ...ACCEPTED_HOLD },
    factions: { faction_scn: { aggro: true, rep: -80 } },
  });
  assert.equal(isHostileForAI(war, war.entities.get('patrol-2'), player), true,
    'faction aggro keeps its own answer under the disposition');
  // And the player still sees a hostile-declared lawful unit as the threat it is.
  assert.equal(isHostileForAI(war, player, war.entities.get('patrol-2')), true,
    'declared aggro reads hostile to the player too — custody is not concealment');
});

test('NXI-056: the covered sheet extends to the player flight, not a permanent mercy flag', () => {
  const wingman = makeShip('wing-1', { team: 0, factionId: null, x: 40 });
  const covered = makeState({ hold: { ...ACCEPTED_HOLD }, extraShips: [wingman] });
  const patrol = covered.entities.get('patrol-2');
  assert.equal(isHostileForAI(covered, patrol, wingman), false,
    'the flight shares the covered sheet — a patrol does not reopen it on a wingman');

  const exposed = makeState({ hold: null, extraShips: [makeShip('wing-1', { team: 0, x: 40 })] });
  assert.equal(isHostileForAI(exposed, exposed.entities.get('patrol-2'),
    exposed.entities.get('wing-1')), true,
    'without the disposition the flight still reads hostile on the wanted sheet');

  // New causes reopen through the normal authority even against the flight.
  const dispatched = makeState({ hold: { ...ACCEPTED_HOLD }, extraShips: [wingman] });
  dispatched.entities.get('patrol-2').data.ai.securityTargetId = 'wing-1';
  assert.equal(isHostileForAI(dispatched, dispatched.entities.get('patrol-2'),
    wingman), true, 'a dispatch naming the wingman is a live cause');
});
