import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  automationNextAction,
  automationScreen,
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
assert.match(src, /route heat/, 'trader cards should surface route heat management');
assert.doesNotMatch(src, /No NPC traders hired\.<\/|No outposts established\.<\/|No wingmen in your fleet/, 'empty states should be specific and actionable');

console.log('Automation operations board OK');
