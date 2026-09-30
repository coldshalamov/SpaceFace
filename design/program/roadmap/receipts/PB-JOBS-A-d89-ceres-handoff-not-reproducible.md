# PB-JOBS-A — SF-076+089 Ceres handoff: D89 not reproducible at this tree (build_map §1C row 73)

Row: **73 · PB-JOBS-A · "SF-076+089 Ceres handoff: reproduce D89 drop scenario, then repair
first missing real transition + stale-pin audit" · PB**. Packets: SF-076 (conditional repair,
basis D89) + SF-089 (deepening). TRIAGE_2026-09-28 verdicts: both **CHECK** (jobs domain row:
"CHECK 3 (076, 077, 089)"). The row rule governs: reproduce the D89 drop scenario BEFORE
building; if the bug is not there, close the packet as not-reproducible with the evidence.

**Verdict: D89 is NOT reproducible at the current tree. The full miner→handoff→loaded
approach→refinery chain works, organically, in under 150 s. The packet closes.** No production
code was changed. One adjacent check the row ran caught a separate, pre-existing law conflict
(4 stale assertions in `test/world-reacts-civilians.test.mjs`); reconciled under the current
civilian-variety law — details below.

## Liveness ruling (traffic.js adoptability)

`node scripts/check-now-liveness.mjs` (exit 0): no LIVE row names traffic.js. The boards-3x3
lane is absent from the live list entirely (stale-adoptable, as the row notes). The only LIVE
rows are NXB-053, NXB-022 (unrelated files) and this workflow. The tree's `traffic.js` dirt is
the Tethys Customs Gate cast (matched by new `test/tethys-gate-runner.test.mjs`, a different
lane) and `npcJobsRuntime.js` dirt is INF-WF01 crew-response work — both foreign, both left
untouched and disjoint.

## The D89 boundary, and the reproduction that refutes it

D89 claims (deep-dive `02-ceres-custody.md:7`): "no loaded authored hauler reaching the
approach within the scenario window, and explicitly excludes ambientPredation eligibility for
the designated slot."

Reproduction harness: the live scenario in `test/pq-138-05-evidence-ledger.test.mjs:741` —
deterministic (seed 13805, production profile, `nodeSafeOnly`), production
`createAuthoritativeRuntime`, up to 600 sim-seconds, **no phase/position/manifest injection**
(its own comment: "The time bound is only a scenario timeout"). Result, run 2026-09-29:

```
PQ-138.05 live seed=13805 incidentTick=8862 simTime=147.700 cargo=8
  handoff=ceres-miner-hauler:wr_convoy_715aab8e:fm_c55ad6ca
✔ live world: one loaded Ceres approach kill leaves five traces and the packet guard
  decides hard re-entry (97039.8018ms)  — 2/2 pass, exit 0
```

The authored hauler crossed into `zone_ceres_refinery` at **t=147.7 s** (window: 600 s)
carrying **8 u of real mined cargo** with `custody.acquiredBy === 'traffic:ceresMinerHaulerHandoff'`
and a real handoff id — the exact state D89 says never arrives. The predation exclusion D89
demands is present at `src/ai/ambientPredation.js:1011`
(`if (data.activityActorSlotId != null || ...) return false;`).

Every earlier stage of the chain is separately pinned green:
- Miner work → request → rendezvous → transfer: `test/ceres-causal-chain.test.mjs`
  (transfer enters the existing refinery arrival owner, `:618-630`; delivered state with
  `deliveredQty 8`, `:704-705`).
- Save/restore continuity of the same handoff to `delivered` (`:802-813`).
- The whole SF-076 packet command passes: 39/39 across
  `ceres-activity-traffic-cast` + `traffic-miner-field-locality` + `pq-138-05-evidence-ledger`.

There is no first-missing-transition to repair: the earliest stages are all observed live.

## SF-089 gate: equivalent feature already on the ordinary route

SF-089's own gate ("compare the current ordinary route; if an equivalent already works, close
as already satisfied") holds:
- `test/npc-jobs-runtime-wiring.test.mjs` — save/restore preserves the job and re-links on
  re-entry (`:277`); "a miner loop survives exit → away → re-entry, advanced virtually, never
  reset" (`:313`); single-writer yield for jobbed hulls (`:371`).
- `test/presence-repairs.test.mjs` — dead hulls stop moving (`:225`).
- The live pq-138.05 scenario — after the kill and a hard re-enter, the refinery approach
  stays at 0 haulers (no ghost refill) and exactly one wreck rematerializes.

### Stale-pin audit (bounded, no new work)

Pins are job-owned and anchor-scoped in `src/systems/npcJobsRuntime.js`:
stamped only on eligible traffic-role workers, skipping anchored hulls
(`stampJobOwnedPersistence`, `:678-684`); released once job fields are gone
(`releaseJobOwnedPersistence`, `:703`); enforced by a central sweep so end-paths outside
release() (sector despawn, convoy-cap refusal, restore-adopt) still drop dead marks
(`_sweepJobOwnedPersistence`, `:2754`), with mid-job hulls protected via their live
worldRecordId entry; refused-attach leak guards at `:2392` (refused assign unpins the
latch), `:2591` (unpin before the anchor check), `:2698` (refused create would otherwise pin
the latch forever); world-record permanence pinned through the world owner's public hook
(`pinWorldRecordForJob`, `:688`). **No pin writer found that outlives its job; nothing to fix.**

## The caught failure: 4 stale assertions, reconciled to the current law

`test/world-reacts-civilians.test.mjs` (a named SF-089 starting point) failed 4 of 13 at
HEAD. Pristine-overlay attribution (HEAD content of `traffic.js` + `npcJobsRuntime.js`
overlaid, same 4 failures, byte-exact restore) proved the failures pre-exist on master —
not caused by the in-flight foreign hunks.

Cause: commit `7ef8a38ff` (2026-09-19, "traffic: civilian behavioral variety by hull class
and role") deliberately changed the miner's violence reaction — miners now flee
(`flee_alarmed`/`flee_with_load`, boosting) — and landed its own dedicated passing suite
(`test/civilian-traffic-behavior-variety.test.mjs`, 9/9) pinning a loaded victim-miner at
`boost: true` (`:222-226`) without updating the older PQ-138.02 assertions. The two suites
pinned contradictory laws; the newer owner-landed law wins. Reconciled the 4 stale tests to
the current law (each keeps its surviving unique pin: victimhood exempts no one; the miner's
reaction is role-driven; a towing hull keeps its load; traffic never writes intent for a
jobbed hull): file now 13/13. No production code changed — reverting the variety behavior to
the old law would have undone `7ef8a38ff` and broken its suite.

## Checks run (real exit codes, this sitting)

| command | exit | result |
|---|---|---|
| `node scripts/check-now-liveness.mjs` | 0 | no live claim on any verified path; boards-3x3 absent from live list |
| `node --test --test-name-pattern="live world" test/pq-138-05-evidence-ledger.test.mjs` | 0 | 2/2 — the D89 refutation; hauler arrives t=147.7 s, 8 u real cargo |
| `node --test test/ceres-activity-traffic-cast.test.mjs test/traffic-miner-field-locality.test.mjs test/pq-138-05-evidence-ledger.test.mjs` (SF-076 packet command, full files) | 0 | 39/39 |
| `node --test test/world-reacts-civilians.test.mjs test/npc-jobs-runtime-wiring.test.mjs test/presence-repairs.test.mjs` (SF-089 packet command) | 1 → 0 | before: 40/44 (the 4 stale assertions — the caught failure); after reconciliation: 44/44 |
| HEAD overlay of `traffic.js` + `npcJobsRuntime.js`, same civilians file | 1 | identical 4 failures at pristine HEAD → pre-existing on master; restore verified byte-exact (`cmp`) |
| `node --test test/world-reacts-civilians.test.mjs` | 0 | 13/13 after reconciliation |
| `node --test test/civilian-traffic-behavior-variety.test.mjs` | 0 | 9/9 — the newer law's own suite still green |
| `node --test test/inference-miner-shift.test.mjs test/traffic-rescue-craft.test.mjs` | 0 | 4/4 — other suites touching the alarm law, no stale pins there |

Not run: `check:baseline`, `check-ci-report` (workflow gates after this row), broad `check:all`.

## Files

- `test/world-reacts-civilians.test.mjs` — 4 stale assertions reconciled to the current
  civilian-variety law (only file changed; no production code).
- This receipt.

## Disposition

SF-076: **not reproducible at current HEAD** — the repair it conditions on has nothing to
repair; the ordinary-route outcome (a real loaded hauler reaches the refinery approach) is
observed live and deterministic. SF-089: **already satisfied** on the ordinary route
(equivalent-feature gate passes; pin audit clean). Per the packet's own finish rule: "When the
premise is already satisfied, say so rather than manufacturing work."
