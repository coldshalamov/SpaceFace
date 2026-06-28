import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BLUEPRINTS } from '../src/data/blueprints.js';
import { describeManufactureBuildAction, recommendManufactureStep } from '../src/ui/screens/manufacture.js';

const source = readFileSync(new URL('../src/ui/screens/manufacture.js', import.meta.url), 'utf8');
const bp = (id) => BLUEPRINTS.find((entry) => entry.id === id);

let guidance = describeManufactureBuildAction(bp('bp_build_pulse_laser_s'), {
  researchedNodes: [],
  cargo: { items: {} },
});
assert.equal(guidance.state, 'tech');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Research Combat Basics');
assert.match(guidance.title, /requires Combat Basics/);

guidance = describeManufactureBuildAction(bp('bp_refine_metals'), {
  researchedNodes: [],
  cargo: { items: { cmdty_ore_iron: 2, cmdty_ore_titanium: 1 } },
});
assert.equal(guidance.state, 'materials');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Need 1 Iron Ore');
assert.match(guidance.title, /needs 3 Iron Ore; you have 2/);

guidance = describeManufactureBuildAction(bp('bp_aug_shield_s_to_m'), {
  researchedNodes: ['tech_deflector_theory'],
  cargo: { items: {
    cmdty_comp_circuitry: 2,
    cmdty_alloys: 2,
    cmdty_quantum_cores: 1,
  } },
  moduleInventory: [],
  ownedShips: [],
});
assert.equal(guidance.state, 'source');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Need Shield Booster S');
assert.match(guidance.title, /consumes one owned Shield Booster S/);

guidance = describeManufactureBuildAction(bp('bp_refine_metals'), {
  researchedNodes: [],
  cargo: { items: { cmdty_ore_iron: 3, cmdty_ore_titanium: 1 } },
}, { busy: true, inProgress: 'Build Cargo Pod (M)' });
assert.equal(guidance.state, 'busy');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Fab busy');
assert.match(guidance.title, /Finish Build Cargo Pod/);

guidance = describeManufactureBuildAction(bp('bp_refine_metals'), {
  researchedNodes: [],
  cargo: { items: { cmdty_ore_iron: 3, cmdty_ore_titanium: 1 } },
});
assert.equal(guidance.state, 'available');
assert.equal(guidance.disabled, false);
assert.equal(guidance.label, 'Build');

let nextStep = recommendManufactureStep({
  researchedNodes: [],
  cargo: { items: { cmdty_ore_iron: 3, cmdty_ore_titanium: 1 } },
}, { blueprints: [bp('bp_refine_metals')] });
assert.equal(nextStep.state, 'available');
assert.equal(nextStep.kind, 'ok');
assert.equal(nextStep.title, 'Ready build: Refine Metals');
assert.match(nextStep.detail, /Output: Refined Metals ×2/);

nextStep = recommendManufactureStep({
  researchedNodes: [],
  cargo: { items: { cmdty_ore_iron: 2, cmdty_ore_titanium: 1 } },
}, { blueprints: [bp('bp_refine_metals')] });
assert.equal(nextStep.state, 'materials');
assert.equal(nextStep.title, 'Need 1 Iron Ore');
assert.match(nextStep.detail, /Mine, salvage, buy cargo, or follow a trade route/);

nextStep = recommendManufactureStep({
  researchedNodes: ['tech_deflector_theory'],
  cargo: { items: { cmdty_comp_circuitry: 2, cmdty_alloys: 2, cmdty_quantum_cores: 1 } },
  moduleInventory: [],
  ownedShips: [],
}, { blueprints: [bp('bp_aug_shield_s_to_m')] });
assert.equal(nextStep.state, 'source');
assert.equal(nextStep.title, 'Need Shield Booster S');
assert.match(nextStep.detail, /Buy, build, or unfit the source module/);

nextStep = recommendManufactureStep({
  researchedNodes: [],
  cargo: { items: {
    cmdty_comp_circuitry: 2,
    cmdty_refined_metals: 2,
    cmdty_microchips: 1,
  } },
}, { blueprints: [bp('bp_build_pulse_laser_s')] });
assert.equal(nextStep.state, 'tech');
assert.equal(nextStep.title, 'Research Combat Basics');
assert.match(nextStep.detail, /Tech Tree/);

nextStep = recommendManufactureStep({
  researchedNodes: [],
  cargo: { items: { cmdty_ore_iron: 3, cmdty_ore_titanium: 1 } },
}, {
  busy: true,
  inProgress: 'Pulse Laser S',
  blueprints: [bp('bp_refine_metals')],
  buildTime: () => 0,
});
assert.equal(nextStep.state, 'available');
assert.equal(nextStep.title, 'Ready build: Refine Metals');

nextStep = recommendManufactureStep({
  researchedNodes: ['tech_combat_basics'],
  cargo: { items: { cmdty_comp_circuitry: 2, cmdty_refined_metals: 2, cmdty_microchips: 1 } },
}, {
  busy: true,
  inProgress: 'Shield Booster M',
  blueprints: [bp('bp_build_pulse_laser_s')],
  buildTime: () => 20,
});
assert.equal(nextStep.state, 'busy');
assert.match(nextStep.detail, /Finish Shield Booster M/);

assert.match(source, /export function describeManufactureBuildAction/);
assert.match(source, /export function recommendManufactureStep/);
assert.match(source, /function blueprintBusy\(bp, opts = \{\}\)/);
assert.match(source, /MANUFACTURING ADVISOR/);
assert.match(source, /buildTime: \(bp\) => \(crafting \? crafting\.buildTime\(bp\) : 0\)/);
assert.match(source, /aria-label="\$\{escapeHtml\(buildAction\.title\)\}"/);
assert.match(source, /techName\(bp\.requiresTech\)/);
assert.doesNotMatch(source, />BUILD<\/button>/);
assert.doesNotMatch(source, /escapeHtml\(bp\.requiresTech\)/);

console.log('Manufacturing guidance OK - build buttons and next-step advisor explain tech, material, source, and queue blockers.');
