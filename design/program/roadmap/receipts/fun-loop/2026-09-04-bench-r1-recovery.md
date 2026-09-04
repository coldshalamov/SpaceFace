# BENCH-R1 — PQ-173 second correction (2026-09-04)

Corrects remaining honesty holes on candidate `0d7f255152956a1ff7c4cc7bb2c1897a41fd2132` (`codex/fun-recovery-bench-20260904`). The six original defects stay fixed. This receipt is **not** a 9-cell Crucible sweep and does not claim A/B. Controller owns that run after review.

**Harness digest (this candidate):** `38cb2e8f35b9627643386f780d4544a77be084ee65ca1615e25564ae48cad733`

**Production source identity (this candidate):** `sourceIdentity.gitHead` + `gitTree` (committed gameplay tree) plus `productionDirty` / `productionDiffHash` over `src/` only. Untracked `src/` paths are hashed as a deterministic sorted sequence of **path + file bytes**; unreadable or non-file entries fail closed (`UNREADABLE`). Same untracked path with different contents yields a different identity. Receipt dirt outside `src/` does not enter the digest or the source identity. Sweeps with different production source are incompatible even when the harness digest matches.

## What this correction changes

- `mergeRunProvidedBars` never `Number()`-coerces null, undefined, string, or `unmeasured: true` rows. A provided `{ unmeasured: true, value: null, met: false, note }` stays a named nonnumeric gap (`value: null`, never `0`), keeps fed-by and note, and cannot promote the bar to true.
- If the base evaluator is already `false` or `null` because required clauses are missing, a passing numeric subset of generic provided rows cannot erase that status. A genuinely complete finite provided set with no unmeasured rows (B9) can still establish its bar when the evaluator had no values of its own.
- `worstMetric` uses the same strict raw-type/finite guard. `null` is missing, not zero. A measured `0` is still a measured zero.
- Owner markdown names an unmeasured provided clause as `unmeasured`, never as numeric `0`.

## Still true from `0d7f2551`

- Crucible remains the production runtime. Knock classification does not write entity motion.
- Hostile knocks require live event-time evidence (live cohort hostile, player-targeted intent, in-force telegraph). Missing heading fails closed. Full-contract B13 cannot pass while `jitterMeasured: false`.
- `evaluateB13` retains every Crucible feeding run. A calm sibling cannot hide a hole.
- `--scenarios` fails nonzero when an explicit selection matches nothing.
- `compareCompatibleSweeps` rejects empty sweeps, duplicates, missing hashes, harness mismatch, and production-source mismatch.
- Harness digest is a deterministic sorted list of every `scripts/lib/bench/*.mjs`, every `scripts/lib/bench/scenarios/*.mjs`, and `scripts/measure-fun-loop.mjs`. Receipt output files are not hashed.

## Loose 2026-09-04 receipts — rejected (not in this commit)

These 12 files plus the `swarm_piloted-physics_toolkit-s4242` strip were overlaid and **predate** this correction. They are not evidence of this candidate. A full 9-cell regeneration was not run here.

## Focused checks (raw)

```
node --test test/feel-bars.test.mjs test/fun-measurer.test.mjs
ℹ tests 35  ℹ pass 35  ℹ fail 0  ℹ duration_ms 26854
```

Including: provided unmeasured null never rendering numeric zero; fed-by/note retained; no tri-state promotion; strict `worstMetric` null through `evaluateBars`; untracked same-path/different-byte source identity differs; receipt-only dirt does not differ.

`git diff --check` on the exact write set: clean.

No Browser/Electron. No 9-cell sweep. Not integration or route acceptance.
