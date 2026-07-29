# H1 row 5 — PQ-020 Ceres functional route

**Overall result: FAIL — HARNESS (partial functional evidence survives).**

The one permitted Browser acceptance attempt was consumed through the registered broker manifest:

```text
node scripts/validation-broker-cli.mjs --manifest pq020-ceres-topology
```

The broker issued one claim at fixed seed `47`, launched one owned headed Browser process, and did not
time out. It recorded one Browser launch and zero Electron launches. Per the one-attempt rule, the
Browser route was not retried; the Electron parity entry correctly refused to launch because the
Browser receipt was not `PASS`.

## Exact failure and why it is HARNESS

The public route successfully selected **Ceres Belt** from **Helios Prime**, charged the production
jump, entered Ceres, and returned to `jump.state: IDLE`. The route then evaluated two endpoint
assertions in order:

1. the Ceres arrival must be closest to the gate back to the source endpoint — **passed** for Helios;
2. that source gate must also be at most `300 WU` away — **failed** at `429.564 WU`.

The saved stack identifies the second assertion:

```text
[pq020-ceres-topology] FAIL in helios-to-ceres-jump
  - Ceres entry from sector_helios_prime landed 429.564 WU from its endpoint gate

at assertEndpointApproach (scripts/lib/pq020CeresFunctionalRoute.mjs:671)
```

The `300 WU` ceiling was invented by the H1 harness. Neither the packet nor the production owner
specifies that absolute tolerance. `world._entryPointFor()` promises an arrival “near the gate back to
where we came from, facing inward”; source-direction identity is the observable contract.

Geometry reconstructed from the recorded entry point and the committed Ceres gate positions:

| Endpoint gate | Global position | Distance from recorded entry |
|---|---:|---:|
| back to Helios Prime | `(-9422, 6282)` | `429.564 WU` |
| back to Tethys Junction | `(-8844, 8192)` | `1573.512 WU` |

The valid source-side relation therefore held by a wide margin. The harness rejected it only because
of its unsupported absolute threshold. This is **HARNESS**, not PRODUCT or ENVIRONMENT.

This classification does not upgrade the rest of the route. It says the one attempt stopped on a
false-negative assertion before those claims were exercised.

## Functional evidence that survived

- New Game used fixed seed `47`.
- The visible Star Chart selected **Ceres Belt** while **Helios Prime** was the current sector.
- Production trace:
  - tick `126`: `jump:chargeStart`, target Ceres, `via: gate`;
  - tick `307`: `jump:start`, Helios → Ceres;
  - tick `379`: `sector:enter`, Ceres at the recorded source-specific entry point;
  - tick `379`: `jump:arrive`, not interdicted, zero ambushes.
- At classification time the player was alive at `140` hull and the jump state was `IDLE`.
- Ceres materialized exactly one Throughline Weigh Beacon entity.
- Ceres materialized exactly fifteen Wreck Cathedral World Site entities.
- `pageIssues` was empty.

Reviewable frames:

- [public Helios → Ceres Star Chart selection](01-helios-to-ceres-map.png)
- [post-arrival failure frame in Ceres](failure-row5.png)

The first frame proves the public selection context. The second is a failure diagnostic, not a
Cathedral or pocket-distinctness art frame.

## Claims left unproven by the stopped attempt

- Ceres Refinery selection and natural autopilot travel;
- Belt Outpost selection and natural autopilot travel;
- Throughline Weigh Beacon selection and natural autopilot travel;
- Wreck Cathedral selection and natural approach;
- Cathedral far/default/close/arrival presentation stills;
- F5 save, canonical reload, visible Continue, and pose/content restoration;
- repeated beacon and Cathedral selections after Continue;
- Ceres → Tethys → Ceres source-direction proof;
- Electron functional parity;
- H2 pocket-distinctness and Cathedral-presence verdicts.

H2 must therefore **defer** Decision 4 rather than infer an art verdict from these diagnostic frames.

## Deterministic preflight and broker boundary

Before the one-use claim was issued, all declared fast gates passed:

- `npm run check:pq020:proofs` — 14/14;
- `npm run check:pq020:ceres-topology` — PASS;
- `npm run check:sim:compare` — deterministic, `hashEqual: true`, no divergent tick;
- `node --test test/pq020-ceres-topology-manifest.test.mjs` — 13/13.

The candidate digest is
`0de1ed5ca1a348ed95c786ec0f217551508e10b5d79dd790f2a9b9684936da5b`; `launch-counts.json`
binds it to exactly one acceptance launch. No retry was attempted.

## NOT performance evidence

This row makes no speed, frame-time, percentile, hitch, or representative-performance claim.
`route-receipt.json` preserves a production `save:completed` event whose payload incidentally contains
timing diagnostics, and `latest-run-result.json` preserves broker process-duration metadata. Both
committed copies are stamped `"informational_contended": true`; every time-valued field is excluded
from H1 evidence. Matched performance remains Phase H3.

## Machine-readable files

- `classification.json` — H1 classification, source-gate geometry, and claim boundary;
- `route-receipt.json` — raw functional failure receipt, with incidental timings marked contended;
- `fast-gate.json` — broker fast-gate digest receipt;
- `launch-counts.json` — one-use candidate launch record;
- `latest-acceptance-failure.json` — broker failure fingerprint;
- `latest-run-result.json` — owned process record, with timing metadata marked contended;
- `broker-run.log` — exact terminal summary from the one attempt.
