# DONE — midflight-wave-hull-decode (measured miss — **not shipping patches**)

## Attempt

Thin mid-flight admission: on `run:wavePlanned`, kick silhouette-aware authored
preload for the plan’s real enemy hull keys (Choice B). No exemplar mesh, no
pipeline precompile, no `#24` yield-after-present reorder. Focused tests **4/4**.

Scratch kept local: `vm-work/midflight-wave-hull` @ `bc8b13fc2969dfc684d7ae483ca67ae37b4df673`.

## Soft-GPU crucible seed 4242 (30 s)

| Metric | Before (master `0612d2b9fc994557dd35cb00d0df21b791722c23`) | After (wave-hull) | Notes |
|---|---|---|---|
| novelty NOVEL | 13 | **8** | mild win |
| hitch callbacks | **253 / 343** | **279 / 324** | **miss** |
| worst frame | 1183 ms | **283 ms** | win (noisy) |
| game speed | **42.5 %** | **30.8 %** | **miss** |
| long-frame peak admission | 11 ms | **22 ms** | **miss** |
| `GLTFKit_ship_wasp` novel in sample | absent as named novel | still one `via GLTFKit_ship_wasp` @ +7.6s | incomplete |

## Judgment

**Do not import as a hitch package.** Novelty/worst improved, but hitch + peak
admission + game speed moved the wrong way on this soft-GPU host — same class of
miss as full `shader-admission-slice` (65→94 hitch). Keep scratch for forensics /
owner-GPU re-measure only.

## Next for this pole

- Hold-prefetch for inbound-only (lane-c `2e3da7ff3`) as a separate A/B — do not
  stack with `#24` yield-after-present.
- Owner-GPU re-check of Choice B alone before any hitch claim.
