// PQ-030 — a taut monofilament sweep draws as a world-XZ blade segment.
// Seed 30000. Present during the swing, gone the same tick the line is released or goes slack.
// The segment is the chord mesh beside the swing trace, not a screen-space card.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { getPropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { mulberry32 } from '../src/core/rng.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import {
  MONOFILAMENT_BLADE_TAUT_RATIO,
  vfx,
  writeTetherVisualEndpoints,
} from '../src/render/vfx.js';
import { NPC_LINE_CUT_TAUT_RATIO, tetherGameplay } from '../src/systems/tetherGameplay.js';

const SEED = 30000;
const DT = 1 / 60;
const SWING_SPEED = getPropulsionProfile('drive_reaction_s').combatSpeed;

function stubCombatPhysics() {
  const joints = new Map();
  return {
    createAttachment(input) {
      const handle = {
        id: input.attachmentId,
        attachmentId: input.attachmentId,
        ownerId: input.ownerId,
        targetId: input.targetId,
      };
      joints.set(input.attachmentId, handle);
      return handle;
    },
    cutAttachment(input) {
      joints.delete(input.attachmentId);
      return true;
    },
    setAttachmentReel() { return true; },
    getAttachmentTelemetry() { return null; },
  };
}

function spawn(id, type, pos, extra = {}) {
  return {
    id,
    type,
    team: extra.team ?? 2,
    alive: true,
    pos: { x: pos.x, z: pos.z },
    vel: { x: extra.vel?.x ?? 0, z: extra.vel?.z ?? 0 },
    rot: extra.rot ?? 0,
    radius: extra.radius ?? 8,
    mass: extra.mass ?? 20,
    collides: true,
    hull: extra.hull ?? 100,
    hullMax: extra.hull ?? 100,
    flags: {},
    data: extra.data || {},
  };
}

function setupSwing(options = {}) {
  const headId = options.headId || 'monofilament_sweep';
  const restLength = options.restLength ?? 100;
  const player = spawn(1, 'ship', { x: 0, z: 0 }, {
    team: 0,
    mass: 20,
    vel: { x: 0, z: options.swingSpeed ?? SWING_SPEED },
    data: { derived: { masslineHeadId: headId } },
  });
  const anchor = spawn(2, 'asteroid', { x: 100, z: 0 }, { mass: 800, radius: 16, team: null });
  const tug = spawn(3, 'ship', { x: 50, z: -40 }, {
    mass: 16,
    vel: { x: 40, z: 0 },
    data: { role: 'fighter', trafficRole: 'tug' },
  });
  const load = spawn(4, 'payload', { x: 50, z: 40 }, {
    mass: 80,
    radius: 4,
    vel: { x: 40, z: 0 },
    data: { towable: true },
  });
  const entityList = [player, anchor, tug, load];
  const entities = new Map(entityList.map((entity) => [entity.id, entity]));
  const state = {
    mode: 'flight',
    simTime: 1,
    tick: 60,
    seed: SEED,
    rng: mulberry32(SEED),
    playerId: player.id,
    player: {
      tether: {
        active: true,
        targetId: anchor.id,
        strain: 0.6,
        load: 0.6,
        attachmentId: null,
        restLength,
        phase: options.phase ?? 'loaded',
        headId: null,
      },
    },
    entities,
    entityList,
    input: { actions: { tetherFire: false, tetherCut: false, reelDelta: 0, massline: null } },
    runtime: { profileId: 'production', features: PRODUCTION_FEATURES },
    combat: null,
  };
  ensureCombatState(state);
  const bus = createBus();
  const catalog = createCombatCatalog();
  const helpers = { combatPhysics: stubCombatPhysics() };
  const attachments = createAttachmentService({ state, catalog, helpers, bus });
  const kernel = { attachments, catalog: { attachments: catalog.attachments } };
  const system = Object.assign({}, tetherGameplay);
  system.init({
    state,
    bus,
    helpers,
    registry: {
      get(name) {
        if (name === 'actions' || name === 'combat') return { kernel };
        return null;
      },
    },
  });
  const blade = attachments.create({
    defId: 'tether_standard',
    ownerId: player.id,
    targetId: anchor.id,
    sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z },
    targetWorld: { x: anchor.pos.x, y: 0, z: anchor.pos.z },
  });
  state.player.tether.attachmentId = blade.attachment.id;
  blade.attachment.restLength = restLength;
  if (options.npcLine !== false) {
    attachments.create({
      defId: 'tether_standard',
      ownerId: tug.id,
      targetId: load.id,
      controlMode: 'npc_tow',
      sourceWorld: { x: tug.pos.x, y: 0, z: tug.pos.z },
      targetWorld: { x: load.pos.x, y: 0, z: load.pos.z },
    });
  }
  return { state, system, player, anchor, blade };
}

function step(harness) {
  harness.state.simTime += DT;
  harness.state.tick += 1;
  harness.system.update(DT, harness.state);
}

function createPresenter(state) {
  const scene = new THREE.Scene();
  const ctx = {
    state,
    _scene: scene,
    helpers: { player: () => state.entities.get(state.playerId) },
    _spawnLocalXZ: { x: 0, z: 0 },
    _frameMembrane: null,
  };
  ctx._ent = vfx._ent;
  ctx._toLocalXZ = vfx._toLocalXZ;
  ctx._renderInterpolationAlpha = vfx._renderInterpolationAlpha;
  vfx._initMasslineSwingTrace.call(ctx);
  vfx._initMonofilamentBlade.call(ctx);
  return { ctx, scene };
}

function present(presenter) {
  const shown = vfx._updateMonofilamentBlade.call(presenter.ctx);
  const blade = presenter.ctx._monofilamentBlade;
  const mesh = blade.mesh;
  return {
    shown: shown ? 1 : 0,
    present: blade.present ? 1 : 0,
    visible: mesh.visible ? 1 : 0,
    draw: mesh.geometry.drawRange.count,
    opacity: mesh.material.opacity,
    mesh,
    blade,
  };
}

function quadMetrics(mesh) {
  const p = mesh.geometry.attributes.position.array;
  const ys = [p[1], p[4], p[7], p[10]];
  const shortX = p[3] - p[0];
  const shortZ = p[5] - p[2];
  const longX = p[6] - p[0];
  const longZ = p[8] - p[2];
  const short = Math.hypot(shortX, shortZ);
  const long = Math.hypot(longX, longZ);
  return {
    y: ys[0],
    ySame: ys.every((y) => y === ys[0]),
    short,
    long,
    align: short * long > 0 ? Math.abs(shortX * longX + shortZ * longZ) / (short * long) : 1,
    ax: (p[0] + p[3]) * 0.5,
    az: (p[2] + p[5]) * 0.5,
    bx: (p[6] + p[9]) * 0.5,
    bz: (p[8] + p[11]) * 0.5,
  };
}

test('PQ-030 seed 30000: the taut sweep draws a world blade and the release removes it the same tick', () => {
  assert.equal(MONOFILAMENT_BLADE_TAUT_RATIO, NPC_LINE_CUT_TAUT_RATIO);

  const harness = setupSwing();
  const presenter = createPresenter(harness.state);
  const trace = presenter.scene.getObjectByName('sf-massline-swing-trace');
  const bladeMesh = presenter.scene.getObjectByName('sf-monofilament-blade');
  assert.ok(trace && bladeMesh && trace !== bladeMesh, 'the blade sits beside the swing trace');

  step(harness);
  assert.equal(harness.state.player.tether.active, true);
  assert.equal(harness.state.player.tether.headId, 'monofilament_sweep');
  const span = Math.hypot(
    harness.anchor.pos.x - harness.player.pos.x,
    harness.anchor.pos.z - harness.player.pos.z,
  );
  assert.ok(span >= harness.state.player.tether.restLength * NPC_LINE_CUT_TAUT_RATIO);

  const during = present(presenter);
  const metrics = quadMetrics(during.mesh);
  const expected = {
    ax: 0, az: 0, bx: 0, bz: 0, dirX: 1, dirZ: 0, chord: 0, targetRadius: 0,
  };
  assert.equal(writeTetherVisualEndpoints(harness.player, harness.anchor, false, expected, 1), true);
  const chordX = metrics.bx - metrics.ax;
  const chordZ = metrics.bz - metrics.az;
  const shipX = harness.anchor.pos.x - harness.player.pos.x;
  const shipZ = harness.anchor.pos.z - harness.player.pos.z;
  const along = (chordX * shipX + chordZ * shipZ)
    / (Math.hypot(chordX, chordZ) * Math.hypot(shipX, shipZ));

  assert.equal(during.shown, 1);
  assert.equal(during.present, 1);
  assert.equal(during.visible, 1);
  assert.equal(during.draw, 6);
  assert.equal(during.mesh.isMesh, true);
  assert.equal(during.mesh.isSprite, undefined);
  assert.equal(during.mesh.type, 'Mesh');
  assert.equal(during.mesh.parent, presenter.scene);
  assert.ok(Math.hypot(during.mesh.quaternion.x, during.mesh.quaternion.y, during.mesh.quaternion.z) < 1e-8);
  assert.equal(metrics.ySame, true);
  assert.ok(metrics.y > 0 && metrics.y < 8, 'the segment lies in the world XZ band, not on the screen');
  assert.ok(metrics.long / metrics.short > 8, 'a blade segment is long, not a soft disc');
  assert.ok(metrics.align < 1e-3, 'the short edge is perpendicular to the chord');
  assert.ok(along > 0.999, 'the segment runs along the tether on XZ');
  assert.ok(Math.abs(metrics.ax - expected.ax) < 1e-4 && Math.abs(metrics.az - expected.az) < 1e-4);
  assert.ok(Math.abs(metrics.bx - expected.bx) < 1e-4 && Math.abs(metrics.bz - expected.bz) < 1e-4);

  harness.state.input.actions.massline = { cut: true };
  step(harness);
  const after = present(presenter);
  assert.equal(harness.state.player.tether.active, false);
  assert.equal(after.shown, 0);
  assert.equal(after.present, 0);
  assert.equal(after.visible, 0);
  assert.equal(after.draw, 0);
  assert.equal(after.opacity, 0);
  const stillGone = present(presenter);
  assert.equal(stillGone.shown, 0);
  assert.equal(stillGone.draw, 0);

  console.log(
    `PQ-030 VISIBLE BLADE SEED=${SEED} SEGMENT_PRESENT=${during.shown} DRAW_PRESENT=${during.draw} `
    + `SEGMENT_ABSENT=${after.shown} DRAW_ABSENT=${after.draw}`,
  );
});

test('PQ-030 seed 30000: a slack monofilament line drops the blade on that tick', () => {
  const harness = setupSwing();
  const presenter = createPresenter(harness.state);
  step(harness);
  const during = present(presenter);
  assert.equal(during.shown, 1);

  harness.blade.attachment.restLength = 200;
  harness.state.input.actions.massline = null;
  step(harness);
  const slack = present(presenter);
  const span = Math.hypot(
    harness.anchor.pos.x - harness.player.pos.x,
    harness.anchor.pos.z - harness.player.pos.z,
  );
  assert.equal(harness.state.player.tether.active, true, 'slack is not a break');
  assert.equal(harness.state.player.tether.phase, 'slack');
  assert.ok(span < harness.state.player.tether.restLength * NPC_LINE_CUT_TAUT_RATIO);
  assert.equal(slack.shown, 0);
  assert.equal(slack.present, 0);
  assert.equal(slack.visible, 0);
  assert.equal(slack.draw, 0);

  console.log(`PQ-030 VISIBLE BLADE SEED=${SEED} SLACK_SEGMENT=${slack.shown} DRAW_SLACK=${slack.draw}`);
});

test('PQ-030 seed 30000: a taut line with any other head draws no blade', () => {
  const harness = setupSwing({ headId: 'tractor' });
  const presenter = createPresenter(harness.state);
  step(harness);
  assert.equal(harness.state.player.tether.active, true);
  assert.equal(harness.state.player.tether.headId, 'tractor');
  const other = present(presenter);
  assert.equal(other.shown, 0);
  assert.equal(other.draw, 0);
  console.log(`PQ-030 VISIBLE BLADE SEED=${SEED} OTHER_HEAD_SEGMENT=${other.shown}`);
});
