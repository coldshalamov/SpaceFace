// check-ui-identity.mjs — SPEC2/06 UI reachability and behavior audit.
//
// This gate protects information hierarchy, targeting/navigation affordances, one-voice routing,
// accessibility semantics, and bounded update cadence. It deliberately does not prescribe a
// universal layout, palette, blur policy, transition duration, or pixel recipe; those require
// player-route screenshots and the dedicated accessibility/performance checks.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contactDisplayBand,
  contactDisplayLimit,
  contactOverflowSummary,
  createContactRosterClock,
  consumeContactRosterClock,
} from '../src/ui/hud.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const checks = [
  // ---- §1: Persistent flight information remains reachable ---------------
  {
    path: 'src/ui/hud.js',
    label: 'Flight HUD keeps the contact roster, target detail and in-world target status reachable',
    needs: [
      'sf-overview',
      'createTargetPanel(ctx)',
      'sf-target-arcs',
      'formatDestinationLine',
    ],
    forbids: [
      'SHIP CONDITION',
    ],
  },

  // ---- §2: Overview Strip -------------------------------------------------
  {
    path: 'src/ui/hud.js',
    label: 'Contact roster — bounded cadence, useful priority, truthful overflow, click-to-target and memoised DOM work',
    needs: [
      'state.player.targetId = rec.id',
      'sf-overview-row',
      // Memoised DOM work is now retained keyed rows (createOverviewRow builds a row once,
      // syncOverviewRow writes only the fields that changed) instead of the old
      // lastOverviewSignature rebuild guard, which embedded rounded distance/closing speed and
      // therefore almost never hit while the player was flying.
      'syncOverviewRow',
      'SEMANTIC_PALETTE',
    ],
    forbids: [
      'overviewTick % 12',
      "elOverview.innerHTML = ''",
    ],
  },

  // ---- §3: Target Panel v2 ------------------------------------------------
  // J07 condensed the 8-line card to a threat badge + range bar; hp moved to the in-world
  // target arcs (asserted separately below). The segmented sf-bar--* classes are gone by design.
  {
    path: 'src/ui/targetPanel.js',
    label: 'Target panel v2 — threat badge, range bar, distance, closing speed, gimmick tag',
    needs: [
      'sf-target__threat',
      'sf-target__rangebar',
      'sf-target__rangefill',
      'sf-target__dist',
      'sf-target__closing',
      'gimmick',
    ],
  },
  {
    path: 'src/ui/marketNews.js',
    label: 'One-voice news — no raw multi-headline ticker fallback into HUD/body',
    needs: [
      "document.getElementById('news-ticker')",
      "createMarketNews",
    ],
    forbids: [
      "document.getElementById('hud')",
      'document.body',
    ],
  },

  // ---- Wave 2: contact identity + damage triangle on target panel ----------
  {
    path: 'src/ui/targetPanel.js',
    label: 'Target panel contact identity — faction, role, threat tier, level row',
    needs: [
      'sf-target__identity',
      'contactThreatTier',
      'contactStateWord',
      'isHostileToPlayer',
      'tierPips',
    ],
  },
  {
    path: 'src/ui/targetPanel.js',
    label: 'Target panel damage triangle (BP-02 E/K/X)',
    needs: [
      'sf-target__triangle',
      'familyEffectiveness',
      'FAMILY_CHANNELS',
    ],
  },

  // ---- §3: Target status mirrored in-world --------------------------------
  {
    path: 'src/ui/hud.js',
    label: 'Target status overlay — shield, armor and hull layers use the real hp fractions and clear on death',
    needs: [
      'sf-arc-shield',
      'sf-arc-armor',
      'sf-arc-hull',
      'tgt.shield / tgt.shieldMax',
      'tgt.armorHp / tgt.armorMax',
      'tgt.hull / tgt.hullMax',
      'if (!tgt || !tgt.alive)',
    ],
  },

  // ---- §4: Radar honesty --------------------------------------------------
  {
    path: 'src/ui/radar.js',
    label: 'Radar honesty — stations, gates, wrecks, objectives, unknown pings and off-screen hostiles remain distinguishable',
    needs: [
      'fillRect',
      'isGate',
      "'wreck'",
      'drawWaypointDiamond',
      'drawWaypointEdgeArrow',
      'waypointLabel',
      "strokeText('?'",
      'nearestOffRangeHostile',
    ],
  },
  {
    path: 'src/ui/galaxyMap.js',
    label: 'Command map waypoint — active route has labeled endpoint pin and click target',
    needs: [
      'drawWaypointPin',
      'waypointMapLabel',
      'waypointClickTarget',
      "kind: 'waypoint'",
      'ACTIVE WAYPOINT',
    ],
  },

  // ---- §5: Local map polish -----------------------------------------------
  {
    path: 'src/ui/screens/localmap.js',
    label: 'Local map — legend, wheel zoom and hostile motion cues remain available',
    needs: [
      "'wheel'",
      'targetZoom',
      'velocity.x',
      'velocity.z',
    ],
  },

  // ---- §5: Star map polish ------------------------------------------------
  {
    path: 'src/ui/screens/starmap.js',
    label: 'Star map — security semantics, route state and remembered prices remain available',
    needs: [
      'securityPips',
      'lineDashOffset',
      'commQuote',
      'priceText',
    ],
  },

  // ---- §3 HP-fraction accuracy (source contract) --------------------------
  {
    path: 'src/ui/hud.js',
    label: 'Target arc hp-fraction accuracy — correct division formula for each layer',
    needs: [
      'tgt.shieldMax',
      'tgt.armorMax',
      'tgt.hullMax',
      'tgt.shield / tgt.shieldMax',
      'tgt.armorHp / tgt.armorMax',
      'tgt.hull / tgt.hullMax',
    ],
  },

  // ---- §2 IFF palette imported from accessibility.js ----------------------
  {
    path: 'src/ui/hud.js',
    label: 'IFF colours imported from accessibility.js SEMANTIC_PALETTE',
    needs: [
      "from './accessibility.js'",
      'SEMANTIC_PALETTE',
    ],
  },
];

// Exercise the roster contract through exported behavior rather than pinning its implementation
// spelling or a particular visual composition.
{
  const selected = { e: { id: 'selected' }, isWreck: true };
  const threat = { e: { id: 'threat' }, hostile: true };
  const ally = { e: { id: 'ally' }, ally: true };
  const wreck = { e: { id: 'wreck' }, isWreck: true };
  const ambient = { e: { id: 'ambient' } };
  const ordered = [ambient, wreck, ally, threat, selected]
    .sort((a, b) => contactDisplayBand(a, 'selected') - contactDisplayBand(b, 'selected'))
    .map((contact) => contact.e.id);
  assert.deepEqual(ordered, ['selected', 'threat', 'ally', 'wreck', 'ambient'],
    'contact roster must prioritize the selected contact, threats and allies over ambient traffic');

  const narrowLimit = contactDisplayLimit(800, 600);
  const wideLimit = contactDisplayLimit(1920, 1080);
  assert.ok(narrowLimit > 0 && wideLimit >= narrowLimit,
    'contact roster row capacity must remain positive and responsive');
  assert.match(contactOverflowSummary([selected, threat, ally, wreck, ambient], 2), /^\+3\b/,
    'contact roster overflow must disclose the omitted count');

  const clock = createContactRosterClock();
  assert.equal(consumeContactRosterClock(clock, 0.19), false,
    'contact roster must not mutate every render frame');
  assert.equal(consumeContactRosterClock(clock, 0.01), true,
    'contact roster must still refresh at its bounded presentation cadence');
  console.log('ok   contact roster behavior — priority, responsive capacity, truthful overflow and bounded cadence');
}

let ok = 0, fail = 0;
for (const check of checks) {
  const src = await readFile(join(ROOT, check.path), 'utf8');
  const missing = (check.needs || []).filter((needle) => !src.includes(needle));
  const forbidden = (check.forbids || []).filter((needle) => src.includes(needle));
  if (missing.length || forbidden.length) {
    const reasons = [];
    if (missing.length) reasons.push(`missing: ${missing.join(', ')}`);
    if (forbidden.length) reasons.push(`forbidden: ${forbidden.join(', ')}`);
    console.log(`FAIL ${check.path} — ${check.label}: ${reasons.join('; ')}`);
    fail++;
  } else {
    console.log(`ok   ${check.path} — ${check.label}`);
    ok++;
  }
}

console.log(`\n${ok + fail} checks: ${ok} ok, ${fail} fail`);
if (fail > 0) process.exit(1);
