<!-- LIFETIME: STABLE -->
# Jules directed cloud-work bank

This is a **candidate cloud-work bank**, not the PQ queue, not `INFERENCE N`, and not acceptance authority. It exists to turn spare Jules requests into bounded branches/PRs that a stronger local agent can review and selectively integrate.

## Scale

The dispatcher deterministically discovers 200 live repository subjects and expands each through five distinct directed facets: **200 × 5 = 1,000 tasks**, `JULES-0001` through `JULES-1000`.

- 700 tasks → Gemini 3.6 Flash: focused tests, bounded bug hunts, lifecycle, failure-path and mechanical correctness work.
- 300 tasks → Gemini 3.1 Pro: later-file subjects biased toward UI/render/world/data plus integration and creative judgment.
- one collision key per subject, so a local dispatcher can avoid spraying several agents at one owner.

The bank is generated from current repository files rather than frozen plan prose, so task subjects naturally move with the codebase while task IDs remain deterministic for a given tree.

## Commands

```bash
node scripts/jules-dispatch.mjs --validate
node scripts/jules-dispatch.mjs --stats
node scripts/jules-dispatch.mjs --next --model flash --count 20
node scripts/jules-dispatch.mjs --next --model pro --count 10
node scripts/jules-dispatch.mjs --id JULES-0427 --format prompt
node scripts/jules-dispatch.mjs --list > /tmp/jules-1000.txt
```

Use `LOCAL_INTEGRATOR_PROMPT.txt` as the local merge-review contract.

## Cloud-agent contract

Every rendered task tells Jules to:

1. start from current `master`, read root `AGENTS.md`, the nearest nested `AGENTS.md`, `docs/MODULE_MAP.md`, and the exact target file;
2. verify the named file still participates in the live route before mutation;
3. keep the change inside one task and one collision domain;
4. characterize/reproduce before changing production when investigative;
5. preserve `state.rng` / `state.simTime`, single writers, save/Continue, Browser/Electron parity, accessibility, and authored quality;
6. never edit `CANONICAL_BUILD_MAP.md`, `design/program/roadmap/program-queue.json`, `design/program/NOW.md`, this Jules bank, or `test/*.expected.json`;
7. never solve performance by lowering default quality or content density;
8. run the narrowest direct proof once, then one relevant existing check;
9. return `PR_READY`, `NO_CHANGE`, or `BLOCKED` honestly;
10. open at most one coherent PR and report base SHA, files changed, proof, residual risk, and why a stronger local integrator should merge or reject it.

`NO_CHANGE` is signal, not failure. It prevents a weaker model from inventing defects or ornamental edits merely because the assignment arrived in PR-shaped clothing.

## Five directed facets per subject

1. **Contract regression** — add/strengthen one behavior-level deterministic test that can actually fail.
2. **Bounded bug hunt** — reproduce one concrete defect in the subject and repair only if demonstrated.
3. **Lifecycle/re-entry** — init/use/dispose/reinit, repeated route entry, stale handles, duplicate subscriptions, leaks.
4. **Failure/edge state** — malformed, missing, stale, duplicated, out-of-order, boundary or interrupted state.
5. **Improvement slice** — make one small player/architecture improvement through the existing owner, with no parallel framework.

## Local integration

Jules output is advisory until the local integrator verifies it against current master. Review the full diff, reject scope creep and duplicate authority, rebase, run focused proof, and merge only independent value. A cloud PR can still be useful when rejected: retain the reproducible finding or test idea, then close it.

The useful throughput metric is **merged independent value per local-review minute**, not PR count. Start with 20–40 tasks, measure merge yield by lane/model, then ramp toward the available daily quota.
