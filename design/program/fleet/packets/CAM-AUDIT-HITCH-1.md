# CAM-AUDIT-HITCH-1 — senior adversarial architecture review: world positions freeze while UI stays alive

**For:** Codex GPT 6.2 Sol reviewer. **Kind:** READ-ONLY investigation. Change no tracked file, create no worktree, do not commit. Write findings only to your RECEIPT.md.

The owner's top gameplay complaint: **objects and ships sometimes stop moving for seconds while the FPS/interface still updates, then catch up in jumps.** Heavy scenes also hitch. This is bad gameplay, not a cosmetic concern. Treat it as the highest-priority backend problem.

You are reviewing the live shared checkout. It contains foreign uncommitted work. Do not revert, repair, or "clean up" anything. You may inspect diffs and run read-only commands. Do not boot the game, browser, or Electron for this packet.

## Read first

1. `AGENTS.md`
2. `ARCHITECTURE.md`
3. `design/overhaul/17_AGENTIC_CAMPAIGN.md`
4. `design/overhaul/14_PERF_PLAN.md` and `14_PERF_HANDOFF.md`
5. `design/overhaul/16_DEMO_HANDOFF.md`
6. `.devshots/director/demo/RESUME.md` if present

## Trace the actual path

Inspect, at minimum:

- `src/core/wholeSimBrowserWorker.js`
- `scripts/lib/simWorkerHost.mjs`
- `src/core/simLaneMain.js`
- `src/core/presentationJournal.js`
- pose-table / journal application / render integration files reached from those
- the worker ACK, reply coalescing, heartbeat, backpressure, and latest-wins logic
- the main-thread application of worker replies and transform/pose data

Also inspect current uncommitted diffs in those or nearby files with `git diff -- <file>`. They may be foreign in-progress performance work. Do not assume committed code is the whole story.

## Questions to answer

1. What exact path carries ship/object position updates from authoritative sim to rendered mesh?
2. Where can positions be delayed, dropped, coalesced, held behind ACK/backpressure, or applied in bursts while ordinary DOM/FPS continues?
3. Which parts are correctness-critical ordered events and which are latest-wins presentation state? Are they separated correctly?
4. Does the worker keep simulating when presentation is behind? If yes, what happens to the backlog? If no, exactly what stops it?
5. Are object freezes more likely caused by worker scheduling, transport congestion, journal application, render admission, main-thread frame cost, or sim-step cost? Rank the hypotheses.
6. What existing evidence supports or contradicts each hypothesis?
7. What is the smallest layered repair sequence that preserves gameplay richness and visual quality?

## Required evidence

Give file:line references. Distinguish direct code facts from inference. Do not assert a race or drop without naming the exact mechanism. If current evidence cannot choose between two hypotheses, say what measurement would choose.

You may run small Node-only inspections/tests if they do not edit files and do not boot the game. Keep them under ten minutes total. Do not run the whole test suite.

## Receipt format

Use the normal receipt headings, and inside **What the player now sees or feels** write "READ-ONLY audit; no player-facing change." Add these sections before **What is left**:

```
## Causal model
## Ranked hypotheses
## Evidence table
## Recommended repair sequence
## Collision warnings
```

The evidence table columns: claim | evidence | confidence | cheapest decisive test. Be concrete and adversarial. Do not praise the architecture; find the flaw.
