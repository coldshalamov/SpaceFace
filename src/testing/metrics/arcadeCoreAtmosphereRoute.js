import { createBus } from '../../core/eventBus.js';
import { physics } from '../../core/physics.js';
import { createSimulation, SIM_DT } from '../../core/sim.js';
import { FIELD_FLAGS } from '../../data/fields.js';
import { PLANET_FLAGS, PLANET_SITE } from '../../data/planets.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { ZONE_TETHYS_ANVIL } from '../../data/authoredPlaces.js';
import { fields } from '../../systems/fields.js';
import { flightV3 } from '../../systems/flightV3.js';
import { planetRuntime } from '../../systems/planetRuntime.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../../systems/ships.js';

export const ATMOSPHERE_REFERENCE_ENTRY_VELOCITIES = Object.freeze([40, 60, 80]);

const CONTROL_STATES = Object.freeze(['full-burn', 'uncontrolled']);
const MAX_ROUTE_S = 12;
// The controlled/uncontrolled comparison begins in the authored middle (danger) band. Starting
// inside reentry/descent would test recovery from the kill depth, not Plan 04's promised escape
// from the atmosphere band.
const START_RADIUS = 840;
// Existing Plan 04 production acceptance uses this hull value for its reference tumble. Keep the
// propulsion/body shape real while standardizing survivability so the 3–6 second band measures the
// atmosphere rather than whichever fitting happens to be the current new-game default.
export const ATMOSPHERE_REFERENCE_HULL = 48;
const CENTRE = Object.freeze(sectorLocalToGlobalForSector(
  ZONE_TETHYS_ANVIL.center,
  PLANET_SITE.sectorId,
));

function round4(value) {
  return Number(Number(value).toFixed(4));
}

function createCombatRecorder() {
  let state = null;
  const calls = [];
  return {
    name: 'combat',
    calls,
    kernel: {
      routeDamage(req) {
        calls.push({ ...req, at: state ? state.simTime : 0 });
        const target = state && state.entities.get(req.targetId);
        const channels = req && req.packet && req.packet.channels;
        const damage = channels
          ? Object.values(channels).reduce((total, value) => total + (Number(value) || 0), 0)
          : 0;
        if (target && target.hull != null) {
          target.hull -= damage;
          if (target.hull <= 0) target.alive = false;
        }
      },
    },
    init(ctx) { state = ctx.state; },
    update() {},
  };
}

function radiusOf(entity) {
  return Math.hypot(entity.pos.x - CENTRE.x, entity.pos.z - CENTRE.z);
}

async function runEntryCase(control, entryVelocity, seed) {
  const combat = createCombatRecorder();
  const sim = createSimulation({
    seed,
    bus: createBus(),
    // The controlled row is a real full burn, not merely planetRuntime's emergency assist.
    // Flight writes its force first; fields/planetRuntime add their impulses before physics owns
    // the solve, matching the production command-membrane order.
    systems: [flightV3, fields, planetRuntime, physics, combat],
  });
  const { state } = sim;
  const physicsSystem = sim.registry.get('physics');
  let prepared = false;

  try {
    state.mode = 'flight';
    state.input.actions = {};
    state.input.boost = control === 'full-burn';
    state.input.moveZ = control === 'full-burn' ? 1 : 0;
    state.input.throttle = control === 'full-burn' ? 1 : 0;
    state.world.currentSectorId = PLANET_SITE.sectorId;
    // The authored planet is galactic-global. Keep the unrelated starter-sector fence from adding
    // a second force to this focused production route.
    state.bounds = {
      radius: PLANET_SITE.bands.influence + 1000,
      hardRadius: PLANET_SITE.bands.influence + 1400,
      center: { x: CENTRE.x, z: CENTRE.z },
    };

    const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []);
    const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
      team: 0,
      isPlayer: true,
      player: state.player,
      fittings,
      pos: { x: CENTRE.x, z: CENTRE.z + START_RADIUS },
      // At +Z from the planet, PI/2 points the recovery-burn heading directly outward.
      rot: Math.PI / 2,
    }));
    player.vel.x = 0;
    player.vel.z = -entryVelocity;
    player.angVel = control === 'uncontrolled' ? 2.2 : 0;
    player.hull = ATMOSPHERE_REFERENCE_HULL;
    player.hullMax = ATMOSPHERE_REFERENCE_HULL;
    state.playerId = player.id;
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    prepared = await physicsSystem.prepareBackend(state);
    if (!prepared) throw new Error('Rapier dynamic physics authority was unavailable');

    const stages = [];
    sim.bus.on('planet:plungeStage', (event) => {
      if (event && event.id === player.id) stages.push({ stage: event.stage, at: state.simTime });
    });

    const entryAt = state.simTime;
    let outcome = 'timeout';
    let terminalAt = null;
    let escapedAt = null;
    let minRadius = radiusOf(player);
    let maxRadius = minRadius;

    while (state.simTime - entryAt < MAX_ROUTE_S) {
      state.input.boost = control === 'full-burn';
      state.input.moveZ = control === 'full-burn' ? 1 : 0;
      state.input.throttle = control === 'full-burn' ? 1 : 0;
      sim.step(SIM_DT);
      const radius = radiusOf(player);
      minRadius = Math.min(minRadius, radius);
      maxRadius = Math.max(maxRadius, radius);

      if (player.alive === false || player.hull <= 0) {
        outcome = 'burn';
        terminalAt = state.simTime;
        break;
      }

      const rec = state.planet && state.planet.player;
      const cleared = stages.some((entry) => entry.stage === 'clear');
      if (cleared && rec && rec.stage === null && radius > PLANET_SITE.bands.danger + PLANET_SITE.hysteresis) {
        outcome = 'escape';
        escapedAt = state.simTime;
        break;
      }
    }

    const firstDamage = combat.calls.find((call) => call.targetId === player.id);
    return Object.freeze({
      control,
      entryVelocity,
      outcome,
      elapsedS: round4(state.simTime - entryAt),
      burnS: terminalAt == null ? null : round4(terminalAt - entryAt),
      damageWindowS: terminalAt == null || !firstDamage ? null : round4(terminalAt - firstDamage.at),
      escapeS: escapedAt == null ? null : round4(escapedAt - entryAt),
      minRadius: round4(minRadius),
      maxRadius: round4(maxRadius),
      finalRadius: round4(radiusOf(player)),
      finalHull: round4(player.hull),
      damagePackets: combat.calls.filter((call) => call.targetId === player.id).length,
      stages: Object.freeze(stages.map((entry) => entry.stage)),
      fixedDt: SIM_DT,
      physicsBackend: state.physicsRuntime && state.physicsRuntime.diagnostics
        ? state.physicsRuntime.diagnostics.backend
        : null,
      referenceShipId: NEW_GAME.shipId,
      referenceHull: ATMOSPHERE_REFERENCE_HULL,
    });
  } finally {
    if (prepared && physicsSystem && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
      physicsSystem._disableSg02DynamicAuthority();
    }
    sim.dispose();
  }
}

/**
 * Run the Plan 09 atmosphere control matrix through the real fixed-step simulation route.
 *
 * Every row uses the exported fields, planetRuntime and physics systems. No trajectory, heat,
 * stage, recovery-assist or damage formula is duplicated here; the receipt only observes their
 * production consequences.
 */
export async function runArcadeCoreAtmosphereRoute(options = {}) {
  const velocities = Array.isArray(options.entryVelocities) && options.entryVelocities.length
    ? options.entryVelocities.map(Number)
    : ATMOSPHERE_REFERENCE_ENTRY_VELOCITIES;
  if (velocities.some((value) => !(Number.isFinite(value) && value > 0))) {
    throw new RangeError('entryVelocities must contain finite positive numbers');
  }

  const priorPlanetFlag = PLANET_FLAGS.enabled;
  const priorFieldFlag = FIELD_FLAGS.enabled;
  PLANET_FLAGS.enabled = true;
  FIELD_FLAGS.enabled = true;
  try {
    const cases = [];
    let caseIndex = 0;
    for (const control of CONTROL_STATES) {
      for (const entryVelocity of velocities) {
        cases.push(await runEntryCase(control, entryVelocity, (options.seed || 0xac0900) + caseIndex));
        caseIndex++;
      }
    }
    const uncontrolled = cases.filter((entry) => entry.control === 'uncontrolled');
    return Object.freeze({
      route: 'market-atmosphere',
      family: 'atmosphere',
      cases: Object.freeze(cases),
      referenceEntryVelocities: Object.freeze([...velocities]),
      referenceShipId: NEW_GAME.shipId,
      referenceHull: ATMOSPHERE_REFERENCE_HULL,
      uncontrolledBurnTimesS: Object.freeze(uncontrolled.map((entry) => Object.freeze({
        entryVelocity: entry.entryVelocity,
        outcome: entry.outcome,
        burnS: entry.burnS,
      }))),
      fixedDt: SIM_DT,
    });
  } finally {
    PLANET_FLAGS.enabled = priorPlanetFlag;
    FIELD_FLAGS.enabled = priorFieldFlag;
  }
}
