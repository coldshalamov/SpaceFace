# PQ-018 Cathedral re-author iteration log

```yaml
started: 2026-08-10
sourceSha256: 7c2f3fcd82235b8a44463320b83d3ee18d377049fe63995d8ebf7b896733ee0e
priorSourceSha256: d77097b75cbb05c95d9d90e43b2013e89664c956ca55578854ea736657914fdd
artVerdictBaseline: REVISE (G1/G2/G4 whole_asset FAIL)
currentDisposition: reauthor-shipped (implementation leaf; whole-asset KEEP deferred to review)
releaseSha256: 32094bcd6df7671e9e2d93ae491a6aab33aa1ca9bd2a32cc3548cb7532eedcca
blendSha256: e76227e8762092072fb963b898eba592a1c2e39caf8c8860dcb43868cc3c40b7
```

## Baseline defects (from captures + art verdict)

1. Solid LEGO brick hull banks  
2. Square bar ribs with weak roots  
3. Floating break debris  
4. Uniform clay grey material allocation  
5. Flat hangar arch crowns/sills  
6. Monolithic bridge wedge  
7. Solid propulsion crossmember slabs  
8. Service machinery as single bricks  
9. Deck plates without edge lips  
10. Weak macro/meso hierarchy  

## Iteration passes (geometry/material language)

| # | Change |
|---|---|
| 1 | Material palette separation (cooler dielectric hull, warmer exposed alloy, darker scorch, brighter copper) |
| 2 | Rebuild textures with new seed |
| 3 | `make_i_beam` manufactured I-section for structural members |
| 4 | Route `make_beam` through I-section |
| 5 | `make_armor_shell` plate+stringer helper |
| 6 | Hull banks: casemate volumes + insets + scorched plates |
| 7 | Longitudinal rails as I-beams |
| 8 | Keel/spine as I-beams terminating at break |
| 9 | Bow armor cheek plates |
| 10 | Rib feet + gusset roots |
| 11 | Break shards rooted to bulkhead with root plates (not free float) |
| 12 | Portal crown/sill + inner lips (section change) |
| 13 | Deck toe plates + edge armor |
| 14 | Bridge step mass + thin cap + stringer |
| 15 | Service machine base pad + flange on drums |
| 16 | Propulsion I-crossmembers + armor shells |
| 17 | Thin cowl plates + stringers |
| 18 | Full author rebuild + multi-angle evidence re-render |
| 19 | Release build (meshopt+KTX2) + hash freeze in admission test |
| 20 | Manifest bytes/tris sync; site test scopes component count to SITE_ID |
| 21 | Outer rib-to-rib cladding plates + stringers; casemate fore/aft section lips; denser rooted rupture shards/flaps; BUILD_SEED 18082027; release rebuild |

## Capture checkpoints

- Baseline: pre-existing `captures/*` (REVISE)  
- After pass 1: material separation visible; hull over-thinned  
- After pass 2–3: casemate mass restored; warm alloy frames; rooted rupture; multi-view evidence refreshed  
- After pass 21: source `7c2f3fcd…` / release `32094bcd…`; LOD 166944/68684/18024; flythrough probe 75/0  

## Remaining open (why not A-list KEEP yet)

- Upper hangar still shows framed openings (intentional cavity; cladding now primary outer read)  
- Bow wedges still relatively simple  
- Engine bells still primitive frustums (improved materials only)  
- Independent whole-asset G1/G2/G4 KEEP not claimed — owned by `PQ-018.cathedral-reauthor-h1` + `review`  

## Identity preserved

Two-half silhouette, 72×58 fly-through, sockets/markers, LOD order, place identity, Ceres coordinate, World Site contracts.
