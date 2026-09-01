<!-- LIFETIME: DURABLE -->
# PQ-133.01 — Combat Lab extension receipt (reconciliation)

## Outcome

The leaf was implemented on master in the CRU-002…CRU-008 commit series (see
`fd723b20` and successors); `CANONICAL_BUILD_MAP.md` §12 marks it **[DONE]**, but the queue row was
left stale at `ready` with no receipt. This receipt records the claim-time verification that closes
the row. All named deliverable files exist:

`src/core/runState.js`, `src/systems/runSession.js`, `src/contracts/combatLabSetupSchema.js`,
`src/data/combatLabSetups.js`, `src/data/combatLab.js`, `scripts/check-crucible-lab.mjs`,
`test/crucible-run-state.test.mjs`, `test/crucible-contamination.test.mjs`,
`test/combat-lab-setup-schema.test.mjs`, `test/combat-lab-same-seed.test.mjs`.

## Verification (2026-09-01, zcode-main)

- `node --test` run as child processes, exit codes honored: crucible run-state + contamination +
  setup-schema + same-seed suites — **52/52 pass**; combat-lab build-code suite — **13/13 pass**.
- `node scripts/check-crucible-lab.mjs`: **PASS** — simScenario.v1 validation, scenario compile, and
  a repeatScenario 2-arm determinism check with equal trace hashes (`ea717a79…`) and shots fired.
- No code was changed for this receipt; it reconciles queue truth with the build map.

## Verdict

PASS — row reconciled to `done`. `.02` onward were already reconciled by their own receipts.

## Next product unit

The remaining PQ-133 leaves `.07`–`.09` are SYSTEMS DONE with acceptance residuals; `.13` is
deferred research. The program's next admissible work routes through `program-dispatch`.
