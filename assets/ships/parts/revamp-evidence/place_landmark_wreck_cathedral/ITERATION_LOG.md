# PQ-018 Cathedral re-author iteration log

```yaml
started: 2026-08-10
sourceSha256: d77097b75cbb05c95d9d90e43b2013e89664c956ca55578854ea736657914fdd
priorSourceSha256: f335935f9658bad0e721aceb5d66bb4c2f0457fe411442819b4a3455a00af704
artVerdictBaseline: REVISE (G1/G2/G4 whole_asset FAIL)
currentDisposition: REVISE-improved (not KEEP / not A-list claim)
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

## Capture checkpoints

- Baseline: pre-existing `captures/*` (REVISE)  
- After pass 1: material separation visible; hull over-thinned  
- After pass 2–3: casemate mass restored; warm alloy frames; rooted rupture; multi-view evidence refreshed  

## Remaining open (why not A-list KEEP yet)

- Upper hangar still reads somewhat as open cage at some angles  
- Bow wedges still relatively simple  
- Engine bells still primitive frustums (improved materials only)  
- Independent G7 whole-asset KEEP not claimed  

## Identity preserved

Two-half silhouette, 72×58 fly-through, sockets/markers, LOD order, place identity, Ceres coordinate, World Site contracts.
