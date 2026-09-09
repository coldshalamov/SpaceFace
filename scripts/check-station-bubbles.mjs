// BP-11 packet A2 acceptance check: Station Orbit Bubbles (pure data half).
//
// Contract (src/data/stationBubbles.js — see design/revamp/detail/A_sector_station.md packet A2):
//   - bubblesFor(station) returns four rings with MONOTONIC radii (noFire < docking < patrol <
//     traffic) for a size-L station, deterministically (same station → identical result).
//   - Radii derive from dockRadius · multipliers · size factor (bigger size → bigger rings).
//   - createNoFireWatch: weapon-draw INSIDE the no-fire ring → exactly one say({channel:'warn'}),
//     debounced per ENTRY: staying inside fires once; leave + re-enter fires again; outside the
//     ring fires nothing. No hostility coupling: the watch never changes behavior by factionId
//     (factionId is pass-through attribution only).
//
// NOTE: the mesh half (src/render/stationBubbleRings.js) is graphics-lane-owned and lands
// separately; this check pins the data + comms-debounce contract that the render module consumes.
import assert from 'node:assert/strict';

import { bubblesFor, createNoFireWatch, NO_FIRE_BARK } from '../src/data/stationBubbles.js';

assertMonotonicRadiiSizeL();
assertDeterministic();
assertSizeScalesRings();
assertDefensiveDefaults();
assertBarkOncePerEntry();
assertReentryRearmsBark();
assertOutsideNeverBarks();
assertFactionIdIsPassThroughOnly();

console.log('Station bubbles checks OK');

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────

function stationL(over = {}) {
  return { id: 'station_helios', pos: { x: 0, z: 0 }, dockRadius: 100, size: 'L', factionId: 'faction_scn', ...over };
}

function makeSayLog() {
  const calls = [];
  return { calls, say: (msg) => calls.push(msg) };
}

// ── bubblesFor ─────────────────────────────────────────────────────────────────────────────────

function assertMonotonicRadiiSizeL() {
  const b = bubblesFor(stationL());
  for (const key of ['traffic', 'patrol', 'docking', 'noFire']) {
    assert.ok(b[key] && Number.isFinite(b[key].radius) && b[key].radius > 0, `${key} ring must have a positive radius`);
    assert.equal(typeof b[key].color, 'string', `${key} ring must carry a color`);
  }
  assert.ok(b.noFire.radius < b.docking.radius, 'noFire < docking');
  assert.ok(b.docking.radius < b.patrol.radius, 'docking < patrol');
  assert.ok(b.patrol.radius < b.traffic.radius, 'patrol < traffic');
}

function assertDeterministic() {
  assert.deepEqual(bubblesFor(stationL()), bubblesFor(stationL()),
    'same station fields must yield identical bubbles');
}

function assertSizeScalesRings() {
  const s = bubblesFor(stationL({ size: 'S' }));
  const l = bubblesFor(stationL({ size: 'L' }));
  assert.ok(s.noFire.radius < l.noFire.radius, 'a size-S station projects a smaller no-fire core than size-L');
}

function assertDefensiveDefaults() {
  // Entity-style station (data.dockRadius) and a bare object must both resolve without throwing.
  const entityStyle = bubblesFor({ id: 7, pos: { x: 0, z: 0 }, data: { stationId: 'station_x', dockRadius: 60, factionId: 'faction_dmc' } });
  assert.ok(entityStyle.noFire.radius > 0 && entityStyle.stationId != null, 'entity-style station resolves');
  assert.equal(entityStyle.factionId, 'faction_dmc', 'factionId read from entity data');
  const bare = bubblesFor({});
  assert.ok(bare.noFire.radius < bare.traffic.radius, 'bare station degrades to defaults, still monotonic');
}

// ── no-fire watch (debounced comms cue) ────────────────────────────────────────────────────────

function assertBarkOncePerEntry() {
  const st = stationL();
  const inside = { x: 10, z: 0 };            // well inside noFire (radius ≈ 172)
  const { calls, say } = makeSayLog();
  const watch = createNoFireWatch({ say });

  const hit = watch.weaponDrawn(inside, [st]);
  assert.equal(hit, 'station_helios', 'first draw inside the ring must bark and name the station');
  assert.equal(calls.length, 1, 'exactly ONE warn bark on first weapon-draw inside the ring');
  assert.equal(calls[0].channel, 'warn', `bark must route on the 'warn' channel; got ${calls[0].channel}`);
  assert.equal(calls[0].text, NO_FIRE_BARK, 'bark carries the advisory line');

  // Staying inside: more draws + frame updates stay silent.
  watch.update(inside, [st]);
  watch.weaponDrawn(inside, [st]);
  watch.weaponDrawn({ x: -20, z: 15 }, [st]);
  assert.equal(calls.length, 1, `staying inside must not re-bark; got ${calls.length} calls`);
}

function assertReentryRearmsBark() {
  const st = stationL();
  const inside = { x: 10, z: 0 };
  const outside = { x: 5000, z: 0 };
  const { calls, say } = makeSayLog();
  const watch = createNoFireWatch({ say });

  watch.weaponDrawn(inside, [st]);           // bark #1
  watch.update(outside, [st]);               // leave → re-arm
  watch.weaponDrawn(inside, [st]);           // re-enter + draw → bark #2
  assert.equal(calls.length, 2, `leave + re-enter + draw must bark again (2 total); got ${calls.length}`);
}

function assertOutsideNeverBarks() {
  const st = stationL();
  const { calls, say } = makeSayLog();
  const watch = createNoFireWatch({ say });
  // Just outside noFire (radius = 100·1.5·1.15 = 172.5) but inside the outer traffic shell.
  const nearButLegal = { x: 200, z: 0 };
  assert.equal(watch.weaponDrawn(nearButLegal, [st]), null, 'outside the no-fire ring → no bark');
  assert.equal(watch.weaponDrawn({ x: 9000, z: 9000 }, [st]), null, 'deep space → no bark');
  assert.equal(calls.length, 0, 'zero voice calls outside the ring');
}

function assertFactionIdIsPassThroughOnly() {
  // Hostility contract (AGENTS §6): factionId must never change WHETHER the cue fires — only the
  // attribution it carries. Same geometry, different factions → identical bark behavior.
  const inside = { x: 10, z: 0 };
  const a = makeSayLog(); const wa = createNoFireWatch({ say: a.say });
  const b = makeSayLog(); const wb = createNoFireWatch({ say: b.say });
  wa.weaponDrawn(inside, [stationL({ factionId: 'faction_scn' })]);
  wb.weaponDrawn(inside, [stationL({ factionId: 'faction_reach' })]);
  assert.equal(a.calls.length, 1, 'concord station barks');
  assert.equal(b.calls.length, 1, 'pirate station barks identically (no factionId gating)');
  assert.equal(a.calls[0].factionId, 'faction_scn', 'attribution passes through');
  assert.equal(b.calls[0].factionId, 'faction_reach', 'attribution passes through');
  assert.equal(a.calls[0].text, b.calls[0].text, 'same advisory line regardless of faction');
}
