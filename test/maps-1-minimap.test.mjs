// MAPS-1 — unified tactical flight minimap contracts:
//   - 12 data-driven role glyphs (new enemy kinds classify by role/doctrine/archetype, never an ID switch)
//   - breathing range (tightens in fight, eases wider with speed, tactical/survey toggle in both modes)
//   - live gun range and Line reach rings
//   - human m/km units only (no 'u')
//   - collision-free label solver (drops lower-priority label instead of overlapping)
//   - chamfered rim intersection for off-edge pins & objective bearing notch
//   - static & room offscreen layer caching (zero rebuilds at steady pose; rebuilds on range/sector change)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTACT_ROLE_GLYPHS,
  classifyContactRole,
  drawRoleGlyph,
  formatMinimapDistance,
  solveMinimapLabelPlacement,
} from '../src/ui/map/tacticalMapGrammar.js';
import { createFlightMinimap, intersectChamferRim } from '../src/ui/map/flightMinimap.js';
import {
  gunRangeForEntity,
  lineReachForEntity,
  resolveMinimapTargetRange,
} from '../src/ui/radar.js';

test('all 12 contact role glyphs are defined and data-driven classification covers real and future kinds', () => {
  const expectedRoles = [
    'light_fighter', 'heavy', 'support', 'sniper', 'rammer', 'minelayer',
    'boss', 'civilian', 'station', 'gate', 'loot', 'wreck',
  ];
  for (const role of expectedRoles) {
    assert.ok(CONTACT_ROLE_GLYPHS[role], `missing role glyph descriptor: ${role}`);
  }

  // Real authored enemies resolve cleanly from src/data/enemies.js & packArchetypes.js
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'wasp_swarmer' } }), 'light_fighter');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'bruiser_brawler' } }), 'heavy');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'warden_escort' } }), 'support');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'pd_screen_escort' } }), 'support');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'choir_zealot' } }), 'support');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'lancer_sniper' } }), 'sniper');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'quiet_ghost' } }), 'sniper');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'detonator_dart' } }), 'rammer');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'mine_layer_jackal' } }), 'minelayer');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'dreadnought_boss' } }), 'boss');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'mirrorjaw_foreman' } }), 'boss');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'mule_trader' } }), 'civilian');

  // Non-ship world entities
  assert.equal(classifyContactRole({ type: 'station', data: {} }), 'station');
  assert.equal(classifyContactRole({ type: 'station', data: { isGate: true } }), 'gate');
  assert.equal(classifyContactRole({ type: 'pickup', data: {} }), 'loot');
  assert.equal(classifyContactRole({ type: 'wreck', data: {} }), 'wreck');

  // Future unknown enemy IDs still classify purely by their role/doctrine/archetype fields
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'future_sniper_x', aiArchetype: 'sniper' } }), 'sniper');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'future_shield_x', combatDoctrineId: 'escort_screen' } }), 'support');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'future_ram_x', detonator: { blastRadius: 80 } } }), 'rammer');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'future_mine_x', role: 'disruptor' } }), 'minelayer');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'future_boss_x', isBoss: true } }), 'boss');
  assert.equal(classifyContactRole({ type: 'ship', data: { enemyTypeId: 'future_heavy_x', role: 'heavy' } }), 'heavy');
});

test('minimap distances print strictly in m or km and never u', () => {
  assert.equal(formatMinimapDistance(0), '0 m');
  assert.equal(formatMinimapDistance(457.4), '457 m');
  assert.equal(formatMinimapDistance(999), '999 m');
  assert.equal(formatMinimapDistance(1000), '1.0 km');
  assert.equal(formatMinimapDistance(4620), '4.6 km');
  assert.equal(formatMinimapDistance(12400), '12 km');
  assert.equal(formatMinimapDistance(-10), '');
  for (const val of [50, 420, 999, 1000, 3600, 12000]) {
    assert.doesNotMatch(formatMinimapDistance(val), /\bu\b/i);
  }
});

test('minimap breathing range tightens in fight, widens with speed, and toggles survey in both modes', () => {
  const advState = { ui: { radarRange: 4000 }, run: { kind: 'adventure', phase: 'inactive' } };
  const advCalmSlow = resolveMinimapTargetRange(advState, { attention: 'calm', expanded: false, speed: 0, maxSpeed: 180 });
  const advCalmFast = resolveMinimapTargetRange(advState, { attention: 'calm', expanded: false, speed: 180, maxSpeed: 180 });
  const advFightSlow = resolveMinimapTargetRange(advState, { attention: 'fight', expanded: false, speed: 0, maxSpeed: 180 });
  const advFightFast = resolveMinimapTargetRange(advState, { attention: 'fight', expanded: false, speed: 180, maxSpeed: 180 });
  const advSurvey = resolveMinimapTargetRange(advState, { attention: 'fight', expanded: true, speed: 0, maxSpeed: 180 });

  assert.ok(advCalmFast > advCalmSlow, 'calm range widens with ship speed');
  assert.ok(advFightSlow < advCalmSlow, 'fight attention tightens the minimap');
  assert.ok(advFightFast > advFightSlow, 'fight range still breathes wider with speed');
  assert.ok(advSurvey > advCalmFast, 'survey toggle widens past standard range');

  const swarmState = { ui: { radarRange: 4000 }, run: { kind: 'survival', ruleset: 'swarm', phase: 'active' } };
  const swarmTactical = resolveMinimapTargetRange(swarmState, { attention: 'fight', expanded: false, speed: 0, maxSpeed: 180 });
  const swarmFast = resolveMinimapTargetRange(swarmState, { attention: 'fight', expanded: false, speed: 180, maxSpeed: 180 });
  const swarmSurvey = resolveMinimapTargetRange(swarmState, { attention: 'fight', expanded: true, speed: 0, maxSpeed: 180 });

  assert.ok(swarmTactical <= 600, `Swarm tactical stays tight (${swarmTactical})`);
  assert.ok(swarmFast > swarmTactical, 'Swarm range eases wider with speed');
  assert.ok(swarmSurvey >= swarmTactical * 1.8, 'Swarm survey toggle expands cleanly');
});

test('live gun range and Line reach helpers follow fitted ship loadout', () => {
  const basePlayer = {
    data: {
      weapons: [{ range: 820 }],
      derived: { tetherSpoolMult: 1 },
    },
  };
  assert.equal(gunRangeForEntity(basePlayer), 820);
  assert.equal(lineReachForEntity({}, basePlayer), 390);

  basePlayer.data.derived.tetherSpoolMult = 1.5;
  assert.equal(lineReachForEntity({}, basePlayer), 585);
});

test('collision solver keeps labels inside the chamfered frame and drops colliding lower-priority labels', () => {
  const bounds = { width: 320, height: 190, margin: 8, chamfer: 14, markRadius: 10 };
  const occupied = [{ x: 145, y: 80, w: 30, h: 30 }];
  const first = solveMinimapLabelPlacement({ x: 100, y: 95 }, 92, 20, occupied, bounds);
  assert.ok(first, 'first priority label places cleanly');
  assert.ok(first.x >= 8 && first.y >= 8 && first.x + first.w <= 312 && first.y + first.h <= 182);

  // Fill every area around a crowded corner so a second label has nowhere to fit -> must drop (null)
  const crowded = [
    { x: 0, y: 0, w: 320, h: 190 },
  ];
  const dropped = solveMinimapLabelPlacement({ x: 100, y: 95 }, 80, 18, crowded, bounds);
  assert.equal(dropped, null, 'lower-priority label drops cleanly instead of overlapping');
});

test('chamfer rim intersection lands on the octagon perimeter including diagonal corners', () => {
  const w = 360;
  const h = 200;
  const cut = 15;
  const right = intersectChamferRim(w / 2, h / 2, 1, 0, w, h, 8, cut);
  assert.ok(Math.abs(right.x - (w - 8)) < 0.01 && Math.abs(right.y - h / 2) < 0.01);

  const corner = intersectChamferRim(w / 2, h / 2, 1, 1, w, h, 8, cut);
  assert.ok(corner.x <= w - 8 && corner.y <= h - 8);
  // Must respect the 45-degree chamfer bevel (not extend into the cut corner)
  assert.ok((w - corner.x) + (h - corner.y) >= cut - 0.5);
});

test('flightMinimap caches static and room offscreen layers across steady draws and rebuilds on range/sector change', () => {
  const noop = () => {};
  const fakeCtx = () => ({
    save: noop, restore: noop, clearRect: noop, fillRect: noop, strokeRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
    quadraticCurveTo: noop, rect: noop, clip: noop, fill: noop, stroke: noop,
    translate: noop, rotate: noop, scale: noop, setTransform: noop, setLineDash: noop,
    drawImage: noop, strokeText: noop, fillText: noop,
    measureText: (t) => ({ width: String(t || '').length * 7 }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createConicGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
  });
  const fakeDoc = {
    createElement() {
      return {
        width: 0, height: 0, className: '',
        setAttribute: noop, addEventListener: noop, removeEventListener: noop,
        getContext: fakeCtx,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 204 }),
      };
    },
  };

  const mm = createFlightMinimap(fakeDoc, 1, noop);
  const basePayload = {
    player: { id: 1, pos: { x: 0, z: 0 }, vel: { x: 20, z: 0 }, rot: 0 },
    range: 600,
    gunRange: 420,
    lineReach: 390,
    objective: { label: 'Beacon', waypointPos: { x: 900, z: 0 }, cueOwner: {} },
    infrastructure: [],
    neutral: [],
    hostile: [{ entity: { id: 2, type: 'ship', pos: { x: 140, z: 60 }, vel: { x: -30, z: 10 }, rot: 1, data: { enemyTypeId: 'lancer_sniper' } }, distanceSq: 23200 }],
    offRangeHostiles: [],
    ghosts: [],
    courses: [],
    rocks: [{ id: 10, pos: { x: 80, z: -40 }, radius: 28, alive: true }],
    roomWalls: [],
    mines: [],
    activeFields: [],
    staticHazards: [],
    heatZone: null,
    targetId: 2,
    blind: false,
    reducedMotion: false,
    nowMs: 1000,
    sectorId: 'sector_helios_prime',
    asteroidVersion: 1,
    isSwarm: true,
    expanded: false,
  };

  mm.paint(basePayload);
  mm.paint({ ...basePayload, nowMs: 1050 });
  mm.paint({ ...basePayload, nowMs: 1100, player: { ...basePayload.player, pos: { x: 40, z: 25 } } });
  let stats = mm.getStats();
  assert.equal(stats.drawCalls, 3);
  assert.equal(stats.staticRebuilds, 1, 'static frame+rings layer stays cached across consecutive 20 Hz draws');
  assert.equal(stats.roomRebuilds, 1, 'oversized scrolling room cache avoids rebuilding during normal flight drift');

  // Changing range rebuilds static & room layers once
  mm.paint({ ...basePayload, range: 1120, nowMs: 1150 });
  stats = mm.getStats();
  assert.equal(stats.staticRebuilds, 2, 'range change rebuilds static layer');
  assert.equal(stats.roomRebuilds, 2, 'range change rebuilds room layer');

  // Changing sector rebuilds room layer without unnecessarily rebuilding static layer
  mm.paint({ ...basePayload, range: 1120, sectorId: 'sector_ceres_belt', nowMs: 1200 });
  stats = mm.getStats();
  assert.equal(stats.staticRebuilds, 2, 'same range keeps static layer cached');
  assert.equal(stats.roomRebuilds, 3, 'sector change rebuilds room layer');

  // Drawing every glyph across all 3 stances succeeds cleanly without throwing
  const g = fakeCtx();
  for (const role of Object.keys(CONTACT_ROLE_GLYPHS)) {
    for (const stance of ['hostile', 'friendly', 'neutral']) {
      drawRoleGlyph(g, role, stance, 40, 40, 0.5, { color: '#ff5038', alpha: 0.9 });
    }
  }
  mm.dispose();
});

test('solveMinimapLabelPlacement always places an off-edge rim objective near a top-right corner at 1280x720', () => {
  const occupied = [
    { x: 143, y: 78, w: 30, h: 30 }, // player center
    { x: 142, y: 2, w: 32, h: 24 },  // top-center N mark
    { x: 239, y: 161, w: 72, h: 22 }, // bottom-right range
  ];
  const placed = solveMinimapLabelPlacement({ x: 245, y: 6.5 }, 144, 20, occupied, {
    width: 317,
    height: 187,
    margin: 8,
    chamfer: 11,
    markRadius: 11,
  });
  assert.ok(placed, 'rim-pinned objective near top-right corner must still find a clean collision-free label slot');
  assert.ok(placed.x >= 8 && placed.x + placed.w <= 309, 'placed inside horizontal frame bounds');
  assert.ok(placed.y >= 8 && placed.y + placed.h <= 179, 'placed inside vertical frame bounds');
});
