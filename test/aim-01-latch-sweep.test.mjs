// AIM-01: at a human's aim error, who wins the latch — the throwable hostile or the room?
//
// THROW-01 browser fixtures (f4/f5/f6): with the Wasp slightly off the pointer, latches went to
// Foundry room solids (type 'station'), pickups and payloads; exactly under the pointer they went
// to the Wasp. This is a node sweep through the REAL pick: tetherGameplay's own update publishes
// the acquisition receipt (the aim tag's source) and a tetherFire press consumes it, exactly the
// path a Swarm run takes. No game boot.
//
// Lead decision under test: in a Swarm run a throwable hostile anywhere in the acquisition cone
// outranks room solids, payloads and pickups; they still win only when no throwable hostile is in
// the cone. Adventure selection is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { createBus } from '../src/core/eventBus.js';

const PLAYER_ID = 1;
const WASP_ID = 2;
const OFFSETS = [0, 10, 20, 30, 45, 60];
const DIRECTIONS = [
  ['+x', { x: 1, z: 0 }],
  ['+z', { x: 0, z: 1 }],
  ['-x', { x: -1, z: 0 }],
  ['-z', { x: 0, z: -1 }],
];
const WASP_POS = { x: 160, z: 0 };        // 120–200 u band, on the aim axis
const WASP_SPEED = 105;                   // wasp_swarmer combatSpeed — typical Swarm speed

function mkEntity(id, type, x, z, options = {}) {
  return {
    id,
    type,
    alive: true,
    team: options.team ?? 0,
    pos: { x, z },
    vel: { x: options.vx ?? 0, z: options.vz ?? 0 },
    radius: options.radius ?? 10,
    mass: options.mass ?? 500,
    flags: {},
    data: options.data || {},
  };
}

// Light hostile: the wave planner's ammunition class (mass <= THROW_CLASS_MAX_MASS, physicalClass
// 'ammunition'). ai.context 'encounter' + combat.targetId are the real hostility marks.
function wasp() {
  return mkEntity(WASP_ID, 'ship', WASP_POS.x, WASP_POS.z, {
    team: 1, radius: 12, mass: 16, vx: 0, vz: WASP_SPEED,
    data: {
      name: 'Wasp Swarmer',
      physicalClass: 'ammunition',
      runCohort: 'survival',
      ai: { archetype: 'swarmer', context: 'encounter', lawful: false, huntPlayer: true },
      combat: { targetId: PLAYER_ID },
    },
  });
}

// Foundry-like room solids: type 'station', big radius, at 250–410 u. Placed so their discs reach
// the aim region — the f5 geometry — without straddling the player→Wasp latch segment.
function roomSolids() {
  return [
    mkEntity(10, 'station', 280, 95, { radius: 150, mass: 50000, data: { name: 'Foundry Wall A' } }),
    mkEntity(11, 'station', 310, -90, { radius: 160, mass: 60000, data: { name: 'Foundry Wall B' } }),
    mkEntity(12, 'station', 250, -150, { radius: 140, mass: 40000, data: { name: 'Foundry Stack' } }),
  ];
}

function clutter() {
  return [
    mkEntity(20, 'pickup', 120, -120, { radius: 6, mass: 3, data: { name: 'Loose Cell' } }),
    mkEntity(21, 'payload', 90, 140, { radius: 9, mass: 40, data: { name: 'Adrift Crate' } }),
  ];
}

function makeHarness({ swarm = true, hostile = true, turnIntent = 0 } = {}) {
  const player = mkEntity(PLAYER_ID, 'ship', 0, 0, {
    team: 0, radius: 8, mass: 200, vx: 60, vz: 0,
  });
  const bodies = [
    player,
    ...(hostile ? [wasp()] : []),
    ...roomSolids(),
    ...clutter(),
  ];
  const entities = new Map(bodies.map((body) => [body.id, body]));
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: PLAYER_ID,
    player: {
      targetId: null,
      tether: { active: false, targetId: null },
      flybyFocus: { active: false, targetId: null },
    },
    entities,
    entityList: [...entities.values()],
    spatialHash: null,
    nav: { route: null, waypoint: null, autopilot: { targetEntityId: null } },
    run: swarm ? { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 3 } : null,
    input: {
      turnIntent,
      moveX: 0,
      moveZ: 1,
      aimWorld: { x: WASP_POS.x, z: WASP_POS.z },
      aimAngle: 0,
      // Swarm flies with autofire on; no gun lock means the mouse is the cursor, which is the
      // case the fixtures caught failing (a locked hostile already won through autoAim).
      autoFire: true,
      autoAim: null,
      aimIntentActive: true,
      pointerScreen: { x: 0, y: 0, active: true },
      actions: { tetherFire: false, tetherCut: false, reelDelta: 0, massline: null },
    },
  };
  const created = [];
  let active = null;
  const attachments = {
    listForEntity: () => [],
    get: (id) => (active && active.id === id ? active : null),
    create: (request) => {
      created.push(structuredClone(request));
      active = { id: `att-${created.length}`, targetId: request.targetId, state: 'active', restLength: 180 };
      return { ok: true, attachment: active };
    },
    cut: () => ({ ok: true }),
    targetSocketBlocker: () => null,
  };
  const kernel = {
    attachments,
    catalog: { attachments: new Map([['tether_standard', { id: 'tether_standard', maxLength: 390 }]]) },
  };
  const bus = createBus();
  const system = Object.assign({}, tetherGameplay);
  system.init({
    state,
    bus,
    helpers: {},
    registry: { get: (name) => (name === 'actions' || name === 'combat' ? { kernel } : null) },
  });
  const waspEntity = entities.get(WASP_ID) || null;
  return { state, system, created, wasp: waspEntity };
}

// One frame: the standing acquisition refresh publishes the tag's receipt.
// A second frame with tetherFire held is the press — the receipt is rebuilt from current aim and
// consumed, exactly the real latch.
function winners(h, aim) {
  h.state.input.aimWorld = { x: aim.x, z: aim.z };
  h.system.update(1 / 60, h.state);
  h.state.tick += 1;
  h.state.simTime += 1 / 60;
  const tagWinner = h.state.masslineAcquisition?.selected?.targetId ?? null;
  const tagLabel = h.state.masslineAcquisition?.selected?.targetLabel ?? null;
  const tagContext = h.state.masslineAcquisition?.selected?.intentLabel ?? null;
  h.state.input.actions.tetherFire = true;
  h.system.update(1 / 60, h.state);
  h.state.tick += 1;
  h.state.simTime += 1 / 60;
  const latchWinner = h.created.length ? h.created[h.created.length - 1].targetId : null;
  return { tag: tagWinner, tagLabel, tagContext, latch: latchWinner };
}

function nameOf(h, id) {
  if (id == null) return 'none';
  const entity = h.state.entities.get(id);
  return entity ? `${entity.data?.name || entity.type}#${id}` : `#${id}`;
}

function sweep({ title, hostile = true, swarm = true, turnIntent = 0 }) {
  const rows = [];
  for (const [dirName, dir] of DIRECTIONS) {
    for (const offset of OFFSETS) {
      const h = makeHarness({ swarm, hostile, turnIntent });
      const aim = { x: WASP_POS.x + dir.x * offset, z: WASP_POS.z + dir.z * offset };
      const result = winners(h, aim);
      rows.push({ offset, dir: dirName, aim, ...result, harness: h });
    }
  }
  const header = ['off\\dir', ...DIRECTIONS.map(([name]) => name)];
  const grid = new Map();
  for (const r of rows) grid.set(r.offset, grid.get(r.offset) || {});
  for (const r of rows) grid.get(r.offset)[r.dir] = nameOf(r.harness, r.latch).replace(/#\d+$/, '');
  console.log(`\n${title}`);
  console.log(['', ...header].join('\t'));
  for (const offset of OFFSETS) {
    const cells = DIRECTIONS.map(([name]) => grid.get(offset)[name] || '?');
    console.log(['', `${offset}`, ...cells].join('\t'));
  }
  return rows;
}

test('AIM-01 sweep: who wins the latch per aim offset (printed table)', () => {
  const rows = sweep({ title: 'SWARM — straight flight (wasp, 3 room solids, pickup, payload)' });
  for (const r of rows) {
    assert.equal(r.tag, r.latch,
      `offset ${r.offset} ${r.dir}: aim tag must name the same winner the latch picks`);
  }
});

test('AIM-01 sweep: steering toward the room (turn intent)', () => {
  sweep({ title: 'SWARM — steering toward the solids', turnIntent: 0.5 });
});

test('in a Swarm run the throwable Wasp wins every normal aim error (<=45u)', () => {
  for (const intent of [0, 0.5]) {
    for (const [dirName, dir] of DIRECTIONS) {
      for (const offset of OFFSETS.filter((o) => o <= 45)) {
        const h = makeHarness({ swarm: true, turnIntent: intent });
        const aim = { x: WASP_POS.x + dir.x * offset, z: WASP_POS.z + dir.z * offset };
        const r = winners(h, aim);
        assert.equal(r.latch, WASP_ID,
          `swarm, turn=${intent} offset ${offset} ${dirName}: the throwable hostile must win the latch`);
        assert.equal(r.tag, WASP_ID,
          `swarm, turn=${intent} offset ${offset} ${dirName}: the aim tag must name the Wasp`);
        assert.equal(r.tagLabel, 'Wasp Swarmer');
        assert.equal(h.state.masslineAcquisition.selected.status, 'ready');
      }
    }
  }
});

test('Adventure is unchanged: the swarm preference never fires outside a Swarm run', () => {
  const rows = sweep({ title: 'ADVENTURE — same geometry, no swarm ruleset', swarm: false });
  // In Adventure the ordinary scorer still rules: somewhere on this table a room solid, pickup or
  // payload still beats the hostile. If every cell went to the Wasp the Swarm rule leaked out.
  const nonWasp = rows.filter((r) => r.latch !== WASP_ID);
  assert.ok(nonWasp.length > 0,
    'Adventure: the throwable-hostile preference must not fire — expected at least one non-Wasp winner');
});

test('with no hostile in the cone the nearest valid body still wins as before', () => {
  const h = makeHarness({ swarm: true, hostile: false });
  const r = winners(h, { x: WASP_POS.x, z: WASP_POS.z });
  const winner = h.state.entities.get(r.latch);
  console.log(`\nSWARM — no hostile in cone: winner ${nameOf(h, r.latch)}`);
  assert.ok(winner, 'a valid body must still win with no hostile in the cone');
  assert.notEqual(winner.type, 'ship', 'no ship is in the cone — a room body wins');
  assert.equal(r.tag, r.latch, 'the aim tag names the same winner');
});
