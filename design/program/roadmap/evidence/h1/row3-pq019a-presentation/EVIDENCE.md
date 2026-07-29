# H1 row 3 — PQ-019A facility/capsule presentation and functional counts

**Overall result: FAIL — HARNESS (partial evidence survives).**

- **PASS:** the unmodified presentation harness completed and produced usable close/default/far
  facility stills plus the live T-minus cue.
- **PASS:** the separate functional collector produced draw/program/residency counts and admission
  states on a real Intel/ANGLE D3D11 GPU, with no page errors and no timing fields.
- **FAIL / HARNESS:** all three requested in-flight capsule *presentation* stills missed the capsule.
  The manifest itself records `projectionInFrame: false` and NDC around `(4.4, 6.7)` for close,
  default and far — far outside the viewport. Visual inspection confirms the frames show the player,
  traffic/planet effects and HUD rather than a judgeable capsule. Per the one-attempt rule, H1 did
  not recapture them.

This failure blocks the capsule half of the H2 art verdict. It is not evidence that the asset itself
is absent: the functional collector later observed it admitted/authored/visible at default and far.
It is evidence that the moving-target camera harness did not make a valid presentation frame.

## Presentation stills

Command, run **unmodified**:

```text
node scripts/capture-pq019a-acceptance.mjs
```

The script printed `PQ-019A presentation stills OK: 13 captures` and observed cue moments
`t_minus_30`, `t_minus_15`, `t_minus_5`, `away`.

### Facility evidence that survived

| Subject | Close | Default | Far |
|---|---|---|---|
| Tethys Surface Launcher | [close](heist_launcher-close.png) | [default](heist_launcher-default.png) | [far](heist_launcher-far.png) |
| Concord Lawful Catcher | [close](lawful_catcher-close.png) | [default](lawful_catcher-default.png) | [far](lawful_catcher-far.png) |
| Quiet Fence Receiver | [close](fence_receiver-close.png) | [default](fence_receiver-default.png) | [far](fence_receiver-far.png) |

Live one-voice cue: [Tethys Surface Launcher — cargo launch in 30s](launch-cue-tminus.png).

### Capsule failure evidence

- [requested close](cargo-capsule-inflight-close.png) — manifest NDC `(4.386, 6.727)`
- [requested default](cargo-capsule-inflight-default.png) — manifest NDC `(4.405, 6.753)`
- [requested far](cargo-capsule-inflight-far.png) — manifest NDC `(4.427, 6.786)`

All three say `presentationAdmission: ready`, `visibleMeshes: 1`, and a real launch distance of
`1257.5 WU`; the failure is where the camera points after the dynamic body is frozen, not whether a
capsule entity launched.

A second harness defect is recorded rather than hidden: the script writes a numeric `seed` into its
manifest but never passes it into New Game. The committed manifest copy moves that number to
`declaredSeedMetadata` and states `seedControl: NOT APPLIED`. It must not be cited as deterministic
evidence.

## Functional counts, admission and residency

Command:

```text
SF_PQ019A_COUNTS_DIR=design/program/roadmap/evidence/h1/row3-pq019a-presentation \
node scripts/capture-pq019a-presentation-counts.mjs
```

GPU: `ANGLE (Intel, Intel(R) Graphics … Direct3D11 vs_5_0 ps_5_0, D3D11)`.
Page errors: zero. Twelve samples were collected.

| Subject | Draw calls (close→far range) | Program count | Resident geometry | Resident textures | Subject geometry | Admission / authored state |
|---|---:|---:|---:|---:|---:|---|
| Launcher | 51–57 | 101 | 62 | 227 | 59,052 tris | ready + authored at all three framings |
| Catcher | 49–55 | 104–106 | 63 | 242 | 15,384 tris | ready + authored at all three framings |
| Fence | 50–61 | 108–109 | 69–71 | 284 | 56,760 tris | ready + authored at all three framings |
| Capsule | 37–39 | 113–115 | 85–89 | 288 | 3,776 tris once admitted | close pending/invisible; default+far ready/authored/visible |

Each admitted subject presented through one static-batch surface and zero instance-proxy surfaces.
These are **functional counts and booleans**, not claims about speed.

The collector's three `heist_capsule-*.png` files are diagnostic companions to the count samples,
not replacements for the failed requested presentation stills. They likewise do not provide a clean
capsule art view.

## NOT performance evidence

`presentation-counts.json` is stamped `"informational_contended": true` and deliberately contains no
timing field. Draw calls, program count, triangles, resident geometries and resident textures are
counts. Matched performance, including any p95/p99/hitch result, remains Phase H3.

## Machine-readable files

- `manifest.json` — unmodified stills harness result, with the H1 seed-control correction
- `presentation-counts.json` — count/admission samples; no timings
- `stills-run.log`, `counts-run.log` — one-attempt outputs
