import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DRONES, OUTPOSTS, TRADERS } from '../src/data/automation.js';
import {
  automationNextAction,
  automationScreen,
  describeAutomationCapLoad,
  describeAutomationPurchase,
  describeWingmanDeployment,
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
assert.equal(next.action, 'buyDrone', 'funded starter drone recommendation should be directly actionable');
assert.equal(next.targetRef, 'drone_mk1', 'starter drone recommendation should target the Mk1 catalog id');
assert.equal(next.kind, 'drone', 'starter drone recommendation should carry the automation kind');

next = automationNextAction({
  player: { credits: 1000, droneTierCap: 1, researchedNodes: [], ownedShips: [{ defId: 'ship_kestrel' }] },
  automation: { drones: [], traders: [], outposts: [], fleet: [], meta: {} },
});
assert.equal(next.action, 'switchTab', 'unfunded starter drone recommendation should review the bay instead of firing a buy intent');
assert.equal(next.targetRef, 'drones');

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

const overCapState = {
  player: { credits: 50000, droneTierCap: 1, researchedNodes: [], ownedShips: [{ defId: 'ship_kestrel' }] },
  automation: {
    drones: [{ id: 1, defId: 'drone_mk1', status: 'mining', ratePerMin: 240, fuel: 200, fuelMax: 240 }],
    traders: [],
    outposts: [],
    fleet: [],
    meta: {},
  },
};
summary = summarizeAutomationOperations(overCapState);
assert(Math.round(summary.capOveragePerMin) > 0, 'summary should expose over-cap production separately from headroom');
const capLoad = describeAutomationCapLoad(summary);
assert.equal(capLoad.state, 'over-cap', 'over-cap automation should get a distinct cap load state');
assert.match(capLoad.detail, /over cap; overflow dropped/, 'cap load detail should explain that hard-cap overflow is dropped');
next = automationNextAction(overCapState);
assert.equal(next.title, 'Raise automation ceiling', 'over-cap automation should recommend cap progression before more assets');
assert.match(next.body, /overflow is dropped/i, 'over-cap recommendation should explain lost passive output');
assert.match(next.meta, /over cap/, 'over-cap recommendation meta should name the overage');

const traderReadyState = {
  ...droneState,
  player: { ...droneState.player, researchedNodes: ['tech_autonomous_fleets'] },
};
next = automationNextAction(traderReadyState);
assert.equal(next.tab, 'traders', 'trader-ready recommendation should stay on the trader tab');
assert.match(next.title, /Hire a route trader/, 'trader-ready recommendation should become actionable');
assert.equal(next.action, 'hireTrader', 'funded trader recommendation should fire the hire intent directly');
assert.equal(next.targetRef, 'trader_hauler_l');

const outpostReadyState = {
  player: {
    credits: 120000,
    droneTierCap: 4,
    researchedNodes: ['tech_autonomous_fleets', 'tech_outpost_charter'],
    ownedShips: [{ defId: 'ship_kestrel' }],
  },
  automation: {
    drones: [{ id: 1, defId: 'drone_mk1', status: 'mining', ratePerMin: 80 }],
    traders: [{ id: 2, defId: 'trader_hauler_l', status: 'active', ratePerMin: 110 }],
    outposts: [],
    fleet: [],
    meta: {},
  },
};
next = automationNextAction(outpostReadyState);
assert.equal(next.action, 'buildOutpost', 'funded outpost recommendation should fire the build intent directly');
assert.equal(next.targetRef, 'outpost_fuelsynth', 'outpost recommendation should target the cheapest chartered starter outpost');

const spareHullState = {
  player: {
    credits: 120000,
    droneTierCap: 4,
    researchedNodes: ['tech_autonomous_fleets', 'tech_outpost_charter'],
    activeShipIndex: 0,
    ownedShips: [{ defId: 'ship_kestrel' }, { defId: 'ship_pelican' }],
  },
  automation: {
    drones: [{ id: 1, defId: 'drone_mk1', status: 'mining', ratePerMin: 80 }],
    traders: [{ id: 2, defId: 'trader_hauler_l', status: 'active', ratePerMin: 110 }],
    outposts: [{ id: 3, defId: 'outpost_fuelsynth', status: 'active', ratePerMin: 90 }],
    fleet: [],
    meta: {},
  },
};
next = automationNextAction(spareHullState);
assert.equal(next.action, 'assignFleet', 'spare-hull recommendation should assign the first non-active owned ship');
assert.equal(next.targetRef, 1);

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

let wingmanState = describeWingmanDeployment({ id: 'f1', status: 'escort', order: 'escort', _liveId: 'ship_live_1' });
assert.equal(wingmanState.state, 'live', 'live wingmen should be labeled as deployed in-sector');
assert.match(wingmanState.detail, /current sector/i, 'live wingmen should explain that hull comes from live combat');

wingmanState = describeWingmanDeployment({ id: 'f2', status: 'escort', order: 'escort' });
assert.equal(wingmanState.state, 'ready', 'assigned wingmen without a live id should be ready for next sector entry');
assert.match(wingmanState.detail, /next sector entry/i, 'ready wingmen should not imply they are already spawned');

wingmanState = describeWingmanDeployment({ id: 'f3', status: 'idle', order: 'idle' });
assert.equal(wingmanState.state, 'standby', 'idle wingmen should read as standby/recalled');
assert.match(wingmanState.detail, /redeploy/i, 'standby wingmen should tell players how to redeploy');

wingmanState = describeWingmanDeployment({ id: 'f4', status: 'lost' });
assert.equal(wingmanState.state, 'lost', 'lost wingmen should get a distinct deployment state');

const src = readFileSync(new URL('../src/ui/screens/automationPanel.js', import.meta.url), 'utf8');
assert.match(src, /Operations Board/, 'automation panel should render the operations board');
assert.match(src, /const action = next\.action \|\| 'switchTab'/, 'operations board CTA should use direct action metadata with a switch-tab fallback');
assert.match(src, /data-act="\$\{escapeHtml\(action\)\}"/, 'operations board CTA should render the recommended intent');
assert.match(src, /data-kind="\$\{escapeHtml\(next\.kind\)\}"/, 'direct automation CTA should carry the intent kind when needed');
assert.match(src, /summarizeAutomationOperations/, 'automation panel should expose a pure summary helper for tests');
assert.match(src, /describeAutomationCapLoad/, 'automation panel should centralize passive-cap load copy');
assert.match(src, /overflow dropped/, 'over-cap UI should explain the hard cap consequence');
assert.match(src, /describeAutomationPurchase/, 'automation panel should centralize purchase guidance');
assert.match(src, /aria-label="\$\{escapeHtml\(purchase\.title\)\}"/, 'automation purchase buttons should expose guidance to assistive tech');
assert.match(src, /route heat/, 'trader cards should surface route heat management');
assert.match(src, /describeWingmanDeployment/, 'fleet cards should centralize live/ready/standby deployment copy');
assert.match(src, /fs\._liveId \|\| ''/, 'fleet tab body signature should refresh when live wingman deployment changes');
assert.match(src, /deploy \$\{deploymentPill\(deployment\)\}/, 'fleet cards should show a deployment pill');
assert.doesNotMatch(src, /<button class="au-buy" data-act="hireTrader" data-ref="\$\{def\.id\}" \$\{hireUnlocked \? '' : 'disabled'\}>/, 'trader buttons should not be blind tech-only gates');
assert.doesNotMatch(src, /No NPC traders hired\.<\/|No outposts established\.<\/|No wingmen in your fleet/, 'empty states should be specific and actionable');

console.log('Automation operations board OK');
