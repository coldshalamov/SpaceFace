<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-050
leafId: PQ-050.03
acceptance: focused_green
disposition: PASS
candidateCommit: 7d9fb99ca492d6f6e6ca190e3cfe3b8e59d18f85
-->

# PQ-050.03 — Ranger player explorer remaster

```yaml
packet: PQ-050
dispatchUnit: PQ-050.03
candidateCommit: 7d9fb99ca492d6f6e6ca190e3cfe3b8e59d18f85
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
hitchTouched: false
wholeFleetPromoted: false
```

## Outcome

PASS. The accepted Cycle 32 Ranger replaces the rejected generic dart with one long-endurance
surveyor: a formed pressure hull, dark greenhouse tub, rooted twin drive houses, articulated oval
arrays, a pulse-gel utility rack, and an asymmetric crabbed survey pin remain readable at the legal
chase camera. Only Ranger LOD0/1/2 were copied into the live parts and release routes. Four
independent final visual views returned KEEP.

The real active-hull switch exposed two integration defects that were fixed in the candidate. A
short-lived rebuild entity dropped the player marker and silently selected modular generic parts;
accepted fleet remasters now retain their exact whole-body identity by authoritative `defId`. The
Ranger's field sail also had no forward authority in ordinary zero-field sectors; it now uses the
family-authored weak onboard trim only when environmental coupling is absent, while preserving the
original sail behavior whenever a usable field exists.

## Exact accepted identity

| Artifact tier | LOD0 SHA-256 | LOD1 SHA-256 | LOD2 SHA-256 |
|---|---|---|---|
| Accepted source/live parts | `c7a49ac369ab33a19def33c9c90066834144029192668ee35c3e3e6077dedc2a` | `df6aa72cad21aa8fbc5ab8c2a2e1d9117ba6d873bab6489975f8e646cd388f13` | `15252a19e24c9f620689e23867bdda4cc568dde3b5470b19854a94b463db2f2a` |
| Release | `6b05c48c7e69338d56e0f7765bc2bfd363f419ca1cbd35091ed453567c1debaf` | `6f076e487de231689f3da601cf67d7103d01d7a51f41b1625b66db84d0fb09a5` | `3a0148e3191e4a6258728e5585f246ad2a5ca0c5192f406052f39dfbc048b761` |

## Direct verification

- Focused propulsion, travel-drive, Ceres lifecycle, and whole-ship routing suite: 54/54 PASS.
- Render-package freshness and coverage: 194/194 packages current; Ranger LOD0/1/2 build valid
  24-node plans with 23 instance records each.
- Headed production flight: exact release URL and `sf.render.ranger-production-v1` package active,
  19 meshes, `rapier-dynamic`, no non-optional console or page errors, and two distinct canvas
  hashes. Held forward input raised speed from 2.107387 to 12.994452 and moved the ship 23.870028 WU.
- Runtime witness: presenting, changing canvas, no freeze, and p95 presentation/render buckets of
  5.7/4.6 ms.
- Fast baseline: 10/12 green. The two remaining failures are the already fingerprinted unrelated
  startup GPU-residency VFX listing and Ceres topology digest; neither changed under this leaf.
- Final independent verdict: KEEP; no in-scope residual remains for this leaf.

## Residual scope

The parent PQ-050 campaign remains open. Ironback (`PQ-050.04`) is the next dependency-front ship.
This leaf does not claim parent-wide G1/G2/G4/G7 closure or repair the two inherited baseline reds.
