import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRESENTATION_ADMISSION,
  entityIsMissionCritical,
  hasExplicitAuthoredGeologyPresentation,
  initializePresentationAdmission,
  presentationAllowsPlayerFacingAction,
  presentationAllowsTargetLock,
  presentationOwnerAdmissionForWorldRecord,
  PRESENTATION_OWNER_ADMISSION,
  resolvePresentationAdmissionOwner,
  setPresentationAdmission,
} from '../src/core/presentationAdmission.js';

test('browser-facing authored entities cannot act before their exact identity is admitted', () => {
  const ship = initializePresentationAdmission({ type: 'ship', alive: true, data: {} });
  const browserState = { render: { scene: {} } };
  assert.equal(ship.presentationAdmission, PRESENTATION_ADMISSION.pending);
  assert.equal(presentationAllowsPlayerFacingAction(ship, browserState), false);
  assert.equal(presentationAllowsTargetLock(ship, browserState), false);
  setPresentationAdmission(ship, PRESENTATION_ADMISSION.ready);
  assert.equal(presentationAllowsPlayerFacingAction(ship, browserState), true);
  assert.equal(presentationAllowsTargetLock(ship, browserState), true);
});

test('a ship settled on a visible procedural fallback stays lockable after authored failure', () => {
  const browserState = { render: { scene: {} } };
  const ship = initializePresentationAdmission({ type: 'ship', alive: true, data: {} });
  // The boundary wrap publishes whether the ship carries a drawn procedural body; a terminal
  // 'unavailable' verdict on that ship is not empty air — the fallback is the hull to aim at.
  ship.presentationFallbackVisible = true;
  setPresentationAdmission(ship, PRESENTATION_ADMISSION.unavailable);
  assert.equal(presentationAllowsTargetLock(ship, browserState), true);
});

test('an authored-only hull that fails admission stays off the lock', () => {
  const browserState = { render: { scene: {} } };
  const withheld = initializePresentationAdmission({
    type: 'ship', alive: true, data: { defId: 'ship_wasp' },
  });
  withheld.presentationFallbackVisible = false;
  setPresentationAdmission(withheld, PRESENTATION_ADMISSION.unavailable);
  assert.equal(presentationAllowsTargetLock(withheld, browserState), false,
    'a withheld fallback leaves nothing to aim at');
  const unstamped = initializePresentationAdmission({ type: 'ship', alive: true, data: {} });
  setPresentationAdmission(unstamped, PRESENTATION_ADMISSION.unavailable);
  assert.equal(presentationAllowsTargetLock(unstamped, browserState), false,
    'a ship that never published a fallback stamp fails closed');
});

test('entityIsMissionCritical reads stamped identity and live mission target lists', () => {
  const state = { missions: { active: [{ id: 'm1', targetEntityIds: [42] }] } };
  assert.equal(entityIsMissionCritical({ id: 1, data: { missionTag: 'wanted_warrant' } }, {}), true,
    'a stamped missionTag is mission identity');
  assert.equal(entityIsMissionCritical({ id: 2, data: { storyTarget: true } }, {}), true,
    'a truthy storyTarget is mission identity');
  assert.equal(entityIsMissionCritical({ id: 42, data: {} }, state), true,
    'membership in an active mission target list is mission identity');
  assert.equal(entityIsMissionCritical({ id: 7, data: {} }, state), false,
    'an untargeted plain hostile is not mission-critical');
  assert.equal(entityIsMissionCritical({ id: 42, data: { missionTag: 'wanted_warrant' } }, null), true,
    'missing missions state is safe');
  assert.equal(entityIsMissionCritical(null, state), false);
  assert.equal(entityIsMissionCritical({ id: 42 }, { missions: null }), false);
  assert.equal(entityIsMissionCritical({ data: { missionTag: 'x' } }, state), true,
    'missionTag alone decides before any id is needed');
  assert.equal(entityIsMissionCritical({ id: 42 }, { missions: { active: 'not-an-array' } }), false,
    'a malformed mission list fails closed');
  assert.equal(entityIsMissionCritical({ id: 42 }, { missions: { active: [{ id: 'm2' }] } }), false,
    'a mission without a target list contributes nothing');
});

test('a required hull on a terminal verdict is lockable when its stand-in hull drew', () => {
  const browserState = { render: { scene: {} } };
  const ship = initializePresentationAdmission({
    type: 'ship', alive: true, data: { defId: 'ship_wasp' },
  });
  // syncResolvingMarker republishes the flag from the drawn body: the ship's own resident
  // stand-in is a real hull, so a terminal 'unavailable' with it drawn is not empty air.
  ship.presentationFallbackVisible = true;
  setPresentationAdmission(ship, PRESENTATION_ADMISSION.unavailable);
  assert.equal(presentationAllowsTargetLock(ship, browserState), true);
});

test('a required hull on a bare octahedron stays off the lock without mission identity', () => {
  const browserState = { render: { scene: {} } };
  const ship = initializePresentationAdmission({
    type: 'ship', alive: true, data: { defId: 'ship_wasp' },
  });
  // Terminal 'unavailable' with only the abstract resolving marker drawn: nothing real to aim
  // at, and no mission identity to warrant a procedural stand-in — authored-or-nothing holds.
  ship.presentationFallbackVisible = false;
  setPresentationAdmission(ship, PRESENTATION_ADMISSION.unavailable);
  assert.equal(entityIsMissionCritical(ship, browserState), false);
  assert.equal(presentationAllowsTargetLock(ship, browserState), false);
});

test('a mission-critical required hull is lockable once its procedural fallback publishes', () => {
  const browserState = { render: { scene: {} } };
  const ship = initializePresentationAdmission({
    id: 9001, type: 'ship', alive: true,
    data: { defId: 'ship_wasp', missionTag: 'wanted_warrant' },
  });
  assert.equal(entityIsMissionCritical(ship, browserState), true);
  // The terminal sync consumed the mission-only thunk: the procedural body drew and the flag
  // was republished true — the warrant target is lockable again.
  ship.presentationFallbackVisible = true;
  setPresentationAdmission(ship, PRESENTATION_ADMISSION.unavailable);
  assert.equal(presentationAllowsTargetLock(ship, browserState), true);
});

test('headless simulation remains independent of render admission', () => {
  const ship = initializePresentationAdmission({ type: 'ship', alive: true, data: {} });
  assert.equal(presentationAllowsPlayerFacingAction(ship, {}), true);
});

test('procedural entities do not require authored admission', () => {
  const asteroid = initializePresentationAdmission({ type: 'asteroid', alive: true, data: {} });
  assert.equal(asteroid.presentationAdmission, undefined);
  assert.equal(presentationAllowsPlayerFacingAction(asteroid, { render: { scene: {} } }), true);
});

test('world-site components fail closed behind their stable root presentation owner', () => {
  const rootId = 'world_site_helios_relay/root';
  const component = {
    id: 2, type: 'wreck', alive: true,
    data: {
      worldSiteId: 'world_site_helios_relay',
      worldRecordId: 'world_site_helios_relay/component/relay_core',
      presentationOwnerWorldRecordId: rootId,
    },
  };
  const state = { render: { scene: {} }, entities: new Map([[2, component]]) };
  assert.equal(resolvePresentationAdmissionOwner(component, state), null);
  assert.equal(presentationAllowsPlayerFacingAction(component, state), false, 'missing root denies');

  const root = initializePresentationAdmission({
    id: 3, type: 'fx', alive: true,
    data: { placeId: 'place_claim_outpost_relay', worldRecordId: rootId },
  });
  state.entities.set(root.id, root);
  assert.equal(resolvePresentationAdmissionOwner(component, state), root);
  assert.equal(presentationAllowsPlayerFacingAction(component, state), false, 'pending root denies');
  setPresentationAdmission(root, PRESENTATION_ADMISSION.unavailable);
  assert.equal(presentationAllowsPlayerFacingAction(component, state), false, 'unavailable root denies');
  setPresentationAdmission(root, PRESENTATION_ADMISSION.ready);
  assert.equal(presentationAllowsPlayerFacingAction(component, state), true);
  assert.equal(presentationAllowsPlayerFacingAction(component, { entities: state.entities }), true,
    'headless remains simulation-safe');
});

test('pure presentation-owner admission distinguishes browser failure states and headless mode', () => {
  const rootId = 'world_site_helios_relay/root';
  const browser = { render: { scene: {} }, entities: new Map() };
  assert.equal(presentationOwnerAdmissionForWorldRecord(rootId, browser), PRESENTATION_OWNER_ADMISSION.missing);
  const root = initializePresentationAdmission({
    id: 9, type: 'fx', alive: true,
    data: { placeId: 'place_claim_outpost_relay', worldRecordId: rootId },
  });
  browser.entities.set(root.id, root);
  assert.equal(presentationOwnerAdmissionForWorldRecord(rootId, browser), PRESENTATION_OWNER_ADMISSION.pending);
  setPresentationAdmission(root, PRESENTATION_ADMISSION.unavailable);
  assert.equal(presentationOwnerAdmissionForWorldRecord(rootId, browser), PRESENTATION_OWNER_ADMISSION.unavailable);
  setPresentationAdmission(root, PRESENTATION_ADMISSION.ready);
  assert.equal(presentationOwnerAdmissionForWorldRecord(rootId, browser), PRESENTATION_OWNER_ADMISSION.ready);
  assert.equal(presentationOwnerAdmissionForWorldRecord(rootId, { entities: browser.entities }), PRESENTATION_OWNER_ADMISSION.headless);
});

test('only an explicit correctly-scaled geology skin opts an asteroid into authored admission', () => {
  const plainPlaceId = initializePresentationAdmission({
    type: 'asteroid', alive: true, radius: 12,
    data: { placeId: 'place_asteroid_rock_a', placeTargetRadius: 12 },
  });
  const wrongScale = initializePresentationAdmission({
    type: 'asteroid', alive: true, radius: 12,
    data: {
      authoredGeologySkin: true,
      placeId: 'place_asteroid_rock_a',
      placeTargetRadius: 24,
    },
  });
  const explicit = initializePresentationAdmission({
    type: 'asteroid', alive: true, radius: 12,
    data: {
      authoredGeologySkin: true,
      placeId: 'place_asteroid_rock_a',
      placeTargetRadius: 12,
    },
  });

  assert.equal(hasExplicitAuthoredGeologyPresentation(plainPlaceId), false);
  assert.equal(hasExplicitAuthoredGeologyPresentation(wrongScale), false);
  assert.equal(plainPlaceId.presentationAdmission, undefined);
  assert.equal(wrongScale.presentationAdmission, undefined);
  assert.equal(hasExplicitAuthoredGeologyPresentation(explicit), true);
  assert.equal(explicit.presentationAdmission, PRESENTATION_ADMISSION.pending);
});
