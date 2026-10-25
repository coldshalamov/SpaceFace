# Integrating and using this planning package

## Scope and exact source

Repository: `coldshalamov/SpaceFace`.

Audit/parent baseline: `8491f7ae7462b61bd6cb34c88fd3453c0c382e5e`.

Destination: `design/combat-convergence/`.

This is a planning-only change. It adds Markdown documents and does not change gameplay code, assets, dependencies, schemas, saves, CI, build settings, existing agent instructions, or current task claims. It does not implement the new shield, repair AI, improve frame rates, or certify visuals. It does not launch agents or paid sessions.

## File manifest

| File | Purpose |
|---|---|
| `README.md` | Product outcome, document map, full owner-requirement coverage |
| `00_EVIDENCE_AND_DECISIONS.md` | Pinned source evidence, known existing machinery, unknowns, overlap decisions |
| `01_ARSENAL_AND_INPUT.md` | Discoverability, symbols, effective descriptions, controls, teaching |
| `02_COMBAT_READABILITY_AND_TARGETING.md` | Living contacts, targeting truth, manual aim, threat hierarchy |
| `03_FLIGHT_AI_AND_SWARM_CHOREOGRAPHY.md` | Stable control, moving formations, disruption, role/pacing |
| `04_STEALTH_ATTENTION_AND_RAIDING.md` | Observer awareness, concealment, conditional attacks, no-kill theft |
| `05_TELEKINESIS_AND_COMPOSITION.md` | Existing well/Gyre maturation, physical gather/launch, deployed collector |
| `06_LINKED_SHIELD_PYLONS.md` | Selective two-endpoint shields, collision/query matrix, counterplay |
| `07_RESPONSIVE_BATTLEFIELDS.md` | Material/interaction grammar, purposeful places, durable aftermath |
| `08_DAMAGE_DESTRUCTION_AND_LOOK.md` | Hit/incapacity/death, cinematic physical consequences, lighting/readability |
| `09_PERFORMANCE_AND_LIFECYCLES.md` | Existing budgets, profiling, quality-preserving optimization, cleanup/save |
| `10_REFERENCE_ENCOUNTERS_AND_ACCEPTANCE.md` | Six shared reference encounters and evidence ladder |
| `11_AGENT_ORCHESTRATION.md` | Dependencies, specialist assignments, shared-owner coordination, copyable briefs |
| `12_RESEARCH_TASKS_AND_SOURCES.md` | Six bounded research commissions and primary references |
| `INTEGRATION.md` | This manifest, routing, installation, and safe activation instructions |

## Through the planning PR

Review the diff as a design package. The expected change set is exactly the fifteen Markdown files above, all under the new folder. No existing root or shared-owner file should be replaced by an older snapshot. The PR's base and final commit identify the actual delivered tree; this document identifies the source inspected during authorship.

Before future implementation, fetch current repository state and read its instructions. Refresh the relevant evidence anchors; the repo is changing rapidly and comments, aliases, feature flags, and active PRs may have moved. Do not treat any unmerged PR, older handoff, or this package's proposal as shipped behavior.

Merge/acceptance of this planning PR is separate from implementation acceptance. The user asked for plans, so this package does not silently activate every workstream or reserve paths. The implementing lead selects bounded assignments through the existing program front door.

## Routing into the existing plan system

Use `design/PLAN_REGISTRY.md`, `build_map.md`, and the current `design/program/` dispatch/status owners. This folder is a detailed owner-requested design source, not another queue or global status ledger.

A maintainer activating the package can add this narrowly scoped family-level registry row, adapting table context without rewriting the rest of the file:

```markdown
| [combat-convergence/](./combat-convergence/README.md) | Owner-requested combat experience convergence: arsenal clarity, targeting, stable swarm AI, stealth raiding, physical manipulation, paired shields, responsive environments, destruction, and performance | PLANNING SOURCE — implementation enters through existing admitted program leaves | Existing program/packet owners; current source and player-route evidence decide completion |
```

Map the individual outcomes to current owners before creating any new IDs. Existing relevant families include arsenal experience, physical-play grammar/build plan, Crucible/Survival, unified presentation, ORRERY/HUD, Look/NOCTURNE, current AI/flight work, and the performance program. The audit found historical/current references such as PQ-133 and PQ-023, but exact active leaf identity and ownership must be resolved from the current program rather than hardcoded here.

If the current workflow requires a dispatch entry, register the smallest executable outcome and its actual evidence route. Do not add an entire new global backlog mirroring these documents. Keep global progress in `design/program/`; update only the admitted task and its affected roll-ups there.

## Suggested first executable assignment

Read README, 00, 01, 02, the relevant portion of 03, and CEC-A/B in 10. Trace and improve one ordinary-player route that exposes the actual current kit, makes the effective gun target obvious while preserving manual aim, and shows a small enemy group moving stably. Obtain the performance baseline in parallel. This creates an immediately reviewable reference for later physics, stealth, shield, and destruction work.

Run R01/R02/R05 only where their unresolved questions affect that slice. R03/R04 can proceed as disjoint research while the initial convergence is being built. Do not wait for every research commission to finish before fixing a directly observed missing glyph or contradictory control label.

Copyable lead/worker/research/reviewer briefs are in 11. Their bracketed fields must be filled with the actual candidate identity, exact write paths, and bounded outcome; they are not permission for unlimited scope.

## ZIP fallback installation

If this package is delivered as an archive rather than a usable PR, it should preserve the repository-relative `design/combat-convergence/` structure. Inspect the archive file listing before extraction. Copy only those Markdown files into the intended repository; do not replace the repository, copy a stale source tree, or import unrelated hidden files.

Inspect current status and any existing destination first. If another agent has already created or modified this folder, compare the content and merge additively; do not overwrite it wholesale. Preserve foreign dirty/untracked work and follow the current repository's checkout/branch rules. Do not use destructive reset/clean/stash operations to make installation convenient.

Stage and commit only the explicit new/merged paths in this manifest. Inspect the final commit stat before pushing or opening the requested planning PR. No game-source deletion or unrelated file change belongs in this package. The source baseline is provenance, not a command to reset the user's working repository to that revision.

## Documentation verification

Verify that all fifteen files are present; local Markdown links resolve; document IDs, evidence IDs, research IDs R01–R06, and scenario IDs CEC-A–F agree; and the README coverage includes every part of the owner's request. Verify that source-present claims have pinned evidence, proposals are marked as proposals, and no test result or performance improvement is claimed from this planning-only work.

Review particular cross-system consistency points: manual aim versus selected/effective gun targets; cloak commit versus firing reveal; per-observer attention versus wanted heat; passive mass accounting versus powered launch; shield relation versus damage provenance; living incapacitation versus irreversible death; and cosmetic descent versus authoritative collision geometry.

Documentation checks are not gameplay tests. When implementation begins, use the existing actual harnesses and normal routes named in the selected packet. Any unavailable visual/hardware evidence remains explicitly open.
