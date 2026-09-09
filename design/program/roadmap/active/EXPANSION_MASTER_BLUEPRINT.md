<!-- LIFETIME: DURABLE -->
# SpaceFace expansion synthesis: four player-facing pillars

**Status:** `ACTIVE_SYNTHESIS` — retained design context; non-dispatching.
**2026-09-06 controller disposition:** Preserve the ambitions below, route implementation through admitted packets, and do not create `MS-*` queue IDs.
**Authority:** User direction; [ARCHITECTURE](../../../../ARCHITECTURE.md) for technical contracts; then [VISION](../../../VISION.md), [GDD](../../../GDD_2_0.md), the [canonical build map](../../../../CANONICAL_BUILD_MAP.md), and active packets. This document does not supersede those sources.

## Purpose

This synthesis keeps four connected player promises in view: kinetic play that rewards skill,
swarms that are readable under pressure, trade that supports deliberate choices, and visuals that
make the playfield legible and exciting. It is a cross-packet design aid, not a claim that prior
work was mistaken or incomplete.

## 1. Kinetic Massline and physical combat

**Player promise:** A latch, swing, release, or collision should create a clear physical outcome.
The player survives ordinary navigation mistakes, while deliberately using mass and momentum can
create an exciting opening.

**Current owners:**

- [PQ-137](./PQ-137.md) owns the physics-feel contract: forgiving ordinary contact, hit-stun
  law, and force-table decisions.
- [PQ-026](./PQ-026.md), [PQ-028](./PQ-028.md), [PQ-029](./PQ-029.md),
  [PQ-030](./PQ-030.md), and [PQ-031](./PQ-031.md) own Massline toys and rideable mass.
- [PQ-140](./PQ-140.md) owns enemies as physical problems; [PQ-146](./PQ-146.md) owns stunt
  grammar and reward.

**Useful acceptance direction:** A player can identify the latch, the stored motion, and the
release result from play. A thrown object, a dangerous foe, and a traversal release each make a
different tactical decision available. The applicable packet must set survivability, damage,
release strength, and duration from fixed-seed play and route evidence; this synthesis sets none
of those values.

**Not an admission:** A universal collision multiplier, a deleted safety cap, compulsory helm
lock, or one fixed four-state controller is not approved by this document. Existing collision and
Massline paths remain the starting point for any change.

## 2. Choreographed swarms and event ecology

**Player promise:** A crowd is tense without becoming unreadable. Enemies telegraph meaningful
threats, the player can use cover and movement, and the surrounding world reacts to conduct.

**Current owners:**

- [PQ-140](./PQ-140.md) and [PQ-174](./PQ-174.md) own enemy roles, pressure, telegraphs, and
  the Crucible feel bar.
- [PQ-175](./PQ-175.md) owns waves, arenas, and mutators.
- [PQ-138](./PQ-138.md), [PQ-143](./PQ-143.md), and [PQ-151](./PQ-151.md) own consequential
  world events, local life, and the wanted response.
- [PQ-144](./PQ-144.md) owns runtime density and route performance evidence.

**Candidate scenario additions:** These are candidates for the owners above, only after their
existing seams are checked.

1. A guarded convoy crossing a visible route gives the player a choice to protect, raid, or avoid.
2. A pirate group uses local cargo value and terrain to create an ambush rather than arbitrary
   ambient crowding.
3. A civilian attack exposes a visible distress response with a player-readable intervention
   window; resolving or ignoring it changes the next encounter.

**Practical done condition:** At least one adopted scenario has a clear trigger, visible warning,
player counterplay, and a consequence that survives beyond the immediate volley. A dense Crucible
case may become a shared PQ-174/PQ-144 benchmark only after the runtime baseline identifies the
actual frame-cost owners. It must report the configured load and measured frame distribution,
not promise a universal frame rate in advance.

## 3. Legible trade and compounding purpose

**Player promise:** A player can understand why a trade opportunity exists, choose a route or
risk, and earn a next useful capability without opaque market noise or grind.

**Current owners:**

- [PQ-177](./PQ-177.md) owns the ticker, forecasts, contracts, and black-market reading layer.
- [PQ-155](./PQ-155.md) owns the economy as a verb curve and upgrade purpose.
- [PQ-148](./PQ-148.md) owns physical cargo, loss, and recovery.
- [PQ-151](./PQ-151.md) owns crime consequences around profitable risk.

**Useful acceptance direction:** A market surface states a cause and a player can act on it;
manual hauling, risky recovery, and later infrastructure offer distinct reasons to earn credits.
An adopted reward change must demonstrate its effect on the start-to-next-upgrade route and on
cargo risk.

**Not an admission:** Replacing market mathematics wholesale, mandating named wave forms or
price bands, or automatically replacing salvage interaction with instant currency is outside this
synthesis. [PQ-177](./PQ-177.md)'s bounded readability work remains the route for market changes.

## 4. Visual hierarchy and impact VFX

**Player promise:** The player can read ships, hazards, and objectives against a rich backdrop;
kinetic actions carry a distinct visual and audio consequence.

**Current owners:**

- [PQ-190](./PQ-190.md) owns the shipping-camera style slice and source-effect triage.
- [PQ-134](./PQ-134.md) owns causal structural VFX; [PQ-023](./PQ-023.md) owns unified
  physics-readable presentation.
- [PQ-144](./PQ-144.md) owns performance evidence for any density or effect change.

**Useful acceptance direction:** Review one representative play route at its shipping camera:
foreground threats remain readable, faction/interaction signals are distinguishable, and an
impact effect explains its cause without hiding the player or the target. Reuse from
[`src/vfxnext/`](../../../../src/vfxnext/) is considered effect-by-effect; its presence does not
require a catalogue migration.

**Not an admission:** Fixed luminance or saturation ceilings, blanket additive treatment,
removal of all existing particles, and claimed reversals of unrelated design records are not
binding. The active visual packet and player-route review decide the recipe.

## Integration rule

When a current packet adopts one of these candidate outcomes, that packet records its own seam,
done condition, and evidence. This synthesis then links to it; it never becomes a parallel queue,
a global ownership lane, or a substitute for live runtime evidence.
