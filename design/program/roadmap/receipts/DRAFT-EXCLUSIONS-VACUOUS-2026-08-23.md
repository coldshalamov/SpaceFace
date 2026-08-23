# Phase 5's "draft compatibility / exclusions UI" has nothing to show yet

**Date:** 2026-08-23
**Status:** not built, deliberately. Building it now would be decoration.

## What was owed

Phase 5 (`PQ-133.05`) deferred three UI items to the GPU lane. Two are now done — causal score tags
in the results screen shipped today, and the unlock surface shipped on the Crucible door. The third
was **draft compatibility and exclusions**: showing the player, while drafting, that a modifier will
not work on the weapon they are carrying.

## Why it is not built

**There are no exclusions.** Compiling every attack trait against every plausible weapon —
96 weapon × trait pairs across the pulse, autocannon, flak, gravity-marker and medium variants —
produces **zero** incompatible results. `compileAttackSpec` accepts all of them.

The reason is a one-sided contract:

- **Traits declare what they forbid.** Across the whole catalog the forbidden tags are exactly
  `hitscan` and `continuous` (e.g. `mod_herald_fan.compatibility.forbids`).
- **Weapons declare nothing to match against.** No entry in `WEAPONS` carries an `emitter`,
  `trajectory`, `fireMode` or `kind` field. There is no tag on the weapon side for `forbids` to
  test, so every compatibility check passes by default.

A draft screen built on this today would put a "compatible" mark on every card, every time. That is
worse than an absent feature: it teaches the player the check is meaningless, and it would look like
working code to the next reader.

## What would make it real

Give weapons the tags the trait contract already expects — an emitter kind and a trajectory kind per
weapon, including at least one `hitscan` or `continuous` weapon so the forbid rules have something to
bite on. That is a **content** decision about what the weapons ARE, not a UI task, and it belongs
with whoever owns the weapon catalog.

Once a single real exclusion exists, the UI is small: the draft already knows the offers and the fit,
and `compileAttackSpec(...).ok` is the honest oracle — no second implementation of the compatibility
rules needed.

## The general point

This is the third stale-or-vacuous plan item found today, after the arcade VFX section claiming zero
consumers long after it had four, and the frontend gap table being wrong on all four rows re-tested.
**Check that a gap is real before filling it.** The cost of the check here was two node one-liners.
