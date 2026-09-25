# IMPORT — poi-scan-all-identified-quiet-latch

## What it is

Quiet latch for `_tickPOIScan` when no proximity-scannable unidentified work
remains (typical post-exploration / all-identified sectors). Skips the carrier
+ discovery walk; wakes on sector change, `pois.length`, or a 0.5 s rescan.
Soft-GPU fps not claimed.

## Live path that would receive it

- `src/systems/world.js` (`_tickPOIScan` + bench toggles)
- `test/poi-scan-all-identified-quiet-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Hazards far /
env-machinery far / asteroid-field empty latch remain deferred or held. Owner
applies the patch from `patches/` in numeric package order on master when
importing. Stacks under world / registry.step residual after #135
asteroid-field-interact still latch.
