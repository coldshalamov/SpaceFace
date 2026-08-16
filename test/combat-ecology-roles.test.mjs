/**
 * Package C — three combat roles force different counters via shipped enemy + encounter data
 * and makeEnemySpawnSpec (live combat path).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { SECTORS } from '../src/data/sectors.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { planEncounterShape } from '../src/systems/encounterDirector.js';
import { WEAPONS } from '../src/data/weapons.js';
import { SPECIALIST_ENEMY_IDS } from '../src/data/specialistFamily.js';

const ECOLOGY = [
  {
    id: 'mine_layer_jackal',
    encounterId: 'minefield_wake',
    mustPreferRangeMax: 400,
    mustHaveWeaponFamily: /missile|autocannon|flak/i,
    counter: 'cut_tether_or_clear_wake',
    telegraphCue: 'wake_mines',
    guaranteedAnchor: true,
  },
  {
    id: 'pd_screen_escort',
    encounterId: 'pd_screen_wall',
    mustPreferRangeMax: 350,
    mustHaveWeaponFamily: /flak/i,
    counter: 'hold_missiles_use_kinetics_peel_escort',
    telegraphCue: 'pd_curtain',
    guaranteedAnchor: true,
  },
  {
    id: 'quiet_ghost',
    encounterId: 'ghost_on_the_bearing',
    mustPreferRangeMin: 600,
    mustHaveWeaponFamily: /railgun|emp/i,
    counter: 'break_lock_close_under_cover',
    telegraphCue: 'sensor_ghost',
  },
];

const byId = new Map(ENEMY_TYPES.map((e) => [e.id, e]));
const specialistIds = new Set(SPECIALIST_ENEMY_IDS);
const weapons = Array.isArray(WEAPONS) ? WEAPONS : Object.values(WEAPONS);
const weaponById = new Map(weapons.map((w) => [w.id, w]));

const SWARM_CASES = [
  {
    id: 'ambush_snare', encounter: ENCOUNTERS.ambush_snare,
    squad: ENCOUNTERS.ambush_snare?.squad, role: 'squad', anchor: 'reaver_pirate', light: 'wasp_swarmer',
  },
  {
    id: 'claim_threat', encounter: ENCOUNTERS.claim_threat,
    squad: ENCOUNTERS.claim_threat?.squad, role: 'squad', anchor: 'reaver_pirate', light: 'wasp_swarmer',
  },
  {
    id: 'distress_call.genuine.threat', encounter: ENCOUNTERS.distress_call,
    squad: ENCOUNTERS.distress_call?.genuine?.threat, role: 'threat', branchRoll: 0,
    anchor: 'reaver_pirate', light: 'wasp_swarmer',
  },
  {
    id: 'distress_call.bait', encounter: ENCOUNTERS.distress_call,
    squad: ENCOUNTERS.distress_call?.bait?.squad, role: 'bait', branchRoll: 0.99,
    anchor: 'corsair_raider', light: 'wasp_swarmer',
  },
  {
    id: 'pattern_refrain', encounter: ENCOUNTERS.pattern_refrain,
    squad: ENCOUNTERS.pattern_refrain?.squad, role: 'squad', anchor: 'choir_zealot', light: 'choir_zealot',
  },
];
const SWARM_SEEDS = [1, 7, 47, 91, 1234, 9001];
const SWARM_ZONE = {
  id: 'test_swarm_lane',
  name: 'Test swarm lane',
  type: 'ambush_lane',
  center: { x: 0, z: 0 },
  radius: 300,
  threat: 0.5,
};

function realizedSwarm(row, seed) {
  const seeded = mulberry32(hash32('swarm-density', row.id, seed));
  let branchPending = Number.isFinite(row.branchRoll);
  const rng = () => {
    if (branchPending) {
      branchPending = false;
      return row.branchRoll;
    }
    return seeded();
  };
  const plan = planEncounterShape(
    row.encounter,
    SWARM_ZONE,
    'sector_io_reach',
    1,
    seed,
    rng,
  );
  return plan.ships.filter((ship) => ship.role === row.role);
}

test('three ecology roles exist with distinct preferred ranges, loadouts, telegraphs', () => {
  const ranges = [];
  const counters = new Set();
  const cues = new Set();
  for (const row of ECOLOGY) {
    const def = byId.get(row.id);
    assert.ok(def, `missing enemy ${row.id}`);
    const range = Number(def.aiDoctrine?.preferredRange || 0);
    ranges.push(range);
    if (row.mustPreferRangeMax != null) assert.ok(range <= row.mustPreferRangeMax, `${row.id} range ${range}`);
    if (row.mustPreferRangeMin != null) assert.ok(range >= row.mustPreferRangeMin, `${row.id} range ${range}`);
    assert.ok(Array.isArray(def.weapons) && def.weapons.length > 0);
    const weaponBlob = def.weapons.map((w) => w.id).join(' ');
    assert.match(weaponBlob, row.mustHaveWeaponFamily, `${row.id} weapons`);
    assert.ok(def.telegraph?.line && def.telegraph.line.length >= 12, `${row.id} telegraph line`);
    assert.ok(def.telegraph?.cue, `${row.id} telegraph cue`);
    assert.equal(def.counterHint, row.counter);
    counters.add(def.counterHint);
    cues.add(def.telegraph.cue);
    // Spawn path must accept the role id.
    const spec = makeEnemySpawnSpec(row.id, 4, { x: 10, z: -20 });
    assert.ok(spec, `makeEnemySpawnSpec(${row.id})`);
    assert.equal(spec.data?.ai?.archetype || spec.ai?.archetype || def.aiArchetype, def.aiArchetype);
  }
  // Measurable difference: not all three share the same preferred range band.
  assert.ok(Math.max(...ranges) - Math.min(...ranges) >= 300,
    `preferred ranges must spread by ≥300wu (got ${ranges.join(',')})`);
  assert.equal(counters.size, 3, 'three distinct counters');
  assert.equal(cues.size, 3, 'three distinct telegraph cues');
});

test('each ecology role has a mid-sec encounter composition with telegraph + aftermath', () => {
  for (const row of ECOLOGY) {
    const enc = ENCOUNTERS[row.encounterId];
    assert.ok(enc, `encounter ${row.encounterId}`);
    const sampled = enc.squad?.archetypes || [];
    if (row.guaranteedAnchor) {
      assert.equal(enc.squad?.anchorArchetype, row.id,
        `${row.encounterId} guarantees its specialist instead of sampling it`);
      assert.ok(sampled.every((enemyId) => !specialistIds.has(enemyId)),
        `${row.encounterId} samples only ordinary companions`);
    } else {
      assert.ok(sampled.includes(row.id), `${row.encounterId} squad includes ${row.id}`);
    }
    assert.ok(enc.telegraph || byId.get(row.id).telegraph?.line,
      `${row.encounterId} has telegraph`);
    assert.ok(enc.aftermath && (enc.aftermath.flee || enc.aftermath.kill),
      `${row.encounterId} has aftermath`);
    // Not Helios-only: zone types must allow mid/outer play, not tutorial home.
    const zones = enc.zoneTypes || [];
    assert.ok(!zones.includes('tutorial'));
    assert.ok(zones.length === 0 || zones.some((z) => /ambush|outlaw|trade|border|derelict/i.test(z)));
  }
});

test('wrong-counter vs right-counter is encoded in loadout (missiles die to flak; ghost outranges brawler)', () => {
  const jackal = byId.get('mine_layer_jackal');
  const pd = byId.get('pd_screen_escort');
  const ghost = byId.get('quiet_ghost');
  assert.ok(pd.weapons.filter((w) => /flak/i.test(w.id)).length >= 2,
    'PD escort double-stacks flak — missile spam is the wrong counter');
  assert.ok(jackal.weapons.some((w) => /missile/i.test(w.id)),
    'jackal carries missiles — PD peels them');
  assert.ok(ghost.aiDoctrine.preferredRange > pd.aiDoctrine.preferredRange + 300,
    'ghost outranges PD screen; camping at 280 is punished');
  const ghostRail = ghost.weapons.find((w) => /railgun/i.test(w.id));
  assert.ok(ghostRail, 'ghost primary is rail');
  // rangeOverride on def or weapon catalog range
  const railRange = ghostRail.rangeOverride
    || weaponById.get(ghostRail.id)?.range
    || weaponById.get(ghostRail.id)?.maxRange
    || 0;
  if (railRange > 0) assert.ok(railRange >= 800 || ghostRail.rangeOverride >= 1000);
});

test('Helios starter density remains 0 after ecology content', () => {
  const helios = SECTORS.find((s) => s.id === 'sector_helios_prime');
  assert.ok(helios);
  assert.equal(helios.enemyDensity, 0);
});

test('light-ammunition encounters guarantee one identity anchor and deterministic native fills', () => {
  for (const row of SWARM_CASES) {
    assert.ok(row.squad, `${row.id} swarm composition exists`);
    const tokens = row.squad.archetypes || [];
    assert.equal(row.squad.anchorArchetype, row.anchor, `${row.id} declares its guaranteed identity anchor`);
    assert.deepEqual(tokens, [row.light], `${row.id} uses only its faction-native light pool`);
    assert.deepEqual(row.squad.size, [4, 6], `${row.id} fields a readable four-to-six ship pack`);

    for (const seed of SWARM_SEEDS) {
      const ships = realizedSwarm(row, seed);
      assert.deepEqual(ships, realizedSwarm(row, seed), `${row.id} seed ${seed} is repeatable`);
      assert.ok(ships.length >= 4 && ships.length <= 6,
        `${row.id} seed ${seed} realizes four-to-six ships`);
      const anchors = ships.filter((ship) => ship.compositionRole === 'identity_anchor');
      const lights = ships.filter((ship) => ship.compositionRole === 'light');
      assert.equal(anchors.length, 1, `${row.id} seed ${seed} realizes exactly one anchor`);
      assert.equal(anchors[0].archetype, row.anchor, `${row.id} seed ${seed} preserves anchor identity`);
      assert.equal(lights.length, ships.length - 1, `${row.id} seed ${seed} fills every other slot light`);
      assert.ok(lights.every((ship) => ship.archetype === row.light),
        `${row.id} seed ${seed} uses only its native light identity`);
    }
  }
});
