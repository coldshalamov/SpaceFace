# MOB-02 — The phone HUD covers at most a quarter of the screen

**Lane 2.** Owner (iPhone): "the HUD takes up most of the screen … maybe the HUD is too dark."
**Spec and code facts:** `design/program/fleet/drafts/MOB.md` §MOB-02 (measured ≈ 50 % coverage at 390×844;
the element table with sizes and owners). **Ruling** (`design/game/README.md` 3): flight HUD ≤ 25 % of the
screen, contrast in scope.

## Evidence (lead look, `.devshots/fleet/looks/pinch-zoom/390x844-before.png`)
Top half: a large SPEED/HULL/SHIELD/ENERGY/BOOST block (top-left), the objective card with a DETAILS button
under it, a full radar dial with RANGE text (top-right), POWERS and pause buttons, a "View & circuits" box,
a HELIOS PRIME waypoint line, a bark line. Bottom: stick, TETHER and a large yellow GUN button.

## Build (phone layout only — desktop unchanged)
1. **Vitals:** one compact row of four thin bars (hull, shield, energy, boost) with a small speed number —
   ≤ 36 px tall, top-left.
2. **Objective:** one line (title only, ellipsis), tap to expand into the existing details sheet; the
   DETAILS button goes away.
3. **Radar:** a 96 px mini dial top-right; tap opens the full map. RANGE text hidden on phones.
4. **"View & circuits":** moves into the pause/menu sheet. POWERS stays as one small button.
5. **Bottom controls:** keep stick / TETHER / GUN, but GUN at most 88 px; nothing else bottom-centre.
6. **Contrast:** every HUD text ≥ 4.5:1 against what is behind it; panels get the kit glass plate
   (G16) so text never sits bare over the world.
Measure coverage as the union of HUD element rectangles over the viewport.

## Checks
- A DOM measure test at 390×844 and 844×390: HUD union ≤ 25 %.
- `node scripts/fleet/game-lock.mjs run -- node scripts/ui-bench.mjs --phone --shot=<flight shot>` before/after,
  and rerun `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/pinch-zoom.mjs`; describe both.
- `node scripts/check-ui-budgets.mjs`: report if stale (G16-03 re-baselines at its end; do not re-baseline).

Commit: `fleet(MOB-02): the phone HUD fits in a quarter of the screen`.
