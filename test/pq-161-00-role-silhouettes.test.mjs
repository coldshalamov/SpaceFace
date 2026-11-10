import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OCCUPATIONAL_ROLE_IDS,
  OCCUPATIONAL_SILHOUETTE_TOKENS,
  OCCUPATIONAL_SILHOUETTE_RULES,
  getOccupationalSilhouetteRule,
  getRoleFactionLivery,
  FACTION_PALETTES,
} from '../src/data/palettes.js';

import {
  OCCUPATIONAL_PALETTE_CLAIMS,
  getOccupationalPaletteClaim,
} from '../src/data/factionPaletteClaims.js';

import {
  createThreatHalo,
  resolveEntityOccupationalRule,
  getThreatHaloSilhouetteToken,
} from '../src/ui/threatHalo.js';

import { isHostileToPlayer } from '../src/systems/scanner.js';

const EXPECTED_NINE_ROLES = [
  'miner',
  'customs',
  'heavy',
  'courier',
  'salvor',
  'surveyor',
  'tender',
  'tug',
  'rescue',
];

test('PQ-161.00: exactly nine occupational roles are defined and exported', () => {
  assert.equal(OCCUPATIONAL_ROLE_IDS.length, 9, 'must define exactly nine occupational roles');
  assert.deepEqual([...OCCUPATIONAL_ROLE_IDS].sort(), [...EXPECTED_NINE_ROLES].sort(),
    'nine occupational roles must match the canonical working fleet trades');
});

test('PQ-161.00: all nine occupational roles disagree on silhouette tokens', () => {
  assert.equal(OCCUPATIONAL_SILHOUETTE_TOKENS.length, 9, 'nine tokens declared');
  const uniqueTokens = new Set(OCCUPATIONAL_SILHOUETTE_TOKENS);
  assert.equal(uniqueTokens.size, 9, 'every role must disagree on silhouette token (100% unique tokens)');

  for (const role of EXPECTED_NINE_ROLES) {
    const rule = getOccupationalSilhouetteRule(role);
    assert.ok(rule, `silhouette rule must exist for role: ${role}`);
    assert.ok(rule.silhouetteToken, `rule must have silhouetteToken: ${role}`);
    assert.ok(uniqueTokens.has(rule.silhouetteToken), `token must belong to unique set: ${rule.silhouetteToken}`);
  }
});

test('PQ-161.00: every role rule embodies silhouette, behavior, and trade laws (not just a label)', () => {
  for (const role of EXPECTED_NINE_ROLES) {
    const rule = getOccupationalSilhouetteRule(role);
    assert.ok(rule, `rule exists for ${role}`);
    assert.ok(typeof rule.signatureVerb === 'string' && rule.signatureVerb.length > 0, `${role} needs signature verb`);
    assert.ok(typeof rule.hardwareProtagonist === 'string' && rule.hardwareProtagonist.length > 0, `${role} needs hardware protagonist`);
    assert.ok(typeof rule.asymmetry === 'string' && rule.asymmetry.length > 0, `${role} needs asymmetry description`);
    assert.ok(typeof rule.aspectRatio === 'number' && rule.aspectRatio > 1, `${role} needs valid aspect ratio`);
    assert.ok(typeof rule.primarySilhouette === 'string', `${role} needs primary silhouette`);
    assert.ok(Array.isArray(rule.silhouetteAnchors) && rule.silhouetteAnchors.length >= 3, `${role} needs silhouette anchors`);
    assert.ok(rule.lightCode && rule.lightCode.primaryColor.startsWith('#'), `${role} needs light code hex`);
    assert.ok(rule.behaviorSignature && rule.behaviorSignature.paceWU > 0, `${role} needs behavior signature pace`);
    assert.ok(rule.factionLivery && typeof rule.factionLivery.baseWear === 'string', `${role} needs faction livery spec`);
  }

  // Check specific identity clauses from PACKET.md ("miner mines, customs reads official, heavy reads mass")
  const miner = getOccupationalSilhouetteRule('miner');
  assert.match(miner.signatureVerb.toLowerCase(), /cut|extract|mine/, 'miner mines');
  assert.match(miner.hardwareProtagonist.toLowerCase(), /arm|cutter|scoop|hopper/, 'miner has extraction arms/cutter/hopper');

  const customs = getOccupationalSilhouetteRule('customs');
  assert.match(customs.signatureVerb.toLowerCase(), /enforce|inspect|official/, 'customs reads official');
  assert.match(customs.hardwareProtagonist.toLowerCase(), /collar|emitter|fin/, 'customs wears inspection collar');

  const heavy = getOccupationalSilhouetteRule('heavy');
  assert.match(heavy.signatureVerb.toLowerCase(), /mass|cargo|pod|logistics/, 'heavy reads mass');
  assert.match(heavy.hardwareProtagonist.toLowerCase(), /truss|spine|pod|drive/, 'heavy has massive truss/pods');
});

test('PQ-161.00: faction livery applies to all nine roles across all 14 factions', () => {
  const factionIds = Object.keys(FACTION_PALETTES);
  assert.ok(factionIds.length >= 14, 'at least 14 factions in palette catalog');

  for (const role of EXPECTED_NINE_ROLES) {
    for (const factionId of factionIds) {
      const livery = getRoleFactionLivery(role, factionId);
      assert.ok(livery, `livery resolves for ${role} with ${factionId}`);
      assert.equal(livery.role, role);
      assert.equal(livery.factionId, factionId);
      assert.ok(livery.primaryCoat.startsWith('#'), 'primary coat must be hex');
      assert.ok(livery.hullColor.startsWith('#'), 'hull color must be hex');
      assert.ok(livery.emissiveWorkLight.startsWith('#'), 'emissive light must be hex');
      assert.ok(livery.thrusterPlume.startsWith('#'), 'thruster plume must be hex');
    }
  }
});

test('PQ-161.00: factionPaletteClaims maintains occupational claims for all nine roles', () => {
  assert.equal(OCCUPATIONAL_PALETTE_CLAIMS.length, 9, 'nine occupational palette claims');
  for (const role of EXPECTED_NINE_ROLES) {
    const claim = getOccupationalPaletteClaim(role);
    assert.ok(claim, `claim exists for ${role}`);
    assert.equal(claim.role, role);
    const rule = getOccupationalSilhouetteRule(role);
    assert.equal(claim.silhouetteToken, rule.silhouetteToken, 'claim token must match rule token');
    assert.equal(claim.lightCodeHex, rule.lightCode.primaryColor, 'claim light hex must match rule primaryColor');
  }
});

test('PQ-161.00: threatHalo integrates occupational silhouette rules and assigns distinct tokens to slots', () => {
  const tokensSeen = new Set();
  for (const role of EXPECTED_NINE_ROLES) {
    const mockEntity = { role, pos: { x: 100, z: 200 } };
    const rule = resolveEntityOccupationalRule(mockEntity);
    assert.ok(rule, `threatHalo resolves rule for entity role: ${role}`);
    assert.equal(rule.role, role);
    const token = getThreatHaloSilhouetteToken(mockEntity);
    assert.ok(token.startsWith('token_silhouette_'), `valid silhouette token: ${token}`);
    tokensSeen.add(token);
  }
  assert.equal(tokensSeen.size, 9, 'threatHalo resolves 9 distinct tokens for 9 occupational roles');

  // Test with mock DOM root
  const mockElements = [];
  const fakeElement = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      attributes: {},
      style: {},
      children: [],
      setAttribute(k, v) { this.attributes[k] = String(v); },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { this.children.push(child); return child; },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) this.children.splice(idx, 1);
      },
    };
    mockElements.push(el);
    return el;
  };

  const oldDoc = globalThis.document;
  globalThis.document = {
    createElement: fakeElement,
  };

  try {
    const root = fakeElement('div');
    const halo = createThreatHalo(root);

    const player = { id: 'player', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
    const e1 = { id: 'h1', type: 'ship', team: 1, alive: true, pos: { x: 800, z: 0 }, data: { encounter: true, role: 'miner' }, factionId: 'faction_dmc' };
    const e2 = { id: 'h2', type: 'ship', team: 1, alive: true, pos: { x: -800, z: 0 }, data: { encounter: true, role: 'customs' }, factionId: 'faction_scn' };
    const e3 = { id: 'h3', type: 'ship', team: 1, alive: true, pos: { x: 0, z: 800 }, data: { encounter: true, role: 'heavy' }, factionId: 'faction_mts' };

    assert.ok(isHostileToPlayer(e1, player.team, { playerId: player.id }), 'e1 is hostile to player');
    assert.ok(isHostileToPlayer(e2, player.team, { playerId: player.id }), 'e2 is hostile to player');
    assert.ok(isHostileToPlayer(e3, player.team, { playerId: player.id }), 'e3 is hostile to player');

    const state = {
      playerId: 'player',
      entityList: [player, e1, e2, e3],
    };
    const worldToScreen = (w, out) => {
      out.x = w.x > 0 ? 2000 : (w.x < 0 ? -1000 : 640);
      out.y = w.z > 0 ? 2000 : (w.z < 0 ? -1000 : 360);
      out.onScreen = false;
      return out;
    };

    halo.update(player, state, worldToScreen);

    // Find slots that were displayed
    const activeSlots = mockElements.filter((el) => el.style.display === 'block' && el.attributes['data-role']);
    assert.ok(activeSlots.length >= 3, 'active slots populated for hostiles');

    const rolesOnSlots = activeSlots.map((s) => s.attributes['data-role']);
    const tokensOnSlots = activeSlots.map((s) => s.attributes['data-silhouette-token']);

    assert.ok(rolesOnSlots.includes('miner'), 'miner role applied to slot');
    assert.ok(rolesOnSlots.includes('customs'), 'customs role applied to slot');
    assert.ok(rolesOnSlots.includes('heavy'), 'heavy role applied to slot');

    assert.ok(tokensOnSlots.includes('token_silhouette_miner'), 'miner silhouette token applied');
    assert.ok(tokensOnSlots.includes('token_silhouette_customs'), 'customs silhouette token applied');
    assert.ok(tokensOnSlots.includes('token_silhouette_heavy'), 'heavy silhouette token applied');

    halo.destroy();
  } finally {
    globalThis.document = oldDoc;
  }
});

test('PQ-161.00: role aliases resolve cleanly to canonical occupational roles', () => {
  assert.equal(getOccupationalSilhouetteRule('hauler').role, 'heavy');
  assert.equal(getOccupationalSilhouetteRule('heavy_hauler').role, 'heavy');
  assert.equal(getOccupationalSilhouetteRule('ore_carrier').role, 'heavy');
  assert.equal(getOccupationalSilhouetteRule('prospector').role, 'miner');
  assert.equal(getOccupationalSilhouetteRule('mining_barge').role, 'miner');
  assert.equal(getOccupationalSilhouetteRule('inspection_cutter').role, 'customs');
  assert.equal(getOccupationalSilhouetteRule('patrol').role, 'customs');
  assert.equal(getOccupationalSilhouetteRule('express').role, 'courier');
  assert.equal(getOccupationalSilhouetteRule('shuttle').role, 'courier');
  assert.equal(getOccupationalSilhouetteRule('repair_tender').role, 'tender');
  assert.equal(getOccupationalSilhouetteRule('salvage_cutter').role, 'salvor');
  assert.equal(getOccupationalSilhouetteRule('survey_pin').role, 'surveyor');
  assert.equal(getOccupationalSilhouetteRule('yard_tug').role, 'tug');
  assert.equal(getOccupationalSilhouetteRule('rescue_lifter').role, 'rescue');
});

