#!/usr/bin/env node
// check-encounter-one-voice.mjs — the taste law, enforced (GDD pillar 3 / spec2/00 §2).
//
// Asserts across soaks AND the chattiest forced scenarios:
//   • every fired encounter emits EXACTLY ONE primary line on entry — never zero, never two;
//   • no encounter emits more than one 'bark'-channel line within 4 s (danger-tier 'alert' exempt);
//   • the ambush cruise-snare warning precedes the snare request by ≥1 s (counterplay window);
//   • the scan-first distress tell is a single quiet 'info' line, spoken at most once;
//   • no modal: nothing on the bus ever carries a modal/dialog-shaped event name.

import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector, planEncounterShape } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { ENCOUNTERS, ENCOUNTER_BARKS } from '../src/data/encounters.js';
import { mulberry32, hash32 } from '../src/core/rng.js';

let sections = 0;
function ok(label) { sections++; console.log(`  ✓ ${label}`); }

function boot(seed, sectorId, pos, cargoItems) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6 });
  state.playerId = player.id;
  if (cargoItems) state.player.cargo.items = { ...cargoItems };
  // Bus spy: every event name that ever crosses the bus (modal audit) + the voice audit stream.
  const emitted = new Set();
  const voice = [];
  const snares = [];
  const origEmit = bus.emit.bind(bus);
  bus.emit = (name, payload) => { emitted.add(String(name)); return origEmit(name, payload); };
  bus.on('encounter:voice', (p) => voice.push({ ...p }));
  bus.on('cruise:snareRequest', () => snares.push(state.simTime));
  bus.emit('sector:enter', { sectorId });
  return { sim, state, bus, player, emitted, voice, snares };
}

function forceFire(sim, shapeId, sectorId, opts = {}) {
  const state = sim.state;
  const inst = sim.registry.get('encounterDirector');
  const dir = state.encounterDirector;
  const shape = ENCOUNTERS[shapeId];
  let item = opts.item;
  if (!item) {
    const zones = zonesForSector(sectorId).filter((z) => shape.zoneTypes.includes(z.type));
    item = planEncounterShape(shape, opts.zone || zones[0], sectorId, 0, 50, mulberry32(hash32(state.meta.seed, shapeId, 'force')));
  }
  item.sectorId = sectorId;
  dir.pressure[shape.deck] = 140;
  inst._fire(dir, state, item, shape, state.simTime || 0);
  return { item, id: item.encounterId, live: dir.live[item.encounterId] || null };
}

function tickS(sim, seconds) { sim.runTicks(Math.round(seconds * 60)); }

function auditVoice(voice, label) {
  const byEnc = new Map();
  for (const v of voice) {
    if (!byEnc.has(v.encounterId)) byEnc.set(v.encounterId, []);
    byEnc.get(v.encounterId).push(v);
  }
  for (const [enc, lines] of byEnc) {
    const primaries = lines.filter((l) => l.primary);
    assert.equal(primaries.length, 1, `${label}: ${enc} must have exactly one primary line (got ${primaries.length})`);
    assert.equal(lines[0].primary, true, `${label}: ${enc}'s FIRST line must be the primary`);
    const barks = lines.filter((l) => l.channel === 'bark').sort((a, b) => a.t - b.t);
    for (let i = 1; i < barks.length; i++) {
      assert(barks[i].t - barks[i - 1].t >= 4 - 1e-6,
        `${label}: ${enc} barked twice within 4 s (${barks[i - 1].t}→${barks[i].t}: "${barks[i].text}")`);
    }
    for (const l of lines) {
      assert(typeof l.text === 'string' && l.text.length > 0 && l.text.length <= 90, `${label}: line length sane`);
    }
  }
  return byEnc;
}

function assertNoModal(emitted, label) {
  for (const name of emitted) {
    assert(!/modal|dialog\b|textwall/i.test(name), `${label}: modal-shaped event on the bus: ${name}`);
  }
}

// ── 1. soak audit (Sker two-day + referee kills → full lifecycle chatter) ────────────────────────
{
  // Park the player on the Sker Haven outlaw zone. Zone centers are sector-local; encounter anchors
  // are galactic-global (resolveEncounter composes them), so the boot position must be composed too
  // — a raw local literal here lands ~43 km from the zone and silently starves every
  // `proximity: true` shape at the pacing gate. Same law as the ambush section below.
  const havenZone = zonesForSector('sector_sker_haven').find((z) => z.id === 'zone_sker_haven');
  const havenPos = sectorLocalToGlobalForSector(havenZone.center, 'sector_sker_haven');
  // Coverage fixture, not a pinned content schedule: squad-density tuning intentionally consumes a
  // different number of seeded composition draws. Seed 1 retains the live taste-law floor (at
  // least three fired, exact voice parity, and at least one proximity-gated shape), while the
  // forced ambush case below independently pins the global-coordinate proximity behavior.
  const SOAK_SEED = 1;
  const { sim, state, bus, emitted, voice } = boot(SOAK_SEED, 'sector_sker_haven', havenPos, { cmdty_refined_metals: 12 });
  const referee = [];
  const firedKinds = [];
  bus.on('encounter:telegraph', (p) => {
    firedKinds.push(p.kind);
    const live = state.encounterDirector.live[p.encounterId];
    if (live) referee.push({ at: state.simTime + 45, ids: live.ids });
  });
  for (let s = 0; s < 1200; s++) {
    for (const job of referee) {
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
  }
  const byEnc = auditVoice(voice, 'sker-soak');
  const dir = state.encounterDirector;
  // When a soak assertion fails it is almost always the pacing gate starving the schedule silently,
  // so print the director's own books rather than a bare cardinality.
  const why = () => `\n    stats=${JSON.stringify(dir.stats)}`
    + `\n    fired kinds=[${firedKinds.join(', ')}]`
    + `\n    still pending=[${(dir.pending || []).map((it) => `${it.encounterId}@${(it.dueAt | 0)}/d${it.defers | 0}`).join(', ')}]`;

  // Coverage floor: a soak that fires (almost) nothing must fail even if what little fired voiced.
  assert(dir.stats.fired >= 3, `soak should fire ≥3 encounters over two sim-days (got ${dir.stats.fired})${why()}`);
  // The taste law itself, derived from the roster rather than hand-picked: EVERY encounter that
  // fired must have voiced. Not satisfiable by lowering a constant.
  assert.equal(byEnc.size, dir.stats.fired,
    `every fired encounter must voice (${byEnc.size} voiced of ${dir.stats.fired} fired)${why()}`);
  // Regression guard for the two coordinate spaces: `proximity: true` shapes only fire when the
  // player is genuinely inside the zone, so a soak that boots the player into the wrong space fires
  // only the proximity-exempt shapes. That failure was worth 60+ silent gate defers and read as a
  // bare "got 2". Drive the behaviour, assert the outcome.
  const proximityFired = firedKinds.filter((k) => ENCOUNTERS[k] && ENCOUNTERS[k].proximity === true);
  assert(proximityFired.length >= 1,
    `soak fired no proximity-gated encounter — the player is not actually inside its zone `
    + `(check the boot position is composed to global space)${why()}`);
  assertNoModal(emitted, 'sker-soak');
  ok(`soak audit: ${byEnc.size}/${dir.stats.fired} fired encounters voiced (${proximityFired.length} proximity-gated), one primary each, barks ≥4 s apart, no modals`);
}

// ── 2. the chattiest shapes, forced ─────────────────────────────────────────────────────────────
{
  // Toll REFUSE is the worst case: demand bark (primary) + refusal ack bark + receipt.
  const { sim, state, emitted, voice } = boot(61, 'sector_tethys_junction', { x: 500, z: 1500 }, { cmdty_refined_metals: 12 });
  state.player.credits = 900;
  const { id, live } = forceFire(sim, 'pirate_toll', 'sector_tethys_junction');
  tickS(sim, 15);                                      // deadline → deterministic refuse
  for (const eid of live.ids.slice()) {
    const e = state.entities.get(eid);
    if (e && e.alive !== false) { sim.bus.emit('entity:killed', { id: eid, killerId: state.playerId, pos: { x: e.pos.x, z: e.pos.z } }); e.alive = false; }
  }
  tickS(sim, 2);
  const lines = voice.filter((v) => v.encounterId === id);
  assert(lines.length >= 1, 'toll voiced');
  auditVoice(voice, 'toll-refuse');
  assertNoModal(emitted, 'toll-refuse');
  ok('toll refuse (worst-case chatter): one primary, bark spacing held, no modal');
}
{
  // Ambush while CRUISING: snare warning must be danger-tier and precede the snare by ≥1 s.
  // Zone centers are sector-local; encounter anchors are galactic-global — place the player in
  // global space so playerNearZone / snare telegraph match live free-flight coordinates.
  const zone = zonesForSector('sector_sker_haven').find((z) => z.type === 'ambush_lane');
  const globalPos = sectorLocalToGlobalForSector(zone.center, 'sector_sker_haven');
  const { sim, state, voice, snares, emitted } = boot(62, 'sector_sker_haven', globalPos, null);
  state.player.cruise = { phase: 'cruising', t: 3, stumbleT: 0 };
  const { id } = forceFire(sim, 'ambush_snare', 'sector_sker_haven', { zone });
  const warnAt = state.simTime;
  tickS(sim, 6);
  const warn = voice.find((v) => v.encounterId === id && /snare|Mass-snare|Break vector/i.test(v.text));
  assert(warn, 'cruising into an ambush telegraphs the snare');
  assert.equal(warn.channel, 'alert', 'snare warning is danger-tier');
  assert.equal(snares.length, 1, 'exactly one snare per shape instance (never chain-snared)');
  assert(snares[0] - warnAt >= 1, `warning precedes snare by ≥1 s (got ${(snares[0] - warnAt).toFixed(2)})`);
  auditVoice(voice, 'ambush-snare');
  assertNoModal(emitted, 'ambush-snare');
  ok('ambush snare: alert-tier warning ≥1 s before the snare, one snare max');
}
{
  // Distress + scan-first: the tell is one quiet info line; the spring line is danger-tier.
  const { sim, state, player, voice, emitted } = boot(63, 'sector_ceres_belt', { x: 240, z: -1180 }, null);
  const shape = ENCOUNTERS.distress_call;
  const zones = zonesForSector('sector_ceres_belt').filter((z) => shape.zoneTypes.includes(z.type));
  let item = null;
  for (let s = 1; s < 300 && !item; s++) {
    const it = planEncounterShape(shape, zones[0], 'sector_ceres_belt', 0, 500 + s, mulberry32(hash32(s, 'craft-distress')));
    if (it.variantKind === 'distress_bait') item = it;
  }
  const { id } = forceFire(sim, 'distress_call', 'sector_ceres_belt', { item });
  player.pos.x = item.zoneCenter.x + 1100; player.pos.z = item.zoneCenter.z;   // in tell range, outside spring
  tickS(sim, 1);
  sim.bus.emit('scan:pulse', {});
  sim.bus.emit('scan:pulse', {});                      // second pulse must NOT re-tell
  tickS(sim, 1);
  const tells = voice.filter((v) => v.encounterId === id && /Signal reads wrong|heartbeat aboard/i.test(v.text));
  assert.equal(tells.length, 1, 'scan-first tells exactly once');
  assert.equal(tells[0].channel, 'info', 'the tell is quiet intel, not a bark');
  player.pos.x = item.zoneCenter.x; player.pos.z = item.zoneCenter.z;          // spring it
  tickS(sim, 2);
  auditVoice(voice, 'distress-tell');
  assertNoModal(emitted, 'distress-tell');
  ok('distress scan-first: single quiet tell, no re-tell, spring stays within voice law');
}

// ── 3. copy contract: every bark is authored and safe for the inline one-voice surface
{
  let variantCount = 0;
  for (const [bid, val] of Object.entries(ENCOUNTER_BARKS)) {
    const lines = Array.isArray(val) ? val : [val];
    for (const text of lines) {
      assert.equal(typeof text, 'string', `bark ${bid} must be a string`);
      assert(text.trim(), `bark ${bid} must contain player-facing copy`);
      assert(!/[\r\n\u2028\u2029]/u.test(text), `bark ${bid} must fit the inline voice surface: "${text}"`);
      assert(!/[\u0000-\u001f\u007f\ufffd]/u.test(text), `bark ${bid} contains an unsafe control/replacement character: "${text}"`);
    }
    if (Array.isArray(val)) variantCount++;
  }
  ok(`copy contract: ${Object.keys(ENCOUNTER_BARKS).length} bark keys (${variantCount} variant arrays) are authored and inline-safe`);
}

// ── 4. variant rotation: forced toll fires emit distinct primary lines across encounter ids ─────
{
  const primaries = [];
  const shape = ENCOUNTERS.pirate_toll;
  const zones = zonesForSector('sector_tethys_junction').filter((z) => shape.zoneTypes.includes(z.type));
  for (const [seq, seed] of [81, 82, 83, 84, 85].map((s, i) => [i, s])) {
    const { sim, voice } = boot(seed, 'sector_tethys_junction', { x: 500, z: 1500 }, { cmdty_refined_metals: 12 });
    const item = planEncounterShape(shape, zones[0], 'sector_tethys_junction', 0, seq, mulberry32(hash32(seed, 'variant-rot', seq)));
    forceFire(sim, 'pirate_toll', 'sector_tethys_junction', { item });
    const p = voice.find((v) => v.primary);
    if (p) primaries.push(p.text);
  }
  const distinct = new Set(primaries);
  for (const t of primaries) console.log(`  variant toll primary: "${t}"`);
  assert(primaries.length >= 3, 'expected ≥3 toll primaries from forced fires');
  assert(distinct.size >= 2, `variant toll primaries should differ across encounters (got ${distinct.size} distinct)`);
  ok(`variant rotation: ${distinct.size} distinct toll_demand primaries across ${primaries.length} forced fires`);
}

console.log(`[check-encounter-one-voice] PASS — ${sections} sections green`);
