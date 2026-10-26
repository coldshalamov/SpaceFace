<!-- LIFETIME: DURABLE -->
# Unaccepted post-ending replay branch previews

## Outcome and ownership

The first branch-station visit no longer monopolizes an unaccepted replay choice. Visiting the other branch station retires this run's prior preview through `missions.pruneBoardOffers`, then uses the existing offered/boarded handshake for the alternative. Accepting still commits one branch.

The allocation is [the exact preview hunk](https://github.com/coldshalamov/SpaceFace/blob/0f093e3c5a96784c38be165c6ca30f5e96997dc8/design/program/world-depth-2026-10-02/CURRENT_CHECKPOINT_2026-10-22.md#active-exact-hunk-claim-unaccepted-replay-branch-previews), not release of other owners. Only replay context capture and `_offerAtStation` change. Accepted handlers, `_settle`, completed-route presentation, payouts, receipts, consequences and chain data remain byte-identical to the source basis. No missions-owner code or protected traffic/mining/NPC runtime is changed.

## Safety boundaries

- Build the valid alternative before retiring anything. Same-station and unrelated-station visits leave the preview alone.
- Require the captured missions owner to share the exact state and event bus. Missing, stale or refusing retirement authority preserves the previous preview.
- Retirement matches source, offer ID, fingerprint, choice, chain, cycle, stage and choice phase. No direct board or active-mission writes; unrelated rows remain untouched.
- Retire before boarding, so stale prior rows cannot be accepted against a newer singleton fingerprint.
- Guard synchronous reentry while pruning/boarding. A narrowly scoped pre-reconciliation check preserves the fingerprint during the missions owner's updated-before-accepted event ordering. These adversarial callbacks are robustness coverage, not an observed ordinary player failure.
- A rejected post-prune boarding leaves the run explicitly recovering, with no false OFFERED state, branch commitment, payout or settlement. A later station visit retries normally.

## Executable evidence

Source basis: public master `8ec03f2f7250b50a21c92d37c73217dceef953fc`. Original replay blob `a7e30eb19fc873312ac74ea00f415b67ee295b1e`; missions blob `29bde8af6a0c750b4225d509282b2501a7039b93`; candidate replay blob `029cb7a028b8a8ba6aa20ebbe3fb65d1849febd7`.

The new `test/post-ending-replay-preview-choice.test.mjs` runs actual `createSimulation` instances with missions, cargo, economy, factions, world, replay and Save owners. The opening is accepted at Helios and completed by docking at Tethys: real stage advancement, one replay receipt and a 793-credit wallet increase. No replay stage, acceptance, completion or reward is seeded.

Disclosed preconditions: seed 47, ample credits/reputation and normalized completed ending continuity. Travel uses the world owner's sector entry plus dock/undock inputs and corresponding UI docking state. Save/Continue uses actual save/load entry points backed by an in-memory localStorage adapter; clearing live board data before load demonstrates restoration from saved bytes.

Results on final candidate:

- New actual-owner regression: 5/5 pass. Both branch orders, alternating visits, same/unrelated visits, actual Save/Continue before acceptance, stale-offer refusal, accepted branch locking, missing/stale/refusing retirement authority, rejected boarding/retry, unrelated rows and exact retirement predicate boundaries.
- The identical new test against original public replay source: 0/5 pass, exit 1. Both branch-order failures reach the missing alternative preview assertion after genuine opening completion.
- Existing `test/post-ending-replay-chains.test.mjs`: 8/8 pass, covering six chains, both branches, exactly-once consequences, failure recovery, saves, reset and registration. These existing tests include narrower fixtures and are not additional full-game acceptance.

Commands (run individually, not through a package aggregate):

    NODE_DISABLE_COMPILE_CACHE=1 node --preserve-symlinks --preserve-symlinks-main --test test/post-ending-replay-preview-choice.test.mjs
    NODE_DISABLE_COMPILE_CACHE=1 node --preserve-symlinks --preserve-symlinks-main --test test/post-ending-replay-chains.test.mjs

`package.json` appends only the new regression to `check:mission-handoff`; its pre-existing runtime command and every other byte are preserved. Public package baseline `ed7d24f41bca13fd1035b026c325e0aa9ab12f4b` was independently fetched and rechecked before delivery. The gate's browser/runtime prefix was not executed in this evidence run.

## Provenance and limits

An isolated symlink overlay reuses dependencies without mutating the canonical checkout or reproduction artifacts. Independent static traversal found 1,062 files, including 1,060 source files; the Node loader independently recorded 1,062 loaded files, including 1,060 source files. Both have zero unexpected source deltas, with only the replay implementation intentionally changed.

Expected identities were reconstructed from the archived public tree, the entire 30-path c855-to-250 public compare and all five exact 8ec source updates, independently fetched again. The four public power/input/fields changes are correctly retained as public, not mistaken for PR-only inputs. Public Bolus/world inputs remain the coherent exact-8ec versions, not draft PR #510 code.

Assets, vendor files and node_modules are linked, not reaudited against master. This is not a complete checkout assertion, browser/phone validation, physically flown campaign or whole-game acceptance. No browser, port, forbidden receiver regression or full test aggregate was run. No GitHub write, merge or deployment is claimed here. Before publication, reconcile current public source, package and overlapping PR work; preserve all other owners' claims.
