// INFERENCE-20 — The Metronome is a toy you cross on the beat. The Eris Margin landmark
// was a scan label; now an authored 8 s denial beam sweeps the POI on the saved sim
// clock: the wedge shoves mass out (NPCs included — bait the patrol), burns the player
// through the combat kernel's hazard_radiation origin, and speaks hazard boundaries.
import assert from 'node:assert/strict';
import test from 'node:test';

import { FIELD_FLAGS } from '../src/data/fields.js';
import {
  METRONOME_BEAM_DPS,
  METRONOME_FIELD,
  METRONOME_PERIOD_S,
  METRONOME_POI_ID,
  METRONOME_SECTOR_ID,
  metronomeBeamDir,
  metronomeBeamEtaAt,
  metronomeHazardZone,
  pointInsideMetronomeBeam,
} from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import {
  normalizeField,
  projectFieldTrajectory,
  sampleFieldAcceleration,
} from '../src/core/fields/fieldKernel.js';

const C = METRONOME_FIELD.center;

function pointOnBeam(t, along = 200) {
  const dir = metronomeBeamDir(t);
  return { x: C.x + dir.x * along, z: C.z + dir.z * along };
}

function pointOffBeam(t, along = 200) {
  const dir = metronomeBeamDir(t);
  // Rotate the bearing 90 degrees away from the wedge — far outside halfAngle+soft.
  return { x: C.x - dir.z * along, z: C.z + dir.x * along };
}

test('the sweep is authored, sim-clocked, and wraps cleanly', () => {
  assert.equal(METRONOME_PERIOD_S, 8, 'the beam is the authored 8 s sweep');
  assert.equal(METRONOME_FIELD.kind, 'cone');
  assert.equal(METRONOME_FIELD.sourceId, METRONOME_POI_ID);

  const d0 = metronomeBeamDir(0);
  assert.ok(Math.abs(d0.x - 1) < 1e-9 && Math.abs(d0.z) < 1e-9, 't=0 aims +x');
  const dq = metronomeBeamDir(METRONOME_PERIOD_S / 4);
  assert.ok(Math.abs(dq.x) < 1e-9 && Math.abs(dq.z - 1) < 1e-9, 'quarter period aims +z');
  const dh = metronomeBeamDir(METRONOME_PERIOD_S / 2);
  assert.ok(Math.abs(dh.x + 1) < 1e-9 && Math.abs(dh.z) < 1e-9, 'half period aims -x');
  const dw = metronomeBeamDir(METRONOME_PERIOD_S);
  assert.ok(Math.abs(dw.x - 1) < 1e-9 && Math.abs(dw.z) < 1e-9, 'a full period wraps to t=0');

  for (const bad of [NaN, -3.5, Infinity]) {
    const d = metronomeBeamDir(bad);
    const mag = Math.hypot(d.x, d.z);
    assert.ok(Number.isFinite(d.x) && Number.isFinite(d.z) && Math.abs(mag - 1) < 1e-9,
      `degenerate clock ${bad} still yields a unit vector`);
  }
});

test('the wedge predicate follows the live beam bearing', () => {
  assert.equal(pointInsideMetronomeBeam(pointOnBeam(0), 0), true, 'on-bearing is inside');
  assert.equal(pointInsideMetronomeBeam(pointOnBeam(2), 2), true, 'the wedge swept with the clock');
  assert.equal(pointInsideMetronomeBeam(pointOffBeam(0), 0), false, 'off-bearing is outside');
  assert.equal(pointInsideMetronomeBeam({ x: C.x + 9999, z: C.z }, 0), false, 'beyond radius is outside');
  assert.equal(pointInsideMetronomeBeam(null, 0), false);
  assert.equal(pointInsideMetronomeBeam({ x: NaN, z: 0 }, 0), false);
});

test('the beam carries mass out of the sweep and bends a shot', () => {
  const field = normalizeField({ ...METRONOME_FIELD, dir: metronomeBeamDir(0) });
  const pos = pointOnBeam(0, 220);
  const dir = METRONOME_FIELD.dir;
  const accel = sampleFieldAcceleration(pos, { x: 0, z: 0 }, [field], 0, {
    mass: 28, type: 'ship', marked: false,
  }, { ax: 0, az: 0 });
  const along = accel.ax * dir.x + accel.az * dir.z;
  assert.ok(along > 20, `the wedge must carry hulls mouth-first out (got ${along.toFixed(1)})`);

  const vel = { x: 0, z: 160 }; // crossing shot, square to the beam
  const vacuum = projectFieldTrajectory(pos, vel, [], { mass: 0.4, type: 'projectile' }, {
    dt: 1 / 60, steps: 45, simTime: 0,
  });
  const bent = projectFieldTrajectory(pos, vel, [field], { mass: 0.4, type: 'projectile' }, {
    dt: 1 / 60, steps: 45, simTime: 0,
  });
  const bend = Math.hypot(bent.end.x - vacuum.end.x, bent.end.z - vacuum.end.z);
  assert.ok(bend > 5, `the sweep visibly bends a shot (bend ${bend.toFixed(1)} wu)`);
});

test('a point ahead of the sweep reads an ETA until the leading edge', () => {
  // At t=0 the beam aims +x with halfAngle ~0.10 rad: a point at bearing +0.5 rad waits
  // (0.5 - 0.10)/omega ≈ (0.4)/(2π/8) ≈ 0.51 s; a point inside reads 0.
  const ahead = { x: C.x + 200 * Math.cos(0.5), z: C.z + 200 * Math.sin(0.5) };
  const eta = metronomeBeamEtaAt(ahead, 0);
  assert.ok(eta > 0.3 && eta < 0.8, `ETA is the beat gap, got ${eta.toFixed(2)} s`);
  assert.equal(metronomeBeamEtaAt(pointOnBeam(0), 0), 0, 'inside reads no wait');
  // After the beam passes, the same bearing waits nearly a full period.
  const behind = { x: C.x + 200 * Math.cos(-0.5), z: C.z + 200 * Math.sin(-0.5) };
  const etaBehind = metronomeBeamEtaAt(behind, 0);
  assert.ok(etaBehind > METRONOME_PERIOD_S - 2, `a bearing just swept waits the long beat (${etaBehind.toFixed(2)} s)`);
});

test('runtime registers the beam in Eris, rotates it with the clock, and burns only inside', () => {
  const events = [];
  const damaged = [];
  const fields = {
    byId: Object.create(null),
    registerEnvironmental(spec) { this.byId[spec.id] = { ...spec, dir: { ...spec.dir } }; return this.byId[spec.id]; },
    updateExternal(id, patch) {
      const rec = this.byId[id];
      if (patch && patch.dir) Object.assign(rec.dir, patch.dir);
      if (patch && patch.strength != null) rec.strength = patch.strength;
      return rec;
    },
    unregisterExternal(id) { const had = !!this.byId[id]; delete this.byId[id]; return had; },
    hasExternal(id) { return !!this.byId[id]; },
  };
  const combat = {
    ensureKernel() {
      return { routeDamage(req) { damaged.push(req); } };
    },
  };
  const player = { id: 7, type: 'ship', alive: true, pos: pointOnBeam(0, 200) };
  const state = {
    mode: 'flight', tick: 0, simTime: 0, playerId: 7,
    world: { currentSectorId: METRONOME_SECTOR_ID },
    entities: new Map([[7, player]]),
    sites: { worldOrder: [], worldById: {} },
  };
  const bus = { on() { return () => {}; }, emit(name, payload) { events.push({ name, payload }); } };
  const system = Object.create(environmentalMachinery);
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    system.init({ state, bus, registry: { get(name) {
      if (name === 'fields') return fields;
      if (name === 'combat') return combat;
      return null;
    } } });
    system.update(1 / 60, state);
    const beam = fields.byId[METRONOME_FIELD.id];
    assert.ok(beam, 'the denial beam registers in Eris Margin');
    assert.equal(beam.kind, 'cone');
    assert.equal(beam.strength, METRONOME_FIELD.strength);
    assert.ok(events.some((e) => e.name === 'hazard:enter' && e.payload.siteId === METRONOME_POI_ID),
      'entering the wedge speaks hazard language');
    assert.equal(damaged.length, 1, 'one burn packet per inside tick');
    assert.equal(damaged[0].origin.kind, 'hazard_radiation', 'the death log names the beam');
    assert.ok(Math.abs(damaged[0].packet.channels.thermal - METRONOME_BEAM_DPS / 60) < 1e-6, 'burn scales with dt');

    // The clock turns the cone: a quarter period later the field aims +z and the
    // player — still parked at +x — is out of the wedge, so no burn and an exit.
    events.length = 0;
    state.simTime = 2;
    system.update(1 / 60, state);
    assert.ok(Math.abs(fields.byId[METRONOME_FIELD.id].dir.z - 1) < 1e-6, 'updateExternal rotates the beam');
    assert.ok(events.some((e) => e.name === 'hazard:exit'), 'leaving the wedge says so');
    assert.equal(damaged.length, 1, 'no burn outside the wedge');

    // The beam comes back around — re-entry fires a fresh boundary + burn.
    state.simTime = 8;
    system.update(1 / 60, state);
    assert.equal(damaged.length, 2, 'the next sweep burns again');
  } finally {
    system.destroy();
    FIELD_FLAGS.enabled = previous;
  }
});

test('the beam stays silent outside Eris Margin', () => {
  const fields = {
    byId: Object.create(null),
    registerEnvironmental(spec) { this.byId[spec.id] = spec; return spec; },
    updateExternal() { return null; },
    unregisterExternal(id) { const had = !!this.byId[id]; delete this.byId[id]; return had; },
    hasExternal(id) { return !!this.byId[id]; },
  };
  const state = {
    mode: 'flight', tick: 0, simTime: 0, playerId: 7,
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map([[7, { id: 7, type: 'ship', alive: true, pos: pointOnBeam(0) }]]),
    sites: { worldOrder: [], worldById: {} },
  };
  const bus = { on() { return () => {}; }, emit() {} };
  const system = Object.create(environmentalMachinery);
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    system.init({ state, bus, registry: { get(name) { return name === 'fields' ? fields : null; } } });
    system.update(1 / 60, state);
    assert.equal(fields.byId[METRONOME_FIELD.id], undefined, 'no beam outside Eris Margin');
  } finally {
    system.destroy();
    FIELD_FLAGS.enabled = previous;
  }
});

test('the hazard zone names a bounded debris-current circle at the landmark', () => {
  const zone = metronomeHazardZone();
  assert.equal(zone.id, 'eris_metronome_beam');
  assert.equal(zone.type, 'debris_current');
  assert.ok(zone.radius >= METRONOME_FIELD.radius, 'the warning circle covers the sweep');
  assert.ok(zone.intensity > 0 && zone.intensity < 1);
});
