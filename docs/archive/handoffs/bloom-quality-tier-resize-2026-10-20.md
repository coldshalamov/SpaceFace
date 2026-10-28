# Bloom quality switches without resize

## Reproduced defect

At 844×390, changing `bloomLevels` from 2 to 1 kept four downsample passes until a dimension changed. Switching back from 1 to 2 likewise kept one pass until resize. The `maxLevels` alias behaved identically. `setOptions` re-entered `setSize` with unchanged dimensions, bypassing pyramid reconciliation.

The diagnostic `maxLevels: 2` versus `levels: 4` is not itself a defect: tier 2 intentionally selects the four-level wide halo. This patch preserves that authored mapping and all default look values.

## Bounded repair

`setSize` also reconciles when the desired pyramid length changes. Existing scene and retained pyramid targets are reused; removed targets are disposed, and only missing levels are allocated. Display/CAS sizing and dynamic-resolution content rectangles remain intact.

## Evidence and limits

- Three focused regression cases fail on the unchanged public source (4 versus 1), then pass with this repair.
- 79 focused and adjacent tests pass, covering both aliases, actual draw counts, target identity/disposal, allocation telemetry across steady frames, orientation changes, disabled updates, context rebuild, fresh compositor construction with saved options, and CAS preservation.
- The new regression file is selected by `check:runtime-maturity`.
- Independent root review approved the minimal source guard and focused tests.

This is a compositor settings contract fix, not proof that the mobile screenshot's blur/brightness is corrected. No target-device performance claim, visual acceptance, or full Continue-route acceptance is made. Software-rendered browser evidence cannot establish hardware performance.
