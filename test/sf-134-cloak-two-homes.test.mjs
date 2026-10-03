// SF-134 — "a rare capability with more than one useful home".
//
// Verdict: ALREADY TRUE, proven here rather than re-implemented. The capability is the fitted
// Shroud Cloak (mod_cloak_mk1 / mod_cloak_mk2, the Mk2 gated by tech_drive_tuning). ONE runtime
// (state.massline2.cloak) and ONE physical law (your noise ring vs. the observer's distance)
// already answers two distinct live contexts:
//
//   COMBAT      cloakHidesEntityFrom — the single gate aiPorts contacts, weapon locks and
//               in-flight seekers share (covered end-to-end by cloak-interplay.test.mjs).
//   WORLD/ECON  patrolCanInitiateScan — the lawful-inspection seam lawSecurity resolves as
//               'cloak_evaded' when a patrol cannot see you well enough to scan.
//
// This file proves the second home, the shared law, the attempt-without-the-capability, the
// counter, and the sell/refit entitlement cycle — the packet's acceptance cases.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import {
  MASSLINE2_FLAGS,
  PRODUCTION_FEATURES,
  snapshotFeatureMaps,
  restoreFeatureMaps,
} from '../src/data/featureFlags.js';
import { cloak, cloakHidesEntityFrom, fittedCloakModule } from '../src/systems/cloak.js';
import { patrolCanInitiateScan } from '../src/systems/encounterScripts.js';
import { MODULES } from '../src/data/modules.js';
import { TECH_NODES } from '../src/data/tech.js';
import { dryRunLoadoutPresetApply } from '../src/systems/ships.js';

const DT = 1 / 60;
const CLOAK_MODULE = 'mod_cloak_mk2'; // tier-4 shroud, requiresTech tech_drive_tuning

function makeWorld({ fittings = [CLOAK_MODULE], seed = 47 } = {}) {
  const bus = createBus();
  const playerEntity = {
    id: 1, type: 'ship', alive: true, team: 0, mass: 18,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, flags: {},
    data: { weapons: [], combat: {} },
  };
  // A lawful patrol parked well outside the base cloak ring, and a second one inside it.
  const patrolFar = { id: 7, type: 'ship', alive: true, pos: { x: 4000, z: 0 }, data: {} };
  const patrolNear = { id: 8, type: 'ship', alive: true, pos: { x: 100, z: 0 }, data: {} };
  const entityList = [playerEntity, patrolFar, patrolNear];
  const state = {
    mode: 'flight',
    playerId: 1,
    tick: 0,
    simTime: 0,
    meta: { seed },
    rng: mulberry32(seed),
    player: {
      ownedShips: [{ defId: 'ship_drifter', fittings: fittings.slice() }],
      activeShipIndex: 0,
      tether: null,
    },
    input: { fire: false, actions: {} },
    entities: new Map(entityList.map((e) => [e.id, e])),
    entityList,
    massline2: {},
  };
  const helpers = {
    getEntity: (id) => state.entities.get(id) || null,
    hash32,
    mulberry32,
  };
  const cloakSys = Object.create(cloak);
  cloakSys.init({ state, bus, helpers });
  return { state, bus, helpers, cloakSys, playerEntity, patrolFar, patrolNear };
}

function step(world, seconds = DT) {
  const steps = Math.max(1, Math.round(seconds / DT));
  for (let i = 0; i < steps; i++) {
    world.state.simTime += DT;
    world.state.tick += 1;
    world.cloakSys.update(DT, world.state);
  }
}

function engageCloak(world) {
  world.state.input.actions.cloakToggle = true;
  step(world);
  world.state.input.actions.cloakToggle = false;
  assert.equal(world.state.massline2.cloak.active, true, 'fitted shroud must engage on the toggle');
}

/** The cloak flag is a runtime-profile feature; pin it ON like the production route does. */
function withCloakFlag(fn) {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.cloak = true;
  try {
    fn();
  } finally {
    restoreFeatureMaps(snap);
  }
}

test('one fitted cloak answers two live contexts: combat sight and the lawful-inspection seam', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state, playerEntity, patrolFar, patrolNear } = world;

    engageCloak(world);
    const runtime = state.massline2.cloak;
    const baseRadius = MODULES.find((m) => m.id === CLOAK_MODULE).mods.cloakBaseRadius;
    assert.equal(runtime.radius, baseRadius, 'the quiet ring is the module\'s authored radius');

    // COMBAT home — the gate aiPorts contacts, weapon locks and seekers share: an observer
    // outside the live ring cannot see the hull.
    assert.equal(cloakHidesEntityFrom(state, patrolFar, playerEntity), true,
      'combat context: a distant observer reads nothing through the cloak');
    assert.equal(cloakHidesEntityFrom(state, patrolNear, playerEntity), false,
      'combat context: an observer inside the ring still sees you');

    // WORLD/ECONOMY home — the same runtime gates whether a lawful patrol can initiate its
    // customs scan. Outside the ring the scan cannot even begin (lawSecurity resolves that as
    // 'cloak_evaded'); inside it proceeds.
    assert.equal(patrolCanInitiateScan(state, patrolFar, playerEntity), false,
      'world context: a patrol outside the ring cannot open the scan');
    assert.equal(patrolCanInitiateScan(state, patrolNear, playerEntity), true,
      'world context: a patrol inside the ring scans as usual');

    // Same physical law in both: activity noise grows the ring. Thrusting flips BOTH gates —
    // the cloaked hull that was invisible to everyone becomes scannable AND visible at once.
    world.state.input.moveZ = 1;
    for (let i = 0; i < 240; i++) step(world);
    world.state.input.moveZ = 0;
    assert.ok(runtime.radius > baseRadius * 1.5,
      `thrust must grow the noise ring (got ${runtime.radius} vs base ${baseRadius})`);
    patrolFar.pos.x = runtime.radius * 0.9; // sit just inside the bloomed ring
    assert.equal(cloakHidesEntityFrom(state, patrolFar, playerEntity), false,
      'same law: a noisy cloak stops hiding you from combat observers');
    assert.equal(patrolCanInitiateScan(state, patrolFar, playerEntity), true,
      'same law: a noisy cloak lets the patrol open its scan');
  });
});

test('lawSecurity wires that same gate to the cloak_evaded inspection outcome', () => {
  // The functional gate is proven above; this asserts the call site still resolves the
  // denied scan as 'cloak_evaded' rather than silently clearing or flagging the player.
  const source = readFileSync(new URL('../src/systems/lawSecurity.js', import.meta.url), 'utf8');
  const idx = source.indexOf('patrolCanInitiateScan(state, patrol, player)');
  assert.ok(idx >= 0, 'the inspection owner must call the shared patrol-scan gate');
  const window = source.slice(idx, idx + 300);
  assert.match(window, /cloak_evaded/,
    'a patrol that cannot see the ship must resolve the inspection as cloak_evaded');
});

test('without the capability both gates stay open — comply remains the ordinary answer', () => {
  withCloakFlag(() => {
    const bare = makeWorld({ fittings: [] });
    assert.equal(fittedCloakModule(bare.state), null, 'no shroud fitted, no entitlement');
    step(bare, 1);
    assert.equal(bare.state.massline2.cloak.available, false);
    assert.equal(bare.state.massline2.cloak.active, false, 'no module, no cloak — the key does nothing');
    assert.equal(cloakHidesEntityFrom(bare.state, bare.patrolFar, bare.playerEntity), false);
    assert.equal(patrolCanInitiateScan(bare.state, bare.patrolFar, bare.playerEntity), true,
      'an uncloaked hull answers the inspection like any other ship');
  });
});

test('a sell/refit cycle removes and restores exactly the same entitlement', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state } = world;
    const baseRadius = MODULES.find((m) => m.id === CLOAK_MODULE).mods.cloakBaseRadius;

    engageCloak(world);
    assert.equal(state.massline2.cloak.radius, baseRadius);

    // Sell/unfit: the fittings record is the entitlement — remove the module and the verb
    // goes away on the next tick (active cloak drops, available clears).
    state.player.ownedShips[0].fittings = [null, null];
    step(world);
    assert.equal(state.massline2.cloak.active, false, 'unfitting the shroud drops the cloak');
    assert.equal(state.massline2.cloak.available, false);

    // Refit the same module: the identical entitlement returns — same radius, same rules.
    state.player.ownedShips[0].fittings = [CLOAK_MODULE, null];
    step(world);
    assert.equal(state.massline2.cloak.available, true);
    engageCloak(world);
    assert.equal(state.massline2.cloak.radius, baseRadius,
      'a refit restores the same ring, nothing banked, nothing extra');
    assert.equal(cloakHidesEntityFrom(state, world.patrolFar, world.playerEntity), true);
    assert.equal(patrolCanInitiateScan(state, world.patrolFar, world.playerEntity), false);
  });
});

test('the counter works the same in both contexts — one scan pulse opens both gates', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state, bus, playerEntity, patrolFar } = world;
    const burned = [];
    bus.on('cloak:burned', (p) => burned.push(p));

    engageCloak(world);
    step(world);
    assert.equal(cloakHidesEntityFrom(state, patrolFar, playerEntity), true);
    assert.equal(patrolCanInitiateScan(state, patrolFar, playerEntity), false);

    // The scanner system's pulse burns every cloak inside its sweep open for a bounded window;
    // the player's own ring blooms so raw-radius readers (the patrol seam) see the burn too.
    bus.emit('scan:pulse', { pos: { x: playerEntity.pos.x, z: playerEntity.pos.z } });
    assert.equal(burned.length, 1, 'the pulse emits one bounded burn for the cloaked player');
    assert.ok(burned[0].until > state.simTime, 'the reveal window is bounded');
    assert.equal(cloakHidesEntityFrom(state, patrolFar, playerEntity), false,
      'combat context: the burn opens the perception gate');
    assert.equal(patrolCanInitiateScan(state, patrolFar, playerEntity), true,
      'world context: the burn re-opens the patrol\'s scan — counterplay is shared, not bespoke');
  });
});

test('firing breaks the cloak — the aggressive answer costs you the smuggler\'s one', () => {
  withCloakFlag(() => {
    const world = makeWorld();
    const { state, bus, playerEntity, patrolFar } = world;
    engageCloak(world);
    assert.equal(patrolCanInitiateScan(state, patrolFar, playerEntity), false);
    bus.emit('combat:fire', { ownerId: playerEntity.id });
    assert.equal(state.massline2.cloak.active, false);
    assert.equal(patrolCanInitiateScan(state, patrolFar, playerEntity), true,
      'shooting drops the cloak and the inspection proceeds — the alternative stayed real');
  });
});

test('acquisition is discoverable through the tech path and gated at the fit boundary', () => {
  const cloakDef = MODULES.find((m) => m.id === CLOAK_MODULE);
  assert.ok(cloakDef, 'the shroud exists in the module catalog');
  assert.equal(cloakDef.requiresTech, 'tech_drive_tuning');
  const gate = TECH_NODES.find((n) => n.id === 'tech_drive_tuning');
  assert.ok(gate, 'the gating node exists');
  assert.deepEqual(gate.prereqs, [], 'drive tuning is an entry-tier node — reachable early');
  assert.ok(gate.unlocks.modules.includes(CLOAK_MODULE), 'the node names this module among its unlocks');

  // The fit boundary enforces the research honestly: ship_drifter carries two M utility slots
  // (indices 7 and 8 in the slot list); the dry-run refuses pre-research and accepts after.
  const targetFittings = [null, null, null, null, null, null, null, CLOAK_MODULE, null, null];
  const blocked = dryRunLoadoutPresetApply({
    shipDefId: 'ship_drifter',
    targetFittings,
    moduleInventory: [{ instanceId: 'inv_cloak', defId: CLOAK_MODULE }],
    player: { researchedNodes: [], cargo: { usedVolume: 0 } },
    enforceCargo: false,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'research_required');
  const allowed = dryRunLoadoutPresetApply({
    shipDefId: 'ship_drifter',
    targetFittings,
    moduleInventory: [{ instanceId: 'inv_cloak', defId: CLOAK_MODULE }],
    player: { researchedNodes: ['tech_drive_tuning'], cargo: { usedVolume: 0 } },
    enforceCargo: false,
  });
  assert.equal(allowed.ok, true, `researched fit must pass, got ${allowed.reason}`);

  // Production profile has the whole verb live on the default route — not a flag experiment.
  assert.equal(PRODUCTION_FEATURES.massline2.enabled, true);
  assert.equal(PRODUCTION_FEATURES.massline2.cloak, true);
});
