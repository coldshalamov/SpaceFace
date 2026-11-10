// AL-LONG-1 (row 399) — "seen at minute one, moved at hour fifteen": the eight-object
// capability-revisit slice. Five revisitNeed rows join the three shipped AL-LG tow doors,
// covering the capability kinds the live player route honestly supports (tow, line, field —
// the slam verdict survives in shipCapabilities but no honest slam return-action exists yet,
// so slam coverage is deferred). A door is never a visibility gate: each one-off stays on
// the scan and its SF-174 lesson reads "not yet" until the live fit's real verbs open it,
// then "ready" — and the verdict rides the lesson row the prompt paints as primary, not just
// the body row the signals list carries. The head-qualified line door on the Disputed Keg
// names a tool — an Elastic Whip under its own runtime flag — not a rating the ordinary
// line's "holds any swing" verdict could fake.
//
// Deterministic on seed 4242, DT = 1/60, production runtime features. Fits are resolved
// through fittingsFromDefaultModules so every module is slot-legal; no time locks, no
// unlock flags — readiness is recomputed from the live fit on every scan.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { mulberry32 } from '../src/core/rng.js';
import { scanner } from '../src/systems/scanner.js';
import { scanReveal } from '../src/systems/scanReveal.js';
import { spectrum } from '../src/systems/spectrum/index.js';
import { countermeasures } from '../src/systems/countermeasures.js';
import { world as worldSystem } from '../src/systems/world.js';
import {
  revisitDoorState,
  towClassMassFor,
} from '../src/systems/shipCapabilities.js';
import { fittingsFromDefaultModules, getDerivedStats } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { SECTORS } from '../src/data/sectors.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { SCAN_REVEAL_CLASS_RADIUS } from '../src/data/scanReveal.js';
import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import {
  findLiveEntityForRecord,
  stableRecordId,
  RECORD_KIND,
} from '../src/world/worldRecords.js';
import { RESIDENCY_TIER, sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { createSignalInvestigationPrompt } from '../src/ui/signalInvestigationPrompt.js';

const SEED = 4242;
const DT = 1 / 60;
const SCAN_COOLDOWN_S = 8;

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const ONE_OFF_BY_ID = new Map(WORLD_ONE_OFFS.map((o) => [o.id, o]));

// The eight authored capability doors: the three shipped tow doors plus the five rows this
// slice adds. `fit` names the legal upgraded fit the door opens for.
const DOORS = Object.freeze([
  { id: 'oneoff_great_tanker', need: { kind: 'tow', massT: 800 }, shipId: 'ship_colossus', mods: [], label: 'Tanker / Colossus' },
  { id: 'oneoff_runaway_ladle', need: { kind: 'tow', massT: 240 }, shipId: 'ship_hawser', mods: [], label: 'Ladle / Hawser' },
  { id: 'oneoff_the_erased', need: { kind: 'tow', massT: 260 }, shipId: 'ship_hawser', mods: [], label: 'Erased / Hawser' },
  { id: 'oneoff_spare_keg', need: { kind: 'tow', massT: 90 }, shipId: 'ship_hawser', mods: [], label: 'Spare Keg / Hawser' },
  { id: 'oneoff_impound_shelf', need: { kind: 'tow', massT: 150 }, shipId: 'ship_hawser', mods: [], label: 'Impound Shelf / Hawser' },
  { id: 'oneoff_the_pour', need: { kind: 'tow', massT: 240 }, shipId: 'ship_hawser', mods: [], label: 'The Pour / Hawser' },
  { id: 'oneoff_tethys_tally_keg', need: { kind: 'line', speedWuPerS: 100, headId: 'elastic_whip' }, shipId: 'ship_hawser', mods: ['mod_elastic_whip_m'], label: 'Disputed Keg / Hawser + whip' },
  { id: 'oneoff_held_note', need: { kind: 'field', fieldKind: 'decoy', radiusWu: 620 }, shipId: 'ship_kestrel', mods: null, label: 'Held Note / Kestrel + buoy' },
]);

function starterFit() {
  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules.slice());
  return { shipId: NEW_GAME.shipId, fittings, derived: getDerivedStats(NEW_GAME.shipId, fittings, null) };
}

function resolveFit(shipId, mods) {
  const fittings = fittingsFromDefaultModules(shipId, mods);
  return { shipId, fittings, derived: getDerivedStats(shipId, fittings, null) };
}

function readyFitFor(door) {
  if (door.id === 'oneoff_held_note') {
    // A legal Kestrel refit: the drill amp leaves the one utility slot, the decoy buoy
    // takes it. Every requested module survives slot resolution.
    const mods = NEW_GAME.fittedModules.filter((m) => m !== 'mod_drill_amp').concat('mod_decoy_buoy_s');
    return resolveFit(NEW_GAME.shipId, mods);
  }
  return resolveFit(door.shipId, door.mods.slice());
}

// A scan-pulse sim carrying production runtime features, with the world system's own
// materialize pass sharing the sim state so the real authored bodies are what gets scanned.
function bootScan(sectorId, { withSpectrum = false } = {}) {
  const sim = createSimulation({
    seed: SEED,
    // Production update order is [scanner, spectrum, scanReveal]: spectrum's pending result
    // publishes a second signal:scanResults after the scanner batch on every live pulse.
    systems: withSpectrum ? [scanner, spectrum, scanReveal] : [scanner, scanReveal],
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = sectorId;
  state.world.activeSector = { id: sectorId, pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const events = { results: [] };
  bus.on('signal:scanResults', (payload) => events.results.push(payload));
  const worldSys = Object.create(worldSystem);
  worldSys.state = state;
  worldSys.helpers = { spawnEntity: (spec) => sim.spawn(spec) };
  return { sim, state, bus, player, events, worldSys };
}

function refit(t, fit) {
  t.player.fittings = fit.fittings.slice();
  t.player.derived = fit.derived;
}

function materialize(t, sectorId) {
  const sector = SECTOR_BY_ID.get(sectorId);
  const active = { pois: [], stations: [], gates: [], dressing: [] };
  t.worldSys._spawnWorldOneOffs(sector, active);
  return active;
}

function bodyOf(state, oneOffId) {
  return state.entityList.find((e) => e && e.data && e.data.oneOffId === oneOffId) || null;
}

function placeNear(t, body, dist = 40) {
  t.player.pos.x = body.pos.x + dist;
  t.player.pos.z = body.pos.z;
}

function pulse(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
}

function pastCooldown(t) {
  t.sim.runTicks(Math.ceil(SCAN_COOLDOWN_S / DT) + 2);
}

function sf174(t, entityId) {
  const batch = t.events.results.at(-1);
  const row = (batch ? batch.signals : []).find((s) => s.entityId === entityId);
  assert.ok(row, `public scan result names the body (entity ${entityId})`);
  const part = row.discovery && row.discovery.parts && row.discovery.parts['SF-174'];
  assert.ok(part, 'the capability lesson is on the row the player reads');
  return { signal: row, part };
}

// ── case 1: the eight authored, physical opportunities ──────────────────────────────────────

test('eight authored opportunities carry exact requirements across the supported kinds', () => {
  for (const door of DOORS) {
    const spec = ONE_OFF_BY_ID.get(door.id);
    assert.ok(spec, `${door.id} is authored`);
    assert.deepEqual(spec.revisitNeed, door.need, `${door.id} carries the authored requirement`);
    assert.ok(spec.physicalBody && spec.physicalBody.mass > 0, `${door.id} is a physical body`);
  }
  assert.deepEqual(
    [...new Set(DOORS.map((d) => d.need.kind))].sort(),
    ['field', 'line', 'tow'],
    'the slice covers every capability kind with an honest live player route (slam deferred)',
  );

  // Each body materializes through the world's own one-off pass: a tetherable wreck at the
  // authored position carrying the catalog mass and placeId.
  for (const door of DOORS) {
    const spec = ONE_OFF_BY_ID.get(door.id);
    const t = bootScan(spec.sectorId);
    materialize(t, spec.sectorId);
    const body = bodyOf(t.state, door.id);
    assert.ok(body, `${door.id} materializes as a live body before any capability is read`);
    assert.equal(body.type, 'wreck');
    assert.equal(body.data.masslineTetherable, true, `${door.id}: the rope can bite it`);
    assert.equal(body.mass, spec.physicalBody.mass, `${door.id}: live mass matches catalog`);
    assert.equal(body.data.placeId, spec.placeId, `${door.id}: the authored prop is the body`);
    const anchorPos = t.worldSys._oneOffAnchorPos(SECTOR_BY_ID.get(spec.sectorId), spec.anchor);
    const expected = sectorLocalToGlobalForSector(
      { x: anchorPos.x + spec.offsetLocal.x, z: anchorPos.z + spec.offsetLocal.z },
      spec.sectorId,
    );
    assert.equal(body.pos.x, expected.x, `${door.id}: authored position, not drifted`);
    assert.equal(body.pos.z, expected.z);
    const door2 = revisitDoorState(
      { derived: t.player.derived, fittings: t.player.fittings, features: PRODUCTION_FEATURES },
      spec.revisitNeed,
    );
    assert.equal(door2.kind, door.need.kind, `${door.id}: the door kind resolves`);
  }
});

// ── case 2: the actual starter refuses every named requirement ─────────────────────────────

test('the real starter fit gets "not yet" on every one of the eight doors', () => {
  const starter = starterFit();
  // Fixture sanity: this is the actual NEW_GAME Kestrel, not an empty hull.
  assert.ok(towClassMassFor(starter.derived) < 90, 'the starter tow class is honestly short of 90 t');
  for (const door of DOORS) {
    const spec = ONE_OFF_BY_ID.get(door.id);
    const t = bootScan(spec.sectorId);
    materialize(t, spec.sectorId);
    const body = bodyOf(t.state, door.id);
    assert.ok(body, `${door.id} is present to refuse`);
    refit(t, starter);
    placeNear(t, body);
    pulse(t);
    const { signal, part } = sf174(t, body.id);
    assert.equal(part.ready, false, `${door.id}: starter is refused`);
    assert.equal(part.verdict, 'not yet');
    assert.equal(part.kind, door.need.kind);
    assert.match(part.sentence, /not yet/, `${door.id}: the refusal is on the record`);
    assert.match(signal.detail, /not yet/, `${door.id}: the public detail carries the refusal`);
    // The door is capability advice, never a visibility gate or a lock.
    assert.equal(signal.entityId, body.id);
    assert.equal(body.alive === false, false, `${door.id}: the body stays present`);
    assert.equal(part.trackable, true);
    assert.equal(part.paid, 0);
    assert.equal(part.interactionLocked, false);
    assert.equal(part.rewardReset, false);
  }
});

// ── case 3: legal fits open the doors; refit + rescan flips the verdict live ───────────────

test('legal upgraded fits open every door on the same public scan route', () => {
  for (const door of DOORS) {
    const spec = ONE_OFF_BY_ID.get(door.id);
    const fit = readyFitFor(door);
    for (const mod of door.id === 'oneoff_held_note' ? ['mod_decoy_buoy_s'] : door.mods) {
      assert.ok(fit.fittings.includes(mod), `${door.id}: ${mod} survives slot resolution on ${fit.shipId}`);
    }
    const doorState = revisitDoorState(
      { derived: fit.derived, fittings: fit.fittings, features: PRODUCTION_FEATURES },
      spec.revisitNeed,
    );
    assert.equal(doorState.ready, true, `${door.id}: the capability law itself admits the fit`);

    const t = bootScan(spec.sectorId);
    materialize(t, spec.sectorId);
    const body = bodyOf(t.state, door.id);
    refit(t, fit);
    placeNear(t, body);
    pulse(t);
    const { part } = sf174(t, body.id);
    assert.equal(part.ready, true, `${door.id}: the public lesson opens`);
    assert.equal(part.verdict, 'ready');
    assert.match(part.sentence, /ready/);
  }
});

test('the line and field doors follow a refit on a rescan of the same entity in the same run', () => {
  const starter = starterFit();
  for (const door of DOORS.filter((d) => d.need.kind === 'line' || d.need.kind === 'field')) {
    const spec = ONE_OFF_BY_ID.get(door.id);
    const t = bootScan(spec.sectorId);
    materialize(t, spec.sectorId);
    const body = bodyOf(t.state, door.id);
    placeNear(t, body);

    refit(t, starter);
    pulse(t);
    let { part, signal } = sf174(t, body.id);
    assert.equal(part.ready, false, `${door.id}: starter fit refuses`);
    assert.match(signal.detail, /not yet/);

    const ready = readyFitFor(door);
    refit(t, ready);
    pastCooldown(t);
    pulse(t);
    ({ part, signal } = sf174(t, body.id));
    assert.equal(part.ready, true, `${door.id}: the refit opens the door on the same body`);
    assert.equal(part.verdict, 'ready');
    assert.match(signal.detail, /ready/, `${door.id}: the latest public detail changes to ready`);

    refit(t, starter);
    pastCooldown(t);
    pulse(t);
    ({ part, signal } = sf174(t, body.id));
    assert.equal(part.ready, false, `${door.id}: reverting the fit restores the refusal`);
    assert.match(signal.detail, /not yet/);
  }
});

// ── case 3b: what the prompt actually paints ──────────────────────────────────────────────

// The prompt reads payload.primary through the real signalInvestigationPrompt adapter onto
// the prompt deck — a deck stub at the getPromptDeck() seam captures the spec the player
// reads, so this asserts the presented detail, not a row in signals[].
function attachPrompt(t) {
  const specs = [];
  const resolves = [];
  setPromptDeck({
    offerDecision(spec) { specs.push(spec); return true; },
    updateDecision() { return true; },
    resolveDecision(id) { resolves.push(id); return true; },
    hasDecision() { return false; },
    clearAll() {},
  });
  const adapter = createSignalInvestigationPrompt({ state: t.state, bus: t.bus });
  return {
    specs,
    resolves,
    adapter,
    latest(id) {
      for (let i = specs.length - 1; i >= 0; i--) if (specs[i].id === id) return specs[i];
      return null;
    },
    painted() {
      const spec = specs.at(-1);
      assert.ok(spec && spec.detail, 'the prompt painted a scan-return decision');
      return spec.detail;
    },
    capability() {
      const spec = this.latest('signal:capability');
      assert.ok(spec && spec.detail, 'the deck holds a capability-door decision');
      return spec;
    },
    detach() { setPromptDeck(null); },
  };
}

test('the scan prompt paints the door verdict on the presented primary across a refit', () => {
  const starter = starterFit();
  // The Disputed Keg (line door, shares the scan with the customs lesson) and the Spare
  // Keg (tow door): both verdicts must reach the painted detail, not just the signals list.
  for (const door of DOORS.filter(
    (d) => d.id === 'oneoff_tethys_tally_keg' || d.id === 'oneoff_spare_keg',
  )) {
    const spec = ONE_OFF_BY_ID.get(door.id);
    const t = bootScan(spec.sectorId);
    materialize(t, spec.sectorId);
    const body = bodyOf(t.state, door.id);
    placeNear(t, body);
    const prompt = attachPrompt(t);
    try {
      refit(t, starter);
      pulse(t);
      let detail = prompt.painted();
      assert.match(detail, /not yet/, `${door.id}: the presented refusal reaches the player`);
      const primary = t.events.results.at(-1).primary;
      assert.match(primary.detail, /not yet/, `${door.id}: the primary row carries the verdict`);
      if (door.id === 'oneoff_tethys_tally_keg') {
        // Folding the verdict onto the lesson row keeps the lesson's own fact reachable —
        // the customs teaching is still on the painted line, never replaced.
        assert.match(detail, /customs cone is the legal gate/i,
          'the customs fact survives on the painted line');
      }

      pastCooldown(t);
      refit(t, readyFitFor(door));
      pulse(t);
      detail = prompt.painted();
      assert.match(detail, /ready/, `${door.id}: the presented verdict opens on the refit`);

      pastCooldown(t);
      refit(t, starter);
      pulse(t);
      detail = prompt.painted();
      assert.match(detail, /not yet/, `${door.id}: reverting the fit restores the painted refusal`);

      // The verdict reaches the presented primary across the whole supported wreck-reveal
      // range — the pulse's tighter "nearby" set ends at 1,200 WU but wrecks reveal out to
      // SCAN_REVEAL_CLASS_RADIUS, and the door must paint at both distances.
      pastCooldown(t);
      placeNear(t, body, 1300);
      pulse(t);
      detail = prompt.painted();
      assert.match(detail, /not yet/, `${door.id}: the verdict still paints at 1,300 WU`);
      pastCooldown(t);
      placeNear(t, body, SCAN_REVEAL_CLASS_RADIUS - 50);
      pulse(t);
      detail = prompt.painted();
      assert.match(detail, /not yet/, `${door.id}: the verdict still paints at the far reveal edge`);
    } finally {
      prompt.detach();
    }
  }
});

test('the door verdict survives the production route where spectrum overwrites the result card', () => {
  // Codex review-5: with registered [scanner, spectrum, scanReveal], a live spectrum case
  // answers the same pulse with its own signal:scanResults — "FAINT · 0 WU · PASS 1 —
  // Occluded" — which replaces the signal:results decision wholesale. The verdict must ride
  // its own decision so the final player-visible route still carries it. Helios Prime is a
  // placed spectrum sector: the case arms itself on the first flight tick, no fixture help.
  const starter = starterFit();
  const spec = ONE_OFF_BY_ID.get('oneoff_great_tanker');
  const t = bootScan(spec.sectorId, { withSpectrum: true });
  materialize(t, spec.sectorId);
  const tanker = bodyOf(t.state, 'oneoff_great_tanker');
  placeNear(t, tanker);
  const prompt = attachPrompt(t);
  try {
    refit(t, starter);
    pulse(t);

    // The overwrite really happened: the latest scan-return card is the spectrum row, not
    // the verdict batch — this is the negative control proving the route was exercised.
    const result = prompt.latest('signal:results');
    assert.ok(result, 'spectrum published its return onto the result card');
    assert.doesNotMatch(result.detail, /tow class|not yet|ready/i,
      'the result card no longer carries the door verdict — the overwrite is real');

    // And the verdict is still on the deck, on its own decision the overwrite cannot touch.
    // Helios carries more than one gated wreck inside the reveal radius, so the card may
    // list several doors — every one of them refused on the starter fit.
    const card = prompt.capability();
    assert.match(card.detail, /Mass of Another Age: /, 'the card names its own subject');
    assert.match(card.detail, /800 t of tow class/, 'the refusal names the authored requirement');
    assert.doesNotMatch(card.detail, /— ready\./, 'no door reads ready on the starter fit');

    pastCooldown(t);
    refit(t, readyFitFor(DOORS.find((d) => d.id === 'oneoff_great_tanker')));
    pulse(t);

    const opened = prompt.capability();
    assert.match(opened.detail, /800 t of tow class\. Your line will take it — ready\./,
      'the refit flips the surviving Tanker verdict to ready');
    assert.doesNotMatch(prompt.latest('signal:results').detail, /ready|tow class/i,
      'the second spectrum return still replaced the result card');
  } finally {
    prompt.detach();
  }
});

// ── case 4: no false line or tow acceptance ────────────────────────────────────────────────

test('the head-qualified line door cannot be satisfied by rating alone', () => {
  const kegNeed = ONE_OFF_BY_ID.get('oneoff_tethys_tally_keg').revisitNeed;
  const starter = starterFit();

  // The starter's ordinary line is rated past anything it can fly — and still fails: the
  // door names a head, not a load number.
  const starterDoor = revisitDoorState(
    { derived: starter.derived, fittings: starter.fittings, features: PRODUCTION_FEATURES },
    kegNeed,
  );
  assert.equal(starterDoor.ready, false);
  assert.equal(starterDoor.headReady, false);
  assert.equal(starterDoor.haveHeadId, null, 'the starter has no specialist head');

  // The correct head fitted but its production feature flag off: denied.
  const whip = readyFitFor(DOORS.find((d) => d.id === 'oneoff_tethys_tally_keg'));
  assert.equal(whip.derived.masslineHeadId, 'elastic_whip', 'the Hawser fit really carries the head');
  const flagOff = {
    ...PRODUCTION_FEATURES,
    massline2: { ...PRODUCTION_FEATURES.massline2, masslineHeadElasticWhip: false },
  };
  const disabled = revisitDoorState(
    { derived: whip.derived, fittings: whip.fittings, features: flagOff },
    kegNeed,
  );
  assert.equal(disabled.headReady, false, 'the runtime flag is part of the admission');
  assert.equal(disabled.ready, false);

  // The correct head fitted and admitted: accepted.
  const enabled = revisitDoorState(
    { derived: whip.derived, fittings: whip.fittings, features: PRODUCTION_FEATURES },
    kegNeed,
  );
  assert.equal(enabled.headReady, true);
  assert.equal(enabled.ready, true);

  // An unknown head qualifier fails closed — never a phantom ready.
  const unknown = revisitDoorState(
    { derived: whip.derived, fittings: whip.fittings, features: PRODUCTION_FEATURES },
    { kind: 'line', speedWuPerS: 1, headId: 'flux_coupler_mk7' },
  );
  assert.equal(unknown.headReady, false);
  assert.equal(unknown.ready, false);

  // Speed-only line requirements keep their established semantics.
  const ordinary = revisitDoorState(
    { derived: starter.derived, fittings: starter.fittings },
    { kind: 'line', speedWuPerS: 5000 },
  );
  assert.equal(ordinary.ready, true, 'a bare line door still reads "holds any swing"');
  assert.equal(ordinary.requiredHeadId, undefined);
});

test('an unrelated 900 t hulk beside the Tanker does not improvise the starter in', () => {
  const starter = starterFit();
  const spec = ONE_OFF_BY_ID.get('oneoff_great_tanker');
  const t = bootScan(spec.sectorId);
  materialize(t, spec.sectorId);
  const tanker = bodyOf(t.state, 'oneoff_great_tanker');
  // A heavy neighbour inside improvised-hitch range is not a tow class.
  const neighbour = t.sim.spawn({
    type: 'wreck', team: 0, mass: 900, radius: 40,
    pos: { x: tanker.pos.x + 30, z: tanker.pos.z }, vel: { x: 0, z: 0 },
    hull: 500, hullMax: 500, collides: true, data: {},
  });
  assert.ok(Math.hypot(neighbour.pos.x - tanker.pos.x, neighbour.pos.z - tanker.pos.z) <= 60,
    'the hulk sits inside the old improvised-hitch range');
  refit(t, starter);
  placeNear(t, tanker);
  pulse(t);
  const { part } = sf174(t, tanker.id);
  assert.equal(part.ready, false, 'a parked hulk cannot stand in for a tow class');
  assert.equal(part.verdict, 'not yet');
  assert.equal(part.improvised, false);
});

// ── case 5: the accepted verbs have physical effects ───────────────────────────────────────

// Tow doors are a rating gate, not a hard ability gate: the door reads the same tow-class
// function the fittings feed. The starter's class sits below every authored load and each
// legal fit's class clears it — and the public scan verdict flips on the same rating.
// (Codex round-2 amendment: the plan's "ready fit reaches 60 WU/s in 1.5 s" kernel bar is
// unreachable even for the pre-existing authored doors — the Hawser measures ~21 WU/s in
// that window on 240 t — so no physical tow-bar is claimed here; the physical consequence
// of towing is lg-tow-predict.test.mjs's lane.)
// Codex round-4: with two gated wrecks inside the reveal radius, the appended verdict must
// be the NEAREST wreck's — named, deterministic, never Map insertion order — and the lesson
// row's own Track target must not move to the wreck it is quoting.
test('overlapping doors: the painted verdict names the nearest gated wreck and Track stays put', async () => {
  // The lesson rows that carry a bundled verdict live around the tethys places, so the
  // second door is a fixture wreck beside the Disputed Keg — a real gated subject for the
  // selector (entity + oneOffId + revisitNeed), not a stubbed lesson.
  const spec = ONE_OFF_BY_ID.get('oneoff_tethys_tally_keg');
  const t = bootScan(spec.sectorId);
  materialize(t, spec.sectorId);
  const keg = bodyOf(t.state, 'oneoff_tethys_tally_keg');
  assert.ok(keg, 'the keg materializes');
  const spareNeed = WORLD_ONE_OFFS.find((r) => r.id === 'oneoff_spare_keg').revisitNeed;
  const spare = t.sim.spawn({
    type: 'wreck', alive: true,
    pos: { x: keg.pos.x - 1800, z: keg.pos.z }, vel: { x: 0, z: 0 },
    data: { oneOffId: 'oneoff_spare_keg', revisitNeed: spareNeed },
  });
  const prompt = attachPrompt(t);
  const detailOf = (r) => (r.discovery && r.discovery.detail) || r.detail || '';
  try {
    placeNear(t, keg, 40);
    pulse(t);
    let res = t.events.results.at(-1);
    let named = (res.signals || []).filter((r) => /The Disputed Keg:/.test(detailOf(r)));
    assert.ok(named.length > 0,
      `the nearer wreck names its verdict on the bundled rows — got: ${JSON.stringify((res.signals || []).map(detailOf))}`);
    assert.equal(
      (res.signals || []).filter((r) => /The Spare Keg:/.test(detailOf(r))).length, 0,
      'the farther door does not supply the text');
    // Track stays every row's own destination — the bundled row keeps its place.
    for (const row of named) {
      assert.notDeepEqual(row.pos, keg.pos,
        'Track keeps the lesson place, never the wreck whose verdict rode the row');
    }
    // Codex round-5: the appended part is TEXT ONLY — it must not win bundle()'s action
    // selection, so no bundled row navigates to the wreck it is quoting. SF-174 outranks
    // the lesson SFs, which is exactly the trap the reviewer measured at the Ceres tug.
    for (const row of res.signals || []) {
      if (!row.discovery || row.discovery.lesson !== true) continue;
      const partsMap = row.discovery.parts || {};
      const part = partsMap['SF-174'];
      if (!part || Object.keys(partsMap).length === 1) continue; // own rows keep full nav
      assert.equal(part.pos, null, 'the appended capability part carries no navigation');
      assert.equal(part.trackable, false, 'the appended capability part is not trackable');
      assert.notDeepEqual(row.discovery.actionPos, keg.pos,
        'Track keeps the lesson destination, never the wreck the text is about');
    }
    // Now the fixture door sits between the player and the keg at the lesson-rich spot —
    // the nearer subject's name must paint, never whichever wreck Map.values() yielded first.
    pastCooldown(t);
    spare.pos.x = keg.pos.x + 30; spare.pos.z = keg.pos.z;
    pulse(t);
    res = t.events.results.at(-1);
    assert.ok((res.signals || []).filter((r) => /The Spare Keg:/.test(detailOf(r))).length > 0,
      `the nearer door supplies the named verdict — got: ${JSON.stringify((res.signals || []).map(detailOf))}`);
    assert.equal(
      (res.signals || []).filter((r) => /The Disputed Keg:/.test(detailOf(r))).length, 0,
      'the now-farther door no longer paints');
  } finally {
    prompt.detach();
  }
});

test('tow: door readiness follows the same tow-class rating the door reads', () => {
  const starter = starterFit();
  for (const door of DOORS.filter((d) => d.need.kind === 'tow')) {
    const load = door.need.massT;
    const starterClass = towClassMassFor(starter.derived);
    assert.ok(starterClass + 1e-9 < load,
      `${door.id}: starter tow class ${starterClass.toFixed(1)} t < ${load} t`);
    const before = revisitDoorState(
      { derived: starter.derived, fittings: starter.fittings, features: PRODUCTION_FEATURES },
      door.need,
    );
    assert.equal(before.ready, false, `${door.id}: the starter's rating refuses the door`);
    const readyFit = readyFitFor(door);
    const readyClass = towClassMassFor(readyFit.derived);
    assert.ok(readyClass + 1e-9 >= load,
      `${door.id}: ${readyFit.shipId} tow class ${readyClass.toFixed(1)} t >= ${load} t`);
    const after = revisitDoorState(
      { derived: readyFit.derived, fittings: readyFit.fittings, features: PRODUCTION_FEATURES },
      door.need,
    );
    assert.equal(after.ready, true, `${door.id}: the legal fit's rating clears the door`);
  }
});

test('line: a stretched Elastic Whip on the disputed keg stores and releases real energy', async () => {
  const STANDARD = ATTACHMENT_DEFS.find((d) => d.id === 'tether_standard');
  const whip = readyFitFor(DOORS.find((d) => d.id === 'oneoff_tethys_tally_keg'));
  const policy = effectiveTetherPolicy(STANDARD, { data: { derived: whip.derived } }, PRODUCTION_FEATURES);
  assert.equal(policy.headId, 'elastic_whip', 'the fit presents the real head');
  const kegMass = ONE_OFF_BY_ID.get('oneoff_tethys_tally_keg').physicalBody.mass;
  const makeBody = (id, x, mass) => ({
    id, type: 'ship', alive: true, radius: 8, mass, maxSpeed: 170,
    physicsBody: { schemaVersion: 1, radius: 8, mass, inertiaY: 64, dynamic: true, ccd: true, revision: 0 },
    pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, data: {},
  });
  const owner = makeBody('whip-owner', 0, whip.derived.operationalMass || whip.derived.mass);
  const keg = makeBody('disputed-keg', 120, kegMass);
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([owner, keg]);
    const handle = runtime.createAttachment({
      attachmentId: 'keg-whip', defId: 'tether_standard',
      ownerId: owner.id, targetId: keg.id,
      sourceWorld: owner.pos, targetWorld: keg.pos,
      restLength: 80, spring: policy.spring, tick: 0,
    });
    assert.ok(handle, 'the whip latches the disputed keg');
    let telemetry = null;
    for (let tick = 0; tick < 60; tick += 1) {
      runtime.step(DT);
      telemetry = runtime.getAttachmentTelemetry({ attachmentId: handle.attachmentId });
      if (telemetry && telemetry.storedEnergy > 0) break;
    }
    assert.ok(telemetry && telemetry.storedEnergy > 0,
      'the stretched live attachment stores positive spring energy');
    const before = { x: owner.vel.x, z: owner.vel.z };
    assert.equal(runtime.cutAttachment({ attachmentId: handle.attachmentId }), true,
      'the deliberate release is the existing cut verb');
    runtime.step(DT);
    // A release that returns true without removing the attachment must fail: the telemetry
    // feed is the runtime's own report that the latch is actually gone, and a continued
    // spring pull would keep answering it.
    assert.equal(runtime.getAttachmentTelemetry({ attachmentId: handle.attachmentId }) ?? null, null,
      'the released attachment is actually removed — a no-op release would still report it');
    const delta = Math.hypot(owner.vel.x - before.x, owner.vel.z - before.z);
    assert.ok(delta > 0, `the release spends the stored energy as a nonzero physical response (${delta.toFixed(3)} WU/s)`);
  } finally {
    runtime.dispose();
  }
});

// The real countermeasures deploy owner on a bare player ship — `state.input`'s
// deployCountermeasure edge fires `_tryDeploy`, which selects the FIRST fitted
// `mods.countermeasure` block via equippedCountermeasure. Shared by the field tests below.
const makeBus = () => {
  const handlers = {};
  const seen = {};
  return {
    on(name, fn) { (handlers[name] || (handlers[name] = [])).push(fn); },
    emit(name, payload) {
      (seen[name] || (seen[name] = [])).push(payload);
      for (const fn of handlers[name] || []) fn(payload);
    },
    events(name) { return seen[name] || []; },
  };
};

const bootCm = (fittings) => {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    flags: {}, data: { fittings, combat: {} },
  };
  const state = {
    mode: 'flight', playerId: 1, tick: 0, simTime: 0,
    meta: { seed: SEED }, rng: mulberry32(SEED),
    input: { deployCountermeasure: false, actions: {} },
    combat: {}, entities: new Map([[1, player]]), entityList: [player],
    entityIndex: { __spacefaceEntityIndexV1: true, ships: [player], projectiles: [] },
  };
  const bus = makeBus();
  const cm = Object.create(countermeasures);
  cm.init({ state, bus, helpers: {} });
  return { state, cm, bus, player };
};

test('field: the real countermeasures owner deploys the named decoy buoy on a legal fit', () => {
  // Without the module the same press deploys nothing.
  const bare = bootCm(NEW_GAME.fittedModules.slice());
  bare.state.input.deployCountermeasure = true;
  bare.cm.update(DT, bare.state);
  assert.equal(bare.bus.events('countermeasure:deployed').length, 0,
    'no module, no field — the press is honestly refused');
  assert.equal(bare.bus.events('countermeasure:denied')[0].reason, 'no_module');

  // The legal decoy fit drops a live timed buoy at the authored radius.
  const fit = readyFitFor(DOORS.find((d) => d.id === 'oneoff_held_note'));
  assert.ok(fit.fittings.includes('mod_decoy_buoy_s'));
  const armed = bootCm(fit.fittings);
  armed.state.input.deployCountermeasure = true;
  armed.cm.update(DT, armed.state);
  const deployed = armed.bus.events('countermeasure:deployed');
  assert.equal(deployed.length, 1, 'the press deploys');
  assert.equal(deployed[0].kind, 'decoy');
  assert.equal(deployed[0].radius, 620, 'the buoy waters match the authored door');
  const live = armed.player.data.cm;
  assert.ok(live.effect && live.effect.cfg.kind === 'decoy', 'a live decoy effect is in the water');
  assert.ok(live.effectT > 0, 'the effect is timed, not instantaneous');
});

// Codex round-9 (review-9): one press throws ONE countermeasure — the first one fitted —
// but the door used to quote the largest-radius one aboard. A Hawser with the chaff
// dispenser seated ahead of the buoy carried both modules, the card promised the buoy
// ("Your Signal Decoy Buoy S throws it — ready"), and the press deployed chaff into a
// no_lock refusal. The capability law now mirrors the deployment owner's ordering, so the
// door reads "not yet" and the press's denial is the honest one.
test('field: a chaff dispenser seated ahead of the buoy keeps the door honestly shut', () => {
  const spec = ONE_OFF_BY_ID.get('oneoff_held_note');
  // A legal Hawser mixed fit — three M utility bays take the M dispenser and the S buoy —
  // with the refit order deciding which module the countermeasure key fires.
  const chaffFirst = resolveFit('ship_hawser', ['mod_chaff_dispenser_m', 'mod_decoy_buoy_s']);
  const decoyFirst = resolveFit('ship_hawser', ['mod_decoy_buoy_s', 'mod_chaff_dispenser_m']);
  const at = (fit, id) => fit.fittings.indexOf(id);
  assert.ok(at(chaffFirst, 'mod_chaff_dispenser_m') >= 0
    && at(chaffFirst, 'mod_chaff_dispenser_m') < at(chaffFirst, 'mod_decoy_buoy_s'),
    'fixture check — the dispenser really seats ahead of the buoy in the fittings list');
  assert.ok(at(decoyFirst, 'mod_decoy_buoy_s') >= 0
    && at(decoyFirst, 'mod_decoy_buoy_s') < at(decoyFirst, 'mod_chaff_dispenser_m'),
    'fixture check — reversing the refit order seats the buoy first');

  // The capability law itself now reads the same first-fitted selection the key obeys.
  const blocked = revisitDoorState(
    { derived: chaffFirst.derived, fittings: chaffFirst.fittings, features: PRODUCTION_FEATURES },
    spec.revisitNeed,
  );
  assert.equal(blocked.ready, false,
    'chaff ahead of the buoy cannot throw the named decoy — the door stays shut');
  assert.equal(blocked.have.kind, 'chaff', 'the capability row names what the key would throw');
  const open = revisitDoorState(
    { derived: decoyFirst.derived, fittings: decoyFirst.fittings, features: PRODUCTION_FEATURES },
    spec.revisitNeed,
  );
  assert.equal(open.ready, true, 'the same two modules in deploy order open the door');
  assert.equal(open.have.kind, 'decoy');

  // The painted verdict agrees on the public scan route: the Held Note refuses the
  // chaff-first fit instead of promising a buoy the key cannot reach.
  const t = bootScan(spec.sectorId);
  materialize(t, spec.sectorId);
  const body = bodyOf(t.state, 'oneoff_held_note');
  assert.ok(body, 'the Held Note materializes');
  refit(t, chaffFirst);
  placeNear(t, body);
  pulse(t);
  const { part } = sf174(t, body.id);
  assert.equal(part.ready, false, 'the scan verdict refuses the blocked fit');
  assert.equal(part.verdict, 'not yet');
  assert.match(part.sentence, /not yet/);
  assert.doesNotMatch(part.sentence, /Signal Decoy Buoy S throws it/,
    'the card never names a buoy the press would not throw');

  // And the press surfaces the honest denial — the first-fitted chaff, no live lock —
  // on the same fittings order the scan just read.
  const jammed = bootCm(chaffFirst.fittings);
  jammed.state.input.deployCountermeasure = true;
  jammed.cm.update(DT, jammed.state);
  assert.equal(jammed.bus.events('countermeasure:deployed').length, 0,
    'the chaff-first press deploys nothing');
  const denial = jammed.bus.events('countermeasure:denied')[0];
  assert.ok(denial, 'the refused press is a spoken denial, never a silent drop');
  assert.equal(denial.kind, 'chaff', 'the first fitted countermeasure is what answered the key');
  assert.equal(denial.reason, 'no_lock', 'chaff honestly refuses without an inbound seeker');

  // The same two modules in the other order: the key throws the buoy the door wants.
  const armed = bootCm(decoyFirst.fittings);
  armed.state.input.deployCountermeasure = true;
  armed.cm.update(DT, armed.state);
  const deployed = armed.bus.events('countermeasure:deployed');
  assert.equal(deployed.length, 1, 'the buoy-first press deploys');
  assert.equal(deployed[0].kind, 'decoy', 'first-fitted is the deployment owner\'s law');
  assert.equal(deployed[0].radius, 620);
});

// ── case 6: persistence and visibility do not become unlock gates ──────────────────────────

function bootWorld(seed = SEED) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  // The production runtime always carries its feature config; the harness must too, or the
  // headless flag fallback silently reads a different world than the game does.
  state.runtime = Object.freeze({ profileId: 'production', features: PRODUCTION_FEATURES });
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const world = Object.create(worldSystem);
  world.init(ctx);
  return { state, bus, helpers, world };
}

test('the durable record carries the body, never the door — readiness follows the live fit', () => {
  const starter = starterFit();
  for (const door of DOORS) {
    const spec = ONE_OFF_BY_ID.get(door.id);
    const sector = SECTOR_BY_ID.get(spec.sectorId);
    const boot = bootWorld();
    const active = { pois: [], stations: [], gates: [], dressing: [] };
    boot.world._spawnWorldOneOffs(sector, active);
    const body = bodyOf(boot.state, door.id);
    assert.ok(body, `${door.id} materializes`);
    const recordId = body.data.worldRecordId;
    assert.equal(recordId, stableRecordId(SEED, spec.sectorId, RECORD_KIND.WRECK, `worldOneOff:${door.id}`));

    // A haul persists: move the body, capture the sector's durable records, JSON the bag,
    // restore it into a fresh world and rematerialize through the existing methods.
    const moved = { x: body.pos.x + 500, z: body.pos.z - 120 };
    body.pos.x = moved.x;
    body.pos.z = moved.z;
    boot.world._captureSectorDurableRecords(spec.sectorId, { reason: 'revisit-slice-test' });
    const bag = boot.state.world.records;
    assert.ok(bag.byId[recordId], `${door.id}: the durable record is captured`);
    assert.equal(bag.byId[recordId].pos.x, moved.x, `${door.id}: the moved pose is the record`);
    const serialized = JSON.parse(JSON.stringify(bag));

    const restored = bootWorld();
    restored.world.deserialize({
      currentSectorId: spec.sectorId,
      coordinateSchema: 'global_v1',
      discovery: {},
      records: serialized,
    });
    const active2 = { pois: [], stations: [], gates: [], dressing: [], enemies: [] };
    restored.world._rematerializeSectorRecords(spec.sectorId, active2, RESIDENCY_TIER.FULL,
      { restoreDurableRecords: true });
    restored.world._spawnWorldOneOffs(sector, active2);
    const matches = restored.state.entityList.filter(
      (e) => e && e.data && e.data.worldRecordId === recordId,
    );
    assert.equal(matches.length, 1, `${door.id}: exactly one body for the durable identity`);
    const live = findLiveEntityForRecord(restored.state.entityList, recordId);
    assert.ok(live, `${door.id}: the record rematerializes a live body`);
    assert.equal(live, matches[0]);
    assert.equal(live.data.oneOffId, door.id, `${door.id}: identity survives the round trip`);
    assert.equal(live.pos.x, moved.x, `${door.id}: the haul is kept, not re-anchored`);
    assert.equal(live.pos.z, moved.z);
    assert.equal(live.mass, spec.physicalBody.mass, `${door.id}: the catalog mass is re-stamped`);
    assert.equal(live.data.revisitNeed == null, true,
      `${door.id}: no requirement is stamped on the body — the catalog answers`);

    // Rescan under the live fit: readiness is recomputed, never restored from the record.
    const reveal = Object.create(scanReveal);
    reveal.init({ state: restored.state, bus: restored.bus, helpers: {} });
    const player = restored.helpers.spawnEntity({
      type: 'ship', team: 0, pos: { x: live.pos.x + 40, z: live.pos.z },
      vel: { x: 0, z: 0 }, radius: 8, data: {},
    });
    restored.state.playerId = player.id;
    const rescan = () => {
      reveal._scanWrecks(restored.state, { x: live.pos.x + 40, z: live.pos.z });
      const part = live.data.scanRevealed && live.data.scanRevealed.discovery
        && live.data.scanRevealed.discovery.parts['SF-174'];
      assert.ok(part, `${door.id}: the lesson resolves off the restored body`);
      return part;
    };
    refitEntity(player, starter);
    assert.equal(rescan().ready, false, `${door.id}: the starter fit still refuses after restore`);
    const readyFit = readyFitFor(door);
    refitEntity(player, readyFit);
    assert.equal(rescan().ready, true, `${door.id}: the upgraded fit opens the door after restore`);
    // simTime is not an input to the door: a day passing changes nothing.
    refitEntity(player, starter);
    const before = rescan();
    restored.state.simTime += 24 * 3600;
    const after = rescan();
    assert.equal(after.ready, before.ready, `${door.id}: time alone never opens the door`);
    assert.equal(after.ready, false);
    reveal.destroy();
  }
});

function refitEntity(entity, fit) {
  entity.fittings = fit.fittings.slice();
  entity.derived = fit.derived;
}

// Codex round-6: the scanner publishes at most six rows — in a crowded belt the door's own
// row AND every lesson row that would carry the verdict can all be capped out. The verdict
// must still reach the deck: scanReveal publishes it on the dedicated scan:capabilityVerdicts
// event, computed from live entities on the pulse, never from the capped list.
test('a crowded scan cannot cap the capability verdict off the deck', () => {
  const starter = starterFit();
  const spec = ONE_OFF_BY_ID.get('oneoff_great_tanker');
  const t = bootScan(spec.sectorId, { withSpectrum: true });
  materialize(t, spec.sectorId);
  const tanker = bodyOf(t.state, 'oneoff_great_tanker');
  assert.ok(tanker, 'the Tanker materializes');
  // Park the player 500 WU from the Tanker — inside SCAN_REVEAL_CLASS_RADIUS — and crowd
  // the scan with six nearer ordinary wrecks so the published six-row batch has no room
  // for the door's own row or any lesson row carrying its verdict.
  placeNear(t, tanker, 500);
  for (let i = 0; i < 6; i++) {
    t.sim.spawn({
      type: 'wreck', alive: true, mass: 40 + i * 5, radius: 12,
      pos: { x: t.player.pos.x - 20 - i * 18, z: t.player.pos.z + (i - 3) * 6 },
      vel: { x: 0, z: 0 }, data: {},
    });
  }
  refit(t, starter);
  const prompt = attachPrompt(t);
  try {
    pulse(t);
    const batch = t.events.results.at(-1);
    assert.ok(batch, 'the scan published a result batch');
    const published = batch.signals || [];
    assert.ok(published.length <= 6, 'the published list respects the six-row cap');
    // Prove the repro is real: no published row carries the Tanker's capability part —
    // the cap actually excluded every route the verdict used to ride.
    const cappedPart = published.some((row) =>
      row && row.entityId === tanker.id
      && row.discovery && row.discovery.parts && row.discovery.parts['SF-174']);
    assert.equal(cappedPart, false,
      'fixture check — the door itself must be capped out of the published batch');
    const verdict = prompt.capability();
    assert.equal(verdict.id, 'signal:capability');
    assert.match(verdict.detail, /not yet/i, 'the starter fit still reads not yet');
    // Teardown resolves the adapter's own decisions — a destroyed adapter leaves no card.
    prompt.adapter.destroy();
    assert.ok(prompt.resolves.includes('signal:capability'),
      'destroy resolves the capability decision');
    assert.ok(prompt.resolves.includes('signal:results'), 'destroy resolves the scan result too');
  } finally {
    prompt.detach();
  }
});

// Codex round-7: the capped batch may carry a SUBSET of the pulse's verdicts — merging it
// must never shrink the dedicated event's complete set. Player 120 WU from the Spare Keg
// and ~1600 WU from the Tanker (both inside the reveal radius), five nearer ordinary
// wrecks crowding the six-row cap: the published batch has room for the Keg's verdict only;
// the card must still name the Tanker.
test('a capped subset cannot erase the farther door the pulse already proved', () => {
  const starter = starterFit();
  const kegSpec = ONE_OFF_BY_ID.get('oneoff_spare_keg');
  const tankerSpec = ONE_OFF_BY_ID.get('oneoff_great_tanker');
  assert.equal(kegSpec.sectorId, tankerSpec.sectorId,
    'fixture needs both authored doors in one sector (the Helios pair)');
  const t = bootScan(kegSpec.sectorId, { withSpectrum: true });
  materialize(t, kegSpec.sectorId);
  const keg = bodyOf(t.state, 'oneoff_spare_keg');
  const tanker = bodyOf(t.state, 'oneoff_great_tanker');
  assert.ok(keg && tanker, 'both doors materialize');
  placeNear(t, keg, 120);
  // Put the Tanker at the reveal edge from the player — inside SCAN_REVEAL_CLASS_RADIUS —
  // and crowd with five nearer ordinary wrecks so the cap keeps the Keg but drops rows
  // that would carry the Tanker.
  const dir = Math.sign(tanker.pos.x - t.player.pos.x) || 1;
  tanker.pos.x = t.player.pos.x + dir * (SCAN_REVEAL_CLASS_RADIUS - 50);
  tanker.pos.z = t.player.pos.z;
  for (let i = 0; i < 5; i++) {
    t.sim.spawn({
      type: 'wreck', alive: true, mass: 40 + i * 5, radius: 12,
      pos: { x: t.player.pos.x - 20 - i * 18, z: t.player.pos.z + (i - 2) * 6 },
      vel: { x: 0, z: 0 }, data: {},
    });
  }
  refit(t, starter);
  const prompt = attachPrompt(t);
  try {
    pulse(t);
    const batch = t.events.results.at(-1);
    assert.ok(batch && Array.isArray(batch.signals));
    const carriesTanker = batch.signals.some((row) =>
      row && row.entityId === tanker.id
      && row.discovery && row.discovery.parts && row.discovery.parts['SF-174']);
    assert.equal(carriesTanker, false,
      'fixture check — the Tanker verdict must be capped out of the published batch');
    const verdict = prompt.capability();
    // Both doors are in the event's complete set — the capped Keg-only batch must not
    // shrink it back to one.
    assert.equal(verdict.statusFlag, '2 DOORS', 'both doors stay on the card');
    const tankerLabel = String(tankerSpec.name || '').split(' — ')[0];
    const kegLabel = String(kegSpec.name || '').split(' — ')[0];
    assert.match(verdict.detail, new RegExp(tankerLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      'the dedicated event keeps the farther door');
    assert.match(verdict.detail, new RegExp(kegLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    assert.match(verdict.detail, /not yet/i);
  } finally {
    prompt.detach();
  }
});

// Codex round-8: both capability-selection gates used the bare catalog radius. A deepsurvey
// fit legitimately reveals a wreck at 2,600 WU — the reach is a fitted capability, not a
// constant — yet the verdict card and the lifted lesson copy both gated at a fixed 2,200 WU
// and silently dropped the door. Hawser's three M utility bays take the unique suite
// (scannerRadiusMult 2.25 → 4,950 WU of reveal), still far short of the Tanker's 800 t tow
// door, so the verdict must paint "not yet" at a range the bare radius could never serve.
test('the upgraded scanner keeps the door verdict on both selection paths at fitted range', () => {
  const tankerSpec = ONE_OFF_BY_ID.get('oneoff_great_tanker');
  const fit = resolveFit('ship_hawser', ['unique_deepsurvey_suite']);
  assert.ok(fit.fittings.includes('unique_deepsurvey_suite'),
    'the legal Hawser fit resolves the unique suite into its fittings');
  const tankerLabel = String(tankerSpec.name || '').split(' — ')[0];
  const tankerRe = new RegExp(tankerLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  // Path A — the dedicated card: crowd the six-row batch so no row can carry the verdict,
  // exactly the round-6 failure shape, now at a range the bare radius never reached.
  const t = bootScan(tankerSpec.sectorId, { withSpectrum: true });
  materialize(t, tankerSpec.sectorId);
  const tanker = bodyOf(t.state, 'oneoff_great_tanker');
  assert.ok(tanker, 'the Tanker materializes');
  placeNear(t, tanker, 2600);
  for (let i = 0; i < 6; i++) {
    t.sim.spawn({
      type: 'wreck', alive: true, mass: 40 + i * 5, radius: 12,
      pos: { x: t.player.pos.x - 20 - i * 18, z: t.player.pos.z + (i - 3) * 6 },
      vel: { x: 0, z: 0 }, data: {},
    });
  }
  refit(t, fit);
  // The sensor profile reads the durable fittings record — production stamps the resolved
  // module list on entity.data.fittings; a scratch player that only sets .fittings hides
  // the suite from the reveal and the verdict never had a chance.
  t.player.data.fittings = t.player.fittings.slice();
  const prompt = attachPrompt(t);
  try {
    pulse(t);
    const batch = t.events.results.at(-1);
    assert.ok(batch && Array.isArray(batch.signals));
    const carriesTanker = batch.signals.some((row) =>
      row && row.entityId === tanker.id
      && row.discovery && row.discovery.parts && row.discovery.parts['SF-174']);
    assert.equal(carriesTanker, false,
      'fixture check — the crowd caps every row that could carry the Tanker verdict');
    const verdict = prompt.capability();
    assert.match(verdict.detail, tankerRe,
      'the fitted reach keeps the Tanker verdict on the card at 2,600 WU');
    assert.match(verdict.detail, /800 t of tow class/, 'the refusal names the authored requirement');
    assert.match(verdict.detail, /not yet/i, 'a 287 t-class tug still refuses the 800 t door');
  } finally {
    prompt.detach();
  }

  // Path B — the lifted copy on the lesson rows. The lesson places only publish inside their
  // own anchors, which live around the tethys spots, so the second selection path is proven
  // on the Disputed Keg: stand in the lesson-rich pocket, push the door itself out to 2,600
  // WU — past the bare radius, inside the fitted one — and the appended verdict must still
  // name it. The Hawser carries no Elastic Whip head, so the line door honestly refuses.
  const kegSpec = ONE_OFF_BY_ID.get('oneoff_tethys_tally_keg');
  const kegLabel = String(kegSpec.name || '').split(' — ')[0];
  const t2 = bootScan(kegSpec.sectorId);
  materialize(t2, kegSpec.sectorId);
  const keg2 = bodyOf(t2.state, 'oneoff_tethys_tally_keg');
  assert.ok(keg2, 'the disputed keg materializes');
  placeNear(t2, keg2, 40);
  keg2.pos.x = t2.player.pos.x + 2600;
  keg2.pos.z = t2.player.pos.z;
  refit(t2, fit);
  t2.player.data.fittings = t2.player.fittings.slice();
  const prompt2 = attachPrompt(t2);
  try {
    pulse(t2);
    const batch2 = t2.events.results.at(-1);
    assert.ok(batch2 && Array.isArray(batch2.signals));
    const lifted = (batch2.signals || [])
      .filter((row) => row && row.discovery && row.discovery.lesson === true)
      .map((row) => row.discovery.parts && row.discovery.parts['SF-174'])
      .find((part) => part && part.lifted === true);
    assert.ok(lifted, 'a lesson row carries the appended verdict copy');
    assert.match(lifted.sentence || '', new RegExp(kegLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      'the lifted verdict names the far door at fitted range');
    assert.match(lifted.sentence || '', /not yet/i);
  } finally {
    prompt2.detach();
  }
});
