import test from 'node:test';
import assert from 'node:assert/strict';
import { CARCASS_CAP, PASTURE_CAP, stepFoodWeb } from '../src/data/faunaFoodWeb.js';
import { applySiteFoodWeb, deserializeAlienEcologyState } from '../src/systems/alienEcology.js';
import { ALIEN_ECOLOGY_SCHEMA } from '../src/data/alienEcologyState.js';
import { interactionClassLine } from '../src/data/entityInteractionProfiles.js';

function body(speciesId) {
  return { alive: true, data: { ecology: { siteId: 's', speciesId } } };
}

const cast = () => [
  body('bristle_ram'),
  body('glassback'),
  body('casket_worm'),
];

test('the three share one pasture and a kill leaves something to clean', () => {
  const rec = {};
  const fauna = cast();
  const web = applySiteFoodWeb(rec, fauna, 's');
  assert.equal(web.prey, 'flee');
  assert.equal(web.predator, 'hunt');
  assert.equal(web.scavenger, 'clean');
  assert.equal(web.stock, PASTURE_CAP);
  assert.equal(web.carcass, 0);
  assert.equal(fauna[0].data.ecology.web, 'hunt');
  assert.equal(fauna[1].data.ecology.web, 'flee');
  assert.equal(fauna[2].data.ecology.web, 'clean');
});

test('removing the predator lets the grazer eat and leaves the scavenger waiting', () => {
  const rec = {};
  const fauna = [body('glassback'), body('casket_worm')];
  const web = applySiteFoodWeb(rec, fauna, 's');
  assert.equal(web.prey, 'graze');
  assert.equal(web.predator, 'absent');
  assert.equal(web.scavenger, 'idle');
  assert.equal(web.stock, PASTURE_CAP - 1);
  assert.equal(fauna[0].data.ecology.web, 'graze');
  assert.equal(fauna[1].data.ecology.web, 'idle');
});

test('removing the grazer leaves the predator waiting and the pasture uneaten', () => {
  const rec = {};
  const web = applySiteFoodWeb(rec, [body('bristle_ram'), body('casket_worm')], 's');
  assert.equal(web.predator, 'idle');
  assert.equal(web.prey, 'absent');
  assert.equal(web.stock, PASTURE_CAP);
  assert.equal(web.scavenger, 'idle');
});

test('the pasture and the carcass pile stay inside their caps', () => {
  let web = { stock: 1, carcass: CARCASS_CAP, hasPredator: true, hasPrey: true, hasScavenger: false };
  for (let i = 0; i < 30; i += 1) {
    web = stepFoodWeb({ ...web, hasPredator: true, hasPrey: true, hasScavenger: false });
    assert.ok(web.stock >= 0 && web.stock <= PASTURE_CAP);
    assert.ok(web.carcass >= 0 && web.carcass <= CARCASS_CAP);
  }
  assert.equal(web.carcass, CARCASS_CAP);
  let grazed = { stock: PASTURE_CAP, carcass: 0 };
  for (let i = 0; i < 30; i += 1) {
    grazed = stepFoodWeb({ ...grazed, hasPredator: false, hasPrey: true, hasScavenger: false });
    assert.ok(grazed.stock >= 0 && grazed.stock <= PASTURE_CAP);
  }
  assert.ok(grazed.stock <= 1);
});

test('the same second does not consume twice, and a save keeps the pile', () => {
  const rec = {};
  const fauna = [body('glassback')];
  const first = applySiteFoodWeb(rec, fauna, 's', 4);
  const second = applySiteFoodWeb(rec, fauna, 's', 4);
  assert.equal(second.stock, first.stock);
  assert.equal(first.stock, PASTURE_CAP - 1);
  const state = { world: {} };
  deserializeAlienEcologyState(state, {
    schema: ALIEN_ECOLOGY_SCHEMA,
    sites: { s: { foodWeb: { stock: 99, carcass: -4, prey: 'graze', predator: 'nope', scavenger: 'clean', stepAt: 4 } } },
  });
  const saved = state.world.alienEcology.sites.s.foodWeb;
  assert.equal(saved.stock, PASTURE_CAP);
  assert.equal(saved.carcass, 0);
  assert.equal(saved.prey, 'graze');
  assert.equal(saved.predator, 'absent');
  assert.equal(saved.scavenger, 'clean');
  assert.equal(saved.stepAt, 4);
});

test('the lock line names the web and a plain fauna line stays plain', () => {
  assert.equal(interactionClassLine({
    type: 'fauna', data: { ecology: { driveState: 'forage', web: 'graze' } },
  }), 'Fauna · quiet · grazing');
  assert.equal(interactionClassLine({
    type: 'fauna', data: { ecology: { driveState: 'charge', web: 'hunt' } },
  }), 'Fauna · defense · hunting');
  assert.equal(interactionClassLine({
    type: 'fauna', data: { ecology: { driveState: 'feed' } },
  }), 'Fauna · feeding');
  assert.equal(interactionClassLine({ type: 'ship', data: {} }), '');
});
