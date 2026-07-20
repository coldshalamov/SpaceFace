import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRESENTATION_ADMISSION,
  hasExplicitAuthoredGeologyPresentation,
  initializePresentationAdmission,
  presentationAllowsPlayerFacingAction,
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
