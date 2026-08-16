import { createBus } from '../../core/eventBus.js';
import { physics } from '../../core/physics.js';
import { createSimulation, SIM_DT } from '../../core/sim.js';
import { FIELD_FLAGS } from '../../data/fields.js';
import { PLANET_FLAGS, PLANET_SITE } from '../../data/planets.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { ZONE_TETHYS_ANVIL } from '../../data/authoredPlaces.js';
import { fields } from '../../systems/fields.js';
import { planetRuntime } from '../../systems/planetRuntime.js';

export const ATMOSPHERE_REFERENCE_ENTRY_VELOCITIES = Object.freeze([40, 60, 80]);

const CONTROL_STATES = Object.freeze(['full-burn', 'uncontrolled']);
const MAX_ROUTE_S = 12;
const START_RADIUS = 760;
const REFERENCE_HULL = 48;
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
    systems: [fields, planetRuntime, physics, combat],
  });
  const { state } = sim;
  const physicsSystem = sim.registry.get('physics');
  let prepared = false;

  try {
    state.mode = 'flight';
    state.input.actions = {};
    state.input.boost = control === 'full-burn';
    state.world.currentSectorId = PLANET_SITE.sectorId;
    // The authored planet is galactic-global. Keep the unrelated starter-sector fence from adding
    // a second force to this focused production route.
    state.bounds = {
      radius: PLANET_SITE.bands.influence + 1000,
      hardRadius: PLANET_SITE.bands.influence + 1400,
      center: { x: CENTRE.x, z: CENTRE.z },
    };

    const player = sim.spawn({
      type: 'ship',
      team: 0,
      pos: { x: CENTRE.x, z: CENTRE.z + START_RADIUS },
      radius: 12,
      collides: true,
      vel: { x: 0, z: -entryVelocity },
      // At +Z from the planet, PI/2 points the recovery-burn heading directly outward.
      rot: Math.PI / 2,
      angVel: control === 'uncontrolled' ? 2.2 : 0,
      hull: REFERENCE_HULL,
      hullMax: REFERENCE_HULL,
      flightModel: { inertia: 88 },
      flags: {},
      physicsBody: {
        schemaVersion: 1,
        radius: 12,
        mass: 28,
        inertiaY: 88,
        dynamic: true,
        ccd: true,
        material: 'ship',
        revision: 0,
      },
    });
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
