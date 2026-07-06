// check-ui-identity.mjs — SPEC2/06 UI IDENTITY static audit.
//
// Verifies (via source reading) that the key contracts from
// design/spec2/06_UI_IDENTITY.md are met.
// Follows the same static needle-in-source-file pattern as check-ui-a11y.mjs.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const checks = [
  // ---- §1: Three-anchor HUD -----------------------------------------------
  {
    path: 'src/ui/hud.js',
    label: 'HUD three-anchor layout — schematic + rightdock + status cluster',
    needs: [
      'sf-schematic',      // bottom-left ship schematic
      'sf-rightdock',      // bottom-right radar+overview+target
      'sf-cluster',        // bottom-center status cluster (SPD/WPN/TETHER)
      'sf-overview',       // overview strip created inside rightDock
      'sf-target-arcs',    // in-world target arcs overlay
    ],
    forbids: [
      // Spec §00: no visor/cockpit motifs as live DOM classes
      // (comment mentions why they were removed — that's fine)
      'backdrop-filter',   // §00 explicitly forbidden (GPU cost)
    ],
  },

  // ---- §2: Overview Strip -------------------------------------------------
  {
    path: 'src/ui/hud.js',
    label: 'Overview strip — 5 Hz cadence (every 12 frames at 60 Hz), hostiles-first sort, 8-row cap, click-to-target, memoised signature',
    needs: [
      // 5 Hz cadence at 60 Hz = fire every 12 frames
      'overviewTick % 12',
      // Hostiles-first sort detected by hostile team comparison in sort callback
      'aHostile && !bHostile',
      // 8-row cap
      'Math.min(8, contacts.length)',
      // "+N CONTACTS" footer
      'CONTACTS',
      // Click sets targetId
      'state.player.targetId = e.id',
      // Left IFF rule per row
      'sf-overview-row',
      // Memoised via signature equality check
      'lastOverviewSignature',
      // IFF from accessibility.js
      'SEMANTIC_PALETTE',
    ],
  },

  // ---- §3: Target Panel v2 ------------------------------------------------
  {
    path: 'src/ui/targetPanel.js',
    label: 'Target panel v2 — segmented bars (shield/armor/hull), distance, closing speed, gimmick tag',
    needs: [
      'sf-bar--shield',
      'sf-bar--armor',
      'sf-bar--hull',
      'dist',
      'closing',
      'gimmick',
    ],
  },

  // ---- §3: Target Arcs (in hud.js) ----------------------------------------
  {
    path: 'src/ui/hud.js',
    label: 'Target arcs — three SVG circles, radius offsets +6/+9/+12, 300° arc, 250 ms fade on death',
    needs: [
      'sf-arc-shield',
      'sf-arc-armor',
      'sf-arc-hull',
      // Radius offsets: target.radius + 6/9/12 (larger = outer = shield)
      'tgt.radius + 12',   // shield outer
      'tgt.radius + 9',    // armor mid
      'tgt.radius + 6',    // hull inner (spec says +6/+9/+12 from inner to outer)
      // 300° arc
      '300',
      // 250 ms fade timer (260 = next-frame buffer over 250)
      '260',
      // HP fraction formula
      'tgt.shield / tgt.shieldMax',
    ],
  },

  // ---- §4: Radar honesty --------------------------------------------------
  {
    path: 'src/ui/radar.js',
    label: 'Radar honesty — station square, gate ring, wreck cross, objective white outline, scan ping "?", nearest-hostile bezel arrow',
    needs: [
      // Station: fillRect (square)
      'fillRect',
      // Gate: arc/circle (isGate branch)
      'isGate',
      // Wreck: cross (two diagonal lines)
      "'wreck'",
      // Objective diamond 1-px white outline
      "strokeStyle = '#ffffff'",
      // Scan pings as hollow '?'
      "strokeText('?'",
      // Nearest off-screen hostile bezel arrow only (max 2: objective + hostile)
      'nearestOffScreenHostile',
    ],
  },

  // ---- §5: Local map polish -----------------------------------------------
  {
    path: 'src/ui/screens/localmap.js',
    label: 'Local map — single-row legend, wheel-zoom 150 ms ease, hostile velocity ticks',
    needs: [
      // One-line legend: nowrap
      'white-space: nowrap',
      // Wheel zoom listener
      "'wheel'",
      'targetZoom',
      // 150 ms exponential ease (τ = 0.10 s)
      '0.10',
      // Velocity/3 ticks for hostiles
      'velocity.x / 3',
      'velocity.z / 3',
      // 24 px max clamp
      '24',
    ],
  },

  // ---- §5: Star map polish ------------------------------------------------
  {
    path: 'src/ui/screens/starmap.js',
    label: 'Star map — security pips helper, 3-px marching dash route, price-memory per-node',
    needs: [
      // Security pips HTML helper function
      'securityPips',
      // Filled pip chars in pips output
      '●●●',
      // Marching dash: 3/z line width
      'lineWidth = 3 / z',
      // Animated lineDashOffset for marching effect
      'lineDashOffset',
      // Price-memory quote per node (canvas label)
      'commQuote',
      'priceText',
    ],
  },

  // ---- §6: Dialog chrome --------------------------------------------------
  {
    path: 'styles/ui.css',
    label: 'Dialog chrome — 150 ms screen transitions, focus ring 2 px #39d0ff, destructive #ff5c5c text',
    needs: [
      '150ms',
      '#39d0ff',
      'focus-visible',
      '#ff5c5c',
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
