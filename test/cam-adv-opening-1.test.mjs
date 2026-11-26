// CAM-ADV-OPENING-1 — calm, truthful Adventure opening regression coverage.
//
// Proves every part of the opening-truth repair:
//   1. Authored opening throw / unclaimed rock beat does not trigger cargo-theft WANTED heat,
//      restitution bills, or patrol intercepts — while real cargo theft and unprovoked harm
//      outside the opening beat (both post-opening and after the raid beat) still convict.
//   2. wantedClearClause never freezes on a static 'clears in 6s': it ticks down live outside
//      the search zone in real heat.update steps, and reports the honest hold cause when inside
//      the search zone, docked, off-sector, or impounded.
//   3. Law banners never call the player's Hitch a Hornet (plain YOU wording even across string/
//      numeric ids or recycled attacker ids), suppress unrelated NPC-on-NPC intercepts during
//      openingQuiet, and surface real incidents normally outside the opening.
//   4. Vael Instrument chatter, patrols, clauses, and debtors stay silent in Helios Prime during
//      Act I opening settling while remaining active in Vael home space.
//   5. Giant dock & cold-start bulkhead graffiti stay suppressed around Helios/Act I while
//      preserving COLD_START comms and post-B0 story graffiti.
//   6. Opening cross-sector tracker and jump-route toast consistently say 'M · Chart' / 'Chart [ M ]'
//      instead of stale 'N Star Map'.
//
// Run: node --test test/cam-adv-opening-1.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { heat, isPlayerWanted, heatLevelFor } from '../src/systems/heat.js';
import { lawSecurity, chargeableLotOwnerId } from '../src/systems/lawSecurity.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import { vaelLiens, ensureVaelState, VAEL_LEDGER } from '../src/systems/faction_vael.js';
import { story as storyProto } from '../src/systems/story.js';
import { GRAFFITI } from '../src/data/narrative.js';
import { wantedAlertText, wantedClearClause } from '../src/ui/wantedReason.js';
import {
  authorityIncidentReadout,
  authorityTargetText,
  createSectorLawPresenter,
} from '../src/ui/sectorLawPresenter.js';
import {
  flightDestinationSurface,
  resolveFlightObjectiveCommand,
  speakPlottedRouteTeach,
} from '../src/ui/hud.js';
import { departureReadinessChips } from '../src/ui/station/stationDepartureModel.js';
import { setPromptDevice } from '../src/ui/bindings.js';

function bootLawAndHeat({ opening = true, raidDone = false } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [lawSecurity, heat] });
  const { state } = sim;
  state.mode = 'flight';
  state.simTime = 30;
  state.world.currentSectorId = 'sector_helios_prime';
  state.onboarding = opening
    ? { active: true, finished: false, currentBeat: 1, beatDoneAt: raidDone ? { tether: 28, raid: 29 } : { tether: 28 } }
    : { active: false, finished: true, currentBeat: 5, beatDoneAt: { tether: 28, berth: 50, dock: 50 } };

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 12, mass: 39, hull: 140, hullMax: 140, collides: true,
    data: { defId: 'ship_hitch', name: 'Hitch', isPlayer: true },
  });
  state.playerId = player.id;

  // Protected Helios Station jurisdiction + lawful patrol witness + civilian shuttle.
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: 200, z: 0 }, radius: 90,
    data: { stationId: 'station_helios', name: 'Helios Station', dockRadius: 220 },
  });
  sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: 80, z: 40 }, radius: 14, hull: 200, hullMax: 200,
    data: { defId: 'ship_wasp', name: 'Patrol-1', ai: { lawful: true, role: 'patrol' } },
  });
  const shuttle = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: 40, z: -20 }, radius: 14, hull: 120, hullMax: 120,
    data: {
      defId: 'ship_mule',
      name: 'Lantern Steps · Watch Launch',
      trafficRole: 'shuttle',
      ai: { civilian: true, passive: true },
    },
  });

  // The authored swing rock, released after the taught reel: this is the causal object whose
  // collateral is exempt. Merely being inside the opening is not an exemption.
  const rock = sim.spawn({
    type: 'asteroid', team: 0, pos: { x: 32, z: -20 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 20, collides: true,
    data: { onboarding: true, rescue: true, rescueRole: 'rock', typeId: 'ast_rescue_rock', throwable: true },
  });
  if (opening && !raidDone) {
    state.onboarding.rescue = {
      active: true, current: 'swing', ids: { rock: rock.id }, rockReleasedAfterReel: true,
    };
  }

  const pod = spawnJettisonedCargoPod(state, {
    pos: { x: 18, z: 0 },
    vel: { x: 0, z: 0 },
    commodityId: 'cmdty_provisions',
    amount: 1,
    ownerId: shuttle.id,
    ownerName: 'Lantern Steps · Watch Launch',
  }, sim.helpers);

  const receipts = [];
  const heatEvents = [];
  const opened = [];
  bus.on('law:reportIncidentReceipt', (p) => receipts.push(p));
  bus.on('law:incidentOpened', (p) => opened.push(p));
  bus.on('heat:changed', (p) => heatEvents.push(p));
  return { sim, state, bus, player, shuttle, rock, pod, receipts, heatEvents, opened };
}

test('opening throw beat exempts only the authored rock collision and its spilled-pod pickup from cargo-theft WANTED', () => {
  const h = bootLawAndHeat({ opening: true, raidDone: false });
  try {
    // Before the rock actually causes the spill, the same pod is still ordinary theft.
    assert.equal(chargeableLotOwnerId(h.state, h.pod), h.shuttle.id,
      'advisory owner read still prices unrelated cargo during the opening');

    // Player throws the loose opening rock; its contact with the nearby shuttle is lesson collateral.
    h.state.onboarding.rescue.rockThrowPayloadId = h.rock.id;
    h.state.onboarding.rescue.rockThrowPayloadGeneration = h.rock.occupantGeneration ?? null;
    h.bus.emit('combat:damage', {
      attackerId: h.player.id,
      targetId: h.shuttle.id,
      amount: 14,
      applied: 14,
      type: 'kinetic',
      origin: { kind: 'collision' },
      impactorId: h.rock.id,
      impactorGeneration: h.rock.occupantGeneration ?? null,
      targetHostileToPlayer: false,
    });
    assert.equal(h.state.player.heat, 0, 'opening rock collision banks no suspicion heat');
    assert.equal(Object.keys(h.state.lawSecurity.incidents || {}).length, 0,
      'opening rock collision opens no patrol intercept');

    // The rock kills/spills that same victim. Law records the victim as attributable collateral,
    // so collecting cargo spilled by that scene does not mint a theft warrant.
    h.bus.emit('entity:killed', {
      id: h.shuttle.id,
      killerId: h.player.id,
      impactorId: h.rock.id,
      impactorGeneration: h.rock.occupantGeneration ?? null,
      presentation: { cause: 'ship_collision' },
      pos: { ...h.shuttle.pos },
    });
    assert.equal(chargeableLotOwnerId(h.state, h.pod), h.shuttle.id,
      'victim identity alone does not excuse a pre-existing or unrelated pod');
    h.pod.data.openingRockCollateral = { ...h.shuttle.data.openingRockCollateral };
    assert.equal(chargeableLotOwnerId(h.state, h.pod), null,
      'advisory owner read agrees the minted rock-spilled lot is not theft');
    h.state.onboarding.beatDoneAt.raid = 29;
    assert.equal(chargeableLotOwnerId(h.state, h.pod), null,
      'the same rock-spilled lot keeps its provenance across the raid beat transition');
    delete h.state.onboarding.beatDoneAt.raid;
    h.bus.emit('tether:latched', { targetId: h.pod.id });
    h.bus.emit('pickup:collected', {
      collectorId: h.player.id,
      pickupId: h.pod.id,
      acceptedAmount: 1,
      pos: { ...h.pod.pos },
    });

    assert.equal(h.receipts.length, 0, 'no payload_theft incident is filed for rock-spilled cargo');
    assert.equal(h.heatEvents.length, 0, 'no heat:changed event fires');
    assert.equal(isPlayerWanted(h.state), false, 'player is NOT wanted after opening throw');
    assert.equal(h.state.player.heat, 0);
    assert.equal(Object.keys(h.state.lawSecurity.composed || {}).length, 0,
      'no restitution obligation is filed for the authored collateral');
    const law = h.sim.registry.get('lawSecurity');
    assert.doesNotThrow(() => law.deserialize({ openingRockCollateral: { torn: null } }),
      'a torn provenance row in an old or damaged save cannot crash the law restore');
    assert.doesNotThrow(() => chargeableLotOwnerId(h.state, h.pod),
      'the advisory owner read survives that restored ledger');
  } finally {
    h.sim.dispose();
  }

  // Same opening window, unrelated causes: a deliberate ram and ordinary theft still price.
  for (const probe of ['ram', 'theft']) {
    const x = bootLawAndHeat({ opening: true, raidDone: false });
    try {
      if (probe === 'ram') {
        x.rock.pos.x = 500; x.rock.pos.z = 500; // the lesson rock is nowhere near this contact
        x.bus.emit('entity:killed', {
          id: x.shuttle.id,
          killerId: x.player.id,
          impactorId: x.player.id,
          presentation: { cause: 'ship_collision' },
          pos: { ...x.shuttle.pos },
          type: 'ship',
          targetHostileToPlayer: false,
        });
        assert.ok(Object.keys(x.state.lawSecurity.incidents || {}).length > 0,
          'an unrelated collision kill during the opening still opens a law case');
      } else {
        x.bus.emit('pickup:collected', {
          collectorId: x.player.id,
          pickupId: x.pod.id,
          acceptedAmount: 1,
          pos: { ...x.pod.pos },
        });
        assert.equal(x.receipts.length, 1, 'unrelated cargo theft during the opening is filed');
        assert.equal(x.receipts[0].kind, 'payload_theft');
        assert.equal(isPlayerWanted(x.state), true);
      }
    } finally {
      x.sim.dispose();
    }
  }
});


test('real cargo theft outside the opening beat (and after the raid beat) still convicts and raises WANTED heat', () => {
  for (const cfg of [
    { label: 'post-opening', opening: false, raidDone: false },
    { label: 'claimed beat after raid', opening: true, raidDone: true },
  ]) {
    const h = bootLawAndHeat(cfg);
    try {
      assert.equal(chargeableLotOwnerId(h.state, h.pod), h.shuttle.id,
        `${cfg.label}: advisory read identifies the lawful cargo owner`);
      h.bus.emit('pickup:collected', {
        collectorId: h.player.id,
        pickupId: h.pod.id,
        acceptedAmount: 1,
        pos: { ...h.pod.pos },
      });

      assert.equal(h.receipts.length, 1, `${cfg.label}: law files one incident receipt`);
      assert.equal(h.receipts[0].accepted, true, `${cfg.label}: witnessed theft is accepted`);
      assert.equal(h.receipts[0].kind, 'payload_theft');
      if (h.opened.length >= 1) {
        assert.ok(Object.prototype.hasOwnProperty.call(h.opened[0], 'attackerGeneration'),
          `${cfg.label}: real lifecycle payload publishes attacker generation`);
        assert.ok(Object.prototype.hasOwnProperty.call(h.opened[0], 'victimGeneration'),
          `${cfg.label}: real lifecycle payload publishes victim generation`);
      }
      assert.equal(isPlayerWanted(h.state), true, `${cfg.label}: player becomes WANTED`);
      assert.ok(h.state.player.heat >= 0.15);
      assert.equal(h.state.player.heatLastIncident?.kind, 'payload_theft');
    } finally {
      h.sim.dispose();
    }
  }
});

test('wantedClearClause ticks down live while escaping and reports honest hold causes when not decaying', () => {
  const h = bootLawAndHeat({ opening: false });
  try {
    // Clean heat produces no clause.
    assert.equal(wantedClearClause(0, h.state), '');
    assert.equal(wantedClearClause(0.14, h.state), '');

    // Trigger real level-2 WANTED heat (0.22 -> level 2: 6s step + 5s level-1 = 11s total).
    h.bus.emit('pickup:collected', {
      collectorId: h.player.id,
      pickupId: h.pod.id,
      acceptedAmount: 1,
      pos: { ...h.pod.pos },
    });
    assert.equal(heatLevelFor(h.state.player.heat), 2);

    // 1. Inside the active search zone: MUST NOT claim 'clears in 6s'.
    assert.equal(wantedClearClause(h.state.player.heat, h.state), ' · leave search zone');
    assert.equal(
      wantedAlertText(h.state.player.heat, ' · CARGO THEFT', false, h.state),
      'WANTED · CARGO THEFT · leave search zone',
    );

    // 2. Docked while wanted: paused while docked (including Departure Check).
    h.state.ui.docked = true;
    assert.equal(wantedClearClause(h.state.player.heat, h.state), ' · paused while docked');
    const heatChip = departureReadinessChips(h.state).find((c) => c.label === 'Heat');
    assert.equal(heatChip?.text, 'WANTED · paused while docked');
    h.state.ui.docked = false;

    // 3. Off-sector search zone: held off-sector.
    h.state.world.currentSectorId = 'sector_tethys_junction';
    assert.equal(wantedClearClause(h.state.player.heat, h.state), ' · held off-sector');
    h.state.world.currentSectorId = 'sector_helios_prime';

    // 4. Impound tier (level 5) never claims a flight countdown.
    assert.equal(wantedClearClause(0.95, h.state), ' · settle at yard');

    // 5. Fly outside the active search zone and step real heat.update: countdown ticks monotonically!
    const zone = h.state.player.heatZone;
    h.player.pos.x = zone.center.x + zone.radius + 250;
    h.player.pos.z = zone.center.z;

    assert.equal(wantedClearClause(h.state.player.heat, h.state), ' · clears in 11s');
    const seen = [wantedClearClause(h.state.player.heat, h.state)];
    // Step 3 seconds outside, then briefly re-enter the search zone and confirm the hold returns.
    for (let s = 0; s < 3; s += 1) {
      h.sim.runTicks(60);
      seen.push(wantedClearClause(h.state.player.heat, h.state));
    }
    assert.ok(seen.includes(' · clears in 10s'), `expected 10s in ${JSON.stringify(seen)}`);
    assert.ok(seen.includes(' · clears in 9s'), `expected 9s in ${JSON.stringify(seen)}`);
    h.player.pos.x = zone.center.x + 100;
    h.sim.runTicks(2);
    assert.equal(wantedClearClause(h.state.player.heat, h.state), ' · leave search zone',
      're-entering the search zone immediately flips back to the honest zone hold');

    // Now escape completely and watch the full countdown tick down to clean.
    h.player.pos.x = zone.center.x + zone.radius + 250;
    const escapeSeen = [wantedClearClause(h.state.player.heat, h.state)];
    for (let s = 0; s < 11; s += 1) {
      h.sim.runTicks(60);
      escapeSeen.push(wantedClearClause(h.state.player.heat, h.state));
    }
    // Absorb 1/60 IEEE-754 float accumulation across 660 ticks.
    h.sim.runTicks(2);
    escapeSeen.push(wantedClearClause(h.state.player.heat, h.state));
    assert.ok(escapeSeen.includes(' · clears in 10s'), `expected 10s in ${JSON.stringify(escapeSeen)}`);
    assert.ok(escapeSeen.includes(' · clears in 6s'), `expected 6s in ${JSON.stringify(escapeSeen)}`);
    assert.ok(escapeSeen.includes(' · clears in 5s'), `expected 5s in ${JSON.stringify(escapeSeen)}`);
    assert.ok(escapeSeen.includes(' · clears in 1s'), `expected 1s in ${JSON.stringify(escapeSeen)}`);
    assert.equal(escapeSeen[escapeSeen.length - 1], '', 'clause clears once heat drops to clean');
    assert.equal(isPlayerWanted(h.state), false);

    // 6. R18 8-word ceiling holds on every combination.
    for (const [val, ctx] of [
      [0.22, { mode: 'flight', world: { currentSectorId: 'sector_helios_prime' }, playerPos: { x: 0, z: 0 }, zone: { active: true, center: { x: 0, z: 0 }, radius: 1700, outsideS: 0, clearAfterS: 6, sectorId: 'sector_helios_prime' } }],
      [0.22, { mode: 'flight', world: { currentSectorId: 'sector_helios_prime' }, playerPos: { x: 2000, z: 0 }, zone: { active: true, center: { x: 0, z: 0 }, radius: 1700, outsideS: 2, clearAfterS: 6, sectorId: 'sector_helios_prime' } }],
      [0.22, { docked: true }],
      [0.95, { mode: 'flight' }],
    ]) {
      const line = wantedAlertText(val, ' · CARGO THEFT', true, ctx);
      const words = line.split(/\s+/).filter((w) => w !== '·');
      assert.ok(words.length <= 8, `exceeded 8 words (${words.length}): ${line}`);
    }
  } finally {
    h.sim.dispose();
  }
});

test('law banners never mislabel the player Hitch as Hornet and stay quiet on unrelated opening NPC brawls', () => {
  const playerHitch = {
    id: 1, type: 'ship', occupantGeneration: 1,
    data: { defId: 'ship_hitch', name: 'Hitch', isPlayer: true },
  };
  const npcHornet = {
    id: 77, type: 'ship', occupantGeneration: 3,
    data: { defId: 'ship_hornet' },
  };
  const state = {
    mode: 'flight',
    simTime: 56.9,
    playerId: 1,
    ui: { docked: false },
    onboarding: { active: true, finished: false, beatDoneAt: { tether: 28 } },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    entities: new Map([[1, playerHitch], [77, npcHornet]]),
    entityList: [playerHitch, npcHornet],
  };

  // Stringified playerId / canonical player cause always reads YOU · AGGRESSOR, never Hornet.
  const playerIncident = {
    id: 'law:p1', stationId: 'station_helios', factionId: 'faction_scn',
    attackerId: '1', victimId: 99, cause: 'player_piracy',
    status: 'responding', responderIds: [10, 11, 12],
  };
  assert.equal(authorityTargetText(playerIncident, state), 'YOU · AGGRESSOR');
  const view = authorityIncidentReadout(playerIncident, state, 56.9);
  assert.equal(view.target, 'YOU · AGGRESSOR');
  assert.doesNotMatch(view.target, /Hornet/i);

  // Recycled entity id wearing a new Hornet occupant must not print 'Hornet'.
  const recycledIncident = {
    id: 'law:recycled', stationId: 'station_helios', factionId: 'faction_scn',
    attackerId: 77, attackerGeneration: 1, victimId: 99, cause: 'npc_piracy',
    status: 'responding', responderIds: [10],
  };
  assert.equal(authorityTargetText(recycledIncident, state), 'CONTACT');

  // Presenter suppresses unrelated NPC-on-NPC intercept cards during openingQuiet,
  // but shows them once the opening finishes and always shows player-involved incidents.
  const prevDoc = globalThis.document;
  const makeEl = () => ({
    id: '', className: '', hidden: false, textContent: '', innerHTML: '', dataset: {},
    style: {}, children: [], parentNode: null, attrs: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    removeAttribute(k) { delete this.attrs[k]; },
    querySelector(sel) {
      const m = sel.match(/data-k=(\w+)/);
      if (!m) return null;
      return this._slots[m[1]] || (this._slots[m[1]] = makeEl());
    },
    _slots: {},
    prepend(child) { this.children.unshift(child); child.parentNode = this; },
    appendChild(child) { this.children.push(child); child.parentNode = this; },
    remove() {},
  });
  const uiRoot = makeEl();
  const head = makeEl();
  globalThis.document = {
    documentElement: { dataset: {} },
    head,
    createElement: () => makeEl(),
    getElementById: (id) => (id === 'ui-root' ? uiRoot : null),
    querySelector: () => null,
  };
  const bus = createBus();
  try {
    const presenter = createSectorLawPresenter({ state, bus });
    const npcBrawl = {
      id: 'law:npc', stationId: 'station_helios', factionId: 'faction_scn',
      attackerId: 77, attackerGeneration: 3, victimId: 99, cause: 'npc_piracy',
      status: 'responding', responderIds: [10, 11, 12],
    };
    assert.equal(presenter.renderIncident(npcBrawl), false,
      'unrelated NPC Hornet brawl is suppressed during openingQuiet');
    assert.equal(presenter.isActive, false);

    assert.equal(presenter.renderIncident(playerIncident), true,
      'real player-aggression incident still surfaces');
    assert.equal(presenter.isActive, true);
    presenter.hide();

    state.onboarding.finished = true;
    state.onboarding.active = false;
    assert.equal(presenter.renderIncident(npcBrawl), true,
      'outside the opening, real NPC intercepts still render');
    presenter.destroy();
  } finally {
    globalThis.document = prevDoc;
  }
});

test('Vael Instrument chatter, patrols, clauses, and debtors stay silent in Helios Prime during Act I opening', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [vaelLiens] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.onboarding = { active: false, finished: true, finishedAt: 0 };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 39,
    hull: 140, hullMax: 140, collides: true, data: { defId: 'ship_hitch', name: 'Hitch' },
  });
  state.playerId = player.id;

  const readings = [];
  const clauses = [];
  const patrols = [];
  const debtors = [];
  const logs = [];
  bus.on('vael:reading', (p) => readings.push(p));
  bus.on('vael:clausePosted', (p) => clauses.push(p));
  bus.on('vael:patrolPosted', (p) => patrols.push(p));
  bus.on('vael:debtorPosted', (p) => debtors.push(p));
  bus.on('comms:log', (p) => logs.push(p));

  try {
    // Advance well past firstPatrolS (20), firstClauseS (26), and firstDebtorS (80).
    sim.step();
    const visit = ensureVaelState(state).visits.sector_helios_prime;
    visit.nextPatrolAt = 0;
    visit.nextClauseAt = 0;
    visit.nextDebtorAt = 0;
    state.simTime = 120;
    sim.runTicks(30);

    assert.equal(patrols.length, 0, 'no Vael patrol spawns in Helios Prime');
    assert.equal(clauses.length, 0, 'no Vael clause spawns in Helios Prime');
    assert.equal(debtors.length, 0, 'no Vael debtor spawns in Helios Prime');
    assert.equal(readings.length, 0, 'no VAEL INSTRUMENT hull reading fires in Helios Prime');
    assert.equal(logs.length, 0, 'no Vael chatter logs in Helios Prime');

    // Moving to Vael home space after opening resumes normal Vael activity.
    state.world.currentSectorId = 'sector_veil_nebula';
    state.simTime = 500;
    sim.step();
    const homeVisit = ensureVaelState(state).visits.sector_veil_nebula;
    homeVisit.nextPatrolAt = state.simTime;
    homeVisit.nextClauseAt = state.simTime;
    sim.runTicks(6);
    assert.ok(patrols.length >= 1, 'Vael patrols still spawn in Vael home space');
    assert.ok(clauses.length >= 1, 'Vael clauses still post in Vael home space');
    assert.ok(VAEL_LEDGER.firstClauseS > 0);

    // Settled non-home sectors keep the desk-work eligibility the opening only hushes. The
    // quiet window did not consume Helios' due clocks, and Tethys posts without needing an
    // authored Vael hull to manufacture presence.
    assert.ok(visit.nextClauseAt <= 120, `quiet window consumed clause clock: ${visit.nextClauseAt}`);
    assert.ok(visit.nextDebtorAt <= 120, `quiet window consumed debtor clock: ${visit.nextDebtorAt}`);
    state.world.currentSectorId = 'sector_tethys_junction';
    state.onboarding.finishedAt = 0;
    state.simTime = 500;
    sim.step();
    const tethys = ensureVaelState(state).visits.sector_tethys_junction;
    tethys.nextClauseAt = state.simTime;
    tethys.nextDebtorAt = state.simTime;
    const clausesBeforeTethys = clauses.length;
    const debtorsBeforeTethys = debtors.length;
    sim.runTicks(6);
    assert.ok(clauses.length > clausesBeforeTethys, 'settled non-home Tethys still posts Vael clauses');
    assert.ok(debtors.length > debtorsBeforeTethys, 'settled non-home Tethys still posts Vael debtors');
  } finally {
    sim.dispose();
  }
});

test('Act I Helios opening suppresses giant dock and cold-start bulkhead graffiti while keeping cold-start comms and B1+ graffiti', () => {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 50;
  state.world.currentSectorId = 'sector_helios_prime';
  state.onboarding = { active: true, finished: false };
  state.settings.gameplay.tutorialHints = true;

  const bus = createBus();
  const graffiti = [];
  const comms = [];
  bus.on('graffiti:show', (p) => graffiti.push(p));
  bus.on('comms:popup', (p) => comms.push(p));

  const story = Object.assign({}, storyProto);
  story.init({
    state,
    bus,
    registry: { get: () => null },
    helpers: { voice: { say: () => true } },
  });
  bus.emit('game:started', {});

  // Opening dock at Helios Station in beat 0 emits no giant dock graffiti.
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(graffiti.length, 0, 'no B0 Helios opening dock graffiti');

  // Tutorial finishes on first job acceptance: COLD_START comms still fire, giant bulkhead graffiti does not.
  state.onboarding = { active: false, finished: true, finishedAt: state.simTime };
  bus.emit('tutorial:finished', {});
  assert.ok(comms.some((c) => c.id === 'cold_friend'), 'cold-start friend comms still arrive');
  assert.equal(
    graffiti.some((g) => g.line === GRAFFITI.GANG_DIDNT_MAKE_IT),
    false,
    'GANG_DIDNT_MAKE_IT bulkhead graffiti is suppressed during Act I Helios opening',
  );

  // Later beats (beat 1+) still show their authored graffiti normally.
  state.story.beatIndex = 1;
  bus.emit('story:beatAdvanced', { fromIndex: 0, toIndex: 1 });
  assert.ok(
    graffiti.some((g) => g.line === GRAFFITI.THEY_KNEW_THE_MASS),
    'post-B0 story graffiti continues to fire normally',
  );
});

test('opening cross-sector tracker and jump-route toast consistently use M · Chart instead of N Star Map', () => {
  setPromptDevice('kbm');
  const state = createGameState(4242);
  state.world.currentSectorId = 'sector_helios_prime';
  state.simTime = 100;
  state.entities.set(1, { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  state.playerId = 1;
  state.ui.trackedMissionId = 'm_2';
  state.missions.active = [{
    id: 'm_2',
    status: 'active',
    title: 'First trade: 8u Fuel Cells to Tethys',
    deadline_s: 1288,
  }];
  state.nav.waypoint = {
    kind: 'mission',
    missionId: 'm_2',
    sectorId: 'sector_tethys_junction',
    label: 'Tethys Trade Hub',
    reason: 'Deliver 8u Fuel Cells to Tethys Trade Hub',
  };
  state.nav.route = {
    legs: [{ from: 'sector_helios_prime', to: 'sector_tethys_junction', fuel: 8 }],
    totalHops: 1,
    totalFuel: 8,
  };

  const dest = flightDestinationSurface(state, resolveFlightObjectiveCommand(state));
  assert.match(dest.line, /Next jump: Tethys Junction/);
  assert.match(dest.line, /M · Chart/);
  assert.doesNotMatch(dest.line, /N Star Map|Star Map/);

  const bus = createBus();
  const toasts = [];
  bus.on('toast', (p) => toasts.push(p));
  const toastLine = speakPlottedRouteTeach(state, bus);
  assert.equal(toastLine, 'Open the Chart [ M ] to jump.');
  assert.doesNotMatch(toastLine, /Star Map|\[ N \]/);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, 'Open the Chart [ M ] to jump.');
});
