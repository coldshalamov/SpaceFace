#!/usr/bin/env node
// T8d — smuggling card verification over shipped BP-12 customs/contraband.
//
// This is a proof gate for the player-facing contract card, not a new feature: preflight and mission
// log cards must surface customs heat/stakes, and the live customs systems must back those warnings.
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { missions } from '../src/systems/missions.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import {
  missionCargoStaging,
  missionConsequenceSummary,
  missionPreflight,
  missionRiskRewardSummary,
} from '../src/ui/missionPreflight.js';
import { missionBoardReadiness } from '../src/ui/screens/stationHub.js';
import { activeMissionContractTerms } from '../src/ui/screens/missionLog.js';
import { BRIBE_FRAC, customsDecision, holdRisk } from '../src/ui/customsPrompt.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in smuggling-card path'); };
  Date.now = () => { throw new Error('Date.now in smuggling-card path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testPreflightSmugglingCard);
guarded(testAcceptedSmugglingCard);
testLiveCustomsConsequencesBackTheCard();
testSmugglingBustFailsActiveMission();

console.log(`[check-smuggling-card] PASS - ${sections} sections green`);

function makeOffer(overrides = {}) {
  return {
    id: 'offer_smuggling_card',
    type: 'smuggling_run',
    stationId: 'station_smuggler',
    factionId: 'faction_quiet',
    reward_cr: 1800,
    collateral_cr: 450,
    riskTier: 3,
    time_limit_s: 540,
    destStationId: 'station_sker',
    destSectorId: 'sector_sker_haven',
    distance: 3500,
    title: 'Quiet Bay Customs Run',
    params: { cmdtyId: 'cmdty_narcotics', qty: 4, taskTime: 20 },
    ...overrides,
  };
}

function makeCardState() {
  const state = {
    simTime: 0,
    meta: { seed: 47 },
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 5000,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 12, capMass: 999 },
      stats: {},
    },
    missions: { active: [], completedLog: [], config: { ...MISSION_TUNING, maxActive: 8 } },
    story: { beatIndex: 5, branch: 'free', flags: {}, chainProgress: 0 },
    factions: { faction_quiet: { rep: 80 } },
    ui: { dockedStationId: 'station_smuggler' },
    nav: {},
    world: { currentSectorId: 'sector_tethys_junction' },
    fuel: { current: 100, max: 100 },
    entities: new Map([[1, { id: 1, type: 'ship', hull: 100, hullMax: 100 }]]),
    economy: {
      markets: {
        station_smuggler: {
          cmdty_narcotics: { stock: 8, lastBuy: 220, lastMid: 220 },
        },
      },
    },
  };
  return state;
}

function testPreflightSmugglingCard() {
  const offer = makeOffer();
  const state = makeCardState();

  const summary = missionConsequenceSummary(offer);
  assert.equal(summary.reward, 1800, 'smuggling card success term carries the listed payout');
  assert.equal(summary.collateral, 450, 'smuggling card success/failure terms carry collateral');
  assert.ok(summary.chips.some((chip) => chip.kind === 'bad' && chip.label === 'Heat' && /customs scans/.test(chip.text)),
    'preflight consequence chip names customs heat');

  const riskReward = missionRiskRewardSummary(offer);
  assert.equal(riskReward.chip.kind, 'warn', 'R3 smuggling payout chip warns without blocking');
  assert.equal(riskReward.chip.text, 'Payout +1,800 cr / R3 - stake 450 cr',
    'payout/risk/stake are one scannable card line');

  const staging = missionCargoStaging(offer, state);
  assert.equal(staging.chip.text, 'Buy 4u Narcotics here',
    'smuggling card tells the player the contraband can be staged at the current market');

  const preflight = missionPreflight(offer, state);
  const composedCardChips = [...preflight.chips, ...summary.chips];
  assert.equal(missionBoardReadiness(preflight).state, 'caution',
    'smuggling card asks for a check when route/contract risk is high');
  assert.ok(composedCardChips.some((chip) => chip.kind === 'bad' && chip.text === 'customs scans can add legal trouble'),
    'composed station card keeps customs heat visible before acceptance');
  assert.ok(preflight.chips.some((chip) => chip.text === 'Buy 4u Narcotics here'),
    'preflight card includes contraband staging, not just abstract risk');
  ok('smuggling preflight card surfaces payout, stake, staging, route risk, and customs heat');
}

function testAcceptedSmugglingCard() {
  const state = {
    ...makeCardState(),
    simTime: 120,
    world: { currentSectorId: 'sector_tethys_junction' },
  };
  const active = {
    ...makeOffer(),
    id: 'mission_smuggling_card',
    status: 'active',
    objectiveProgress: 0,
    objectiveTarget: 1,
    deadline_s: 520,
  };
  const terms = activeMissionContractTerms(active, state);
  assert.deepEqual(terms.map((term) => term.label), ['Pays', 'Clock', 'Risk', 'Stake', 'Miss', 'Heat'],
    'accepted smuggling card has the six concrete contract terms');
  assert.equal(terms.find((term) => term.label === 'Heat').kind, 'bad',
    'accepted smuggling card marks customs heat as danger');
  assert.equal(terms.find((term) => term.label === 'Stake').text, '450 cr collateral',
    'accepted smuggling card preserves the stake');
  assert.match(terms.find((term) => term.label === 'Miss').text, /stake forfeited.*no payout/,
    'accepted smuggling card names the failure cost');
  ok('accepted smuggling card keeps customs heat and stake visible in mission log terms');
}

function bootCustoms(seed = 25) {
  const sim = createSimulation({ seed, systems: [cargo, economy, factions, heat, missions] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.credits = 4000;
  state.player.cargo.items = { cmdty_narcotics: 4 };
  const log = { credits: [], scanned: [], rep: [], failed: [] };
  bus.on('credits:changed', (p) => log.credits.push(p));
  bus.on('contraband:scanned', (p) => log.scanned.push(p));
  bus.on('faction:repDelta', (p) => log.rep.push(p));
  bus.on('mission:failed', (p) => log.failed.push(p));
  return { sim, state, bus, log, econ: sim.registry.get('economy') };
}

function testLiveCustomsConsequencesBackTheCard() {
  const bribeRun = bootCustoms(31);
  const risk = holdRisk(bribeRun.state, bribeRun.econ);
  assert.equal(risk.estFine, 1320, 'card fine estimate matches real economy fine math for 4u narcotics');
  assert.equal(risk.estBribe, Math.round(1320 * BRIBE_FRAC), 'card bribe estimate matches BRIBE_FRAC');
  const decision = customsDecision(bribeRun.state, { hasContraband: true, factionId: 'faction_scn' }, bribeRun.econ);
  assert.deepEqual(decision.actions, ['submit', 'bribe', 'run'], 'customs decision exposes the shipped actions');
  bribeRun.bus.emit('contraband:bribe', { fine: risk.estFine });
  assert.ok(bribeRun.log.credits.some((p) => p.reason === 'bribe:contraband' && p.delta === -risk.estBribe),
    'Bribe routes through economy.payBribe and charges only the bribe amount');
  assert.equal(bribeRun.state.player.cargo.items.cmdty_narcotics, 4, 'bribe keeps the contraband cargo');

  const scanRun = bootCustoms(25);
  const caught = scanRun.econ.runScan({ security: 1, scannerCloak: -1, factionId: 'faction_scn', stationId: 'station_customs' });
  assert.equal(caught.found, true, 'forced high-security scan catches the contraband');
  assert.equal(caught.fine, 1320, 'real scan charges the same fine the card warned about');
  assert.equal(scanRun.state.player.cargo.items.cmdty_narcotics || 0, 0, 'real scan confiscates contraband through cargo');
  assert.ok(scanRun.log.credits.some((p) => p.reason === 'fine:contraband' && p.delta === -1320),
    'real scan charges the fine through economy');
  assert.ok(scanRun.log.rep.some((p) => p.factionId === 'faction_scn' && p.reason === 'contraband' && p.delta < 0),
    'real scan emits the law-faction rep hit');
  assert.ok(scanRun.state.player.heat > 0, 'real scan raises WANTED heat through heat system');
  ok('live customs consequences back the smuggling card warnings');
}

function testSmugglingBustFailsActiveMission() {
  const t = bootCustoms(41);
  const active = {
    ...makeOffer(),
    id: 'mission_smuggling_bust',
    status: 'active',
    objectiveProgress: 0,
    objectiveTarget: 1,
    deadline_s: 900,
  };
  t.state.missions.active.push(active);
  t.bus.emit('player:scannedByPatrol', { hasContraband: true, factionId: 'faction_scn' });
  assert.equal(t.state.missions.active.length, 0, 'smuggling bust removes the active smuggling mission');
  assert.ok(t.log.failed.some((p) => p.missionId === 'mission_smuggling_bust' && p.reason === 'busted'),
    'smuggling bust emits mission:failed with reason busted');
  ok('smuggling card failure warning is backed by the mission bust path');
}
