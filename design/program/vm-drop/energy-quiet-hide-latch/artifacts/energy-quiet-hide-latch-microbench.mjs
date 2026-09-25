/**
 * Primary KPI: vfx._hideEnergyPlumes on consecutive quiet frames after first hide.
 * Before = every quiet tick re-runs plasma/retro/fleet.reset (fleet walks ships +
 *   family plume+rcs reset, clearing _familyQuietAsleep).
 * After  = latch after first hide; skip until wake.
 * Soft-GPU fps not claimed. Picture unchanged (already cold/hidden).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const SHIPS = 10; // FLEET_INITIAL-ish quiet capacity
const FAMILIES = 6;
const PLUMES = 2;
const RCS_SLOTS = 8;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const SHIPS = ${SHIPS};
const FAMILIES = ${FAMILIES};
const PLUMES = ${PLUMES};
const RCS_SLOTS = ${RCS_SLOTS};

function makeEnergy() {
  const ships = Array.from({ length: SHIPS }, () => ({
    alive: false, entityId: null, priorEntityId: null,
    driveState: { plumeDrive: 0, boostBlend: 0, ignition: 0 },
    factionR: 0.533, factionG: 0.667, factionB: 1,
  }));
  const families = Array.from({ length: FAMILIES }, () => ({
    activeEntities: 0,
    plume: {
      resets: 0,
      reset() {
        this.resets++;
        this.group = this.group || { visible: false };
        this.group.visible = false;
        this._live = 0;
        for (let i = 0; i < 5; i++) { /* layer zero */ }
      },
    },
    rcs: {
      resets: 0,
      reset() {
        this.resets++;
        for (let i = 0; i < RCS_SLOTS; i++) { /* slot zero */ }
        this.activeImpulseCount = 0;
      },
      activeImpulseCount: 0,
    },
  }));
  return {
    plasmaStream: {
      resets: 0,
      _active: false, sampler: { hasLive: false }, group: { visible: false },
      reset() {
        this.resets++;
        this._active = false;
        this.group.visible = false;
        for (let i = 0; i < 4; i++) { /* throat */ }
      },
    },
    retroVolume: {
      resets: 0, _liveCount: 0, spool: 0, group: { visible: false },
      _plumes: Array.from({ length: PLUMES }, () => ({ reset() {} })),
      _forges: Array.from({ length: PLUMES }, () => ({ update() {} })),
      reset() {
        this.resets++;
        this._liveCount = 0; this.spool = 0;
        for (let i = 0; i < this._plumes.length; i++) this._plumes[i].reset();
        for (let i = 0; i < this._forges.length; i++) this._forges[i].update();
        this.group.visible = false;
      },
    },
    fleet: {
      ships, families,
      _familyQuietAsleep: new Uint8Array(FAMILIES),
      resets: 0,
      reset() {
        this.resets++;
        for (let i = 0; i < this.ships.length; i++) {
          const s = this.ships[i];
          s.alive = false; s.entityId = null; s.priorEntityId = null;
          s.driveState.plumeDrive = 0; s.driveState.boostBlend = 0; s.driveState.ignition = 0;
          s.factionR = 0.533; s.factionG = 0.667; s.factionB = 1.0;
        }
        this.activeShipCount = 0; this.saturated = 0; this._admitOpen = false;
        this._playerRcsFamily = null;
        for (let i = 0; i < this.families.length; i++) {
          const f = this.families[i];
          f.plume.reset();
          if (f.rcs) f.rcs.reset();
          f.activeEntities = 0;
          this._familyQuietAsleep[i] = 0;
        }
      },
    },
    plumeDrive: 0, boostBlend: 0, rcsCooldown: 0,
    ribbon: { visible: false },
  };
}

function releaseLight() { /* no-op model */ }
function clearOwnership() { /* no-op model */ }

function hideBefore(owner) {
  releaseLight();
  const energy = owner._energy;
  if (!energy) return;
  if (energy.plasmaStream) energy.plasmaStream.reset();
  if (energy.retroVolume) energy.retroVolume.reset();
  if (energy.fleet) energy.fleet.reset();
  energy.plumeDrive = 0; energy.boostBlend = 0; energy.rcsCooldown = 0;
  clearOwnership();
  if (energy.ribbon) energy.ribbon.visible = false;
}

function hideAfter(owner) {
  if (owner._energyQuietHidden) return;
  releaseLight();
  const energy = owner._energy;
  if (!energy) { owner._energyQuietHidden = true; return; }
  if (energy.plasmaStream) energy.plasmaStream.reset();
  if (energy.retroVolume) energy.retroVolume.reset();
  if (energy.fleet) energy.fleet.reset();
  energy.plumeDrive = 0; energy.boostBlend = 0; energy.rcsCooldown = 0;
  clearOwnership();
  if (energy.ribbon && energy.ribbon.visible) energy.ribbon.visible = false;
  owner._energyQuietHidden = true;
}

const owner = { _energy: makeEnergy(), _energyQuietHidden: false };
const fn = ${JSON.stringify(mode)} === 'before' ? hideBefore : hideAfter;
// First hide always runs (establish cold).
hideBefore(owner);
if (${JSON.stringify(mode)} === 'after') owner._energyQuietHidden = true;
for (let i = 0; i < 3000; i++) fn(owner);
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(owner);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, mode: ${JSON.stringify(mode)},
  fleetResets: owner._energy.fleet.resets,
  plasmaResets: owner._energy.plasmaStream.resets,
  retroResets: owner._energy.retroVolume.resets,
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'spawn failed');
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  pairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup: before.ms / Math.max(1e-9, after.ms),
    beforeFleetResets: before.fleetResets,
    afterFleetResets: after.fleetResets,
  });
}
const speedups = pairs.map((p) => p.speedup);
const out = {
  name: 'energy-quiet-hide-latch',
  primary: 'quiet-hideEnergyPlumes-consecutive',
  iterations: ITERS,
  runs: RUNS,
  ships: SHIPS,
  families: FAMILIES,
  pairs,
  medianSpeedup: +median(speedups).toFixed(3),
  minSpeedup: +Math.min(...speedups).toFixed(3),
  maxSpeedup: +Math.max(...speedups).toFixed(3),
};
writeFileSync('artifacts/energy-quiet-hide-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
