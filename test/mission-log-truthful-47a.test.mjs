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
  mapActionButtonAttrs,
  mapOpenIntentFromButton,
  objectiveText,
  recommendedActions,
} from '../src/ui/screens/missionLog.js';
import { applyMapOpenIntentToView, resolveMapOpenTarget } from '../src/ui/galaxyMap.js';
import { mapHandoffAction, normalizeMapOpenIntent, setMapOpenIntent, takeMapOpenIntent } from '../src/ui/mapAuthority.js';

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

function mapButton(action, missionId) {
  const attrs = mapActionButtonAttrs(action, missionId);
  const values = Object.fromEntries(
    [...attrs.matchAll(/(?:^|\s)(data-[\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
  );
  return {
    attrs,
    intent: mapOpenIntentFromButton({
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null; },
    }),
  };
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
  assert.equal(beforeMap.stationId, null, 'unrecovered B0 must not select its eventual berth');
  const beforeButton = mapButton(beforeMap, mission.id);
  assert.match(beforeButton.attrs, /data-map-selection-target="active-waypoint"/);
  assert.equal(beforeButton.intent.selectionTarget, 'active-waypoint');
  assert.equal(beforeButton.intent.source, 'missionLog', 'selection marker keeps caller provenance');
  setMapOpenIntent(state, beforeButton.intent);
  const normalizedBeforeMap = takeMapOpenIntent(state);
  assert.equal(normalizedBeforeMap.selectionTarget, 'active-waypoint',
    'the one-shot Map normalizer preserves the explicit selection discriminator');
  const beforeView = applyMapOpenIntentToView({
    zoom: 1, targetZoom: 1,
    cams: { galaxy: { cx: 0, cy: 0 }, system: { cx: 0, cy: 0 }, local: { cx: 0, cy: 0 } },
  }, normalizedBeforeMap, state);
  assert.equal(beforeView.openTarget.kind, 'waypoint', 'Map selects the active recovery marker');
  assert.equal(beforeView.openTarget.missionId, mission.id);
  assert.equal(beforeView.openTarget.x, source.pos.x);
  assert.equal(beforeView.openTarget.z, source.pos.z);
  assert.equal(beforeView.cams.local.cx, source.pos.x, 'Local Map centers on the recovery site');
  assert.equal(beforeView.cams.local.cy, source.pos.z);
  const explicitBerth = resolveMapOpenTarget(state, { ...normalizedBeforeMap, stationId: mission.destStationId });
  assert.equal(explicitBerth.kind, 'station', 'an explicit station request remains authoritative');

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
  assert.equal(afterMap.stationId, mission.destStationId, 'recovery restores the explicit Helios selection');
  assert.ok(afterMap.selectionTarget == null, 'post-recovery destination is not a positional objective');
  assert.equal(afterMap.pos, null);
  const savedRecoveryIntentAfterHandoff = resolveMapOpenTarget(state, normalizedBeforeMap);
  assert.equal(savedRecoveryIntentAfterHandoff.kind, 'station',
    'a stale pre-recovery intent cannot keep selecting a waypoint after the owner hands off');
  assert.equal(savedRecoveryIntentAfterHandoff.stationId, mission.destStationId);
  const afterButton = mapButton(afterMap, mission.id);
  assert.doesNotMatch(afterButton.attrs, /data-map-selection-target=/);
  setMapOpenIntent(state, afterButton.intent);
  const normalizedAfterMap = takeMapOpenIntent(state);
  const afterView = applyMapOpenIntentToView({
    zoom: 1, targetZoom: 1,
    cams: { galaxy: { cx: 0, cy: 0 }, system: { cx: 0, cy: 0 }, local: { cx: 0, cy: 0 } },
  }, normalizedAfterMap, state);
  assert.equal(afterView.openTarget.kind, 'station');
  assert.equal(afterView.openTarget.stationId, mission.destStationId);
});

test('B0 keeps the berth selection when its owner waypoint position is absent or invalid', () => {
  const cases = [
    ['missing', (wp) => { delete wp.pos; }],
    ['null', (wp) => { wp.pos = null; }],
    ['non-finite x', (wp) => { wp.pos = { x: NaN, z: 80 }; }],
    ['non-finite z', (wp) => { wp.pos = { x: 120, z: Infinity }; }],
  ];
  for (const [label, corrupt] of cases) {
    const { state, mission } = fixtureWithSampleRock();
    corrupt(state.nav.waypoint);
    const action = missionMapAction(state, mission, true);
    assert.equal(action.stationId, mission.destStationId, `${label} owner fix keeps destination selection`);
    const button = mapButton(action, mission.id);
    assert.doesNotMatch(button.attrs, /data-map-selection-target=/);
    const normalized = normalizeMapOpenIntent(button.intent);
    assert.equal(Object.hasOwn(normalized, 'selectionTarget'), false, `${label} owner fix keeps the default intent shape`);
    assert.equal(resolveMapOpenTarget(state, normalized).kind, 'station', `${label} fix does not select a fake waypoint`);
  }
});

test('a marked positional selection requires the matching owner and exact current waypoint fix', () => {
  const cases = [
    ['moved owner fix', (waypoint) => { waypoint.pos = { x: waypoint.pos.x + 1, z: waypoint.pos.z }; }],
    ['foreign waypoint mission', (waypoint) => { waypoint.missionId = 'foreign-mission'; }],
  ];
  for (const [label, replaceWaypoint] of cases) {
    const { state, mission } = fixtureWithSampleRock();
    const action = missionMapAction(state, mission, true);
    const savedIntent = normalizeMapOpenIntent(mapButton(action, mission.id).intent);
    replaceWaypoint(state.nav.waypoint);
    const target = resolveMapOpenTarget(state, savedIntent);
    assert.equal(target.kind, 'station', `${label} must not select the stale positional objective`);
    assert.equal(target.stationId, mission.destStationId);
  }
});

test('generic mission fallback and focus-only map opens retain their existing selection behavior', () => {
  const { state } = fixture();
  const generic = {
    id: 'generic-map-mission', status: 'active', type: 'cargo_delivery',
    destStationId: 'station_helios', destSectorId: 'sector_helios_prime', params: {},
  };
  state.missions.active.push(generic);
  const genericFallback = resolveMapOpenTarget(state, {
    focus: 'local', missionId: generic.id, stationId: null, sectorId: null, pos: null,
  });
  assert.equal(genericFallback.kind, 'station', 'positionless generic missions still resolve their berth');
  assert.equal(genericFallback.stationId, generic.destStationId);
  const legacyAuthorityState = { ui: {} };
  setMapOpenIntent(legacyAuthorityState, mapHandoffAction({
    focus: 'local', missionId: generic.id, source: 'missionLog',
  }));
  const legacyRoundTrip = takeMapOpenIntent(legacyAuthorityState);
  assert.deepEqual(legacyRoundTrip, {
    focus: 'local', sectorId: null, missionId: generic.id, stationId: null,
    pos: null, label: 'LOCAL MAP', source: 'missionLog',
  }, 'legacy/default Map handoffs keep their previous normalized shape');
  assert.equal(Object.hasOwn(normalizeMapOpenIntent({ focus: 'local', missionId: generic.id }), 'selectionTarget'), false,
    'legacy/default Map intent shape does not grow a null discriminator field');
  const noBerth = {
    id: 'generic-local-mission', status: 'active', type: 'mining_quota',
    destStationId: null, destSectorId: 'sector_helios_prime', params: {},
  };
  state.missions.active.push(noBerth);
  state.nav.waypoint = { missionId: noBerth.id, sectorId: noBerth.destSectorId, pos: { x: 12, z: 24 } };
  const noBerthAction = missionMapAction(state, noBerth, true);
  const noBerthButton = mapButton(noBerthAction, noBerth.id);
  assert.doesNotMatch(noBerthButton.attrs, /data-map-selection-target=/);
  const genericPosition = resolveMapOpenTarget(state, normalizeMapOpenIntent(noBerthButton.intent));
  assert.equal(genericPosition.kind, 'sector',
    'unmarked generic local missions retain their existing sector fallback');
  assert.equal(resolveMapOpenTarget(state, { focus: 'local' }), null,
    'keyboard and ordinary Map opens remain focus-only');
});
