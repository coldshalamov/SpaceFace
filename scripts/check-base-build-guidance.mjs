import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BODY_MODULES } from '../src/data/claimableBodies.js';
import {
  describeBaseBuildAction,
  recommendBaseBuildPlan,
} from '../src/ui/screens/base.js';

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

let plan = recommendBaseBuildPlan({
  credits: 100000,
  researchedNodes: ['tech_outpost_charter'],
}, { name: 'Arden Moon', modules: [], slots: 3 });
assert.equal(plan.state, 'available');
assert.equal(plan.kind, 'ok');
assert.equal(plan.moduleId, 'mod_depot');
assert.match(plan.title, /Build Cargo Depot next/);
assert.match(plan.body, /dropoff point/i);

plan = recommendBaseBuildPlan({
  credits: 100000,
  researchedNodes: [],
}, { name: 'Arden Moon', modules: [], slots: 3 });
assert.equal(plan.state, 'locked');
assert.equal(plan.kind, 'warn');
assert.equal(plan.moduleId, 'mod_depot');
assert.equal(plan.label, 'RESEARCH NEXT');
assert.match(plan.body, /Outpost Charter/);

plan = recommendBaseBuildPlan({
  credits: 1000,
  researchedNodes: ['tech_outpost_charter'],
}, { name: 'Arden Moon', modules: [], slots: 3 });
assert.equal(plan.state, 'funding');
assert.equal(plan.kind, 'bad');
assert.equal(plan.moduleId, 'mod_depot');
assert.equal(plan.label, 'PREP NEXT');
assert.match(plan.body, /need 3,500 more credits/i);

plan = recommendBaseBuildPlan({
  credits: 100000,
  researchedNodes: ['tech_outpost_charter', 'tech_deep_core_mining'],
}, { name: 'Arden Moon', modules: ['mod_depot', 'mod_defense', 'mod_refinery'], slots: 3 });
assert.equal(plan.state, 'filled');
assert.equal(plan.kind, 'warn');
assert.match(plan.title, /no free module slots/i);
assert.match(plan.body, /3\/3 slots/);

assert.match(source, /export function describeBaseBuildAction/);
assert.match(source, /export function recommendBaseBuildPlan/);
assert.match(source, /describeBaseBuildAction\(mod, player, body\)/);
assert.match(source, /recommendBaseBuildPlan\(player, body\)/);
assert.match(source, /base-plan/);
assert.match(source, /NEXT BUILD/);
assert.match(source, /BASE_BUILD_PRIORITY/);
assert.match(source, /btn\.setAttribute\('aria-label', buildAction\.title\)/);
assert.doesNotMatch(source, /Too expensive/);
assert.doesNotMatch(source, /textContent = !techOk \? 'Locked'/);

console.log('Base build guidance OK - module buttons and next-build plan explain tech, credit, and slot blockers.');
