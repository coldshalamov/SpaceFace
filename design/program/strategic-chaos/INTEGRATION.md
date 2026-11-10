# Integration and build-map handoff

## Scope of this candidate

New files: the Strategic Chaos program and thirteen task documents, the dependency-free CLI/helper modules, focused tests and a narrowly scoped read-only test workflow. The only existing file changed is `build_map.md`, with ten additive navigation lines. Existing gameplay, assets, locks, saves, main-branch state and other open PRs are unchanged.

The inspected base is `2f1078e9a3ba54f21064f8163b3fca3476d49182`. Refresh source and open-PR overlap before implementation; do not treat this source pin as a demand to stay on an old checkout.

## Build-map integration — completed on the candidate

Commit `48ba280c252177174ce73c0ed5c3c57a0e6536a1` applies the exact ten-line navigation section to `build_map.md`. Its remote diff was read back: ten additions, no board deletions. A branch-restricted one-shot workflow ran the focused checks and actual source-path validation, verified the sole board hunk against the installer output, committed it, and removed itself in the same commit. The final candidate contains no write-enabled integration workflow.

The connector did not replace the large board from a partial read or stale snapshot. The exact additive patch in `integration/BUILD_MAP.patch` and tested installer remain available for other checkouts.

The PR already has the link. On a separate source-overlay integration host, inspect the exact live board claim/diff, then run:

```sh
node scripts/strategic-chaos.mjs map
node scripts/strategic-chaos.mjs map --apply
# Review this one additive hunk; commit it with the foundation integration.
git diff -- build_map.md
```

If the board contains foreign uncommitted work, preserve it and coordinate/reconcile just the new navigation hunk. Do not reset the file, overwrite it with an archived copy, or postpone all disjoint foundation work. No task IDs, statuses, claims, acceptance thresholds, existing priorities or completion counts are changed by this link. The detailed crosswalk remains in PROGRAM.md.

**Root-board insertion is complete in PR638, not merged into master.** The ZIP carries the same additive change rather than a stale full copy of the board.

## Existing work to reconcile

PR605 owns overlapping Controlled Chaos combat/targeting/pylons/arsenal work. PR554 owns NOCTURNE. PR631 concerns opening GPU readiness. Existing world/cargo/mission changes such as PR583/590/599 can overlap their corresponding operations. These were references during the inspection, not frozen current status or permission to absorb those branches. Fetch current metadata and exact changed paths before editing.

The prior maturity-cloud pack remains valid supporting detail. This package adds strategic choices, proof handling and concrete operation composition; it does not commission duplicate mining feedback, route planning, NPC identity or readable-boss projects already owned elsewhere.

## Application from the source ZIP

The ZIP is a source overlay and additive patch, not a full game checkout. Its installer verifies existing target bytes and refuses to overwrite different files. It copies only the delivered new paths, then invokes the map installer. It does not create/switch branches, install dependencies, stage, commit, push, deploy or start paid agents.

Use it on an appropriate candidate branch based on the current repository. Review the resulting exact paths. A code-pack-only validation pass is not a full graph or rendered gameplay run. For a repository-native integration, run the new focused tests, default `validate`, the applicable existing source/lab checks and the real B12 proof when the full runtime is available.

## Review checks

Confirm no duplicate runtime authority; no modified existing thresholds or goldens; actual CLI behavior and failure exits; source-only versus full source validation labels; imported-report non-promotion; map-only additive insertion; and clear distinction between delivered foundation and unbuilt gameplay commissions. Do not merge or deploy this branch automatically.
