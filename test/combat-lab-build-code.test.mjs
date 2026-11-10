import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_LAB_SETUP_SCHEMA,
  validateCombatLabSetup,
  normalizeCombatLabSetup,
} from '../src/contracts/combatLabSetupSchema.js';
import {
  COMBAT_LAB_BUILD_CODE_VERSION,
  encodeCombatLabBuildCode,
  decodeCombatLabBuildCode,
  describeCombatLabBuildCode,
} from '../src/contracts/combatLabBuildCode.js';
import {
  COMBAT_LAB_STARTER_PACKAGES,
  COMBAT_LAB_ENEMY_PACKAGES,
  COMBAT_LAB_ARENAS,
} from '../src/data/combatLabSetups.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';

const SEEDS = [1, 2, 0xffffffff, 47, 1864401122, 0xc0ffee];
const WAVES = [1, 10, 30];

function starterSetup(starter, enemy, arena, seed, wave, extra) {
  const setup = {
    schema: COMBAT_LAB_SETUP_SCHEMA,
    hullId: starter.hullId,
    loadout: starter.loadout.map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId })),
    enemyPackageId: enemy.id,
    arenaId: arena.id,
    seed,
    wave,
  };
  if (extra) {
    for (const key of Object.keys(extra)) setup[key] = extra[key];
  }
  return setup;
}

function everyCatalogSetup() {
  const out = [];
  for (const starter of COMBAT_LAB_STARTER_PACKAGES) {
    for (const enemy of COMBAT_LAB_ENEMY_PACKAGES) {
      for (const arena of COMBAT_LAB_ARENAS) {
        for (const seed of SEEDS) {
          for (const wave of WAVES) {
            out.push(starterSetup(starter, enemy, arena, seed, wave));
          }
        }
      }
    }
  }
  return out;
}

function issueMessages(result) {
  return (result.issues || []).map((issue) => issue && issue.message).filter(Boolean);
}

function issuePaths(result) {
  return (result.issues || []).map((issue) => issue && issue.path);
}

function primaryReason(result) {
  const messages = issueMessages(result);
  assert.ok(messages.length > 0, `expected a readable reason, got ${JSON.stringify(result)}`);
  return messages[0];
}

function stripCode(code) {
  return String(code).replace(/[\s-]/g, '').toUpperCase();
}

function fnv1aU32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function base36u32(n) {
  return (n >>> 0).toString(36).toUpperCase().padStart(7, '0');
}

function groupCode(raw) {
  const prefix = raw.slice(0, 5);
  const rest = raw.slice(5);
  const parts = [prefix];
  for (let i = 0; i < rest.length; i += 4) parts.push(rest.slice(i, i + 4));
  return parts.join('-');
}

function splitWire(code) {
  const raw = stripCode(code);
  return {
    raw,
    prefix: raw.slice(0, 5),
    digest: raw.slice(5, 12),
    payload: raw.slice(12, -7),
    checksum: raw.slice(-7),
  };
}

function wrapPayload(digest, payload) {
  return groupCode(`SFCR${COMBAT_LAB_BUILD_CODE_VERSION}` + digest + payload + base36u32(fnv1aU32(payload)));
}

function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleSetup(overrides = {}) {
  return starterSetup(
    COMBAT_LAB_STARTER_PACKAGES[0],
    COMBAT_LAB_ENEMY_PACKAGES[0],
    COMBAT_LAB_ARENAS[0],
    47,
    1,
    overrides,
  );
}

test('round-trip: every starter × enemy × arena × seed × wave', () => {
  const setups = everyCatalogSetup();
  assert.equal(
    setups.length,
    COMBAT_LAB_STARTER_PACKAGES.length
      * COMBAT_LAB_ENEMY_PACKAGES.length
      * COMBAT_LAB_ARENAS.length
      * SEEDS.length
      * WAVES.length,
  );
  for (const setup of setups) {
    const normalized = normalizeCombatLabSetup(setup);
    const code = encodeCombatLabBuildCode(setup);
    assert.equal(typeof code, 'string');
    assert.equal(code, code.toUpperCase());
    const decoded = decodeCombatLabBuildCode(code);
    assert.equal(decoded.ok, true, `decode failed for ${code}: ${JSON.stringify(decoded.issues)}`);
    assert.deepEqual(decoded.value, normalized);
    const checked = validateCombatLabSetup(decoded.value);
    assert.equal(checked.ok, true);
    assert.deepEqual(checked.value, normalized);
  }
});

test('stability: same setup always encodes to the same string', () => {
  const toolkit = COMBAT_LAB_STARTER_PACKAGES.find((pkg) => pkg.id === 'physics_toolkit');
  const enemy = COMBAT_LAB_ENEMY_PACKAGES[0];
  const arena = COMBAT_LAB_ARENAS[0];
  const a = starterSetup(toolkit, enemy, arena, 1864401122, 3);
  const b = {};
  b.wave = 3;
  b.seed = 1864401122;
  b.arenaId = arena.id;
  b.enemyPackageId = enemy.id;
  b.loadout = toolkit.loadout.map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId })).reverse();
  b.hullId = toolkit.hullId;
  b.schema = COMBAT_LAB_SETUP_SCHEMA;
  b.noise = 'drop-me';

  const first = encodeCombatLabBuildCode(a);
  const second = encodeCombatLabBuildCode(a);
  const otherOrder = encodeCombatLabBuildCode(b);
  assert.equal(typeof first, 'string');
  assert.equal(first, second);
  assert.equal(first, otherOrder);
});

test('encodeCombatLabBuildCode refuses invalid setups', () => {
  assert.equal(encodeCombatLabBuildCode(null), null);
  assert.equal(encodeCombatLabBuildCode(sampleSetup({ seed: 0 })), null);
  assert.equal(encodeCombatLabBuildCode(starterSetup(
    COMBAT_LAB_STARTER_PACKAGES[0],
    COMBAT_LAB_ENEMY_PACKAGES[0],
    COMBAT_LAB_ARENAS[0],
    0,
    1,
  )), null);
  assert.equal(encodeCombatLabBuildCode(sampleSetup({ wave: 0 })), null);
  assert.equal(encodeCombatLabBuildCode(sampleSetup({ wave: 1000 })), null);
  assert.equal(encodeCombatLabBuildCode(sampleSetup({ wave: 1e21 })), null);
});

test('encode is total over schema-valid boundary setups and round-trips exactly', () => {
  const seeds = [1, 0xffffffff];
  const waves = [1, 999];
  let accepted = 0;
  for (const starter of COMBAT_LAB_STARTER_PACKAGES) {
    for (const hull of SHIPS) {
      for (const enemy of COMBAT_LAB_ENEMY_PACKAGES) {
        for (const arena of COMBAT_LAB_ARENAS) {
          for (const seed of seeds) {
            for (const wave of waves) {
              const setup = starterSetup(starter, enemy, arena, seed, wave, { hullId: hull.id });
              const checked = validateCombatLabSetup(setup);
              if (!checked.ok) continue;
              accepted += 1;
              const code = encodeCombatLabBuildCode(setup);
              assert.notEqual(code, null, `valid setup encoded to null: ${starter.id} ${hull.id} wave ${wave}`);
              assert.equal(typeof code, 'string');
              const decoded = decodeCombatLabBuildCode(code);
              assert.equal(decoded.ok, true, `decode failed for ${code}: ${JSON.stringify(decoded.issues)}`);
              assert.deepEqual(decoded.value, checked.value);
            }
          }
        }
      }
    }
    const native = validateCombatLabSetup(starterSetup(
      starter,
      COMBAT_LAB_ENEMY_PACKAGES[0],
      COMBAT_LAB_ARENAS[0],
      1,
      999,
    ));
    assert.equal(native.ok, true, `starter ${starter.id} native hull must be valid at wave 999`);
  }
  assert.ok(accepted > 0, 'expected at least one schema-valid boundary setup');
});

test('invalid codes are rejected, each with a distinct readable reason', () => {
  const setup = sampleSetup();
  const code = encodeCombatLabBuildCode(setup);
  const wire = splitWire(code);

  const empty = decodeCombatLabBuildCode('');
  const whitespace = decodeCombatLabBuildCode(' \t\n ');
  const prefix = decodeCombatLabBuildCode(`XXXX1${wire.raw.slice(5)}`);
  const version = decodeCombatLabBuildCode(`SFCR0${wire.raw.slice(5)}`);
  const truncated = decodeCombatLabBuildCode(code.slice(0, 12));
  const checksum = decodeCombatLabBuildCode(groupCode(
    wire.raw.slice(0, -1) + (wire.raw.endsWith('A') ? 'B' : 'A'),
  ));
  const digest = decodeCombatLabBuildCode(wrapPayload(
    wire.digest === '0000001' ? '0000002' : '0000001',
    wire.payload,
  ));
  const unknownHull = decodeCombatLabBuildCode((() => {
    const tokens = wire.payload.split('*');
    tokens[1] = 'SHIP_DOES_NOT_EXIST';
    return wrapPayload(wire.digest, tokens.join('*'));
  })());
  const unknownEnemy = decodeCombatLabBuildCode((() => {
    const tokens = wire.payload.split('*');
    tokens[tokens.length - 4] = 'PKG_DOES_NOT_EXIST';
    return wrapPayload(wire.digest, tokens.join('*'));
  })());
  const unknownArena = decodeCombatLabBuildCode((() => {
    const tokens = wire.payload.split('*');
    tokens[tokens.length - 3] = 'ARENA_DOES_NOT_EXIST';
    return wrapPayload(wire.digest, tokens.join('*'));
  })());
  const seedZero = decodeCombatLabBuildCode((() => {
    const tokens = wire.payload.split('*');
    tokens[tokens.length - 2] = '0';
    return wrapPayload(wire.digest, tokens.join('*'));
  })());
  const waveZero = decodeCombatLabBuildCode((() => {
    const tokens = wire.payload.split('*');
    tokens[tokens.length - 1] = '0';
    return wrapPayload(wire.digest, tokens.join('*'));
  })());

  const cases = [
    ['empty', empty],
    ['whitespace', whitespace],
    ['prefix', prefix],
    ['version', version],
    ['truncated', truncated],
    ['checksum', checksum],
    ['digest', digest],
    ['unknownHull', unknownHull],
    ['unknownEnemy', unknownEnemy],
    ['unknownArena', unknownArena],
    ['seedZero', seedZero],
    ['waveZero', waveZero],
  ];

  const reasons = [];
  for (const [label, result] of cases) {
    assert.equal(result.ok, false, `${label} should be rejected`);
    assert.equal(result.value, null, `${label} must not return a value`);
    const reason = primaryReason(result);
    assert.equal(typeof reason, 'string');
    assert.ok(reason.length > 0, `${label} needs a readable reason`);
    reasons.push(reason);
  }
  assert.equal(new Set(reasons).size, reasons.length, `reasons must be distinct, got ${JSON.stringify(reasons)}`);

  assert.ok(issuePaths(unknownHull).includes('hullId'));
  assert.ok(issuePaths(unknownEnemy).includes('enemyPackageId'));
  assert.ok(issuePaths(unknownArena).includes('arenaId'));
  assert.ok(issuePaths(seedZero).includes('seed'));
  assert.ok(issuePaths(waveZero).includes('wave'));
});

test('every single-character mutation of a code is rejected', () => {
  const code = encodeCombatLabBuildCode(sampleSetup());
  assert.equal(typeof code, 'string');
  assert.ok(code.length > 8);
  for (let i = 0; i < code.length; i++) {
    const next = code[i] === 'A' ? 'B' : 'A';
    const mutated = `${code.slice(0, i)}${next}${code.slice(i + 1)}`;
    const result = decodeCombatLabBuildCode(mutated);
    assert.equal(result.ok, false, `mutation at ${i} (${code[i]}→${next}) was accepted`);
    if (result.value != null) {
      const checked = validateCombatLabSetup(result.value);
      assert.equal(checked.ok, false, `mutation at ${i} decoded to a schema-valid setup`);
    }
  }
});

test('decode output is always validated', () => {
  const decoded = decodeCombatLabBuildCode(encodeCombatLabBuildCode(sampleSetup()));
  assert.equal(decoded.ok, true);
  const checked = validateCombatLabSetup(decoded.value);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.value, decoded.value);

  const wire = splitWire(encodeCombatLabBuildCode(sampleSetup()));
  const tokens = wire.payload.split('*');
  tokens[1] = 'SHIP_NOPE';
  const bad = decodeCombatLabBuildCode(wrapPayload(wire.digest, tokens.join('*')));
  assert.equal(bad.ok, false);
  assert.equal(bad.value, null);
});

test('decodeCombatLabBuildCode never throws', () => {
  const long = 'SFCR1' + 'A'.repeat(20000);
  const inputs = [
    undefined, null, 7, 0, false, true, {}, [], Number.NaN,
    '', ' ', '\n\t', '-', 'SFCR', 'SFCR1', long,
    encodeCombatLabBuildCode(sampleSetup()),
  ];
  for (const input of inputs) {
    const result = decodeCombatLabBuildCode(input);
    assert.equal(typeof result, 'object');
    assert.equal(typeof result.ok, 'boolean');
    assert.ok(Array.isArray(result.issues));
    if (!result.ok) assert.equal(result.value, null);
  }
});

test('describeCombatLabBuildCode names hull, enemy package, arena, seed, and wave', () => {
  const setup = starterSetup(
    COMBAT_LAB_STARTER_PACKAGES.find((pkg) => pkg.id === 'physics_toolkit'),
    COMBAT_LAB_ENEMY_PACKAGES.find((pkg) => pkg.id === 'wasp_flight'),
    COMBAT_LAB_ARENAS.find((arena) => arena.id === 'tethys_hub'),
    1864401122,
    20,
  );
  const summary = describeCombatLabBuildCode(setup);
  assert.equal(typeof summary, 'string');
  assert.ok(summary.includes(setup.hullId), summary);
  assert.ok(summary.includes(setup.enemyPackageId), summary);
  assert.ok(summary.includes(setup.arenaId), summary);
  assert.ok(summary.includes(String(setup.seed)), summary);
  assert.ok(summary.includes(String(setup.wave)), summary);
  assert.ok(summary.length <= 120, `summary length ${summary.length}: ${summary}`);
});

test('garbage fuzz: 500 seeded strings never throw and never decode ok (outer prefix/length/checksum gates only)', () => {
  const rng = mulberry32(0xc0de007);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-* \t._/';
  for (let n = 0; n < 500; n++) {
    const kind = rng();
    let text;
    if (kind < 0.15) {
      const len = (rng() * 40) | 0;
      text = 'SFCR1' + Array.from({ length: len }, () => alphabet[(rng() * alphabet.length) | 0]).join('');
    } else if (kind < 0.2) {
      text = Array.from({ length: 400 + ((rng() * 200) | 0) }, () => alphabet[(rng() * alphabet.length) | 0]).join('');
    } else {
      const len = (rng() * 80) | 0;
      text = Array.from({ length: len }, () => alphabet[(rng() * alphabet.length) | 0]).join('');
    }
    const result = decodeCombatLabBuildCode(text);
    assert.equal(result.ok, false, `false accept: ${JSON.stringify(text)}`);
    assert.equal(result.value, null);
    assert.ok(Array.isArray(result.issues));
  }
});

const CATALOG_ID_RE = /^[a-z0-9_]+$/;
const CATALOG_ID_CODEC_REASON = 'catalog ids reachable by a build code MUST match ^[a-z0-9_]+$ because the wire is case-folded and * is the field separator';

function assertCodecSafeId(id, source) {
  assert.equal(typeof id, 'string', `${source} id is not a string: ${id}`);
  assert.ok(
    CATALOG_ID_RE.test(id),
    `${source} id ${JSON.stringify(id)} is not codec-safe: ${CATALOG_ID_CODEC_REASON}`,
  );
}

test('every catalog id a build code can reference matches ^[a-z0-9_]+$', () => {
  for (const ship of SHIPS) assertCodecSafeId(ship.id, 'hull');
  for (const weapon of WEAPONS) assertCodecSafeId(weapon.id, 'weapon');
  for (const mod of MODULES) assertCodecSafeId(mod.id, 'module');
  for (const enemy of ENEMY_TYPES) assertCodecSafeId(enemy.id, 'enemy');
  for (const pkg of COMBAT_LAB_STARTER_PACKAGES) {
    assertCodecSafeId(pkg.id, 'starter package');
    assertCodecSafeId(pkg.hullId, `starter package ${pkg.id} hullId`);
    for (const entry of pkg.loadout || []) {
      assertCodecSafeId(entry.defId, `starter package ${pkg.id} loadout defId`);
    }
  }
  for (const pkg of COMBAT_LAB_ENEMY_PACKAGES) {
    assertCodecSafeId(pkg.id, 'enemy package');
    for (const entry of pkg.entries || []) {
      assertCodecSafeId(entry.enemyId, `enemy package ${pkg.id} enemyId`);
    }
  }
  for (const arena of COMBAT_LAB_ARENAS) {
    assertCodecSafeId(arena.id, 'arena');
  }
});

const OUTER_DECODE_PATHS = new Set(['code', 'checksum', 'contentDigest']);

function reachedPayloadParser(result) {
  if (result && result.ok) return true;
  return (result.issues || []).some((issue) => issue && !OUTER_DECODE_PATHS.has(issue.path));
}

function structuralPayloadCases(payload) {
  const tokens = payload.split('*');
  assert.ok(tokens.length >= 6, `baseline payload is truncated: ${payload}`);
  const loadoutCount = Number(tokens[0]);
  assert.equal(Number.isInteger(loadoutCount), true);
  const cases = [];
  const add = (label, next) => {
    const text = Array.isArray(next) ? next.join('*') : next;
    if (text === payload) return;
    cases.push({ label, payload: text });
  };

  const countHigh = tokens.slice();
  countHigh[0] = String(loadoutCount + 1);
  add('wrong-field-count-count-high', countHigh);

  const countLow = tokens.slice();
  countLow[0] = String(Math.max(0, loadoutCount - 1));
  add('wrong-field-count-count-low', countLow);

  add('wrong-field-count-drop-hull', [tokens[0], ...tokens.slice(2)]);
  add('non-numeric-loadout-count-letters', ['NOPE', ...tokens.slice(1)]);
  add('non-numeric-loadout-count-decimal', ['1.5', ...tokens.slice(1)]);
  add('non-numeric-loadout-count-plus', ['+1', ...tokens.slice(1)]);
  add('non-numeric-loadout-count-scientific', ['1E2', ...tokens.slice(1)]);

  if (loadoutCount > 0) {
    const negSlot = tokens.slice();
    // ASCII '-' is stripped as grouping before parsePayload, so a signed token
    // that survives the envelope is used to reach the unsigned-slot parser.
    negSlot[2] = 'NEG1';
    add('negative-slot-index', negSlot);
    const signedSlot = tokens.slice();
    signedSlot[2] = '+1';
    add('signed-slot-index', signedSlot);
    const hugeSlot = tokens.slice();
    hugeSlot[2] = '99999';
    add('huge-slot-index', hugeSlot);
  }

  const idIndexes = [1];
  for (let i = 0; i < loadoutCount; i++) idIndexes.push(3 + i * 2);
  idIndexes.push(2 + loadoutCount * 2);
  idIndexes.push(3 + loadoutCount * 2);
  for (const index of idIndexes) {
    const unknown = tokens.slice();
    unknown[index] = 'NOT_A_CATALOG_ID';
    add(`unknown-id-at-${index}`, unknown);
  }

  add('missing-trailing-field', tokens.slice(0, -1));
  add('extra-trailing-field', [...tokens, 'EXTRA']);
  add('extra-trailing-fields', [...tokens, 'EXTRA', 'MORE']);

  for (let i = 0; i < tokens.length; i++) {
    const empty = tokens.slice();
    empty[i] = '';
    add(`empty-field-${i}`, empty);
  }

  const defId = loadoutCount > 0 ? tokens[3] : 'WPN_PULSE_LASER_S';
  const slot = loadoutCount > 0 ? tokens[2] : '0';
  const tail = tokens.slice(2 + loadoutCount * 2);
  add('duplicated-slot-index', ['2', tokens[1], slot, defId, slot, defId, ...tail]);

  return cases;
}

test('structural fuzz: valid envelope over mutated payloads reaches parsePayload, never throws, never decodes ok', () => {
  const baselines = [
    sampleSetup(),
    starterSetup(
      COMBAT_LAB_STARTER_PACKAGES.find((pkg) => pkg.id === 'physics_toolkit'),
      COMBAT_LAB_ENEMY_PACKAGES[0],
      COMBAT_LAB_ARENAS[0],
      47,
      1,
    ),
  ];
  const generated = [];
  let liveDigest = null;
  for (const setup of baselines) {
    const code = encodeCombatLabBuildCode(setup);
    assert.equal(typeof code, 'string');
    const live = splitWire(code);
    liveDigest = live.digest;
    for (const entry of structuralPayloadCases(live.payload)) {
      generated.push({
        label: `${setup.hullId}/${setup.wave}/${entry.label}`,
        code: wrapPayload(live.digest, entry.payload),
      });
    }
  }
  assert.ok(generated.length > 0, 'expected structural mutations');
  assert.equal(typeof liveDigest, 'string');

  let reachedParser = 0;
  for (const entry of generated) {
    const wire = splitWire(entry.code);
    assert.equal(wire.prefix, `SFCR${COMBAT_LAB_BUILD_CODE_VERSION}`, `${entry.label} lost prefix`);
    assert.equal(wire.digest, liveDigest, `${entry.label} lost content digest`);
    assert.ok(wire.payload.length > 0, `${entry.label} has empty payload`);
    assert.equal(wire.checksum, base36u32(fnv1aU32(wire.payload)), `${entry.label} checksum does not match payload`);

    const result = decodeCombatLabBuildCode(entry.code);
    assert.equal(result.ok, false, `${entry.label} decoded ok: ${entry.code}`);
    assert.equal(result.value, null, `${entry.label} returned a value`);
    assert.ok(Array.isArray(result.issues));
    if (reachedPayloadParser(result)) reachedParser += 1;
    else {
      assert.fail(
        `${entry.label} never reached parsePayload: ${JSON.stringify(result.issues)}`,
      );
    }
  }
  assert.equal(
    reachedParser,
    generated.length,
    `structural fuzz parser coverage ${reachedParser}/${generated.length}`,
  );
});

test('codes are case-insensitive and ignore surrounding whitespace/hyphens', () => {
  const code = encodeCombatLabBuildCode(sampleSetup());
  const spaced = `  ${code.toLowerCase().split('').join(' ')}  `;
  const decoded = decodeCombatLabBuildCode(spaced);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.value, normalizeCombatLabSetup(sampleSetup()));
});
