// INF-1 (WF-14): a locked wreck or loose cargo says what it is and what it holds, in the same
// "Kind · contents" language asteroids already use — not a bare 'Salvage' / 'Loose Cargo'.
// Pure presentation data: no sim state, so no seed is consumed (fixtures are literal, seed 4242
// is only the label for the shared fixtures' wreck ids).
import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMODITIES } from '../src/data/commodities.js';
import { VOLATILE_BY_COMMODITY } from '../src/data/commodityVolatileClasses.js';
import { interactionClassLine, interactionDisplayName } from '../src/data/entityInteractionProfiles.js';
import { targetInteractionClass } from '../src/ui/targetPanel.js';
import { classWord } from '../src/ui/worldObjectInteraction.js';

const nameOf = (id) => COMMODITIES.find((c) => c.id === id).name;
const wreck = (data = {}) => ({ id: 4242, type: 'wreck', alive: true, data });

test('a battlefield wreck says its class and its richest three commodities, heaviest first', () => {
  const line = interactionClassLine(wreck({
    scanLabel: 'Wreckage of a Wasp',
    wreckClassLabel: 'Battlefield Wreck',
    salvagePool: { cmdty_scrap_metal: 2, cmdty_electronics: 5, cmdty_alloys: 3, cmdty_ore_iron: 1 },
  }));
  assert.equal(line, `Salvage · Battlefield Wreck · ${nameOf('cmdty_electronics')} / ${nameOf('cmdty_alloys')} / ${nameOf('cmdty_scrap_metal')}`,
    'a stranger can tell whether the wreck is worth stopping for');
});

test('equal quantities order by commodity id so the line is deterministic', () => {
  const pool = { cmdty_scrap_metal: 2, cmdty_alloys: 2 };
  const a = interactionClassLine(wreck({ salvagePool: pool }));
  const b = interactionClassLine(wreck({ salvagePool: { cmdty_alloys: 2, cmdty_scrap_metal: 2 } }));
  assert.equal(a, b, 'insertion order never changes the line');
  assert.equal(a, `Salvage · ${nameOf('cmdty_alloys')} / ${nameOf('cmdty_scrap_metal')}`);
});

test('a class label equal to the display name is not repeated', () => {
  const same = wreck({ wreckClassLabel: ' hull debris ', scanLabel: 'Hull Debris', salvagePool: { cmdty_scrap_metal: 1 } });
  assert.equal(interactionDisplayName(same), 'Hull Debris');
  assert.equal(interactionClassLine(same), `Salvage · ${nameOf('cmdty_scrap_metal')}`, 'no "Hull Debris / Salvage · Hull Debris"');
});

test('a drained pool reads picked clean', () => {
  assert.equal(interactionClassLine(wreck({ wreckClassLabel: 'Fresh Wreck', salvagePool: { cmdty_scrap_metal: 0 } })), 'Salvage · Fresh Wreck · picked clean');
  assert.equal(interactionClassLine(wreck({ salvagePool: {} })), 'Salvage · picked clean');
});

test('a wreck with no pool data still reads exactly Salvage', () => {
  assert.equal(interactionClassLine(wreck()), 'Salvage');
  assert.equal(targetInteractionClass(wreck()), 'Salvage');
});

test('an unstable reactor wreck keeps its hazard lead word', () => {
  const line = interactionClassLine(wreck({ parentType: 'reactor', wreckClassLabel: 'Fresh Wreck', salvagePool: { cmdty_alloys: 4 } }));
  assert.equal(line, `Hazardous Salvage · Fresh Wreck · ${nameOf('cmdty_alloys')}`);
});

test('unknown commodity ids never print raw ids or undefined', () => {
  const line = interactionClassLine(wreck({ salvagePool: { cmdty_not_a_thing: 9, cmdty_alloys: 1 } }));
  assert.equal(line, `Salvage · ${nameOf('cmdty_alloys')}`);
  const onlyUnknown = interactionClassLine(wreck({ salvagePool: { cmdty_not_a_thing: 9 } }));
  assert.equal(onlyUnknown, 'Salvage', 'a pool of ids that do not resolve says nothing about contents');
  assert.equal(interactionClassLine({ type: 'pickup', data: { commodityId: 'cmdty_not_a_thing', amount: 5 } }), 'Loose Cargo');
  assert.equal(interactionClassLine({ type: 'payload', data: { commodityId: 'cmdty_not_a_thing', amount: 5 } }), 'Cargo Mass');
  for (const line of [onlyUnknown, interactionClassLine({ type: 'pickup', data: { commodityId: 'nope' } })]) {
    assert.ok(!/undefined|cmdty_|nope/.test(line), line);
  }
});

test('loose cargo says what and how much', () => {
  const pickup = { type: 'pickup', data: { commodityId: 'cmdty_alloys', amount: 7 } };
  assert.equal(interactionClassLine(pickup), `Loose Cargo · ${nameOf('cmdty_alloys')} ×7`);
  assert.equal(interactionClassLine({ type: 'pickup', data: { commodityId: 'cmdty_alloys', amount: 0 } }), 'Loose Cargo');
  assert.equal(interactionClassLine({ type: 'pickup', data: {} }), 'Loose Cargo');
});

test('a jettisoned cargo pod says what it holds, and VOLATILE when the class is volatile', () => {
  const calm = { type: 'payload', data: { payloadType: 'jettisoned_cargo', commodityId: 'cmdty_alloys', amount: 12 } };
  assert.equal(interactionClassLine(calm), `Cargo Mass · ${nameOf('cmdty_alloys')} ×12`);
  const volatileId = Object.keys(VOLATILE_BY_COMMODITY).find((id) => COMMODITIES.some((c) => c.id === id));
  assert.ok(volatileId, 'the fixture needs a real volatile commodity');
  const hot = { type: 'payload', data: { payloadType: 'jettisoned_cargo', commodityId: volatileId, amount: 3 } };
  assert.equal(interactionClassLine(hot), `Cargo Mass · ${nameOf(volatileId)} ×3 · VOLATILE`);
  assert.equal(interactionClassLine({ type: 'payload', data: {} }), 'Cargo Mass', 'a payload with no cargo keeps today\'s label');
});

test('everything else keeps today\'s class line', () => {
  assert.equal(interactionClassLine({ type: 'beacon', data: {} }), 'Nav Beacon');
  assert.equal(interactionClassLine({ type: 'mine', data: {} }), 'Proximity Hazard');
  assert.equal(interactionClassLine({ type: 'ship', data: {} }), '');
  assert.equal(interactionClassLine(null), '');
  assert.equal(targetInteractionClass({ type: 'asteroid', data: { typeId: 'ast_metallic' } }).startsWith('Mineable'), true, 'asteroids keep their ore line');
});

test('the hover tag and the lock panel always agree for the same entities', () => {
  const entities = [
    wreck({ wreckClassLabel: 'Battlefield Wreck', salvagePool: { cmdty_electronics: 5, cmdty_alloys: 3 } }),
    wreck({ parentType: 'reactor', salvagePool: { cmdty_alloys: 1 } }),
    wreck({ salvagePool: {} }),
    wreck(),
    { type: 'pickup', data: { commodityId: 'cmdty_alloys', amount: 7 } },
    { type: 'payload', data: { commodityId: 'cmdty_alloys', amount: 12 } },
    { type: 'payload', data: { commodityId: 'cmdty_not_a_thing', amount: 2 } },
  ];
  for (const entity of entities) {
    assert.equal(classWord(entity), targetInteractionClass(entity), `hover and panel agree for ${entity.type}`);
  }
});
