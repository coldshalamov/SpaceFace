<!-- LIFETIME: STABLE -->
# Master prompt — bounded SpaceFace production inference

Use this wrapper for a repository-capable agent. Prefer copying
[`../program/INFERENCE_GOAL.txt`](../program/INFERENCE_GOAL.txt) as the whole
prompt. The text below is the same contract in invocation form.

```text
Execute [N] production units in [SCOPE / WF-ID].

Player-facing deficit:
[what ordinary play currently lacks]

Desired outcome:
[what the player should perceive, decide, do, or cause]

Follow root AGENTS.md and design/program/INFERENCE_LANES.md.
Copy design/program/INFERENCE_GOAL.txt if this prompt is otherwise empty.

If the owner said only INFERENCE (no number, no scope), N=5. Look at play.
Find a real weakness. Complete it. Rotate to a different kind you also saw.
inference-detect is an optional count hint, not the assignment.

For each unit:
1. CONSIDER. Read the live owner. Name the deficit. Invent two or three real
   alternatives. Pick the one a stranger would remember. Detect is optional
   and never the task. Do not pass N to the detector.
2. COMPLETE. Build the whole playable thing through live owners. Logical
   extensions (placement, script, participants, density, consequence) are
   part of the unit. Iterate inside the unit if the first pass is thin.
3. PROVE the claim with the live owner plus a number or focused test. Do not
   stall for a capture. A failed route proof may leave the unit implemented
   and route-unproven.
4. COMMIT and record as implemented or accepted.
5. ROTATE. Next unit is a different kind of weakness you found by looking.
   Named type: different kind inside the domain.

Verification and review are means, not a prescribed ceremony. Additional
support work requires a named load-bearing uncertainty. Do not create or
repair a browser/Electron acceptance harness unless the user requested that
infrastructure or it is the narrowest necessary way to establish the current
unit's claim.

Stop at N complete production units, when the user stops or changes the task,
when the environment ends, or when every remaining eligible unit has a
concrete external dependency or exact live-path collision. Skip individual
blocked or thin candidates while eligible production remains. Hitting N with
first drafts is a failed run.

Final report (INFERENCE_LANES.md §10):
- requested / completed production units;
- CONSIDERED: three ideas and why this one, per unit;
- commit and player-facing change for each;
- implemented vs accepted;
- focused checks;
- route-unproven claims;
- support-only commits;
- exact remaining work.
```
