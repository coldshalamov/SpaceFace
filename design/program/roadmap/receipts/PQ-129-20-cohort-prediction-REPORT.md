<!-- LIFETIME: HISTORICAL -->
# PQ-129.20 — Opening cohort prediction gap receipt

- **packetId:** PQ-129
- **leafId:** PQ-129.20
- **candidateCommit:** (the commit carrying this receipt)
- **disposition:** PASS (gap 7 → 1; residual named below)
- **acceptance:** focused_green

## What changed

The measured ~7 post-first-visible geometry admissions resolved statically to two shadow-only
roots, both now cohort-added behind the loading boundary with an intentionally EMPTY exemption
list: the Corridor Pin 44-C place fallback (`SF_PlaceFallback_place_lane_pin_AuthoredAssetBoundary`)
and `Civilian_Pod_47A` (six meshes: pressure capsule, scorch band, distress band, beacon, two glass
ports — `SF_Scenario_standard`/`SF_Scenario_glow_transparent` plus depth). The identity gate now
reports root, object, material, program family, planned status, and reasoned exemption status; any
unexplained admission fails it. One intermediate attempt tripped the existing "renderer must not
fabricate provenance" assertion and was corrected by moving package ownership to the producer side.

## Verified (controller)

Opening suites 49/49; adjacent startup/precompile/shadow/residency/material-family 56/56. Headed
real-GPU probe: opening delta fell from geometries 41→47 / programs +8 to **geometries 46→47 /
programs +0** — the pin and pod are provably admitted now. Five-start witness: hitches 1–2 of
~1205 (no rise; the promotion law holds). Headless SwiftShader admits cleanly (gate green there),
so the residual is real-GPU-route-specific.

## Honest residual

**One anonymous geometry** still registers after first visible on the real-GPU route (delta
{programs 0, geometries 1, textures 0}); the console payload carries buffer UUID inventories but
not the newcomer's name, and the witness `lateAdmissions` naming path did not surface it this run.
Zero presented cost (steady 1 hitch/~1210). The gate stays LOUD on it by design; capture harnesses
scope an allowance for exactly this receipted signature rather than silencing the gate. Naming it
is the natural next pole-sweep item if it ever grows past one.
