import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRESENTATION_ADMISSION,
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
