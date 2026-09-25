# DONE — integrated-quality-preset

## Summary

Opt-in **Integrated GPU** quality preset is ready to import. One Settings → Video preset
bundles #86 shadows off, #87 reduced bloom (strength 0.28 + 1 level), #88 renderScale 0.85
+ sharpen, #89 dynamicResolution flag, #90 frameCap 30 (45 now in the cap list),
#93 postFx off, #94 particleQuality low. Default remains Medium. detectGpu may toast a
suggestion; it never auto-applies (PERF_WHAT_MATTERS-safe).

## Landed vs deferred (#86–#94)

| Item | Status |
|---|---|
| #86 Shadows off | **landed** (preset; already Medium default) |
| #87 Reduced bloom levels / strength | **landed** |
| #88 Render scale 0.85 + sharpening | **landed** |
| #89 Dynres | **flag landed**; apply dynres-target-pool first for integrated allow |
| #90 30/45 fps cap | **landed** (preset=30; 45 in options) |
| #91 NPC traffic density | **deferred** — no cheap plumbing; preset must not change sim content |
| #92 512 hull texture tier | **deferred** — no texture-tier plumbing |
| #93 Post effects off | **landed** (postFx) |
| #94 Particle density | **landed** |

## Focused tests

`npm run check:integrated-quality-preset` → **14/14 pass** (see focused-tests.log).

## Before / after baseline

| | ok | failed | wallMs | notes |
|---|---|---|---|---|
| before (untouched master `0612d2b9fc994557dd35cb00d0df21b791722c23`) | false | save-schema, sim-compare, sim-v3, sim | 37751 | known soft-GPU noise |
| after (scratch `01d964a7a01a993554ae6b0efe9d25d887d587fd`) | false | save-schema, sim-compare, sim-v3, sim | 34404 | **same reds; no new failures** |

## Soft-GPU / fps note

This VM is soft-GPU (SwiftShader/llvmpipe). Settings application and suggestion logic are
proven here. **fps / hitch under the Integrated GPU preset is owner-verify** on the
Intel/ANGLE machine.

## Evidence

- Patches: patches/0001 … 0004
- Focused tests: test/integrated-quality-preset.test.mjs + updated test/pq-165-00-presets.test.mjs
- npm script: check:integrated-quality-preset
- Scratch branch kept **local only**: vm-work/integrated-quality-preset @ `01d964a7a01a993554ae6b0efe9d25d887d587fd`

## Risks for the importer

- Apply **dynres-target-pool before** this series if you want #89 dynres to actually run on integrated (otherwise the flag is inert until _dynResAllowed includes integrated).
- Eyeball sharpen at 0.85 scale on real iGPU.
- Do not ship with Integrated GPU as the silent default.
