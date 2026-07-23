import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRESENTATION_ADMISSION,
  hasExplicitAuthoredGeologyPresentation,
  initializePresentationAdmission,
  presentationAllowsPlayerFacingAction,
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
  setPresentationAdmission(ship, PRESENTATION_ADMISSION.ready);
  assert.equal(presentationAllowsPlayerFacingAction(ship, browserState), true);
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
