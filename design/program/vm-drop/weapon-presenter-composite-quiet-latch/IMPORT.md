# IMPORT — weapon-presenter-composite-quiet-latch

## What it is

Composite quiet latch for prepareFrame / `WeaponVfxPresenter.update`. When
every weapon surface is idle after the first all-quiet observe, skip
ageShieldContacts + a11y + setCamera/depth + empty syncBolts + nearMiss
cadence + N pool.update calls every tick. Wake on pool live counters /
`quarks._quietEmpty` / `shieldContactsActiveCount` / `fields.active` ref+len /
entityIndexVersion / projectiles lane. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/render/weapons/presenter.js` (composite quiet latch / maybeAwake / allQuiet)
- `src/render/weapons/shieldContacts.js` (`shieldContactsActiveCount`)
- `src/render/weapons/index.js` (re-export)
- `test/weapon-presenter-composite-quiet-latch.test.mjs`

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Owner applies
the patch from `patches/` in numeric package order on master when importing.
Different angle from held O1 multi-pool dirty-wake ~1.15× (thin empty-if
probe); this latches the full residual after per-pool early-outs.
