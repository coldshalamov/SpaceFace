import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TECH_NODES } from '../src/data/tech.js';
import { describeTechNodeReadiness, unlockDisplayName } from '../src/ui/screens/techTree.js';

const source = readFileSync(new URL('../src/ui/screens/techTree.js', import.meta.url), 'utf8');
const node = (id) => TECH_NODES.find((entry) => entry.id === id);
const state = (player = {}) => ({
  player: {
    credits: 0,
    researchPoints: 0,
    researchedNodes: [],
    ...player,
  },
});

let readiness = describeTechNodeReadiness(node('tech_beam_focusing'), state(), TECH_NODES);
assert.equal(readiness.state, 'locked');
assert.equal(readiness.actionLabel, 'Research Combat Basics first');
assert.match(readiness.actionTitle, /Combat Basics/);

readiness = describeTechNodeReadiness(node('tech_plasma_dynamics'), state({
  credits: 999999,
  researchPoints: 999,
  researchedNodes: ['tech_kinetic_drivers'],
}), TECH_NODES);
assert.equal(readiness.state, 'locked');
assert.equal(readiness.actionLabel, 'Research Beam Focusing first');

readiness = describeTechNodeReadiness(node('tech_combat_basics'), state(), TECH_NODES);
assert.equal(readiness.state, 'funding');
assert.equal(readiness.actionLabel, 'Need 6,000 cr / 10 RP');
assert.deepEqual(readiness.missingCost, ['6,000 cr', '10 RP']);

readiness = describeTechNodeReadiness(node('tech_combat_basics'), state({
  credits: 6000,
  researchPoints: 10,
}), TECH_NODES);
assert.equal(readiness.state, 'available');
assert.equal(readiness.actionLabel, `${String.fromCharCode(0x27eb)} Research`);

readiness = describeTechNodeReadiness(node('tech_combat_basics'), state({
  researchedNodes: ['tech_combat_basics'],
}), TECH_NODES);
assert.equal(readiness.state, 'researched');
assert.equal(readiness.actionLabel, 'Already researched');

assert.equal(unlockDisplayName('ship_wasp'), 'Wasp');
assert.equal(unlockDisplayName('wpn_pulse_laser_s'), 'Pulse Laser S');
assert.equal(unlockDisplayName('mod_mining_beam_m'), 'Mining Beam M');
assert.equal(unlockDisplayName('mod_unlisted_fixture'), 'unlisted fixture');

assert.match(source, /export function describeTechNodeReadiness/);
assert.match(source, /export function unlockDisplayName/);
assert.match(source, /UNLOCK_NAME_BY_ID/);
assert.match(source, /u\.ships\.map\(unlockDisplayName\)/);
assert.match(source, /u\.modules\.map\(unlockDisplayName\)/);
assert.doesNotMatch(source, /u\.(?:ships|modules)\.map\(cleanId\)/);
assert.match(source, /disabledActionHtml\(readiness\)/);
assert.match(source, /aria-label="\$\{escapeHtml\(readiness\.actionTitle\)\}"/);
assert.doesNotMatch(source, />Prerequisites not met</);
assert.doesNotMatch(source, />Insufficient credits \/ RP</);

console.log('Tech tree guidance OK - disabled research actions name the exact blocker.');
