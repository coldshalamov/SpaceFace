<!-- LIFETIME: STABLE -->
# Jules directed cloud-work bank

This is a **candidate cloud-work bank**, not the PQ queue, not `INFERENCE N`, and not acceptance authority. It exists to turn spare Jules requests into bounded branches/PRs that a stronger local agent can review and selectively integrate.

## Scale

The bank deterministically expands **200 repository-specific subjects × 5 directed facets = 1,000 individually addressable tasks**, and the dispatcher renders any `JULES-0001` through `JULES-1000` as a complete cloud-agent prompt.

- 700 tasks → Gemini 3.6 Flash: tests, bounded bug hunts, lifecycle, data, and mechanical reviews.
- 300 tasks → Gemini 3.1 Pro: cross-system design, AI/flight/combat, world/economy, visual judgment, and creative expansion.
- 200 collision keys: at most one active branch per collision key by default.

## Commands

```bash
node scripts/jules-dispatch.mjs --validate
node scripts/jules-dispatch.mjs --stats
node scripts/jules-dispatch.mjs --next --model flash --count 20
node scripts/jules-dispatch.mjs --next --model pro --count 10
node scripts/jules-dispatch.mjs --id JULES-0427 --format prompt
```

A local orchestrator can dispatch 210 Flash + 90 Pro requests per day while collision-capping by subject. Use `LOCAL_INTEGRATOR_PROMPT.txt` as the local merge-review contract.

## Cloud-agent contract

Every rendered task tells Jules to:

1. start from current `master`, read root `AGENTS.md`, the nearest nested `AGENTS.md`, `docs/MODULE_MAP.md`, and the exact target files;
2. verify the named owner is still live before editing;
3. keep the change inside one task and one collision domain;
4. characterize/reproduce before changing production when the task is investigative;
5. use `state.rng` / `state.simTime` for simulation, preserve single writers, save/Continue, Browser/Electron parity, accessibility, and authored quality;
6. never edit `CANONICAL_BUILD_MAP.md`, `design/program/roadmap/program-queue.json`, `design/program/NOW.md`, this Jules bank, or `test/*.expected.json`;
7. never solve performance by lowering default quality or content density;
8. run the narrowest direct proof once, then one relevant existing check;
9. return `PR_READY`, `NO_CHANGE`, or `BLOCKED` honestly. `NO_CHANGE` is success when the suspected gap is already covered or the proposed change loses an A/B;
10. open at most one coherent PR and report base SHA, files changed, proof, residual risk, and why a stronger local integrator should merge or reject it.

## Lanes

| Lane | Tasks | Typical use |
|---|---:|---|
| `test-hardening` | 170 | focused behavior tests and adversarial invariants |
| `bug-hunt` | 150 | bounded reproduction + surgical repair |
| `determinism-save` | 90 | replay, save, migration, transition ownership |
| `performance-lifecycle` | 90 | measurement, allocation, residency, disposal |
| `ui-ux-accessibility` | 100 | information, input, responsive/a11y, screen lifecycle |
| `ai-combat-flight` | 100 | V3/tactical/physics intentionality and feel |
| `world-economy-missions-mining` | 100 | living world, missions, economy, mining, persistence |
| `render-assets-vfx-audio` | 80 | asset integrity, visual continuity, cues, same-picture perf |
| `tooling-data-docs` | 70 | checks that can fail, registry/manifest truth, diagnostics |
| `creative-expansion` | 50 | small missions, encounters, occupations, places, aftermath |

## Local integration

Jules output is advisory until the local integrator verifies it against current master. Review the full diff, reject scope creep and duplicate authority, rebase, run focused proof, and merge only independent value. A cloud PR may be useful even when rejected: retain a reproducible bug report or test idea, then close it.
