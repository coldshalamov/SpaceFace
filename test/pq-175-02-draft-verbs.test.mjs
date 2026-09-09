// PQ-175.02 — draft catalog is verbs, not +stat. Seed 17520. Hitch cannot fit M concussion / M heads.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MODULES } from '../src/data/modules.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { SHIPS } from '../src/data/ships.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import {
  DRAFT_VERB_CARD_MIN_RATIO,
  DRAFT_VERB_SHAPES,
  SURVIVAL_DRAFT_OFFERS,
  auditDraftCatalog,
  draftCatalogFor,
  offerDraft,
} from '../src/data/survivalDraft.js';
import { SWARM_DRAFT_OFFERS } from '../src/data/swarmDraft.js';
import { WEAPONS } from '../src/data/weapons.js';
import { RUN_MODIFIER_VERBS } from '../src/data/runModifiers.js';
import { fittingsFromDefaultModules } from '../src/systems/ships.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';

const SEED = 17520;
const FITTING_BY_ID = new Map([
  ...WEAPONS.map((def) => [def.id, def]),
  ...MODULES.map((def) => [def.id, def]),
]);

const HITCH_FORBIDDEN_DEF_IDS = Object.freeze([
  'wpn_concussion_cannon_m',
  'mod_tractor_beam_m',
  'mod_elastic_whip_m',
  'mod_frame_coupler_m',
  'mod_monofilament_sweep_m',
  'mod_transverse_snare_m',
  'mod_twin_bridle_m',
  'mod_massline_spool_m',
]);

function hitchFittings() {
  return fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
}

function hitchOffers(wave = 5, pickCount = 0) {
  return offerDraft({
    seed: SEED,
    wave,
    hullId: 'ship_kestrel',
    fittings: hitchFittings(),
    pickCount,
    ruleset: SWARM_RULESET,
  });
}

test('PQ-175.02: swarm catalog is ≥66% verb cards with the five named shapes', () => {
  const audit = auditDraftCatalog(SWARM_RULESET);
  assert.equal(audit.ok, true, audit.issues.join('; '));
  assert.ok(audit.verbPercent >= 66, `verb percent ${audit.verbPercent}`);
  assert.ok(audit.verbRatio + 1e-9 >= DRAFT_VERB_CARD_MIN_RATIO);
  assert.ok(audit.numberCount / audit.total <= 1 / 3 + 1e-9, 'at most one card in three is a number');
  for (const shape of DRAFT_VERB_SHAPES) {
    assert.ok(audit.shapes.includes(shape), `catalog names ${shape}`);
  }
  assert.equal(survivalDraft.catalogAudit(SWARM_RULESET).verbPercent, audit.verbPercent);
});

test('PQ-175.02: every card is tagged, one line, and not a +stat', () => {
  const cards = draftCatalogFor(SWARM_RULESET);
  assert.equal(cards.length, SURVIVAL_DRAFT_OFFERS.length + SWARM_DRAFT_OFFERS.length);
  for (const card of cards) {
    assert.ok(card.kind === 'verb' || card.kind === 'number', card.id);
    assert.ok(typeof card.blurb === 'string' && card.blurb.length > 20, card.id);
    assert.ok(!card.blurb.includes('\n'), `${card.id} is one line`);
    assert.ok(!/\d+\s*%/.test(card.blurb), `${card.id} has no percent`);
    assert.ok(!/\+\d/.test(card.blurb), `${card.id} has no +stat`);
    assert.ok(FITTING_BY_ID.has(card.defId), `${card.defId} is live`);
    assert.ok(RUN_MODIFIER_VERBS.includes(card.verb), `${card.verb} validates`);
  }
});

test('PQ-175.02: verb cards change a verb; number cards stay the minority', () => {
  const audit = auditDraftCatalog(SWARM_RULESET);
  const well = audit.verbCards.filter((card) => card.shape === 'well');
  const reel = audit.verbCards.find((card) => card.shape === 'reel');
  const ram = audit.verbCards.filter((card) => card.shape === 'ram');
  const whip = audit.verbCards.find((card) => card.shape === 'whip');
  const line = audit.verbCards.find((card) => card.shape === 'line_load');
  assert.ok(well.length >= 1, 'well radius');
  assert.equal(reel.defId, 'mod_winch_hd');
  assert.ok(ram.some((card) => card.defId === 'mod_ram_plate'));
  assert.equal(whip.defId, 'mod_elastic_whip_m');
  assert.equal(line.defId, 'mod_massline_spool_m');
  assert.ok(audit.numberCards.some((card) => card.id === 'volume'));
  assert.ok(audit.numberCards.some((card) => card.id === 'fusion'));
});

test('PQ-175.02: Hitch seed 17520 never sees M concussion or M utility heads', () => {
  const ship = SHIPS.find((row) => row.id === 'ship_kestrel');
  assert.equal(ship.name, 'Hitch');
  assert.deepEqual(ship.slots.weapon, ['S']);
  assert.deepEqual(ship.slots.utility, ['S']);

  const hitchLegal = draftCatalogFor(SWARM_RULESET).filter((card) => {
    const def = FITTING_BY_ID.get(card.defId);
    return def && (def.size === 'S' || (def.slotType !== 'weapon' && def.slotType !== 'utility'));
  });
  assert.ok(hitchLegal.some((card) => card.shape === 'reel'));
  assert.ok(hitchLegal.some((card) => card.shape === 'ram'));
  assert.ok(hitchLegal.some((card) => card.shape === 'well'));
  assert.ok(hitchLegal.every((card) => !HITCH_FORBIDDEN_DEF_IDS.includes(card.defId)));

  for (let wave = 1; wave <= 20; wave += 1) {
    for (let pickCount = 0; pickCount <= 4; pickCount += 1) {
      const result = hitchOffers(wave, pickCount);
      assert.equal(result.ok, true, `wave ${wave} pick ${pickCount}`);
      assert.ok(result.offers.length > 0);
      for (const offer of result.offers) {
        assert.ok(
          !HITCH_FORBIDDEN_DEF_IDS.includes(offer.defId),
          `Hitch was offered ${offer.defId}`,
        );
        const def = FITTING_BY_ID.get(offer.defId);
        if (def.slotType === 'weapon' || def.slotType === 'utility') {
          assert.notEqual(def.size, 'M', `Hitch was offered M ${def.slotType} ${offer.defId}`);
        }
      }
    }
  }
});

test('PQ-175.02: seed 17520 Hitch draw is three one-line cards', () => {
  const result = hitchOffers(5, 0);
  assert.equal(result.ok, true);
  assert.equal(result.offers.length, 3);
  for (const offer of result.offers) {
    assert.ok(!offer.blurb.includes('\n'));
    assert.ok(offer.kind === 'verb' || offer.kind === 'number');
  }
});
