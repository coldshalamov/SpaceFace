<!-- LIFETIME: VOLATILE -->
# Inference ledger — human view over `inference-memory.json`

**Two doors**

| Door | Who decides the unit | How |
|---|---|---|
| `NEXT` / PQ | Program already named it | `program-dispatch` |
| `INFERENCE` | **Agent invents it** after reading the director board | detect → pick ONE cell → invent → implement → record |

**INFERENCE is not PQ.** Do not wait for a human "concrete next unit." Run the board,
pick a cell, verify its reality on the ordinary route, and improve the actual game.

```bash
node scripts/inference-detect.mjs
node scripts/inference-detect.mjs --scope=NPCS --nx=3
node scripts/inference-detect.mjs --out=design/program/INFERENCE_DETECT_LAST.json
```

## The memory is `design/program/inference-memory.json`

The old hand-ticked surface table is retired. It could be raced, faked, and reset;
it forgot rejections, failed patterns, references, and every domain it had no row
for. The machine memory replaces it and is what the detector actually reads for:

- **anti-pile-on** — accepted units decay with a 21-day half-life; a saturated
  domain gets flagged on the board instead of relying on an agent's restraint;
- **anti-resurrection** — rejected/cut fingerprints block matching candidates
  for 45 days unless new evidence is recorded;
- **starvation scheduling** — domains with no structural metric (economy, story,
  audio, exploration, UI, feel, integration…) surface by staleness, so repeated
  default runs cannot ignore them forever;
- **failed-twice patterns** — two cuts with the same root reason ban a third
  attempt on the same premise;
- **reference rotation** — a reference game used 3+ times in 30 days is flagged
  for rotation.

**Never hand-edit the JSON.** Record through the validating writer:

```bash
# after finishing a run (always, even when nothing shipped):
node scripts/inference-record.mjs run --mode starved --domains WF-13 --scope AUDIO --nx 1

# per unit — accepted units REQUIRE evidence + review files:
node scripts/inference-record.mjs unit --id refinery-shift-whistle --wf WF-13 \
  --mode starved --verdict accepted --reason "refinery gains shift-change audio identity" \
  --fp "verb=hear,subject=refinery,sector=ceres,layer=midground,tempo=ambient,domain=wf-13" \
  --evidence <route-proof path> --review <filled review-record path>

# rejected/cut units need the causal root so failed-twice detection works:
node scripts/inference-record.mjs unit --id gravity-toll --wf WF-05 --mode repair \
  --verdict cut --reason "redundant with mass seed" \
  --root-reason "no new tactic; overlaps existing tool" \
  --fp "verb=push,subject=chokepoint,sector=any,domain=wf-05"
```

Recording rejected and cut work is **as mandatory as recording accepted work** —
the memory's value is mostly in what it refuses to let future runs repeat.

Fingerprint axes: `verb, subject, sector, layer, tempo, domain`. Fill at least
three, honestly. The fingerprint is how a future agent's "new" idea gets compared
against everything already tried — vague fingerprints defeat the comparison.

## Concurrency

The memory file follows normal exact-path rules: commit it in the same pathspec-
scoped commit as the unit it records. On a git conflict, re-read and re-run the
record command — entries are append-shaped, so merges are cheap. Never resolve a
conflict by discarding the other side's entries.

## Current status

Run `node scripts/inference-detect.mjs` — the board (repair / starved /
opportunity / integration / recovery, plus blocked fingerprints and overused
references) IS the status view. This file intentionally repeats none of it.
