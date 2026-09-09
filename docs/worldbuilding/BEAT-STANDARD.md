# Beat standard

Every later story beat is produced the same way as the twelve minutes that already work.
This is not a second pipeline. It sits on `STORY-PIPELINE.md` as the production step
between storyline and a playable encounter.

`docs/worldbuilding/sheets/chapters/B0.md` is chapter prose. It is **not** the playable
opener. The leftover playable opener is `src/data/scenarios/47a.scenario.json` plus
`src/story/campaign47a/`. Cite `src/data/barks.js` and `src/data/narrative.js`. Do not
rewrite them.

## A beat is

A **place**, **actors**, and a **headline physical verb** — or it is not a beat.

Agency lives in the physics. The story is linear. No dialogue tree. No choice menu.
No cutscene that takes the stick.

## Machine sheet

Fill `docs/worldbuilding/beats/<id>.beat.json` from `docs/worldbuilding/beats/TEMPLATE.beat.json`.
The reader is `src/story/beatStandard.js`. The gate is:

```text
node scripts/check-beat-standard.mjs
```

Do not register that gate in dirty `scripts/check-program-docs.mjs`.

Required keys:

| Key | Meaning |
|---|---|
| `canon.whoWantsWhat` | Each leftover actor: who wants what, and why |
| `register.speakers` | One-line rule + leftover example per speaking faction |
| `setPiece.place` | Where the bodies are |
| `setPiece.actors` | Leftover actor ids, not invented cast |
| `setPiece.headlineVerb` | One physical verb (hitch, cut, sling, tow, fire, steer) |
| `setPiece.twist` | The clause that changes the arena |
| `setPiece.solutions` | **Two** leftover physical solutions the player can already perform |
| `setPiece.provingFrame` | The frame that proves the verb landed |
| `barks` | One line, one consequence. Cite leftover dialogue; do not invent a tree |
| `voiceNotes` | Synthetic-voice direction. Cite leftover register; do not rewrite `barks.js` |
| `seedCapture` | Fixed leftover seed + capture contract (headed GPU may be peeled) |

## Fail the sheet if

- it is prose only
- it is a choice menu
- it is a cutscene that takes the stick
- it has one solution
- it has no physical headline verb
- a named solution is not leftover in the cited scenario (do not invent it)

## 47-A without loss

Re-express the leftover slice: false-mass spindle, scavenger intercept, official tug,
civilian pod, hitch, two leftover physical solutions. Do **not** collapse it into B0
"mine 10u Veldspar and dock."

Minimum leftover actors: player, spindle, wreck, interceptor, harasser, thief,
official tug, civilian pod. Kessler and the handoff beacon are leftover too — keep them.

This leaf does not recut campaign beats 1–3.
