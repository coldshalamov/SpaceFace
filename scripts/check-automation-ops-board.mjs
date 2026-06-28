import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DRONES, OUTPOSTS, TRADERS } from '../src/data/automation.js';
import {
  automationNextAction,
  automationScreen,
  describeAutomationPurchase,
  summarizeAutomationOperations,
} from '../src/ui/screens/automationPanel.js';

assert.equal(automationScreen.id, 'automation', 'automation screen must keep the registered id');

const baseState = {
  player: { credits: 5000, droneTierCap: 1, researchedNodes: [], ownedShips: [{ defId: 'ship_kestrel' }] },
  automation: { drones: [], traders: [], outposts: [], fleet: [], meta: { totalPassiveEarnedLifetime: 0 } },
};

let summary = summarizeAutomationOperations(baseState);
assert.equal(summary.activeAssets, 0, 'new save should have no automation assets');
assert.equal(Math.round(summary.capPerMin), 113, 'tier-1 passive cap should be visible in the operations board');

let next = automationNextAction(baseState);
assert.equal(next.tab, 'drones', 'first automation recommendation should send players to drones');
assert.match(next.title, /Deploy a mining drone/, 'first recommendation should name the concrete starter asset');
assert.match(next.body, /Mk1 drone/, 'first recommendation should explain why the starter asset matters');

let guidance = describeAutomationPurchase('drone', DRONES.find((entry) => entry.id === 'drone_mk2'), baseState);
assert.equal(guidance.state, 'tier', 'locked drone tiers should be explained before credits');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Research Drone Swarm');
assert.match(guidance.title, /drone tier 2/);

guidance = describeAutomationPurchase('drone', DRONES.find((entry) => entry.id === 'drone_mk1'), {
  player: { credits: 1000, droneTierCap: 1, researchedNodes: [] },
});
assert.equal(guidance.state, 'funding', 'affordable-tier drones should expose missing credits');
assert.equal(guidance.label, 'Need 3,000 cr');
assert.match(guidance.title, /need 3,000 more credits/i);

guidance = describeAutomationPurchase('trader', TRADERS.find((entry) => entry.id === 'trader_hauler_l'), baseState);
assert.equal(guidance.state, 'tech', 'trader hiring should name its tech blocker');
assert.equal(guidance.label, 'Research Autonomous Fleets');

guidance = describeAutomationPurchase('trader', TRADERS.find((entry) => entry.id === 'trader_hauler_l'), {
  player: { credits: 4000, droneTierCap: 3, researchedNodes: ['tech_autonomous_fleets'] },
});
assert.equal(guidance.state, 'funding', 'trader hiring should expose missing credits once unlocked');
assert.equal(guidance.label, 'Need 5,000 cr');

guidance = describeAutomationPurchase('outpost', OUTPOSTS.find((entry) => entry.id === 'outpost_refinery'), baseState);
assert.equal(guidance.state, 'tech', 'outpost construction should name its tech blocker');
assert.equal(guidance.label, 'Research Outpost Charter');

guidance = describeAutomationPurchase('outpost', OUTPOSTS.find((entry) => entry.id === 'outpost_refinery'), {
  player: { credits: 120000, droneTierCap: 4, researchedNodes: ['tech_outpost_charter'] },
});
assert.equal(guidance.state, 'available', 'unlocked funded outposts should stay actionable');
assert.equal(guidance.label, 'Build 60k cr');

const droneState = {
  player: { credits: 12000, droneTierCap: 1, researchedNodes: [], ownedShips: [{ defId: 'ship_kestrel' }] },
  automation: {
    drones: [{ id: 1, defId: 'drone_mk1', status: 'mining', ratePerMin: 80, fuel: 200, fuelMax: 240 }],
    traders: [],
    outposts: [],
    fleet: [],
    meta: { totalPassiveEarnedLifetime: 320 },
  },
};
summary = summarizeAutomationOperations(droneState);
assert.equal(summary.drones, 1, 'summary should count deployed drones');
assert.equal(summary.upkeepPerMin, 6, 'summary should subtract authored drone upkeep from displayed net flow');
assert.equal(summary.netRatePerMin, 74, 'net flow should be gross minus upkeep');
next = automationNextAction(droneState);
assert.equal(next.tab, 'traders', 'post-drone recommendation should point at trader progression');
assert.match(next.title, /Autonomous Fleets/, 'locked trader recommendation should name the required tech');

const traderReadyState = {
  ...droneState,
  player: { ...droneState.player, researchedNodes: ['tech_autonomous_fleets'] },
};
next = automationNextAction(traderReadyState);
assert.equal(next.tab, 'traders', 'trader-ready recommendation should stay on the trader tab');
assert.match(next.title, /Hire a route trader/, 'trader-ready recommendation should become actionable');

const distressedState = {
  player: traderReadyState.player,
  automation: {
    drones: [{ id: 1, defId: 'drone_mk1', status: 'distressed', ratePerMin: 80 }],
    traders: [],
    outposts: [],
    fleet: [],
    meta: {},
  },
};
next = automationNextAction(distressedState);
assert.match(next.title, /Stabilize/, 'distressed assets should override growth recommendations');

const src = readFileSync(new URL('../src/ui/screens/automationPanel.js', import.meta.url), 'utf8');
assert.match(src, /Operations Board/, 'automation panel should render the operations board');
assert.match(src, /data-act="switchTab"/, 'operations board CTA should switch to the recommended tab');
assert.match(src, /summarizeAutomationOperations/, 'automation panel should expose a pure summary helper for tests');
assert.match(src, /describeAutomationPurchase/, 'automation panel should centralize purchase guidance');
assert.match(src, /aria-label="\$\{escapeHtml\(purchase\.title\)\}"/, 'automation purchase buttons should expose guidance to assistive tech');
assert.match(src, /route heat/, 'trader cards should surface route heat management');
assert.doesNotMatch(src, /<button class="au-buy" data-act="hireTrader" data-ref="\$\{def\.id\}" \$\{hireUnlocked \? '' : 'disabled'\}>/, 'trader buttons should not be blind tech-only gates');
assert.doesNotMatch(src, /No NPC traders hired\.<\/|No outposts established\.<\/|No wingmen in your fleet/, 'empty states should be specific and actionable');

console.log('Automation operations board OK');
