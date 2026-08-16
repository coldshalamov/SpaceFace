// PQ-013 / SF-14 — authored planetary-site constants (STEP 12: sling / skim / harvest / reentry).
//
// ONE colossal planet, ONE identity: the Atlas record (zone `zone_tethys_anvil`, authored in
// src/data/authoredPlaces.js) is canonical per the Q18 ruling — this module carries the PHYSICAL
// constants the registration adapter (src/systems/planetRuntime.js) binds to that identity in one
// transaction. No coordinates live here beyond the site->zone reference; the zone record owns the
// sector-local anchor and the Atlas derives the global position (D2).
//
// Attraction profile is the documented ARTISTIC-LIBERTIES profile (STEP 12: softened, bounded,
// annular — coherence not realism). The static body remains force-free, while the field reaches
// through the atmosphere strongly enough to curve an uncontrolled hull inward. Controlled outward
// thrust plus the authored recovery burn still wins. It rides the PQ-012 field kernel as a WELL
// with innerRadius/innerSoft (see fieldKernel.js) — no bespoke planet gravity path.
//
// Determinism: pure frozen data. No imports with side effects, no RNG, no Date.

// Tier-B determinism gate — same idiom as FIELD_FLAGS (src/data/fields.js): ON in the browser,
// OFF under node, so sf-sim / the 47a golden never construct the planet. Mutable for tests.
const IS_BROWSER = typeof window !== 'undefined';
export const PLANET_FLAGS = { enabled: IS_BROWSER };
export function planetFlag(name) { return !!PLANET_FLAGS[name]; }

/** Band edges are PLANAR radii (x/z distance from the site centre, WU). Hysteresis is applied
 *  symmetrically at every boundary by the runtime so states never flap on the line. */
export const PLANET_SITE = Object.freeze({
  id: 'planet_tethys_anvil',            // runtime site id (entity data + field id derive from it)
  zoneId: 'zone_tethys_anvil',          // THE canonical Atlas identity (Q18) — save/nav/mission ref
  sectorId: 'sector_tethys_junction',   // nonzero-origin sector (12288, 8192) — the anti-Helios rule
  name: 'The Anvil',
  planetType: 'oceanic',                // palette key in src/render/planetFactory.js PLANET_COLORS
  seed: 424213,                         // bake + surface seed (deterministic per site)

  // ---- geometry (presentation Y offset; physics is planar x/z) --------------------------------
  radius: 700,          // visual sphere radius (WU)
  centerY: -520,        // spike finding #1: bulk below the gameplay plane (fixed-heading camera)
  bodyRadius: 470,      // static exclusion circle (crest clearance: sqrt(700^2-520^2) ≈ 469)

  // ---- semantic region edges (planar radii, outer edge of each named region) ------------------
  bands: Object.freeze({
    reentry: 800,       // r < 800           — plasma onset; the Plunge plays out here
    danger: 880,        // 800 <= r < 880    — storm band; heat builds fast, harvest is richest
    skim: 1040,         // 880 <= r < 1040   — working+outer corridor; the harvest activity
    sling: 1450,        // 1040 <= r < 1450  — peak attraction; the gravity-assist region
    influence: 2600,    // 1450 <= r < 2600  — readable outer pull; predictor visibly bends
  }),
  hysteresis: 18,       // WU applied at each boundary (enter at edge, exit at edge+h)

  // ---- attraction (annular WELL registered into the PQ-012 kernel) ----------------------------
  field: Object.freeze({
    innerRadius: 470,   // the static exclusion body is force-free; atmosphere remains physically live
    innerSoft: 250,     // ramp across the visible limb; full pull by the terminal descent corridor
    radius: 2600,       // falloff reaches zero here (the influence edge — bounded, never infinite)
    strength: 240,      // wu/s^2 pre-coupling; FIELD_MAX_ACCEL still caps the summed total
    falloff: 1.4,       // outer ease (same falloff family every field uses)
  }),

  // ---- skim heat model (ONE scalar 0..1 per tracked ship — sheath + HUD read the same number) --
  heat: Object.freeze({
    skimRate: 0.045,    // /s in the skim corridor (slow simmer — working the band is sustainable)
    dangerRate: 0.34,   // /s in the storm band (risk pays; ~3s to commit threshold from cold)
    reentryRate: 0.85,  // /s in the reentry band (the Plunge clock)
    coolRate: 0.28,     // /s outside the bands (heat is recoverable — escape windows are real)
    coolSkimRate: 0.06, // /s while still inside the skim corridor (barely cools — depth choice)
  }),

  // ---- atmosphere drag (bounded additive impulses via queuePhysicsImpulse — the membrane) ------
  drag: Object.freeze({
    skim: 0.10,         // /s velocity fraction opposed in the skim corridor (feel: thick air)
    danger: 0.22,       // /s in the storm band
    reentry: 0.45,      // /s in the reentry band (bleeds tangential speed — the descent read)
    maxAccel: 60,       // wu/s^2 cap on the drag acceleration (bounded per the physics contract)
  }),

  // ---- Plunge staging (STEP 12: five stages, escape windows, terminal via the combat kill path)
  plunge: Object.freeze({
    commitHeat: 0.55,   // heat >= this (or reentry band) -> Commit
    breakupHeat: 0.82,  // heat >= this in danger/reentry -> Breakup (burn damage begins)
    burnDps: 6.5,       // hull damage /s in Breakup (routed, damageType 'reentry_burn')
    descentDps: 16,     // hull damage /s in Descent (deep reentry — the terminal slide)
    descentRadius: 740, // r < this while Breakup -> Descent (committed to the limb)
    aftermathS: 4.0,    // Aftermath presentation window after a terminal kill at the site
    regressS: 1.2,      // seconds of outward motion required to step a stage back (escape window)
  }),

  // ---- skim harvest (yield = path x density through an explicit collector device) --------------
  harvest: Object.freeze({
    commodityShallow: 'cmdty_gas_hydrogen', // skim corridor yield (existing commodity)
    commodityRich: 'cmdty_gas_helium3',     // storm-band yield (deeper = richer, existing commodity)
    densitySkim: 0.010,   // units per WU of path flown in the skim corridor
    densityDanger: 0.028, // units per WU in the storm band (risk-reward curve)
    minSpeed: 8,          // below this the scoop gathers nothing (path x density, NOT a hold timer)
  }),

  // ---- player recovery (emergency burn: held boost + outward heading unlock the assist) --------
  recovery: Object.freeze({
    assistAccel: 95,    // wu/s^2 outward assist while burning out of Commit+ (additive impulse)
    tangentialDamp: 0.5,// /s tangential-velocity opposition in the assist (the momentum cost)
    heatSpike: 0.08,    // heat added per second of emergency burn (the heat cost)
  }),
});

/** All authored planetary sites, keyed by sector — ONE for PQ-013 (STEP 12: one excellent planet). */
export const PLANET_SITES_BY_SECTOR = Object.freeze({
  [PLANET_SITE.sectorId]: Object.freeze([PLANET_SITE]),
});

export function planetSitesForSector(sectorId) {
  return PLANET_SITES_BY_SECTOR[sectorId] || EMPTY;
}
const EMPTY = Object.freeze([]);

/** Semantic region name for a planar distance r from the site centre (no hysteresis — the runtime
 *  layers hysteresis on top of this pure classifier). Order matters: innermost wins. */
export function classifyPlanetRegion(site, r) {
  if (!site || !Number.isFinite(r)) return 'outside';
  const b = site.bands;
  if (r < b.reentry) return 'reentry';
  if (r < b.danger) return 'danger';
  if (r < b.skim) return 'skim';
  if (r < b.sling) return 'sling';
  if (r < b.influence) return 'influence';
  return 'outside';
}

/** Region rank for hysteresis stepping (outside=0 .. reentry=5). */
export const PLANET_REGION_RANK = Object.freeze({
  outside: 0, influence: 1, sling: 2, skim: 3, danger: 4, reentry: 5,
});
