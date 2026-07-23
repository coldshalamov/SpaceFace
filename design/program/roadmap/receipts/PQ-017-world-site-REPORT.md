# PQ-017 Persistent World Site — integration receipt

```yaml
packet: PQ-017
canonical: A15
alias: SF-19
base_commit: 7c873c63
result_commit: 2a9517d8
state_reached: INTEGRATED
route_status: exercised-no-final-artifact
next_packet: PQ-018
```

## Integrated outcome

Commit `2a9517d8` integrates the reusable World Site manifest, deterministic component/operation
kernel, runtime materialization, `asteroidSites` persistence ownership, save normalization, physical
payload and receiver delivery, impact failure/recovery, exact asset/socket presentation, map History,
traffic, accessible controls, and the shared Browser/Electron route source.

The same commit closes the ordinary Massline regression. `tether_standard` has a 10x physical
envelope and ordinary endpoints cannot automatically sever it through thrust, boost, slack catches,
reversals, or normal ship/asteroid maneuvers. Manual/subsystem cuts remain. Only an explicitly
authored `extreme_overload` endpoint can opt into future station/singularity-scale breakage.

## Final proof

| Check | Result |
|---|---|
| World Site, persistence, presentation, world-record, and normal Massline focused set | **81/81 pass** |
| Public-route contract | **67/67 pass** |
| Closed-loop public-control simulation | **23/23 pass** |
| `npm run check:sg02:tether-resilience` | pass |
| `npm run check:sg06:tether-resilience` | pass |
| `npm run check:sim:compare` | `ok:true`, deterministic, `hashEqual:true` |
| Final independent control review | **APPROVE** |
| Intended staged diff check | pass |

No full `npm run check` or further Browser/Electron run was performed during closeout.

## Player-route evidence boundary

The headed Browser route reached the authored site, completed four operation phases, and entered the
Massline phase without ordinary line breakage. The final acceptance attempt then failed inside the
driver, not gameplay: it measured from a pre-action snapshot until after sequentially releasing ten
possible control keys and collecting another snapshot. That cleanup latency produced false 9-, 20-,
and 12-tick active-hold readings.

The driver now records token-bound exact-code keydown and keyup receipts, measures active duration as
`keyup.tick - keydown.tick`, audits pre-keydown and post-keyup drift separately, and fails closed if
the keydown state no longer matches the authorized geometry. Deterministic tests cover missing,
duplicate, mismatched, stale, and nonfinite receipts.

No new final Browser/Electron evidence directory is claimed. A future evidence refresh may exercise
the corrected route once for current media/performance numbers, but that is not a reason to reopen
PQ-017 or block PQ-018.

## Why the work looped, and the prevention

The expensive route probe was incorrectly used as the debugger. Each late failure was treated as a
new control edge case, while the measurement boundary itself was not audited. Feature completion was
therefore held hostage by a validator that counted its own cleanup work.

The repository now enforces the corrective workflow:

- expensive Browser/Electron probes are acceptance surfaces, not iterative debuggers;
- a new failure family must first become a deterministic fixed-tick regression at the owning seam;
- the probe iteration guard binds a single-use receipt to source digests and the stable failure
  fingerprint, so unchanged regressions cannot authorize another expensive attempt;
- active input, pre-input drift, and post-input cleanup are measured as separate intervals.

PQ-017 is checked off. PQ-018 is unblocked and is the next queue item, but it was not started in this
closeout.
