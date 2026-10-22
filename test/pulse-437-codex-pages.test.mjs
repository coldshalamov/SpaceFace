// PULSE-CODEX (build_map row 437) — done-when:
//   The codex has an in-world entry for every commodity, hull, module, weapon, faction,
//   sector, species, and named figure; entries say who makes it, who smuggles it, and who
//   died for it where appropriate; unlocks follow discovery — nothing readable that the
//   run has not earned.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CODEX_LOCKED_HINTS,
  CODEX_PAGES,
  CODEX_SECTIONS,
  codexPageGate,
} from '../src/data/codexPages.js';
import { codexPagesView, codexPageView } from '../src/ui/sim/codexPages.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { FACTION_KITS } from '../src/data/factions/index.js';
import { SECTORS } from '../src/data/sectors.js';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { FIGURES } from '../src/data/narrative.js';
import { FAUNA_DROPS } from '../src/data/alienEcology.js';

function freshState() {
  return {
    meta: { seed: 7 },
    simTime: 0,
    playerId: 'player',
    entities: new Map(),
    player: {
      cargo: { items: {} },
      tradeLedger: [],
      tradeLots: {},
      moduleInventory: [],
      ownedShips: [],
      stats: {},
    },
    factions: {},
    world: { discovery: {}, currentSectorId: 'sector_helios_prime', alienEcology: { evidence: {} } },
    economy: { marketIntel: {} },
    story: { beatIndex: 0, flags: {}, seenComms: {} },
    lossLedger: { entries: [] },
  };
}

// ── coverage: every canonical thing has a page ──────────────────────────────────────────

test('catalog covers every commodity, hull, module, weapon, faction, sector, species, figure', () => {
  const ids = new Set(CODEX_PAGES.map((p) => p.id));
  assert.equal(ids.size, CODEX_PAGES.length, 'page ids unique');
  const inSection = (s) => CODEX_PAGES.filter((p) => p.section === s);
  assert.equal(inSection('commodities').length, COMMODITIES.length);
  assert.ok(inSection('commodities').length >= 66, '≥66 commodities');
  assert.equal(inSection('hulls').length, SHIPS.length);
  assert.ok(inSection('hulls').length >= 15, '≥15 hulls');
  assert.equal(inSection('modules').length, MODULES.length);
  assert.ok(inSection('modules').length >= 124, `≥124 modules (have ${inSection('modules').length})`);
  assert.equal(inSection('weapons').length, WEAPONS.length);
  assert.ok(inSection('weapons').length >= 41, '≥41 weapons');
  assert.equal(inSection('factions').length, Object.keys(FACTION_KITS).length);
  assert.ok(inSection('factions').length >= 14, '≥14 factions');
  assert.equal(inSection('sectors').length, SECTORS.length);
  assert.ok(inSection('sectors').length >= 25, '≥25 sectors');
  assert.equal(inSection('species').length, Object.keys(FAUNA_SPECIES).length);
  assert.ok(inSection('species').length >= 56, '≥56 species');
  assert.equal(inSection('figures').length, Object.keys(FIGURES).length);
  assert.ok(inSection('figures').length >= 26, '≥26 figures');
  for (const page of CODEX_PAGES) {
    assert.ok(page.name && page.name.length > 0, `${page.id} named`);
    assert.ok(page.body && page.body.length > 24, `${page.id} has real body text`);
  }
});

test('sections present in authored order with a locked-hint voice', () => {
  assert.deepEqual(CODEX_SECTIONS.map((s) => s.id),
    ['commodities', 'hulls', 'modules', 'weapons', 'factions', 'sectors', 'species', 'figures']);
  for (const section of CODEX_SECTIONS) {
    assert.ok(CODEX_LOCKED_HINTS[section.id], `locked hint exists for ${section.id}`);
    assert.ok(CODEX_LOCKED_HINTS[section.id].length > 10);
  }
});

// ── in-world content: makers, smugglers, casualties ────────────────────────────────────

test('commodity entries say who makes or moves the cargo', () => {
  const commodities = CODEX_PAGES.filter((p) => p.section === 'commodities');
  const withLore = commodities.filter((p) => /miners|refinery|fabricator|exchange|locker|quartermaster|research|vats|bays|dives|quiet|vael|reach|choir|crew|desk/i.test(p.body));
  assert.ok(withLore.length >= 40, `most commodities name who moves them (${withLore.length})`);
  const narcotics = commodities.find((p) => p.id === 'cmdty_narcotics');
  assert.ok(/vael|quiet|smuggl|customs|contraband/i.test(narcotics.body), 'contraband names its smugglers');
  assert.ok(/customs files it as contraband/i.test(narcotics.body), 'legality is filed in-world');
});

test('who died for it is written where the world has an honest answer', () => {
  const casualties = CODEX_PAGES.filter((p) => /died|dead|death|spaced|killed|missing|memorial|survived|never came back|kept them|lost/i.test(p.body));
  assert.ok(casualties.length >= 12, `enough casualty lines (${casualties.length})`);
  const saucer = CODEX_PAGES.find((p) => p.id === 'ship_saucer');
  assert.ok(/missing|fined|fiction/i.test(saucer.body), 'the Saucer page knows its death-toll');
  const senna = CODEX_PAGES.find((p) => p.id === 'faction_dmc');
  assert.ok(/senna|names|veins kept/i.test(senna.body), 'DMC page names the keeper of the dead');
  const vols = CODEX_PAGES.find((p) => p.id === 'maera_vols');
  assert.ok(/tessera|manifest|blank/i.test(vols.body), 'Vols page carries the lost-crew line');
});

test('module and weapon pages describe fittings, not marketing copy', () => {
  const modules = CODEX_PAGES.filter((p) => p.section === 'modules');
  const undescribed = MODULES.filter((m) => !m.description);
  // Every undescribed module still got an authored-voice body (slot/mods composition).
  for (const m of undescribed) {
    const page = modules.find((p) => p.id === m.id);
    assert.ok(page && page.body.length > 20, `${m.id} composed body`);
  }
  const quietEq = modules.find((p) => p.id === 'mod_quiet_equation_s');
  assert.ok(/quiet|never here|redact/i.test(quietEq.body), 'unique module carries its maker');
  const saucerRay = CODEX_PAGES.find((p) => p.id === 'wpn_saucer_death_ray');
  assert.ok(/saucer|receipt|unattributed/i.test(saucerRay.body), 'the unlisted weapon knows it is unlisted');
});

// ── discovery gating ──────────────────────────────────────────────────────────────────

test('a fresh run reads only what it has earned — nothing unlocked without discovery', () => {
  const state = freshState();
  const view = codexPagesView(state);
  assert.equal(view.totalPages, CODEX_PAGES.length);
  const section = (id) => view.sections.find((s) => s.id === id);
  // Always-legible: the figures a fresh pilot knows + the sector they stand in.
  assert.ok(section('figures').unlocked >= 6, 'core figures always legible');
  assert.ok(section('sectors').unlocked >= 1, 'current sector is discovered');
  // Everything else stays sealed at boot.
  assert.equal(section('commodities').unlocked, 0, 'no cargo held or seen → no pages');
  assert.equal(section('hulls').unlocked, 0, 'no hull owned or wrecked → no pages');
  assert.equal(section('modules').unlocked, 0);
  assert.equal(section('weapons').unlocked, 0);
  assert.equal(section('factions').unlocked, 0, 'no flag met');
  assert.equal(section('species').unlocked, 0, 'no evidence or drops');
  const locked = section('commodities').pages.find((p) => p.id === 'cmdty_narcotics');
  assert.equal(locked.unlocked, false);
  assert.equal(locked.name, '— unfiled —', 'locked page never leaks the real name');
  assert.equal(locked.body, '', 'locked page never leaks the body');
  assert.ok(locked.hint.length > 10, 'locked page tells how to earn it');
});

test('unlocks follow discovery on each surface', () => {
  const state = freshState();
  // Hold narcotics → its page unseals.
  state.player.cargo.items = { cmdty_narcotics: 3 };
  // Trade ledger touched ore → ore unseals without holding it now.
  state.player.tradeLedger = [{ commodityId: 'cmdty_ore_iron', stationId: 'station_helios', side: 'sell' }];
  // Market intel saw medical → seen price counts.
  state.economy.marketIntel = { station_helios: { snapshot: { cmdty_medical: { mid: 40 } } } };
  // Own the Hitch, lost a Wasp to the ledger.
  state.player.ownedShips = [{ shipId: 'ship_kestrel' }];
  state.lossLedger.entries = [{ shipDefId: 'ship_wasp', victimName: 'Test Dummy' }];
  // Fit a module, hold a weapon in inventory.
  state.player.ownedShips[0].fittings = ['mod_signature_reader_s'];
  state.player.moduleInventory = [{ instanceId: 'inst1', defId: 'wpn_pulse_laser_s' }];
  // Met the Reach and the Quiet.
  state.factions = { faction_reach: { rep: -5 }, faction_quiet: { rep: 2 } };
  // Jumped Ceres; Helios is current.
  state.world.discovery = { sector_ceres_belt: { discovered: true, visitedCount: 1 } };
  // Found cyst resin → the cyst species unseal; one evidence row → drifters too.
  state.player.cargo.items.cmdty_cyst_resin = 1;
  state.world.alienEcology = { evidence: { ev1: { tier: 1 } }, wrenRecognized: false };
  // Story reached beat 2 → beat-2 figures unseal.
  state.story.beatIndex = 2;

  const view = codexPagesView(state);
  const pageOf = (sectionId, pageId) =>
    view.sections.find((s) => s.id === sectionId).pages.find((p) => p.id === pageId);
  assert.equal(pageOf('commodities', 'cmdty_narcotics').unlocked, true, 'held cargo unseals');
  assert.equal(pageOf('commodities', 'cmdty_ore_iron').unlocked, true, 'traded cargo unseals');
  assert.equal(pageOf('commodities', 'cmdty_medical').unlocked, true, 'seen price unseals');
  assert.equal(pageOf('commodities', 'cmdty_revocation_beacon').unlocked, false, 'untouched relic stays sealed');
  assert.equal(pageOf('hulls', 'ship_kestrel').unlocked, true, 'owned hull');
  assert.equal(pageOf('hulls', 'ship_wasp').unlocked, true, 'a hull you saw die is charted');
  assert.equal(pageOf('hulls', 'ship_saucer').unlocked, false, 'the Saucer stays myth until earned');
  assert.equal(pageOf('modules', 'mod_signature_reader_s').unlocked, true, 'fitted module');
  assert.equal(pageOf('weapons', 'wpn_pulse_laser_s').unlocked, true, 'inventoried weapon');
  assert.equal(pageOf('factions', 'faction_reach').unlocked, true);
  assert.equal(pageOf('factions', 'faction_archive').unlocked, false);
  assert.equal(pageOf('sectors', 'sector_ceres_belt').unlocked, true);
  assert.equal(pageOf('sectors', 'sector_the_bolus').unlocked, false);
  const lantern = Object.keys(FAUNA_SPECIES).find((id) => FAUNA_DROPS[id] && FAUNA_DROPS[id].commodityId === 'cmdty_cyst_resin');
  assert.ok(lantern, 'a species sheds cyst resin');
  assert.equal(pageOf('species', lantern).unlocked, true, 'found its drop → unsealed');
  assert.equal(pageOf('figures', 'sker_vane').unlocked, true, 'beat-2 figure at beat 2');
  assert.equal(pageOf('figures', 'kurtz').unlocked, false, 'Kurtz waits for the deep arc');
});

test('page view is pure and deterministic — same state, same read', () => {
  const state = freshState();
  state.player.cargo.items = { cmdty_ore_iron: 2 };
  const a = codexPagesView(state);
  const b = codexPagesView(state);
  assert.deepEqual(a.sections.map((s) => s.unlocked), b.sections.map((s) => s.unlocked));
  const single = codexPageView(state, CODEX_PAGES.find((p) => p.id === 'cmdty_ore_iron'));
  assert.equal(single.unlocked, true);
  assert.ok(single.body.length > 24);
  // No mutation of input state.
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 2);
  assert.equal(Object.keys(state.factions).length, 0);
});
