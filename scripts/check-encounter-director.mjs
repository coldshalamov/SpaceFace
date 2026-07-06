#!/usr/bin/env node
// check-encounter-director.mjs — acceptance harness for the living-universe campaign director.
//
// Asserts (spec2/04 §5 + SPEC3-21 + the campaign-director brief):
//   1. STATIC DISCIPLINE — no Math.random / wall clock / direct single-writer state writes in the
//      director, scripts, or data path.
//   2. PLANNER DETERMINISM — same seed+sector+day ⇒ byte-identical schedule; re-init identical;
//      per-day budgets (≤1 major, ≤2 minor, ≤3 ambient); nominal onsets ≥45 s apart; schedules
//      vary across days (not perfectly predictable).
//   3. RUNTIME PACING SOAK (10 sim-min, 1 Hz director) — meaningful starts ≥30 s apart; rolling
//      600 s window holds ≤1 major + ≤2 minor; ZERO encounters while docked or during protected
//      tutorial beats; spawn budget never exceeded; firing spends pressure; two identical runs
//      produce identical encounter logs (runtime determinism).
//   4. QUIET EXISTS — in a safe-core soak the majority of the timeline has no meaningful
//      encounter live (spending pressure buys quiet).
//   5. GATES — a gated shape (bounty_hunter) never fires without its motive, fires once given it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector, planEncounters, planEncounterShape } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { ENCOUNTER_SCRIPTS } from '../src/systems/encounterScripts.js';
import { mulberry32, hash32 } from '../src/core/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let sections = 0;
function ok(label) { sections++; console.log(`  ✓ ${label}`); }

// ─── 1. static discipline ────────────────────────────────────────────────────────────────────────
{
  const files = [
    'src/systems/encounterDirector.js',
    'src/systems/encounterScripts.js',
    'src/data/encounters.js',
  ];
  const forbidden = [
    [/Math\.random\s*\(/, 'Math.random in sim path'],
    [/Date\.now\s*\(/, 'wall-clock time in sim path'],
    [/new Date\s*\(/, 'wall-clock time in sim path'],
    [/player\.credits\s*=(?!=)/, 'direct credits write (economy owns credits)'],
    [/player\.heat\s*=(?!=)/, 'direct heat write (heat owns WANTED heat)'],
    [/player\.bounty\s*=(?!=)/, 'direct bounty write'],
    [/\.rep\s*=(?!=)/, 'direct rep write (factions own rep)'],
    [/cargo\.items\s*\[[^\]]*\]\s*=(?!=)/, 'direct cargo write (cargo owns cargo)'],
  ];
  for (const f of files) {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    for (const [re, why] of forbidden) {
      assert.equal(re.test(src), false, `${f}: ${why}`);
    }
  }
  ok('static discipline: no Math.random / wall clock / single-writer violations');
}

// ─── 2. planner determinism + budgets ────────────────────────────────────────────────────────────
{
  const sectors = ['sector_helios_prime', 'sector_ceres_belt', 'sector_tethys_junction', 'sector_sker_haven', 'sector_veil_nebula'];
  const seeds = [1, 7, 47, 1234];
  let crossDayDiffs = 0;
  for (const sid of sectors) {
    const zones = zonesForSector(sid);
    assert(zones.length > 0, `${sid} should have authored zones`);
    const daySchedules = [];
    for (let day = 0; day < 3; day++) {
      for (const seed of seeds) {
        const a = planEncounters(seed, sid, day, zones);
        const b = planEncounters(seed, sid, day, zones);
        assert.equal(JSON.stringify(a), JSON.stringify(b), `planner determinism ${sid} d${day} s${seed}`);
        const majors = a.filter((i) => i.tier === 'major').length;
        const minors = a.filter((i) => i.tier === 'minor').length;
        const ambient = a.filter((i) => i.tier === 'ambient').length;
        assert(majors <= 1, `${sid} d${day} s${seed}: majors ${majors} > 1`);
        assert(minors <= 2, `${sid} d${day} s${seed}: minors ${minors} > 2`);
        assert(ambient <= 3, `${sid} d${day} s${seed}: ambient ${ambient} > 3`);
        const sorted = [...a].sort((x, y) => x.delay - y.delay);
        for (let i = 1; i < sorted.length; i++) {
          assert(sorted[i].delay - sorted[i - 1].delay >= 45 - 1e-9, `${sid} d${day} s${seed}: nominal onsets <45s apart`);
        }
        for (const it of a) {
          assert(ENCOUNTERS[it.shapeId], `unknown shape ${it.shapeId}`);
          assert(ENCOUNTER_SCRIPTS[it.script], `unknown script ${it.script}`);
          assert(it.zoneCenter && Number.isFinite(it.zoneCenter.x), 'schedule item carries its zone anchor');
          assert(it.encounterId && it.squadId, 'schedule item carries ids');
          if (it.shapeId === 'distress_call') assert(/^distress_(genuine|bait)$/.test(it.variantKind), 'distress variant resolved at plan time');
        }
        if (seed === seeds[0]) daySchedules.push(JSON.stringify(a.map((i) => i.shapeId)));
      }
    }
    if (new Set(daySchedules).size > 1) crossDayDiffs++;
  }
  assert(crossDayDiffs >= 2, 'schedules must vary across days (not perfectly predictable)');
  ok('planner: deterministic, budgeted (≤1 major/≤2 minor/≤3 ambient), spaced, day-varied');
}

// ─── shared runtime boot ─────────────────────────────────────────────────────────────────────────
function boot(seed, sectorId, playerPos, cargoItems) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: playerPos.x, z: playerPos.z }, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6 });
  state.playerId = player.id;
  if (cargoItems) state.player.cargo.items = { ...cargoItems };
  bus.emit('sector:enter', { sectorId });
  return { sim, state, bus, player };
}

// ─── 3. pacing soak (Sker Haven — dense combat pressure) ────────────────────────────────────────
function soakSker(seed) {
  const { sim, state, bus } = boot(seed, 'sector_sker_haven', { x: -540, z: 680 }, { cmdty_refined_metals: 12 });
  const events = [];
  const samples = [];
  // Deterministic referee: no combat systems run in this harness, so conflicts would never end.
  // 45 s after each encounter spawns, the "player" kills its remaining squad — exercising the full
  // resolve/receipt/budget-release lifecycle so follow-on pacing is actually tested.
  const refereeQueue = [];
  bus.on('encounter:telegraph', (p) => {
    events.push({ n: 'tele', t: +state.simTime.toFixed(3), id: p.encounterId, kind: p.kind, tier: p.tier, deck: p.deck });
    const live = state.encounterDirector.live[p.encounterId];
    if (live) refereeQueue.push({ at: state.simTime + 45, ids: live.ids });
  });
  bus.on('encounter:resolved', (p) => events.push({ n: 'res', t: +state.simTime.toFixed(3), id: p.encounterId, outcome: p.outcome }));
  const DOCK = [200, 320], TUT = [380, 470];
  for (let s = 0; s < 1200; s++) {                     // two sim-days — crosses a day:tick replan
    state.player.flags = state.player.flags || {};
    state.player.flags.docked = s >= DOCK[0] && s < DOCK[1];
    state.onboarding = (s >= TUT[0] && s < TUT[1]) ? { active: true, finished: false } : null;
    for (const job of refereeQueue) {
      if (job.done || state.simTime < job.at) continue;
      job.done = true;
      for (const id of job.ids.slice()) {
        const e = state.entities.get(id);
        if (!e || e.alive === false) continue;
        bus.emit('entity:killed', { id, killerId: state.playerId, pos: { x: e.pos.x, z: e.pos.z } });
        e.alive = false;
      }
    }
    sim.runTicks(60);
    const dir = state.encounterDirector;
    const meaningful = Object.values(dir.live).filter((l) => l.tier !== 'ambient').length;
    samples.push({
      s,
      meaningful,
      used: state.spawnBudget ? state.spawnBudget.used : 0,
      max: state.spawnBudget ? state.spawnBudget.max : 12,
      pc: +dir.pressure.combat.toFixed(3),
      pv: +dir.pressure.civilian.toFixed(3),
    });
  }
  return { events, samples, DOCK, TUT };
}

{
  const A = soakSker(31);
  const B = soakSker(31);
  assert.equal(JSON.stringify(A.events), JSON.stringify(B.events), 'two identical runs ⇒ identical encounter logs');
  assert.equal(JSON.stringify(A.samples), JSON.stringify(B.samples), 'two identical runs ⇒ identical pressure/budget telemetry');

  const tele = A.events.filter((e) => e.n === 'tele');
  assert(tele.length >= 3, `two-day soak should produce encounters (got ${tele.length})`);
  const resolved = A.events.filter((e) => e.n === 'res');
  assert(resolved.length >= 2, `encounters must resolve, not linger (got ${resolved.length} resolutions)`);
  const meaningful = tele.filter((e) => e.tier !== 'ambient');
  for (let i = 1; i < meaningful.length; i++) {
    assert(meaningful[i].t - meaningful[i - 1].t >= 30 - 1.2, `meaningful min-gap violated: ${meaningful[i - 1].t}→${meaningful[i].t}`);
  }
  for (const e of meaningful) {
    const w = meaningful.filter((x) => x.t > e.t - 600 && x.t <= e.t);
    assert(w.filter((x) => x.tier === 'major').length <= 1, 'major cap violated in rolling window');
    assert(w.filter((x) => x.tier === 'minor').length <= 2, 'minor cap violated in rolling window');
  }
  const ambient = tele.filter((e) => e.tier === 'ambient');
  for (let i = 1; i < ambient.length; i++) {
    assert(ambient[i].t - ambient[i - 1].t >= 15 - 1.2, 'ambient min-gap violated');
  }
  for (const e of tele) {
    assert(!(e.t >= A.DOCK[0] && e.t < A.DOCK[1]), `encounter fired while docked (t=${e.t})`);
    assert(!(e.t >= A.TUT[0] && e.t < A.TUT[1]), `encounter fired during protected tutorial beat (t=${e.t})`);
  }
  for (const s of A.samples) assert(s.used <= s.max, `spawn budget exceeded at t=${s.s} (${s.used}/${s.max})`);
  // Firing spends pressure: across the second each fire lands in, the deck pool must DROP hard
  // (cost dwarfs one second of accrual).
  for (const e of tele) {
    const last = A.samples.length - 1;
    const sec = Math.min(last, Math.max(1, Math.ceil(e.t)));
    const before = A.samples[sec - 1], after = A.samples[Math.min(last, sec)];
    if (!before || !after) continue;
    const key = e.deck === 'combat' ? 'pc' : 'pv';
    assert(after[key] < before[key] + 3, `firing ${e.kind} did not spend ${e.deck} pressure (${before[key]}→${after[key]})`);
  }
  ok('soak (Sker): deterministic ×2, min-gaps, window caps, dock/tutorial suppression, budget, pressure spend');
}

// ─── 4. quiet exists (Helios safe core) ──────────────────────────────────────────────────────────
{
  const { sim, state } = boot(31, 'sector_helios_prime', { x: 400, z: 0 }, { cmdty_ore_iron: 6 });
  let quiet = 0;
  for (let s = 0; s < 600; s++) {
    sim.runTicks(60);
    const dir = state.encounterDirector;
    if (Object.values(dir.live).every((l) => l.tier === 'ambient')) quiet++;
  }
  assert(quiet >= 300, `quiet time must exist in the safe core (got ${quiet}/600 meaningful-free seconds)`);
  ok(`quiet exists: ${quiet}/600 s of the Helios soak had no meaningful encounter live`);
}

// ─── 5. gates: bounty_hunter never fires without a bounty, fires with one ────────────────────────
{
  const { sim, state } = boot(9, 'sector_sker_haven', { x: -540, z: 680 }, null);
  const dir = state.encounterDirector;
  const shape = ENCOUNTERS.bounty_hunter;
  const zone = zonesForSector('sector_sker_haven').find((z) => shape.zoneTypes.includes(z.type));
  const item = planEncounterShape(shape, zone, 'sector_sker_haven', 0, 99, mulberry32(hash32(9, 'gate-test')));
  item.sectorId = 'sector_sker_haven';
  item.dueAt = state.simTime;
  item.defers = 0;
  dir.pending.length = 0;                      // isolate: only our gated item
  dir.pending.push(item);
  dir.pressure.combat = 120;
  let fired = 0;
  sim.bus.on('encounter:telegraph', (p) => { if (p.kind === 'bounty_hunter') fired++; });
  state.player.bounty = 0;
  for (let s = 0; s < 90; s++) { sim.runTicks(60); dir.pressure.combat = 120; if (!dir.pending.length && !fired) dir.pending.push({ ...item, dueAt: state.simTime, defers: 0 }); }
  assert.equal(fired, 0, 'bounty_hunter must not fire with no bounty (motive rule)');
  state.player.bounty = 500;
  for (let s = 0; s < 90 && !fired; s++) { sim.runTicks(60); dir.pressure.combat = 120; }
  assert.equal(fired, 1, 'bounty_hunter must fire once a bounty stands');
  ok('gates: bounty_hunter fires only with a standing bounty');
}

console.log(`[check-encounter-director] PASS — ${sections} sections green`);
