<!-- LIFETIME: RECEIPT -->
# PQ-173.04 — The critic's verdict: blockers, intent result, play judgment

```text
DONE  PQ-173.04 — the critic no longer passes a run by counting yeses: one hard stop fails it, the pictures say whether the claimed improvement showed up, and the owner page prints what you can now perceive, decide and execute.

WHAT I FOUND     A checklist of nine good answers was being treated as the verdict, so a glowing stand-in with nine yeses would have shipped.

WHAT I CHANGED   The critic now answers seven hard stops, whether the pictures show the claimed improvement, and five sentences of play judgment. Nine yeses with one hard stop fail. The owner page prints those three parts in plain words. The written law is generated from the same list the tool enforces.

WHAT YOU WILL FEEL   Nothing in the cockpit changes. What changes is the weekly page: it will no longer say a pass "worked" just because enough boxes were ticked, and it will say the hard stop in ordinary words when one is there.

THE NUMBERS      bar | before | after | target
                 a well-formed verdict with one hard stop and nine good answers | would pass on a yes-count | fails | fail
                 owner page still six sections, jargon lint | pass | pass | pass

THE FRAMES       none — this unit is the judge, not a feel change

NEXT             PQ-189.00 the control contract, generated from the bindings
```

## Engineering appendix

The dirty critic tree was half-done: rubric, prompt, validation, CLI print, and the generate script existed; tests still imported the old yes-count API (`PASS_THRESHOLD` / `computePassCount` / `isPass`) and crashed on load; `FUN_CONVERGENCE_LOOP.md` §3.3 was handwritten and had no generation markers; the owner report still said "counted N of 9 good signs, so they thought it worked" from a leftover `passCount` field.

| Piece | What landed |
|---|---|
| `scripts/lib/critic/rubric.mjs` | seven blockers, intent fields, judgment fields, `computeCoverage`, `decideVerdict`, generated §3.3 |
| `scripts/lib/critic/validation.mjs` | fail-closed three-part document (`spaceface.funCritic.v2`); missing blockers reject |
| `scripts/critic-fun-loop.mjs` | prints BLOCKERS / INTENT RESULT / PLAY JUDGMENT |
| `scripts/lib/report/render.mjs` | THE FRAMES renders coverage as coverage, then the three parts in owner words |
| `scripts/generate-critic-rubric-doc.mjs` | writes §3.3 from the rubric; tests refuse drift |
| `test/fun-critic.test.mjs` | one-blocker-plus-nines-yeses fails; missing blockers reject; §3.3 matches |

Polarity is `blocked: true` means blocked, always. A raised `frame` blocker without a shown frame is refused. A claim is judged only when `--intent` declared one.

The owner page (`scripts/report-fun-loop.mjs`) accepts both `spaceface.funCritic.v1` and `.v2`, so a real cycle that emits the new document can still render. THE FRAMES names a raised hard stop in `BLOCKERS[].ownerWords`, never the engineering id.

## Checks

| Check | Result |
|---|---|
| `node --test test/fun-critic.test.mjs test/fun-report.test.mjs` | 54 pass, 2026-09-06 |
| `node scripts/generate-critic-rubric-doc.mjs --check` | matches |
| review | [Review](af3884a8-64cf-48ec-af86-9e8616f1a723) APPROVE |
