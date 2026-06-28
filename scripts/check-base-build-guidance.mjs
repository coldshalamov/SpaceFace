import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BODY_MODULES } from '../src/data/claimableBodies.js';
import { describeBaseBuildAction, describeBasePlan } from '../src/ui/screens/base.js';

const source = readFileSync(new URL('../src/ui/screens/base.js', import.meta.url), 'utf8');
const moduleById = (id) => BODY_MODULES.find((entry) => entry.id === id);

const depot = moduleById('mod_depot');

let guidance = describeBaseBuildAction(depot, {
  credits: 100000,
  researchedNodes: [],
}, { name: 'Arden Moon', modules: [], slots: 3 });
assert.equal(guidance.state, 'locked');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Research Outpost Charter');
assert.match(guidance.title, /requires Outpost Charter/);

guidance = describeBaseBuildAction(depot, {
  credits: 1000,
  researchedNodes: ['tech_outpost_charter'],
}, { name: 'Arden Moon', modules: [], slots: 3 });
assert.equal(guidance.state, 'funding');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Need 3,500 cr');
assert.match(guidance.title, /need 3,500 more credits/i);

guidance = describeBaseBuildAction(depot, {
  credits: 100000,
  researchedNodes: ['tech_outpost_charter'],
}, { name: 'Arden Moon', modules: ['mod_refinery'], slots: 1 });
assert.equal(guidance.state, 'slots');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'No free base slot');
assert.match(guidance.title, /1\/1 module slots filled/);

guidance = describeBaseBuildAction(depot, {
  credits: 100000,
  researchedNodes: ['tech_outpost_charter'],
}, { name: 'Arden Moon', modules: [], slots: 3 });
assert.equal(guidance.state, 'available');
assert.equal(guidance.disabled, false);
assert.equal(guidance.label, 'Build');
assert.match(guidance.title, /Build Cargo Depot/);

guidance = describeBaseBuildAction(depot, {
  credits: 100000,
  researchedNodes: ['tech_outpost_charter'],
}, { name: 'Arden Moon', modules: ['mod_depot'], slots: 3 });
assert.equal(guidance.state, 'built');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Built');

let plan = describeBasePlan({
  name: 'Arden Moon', modules: [], slots: 3,
}, {
  credits: 100000,
  researchedNodes: ['tech_outpost_charter'],
});
assert.equal(plan.state, 'ready');
assert.equal(plan.moduleId, 'mod_depot');
assert.match(plan.title, /Cargo Depot/);
assert.match(plan.body, /drone dropoff/i);
assert.match(plan.body, /Ready now: Build Cargo Depot/i);
assert.equal(plan.actionLabel, 'Build');

plan = describeBasePlan({
  name: 'Arden Moon', modules: [], slots: 3,
}, {
  credits: 1000,
  researchedNodes: [],
});
assert.equal(plan.state, 'locked');
assert.equal(plan.moduleId, 'mod_depot');
assert.equal(plan.actionLabel, 'Research Outpost Charter');
assert.match(plan.body, /Next blocker: Cargo Depot requires Outpost Charter/i);

plan = describeBasePlan({
  name: 'Arden Moon', modules: ['mod_depot'], slots: 3,
}, {
  credits: 100000,
  researchedNodes: ['tech_outpost_charter'],
});
assert.equal(plan.state, 'ready');
assert.equal(plan.moduleId, 'mod_defense');
assert.match(plan.title, /Defense Battery/);
assert.match(plan.body, /deterrent/i);

plan = describeBasePlan({
  name: 'Packed Rock', modules: ['mod_depot', 'mod_defense'], slots: 2,
}, {
  credits: 100000,
  researchedNodes: ['tech_outpost_charter'],
});
assert.equal(plan.state, 'complete');
assert.equal(plan.moduleId, null);
assert.match(plan.title, /Base slots full/);
assert.match(plan.body, /2\/2 slots filled/);

assert.match(source, /export function describeBaseBuildAction/);
assert.match(source, /export function describeBasePlan/);
assert.match(source, /BASE_PLAN_STEPS/);
assert.match(source, /base-plan/);
assert.match(source, /describeBasePlan\(body, state\.player\)/);
assert.match(source, /describeBaseBuildAction\(mod, player, body\)/);
assert.match(source, /btn\.setAttribute\('aria-label', buildAction\.title\)/);
assert.doesNotMatch(source, /Too expensive/);
assert.doesNotMatch(source, /textContent = !techOk \? 'Locked'/);

console.log('Base build guidance OK - module buttons and the base plan explain next build blockers.');
