<!-- LIFETIME: DURABLE -->
# What this change establishes

Date: 2026-10-27. Repository: `coldshalamov/SpaceFace`.

Original source audit: `42d57a248209c9f5a7354e65817c0f7b8f5dbcec`.
Integration parent: `985cb3108552af0af785afaa41730122eaefd902`.
The later parent preserves the Eris Sweep Window and Gravedigger changes that landed during
writing. A targeted source review incorporated their existing ownership into LW-13.

## Delivered boundary

This change delivers a creative/technical implementation pack and a working read-only authoring
tool. It does not register runtime districts, alter ordinary game routes, raise actor budgets,
add a save owner, generate the new models, or implement the described military/interior/campaign
experiences. LW-00 is the one implemented authoring packet; the other 18 packets remain planned.

The authored package contains eight districts, 24 routines, 24 opportunities, 15 proposed model
identities, 23 art component families, and 19 implementation packets. These counts describe the
specification. They are not accepted gameplay counts or a claim of production-scale quality.

## Verification performed

| Check | Observed result | What it supports |
|---|---|---|
| `node test/living-world-plan.test.mjs` | 20 tests passed, zero failed/skipped | Schema/reference validation, dependency handling, failure diagnostics, safe path reading, complete briefs and read-only CLI behavior |
| `node --check scripts/living-world.mjs` and `node --check scripts/lib/livingWorldPlan.mjs` | Both passed | JavaScript syntax |
| `node scripts/living-world.mjs --validate --json` | `ok: true`; 8 districts, 24 routines, 24 opportunities, 19 tasks, 1 implemented authoring task | Authored structure, canonical sector/zone references, existing owner/source/packet paths and valid dependency graphs |
| `node scripts/living-world.mjs --next --json` | LW-A1, LW-A2, LW-A3, LW-A4 | Manifest dependencies only; no task is claimed or launched |
| JSON brief reading for every district and task | All eight district briefs and all 19 task packets read successfully | Complete readable machine/human handoff content is present |
| Scoped relative-link check across the new Markdown package | 208 relative links across 27 files resolved | The package's local reading paths exist |
| Opportunity-to-packet completion crosscheck | All 24 opportunity IDs appear in exactly one task's completion checks | None of the indexed local stories lacks a named completion owner |
| `git diff --check` across the 34 changed files | Passed after removing a trailing blank line | Patch whitespace only |

LW-01 can be implemented concurrently against the civic-art contract, but its completion now
depends on A1 because its promised visible human/EVA work uses the shared OR-A23 assembly kit.
The art packets finish at measured asset readiness and representative native integration; full
ordinary-route acceptance belongs to the numbered gameplay packet. This avoids a dependency loop.

The focused tests exercise malformed documents, missing geography/owners/packets, unsafe paths
and escaping symlinks, duplicate identities, unbound resources, dependency cycles, population
envelopes, legal resource recycling, incomplete opportunities, and misleading runtime status.
Reused asset IDs may be shared across districts; opportunity IDs must remain globally unique.
The validator checks that a reused asset's declared source file exists. It does not claim that a
GLB has been produced, registered, rendered correctly, or accepted in the game.

## Independent integration review and resulting corrections

Story, systems and environment reviewers worked against the same source and reviewed the final
cross-document handoff. The following concrete corrections were incorporated:

* Preserve the canonical dark 25th Candle Fleet plinth; the restored family lamp is separate.
* Keep the Dione Lane Relay separate from the military/customs district and the Phoebe Shard
  Sphere separate from the Fourth Toll bell. Preserve the Wreck Cathedral and Iron Maw save IDs.
* Make A1 responsible for the shared human-work kit and require that dependency for Ward completion.
* Give every one of the 24 opportunities an explicit completing packet, including the Dione
  split: LW-04 owns Target Practice/Last Bus; LW-05 owns Borrowed Authority and continued custody.
* Include actual law and spawn-admission owners in the finite-garrison packet; reserve inventory
  is not extra active bodies outside the current shared budget.
* Distinguish curated one-shot lived scenes from the existing repeating ambient-scene branch.
* Require existing resource/routine/reuse-source paths and reject cross-district opportunity-ID
  collisions. Verify that a valid source reference does not overstate asset or gameplay acceptance.
* Tailor LW-00 completion to authoring commands rather than inheriting a gameplay completion claim.
* Extend the newly landed Eris/Gravedigger owners rather than commissioning parallel mission or
  persistence systems.

The source review also matched all 13 distinct reused model IDs in `districts.json` to their
declared everyday-space source catalog. This is an identity/source check, not visual acceptance.

## Existing program-document checker limitation

`node scripts/check-program-docs.mjs` remains failing in the intentionally sparse checkout:
125 errors and one warning. The errors comprise 121 absent relative-link targets, three missing
required files, and one unavailable historical `baseCommit`; the warning is the existing NOW
header's age. The sparse checkout deliberately omitted large unrelated trees and binary assets.

A temporary baseline restored the two original routing documents (`build_map.md` and
`design/program/README.md`) from the audit commit and omitted this new package. All other sparse
files and read-only Git metadata were shared. The baseline, a current temporary snapshot and
the actual checkout produced **identical diagnostic sets**: zero added or removed errors or
warnings. No `--allow-no-git` bypass was used. The checker and routing files were unchanged by
the intervening upstream commits.

This establishes that the new routing introduces no additional checker diagnostics in this
checkout. It does not establish a full-checkout PASS. The existing documents were not rewritten
to conceal missing checkout content or manufacture a green gate.

## Claims deliberately left for implementation

No browser playthrough, new-model render, interior flight, GPU residency benchmark, combat soak,
save migration, or full game CI acceptance is claimed here. The new source is authoring tooling,
so such results would not demonstrate the proposed world anyway. Physical scale and population
figures in the plan are measured-trial proposals, not measured performance findings.

The implementation packets name the actual public-route, negative-case, visual, persistence and
performance evidence needed for their own outcomes. A local agent should build and verify those
outcomes, preserve intervening work, and update only the status that its evidence supports.
