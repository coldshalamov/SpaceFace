# REVIEW-BATCH — Senior review of everything the fleet built since the last review (repeatable)

**Senior agent (Codex, GPT 6.1 Sol).** You find defects; you **do not edit game code** and do not commit
code. The lead verifies every finding before anything acts on it, so be precise rather than broad.

## What to review
1. Find the last review: the newest file in `design/program/fleet/reviews/` (its first line names the
   commit it reviewed up to). If none exists, start from commit `2e82a6fc` (the fleet's first commit).
2. List the work since then: `git log --format="%h %s" <from>..HEAD -- src scripts test` — review every
   commit whose message starts with `fleet(`, `plant:`, `feel:` or `freeze:`. Read each diff in full
   (`git show <hash>`), and the code around it where the diff touches a seam.

## What to look for (in this order)
1. **Correctness bugs** — wrong condition, missed case, state that is never reset, events that fire twice,
   save/load that loses the new state, a timer on wall time in simulation code.
2. **Determinism** — any `Math.random`, `Date.now`, `performance.now` in simulation code; iteration over
   a `Map`/`Set` whose order can differ; anything that makes the same seed play differently.
3. **Reachability** — a feature only a test can reach; a system never registered; a UI never mounted.
4. **Contract breaks** — writes to state another system owns (the repo uses single writers: other systems
   send intents/events to the owner); Three.js imported outside `src/render/`; edited golden/expected files.
5. **Performance traps** on per-frame or per-tick paths — allocation in a hot loop, O(n²) over entities,
   DOM writes every frame.
6. **The packet's own promise** — compare against `design/program/fleet/packets/<ID>.md`: did it build what
   the packet says, with the exact names and numbers?

## Write the report
`design/program/fleet/reviews/<YYYY-MM-DD>-<short-head-hash>.md`, first line:
`Reviewed <from>..<head> (<N> commits)`. Then one section per finding, most severe first:

```
### [HIGH|MED|LOW] <one-line defect>
Commit: <hash> (<packet id>)   File: <path>:<line>
Failure: <concrete input/state → wrong result or crash>
Evidence: <the lines of code, quoted briefly>
Fix: <the smallest correct change, in one or two sentences>
Confidence: <high|medium|low> — <what you did not check>
```

Then a short **"Clean"** list of commits you reviewed and found nothing wrong in. **Do not pad**: no style
nits, no "consider adding tests" without a concrete gap, no speculative findings without evidence. A
review with three real findings is better than one with twenty guesses.

Commit only the report: `git add -- <report> && git commit -m "review: fleet batch <from>..<head>" -- <report>`.
