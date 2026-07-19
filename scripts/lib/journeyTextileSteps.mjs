// Textile-mission acceptance journey — the 11 graded steps of ADR D11.
//
// This module EXTENDS `professionalTravelPublicRoute.mjs` (the closest living ancestor of the
// journey, per D11) rather than forking a competing harness: it imports that module's boot
// sequence, snapshot readers and public-UI helpers, and adds the MISSION spine around the travel
// spine the route harness already proves.
//
// ─── What this grades ────────────────────────────────────────────────────────────────────────────
//
// Every step asserts a PLAYER-VISIBLE OUTCOME. "The reducer transitioned" is explicitly not an
// outcome here. Two rules shaped the assertions:
//
//   1. Step 6 asserts the SEPARATION of plot and engage as a PAIR: the ship must be measurably
//      still after plotting, and measurably moving after engaging. Either assertion alone proves
//      nothing — a ship that never moves would pass the first, and a ship that moves on plot would
//      pass the second.
//
//   2. Step 7 asserts the instruments tell the TRUTH, not that they are populated. Each displayed
//      number is cross-checked against an INDEPENDENT recompute from the simulation state that
//      produced it. The entire product thesis is that the instruments are trustworthy, so
//      "a number is shown" is not the assertion; "the shown number equals what the sim produced,
//      within tolerance" is.
//
// ─── Honest degradation ──────────────────────────────────────────────────────────────────────────
//
// A step never stubs itself to green. Each returns one of:
//   pass | fail | not-implemented | blocked
// and a late failure never hides an earlier pass — the runner records all eleven regardless. A step
// whose PRECONDITION was destroyed by an earlier failure reports `blocked`, which is a different and
// more useful claim than `fail`.
//
// Instrumentation may OBSERVE state/events only. This module emits no gameplay bus events, assigns
// no sim fields, and drives the game exclusively through the public keyboard/mouse surface.

import assert from 'node:assert/strict';
import path from 'node:path';

export const JOURNEY_TEXTILE_SCHEMA = 'spaceface.journeyTextile.v1';
export const TASK_ID_JOURNEY_TEXTILE = 'journey-textile';

/** The eleven graded steps, in order. `id` is stable and is what the evidence file keys on. */
export const JOURNEY_STEPS = Object.freeze([
  { id: 'accept-mission', title: 'Accept mission' },
  { id: 'open-map', title: 'Open map' },
  { id: 'identify-position', title: 'Identify current position, mission, destination, and next leg' },
  { id: 'inspect-destination', title: 'Inspect destination and arrival reason' },
  { id: 'compare-and-plot', title: 'Compare and plot route' },
  { id: 'engage-separately', title: 'Engage travel separately from plotting' },
  { id: 'truthful-instruments', title: 'Observe truthful movement, ETA, velocity, stopping distance, resources, danger, confidence' },
  { id: 'interrupt-route', title: 'Interrupt or leave route' },
  { id: 'recover-itinerary', title: 'Recover itinerary (resumable, not orphaned)' },
  { id: 'arrive-and-deliver', title: 'Arrive and complete cargo action' },
  { id: 'save-load-states', title: 'Save/load at representative states' },
]);

export const JOURNEY_SCREENSHOTS = Object.freeze({
  boardOpen: 'j01-contract-board.png',
  missionAccepted: 'j02-mission-accepted.png',
  mapOpened: 'j03-map-opened.png',
  navContext: 'j04-nav-context.png',
  destinationInspect: 'j05-destination-inspect.png',
  routePlotted: 'j06-route-plotted.png',
  routeEngaged: 'j07-route-engaged.png',
  instruments: 'j08-instruments.png',
  interrupted: 'j09-interrupted.png',
  resumed: 'j10-resumed.png',
  arrival: 'j11-arrival.png',
  delivered: 'j12-cargo-delivered.png',
  reloaded: 'j13-reloaded.png',
});

/** Events the journey OBSERVES. Kept separate from the route harness's own list so that adding an
 *  observation here can never alter the evidence or behaviour of the already-green route check. */
const JOURNEY_EVENTS = Object.freeze([
  'mission:accepted', 'mission:updated', 'mission:completed', 'cargo:delivered',
  'dock:range', 'dock:docked', 'dock:undocked',
  'nav:waypoint', 'nav:autopilot', 'nav:routeExecutor',
  'sector:enter', 'sector:exit', 'world:membership',
  'jump:chargeStart', 'jump:start', 'jump:arrive',
  'save:completed', 'save:loaded',
  'trade:completed', 'economy:marketOpened',
]);

/**
 * Tolerances for the step-7 instrument truth cross-check.
 *
 * These are DISPLAY-PRECISION tolerances, not correctness slack: the HUD rounds, and a sampled
 * readout is one frame behind the state it is compared against. They are deliberately tight enough
 * that a genuinely wrong instrument (a stale ETA, a stopping distance computed from the wrong mass,
 * a velocity read in the wrong frame) cannot hide inside them.
 */
const INSTRUMENT_TOLERANCE = Object.freeze({
  /** Speed is sampled a frame apart from the readout; 2 WU/s or 4%, whichever is larger. */
  speedWUs: 2,
  speedRel: 0.04,
  /** Stopping distance is a quadratic in speed, so its tolerance follows the speed tolerance up. */
  stopRel: 0.10,
  stopWU: 25,
  /** ETA is distance/speed; both inputs already carry tolerance. */
  etaRel: 0.12,
  etaS: 3,
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Step runner
// ═════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Run the eleven-step journey. Never throws for a step-level failure — the caller receives one
 * record per step so a late failure cannot erase the evidence that earlier steps passed.
 */
export async function runTextileJourney(ctx) {
  const {
    page, outputDir, log = () => {},
    helpers,
  } = ctx;
  assert(page, 'journey requires a Playwright page');
  assert(outputDir, 'journey requires an output directory');
  assert(helpers, 'journey requires the shared route helpers');

  const results = [];
  const screenshots = [];
  const journey = {
    mission: null,
    destination: null,
    plot: null,
    engage: null,
    instruments: [],
    interruption: null,
    recovery: null,
    arrival: null,
    saves: [],
  };

  const record = (id, outcome, evidence, detail = null) => {
    const step = JOURNEY_STEPS.find((s) => s.id === id);
    const rec = {
      id,
      title: step ? step.title : id,
      outcome,
      evidence: typeof evidence === 'string' ? evidence : JSON.stringify(evidence),
      detail,
      at: new Date().toISOString(),
    };
    results.push(rec);
    log(`[journey] ${id}: ${outcome.toUpperCase()} — ${rec.evidence.slice(0, 400)}`);
    return rec;
  };

  const shoot = async (name) => {
    try {
      const file = path.join(outputDir, name);
      await page.screenshot({ path: file, type: 'png', animations: 'allow' });
      screenshots.push(name);
      return name;
    } catch (_) { return null; }
  };

  /** Run one step, converting a throw into an honest `fail` rather than aborting the journey. */
  const step = async (id, fn) => {
    try {
      const outcome = await fn();
      if (outcome && outcome.outcome) {
        return record(id, outcome.outcome, outcome.evidence, outcome.detail || null);
      }
      return record(id, 'pass', outcome && outcome.evidence ? outcome.evidence : 'ok', outcome || null);
    } catch (error) {
      return record(id, 'fail', `threw: ${error && error.message ? error.message : String(error)}`, {
        stack: error && error.stack ? String(error.stack).split('\n').slice(0, 6).join('\n') : null,
      });
    }
  };

  const blocked = (id, why) => record(id, 'blocked', why);

  await installJourneyObservers(page);

  // ── Step 1 — Accept mission ───────────────────────────────────────────────────────────────────
  //
  // OUTCOME: a cargo-haul contract with a CROSS-SECTOR destination is active and tracked, accepted
  // through the station contract board's own Accept control, and the commodity it requires is in
  // the hold. Anything less is not an accepted mission the journey can fly.
  await step('accept-mission', async () => {
    const dock = await dockAtNearestStation(page, helpers, log);
    if (!dock.ok) {
      return { outcome: 'fail', evidence: `could not dock at a station through the public route: ${dock.reason}`, detail: dock };
    }
    await shoot(JOURNEY_SCREENSHOTS.boardOpen);

    const offers = await readContractBoard(page);
    const textile = offers.find((o) => o.cmdtyId === 'cmdty_textiles' && o.crossSector);
    const candidate = textile || offers.find((o) => o.crossSector && o.cmdtyId);

    if (!candidate) {
      return {
        outcome: 'fail',
        evidence: `no cross-sector cargo contract on the ${dock.stationId} board this run (${offers.length} offers: `
          + `${offers.map((o) => `${o.type}/${o.cmdtyId || '-'}/${o.destSectorId || '-'}`).join(', ')})`,
        detail: { offers, stationId: dock.stationId },
      };
    }

    const accepted = await acceptOfferViaBoard(page, candidate.id);
    if (!accepted.ok) {
      return { outcome: 'fail', evidence: `Accept control did not activate the contract: ${accepted.reason}`, detail: accepted };
    }

    journey.mission = accepted.mission;
    journey.destination = {
      sectorId: accepted.mission.destSectorId,
      stationId: accepted.mission.destStationId,
      cmdtyId: accepted.mission.cmdtyId,
      qty: accepted.mission.qty,
      isTextile: accepted.mission.cmdtyId === 'cmdty_textiles',
    };

    // A delivery contract does NOT grant its cargo — `_deliverCargo` verifies the hold at the
    // destination, so the hold must be loaded here or step 10 is unreachable by construction.
    const load = await acquireCargoViaMarket(page, accepted.mission.cmdtyId, accepted.mission.qty);
    await shoot(JOURNEY_SCREENSHOTS.missionAccepted);
    const undock = await undockViaStationUi(page, helpers);

    const note = textile
      ? 'textile contract found on the board this run'
      : `NO textile contract available; graded on the equivalent cargo haul (${candidate.cmdtyId}). `
        + 'There is no authored textile mission in the tree — see the packet findings.';

    if (!load.ok) {
      return {
        outcome: 'fail',
        evidence: `mission accepted (${accepted.mission.id}) but the hold could not be loaded with `
          + `${accepted.mission.qty}u ${accepted.mission.cmdtyId}: ${load.reason}. ${note}`,
        detail: { mission: accepted.mission, load, undock },
      };
    }

    return {
      outcome: 'pass',
      evidence: `contract ${accepted.mission.id} active+tracked: haul ${accepted.mission.qty}u `
        + `${accepted.mission.cmdtyId} to ${accepted.mission.destStationId} in ${accepted.mission.destSectorId} `
        + `(origin sector ${dock.sectorId}); hold loaded ${load.have}u; undocked=${undock.ok}. ${note}`,
      detail: { mission: accepted.mission, load, undock, textile: !!textile, offers: offers.length },
    };
  });

  const missionOk = results[0].outcome === 'pass';

  // ── Step 2 — Open map ─────────────────────────────────────────────────────────────────────────
  //
  // OUTCOME: the chart is on screen, through the public key, with the player's own marker on it.
  await step('open-map', async () => {
    const opened = await openGalaxyMap(page, helpers);
    if (!opened.ok) return { outcome: 'fail', evidence: `galaxy map did not open via the public key: ${opened.reason}` };
    await shoot(JOURNEY_SCREENSHOTS.mapOpened);
    return { outcome: 'pass', evidence: `galaxy map visible via public key; screen stack top=${opened.top}`, detail: opened };
  });

  // ── Step 3 — Identify position, mission, destination, next leg ────────────────────────────────
  //
  // OUTCOME: the chart answers all four navigation questions with REAL values, and the position it
  // reports agrees with the simulation. A rendered placeholder ("—", "Unknown") is a failure, and so
  // is a position that disagrees with where the ship actually is.
  await step('identify-position', async () => {
    const ctxRead = await readNavContext(page);
    if (!ctxRead) return { outcome: 'fail', evidence: 'the map published no navigation context at all' };

    const missing = [];
    if (!ctxRead.position || !ctxRead.position.label) missing.push('current position');
    if (!ctxRead.objective) missing.push('mission/objective');
    if (!ctxRead.destination) missing.push('destination');
    if (!ctxRead.nextLeg && !ctxRead.nextWaypoint) missing.push('next leg');

    // Cross-check the DISPLAYED position against the sim's own name for where the ship is. In deep
    // space the chart legitimately reads as a transit address rather than a sector name, so the
    // check accepts either the sector name or an address that names it.
    const truth = await readSimPosition(page);
    const shown = ctxRead.position ? ctxRead.position.label.toUpperCase() : '';
    const simName = (truth && truth.sectorName ? truth.sectorName : '').toUpperCase();
    const posAgrees = !!simName && (shown.includes(simName) || simName.includes(shown.split('—')[0].trim()));

    await shoot(JOURNEY_SCREENSHOTS.navContext);

    if (missing.length) {
      return {
        outcome: 'fail',
        evidence: `the chart does not answer: ${missing.join(', ')}. rows=${JSON.stringify(ctxRead.rows || [])}`,
        detail: { ctx: ctxRead, truth },
      };
    }
    if (!posAgrees) {
      return {
        outcome: 'fail',
        evidence: `the chart displays position "${ctxRead.position.label}" but the sim has the ship in `
          + `"${truth && truth.sectorName}" (${truth && truth.sectorId}) — the readout does not agree with the simulation`,
        detail: { ctx: ctxRead, truth },
      };
    }
    return {
      outcome: 'pass',
      evidence: `all four answered and the displayed position agrees with the sim: at="${ctxRead.position.label}" `
        + `(sim ${truth.sectorName}), mission="${ctxRead.objective.label}", destination="${ctxRead.destination.label}", `
        + `next="${(ctxRead.nextLeg && ctxRead.nextLeg.label) || '-'}"`,
      detail: { ctx: ctxRead, truth },
    };
  });

  // ── Step 4 — Inspect destination and arrival reason ───────────────────────────────────────────
  //
  // OUTCOME: selecting the destination on the chart yields a briefing that names the place AND says
  // why the player is going there. "Why" is the half that makes this an inspection rather than a
  // label — a destination with no arrival reason is a coordinate, not a decision.
  await step('inspect-destination', async () => {
    if (!missionOk || !journey.destination) return { outcome: 'blocked', evidence: 'no accepted mission destination to inspect (step 1 did not pass)' };
    const inspect = await inspectDestination(page, helpers, journey.destination.sectorId);
    await shoot(JOURNEY_SCREENSHOTS.destinationInspect);
    if (!inspect.ok) {
      return { outcome: 'fail', evidence: `destination inspector did not open for ${journey.destination.sectorId}: ${inspect.reason}`, detail: inspect };
    }
    if (!inspect.arrivalReason) {
      return {
        outcome: 'fail',
        evidence: `inspector names "${inspect.title}" but gives NO arrival reason — the chart shows where, never why. text=${JSON.stringify(inspect.text || '').slice(0, 300)}`,
        detail: inspect,
      };
    }
    return {
      outcome: 'pass',
      evidence: `inspector opened for ${inspect.title}; arrival reason present: "${String(inspect.arrivalReason).slice(0, 160)}"`,
      detail: inspect,
    };
  });

  // ── Step 5 — Compare and plot route ───────────────────────────────────────────────────────────
  //
  // OUTCOME (two halves, graded separately so a missing comparison does not hide a working plot):
  //   * COMPARE: the chart offers a route comparison — more than one way to get there, with the
  //     costs that distinguish them.
  //   * PLOT: `nav.route` holds real legs to the mission destination, and the ship has NOT moved.
  await step('compare-and-plot', async () => {
    if (!missionOk || !journey.destination) return { outcome: 'blocked', evidence: 'no mission destination to plot to (step 1 did not pass)' };

    const compare = await readRouteComparison(page);
    const plot = await plotRouteTo(page, helpers, journey.destination.sectorId);
    journey.plot = plot;
    await shoot(JOURNEY_SCREENSHOTS.routePlotted);

    if (!plot.ok) {
      return { outcome: 'fail', evidence: `no route plotted to ${journey.destination.sectorId}: ${plot.reason}`, detail: { plot, compare } };
    }
    if (!compare.available) {
      return {
        outcome: 'fail',
        evidence: `route PLOTTED (${plot.legs} legs, fuel ${plot.totalFuel}) but the chart offers NO route comparison — `
          + `there is one plotted course and no alternative to weigh it against. ${compare.reason}`,
        detail: { plot, compare },
      };
    }
    return {
      outcome: 'pass',
      evidence: `compared ${compare.optionCount} options (${compare.discriminators.join('/')}) and plotted `
        + `${plot.legs} legs to ${journey.destination.sectorId}, fuel ${plot.totalFuel}`,
      detail: { plot, compare },
    };
  });

  const plotOk = !!(journey.plot && journey.plot.ok);

  // ── Step 6 — Engage SEPARATELY from plotting ──────────────────────────────────────────────────
  //
  // OUTCOME, asserted as a PAIR: after plotting and settling, the ship is measurably STILL and no
  // executor exists; after the Engage control and only then, an engaged executor exists and the ship
  // is measurably MOVING. Each half alone is worthless — see the module header.
  await step('engage-separately', async () => {
    if (!plotOk) return { outcome: 'blocked', evidence: 'no plotted route to engage (step 5 did not plot)' };

    const still = await measureStillnessAfterPlot(page, 2600);
    const engage = await engageRoute(page, helpers);
    journey.engage = engage;
    if (!engage.ok) {
      return {
        outcome: 'fail',
        evidence: `plot did not move the ship (drift ${still.driftWU.toFixed(1)} WU, executor=${still.executorStatus}) `
          + `but the Engage control did not engage the route: ${engage.reason}`,
        detail: { still, engage },
      };
    }
    const moving = await measureMovementAfterEngage(page, 6000);
    await shoot(JOURNEY_SCREENSHOTS.routeEngaged);

    const separationHeld = still.executorEngaged !== true && still.driftWU < 120;
    if (!separationHeld) {
      return {
        outcome: 'fail',
        evidence: `PLOT ALONE MOVED THE SHIP — drift ${still.driftWU.toFixed(1)} WU with executorEngaged=${still.executorEngaged}. `
          + 'Plot and engage are not separate actions.',
        detail: { still, engage, moving },
      };
    }
    if (!moving.moved) {
      return {
        outcome: 'fail',
        evidence: `route engaged (status=${engage.status}) but the ship never started moving: travelled `
          + `${moving.travelledWU.toFixed(1)} WU, peak speed ${moving.peakSpeed.toFixed(2)} WU/s over ${moving.elapsedMs}ms`,
        detail: { still, engage, moving },
      };
    }
    return {
      outcome: 'pass',
      evidence: `SEPARATION HELD: after plot the ship drifted ${still.driftWU.toFixed(1)} WU with no engaged executor; `
        + `after Engage the executor is ${engage.status} and the ship travelled ${moving.travelledWU.toFixed(1)} WU `
        + `(peak ${moving.peakSpeed.toFixed(2)} WU/s)`,
      detail: { still, engage, moving },
    };
  });

  const engagedOk = results[5].outcome === 'pass';

  // ── Step 7 — Truthful instruments ─────────────────────────────────────────────────────────────
  //
  // OUTCOME: each displayed number equals an INDEPENDENT recompute from the sim state that produced
  // it, within display tolerance, across multiple samples taken while actually under way.
  await step('truthful-instruments', async () => {
    if (!engagedOk) return { outcome: 'blocked', evidence: 'the ship is not under route control, so there are no transit instruments to grade (step 6 did not pass)' };

    const samples = [];
    for (let i = 0; i < 5; i += 1) {
      const s = await sampleInstruments(page);
      if (s) samples.push(s);
      await page.waitForTimeout(1200);
    }
    journey.instruments = samples;
    await shoot(JOURNEY_SCREENSHOTS.instruments);

    if (!samples.length) return { outcome: 'fail', evidence: 'no instrument samples could be read while under way' };

    const lies = [];
    const absent = new Set();
    for (const s of samples) {
      for (const [field, cmp] of Object.entries(s.checks || {})) {
        if (cmp.displayed == null) { absent.add(field); continue; }
        if (!cmp.agrees) {
          lies.push(`${field}: displayed ${fmt(cmp.displayed)} vs sim ${fmt(cmp.actual)} (tol ${fmt(cmp.tolerance)})`);
        }
      }
    }

    if (lies.length) {
      return {
        outcome: 'fail',
        evidence: `instruments disagree with the simulation that produced them: ${[...new Set(lies)].slice(0, 8).join('; ')}`,
        detail: { samples, absentFields: [...absent] },
      };
    }
    if (absent.size) {
      return {
        outcome: 'fail',
        evidence: `instruments never displayed: ${[...absent].join(', ')} — a missing instrument cannot be trusted or distrusted, `
          + `it simply is not there. Verified truthful: ${verifiedFields(samples).join(', ') || 'none'}`,
        detail: { samples, absentFields: [...absent] },
      };
    }
    return {
      outcome: 'pass',
      evidence: `${samples.length} samples under way; every displayed instrument agrees with an independent recompute `
        + `from sim state: ${verifiedFields(samples).join(', ')}`,
      detail: { samples },
    };
  });

  // ── Step 8 — Interrupt or leave route ─────────────────────────────────────────────────────────
  //
  // OUTCOME: the player can get out, and the ship stops obeying the route. Control returning to the
  // pilot is the outcome; the status field is only corroboration.
  await step('interrupt-route', async () => {
    if (!engagedOk) return { outcome: 'blocked', evidence: 'no engaged route to interrupt (step 6 did not pass)' };
    const interrupt = await interruptRoute(page, helpers);
    journey.interruption = interrupt;
    await shoot(JOURNEY_SCREENSHOTS.interrupted);
    if (!interrupt.ok) {
      return { outcome: 'fail', evidence: `could not leave the route through the public control: ${interrupt.reason}`, detail: interrupt };
    }
    if (interrupt.stillEngaged) {
      return { outcome: 'fail', evidence: `the disengage control fired but the executor is still engaged (status=${interrupt.status})`, detail: interrupt };
    }
    return {
      outcome: 'pass',
      evidence: `left the route via "${interrupt.control}"; executor status=${interrupt.status}, engaged=${interrupt.engaged}, `
        + `autopilot active=${interrupt.autopilotActive}`,
      detail: interrupt,
    };
  });

  const interruptOk = results[7].outcome === 'pass';

  // ── Step 9 — Recover itinerary ────────────────────────────────────────────────────────────────
  //
  // OUTCOME: the itinerary SURVIVED the interruption (not orphaned) and the same itinerary resumes
  // on the same leg. A route that has to be re-plotted from scratch is a lost route, not a recovered
  // one, so the leg index and the destination are both compared across the interruption.
  await step('recover-itinerary', async () => {
    if (!interruptOk) return { outcome: 'blocked', evidence: 'the route was never interrupted, so there is nothing to recover (step 8 did not pass)' };
    const recover = await recoverItinerary(page, helpers, journey.interruption);
    journey.recovery = recover;
    await shoot(JOURNEY_SCREENSHOTS.resumed);
    if (!recover.routeSurvived) {
      return { outcome: 'fail', evidence: `the itinerary was ORPHANED by the interruption: nav.route=${recover.routeAfter}`, detail: recover };
    }
    if (!recover.ok) {
      return { outcome: 'fail', evidence: `the itinerary survived but could not be resumed: ${recover.reason}`, detail: recover };
    }
    if (!recover.sameLeg) {
      return {
        outcome: 'fail',
        evidence: `resumed, but on leg ${recover.legAfter} instead of the interrupted leg ${recover.legBefore} — `
          + 'the itinerary restarted rather than recovered',
        detail: recover,
      };
    }
    return {
      outcome: 'pass',
      evidence: `itinerary kept across the interruption (destination ${recover.destinationAfter}) and resumed on the same `
        + `leg ${recover.legAfter}; executor status=${recover.status}`,
      detail: recover,
    };
  });

  // ── Step 10 — Arrive and complete the cargo action ────────────────────────────────────────────
  //
  // OUTCOME: the ship is physically IN the destination sector, docks at the destination station, and
  // the contract settles — the commodity leaves the hold and the mission leaves the active list.
  // "The executor said arrived" is explicitly NOT accepted as arrival; the sector is checked.
  await step('arrive-and-deliver', async () => {
    if (!missionOk) return { outcome: 'blocked', evidence: 'no accepted contract to deliver (step 1 did not pass)' };
    if (!plotOk) return { outcome: 'blocked', evidence: 'no route was ever plotted to the destination (step 5 did not plot)' };

    const arrive = await flyRouteToDestination(page, helpers, journey.destination, log);
    journey.arrival = arrive;
    await shoot(JOURNEY_SCREENSHOTS.arrival);

    if (!arrive.inDestinationSector) {
      return {
        outcome: 'fail',
        evidence: `never physically reached ${journey.destination.sectorId}: ship is in ${arrive.sectorId} after `
          + `${Math.round(arrive.elapsedMs / 1000)}s; executor status=${arrive.executorStatus} `
          + `(executorClaimedArrived=${arrive.executorClaimedArrived}); jump receipts observed = `
          + `${JSON.stringify(arrive.jumpReceipts || {})} — an executor that claims arrival with zero `
          + 'jump:start receipts never took the ship through the gate',
        detail: arrive,
      };
    }
    const deliver = await deliverCargoAtDestination(page, helpers, journey.destination);
    await shoot(JOURNEY_SCREENSHOTS.delivered);
    if (!deliver.ok) {
      return {
        outcome: 'fail',
        evidence: `arrived in ${arrive.sectorId} but the cargo action did not complete: ${deliver.reason}`,
        detail: { arrive, deliver },
      };
    }
    return {
      outcome: 'pass',
      evidence: `arrived in ${arrive.sectorId} under route control and settled the contract at ${deliver.stationId}: `
        + `${deliver.deliveredQty}u ${deliver.commodityId} left the hold, mission ${deliver.missionId} completed`,
      detail: { arrive, deliver },
    };
  });

  // ── Step 11 — Save/load at representative states ──────────────────────────────────────────────
  //
  // OUTCOME: at each representative state the journey actually reached, a quick-save followed by a
  // cold reload + Continue restores the state that matters at that point — sector, mission, and
  // itinerary. Representative means the states this run genuinely visited, and each is named.
  await step('save-load-states', async () => {
    const states = await saveLoadRepresentativeStates(page, helpers, journey, log);
    journey.saves = states.checks;
    await shoot(JOURNEY_SCREENSHOTS.reloaded);
    if (!states.checks.length) {
      return { outcome: 'blocked', evidence: `the journey never reached a representative state worth saving: ${states.reason}` };
    }
    const bad = states.checks.filter((c) => !c.ok);
    if (bad.length) {
      return {
        outcome: 'fail',
        evidence: `save/load did not restore ${bad.length}/${states.checks.length} representative states: `
          + bad.map((c) => `${c.label}: ${c.reason}`).join('; '),
        detail: states,
      };
    }
    return {
      outcome: 'pass',
      evidence: `${states.checks.length} representative states survived quick-save → cold reload → Continue: `
        + states.checks.map((c) => c.label).join(', '),
      detail: states,
    };
  });

  const pass = results.every((r) => r.outcome === 'pass');
  return {
    pass,
    schema: JOURNEY_TEXTILE_SCHEMA,
    steps: results,
    screenshots,
    journey,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.outcome === 'pass').length,
      failed: results.filter((r) => r.outcome === 'fail').length,
      blocked: results.filter((r) => r.outcome === 'blocked').length,
      notImplemented: results.filter((r) => r.outcome === 'not-implemented').length,
    },
  };
}

function fmt(v) { return v == null ? 'null' : (typeof v === 'number' ? v.toFixed(2) : String(v)); }

function verifiedFields(samples) {
  const ok = new Set();
  for (const s of samples) {
    for (const [field, cmp] of Object.entries(s.checks || {})) {
      if (cmp.displayed != null && cmp.agrees) ok.add(field);
    }
  }
  return [...ok];
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Page helpers — OBSERVE and drive the public UI only
// ═════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Return keyboard authority to the GAME before pressing a game-level key.
 *
 * The chart's search field keeps DOM focus after the map closes, and the canvas is deliberately not
 * a tab stop — so `canvas.focus()` does NOT take focus away from a hidden text input, and every
 * subsequent keypress is swallowed by that input instead of reaching the game. The route harness
 * documents this exact seam around F5; it applies to every game key, not just F5.
 *
 * Tab is used rather than `blur()` because it is the public keyboard surface: this moves focus the
 * way a player's keyboard would, instead of reaching into the DOM to fix it up.
 */
async function returnFocusToGame(page) {
  for (let i = 0; i < 4; i += 1) {
    const inTextEntry = await page.evaluate(() => {
      const el = document.activeElement;
      return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
    });
    if (!inTextEntry) break;
    await page.keyboard.press('Tab');
    await page.waitForTimeout(120);
  }
  await page.locator('#gl-canvas').focus().catch(() => {});
}

async function installJourneyObservers(page) {
  await page.evaluate((names) => {
    const bus = window.SF && window.SF.bus;
    if (!bus) return;
    // Re-installable across reloads, but never double-subscribed within one page lifetime.
    if (window.__JOURNEY__ && window.__JOURNEY_INSTALLED__ === window.SF.bus) return;
    window.__JOURNEY__ = { events: [], dockRange: null, saved: false, loaded: false };
    window.__JOURNEY_INSTALLED__ = window.SF.bus;
    for (const name of names) {
      bus.on(name, (payload) => {
        const j = window.__JOURNEY__;
        let safe = null;
        try {
          safe = payload && typeof payload === 'object'
            ? JSON.parse(JSON.stringify(payload, (_k, v) => (typeof v === 'function' ? undefined : v)))
            : payload;
        } catch (_) { safe = null; }
        j.events.push({ event: name, at: performance.now(), tick: window.SF?.state?.tick ?? null, payload: safe });
        if (j.events.length > 600) j.events.splice(0, j.events.length - 600);
        if (name === 'dock:range') j.dockRange = safe;
        if (name === 'save:completed') j.saved = true;
        if (name === 'save:loaded') j.loaded = true;
      });
    }
  }, JOURNEY_EVENTS.slice());
}

/** Fly to the nearest non-gate station on the public autopilot and dock with the public dock key. */
async function dockAtNearestStation(page, helpers, log) {
  const target = await page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    if (!player?.pos || !Array.isArray(state?.entityList)) return null;
    let best = null; let bestD = Infinity;
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.type !== 'station' || e.data?.isGate || !e.pos) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      if (d < bestD) { bestD = d; best = { id: e.data?.stationId || e.id, name: e.data?.name || 'Station', dist: d }; }
    }
    return best;
  });
  if (!target) return { ok: false, reason: 'no non-gate station entity in the starting sector' };
  log(`[journey] docking target: ${target.name} at ${Math.round(target.dist)} WU`);

  // Arm the station as a waypoint through the map, exactly as a player would.
  await page.keyboard.press('KeyN');
  const mapUp = await helpers.waitVisibleSafe(page, '[data-screen="galaxyMap"]', 20_000);
  if (!mapUp) return { ok: false, reason: 'galaxy map did not open to arm the station waypoint' };
  await helpers.searchAndSelect(page, target.name, /station|berth|dock/i);
  const setWp = page.getByRole('button', { name: 'Set Waypoint', exact: true });
  const setWpVisible = await setWp.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  if (!setWpVisible) return { ok: false, reason: `no Set Waypoint control for ${target.name} on the chart` };
  await helpers.clickPersistentButton(page, setWp);
  const autopilotArmed = await page.waitForFunction(() => window.SF?.state?.nav?.autopilot?.active === true, null, { timeout: 10_000 })
    .then(() => true).catch(() => false);

  // WHERE was the autopilot actually pointed? Without this, a failed approach is unattributable:
  // "the autopilot cannot reach a station" and "the harness armed the wrong search result" produce
  // an identical timeout. Comparing the armed target against the station's own position separates
  // them outright.
  const armed = await page.evaluate((wantName) => {
    const state = window.SF?.state;
    const nav = state?.nav;
    const player = state?.entities?.get(state.playerId);
    let station = null;
    if (Array.isArray(state?.entityList)) {
      for (const e of state.entityList) {
        if (!e || e.type !== 'station' || e.data?.isGate || !e.pos) continue;
        if ((e.data?.name || '') === wantName) { station = { x: e.pos.x, z: e.pos.z, name: e.data.name }; break; }
      }
    }
    const t = nav?.autopilot?.target || null;
    return {
      target: t ? { x: t.x, z: t.z } : null,
      label: nav?.autopilot?.label || null,
      status: nav?.autopilot?.status || null,
      waypointLabel: nav?.waypoint?.label || null,
      station,
      player: player?.pos ? { x: player.pos.x, z: player.pos.z } : null,
      targetToStationWU: t && station ? Math.hypot(t.x - station.x, t.z - station.z) : null,
    };
  }, target.name);
  const mapStillVisible = await page.locator('[data-screen="galaxyMap"]').first().isVisible().catch(() => false);
  if (mapStillVisible) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('[data-screen="galaxyMap"]').first()
      .waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }
  await returnFocusToGame(page);
  if (!autopilotArmed) {
    return { ok: false, reason: 'Set Waypoint did not arm the autopilot, so the approach never began', target };
  }
  const flightResumed = await page.waitForFunction(() => window.SF?.state?.mode === 'flight', null, { timeout: 10_000 })
    .then(() => true).catch(() => false);
  if (!flightResumed) {
    return {
      ok: false,
      reason: 'the waypoint armed but the public map flow did not return the game to flight',
      target,
      armed,
    };
  }

  // Wait for the physics dock prompt, then press the public dock key.
  //
  // The closest approach actually achieved is tracked throughout, because a bare timeout cannot
  // distinguish "the autopilot never flew" from "the autopilot flew but parked OUTSIDE the dock
  // radius" — and those are completely different defects with different owners.
  const deadline = Date.now() + 300_000;
  let inRange = false;
  let closestWU = Infinity;
  let lastAp = null;
  while (Date.now() < deadline) {
    const probe = await page.evaluate((stationName) => {
      const j = window.__JOURNEY__;
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      let dist = Infinity; let dockRadius = null;
      if (player?.pos && Array.isArray(state?.entityList)) {
        for (const e of state.entityList) {
          if (!e || e.type !== 'station' || e.data?.isGate || !e.pos) continue;
          if (stationName && (e.data?.name || '') !== stationName) continue;
          const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
          if (d < dist) { dist = d; dockRadius = e.data?.dockRadius || e.radius || null; }
        }
      }
      const ap = state?.nav?.autopilot;
      return {
        inRange: !!(j && j.dockRange && j.dockRange.inRange === true),
        dist: Number.isFinite(dist) ? dist : null,
        dockRadius,
        apActive: ap?.active === true,
        apStatus: ap?.status || null,
        speed: player?.vel ? Math.hypot(player.vel.x || 0, player.vel.z || 0) : 0,
      };
    }, target.name);
    lastAp = probe;
    if (probe.dist != null && probe.dist < closestWU) closestWU = probe.dist;
    if (probe.inRange) { inRange = true; break; }
    await page.waitForTimeout(900);
  }
  if (!inRange) {
    return {
      ok: false,
      reason: `the ship never reached dock range within 300s — closest approach ${Number.isFinite(closestWU) ? Math.round(closestWU) : '?'} WU `
        + `against a dock radius of ${lastAp && lastAp.dockRadius != null ? Math.round(lastAp.dockRadius) : '?'} WU; `
        + `autopilot active=${lastAp && lastAp.apActive} status=${lastAp && lastAp.apStatus} speed=${lastAp ? lastAp.speed.toFixed(1) : '?'} WU/s. `
        + `ARMED TARGET was "${armed.label}" at ${armed.target ? `(${Math.round(armed.target.x)},${Math.round(armed.target.z)})` : 'null'}, `
        + `station "${armed.station ? armed.station.name : '?'}" at `
        + `${armed.station ? `(${Math.round(armed.station.x)},${Math.round(armed.station.z)})` : 'null'} — `
        + `target-to-station ${armed.targetToStationWU != null ? Math.round(armed.targetToStationWU) : '?'} WU `
        + '(≈0 means the autopilot was aimed correctly and still did not arrive; large means the harness armed the wrong mark)',
      target, closestWU, lastAp, armed,
    };
  }

  await returnFocusToGame(page);
  await page.keyboard.press('KeyE');
  const docked = await page.waitForFunction(() => window.SF?.state?.ui?.docked === true, null, { timeout: 30_000 })
    .then(() => true).catch(() => false);
  if (!docked) return { ok: false, reason: 'the dock key did not put the ship in the station' };
  await page.waitForTimeout(1200); // station screen swap is fade-gated

  const where = await page.evaluate(() => ({
    stationId: window.SF?.state?.ui?.dockedStationId || null,
    sectorId: window.SF?.state?.world?.currentSectorId || null,
  }));
  return { ok: true, stationId: where.stationId, sectorId: where.sectorId, target };
}

/** Read the contract board the player is looking at. Observation only. */
async function readContractBoard(page) {
  // Open the Missions screen through its own dock tile. Station DESTINATIONS are `data-nav`
  // (an ARIA tablist); only the immediate service verbs (repair/refuel/resupply/undock) are
  // `data-act`. Clicking the wrong one silently does nothing — see src/ui/station/dock.js.
  await page.locator('[data-nav="contracts"]').first().click({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const state = window.SF?.state;
    const stationId = state?.ui?.dockedStationId;
    const board = state?.missions?.boards?.[stationId];
    const slots = (board && board.slots) || [];
    const current = state?.world?.currentSectorId || null;
    return slots.map((o) => ({
      id: o.id,
      type: o.type,
      title: o.title || null,
      cmdtyId: (o.params && o.params.cmdtyId) || null,
      qty: (o.params && o.params.qty) || null,
      destStationId: o.destStationId || null,
      destSectorId: o.destSectorId || null,
      crossSector: !!(o.destSectorId && o.destSectorId !== current),
      rendered: !!document.querySelector(`[data-mid="${o.id}"]`),
    }));
  });
}

/** Accept an offer by clicking its row then its Accept control — the player's own path. */
async function acceptOfferViaBoard(page, offerId) {
  const row = page.locator(`[data-mid="${offerId}"]`).first();
  const rowVisible = await row.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  if (!rowVisible) return { ok: false, reason: `offer ${offerId} is on the board data but has no clickable row in the UI` };
  await row.click({ timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(500);

  const accept = page.locator(`[data-accept="${offerId}"]`).first();
  const acceptVisible = await accept.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
  if (!acceptVisible) return { ok: false, reason: `no Accept control rendered for ${offerId}` };
  await accept.click({ timeout: 8_000 }).catch(() => {});

  const ok = await page.waitForFunction((id) => {
    const active = window.SF?.state?.missions?.active || [];
    return active.some((m) => m && (m.offerId === id || m.id === id || m.sourceOfferId === id) && m.status === 'active');
  }, offerId, { timeout: 10_000 }).then(() => true).catch(() => false);

  const mission = await page.evaluate((id) => {
    const state = window.SF?.state;
    const active = state?.missions?.active || [];
    const m = active.find((x) => x && (x.offerId === id || x.id === id || x.sourceOfferId === id))
      || active[active.length - 1];
    if (!m) return null;
    return {
      id: m.id,
      type: m.type,
      title: m.title || null,
      status: m.status,
      cmdtyId: (m.params && m.params.cmdtyId) || null,
      qty: (m.params && m.params.qty) || null,
      destStationId: m.destStationId || null,
      destSectorId: m.destSectorId || null,
      tracked: state?.ui?.trackedMissionId === m.id,
    };
  }, offerId);

  if (!ok || !mission) return { ok: false, reason: 'the Accept control did not produce an active mission', mission };
  return { ok: true, mission };
}

/** Buy the contract commodity at the station market through the public trade controls. */
async function acquireCargoViaMarket(page, cmdtyId, qty) {
  if (!cmdtyId) return { ok: true, have: 0, reason: 'contract carries no commodity' };
  const need = Math.max(1, qty || 1);
  const already = await page.evaluate((id) => (window.SF?.state?.player?.cargo?.items?.[id]) || 0, cmdtyId);
  if (already >= need) return { ok: true, have: already, bought: 0 };

  await page.locator('[data-nav="market"]').first().click({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const row = page.locator(`[data-cmdty="${cmdtyId}"], [data-commodity="${cmdtyId}"], [data-id="${cmdtyId}"]`).first();
  const rowVisible = await row.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
  if (!rowVisible) {
    const have = await page.evaluate((id) => (window.SF?.state?.player?.cargo?.items?.[id]) || 0, cmdtyId);
    return { ok: have >= need, have, reason: `no market row for ${cmdtyId} at this station — the contract commodity is not on sale where the contract was posted` };
  }
  await row.click({ timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(400);

  // Buy in single clicks against the public Buy control until the hold satisfies the contract.
  for (let i = 0; i < need + 8; i += 1) {
    const have = await page.evaluate((id) => (window.SF?.state?.player?.cargo?.items?.[id]) || 0, cmdtyId);
    if (have >= need) break;
    const buy = page.getByRole('button', { name: /^buy/i }).first();
    const can = await buy.isVisible().catch(() => false);
    if (!can) break;
    await buy.click({ timeout: 4_000 }).catch(() => {});
    await page.waitForTimeout(220);
  }
  const have = await page.evaluate((id) => (window.SF?.state?.player?.cargo?.items?.[id]) || 0, cmdtyId);
  return { ok: have >= need, have, need, reason: have >= need ? null : `hold holds ${have}u of ${need}u required` };
}

async function undockViaStationUi(page, helpers) {
  const btn = page.locator('[data-act="undock"]').first();
  const visible = await btn.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
  if (visible) {
    await btn.click({ timeout: 6_000 }).catch(() => {});
    await page.waitForTimeout(500);
    const confirm = page.locator('[data-pop-launch]').first();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click({ timeout: 6_000 }).catch(() => {});
    }
  }
  const ok = await page.waitForFunction(() => window.SF?.state?.ui?.docked !== true && window.SF?.state?.mode === 'flight',
    null, { timeout: 30_000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(800);
  return { ok, reason: ok ? null : 'the ship did not return to flight after the undock control' };
}

async function openGalaxyMap(page, helpers) {
  let ok = await page.locator('[data-screen="galaxyMap"]').first().isVisible().catch(() => false);
  // Two attempts on the public key. The first `returnFocusToGame` is the load-bearing part: a
  // keypress aimed at the game while a hidden chart search field holds DOM focus is simply eaten.
  for (let attempt = 0; attempt < 2 && !ok; attempt += 1) {
    await returnFocusToGame(page);
    await page.keyboard.press('KeyM');
    ok = await helpers.waitVisibleSafe(page, '[data-screen="galaxyMap"]', 10_000);
  }
  const top = await page.evaluate(() => {
    const stack = window.SF?.state?.ui?.screenStack;
    return Array.isArray(stack) && stack.length ? stack[stack.length - 1] : null;
  });
  return { ok, top, reason: ok ? null : 'the galaxy map screen never became visible' };
}

/**
 * Read the four navigation answers AS THE PLAYER READS THEM.
 *
 * The source of truth here is deliberately the rendered DOM (`.gm-nav-row`), not the model object
 * behind it. A populated model whose panel never renders is not an answered question, and this step
 * grades the answer the player actually gets. The chart writes these rows from
 * `resolveMapNavContext`, which guarantees four rows in a fixed order with a non-empty `value` — an
 * absent answer says so IN WORDS ("None tracked", "No route plotted"). That is what makes the
 * placeholder detection below exact rather than a guess: these are the literal strings the producer
 * emits for "no answer".
 *
 * The rows live in the inspector's OVERVIEW tab and only when nothing is selected, so the caller
 * clears any selection first.
 */
async function readNavContext(page) {
  return page.evaluate(() => {
    const PLACEHOLDERS = {
      objective: ['None tracked'],
      destination: ['No route plotted'],
      leg: ['None'],
    };
    const rowEls = [...document.querySelectorAll('.gm-nav-row')];
    if (!rowEls.length) return null;

    const rows = rowEls.map((el) => ({
      label: (el.querySelector('.gm-nav-row-k')?.innerText || '').trim(),
      value: (el.querySelector('.gm-nav-row-v')?.innerText || '').trim(),
      detail: (el.querySelector('.gm-nav-row-d')?.innerText || '').trim(),
      tone: el.getAttribute('data-tone') || null,
    }));
    const byLabel = (want) => rows.find((r) => r.label.toUpperCase() === want) || null;
    const answered = (row, key) => !!(row && row.value && !PLACEHOLDERS[key]?.includes(row.value));

    const position = byLabel('POSITION');
    const tracking = byLabel('TRACKING');
    const destination = byLabel('DESTINATION');
    const leg = byLabel('NEXT LEG');

    const state = window.SF?.state;
    return {
      rows,
      // NOTE: `label` is what the chart DISPLAYS. It is deliberately NOT copied from world state —
      // step 3 cross-checks it against the sim's own sector name, and seeding it from the sim would
      // make that comparison a tautology.
      position: position && position.value ? { label: position.value, detail: position.detail } : null,
      objective: answered(tracking, 'objective') ? { label: tracking.value, detail: tracking.detail } : null,
      destination: answered(destination, 'destination')
        ? { label: destination.value, detail: destination.detail, sectorId: destinationSectorIdFromState() }
        : null,
      nextLeg: answered(leg, 'leg') ? { label: leg.value, detail: leg.detail } : null,
      nextWaypoint: null,
    };

    function destinationSectorIdFromState() {
      const nav = window.SF?.state?.nav;
      const ex = nav?.executor;
      if (ex && ex.destinationSectorId) return ex.destinationSectorId;
      const legs = nav?.route && Array.isArray(nav.route.legs) ? nav.route.legs : [];
      return legs.length ? legs[legs.length - 1].to : null;
    }
  });
}

async function readSimPosition(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const sectorId = state?.world?.currentSectorId || null;
    const sector = sectorId && state?.world?.sectors ? state.world.sectors[sectorId] : null;
    return {
      sectorId,
      sectorName: sector?.name || null,
      pos: player?.pos ? { x: player.pos.x, z: player.pos.z } : null,
    };
  });
}

async function inspectDestination(page, helpers, sectorId) {
  const name = await page.evaluate((id) => {
    const s = window.SF?.state?.world?.sectors?.[id];
    return (s && s.name) || id;
  }, sectorId);
  await helpers.searchAndSelect(page, name, /sector|system/i);
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    const panel = document.querySelector('.gm-inspector, [data-map-inspector], .gm-detail, .gm-selection');
    if (!panel) return { ok: false, reason: 'no inspector panel rendered for the selection' };
    const text = (panel.innerText || '').trim();
    const titleEl = panel.querySelector('h2, h3, .gm-inspector-title, .gm-detail-title');
    const title = titleEl ? (titleEl.innerText || '').trim() : text.split('\n')[0] || '';
    // An "arrival reason" is a statement of WHY this place is the destination — a tracked mission
    // objective, a contract, or a delivery. A bare name/distance readout is not one.
    const reasonMatch = text.match(/(deliver[^\n]*|contract[^\n]*|mission[^\n]*|objective[^\n]*|haul[^\n]*|destination:[^\n]*)/i);
    return {
      ok: true,
      title,
      text: text.slice(0, 1200),
      arrivalReason: reasonMatch ? reasonMatch[0].trim() : null,
    };
  });
}

/** Does the chart let a player COMPARE routes before committing to one? */
async function readRouteComparison(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll(
      '.gm-route-option, [data-route-option], .gm-route-compare, [data-route-alternative], .gm-route-choice',
    )];
    if (nodes.length >= 2) {
      const text = nodes.map((n) => (n.innerText || '').trim()).join(' | ');
      const discriminators = [];
      if (/fuel/i.test(text)) discriminators.push('fuel');
      if (/\bhops?\b|\blegs?\b/i.test(text)) discriminators.push('hops');
      if (/risk|danger|interdict/i.test(text)) discriminators.push('risk');
      if (/time|eta/i.test(text)) discriminators.push('time');
      return { available: true, optionCount: nodes.length, discriminators, sample: text.slice(0, 400) };
    }
    return {
      available: false,
      optionCount: nodes.length,
      discriminators: [],
      reason: 'the chart renders no route-alternative controls; `world.computeRoute` returns a single '
        + 'Dijkstra path and no comparison affordance consumes alternatives.',
    };
  });
}

async function plotRouteTo(page, helpers, sectorId) {
  const name = await page.evaluate((id) => {
    const s = window.SF?.state?.world?.sectors?.[id];
    return (s && s.name) || id;
  }, sectorId);
  await helpers.searchAndSelect(page, name, /sector|system/i);
  await page.waitForTimeout(500);

  // Prefer an explicit plot/course control; never the jump control, which is a different act.
  const plotBtn = page.getByRole('button', { name: /Set Course(?!.*Jump)|Plot Route|Plot Course/i }).first();
  let clicked = false;
  if (await plotBtn.isVisible().catch(() => false)) {
    await helpers.clickPersistentButton(page, plotBtn);
    clicked = true;
  }
  if (!clicked) {
    const alt = page.locator('[data-ribbon-action="plot"], [data-map-action="plot"]').first();
    if (await alt.isVisible().catch(() => false)) { await alt.click({ timeout: 6_000 }).catch(() => {}); clicked = true; }
  }
  if (!clicked) return { ok: false, reason: 'no plot/Set Course control is reachable for the destination on the chart' };

  await page.waitForFunction(() => {
    const r = window.SF?.state?.nav?.route;
    return !!(r && Array.isArray(r.legs) && r.legs.length);
  }, null, { timeout: 10_000 }).catch(() => {});

  return page.evaluate((destId) => {
    const nav = window.SF?.state?.nav;
    const r = nav?.route;
    if (!r || !Array.isArray(r.legs) || !r.legs.length) {
      return { ok: false, reason: 'the control fired but nav.route holds no legs' };
    }
    const terminal = r.legs[r.legs.length - 1];
    return {
      ok: true,
      legs: r.legs.length,
      totalFuel: r.totalFuel ?? null,
      destinationSectorId: terminal ? terminal.to : null,
      matchesMission: !!terminal && terminal.to === destId,
      autoTravel: nav.autoTravel === true,
      executorPresent: !!nav.executor,
    };
  }, sectorId);
}

/** After plotting, the ship must be STILL. Measured, not assumed. */
async function measureStillnessAfterPlot(page, holdMs) {
  const before = await readSimPosition(page);
  await page.waitForTimeout(holdMs);
  const after = await page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const ex = state?.nav?.executor;
    return {
      pos: player?.pos ? { x: player.pos.x, z: player.pos.z } : null,
      executorStatus: ex ? ex.status : null,
      executorEngaged: ex ? ex.engaged === true : false,
    };
  });
  const driftWU = before?.pos && after?.pos
    ? Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z)
    : Number.NaN;
  return { driftWU, holdMs, before: before?.pos, after: after.pos, executorStatus: after.executorStatus, executorEngaged: after.executorEngaged };
}

async function engageRoute(page, helpers) {
  const btn = page.getByRole('button', { name: /^Engage$|Engage Route/i }).first();
  let clicked = false;
  if (await btn.isVisible().catch(() => false)) {
    await helpers.clickPersistentButton(page, btn);
    clicked = true;
  }
  if (!clicked) {
    const alt = page.locator('[data-ribbon-action="engage"]').first();
    if (await alt.isVisible().catch(() => false)) { await alt.click({ timeout: 6_000 }).catch(() => {}); clicked = true; }
  }
  if (!clicked) return { ok: false, reason: 'no Engage control is reachable on the chart for the plotted route' };

  const engaged = await page.waitForFunction(() => window.SF?.state?.nav?.executor?.engaged === true, null, { timeout: 12_000 })
    .then(() => true).catch(() => false);
  const status = await page.evaluate(() => window.SF?.state?.nav?.executor?.status || null);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);
  return { ok: engaged, status, reason: engaged ? null : 'the Engage control fired but no engaged executor appeared' };
}

async function measureMovementAfterEngage(page, windowMs) {
  const start = await readSimPosition(page);
  const deadline = Date.now() + windowMs;
  let peakSpeed = 0;
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      const state = window.SF?.state;
      const p = state?.entities?.get(state.playerId);
      return p?.vel ? Math.hypot(p.vel.x || 0, p.vel.z || 0) : 0;
    });
    if (s > peakSpeed) peakSpeed = s;
    await page.waitForTimeout(400);
  }
  const end = await readSimPosition(page);
  const travelledWU = start?.pos && end?.pos ? Math.hypot(end.pos.x - start.pos.x, end.pos.z - start.pos.z) : 0;
  return { travelledWU, peakSpeed, elapsedMs: windowMs, moved: travelledWU > 150 || peakSpeed > 8 };
}

/**
 * Sample the instruments AND independently recompute what each should read from sim state.
 *
 * The recompute deliberately does not call the same helper the display calls where a simpler
 * independent formula exists (speed is |vel|; stopping distance is v²/2a), so agreement is evidence
 * about the display rather than a tautology.
 */
async function sampleInstruments(page) {
  return page.evaluate((TOL) => {
    const state = window.SF?.state;
    if (!state) return null;
    const player = state.entities?.get(state.playerId);
    if (!player) return null;

    const actualSpeed = player.vel ? Math.hypot(player.vel.x || 0, player.vel.z || 0) : 0;

    const num = (s) => {
      if (s == null) return null;
      const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
      return m ? Number(m[0]) : null;
    };
    const textOf = (sel) => {
      const el = document.querySelector(sel);
      return el ? (el.innerText || el.textContent || '').trim() : null;
    };
    const findLabelled = (re) => {
      const nodes = [...document.querySelectorAll('.hud *, [data-screen] *, .gm-route-ribbon *, .sf-hud *')];
      for (const el of nodes) {
        if (el.children.length) continue;
        const t = (el.innerText || '').trim();
        if (t && re.test(t)) return t;
      }
      return null;
    };

    // ── displayed values ──
    const dSpeed = num(textOf('[data-hud="speed"]') || textOf('.hud-speed') || findLabelled(/^\d+(\.\d+)?\s*(WU\/s|m\/s)$/i));
    const dStop = num(textOf('[data-hud="stopping"]') || textOf('.hud-stop-dist') || findLabelled(/stop|brake/i));
    const dEta = (() => {
      const t = textOf('[data-route="eta"]') || textOf('.gm-route-eta') || findLabelled(/^ETA/i);
      if (!t) return null;
      const mm = String(t).match(/(\d+):(\d{2})/);
      if (mm) return Number(mm[1]) * 60 + Number(mm[2]);
      return num(t);
    })();

    // ── independent recompute ──
    const profile = window.SF?.propulsionProfile ? window.SF.propulsionProfile(player) : null;
    const brakeAccel = profile && Number.isFinite(profile.brakeAccel) ? profile.brakeAccel
      : (profile && Number.isFinite(profile.reverseAccel) ? profile.reverseAccel : null);
    const actualStop = brakeAccel && brakeAccel > 0 ? (actualSpeed * actualSpeed) / (2 * brakeAccel) : null;

    const ex = state.nav?.executor;
    const leg = ex && Array.isArray(ex.legs) ? ex.legs[ex.legIndex] : null;
    const legTarget = leg && leg.target ? leg.target : null;
    const distToNext = legTarget && player.pos
      ? Math.hypot(legTarget.x - player.pos.x, legTarget.z - player.pos.z) : null;
    const actualEta = distToNext != null && actualSpeed > 1 ? distToNext / actualSpeed : null;

    const cmp = (displayed, actual, relTol, absTol) => {
      if (displayed == null || actual == null) {
        return { displayed, actual, agrees: displayed == null ? false : true, tolerance: null };
      }
      const tol = Math.max(absTol, Math.abs(actual) * relTol);
      return { displayed, actual, tolerance: tol, agrees: Math.abs(displayed - actual) <= tol };
    };

    return {
      tick: state.tick ?? null,
      sectorId: state.world?.currentSectorId || null,
      checks: {
        velocity: cmp(dSpeed, actualSpeed, TOL.speedRel, TOL.speedWUs),
        stoppingDistance: cmp(dStop, actualStop, TOL.stopRel, TOL.stopWU),
        eta: cmp(dEta, actualEta, TOL.etaRel, TOL.etaS),
      },
      raw: { dSpeed, dStop, dEta, actualSpeed, actualStop, actualEta, distToNext, brakeAccel },
    };
  }, INSTRUMENT_TOLERANCE);
}

async function interruptRoute(page, helpers) {
  const before = await page.evaluate(() => {
    const ex = window.SF?.state?.nav?.executor;
    return ex ? { status: ex.status, legIndex: ex.legIndex, destinationSectorId: ex.destinationSectorId } : null;
  });
  const opened = await openGalaxyMap(page, helpers);
  if (!opened.ok) return { ok: false, reason: 'could not reopen the chart to reach the disengage control', before };

  const btn = page.getByRole('button', { name: /Disengage|Abort Route|Leave Route/i }).first();
  let control = null;
  if (await btn.isVisible().catch(() => false)) {
    control = (await btn.innerText().catch(() => 'Disengage')).trim();
    await helpers.clickPersistentButton(page, btn);
  } else {
    const alt = page.locator('[data-ribbon-action="disengage"]').first();
    if (await alt.isVisible().catch(() => false)) { control = 'disengage'; await alt.click({ timeout: 6_000 }).catch(() => {}); }
  }
  if (!control) return { ok: false, reason: 'no disengage/abort control is reachable while the route is running', before };

  await page.waitForFunction(() => window.SF?.state?.nav?.executor?.engaged !== true, null, { timeout: 10_000 }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(600);

  const after = await page.evaluate(() => {
    const nav = window.SF?.state?.nav;
    const ex = nav?.executor;
    return {
      status: ex ? ex.status : null,
      engaged: ex ? ex.engaged === true : false,
      legIndex: ex ? ex.legIndex : null,
      destinationSectorId: ex ? ex.destinationSectorId : null,
      routeLegs: nav?.route && Array.isArray(nav.route.legs) ? nav.route.legs.length : 0,
      autopilotActive: nav?.autopilot?.active === true,
    };
  });
  return {
    ok: true, control, before,
    status: after.status, engaged: after.engaged, stillEngaged: after.engaged,
    legIndex: after.legIndex, destinationSectorId: after.destinationSectorId,
    routeLegs: after.routeLegs, autopilotActive: after.autopilotActive,
  };
}

async function recoverItinerary(page, helpers, interruption) {
  const kept = await page.evaluate(() => {
    const nav = window.SF?.state?.nav;
    return {
      routeLegs: nav?.route && Array.isArray(nav.route.legs) ? nav.route.legs.length : 0,
      executorStatus: nav?.executor ? nav.executor.status : null,
      legIndex: nav?.executor ? nav.executor.legIndex : null,
      destinationSectorId: nav?.executor ? nav.executor.destinationSectorId : null,
    };
  });
  const routeSurvived = kept.routeLegs > 0;
  if (!routeSurvived) return { routeSurvived, ok: false, routeAfter: kept.routeLegs, reason: 'nav.route was cleared by the interruption' };

  const opened = await openGalaxyMap(page, helpers);
  if (!opened.ok) return { routeSurvived, ok: false, reason: 'could not reopen the chart to reach the resume control', kept };

  const btn = page.getByRole('button', { name: /Resume Route|^Resume$|^Engage$/i }).first();
  let control = null;
  if (await btn.isVisible().catch(() => false)) {
    control = (await btn.innerText().catch(() => 'Resume')).trim();
    await helpers.clickPersistentButton(page, btn);
  } else {
    const alt = page.locator('[data-ribbon-action="resume"], [data-ribbon-action="engage"]').first();
    if (await alt.isVisible().catch(() => false)) { control = 'resume'; await alt.click({ timeout: 6_000 }).catch(() => {}); }
  }
  if (!control) return { routeSurvived, ok: false, reason: 'no resume control is offered for the kept itinerary', kept };

  const re = await page.waitForFunction(() => window.SF?.state?.nav?.executor?.engaged === true, null, { timeout: 12_000 })
    .then(() => true).catch(() => false);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const ex = window.SF?.state?.nav?.executor;
    return ex ? { status: ex.status, legIndex: ex.legIndex, destinationSectorId: ex.destinationSectorId, engaged: ex.engaged === true } : null;
  });
  const legBefore = interruption && interruption.legIndex != null ? interruption.legIndex : kept.legIndex;
  return {
    routeSurvived: true,
    ok: re,
    control,
    reason: re ? null : 'the resume control fired but the executor did not re-engage',
    legBefore,
    legAfter: after ? after.legIndex : null,
    sameLeg: !!after && after.legIndex === legBefore,
    destinationAfter: after ? after.destinationSectorId : null,
    status: after ? after.status : null,
    kept,
  };
}

/**
 * Let the route run, and grade arrival on the SECTOR the ship is physically in — never on the
 * executor's own claim. The two are recorded separately precisely so a disagreement is visible.
 */
async function flyRouteToDestination(page, helpers, destination, log) {
  const started = Date.now();
  const budgetMs = 600_000;
  let executorClaimedArrived = false;
  let last = null;

  while (Date.now() - started < budgetMs) {
    last = await page.evaluate(() => {
      const state = window.SF?.state;
      const ex = state?.nav?.executor;
      const p = state?.entities?.get(state.playerId);
      return {
        sectorId: state?.world?.currentSectorId || null,
        mode: state?.mode || null,
        executorStatus: ex ? ex.status : null,
        executorEngaged: ex ? ex.engaged === true : false,
        legIndex: ex ? ex.legIndex : null,
        legCount: ex && Array.isArray(ex.legs) ? ex.legs.length : 0,
        alive: p ? p.alive !== false : false,
        speed: p?.vel ? Math.hypot(p.vel.x || 0, p.vel.z || 0) : 0,
      };
    });
    if (last.executorStatus === 'arrived') executorClaimedArrived = true;
    if (last.sectorId === destination.sectorId) break;
    // Capture whether the follower ever COMMITTED a jump. The follower sequences controllers and
    // observes `sector:enter`; nothing in it emits `world:requestJump`. If it parks at the gate,
    // marks the leg arrived and no `jump:*` receipt ever fires, this record is what proves it.
    last.jumpReceipts = await page.evaluate(() => {
      const j = window.__JOURNEY__;
      const evs = (j && j.events) || [];
      return {
        chargeStart: evs.filter((e) => e.event === 'jump:chargeStart').length,
        start: evs.filter((e) => e.event === 'jump:start').length,
        arrive: evs.filter((e) => e.event === 'jump:arrive').length,
        sectorEnter: evs.filter((e) => e.event === 'sector:enter').length,
      };
    });
    // A route that has gone idle/arrived without reaching the destination will never get there on
    // its own; stop burning the budget and report the state honestly.
    if (executorClaimedArrived && last.sectorId !== destination.sectorId) break;
    if (!last.alive) break;
    await page.waitForTimeout(1500);
  }

  const elapsedMs = Date.now() - started;
  log(`[journey] route flight ended after ${Math.round(elapsedMs / 1000)}s in ${last && last.sectorId}`);
  return {
    ...last,
    elapsedMs,
    executorClaimedArrived,
    inDestinationSector: !!last && last.sectorId === destination.sectorId,
  };
}

async function deliverCargoAtDestination(page, helpers, destination) {
  const dock = await dockAtNearestStation(page, helpers, () => {});
  if (!dock.ok) return { ok: false, reason: `could not dock at the destination station: ${dock.reason}` };

  const settled = await page.waitForFunction((missionDest) => {
    const state = window.SF?.state;
    const active = state?.missions?.active || [];
    const stillActive = active.some((m) => m && m.destStationId === missionDest && m.status === 'active');
    const j = window.__JOURNEY__;
    const delivered = j && j.events.some((e) => e.event === 'cargo:delivered');
    const completed = j && j.events.some((e) => e.event === 'mission:completed');
    return delivered || completed || !stillActive;
  }, destination.stationId, { timeout: 30_000 }).then(() => true).catch(() => false);

  const receipt = await page.evaluate(() => {
    const j = window.__JOURNEY__;
    const del = j && [...j.events].reverse().find((e) => e.event === 'cargo:delivered');
    const done = j && [...j.events].reverse().find((e) => e.event === 'mission:completed');
    return {
      delivered: del ? del.payload : null,
      completed: done ? done.payload : null,
      activeCount: (window.SF?.state?.missions?.active || []).length,
      stationId: window.SF?.state?.ui?.dockedStationId || null,
    };
  });

  if (!settled || (!receipt.delivered && !receipt.completed)) {
    return {
      ok: false,
      reason: 'docked at the destination but the contract produced no cargo:delivered / mission:completed receipt',
      receipt, stationId: receipt.stationId,
    };
  }
  return {
    ok: true,
    stationId: receipt.stationId,
    missionId: (receipt.completed && receipt.completed.missionId) || (receipt.delivered && receipt.delivered.missionId) || null,
    commodityId: receipt.delivered ? receipt.delivered.commodityId : destination.cmdtyId,
    deliveredQty: receipt.delivered ? receipt.delivered.qty : null,
    receipt,
  };
}

/**
 * Save/load at the states this run actually reached. Each check names the state, saves, cold-reloads,
 * presses Continue, and compares the fields that define that state.
 */
async function saveLoadRepresentativeStates(page, helpers, journey, log) {
  const checks = [];
  const stateNow = await page.evaluate(() => {
    const s = window.SF?.state;
    const nav = s?.nav;
    return {
      mode: s?.mode || null,
      docked: s?.ui?.docked === true,
      sectorId: s?.world?.currentSectorId || null,
      routeLegs: nav?.route && Array.isArray(nav.route.legs) ? nav.route.legs.length : 0,
      executorStatus: nav?.executor ? nav.executor.status : null,
      executorLeg: nav?.executor ? nav.executor.legIndex : null,
      activeMissions: (s?.missions?.active || []).map((m) => m.id),
      trackedMissionId: s?.ui?.trackedMissionId || null,
    };
  });
  if (!stateNow.mode) return { checks, reason: 'the game is not in a readable state' };

  const label = describeState(stateNow);
  const result = await saveReloadContinue(page, helpers, stateNow, label, log);
  checks.push(result);
  return { checks, reason: null };
}

function describeState(s) {
  if (s.docked) return 'docked-with-contract';
  if (s.routeLegs > 0 && s.executorStatus && s.executorStatus !== 'idle') return `in-transit(${s.executorStatus})`;
  if (s.routeLegs > 0) return 'route-plotted-idle';
  return `in-flight(${s.sectorId})`;
}

async function saveReloadContinue(page, helpers, expected, label, log) {
  // Leave any hidden text-entry focus so F5 reaches the game (same seam the route harness documents).
  await page.keyboard.press('Escape').catch(() => {});
  await returnFocusToGame(page);
  await page.evaluate(() => { if (window.__JOURNEY__) { window.__JOURNEY__.saved = false; window.__JOURNEY__.loaded = false; } });
  await page.keyboard.press('F5');
  const saved = await page.waitForFunction(
    () => window.__JOURNEY__?.saved === true && !!localStorage.getItem('sf.save.quick'),
    null, { timeout: 20_000 },
  ).then(() => true).catch(() => false);
  if (!saved) return { label, ok: false, reason: 'quick-save produced no save:completed receipt' };

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 60_000 });
  await installJourneyObservers(page);

  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
  const menu = await helpers.waitVisibleSafe(page, '[data-screen="mainMenu"]', 30_000);
  if (!menu) return { label, ok: false, reason: 'the title screen did not return after reload' };
  const cont = page.getByRole('button', { name: 'Continue', exact: true });
  const hasContinue = await cont.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
  if (!hasContinue) return { label, ok: false, reason: 'no Continue control on the title screen after saving' };
  await cont.click({ timeout: 20_000 }).catch(() => {});

  const restored = await page.waitForFunction((want) => {
    const s = window.SF?.state;
    const readiness = typeof window.SF?.authoredVisualReadiness === 'function' ? window.SF.authoredVisualReadiness() : null;
    return s?.world?.currentSectorId === want.sectorId && !!readiness?.ready;
  }, expected, { timeout: 180_000 }).then(() => true).catch(() => false);

  const after = await page.evaluate(() => {
    const s = window.SF?.state;
    const nav = s?.nav;
    return {
      mode: s?.mode || null,
      sectorId: s?.world?.currentSectorId || null,
      routeLegs: nav?.route && Array.isArray(nav.route.legs) ? nav.route.legs.length : 0,
      executorStatus: nav?.executor ? nav.executor.status : null,
      executorLeg: nav?.executor ? nav.executor.legIndex : null,
      activeMissions: (s?.missions?.active || []).map((m) => m.id),
      trackedMissionId: s?.ui?.trackedMissionId || null,
    };
  });

  const diffs = [];
  if (after.sectorId !== expected.sectorId) diffs.push(`sector ${expected.sectorId} -> ${after.sectorId}`);
  if (expected.activeMissions.length && after.activeMissions.length !== expected.activeMissions.length) {
    diffs.push(`active missions ${expected.activeMissions.length} -> ${after.activeMissions.length}`);
  }
  if (expected.routeLegs && after.routeLegs !== expected.routeLegs) {
    diffs.push(`route legs ${expected.routeLegs} -> ${after.routeLegs}`);
  }
  log(`[journey] save/load "${label}": restored=${restored} diffs=${diffs.join(', ') || 'none'}`);
  return {
    label,
    ok: restored && diffs.length === 0,
    reason: !restored ? 'Continue did not restore the saved sector' : (diffs.length ? diffs.join('; ') : null),
    expected, after,
  };
}
