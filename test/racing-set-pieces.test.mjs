import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { RACE_LEVELS, RACE_CONTRACTS, racingSeedFor, raceGateGlobals } from '../src/data/raceLevels.js';
import { configureRacingCorridorSession } from '../src/world/racingCorridor.js';
import { segmentDistanceSquared } from '../src/world/arranger.js';
import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';
import { racingSetPieceDefinitions } from '../src/data/racingSetPieces.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { hasExplicitAuthoredPayloadPresentation } from '../src/core/presentationAdmission.js';
import { createRacingOpponents } from '../src/missions/racingOpponents.js';
import { createRacingSetPieces } from '../src/missions/racingSetPieces.js';

const DT = 1 / 60;
function fixture(level, mode = 'race') {
  const contract = RACE_CONTRACTS.find(row => row.levelId === level.id);
  const state = createGameState(racingSeedFor(contract.id)), bus = createBus(), helpers = {};
  state.mode = 'flight';
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  Object.create(core).init(ctx);
  const world = Object.create(worldSystem); world.init(ctx);
  configureRacingCorridorSession(state, true);
  const player = helpers.spawnEntity({ type: 'ship', isPlayer: true, pos: { x: 50000, z: 50000 }, radius: 32 });
  state.playerId = player.id; world.enterSector(level.sectorId);
  const mission = { id: 'set-piece-heat', type: 'race', status: 'active', params: {
    racingContractId: contract.id, raceMode: mode, raceDifficulty: 'club', raceOpponents: 3,
    courseId: level.course.courseId, courseSectorId: level.sectorId, gates: level.course.gates,
    gateRadiusWU: level.course.gateRadiusWU, courseLengthWU: level.course.courseLengthWU,
    closedCircuit: true, laps: 1, nextGate: 0, gridUntilSimS: 0.5, raceStartSimS: 0.5,
  } };
  state.missions.active = [mission];
  const pack = createRacingOpponents(ctx), pieces = createRacingSetPieces(ctx);
  const flight = Object.create(flightV3); flight.init(ctx);
  const ports = Object.create(aiPorts); ports.init(ctx);
  const tactical = createTacticalAISystem(); tactical.init(ctx);
  return { state, bus, helpers, mission, pack, pieces, flight, ports, tactical };
}

for (const level of RACE_LEVELS) test(`native race pack has a legal route through ${level.name} set pieces`, async () => {
  const { state, bus, mission, pack, pieces, flight, ports, tactical } = fixture(level);
  const warnings = []; bus.on('race:setPieceWarning', event => warnings.push({ ...event, at: state.simTime }));
  pack.update(mission); pieces.update(mission);
  const rivalIds = pack.inspect().rivals.map(row => row.entityId);
  const anchors = pieces.inspect().cues.filter(row => row.kind === 'anchor');
  const gates = raceGateGlobals(mission.params);
  assert.equal(anchors.length, 2, 'each course has two usable physical apex anchors');
  for (const cue of anchors) {
    const anchor = state.entities.get(cue.entityIds[0]);
    assert.ok(isAttachable(anchor, state.playerId, state), cue.name);
    assert.equal(anchor.physicsBody.dynamic, false, 'apex rock is a fixed physical anchor');
    const clearance = mission.params.gateRadiusWU + 32 + anchor.physicsBody.radius;
    assert.ok(gates.slice(1).every((b, i) => segmentDistanceSquared(anchor.pos, gates[i], b) >= clearance ** 2));
  }
  const refuge = pieces.inspect().cues.find(row => row.waitPos);
  const player = state.entities.get(state.playerId);
  if (refuge) {
    // Initial placement before native body creation: the largest supported hull
    // waits inside the marked refuge throughout the scheduled physical event.
    player.pos.x = refuge.waitPos.x; player.pos.z = refuge.waitPos.z;
    const roadDistance = Math.sqrt(Math.min(...gates.slice(1).map((b, i) => segmentDistanceSquared(refuge.waitPos, gates[i], b))));
    assert.ok(roadDistance + refuge.waitRadiusWU + player.radius <= mission.params.gateRadiusWU);
  }
  const terrain = [...state.entityList, ...(state.world.dressing?.rows || []), ...(state.world.asteroidField?.rocks || [])]
    .filter(entity => entity.id !== state.playerId && !rivalIds.includes(entity.id)
      && !entity.data?.raceSetPiece && entity.collides !== false && entity.type !== 'ship');
  const staticBodies = terrain.map((row, index) => {
    const radius = row.type === 'asteroid' ? asteroidColliderRadius(row.data?.typeId, row.radius) : row.radius;
    return { ...row, id: 100000 + index, radius, alive: true,
      physicsBody: { dynamic: false, mass: 1e8, radius }, vel: { x: 0, z: 0 } };
  });
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  let membership = '', contacts = 0;
  const contactPairs = new Map();
  const motion = new Map();
  const shutterDef = racingSetPieceDefinitions(level.course.courseId)?.shutter;
  const shutterPasses = new Map(), shutterPhases = new Set();
  try {
    for (let tick = 0; tick < 60 * 190; tick++) {
      state.tick = tick; state.simTime = tick * DT;
      const actors = [...rivalIds, ...(refuge ? [state.playerId] : []), ...pieces.inspect().entityIds].map(id => state.entities.get(id)).filter(Boolean);
      const nextMembership = actors.map(body => body.id).join(',');
      if (nextMembership !== membership) { owner.syncFromEntities([...actors, ...staticBodies]); membership = nextMembership; }
      const oldIntents = rivalIds.map(id => state.entities.get(id)?.data.intent);
      // The production manifest's relative order: tactical -> flight -> ports ->
      // physics -> missions. Passive race actors must keep the mission's helm.
      tactical.update(DT, state);
      for (let i = 0; i < rivalIds.length; i++) assert.strictEqual(state.entities.get(rivalIds[i]).data.intent, oldIntents[i]);
      flight.update(DT, state); ports.update(DT, state); owner.step(DT, tick);
      const hits = owner.drainContactImpacts().filter(hit => rivalIds.includes(hit.aId) || rivalIds.includes(hit.bId)
        || hit.aId === state.playerId || hit.bId === state.playerId);
      contacts += hits.length;
      for (const hit of hits) {
        const key = [hit.aId, hit.bId].sort((a, b) => a - b).join(':');
        contactPairs.set(key, (contactPairs.get(key) || 0) + 1);
      }
      pack.update(mission); pieces.update(mission);
      if (shutterDef) {
        const cue = pieces.inspect().cues.find(row => row.kind === 'shutter');
        shutterPhases.add(cue.phase);
        for (const rival of pack.inspect().rivals) if (rival.nextGate > shutterDef.legIndex + 1 && !shutterPasses.has(rival.id)) {
          shutterPasses.set(rival.id, state.simTime - mission.params.gridUntilSimS);
        }
        const body = state.entities.get(cue.entityIds[0]);
        if (body) {
          assert.ok(hasExplicitAuthoredPayloadPresentation(body), 'shutter uses the released physical cargo visual');
          const proxy = resolveCollisionProxyManifest(body);
          assert.equal(proxy.id, 'skin:pod_cargo_container:hull', 'native body uses the same measured model skin');
          const a = gates[shutterDef.legIndex], b = gates[shutterDef.legIndex + 1];
          const length = Math.hypot(b.x - a.x, b.z - a.z), nx = (b.x - a.x) / length, nz = (b.z - a.z) / length;
          const c = Math.cos(body.rot), s = Math.sin(body.rot);
          const mostLeft = Math.max(...proxy.compactHull.map(point => {
            const x = body.pos.x + body.radius * (point.x * c - point.z * s);
            const z = body.pos.z + body.radius * (point.x * s + point.z * c);
            return (x - cue.pos.x) * -nz + (z - cue.pos.z) * nx;
          }));
          const serviceRight = shutterDef.serviceLateralWU - cue.serviceWidthWU / 2;
          assert.ok(mostLeft <= serviceRight, `physical shutter retains the entire ${cue.serviceWidthWU}WU service cut`);
          assert.ok(cue.serviceWidthWU >= 2 * player.radius + 16, 'largest hull has passing clearance');
          assert.ok(shutterDef.serviceLateralWU + player.radius <= mission.params.gateRadiusWU);
        }
      }
      for (const id of pieces.inspect().entityIds) {
        const entity = state.entities.get(id);
        if (!entity || entity.data.raceSetPiece.kind === 'anchor') continue;
        const record = motion.get(id) || { first: { ...entity.pos }, distance: 0, kind: entity.data.raceSetPiece.kind };
        record.distance = Math.max(record.distance, Math.hypot(entity.pos.x - record.first.x, entity.pos.z - record.first.z));
        motion.set(id, record);
      }
      if (pack.inspect().rivals.every(row => row.status === 'finished')) break;
    }
    const results = pack.inspect().rivals;
    console.log(level.name, JSON.stringify({ results, contacts, contactPairs: [...contactPairs].map(([ids, count]) => ({ count, bodies: ids.split(':').map(id => {
      const body = state.entities.get(Number(id)) || staticBodies.find(row => row.id === Number(id));
      return { id, type: body?.type, name: body?.data?.name || body?.data?.typeId, pos: body?.pos };
    }) })), shutterPasses: [...shutterPasses.values()], motion: [...motion.values()].map(row => ({ kind: row.kind, distance: row.distance })) }));
    assert.ok(results.every(row => row.status === 'finished'), JSON.stringify(results));
    assert.equal(contacts, 0, 'an actual piloted pack completes the open physical route without unavoidable contacts');
    assert.equal(ports.inspect().acceptedManeuvers, 0, 'tactical AI never acquires race helm authority');
    if (refuge) assert.ok(Math.hypot(player.pos.x - refuge.waitPos.x, player.pos.z - refuge.waitPos.z) < 0.1,
      'waiting ship remains safe while the actual pack and hazard pass');
    for (const event of warnings) assert.ok(Math.abs(event.countdownS - event.warningS) < DT + 1e-6, 'full notice precedes movement');
    if (level.course.courseId.includes('helios')) assert.ok([...motion.values()].some(row => row.kind === 'crossing' && row.distance > 130));
    if (shutterDef) {
      assert.ok([...motion.values()].some(row => row.kind === 'shutter' && row.distance > 60), 'physical actuator closes the real body');
      assert.ok(['closing', 'closed', 'opening', 'clear'].every(phase => shutterPhases.has(phase)), 'the real body closes and retracts');
      assert.equal(shutterPasses.size, 3);
      assert.ok([...shutterPasses.values()].some(at => at >= shutterDef.startsAtS && at < shutterDef.opensAtS),
        'a native rival negotiates the shutter during its scheduled obstruction');
    }
    if (level.course.courseId.includes('veil')) {
      assert.equal([...motion.values()].filter(row => row.kind === 'wave').length, 3);
      assert.ok([...motion.values()].filter(row => row.kind === 'wave').every(row => row.distance > 130));
      assert.equal(pieces.inspect().cues.find(row => row.kind === 'wave').phase, 'clear');
    }
    const ids = [...pieces.inspect().entityIds]; pieces.stop('abort'); pack.stop('abort');
    assert.ok(ids.every(id => !state.entities.has(id)), 'cleanup releases every owned body');
  } finally { tactical.destroy(); owner.dispose(); }
});

test('time trial and race use identical schedules, and loaded campaign state spawns nothing', () => {
  const snapshots = [];
  for (const mode of ['time-trial', 'race', 'cup']) {
    const { state, mission, pieces, tactical } = fixture(RACE_LEVELS[2], mode);
    const cues = pieces.update(mission);
    snapshots.push(cues.map(({ id, phase, countdownS, pos, waitPos, waitRadiusWU }) => ({ id, phase, countdownS, pos, waitPos, waitRadiusWU })));
    const wave = cues.find(row => row.kind === 'wave');
    assert.ok(wave.waitRadiusWU >= 40);
    pieces.stop('restore'); configureRacingCorridorSession(state, false);
    assert.deepEqual(pieces.update(mission), []);
    assert.equal(pieces.inspect(), null); tactical.destroy();
  }
  assert.deepEqual(snapshots[0], snapshots[1]); assert.deepEqual(snapshots[1], snapshots[2]);
});
