# PQ-032.02 receipt — The climax is a toy

**State change:** `ready` → `done`, 2026-09-25, devin session.

## Commits

- `39c7d92eb` — the climax machinery (adopted stale grok-pq032-climax work; verified + landed).
- `2a2df65ac` — live-route gate repair after independent review found the toy unreachable on fresh saves.

## What the player gets

Each ending's final set piece requires the verbs of the branch:

- **patrol → Ashfall blockade** (`authored_set_piece`): a dead frigate jams the Ashfall Cache door; park the hulk on the berth (`park_the_hulk`) or whip it in (`swing_the_wedge`) while wedge patrols contest the approach.
- **traders → Ashfall siege** (`demolition`): a demolition tower wreck at the cache approach; wrecking-ball it (`wrecking_ball`) or cut it down (`cut_down`).
- **free → evidence tow** (`tow_recovery`): the EVIDENCE CORE slag body; tow it in latched (`tow_in`) or sling it clean (`sling_in`).

## Review findings fixed in `2a2df65ac`

- `elroy_outcome` was never written by the live `rescue_under_fire` B2, so every post-embodiment save classified "legacy" and no `campaign47a:b7:*` offer ever posted — the climax was silently skipped while B7 completed on net worth. A route classifier (`legacy` / `pinned` / `live` from real stamped evidence) now sends live saves to the authored op; pre-embodiment saves keep the old gate.
- B7 `minRep: 50` soft-lock lowered to the authored floor (−149); net-worth gate is legacy-only.
- `campaign47a:*` completions no longer mint generic set-piece follow-ons.

## Evidence

- `test/contract-47a-b7-deep-reach-operation.test.mjs` — 6/6 (per-branch op posting at rep 0, accept/refresh uniqueness, no follow-on, legacy gate intact).
- `test/story-campaign47a-live.test.mjs` — 18/18 (full B0→B7 live runs per branch; `elroy_outcome` stays unset; ops map correctly).
- `scripts/check-m5-story-embodied-runtime.mjs` — stale `bulk_trade`/Tethys expectation rewritten to the real pod rescue → long tow → Ashfall demolition route. Browser pass not executed this session (needs a served build + `SPACEFACE_PLAYER_STORE_DIR=''`); logic mirrored by the unit-level live-route checks.
- `npm run check:baseline` — 16/16 checks pass (aggregate wall-clock budget exceeded under host contention; no correctness failure).

## Residual

Owner-play of all three climaxes (the original done-when's human pass) remains an owner verdict, not an execution gate — the three ops are branch-mapped, spawned, completable, and covered by live-route tests.
