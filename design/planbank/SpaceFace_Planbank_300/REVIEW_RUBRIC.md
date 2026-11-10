# Strong batch review — inspect the game the code actually creates

Review a small compatible completed batch. Do not simply rerun the implementer's self-review prompt or assume the source packet was correct.

## Six questions, in order

1. **Is the premise still true?** Check the current diff and active owner. Has the packet rebuilt something already working, revived retired direction or misread a stale report?
2. **Does the ordinary player reach the result?** Follow entry/acquisition, the meaningful choice, the action, feedback, resolution and return. Hidden flags and debug-only fixtures fail this question.
3. **Does one real cause produce one coherent consequence?** Inspect physical action, AI permission, custody, money, law, story, sound and VFX at the boundary. Look for two systems telling different stories or both settling the same transaction.
4. **Does the contrary case remain playable?** Try refusal, a miss, partial completion, lost target, reload, cancellation and repeated input where relevant. A success path with no failure continuation is unfinished.
5. **Is the result actually good?** Does the role have a readable counter, the place have a function, the upgrade change a decision, the sound identify an action and the picture preserve the fight? Meeting a minimum numeric bar is a draft, not a guarantee of quality.
6. **Did the change damage another owner?** Check determinism, current default backend, save/identity, memory lifetime, focus, accessibility and exact-path concurrent work. Performance claims need matched route/settings and sufficient samples, not a faster incomplete scene.

## Verdict and response shape

Return a ranked list of real defects with exact source path, scenario, expected consequence and proposed bounded repair. Separate **must fix** from **optional improvement** and **unproven in this environment**. Do not invent a score from unavailable gameplay or approve visual/audio quality from source alone.

A useful review summary is:

```text
Batch / commits:
Actual player sequence observed:
Most consequential defect, with reproduction:
Smallest owner-preserving repair:
Counterexample checked:
What remains unproven:
Outcome: implemented / accepted / replan / already satisfied / cut
```

Use the existing task/conversation surface. This template is not a request for a new Markdown receipt archive. If there is no real defect, say what evidence supports that conclusion; do not pad a review with cosmetic churn.

## Avoid false independence

A second prompt in the same untested session is not equivalent to independent route evidence. A fresh reviewer who reads only a summary can miss the real boundary. Give the reviewer actual code and actual observations, and be honest when independent execution is unavailable.
