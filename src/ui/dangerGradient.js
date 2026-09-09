// dangerGradient.js — BP-11 packet A9 "Danger Gradient Readout" (SURFACE — see
// design/revamp/detail/A_sector_station.md packet A9).
//
// One look at the map shows the danger gradient across the 10 sectors: secure core cool, lethal
// frontier hot. This module TINTS the nodes the star map already renders — it adds NO map data,
// NO nodes, NO fog (that is BP-03's lane), and it NEVER re-derives danger: the tier comes from
// the SHIPPED `dangerTier` helper in sectors.js (one source of truth).
//
// Ownership (AGENTS §10 — starmap.js/galaxyMap.js are maps-lane-owned; noTouch: sectors.js,
// galaxyMap.js, uiRoot.js): this file is a PURE helper (`gradientFor`) plus a GUARDED tint
// APPLIER that hooks the existing render from outside — it wraps `starmapScreen._drawNodes` and
// draws an additive overlay (tier tint wash + tier badge) AFTER the original node render. The map
// file itself is never edited; uninstall restores the original function. The overlay is
// try/catch-isolated so it can never break the map, and skips undiscovered nodes (fog respected).
//
// Registered as a SYSTEMS-only entry (no update): install on init, restore on destroy. Headless
// (`typeof document === 'undefined'`) the applier is a strict no-op — nothing wraps, nothing
// changes for the sim harness.
//
// budget: spawn:none · voice:none · draw:+1 tint + 1 badge per EXISTING map node.

import { dangerTier } from '../data/sectors.js';
import { SECURITY_TIER_LABELS } from './sectorPostcard.js';
import { starmapScreen } from './screens/starmap.js';
import { canvasFontScaled } from './canvasFonts.js';

/** dangerTier 0..5 → cool→hot tint ramp (0 = secure core, 5 = lethal frontier). */
export const TIER_COLORS = ['#4DA8FF', '#62E08A', '#FFD84A', '#FFB347', '#FF5470', '#FF2438'];

/**
 * gradientFor(sector) → { tier, heat, color, badge }
 *
 * PURE over the SHIPPED dangerTier helper — never re-derives danger, never mutates the sector.
 * `heat` is the monotonic 0..1 scalar (tier/5); `badge` reuses the shipped security-tier display
 * language (sectorPostcard.SECURITY_TIER_LABELS) so the map and the postcard always agree.
 */
export function gradientFor(sector) {
  const tier = dangerTier(sector);
  return {
    tier,
    heat: tier / (TIER_COLORS.length - 1),
    color: TIER_COLORS[tier] || TIER_COLORS[TIER_COLORS.length - 1],
    badge: SECURITY_TIER_LABELS[tier] || SECURITY_TIER_LABELS[SECURITY_TIER_LABELS.length - 1],
  };
}

// ── guarded tint applier (hooks the existing node render; never edits the map file) ─────────────

const INSTALL_FLAG = '_sfDangerGradientOrig';
const TINT_ALPHA = 0.20;

/** The additive overlay drawn after the original nodes: tint wash + tier badge per known node. */
function drawGradientOverlay(screen, g, nodes) {
  const z = (screen._cam && screen._cam.zoom) || 1;
  for (const n of nodes || []) {
    if (!n || !n.sector) continue;
    if (typeof screen._isDiscovered === 'function' && !screen._isDiscovered(n.sector.id)) continue;
    const grad = gradientFor(n.sector);
    // Tint wash over the existing node fill.
    g.save();
    g.globalAlpha = TINT_ALPHA;
    g.beginPath();
    g.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    g.fillStyle = grad.color;
    g.fill();
    g.restore();
    // Tier badge under the node's existing label stack (name @ +5, danger% @ +18).
    g.fillStyle = grad.color;
    g.font = canvasFontScaled('600', 12, z, 'mono');
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText(grad.badge.toUpperCase(), n.x, n.y + n.r + 29 / z);
  }
}

/**
 * installDangerGradient(screen?, opts?) → boolean
 *
 * Wraps `screen._drawNodes` so every node the map already draws gains the tier tint + badge.
 * Guarded (`typeof document`), idempotent, and reversible; the overlay is try/catch-isolated.
 * `opts.force` bypasses the document guard for headless unit tests only.
 */
export function installDangerGradient(screen = starmapScreen, opts = {}) {
  if (typeof document === 'undefined' && !opts.force) return false;
  if (!screen || typeof screen._drawNodes !== 'function') return false;
  if (screen[INSTALL_FLAG]) return false; // already installed
  const orig = screen._drawNodes;
  screen[INSTALL_FLAG] = orig;
  screen._drawNodes = function (g, nodes, currentId, now) {
    orig.call(this, g, nodes, currentId, now);
    try { drawGradientOverlay(this, g, nodes); } catch { /* overlay must never break the map */ }
  };
  return true;
}

/** Restore the original node render (used on destroy; safe if not installed). */
export function uninstallDangerGradient(screen = starmapScreen) {
  if (!screen || !screen[INSTALL_FLAG]) return false;
  screen._drawNodes = screen[INSTALL_FLAG];
  delete screen[INSTALL_FLAG];
  return true;
}

// ── registry SYSTEMS-only entry (no update; install once, restore on destroy) ───────────────────

export const dangerGradient = {
  name: 'dangerGradient',
  init() { installDangerGradient(); },
  destroy() { uninstallDangerGradient(); },
};

export default dangerGradient;
