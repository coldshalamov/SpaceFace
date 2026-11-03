// R479 — the Mission Log's seed-4242 opening contract must read truthfully end to end.
//
// The bench fixture (tools/ui-bench.js seededState) used to hand-shape a mission entry; the plan
// replaces it with the game's own cold-start installer. This test reproduces that fixture under
// plain Node — `createGameState(4242)` + `missions._installContract47aColdStart()` over a real
// bus — and proves the log's own presenters carry the authored terms: the Helios destination,
// the assay sample, the authorization and code, the acceptance/delivery masses, and a pending
// payment that is never dressed up as a payout. Nothing here may render a development fallback
// ("close cleanly", "destination", an invented credit figure) or grow a second 47-A row.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { missions } from '../src/systems/missions.js';
import { CONTRACT_47A_B0_BODY } from '../src/data/narrative.js';
import {
  activeMissionContractTerms,
  missionCommandBrief,
  missionMapAction,
  objectiveText,
  recommendedActions,
} from '../src/ui/screens/missionLog.js';

const TAG = 'campaign47a:b0:recovery';

/** The fixture the bench mounts: fresh 4242 state plus the game's own installer. */
function fixture() {
  const state = createGameState(4242);
  state.world.currentSectorId = 'sector_helios_prime';
  const bus = createBus();
  const owner = Object.create(missions);
  owner.init({ state, bus, helpers: {}, registry: { get: () => null } });
  owner._installContract47aColdStart();
  return { state, bus, owner };
}

function fixtureWithSampleRock() {
  const state = createGameState(4242);
  // Isolate mission-owner navigation from the staged opening tutorial's temporary pin.
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_helios_prime';
  const player = { id: state.playerId, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100 };
  state.entities.set(state.playerId, player);
  const rock = { id: 901, type: 'asteroid', alive: true, pos: { x: 120, z: 80 } };
  state.entities.set(rock.id, rock);
  state.entityList.push(rock);
  const bus = createBus();
  const owner = Object.create(missions);
  owner.init({ state, bus, helpers: {}, registry: { get: () => null } });
  owner._installContract47aColdStart();
  return { state, bus, owner, rock, mission: mission47a(state) };
}

function mission47a(state) {
  return (state.missions.active || []).find((m) => m && m.storyTag === TAG) || null;
}

test('the installer lands exactly one tracked 47-A row, and never appends a second', () => {
  const { state, owner } = fixture();
  const actives = state.missions.active.filter((m) => m && m.storyTag === TAG);
  assert.equal(actives.length, 1, 'one 47-A row, not a duplicated install');
  const m = actives[0];
  assert.equal(state.ui.trackedMissionId, m.id, 'the installer tracks its own contract');
  owner._installContract47aColdStart();
  assert.equal(state.missions.active.filter((x) => x && x.storyTag === TAG).length, 1,
    'a second install must not mint a second row');
});

test('the instance carries the authored contract — not a hand-shaped stand-in', () => {
  const { state } = fixture();
  const m = mission47a(state);
  assert.ok(m, '47-A is installed');
  assert.equal(m.type, 'salvage_retrieval');
  assert.equal(m.status, 'active');
  assert.equal(m.title, CONTRACT_47A_B0_BODY.title);
  assert.equal(m.summary, CONTRACT_47A_B0_BODY.summary);
  assert.equal(m.description, CONTRACT_47A_B0_BODY.fullText);
  assert.equal(m.authorization, CONTRACT_47A_B0_BODY.authorization);
  // Payment is intentionally pending at acceptance — zero, not an invented figure.
  assert.equal(m.reward_cr, 0);
  assert.equal(m.collateral_cr, 0);
  assert.equal(m.destStationId, 'station_helios');
  assert.equal(m.destSectorId, 'sector_helios_prime');
  const p = m.params || {};
  assert.equal(p.cmdtyId, 'cmdty_47a_assay_sample');
  assert.equal(p.contractId, CONTRACT_47A_B0_BODY.contractId);
  assert.equal(p.code, CONTRACT_47A_B0_BODY.code);
  assert.equal(p.massAcceptT, CONTRACT_47A_B0_BODY.massAcceptT);
  assert.equal(p.massDeliverT, CONTRACT_47A_B0_BODY.massDeliverT);
  assert.equal(p.sampleRecovered, false);
});

test('the objective line names the real destination, not a placeholder', () => {
  const { state } = fixture();
  const m = mission47a(state);
  const objective = objectiveText(m);
  assert.match(objective, /Helios Station/, `objective must name the berth, got: ${objective}`);
  assert.doesNotMatch(objective, /destination\b(?! on)/i, 'no generic "destination" fallback');
  assert.doesNotMatch(objective, /undefined|null|NaN/);
});

test('the contract terms print the paperwork and a pending payment — never a payout', () => {
  const { state } = fixture();
  const m = mission47a(state);
  const terms = activeMissionContractTerms(m, state);
  const byLabel = new Map(terms.map((t) => [t.label, t]));
  // The one acceptance the contract makes: money moves on delivery, not on signing.
  assert.equal(byLabel.get('Pays').text, 'Payment pending — nothing released on acceptance');
  assert.doesNotMatch(byLabel.get('Pays').text, /\d[\d,]*\s*cr/i, 'no invented credit figure');
  assert.match(byLabel.get('Mass').text, /12\.4t on accept/, 'acceptance mass from the contract body');
  assert.match(byLabel.get('Mass').text, /reconciled to log on delivery/, 'delivery mass is reconciled, not guessed');
  assert.equal(byLabel.get('Auth').text, CONTRACT_47A_B0_BODY.authorization);
  assert.equal(byLabel.get('Code').text, CONTRACT_47A_B0_BODY.code);
  for (const term of terms) {
    assert.ok(term.text.length > 0, `term ${term.label} must never render empty`);
    assert.doesNotMatch(term.text, /undefined|null|NaN|close cleanly/, `term ${term.label} hit a fallback`);
  }
});

test('the command brief and next step describe the sample job, not freight boilerplate', () => {
  const { state } = fixture();
  const m = mission47a(state);
  const brief = missionCommandBrief(m, state);
  assert.match(brief.what, /Helios Station/);
  assert.match(brief.where, /Helios Station/);
  assert.match(brief.how, /recover the assay sample/i);
  assert.match(brief.how, /marked wreck/i);
  assert.doesNotMatch(brief.how, /hand over the cargo/i, '47-A is a recovery, not a freight handoff');
  assert.match(brief.why, /MASS ON ACCEPT: 12\.4t/);
  assert.match(brief.why, /PAYMENT: PENDING/);
  assert.equal(brief.reward, 'Payment pending — nothing released on acceptance');
});

test('the map handoff answers LOCAL MAP for a same-sector destination — not a plotted-route fiction', () => {
  const { state } = fixture();
  const m = mission47a(state);
  const action = missionMapAction(state, m, true);
  assert.ok(action, 'a tracked contract owes a map handoff');
  assert.equal(action.focus, 'local', 'Helios is in this sector — Local Map, not a star-chart pretense');
  assert.equal(action.stationId, 'station_helios');
  assert.equal(action.sectorId, 'sector_helios_prime');
});

test('recommended actions put the tracked contract first with truthful brief fields', () => {
  const { state } = fixture();
  const m = mission47a(state);
  const actions = recommendedActions(state, state.missions.active, state.ui.trackedMissionId);
  const tracked = actions.find((a) => a && a.missionId === m.id);
  assert.ok(tracked, 'the tracked contract is a recommended action');
  assert.equal(tracked.title, CONTRACT_47A_B0_BODY.title);
  assert.match(tracked.body, /assay sample/i);
  assert.equal(tracked.brief.reward, 'Payment pending — nothing released on acceptance');
  for (const field of ['title', 'body', 'meta']) {
    assert.ok(String(tracked[field] || '').length > 0, `${field} must not render empty`);
    assert.doesNotMatch(String(tracked[field]), /undefined|null|NaN/);
  }
});

test('B0 brief follows the actual sample site, then the real recovery owner handoff', () => {
  const { state, owner, rock, mission } = fixtureWithSampleRock();
  assert.ok(mission, 'the actual cold-start installer supplies B0');
  assert.equal(mission.storyTag, TAG);
  assert.equal(mission.type, 'salvage_retrieval');
  assert.equal(mission.params.contractId, CONTRACT_47A_B0_BODY.contractId);
  assert.equal(mission.params.sampleRecovered, false);
  const source = owner._resolveContract47aSampleSource(mission);
  assert.ok(source, 'the owner resolves the installed recovery source');
  assert.equal(source.id, rock.id, 'the authored source is the actual marked rock');

  const before = missionCommandBrief(mission, state);
  assert.match(before.what, /recover the 47-A assay sample/i);
  assert.match(before.where, /^47-A Recovery Site/);
  assert.match(before.where, /Helios Prime/);
  assert.match(before.how, /recover the assay sample at the marked wreck/i);
  assert.equal(state.nav.waypoint.missionId, mission.id);
  assert.deepEqual(state.nav.waypoint.pos, source.pos, 'owner waypoint is the real marked source fix');
  const beforeMap = missionMapAction(state, mission, true);
  assert.equal(beforeMap.pos.x, source.pos.x, 'Map handoff keeps the owner waypoint position');
  assert.equal(beforeMap.pos.z, source.pos.z);
  assert.equal(beforeMap.sectorId, mission.destSectorId);

  // Use the real mining-yield mission owner at the marked rock; do not stamp recovery by hand.
  const creditsBefore = state.player.credits;
  const beatBefore = state.story.beatIndex;
  const completedStepsBefore = [ ...(state.story.campaign47a?.stepProgress?.['0']?.completed || []) ];
  owner._onMiningYield({
    commodityId: 'cmdty_ore_iron',
    qty: 1,
    minerId: state.playerId,
    pos: { x: source.pos.x, z: source.pos.z },
  });

  assert.equal(mission.params.sampleRecovered, true);
  assert.equal(state.player.cargo.items[mission.params.cmdtyId], 1);
  assert.equal(mission.status, 'active', 'sample recovery is not mission delivery');
  assert.equal(state.player.credits, creditsBefore, 'sample recovery issues no additional credit');
  assert.equal(state.story.beatIndex, beatBefore, 'sample recovery alone does not advance the campaign beat');
  const completedStepsAfter = state.story.campaign47a?.stepProgress?.['0']?.completed || [];
  assert.deepEqual(completedStepsAfter, [...completedStepsBefore, 'mine'],
    'recovery records the mining step but not the separate dock/delivery step');
  assert.equal(state.nav.waypoint.stationId, mission.destStationId, 'the owner now routes to its actual destination');

  const after = missionCommandBrief(mission, state);
  assert.match(after.what, /deliver the recovered 47-A assay sample/i);
  assert.equal(after.where, 'Helios Station (Helios Prime)');
  assert.match(after.how, /carry the recovered assay sample to Helios Station/i);
  const afterMap = missionMapAction(state, mission, true);
  assert.equal(afterMap.stationId, mission.destStationId);
  assert.equal(afterMap.pos, null);
});
