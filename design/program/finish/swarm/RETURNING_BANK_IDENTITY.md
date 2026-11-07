# Returning opening banks keep their identity

## Diagnosis and source

Primary checkout HEAD: `7dc248acec452df4afcd0a5b71ad0507cd6c17ec`. Remote master verified at `8712641744aedb7254f47b9c5015b9cfd842ce59`. The two source owners and existing continuity test match remote master before this change. Open PRs 921 and 922 affect rescue choices and ship UI; neither owns these files. PR 724 is merged, including its newer bank coordinates, tier selection and native admission. Those changes are retained, not replaced from the older archived court.

Current census forwards a bank's slot only while it is inside the 400-WU fight radius. A bank moved to x=401 (or x=901, beyond the keep radius) remains alive on the ordinary release clock, but round-two top-up treats its slot as free and creates a second body. Returning the original before release leaves duplicate slot 0 and prevents complete distinct round-three expansion. Both boundary cases fail against the unchanged source (two bodies rather than one).

## Change

The existing arena census now separately collects opening-slot identities from every live arena-owned solid. Local clearance geometry and local count stay unchanged. The pure opening planner accepts that separate reservation list. Only actual death or removal releases a slot, not crossing a distance boundary. There is no persistent ledger, save schema, new tick, movement write, material replacement or asset change.

A temporarily departing bank can leave a local vacancy until it returns or is actually removed. Existing lifetime renewal, in-view holds, round replenishment, field cap, native clearance, other arenas and later rounds remain authoritative. This change does not promise that velocity survives a real round transition: existing `_settleRoom` still owns that behavior.

## Verification

19/19 focused checks pass:

`node --test test/swarm-opening-court-continuity.test.mjs test/swarm-opening-terrain.test.mjs test/swarm-overhaul-room-settle.test.mjs`

The continuity suite directly imports the production run-session, arena and planner, uses actual admission/spawn shapes and excludes only the separately owned optic lattice. Cases cover 401/901-WU departure and return, actual removal, indexed census and dead/foreign bodies. It calls the top-up owner directly; moving fixtures is not a native throw simulation.

Four unchanged offscreen-release checks pass, including real core lifetime sweeping. Syntax and scoped `git diff --check` pass.

The separate opening-pocket native suite cannot load because `@dimforge/rapier3d-compat` is absent from this checkout. The optic-passive-clearance suite has one failure at `translation preserves every cell relationship`; the other two checks pass. The identical optic failure reproduces with a read-only Node loader returning HEAD bytes for the two changed owners (baseline 2/3, candidate 2/3), without restoring or modifying the shared checkout. This is an unresolved existing optic-layout assertion, not a green suite; the next step belongs to the optic owner to reconcile cell-spacing intent with its scaled native layout.

No ordinary-input rendered playthrough, target-machine performance, full CI or full Save/Continue acceptance is established. No model production, second checkout, merge or deployment.
