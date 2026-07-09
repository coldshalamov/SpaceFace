/**
 * Overnight B1 playable-core gates — drives REAL shipped modules (no reimplementation).
 * Covers: latch grace widen, nose spool lever, undock invuln, bank standstill, flyby focus pick,
 * starter ship display name, soft-latch exports, discoverability prompts (MMB / G / F).
 */
import assert from 'node:assert/strict';
import {
  CURSOR_LATCH_GRACE,
  CURSOR_LATCH_GRACE_MAX,
  AIM_RAY_GRACE,
  AIM_RAY_GRACE_MAX,
  latchGraceScale,
  cursorAimScore,
} from '../src/systems/tetherGameplay.js';
import { COMBAT_PROFILES } from '../src/data/combatDefs.js';
import { UNDOCK_INVULN_S } from '../src/systems/combat.js';
import { FLIGHT_BANK_TUNING } from '../src/systems/flightV3.js';
import { pickFlybyTarget } from '../src/systems/flybyFocus.js';
import { SHIPS } from '../src/data/ships.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { SECTORS } from '../src/data/sectors.js';
import { controlPrompt, setPromptScheme } from '../src/ui/controlPrompts.js';
import { MANEUVER_SPEED_CAPS } from '../src/ai/maneuver.js';
import fs from 'node:fs';

// --- Latch forgiveness (real exports from tetherGameplay) ---
assert.ok(CURSOR_LATCH_GRACE >= 30, `CURSOR_LATCH_GRACE too tight: ${CURSOR_LATCH_GRACE}`);
assert.ok(CURSOR_LATCH_GRACE_MAX >= 80, `CURSOR_LATCH_GRACE_MAX too tight: ${CURSOR_LATCH_GRACE_MAX}`);
assert.ok(AIM_RAY_GRACE >= 18, `AIM_RAY_GRACE too tight: ${AIM_RAY_GRACE}`);
assert.ok(AIM_RAY_GRACE_MAX >= 50, `AIM_RAY_GRACE_MAX too tight: ${AIM_RAY_GRACE_MAX}`);

// Off-cursor aim should still score finite within widened ray grace
{
  const player = { pos: { x: 0, z: 0 }, rot: 0 };
  const entity = { pos: { x: 80, z: 18 }, radius: 10 };
  const aim = { x: 200, z: 0 };
  const ux = 1, uz = 0;
  const hit = cursorAimScore(entity, aim, player, ux, uz, 200, null);
  assert.ok(Number.isFinite(hit.score), 'widened ray should latch off-axis target');
}

// Flyby Focus multiplies latch scale via real helper
{
  const idle = latchGraceScale({ player: { flybyFocus: { active: false } } });
  const hot = latchGraceScale({ player: { flybyFocus: { active: true, latchScale: 2.6 } } });
  assert.equal(idle, 1);
  assert.ok(hot >= 2.4, `focus latch scale expected ≥2.4 got ${hot}`);
}

// --- Nose spool lever (real combat profile data) ---
{
  const profile = COMBAT_PROFILES.find((p) => p.id === 'combat_profile_standard_ship');
  assert.ok(profile, 'standard ship combat profile');
  const spool = (profile.sockets || []).find((s) => s.id === 'socket_tether_spool');
  assert.ok(spool, 'tether spool socket');
  const lx = Number(spool.localPos && spool.localPos[0]);
  // 0.50 is the slingshot-safe nose bias (0.38 was COM-ish; ≥0.72 broke release energy).
  assert.ok(lx >= 0.48, `spool should be forward of COM (localPos.x≥0.48), got ${lx}`);
  assert.ok(lx <= 0.70, `spool too far forward risks slingshot instability: ${lx}`);
}

// --- Undock invuln (real combat export) ---
assert.ok(UNDOCK_INVULN_S >= 7, `UNDOCK_INVULN_S should be ≥7s, got ${UNDOCK_INVULN_S}`);

// --- Bank standstill reduced (real flightV3 export) ---
assert.ok(FLIGHT_BANK_TUNING.BANK_STANDSTILL <= 0.1, 'standstill bank should be low');
assert.ok(FLIGHT_BANK_TUNING.DEFAULT_BANK_MAX <= 0.5, 'bank max should be moderate for top-down');
assert.ok(FLIGHT_BANK_TUNING.BANK_RATE_GAIN <= 0.26, 'bank rate gain should be calmer');

// --- Flyby Focus pick (real pure helper) ---
{
  const player = {
    id: 1, team: 0, pos: { x: 0, z: 0 }, vel: { x: 120, z: 0 }, rot: 0,
  };
  const friend = { id: 2, type: 'ship', team: 0, alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 } };
  const foe = { id: 3, type: 'ship', team: 1, alive: true, pos: { x: 100, z: 10 }, vel: { x: -40, z: 0 }, data: { ai: { archetype: 'pirate' } } };
  const lawful = { id: 4, type: 'ship', team: 1, alive: true, pos: { x: 90, z: 0 }, vel: { x: -20, z: 0 }, data: { ai: { lawful: true, roe: 'lawful_wanted_only' } } };
  const state = { playerId: 1, player: { heat: 0 } };
  const miss = pickFlybyTarget(state, player, [friend]);
  assert.equal(miss, null, 'should not focus friendlies');
  const cleanLaw = pickFlybyTarget(state, player, [lawful]);
  assert.equal(cleanLaw, null, 'should not focus lawful patrols while player is clean');
  const hit = pickFlybyTarget(state, player, [friend, foe]);
  assert.ok(hit && hit.id === 3, 'should pick hostile flyby target');
  assert.ok(hit.rel >= 72, 'relative speed should clear threshold');
}

// --- Identity: starter display name not Freelancer "Kestrel" ---
{
  const starter = SHIPS.find((s) => s.id === 'ship_kestrel');
  assert.ok(starter, 'ship_kestrel exists');
  assert.notEqual(String(starter.name).toLowerCase(), 'kestrel', 'display name must not be Kestrel');
  assert.ok(starter.hull >= 130, 'starter hull buff for fairness');
}

// --- Fairness: early swarmer not zip-murder ---
{
  const swarmer = ENEMY_TYPES.find((e) => e.id === 'wasp_swarmer');
  assert.ok(swarmer);
  assert.ok(swarmer.maxSpeed <= 130, `swarmer maxSpeed too high: ${swarmer.maxSpeed}`);
  const wpn = (swarmer.weapons || [])[0];
  assert.ok(wpn && (wpn.dmgOverride == null || wpn.dmgOverride <= 4), 'swarmer dmgOverride should be soft');
}

// --- Helios density ---
{
  const helios = SECTORS.find((s) => s.id === 'sector_helios_prime');
  assert.ok(helios);
  const rocks = (helios.fields || []).reduce((n, f) => n + (f.count || 0), 0);
  assert.ok(rocks >= 50, `Helios rock count too low: ${rocks}`);
  assert.ok((helios.pois || []).length >= 3, 'Helios should have ≥3 POIs');
}

// --- Sensor material sore-thumb structural (kestrelHero source) ---
{
  const src = fs.readFileSync(new URL('../src/render/ships/kestrelHero.js', import.meta.url), 'utf8');
  assert.ok(!/emissiveMaterial\(COLOR\.frontierPale,\s*3\.2\)/.test(src),
    'high-intensity frontierPale sensor (floating white box) must be gone');
  assert.ok(/sensor:\s*emissiveMaterial\(COLOR\.frontier,\s*0\.95\)/.test(src),
    'sensor emissive should be toned-down cyan');
}

// --- Intention: intercept cap is calm enough to read as piloting ---
assert.ok(MANEUVER_SPEED_CAPS.interceptSpeed <= 80,
  `interceptSpeed too zippy: ${MANEUVER_SPEED_CAPS.interceptSpeed}`);

// --- Density: named destinations floor (stations + POIs + fields as destinations) ---
{
  const helios = SECTORS.find((s) => s.id === 'sector_helios_prime');
  const names = [];
  for (const st of helios.stations || []) names.push(st.name || st.id);
  for (const p of helios.pois || []) names.push(p.name || p.id);
  for (const f of helios.fields || []) names.push(f.id);
  assert.ok(names.length >= 5, `Helios destinations expected ≥5, got ${names.length}: ${names.join(',')}`);
  // "find 3" harness: first three named are unique
  const unique = new Set(names.filter(Boolean));
  assert.ok(unique.size >= 3, 'need ≥3 unique named destinations');
}

// --- UI: no Market loop purpose essay on default market surface ---
{
  const marketSrc = fs.readFileSync(new URL('../src/ui/screens/market.js', import.meta.url), 'utf8');
  assert.ok(!/st-market-purpose/.test(marketSrc) || !/Market loop:/.test(marketSrc),
    'market purpose-essay banner must be removed from default surface');
  assert.ok(!/innerHTML = '<b>Market loop:/.test(marketSrc), 'Market loop banner HTML must be gone');
  const hubSrc = fs.readFileSync(new URL('../src/ui/screens/stationHub.js', import.meta.url), 'utf8');
  assert.ok(!/st-mission-guide">Pick a contract to preflight/.test(hubSrc),
    'missions multi-sentence guide essay must be removed');
}

// --- G4 ASSET_STATUS populated for LIVE places ---
{
  const status = JSON.parse(fs.readFileSync(new URL('../assets/ASSET_STATUS.json', import.meta.url), 'utf8'));
  const keys = Object.keys(status.assets || {});
  assert.ok(keys.length >= 15, `ASSET_STATUS should list LIVE places, got ${keys.length}`);
  const live = keys.filter((k) => status.assets[k].lifecycle === 'VISIBLE_IN_PLAY');
  assert.ok(live.length >= 15, `VISIBLE_IN_PLAY places expected ≥15, got ${live.length}`);
}

// --- Discoverability: helm + pilot prompts expose MMB course/pursue, G combat computer, F massline ---
// Drives the real controlPrompt() resolver (same path UI uses), not a string reimplementation.
{
  function assertDiscoverable(scheme, key) {
    setPromptScheme(scheme);
    const text = controlPrompt(key, 'kbm');
    assert.ok(typeof text === 'string' && text.length > 20, `${scheme}/${key} prompt missing`);
    assert.match(text, /\bMMB\b/i, `${scheme}/${key} must mention MMB course/pursue`);
    assert.match(text, /\bG\b.*combat computer|combat computer.*\bG\b/i,
      `${scheme}/${key} must teach G combat computer`);
    assert.match(text, /\bF\b.*massline|massline.*\bF\b/i,
      `${scheme}/${key} must teach F massline`);
    return text;
  }

  for (const scheme of ['pilot', 'helm-assist']) {
    const flight = assertDiscoverable(scheme, 'flight');
    const combat = assertDiscoverable(scheme, 'combat');
    // firstCombat must call out flyby focus window (signature overnight assist)
    setPromptScheme(scheme);
    const firstCombat = controlPrompt('firstCombat', 'kbm');
    assert.match(firstCombat, /FLYBY FOCUS|flyby focus/i,
      `${scheme}/firstCombat must mention Flyby Focus`);
    assert.match(firstCombat, /\bF\b/, `${scheme}/firstCombat must mention F latch`);
    // Ensure combat computer phrasing is not the old vague "auto-target" only
    assert.ok(/combat computer/i.test(flight) || /combat computer/i.test(combat),
      `${scheme} must say "combat computer" not only auto-target`);
  }

  // Resolver must switch schemes (proves we hit real scheme tables)
  setPromptScheme('pilot');
  const pilotFlight = controlPrompt('flight', 'kbm');
  setPromptScheme('helm-assist');
  const helmFlight = controlPrompt('flight', 'kbm');
  assert.notEqual(pilotFlight, helmFlight, 'pilot vs helm-assist flight prompts must differ');
  setPromptScheme('pilot');
}

console.log('check:overnight:playable OK');
