<!-- LIFETIME: DURABLE -->
# Cloud groundwork → professional SpaceFace

Owner direction, 4 October 2026: keep [PR #221](https://github.com/coldshalamov/SpaceFace/pull/221)
open while the cloud agent builds groundwork. Local Codex takes that groundwork through individual
inspection, substantial expansion, improvement, adversarial review/fix and usable-game completion.
The immediate setup is this workflow and the [item ledger](REVIEW_LEDGER.json). It does **not**
declare the cloud's models or characters reviewed or completed.

## Three responsibilities, two local lanes

| Responsibility | Owns | Delivers |
|---|---|---|
| Cloud groundwork | New concepts, editable sources, rough models and behavior candidates on the existing PR branch | Coherent small commits; purpose, actual files, consumer and known missing work; continue current Ceres/Mite/Latch chunks |
| Local lane A — expansion and improvement | One item and its exact source/runtime paths | Personally inspect the work, retain its good idea, deepen its design, rebuild weak forms/behavior, integrate it and push the actual improvements |
| Local lane B — adversarial review and fixes | A different reviewer examines lane A's concrete candidate; fixes use an explicit disjoint write set or return to A | Find material omissions, false promises, broken states and cheap shortcuts; fix them and perform the smallest relevant direct check |

The primary Codex owns every completion decision and personally inspects the item. A worker's
report or agreement does not replace that inspection. Review/fix is one bounded conversation about
the candidate; stop when the result works and no material finding remains. No reviewer quorum,
repeated audit waves or user-playtest gate. Independent findings are logged in the same item.

The ledger supplements [IMPLEMENTATION](IMPLEMENTATION.md), the original twenty-concept amendment,
and existing game owners. It tracks this PR's maturation, not a competing whole-game roadmap.
It includes individual art objects, all twenty concepts, shared runtime work and preserved handoffs.
References are inputs; archiving a dossier or blockout never completes its concept.

## Review by deliverable; retain every commit

Use one item per creature, character/concept, machinery object/state or coherent runtime contract.
Several commits can belong to an item; one commit can affect several items. Review the current
composed item rather than polishing each superseded intermediate commit. The ledger records every
commit and maps every changed path to items, including binaries, tests and patch-only handoffs.
The initial cutoff is `aec6fd0f22cc103e19c3df33a1f932adb273dbd0`, with base
`dc142c0108ce7663bc03574349623c3fda1033fa`. Historical Stormshift/Brood work inherited from PR #216
is included as named art items; initial PR-delta coverage is not a claim that inherited art passed.

Run from the PR branch checkout, with a clean owned write set:

```powershell
git fetch origin refs/heads/dot/spaceface-expansion-handoff-2026-10-03:refs/remotes/origin/dot/spaceface-expansion-handoff-2026-10-03
node scripts/cloud-review.mjs status origin/dot/spaceface-expansion-handoff-2026-10-03
# Inspect the reported delta, add specific items for unassigned paths, then:
node scripts/cloud-review.mjs sync origin/dot/spaceface-expansion-handoff-2026-10-03
```

`status` reads Git and the ledger; it does not fetch, checkout, mutate runtime or approve anything.
`sync` updates only the ledger, inventories later commits and retains deleted paths as tombstones.
Unassigned paths fail visibly before writing. A changed completed item reopens; old completion notes
stay preserved. A branch rewrite requires explicit reconciliation, not dropping the old log.
Files added and then deleted between observations are still inventoried. When the cloud merges
master, identify unrelated upstream imports as reference with their origin; do not expand this
campaign into improving every unrelated master change. Reconcile the actual shared dependencies.
Inventorying means **logged**, never **inspected**. Inspect shared-file deltas semantically: a change
to an unrelated manifest row does not justify repeating every model review. Record the dependency
decision and extend the item's exact tracked paths where a real consumer is shared.

## One item's complete working loop

1. **Take the next usable outcome.** Continue active Mite, Ceres or Latch before unrelated new
   characters. Choose a free exact write set. Record `owner`, `phase: improving`, and the source
   commit in the item; cloud retains its other active items. Respect current shared-tree ownership.
2. **Inspect personally.** Read editable source and the live consumer. For art, look at the actual
   candidate at the relevant game camera and working poses using Forge/the graphics program.
   Record concrete strengths, defects and omissions in `inspection`; inherited cloud assertions
   remain attributed reports until checked. A test count does not establish visual quality.
3. **Expand deliberately.** Write a brief in `expansion`: the player's interaction, distinctive
   silhouette/personality, working states, physical consequences and what must improve. Go beyond
   cleaning up bugs: replace generic first attempts with authored construction and purposeful
   motion, meaningful response and persistent aftermath. Keep original concept identity and scope.
4. **Build the outcome.** Change source, behavior and actual consumer together. Preserve sockets,
   collision, save semantics and single writers. Keep rejected studies as reference, never enable
   them merely to obtain a green loading check. Apply Forge to authored bodies and ORRERY to needed
   UI. One integration owner serializes generated releases/manifests from the latest branch tree.
5. **Adversarial lane.** B reviews that candidate's changed owner and meaningful edges: stale actor,
   wrong collision/motion, interrupted interaction, repeated rewards, Continue, accessibility,
   first-visible/LOD identity, missing consumer, misleading guidance. For art, identify the concrete
   weak shape/material/action, not "needs polish." Log each material finding and its fixing commit.
6. **Verify, publish, close.** Run the relevant focused check and ordinary consumer check; look for
   the requested visual claim. Performance evidence comes from the dedicated quiet-host program,
   never captures on this owner laptop. Missing hardware measurements leave that claim unverified;
   they do not halt source/art improvement or become a request for the user to test. Publish small
   pathspec commits, then set `phase: done` only after the named usable outcome exists and all
   material findings are fixed. Stop that item; take the next incomplete outcome in the campaign.

For completion, store `completion` with `fixCommit`, `reviewedBy`, a concrete `expansion`,
`verification` (command/route and result), `critic` (findings and resolutions), and `blobs`
mapping **every tracked path for that item** to its reviewed Git blob (null for an intentional
deletion). Preserve the prior record in `history` before replacing it. A `done` row with missing
fields or stale blobs is reported as invalid/changed. This binds review to the actual content;
it does not certify taste or independently establish fulfillment.

Before completion, add the real consumer/authoring dependencies to the item's coverage even if
they were inherited unchanged from the base. Keep original reference files labeled as such;
record what the production implementation gained, not an invented improvement to the source ZIP.
An item may record separate source/asset/integration/functional/visual/performance results inside
`verification`; no passed column implies another. There is no silent waiver for red functional work.

## Shared PR publication

Keep the PR and its branch open; do not merge, close, force-push or overwrite another agent's tree.
Push improvements to `dot/spaceface-expansion-handoff-2026-10-03`, using an ordinary fast-forward.
If the cloud pushes first, fetch the new head, reconcile only your owned content and recheck the
affected result. Do not replace the branch with an old snapshot or republish archived patches as
runtime implementation. Cloud candidate commits never overwrite a completed local design without
the item returning to review. Avoid simultaneous edits to the same file; an item is coordination,
not permanent ownership of a subsystem. No persistent side checkout.
When local A claims Mite's exact production paths, cloud continues Ceres/Latch or writes a new
versioned Mite candidate with its source lineage. It does not edit the claimed production source.
The local primary reconciles a newer candidate into the improved design after inspecting its delta.

Update the ledger in the same improvement packet. A commit can be recorded at the next sync,
so no self-referential commit hash is required. At a handoff, leave the item, exact current source,
remaining concrete fix and next action; the next session continues that work rather than restarting
an audit. The cloud's current-source work and local improvement log remain separate fields.

## Launch state and next work

This setup inventories all existing PR commits/paths and provides individual targets. All production
items start `pending` or `reference`: **none is newly accepted by this setup**. Lane A's first art
target is the latest published Mite N4 editable candidate, compared with the retained concept and actual dense
consumer; Ceres machinery and Latch are parallel outcomes with their active cloud owner.
Lane B first checks the maturation workflow, then the concrete Mite replacement. Do not replace
Mite's live dense radius/mass with its archived review-only proposal. Later unpublished N5/N6 studies
enter this log when supplied as coherent PR work. Ceres' normal receiver success does not close
its disturbed/moving-load controls; reproduce the relevant failure on the actual committed source,
keeping newer private-run claims attributed until that source is published. These are working inputs,
not verdicts. The first live sync added Latch successor2 and the cloud's current handoff, giving
45 cloud commits, 61 items and 1,013 tracked paths (1,007 PR-delta paths plus inherited art).

The workflow is durable. Ongoing automatic runs require a saved Codex schedule; this document alone
does not keep an agent running after a session ends.
