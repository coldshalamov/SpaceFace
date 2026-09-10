```yaml
packet: P30
title: The Crucible — door, draft, refit, results, lab on the kit
lane: CODE
tool: local (Codex or Grok in an isolated checkout; the controller integrates)
dependsOn: [P22, P15, P16]
current: [crucible-door, crucible-draft, crucible-refit, crucible-results, crucible-lab]
inputs: [design/frontend/direction/approved/frame-crucible-door.png, design/frontend/direction/approved/frame-crucible-results.png, design/frontend/direction/approved/kit-notes.md]
returns: commits + receipt design/frontend/direction/receipts/P30-REPORT.md
mutex: [crucible-ui]
```

# P30 — The Crucible screens

## Objective

Build the approved Crucible door and results frames, and derive draft and refit (BENCH) from them:
the arena diorama on the stage (P20), the three selector rows as imaged tiles (P15 arena/mode
tiles; P16 hull tiles with weapon icons for builds), the machined Launch key with a live hazard
stripe, the engraved seed readout, the white-hot temperature, the P17 reveal and the
`ui_crucible_enter` strike. Results as a story with one hero numeral.

## Write set

`src/ui/screens/crucible.js`, `src/ui/screens/crucibleDraft.js`, `src/ui/crucibleFocus.js`,
`src/ui/crucibleLaunch.js` (stage handoff only), `styles/crucible.css`, `styles/fh.css`
(Crucible additions). The Crucible ruleset and sim files are out of bounds.

## Checks and evidence

`npm run check:baseline` · the Crucible runtime checks named in `design/program/roadmap/active/PQ-182.md`
· `node scripts/capture-ui-matrix.mjs --world --headed --only=crucible-door,crucible-draft,crucible-refit,crucible-results,crucible-lab
--out=.devshots/frontend/P30` at three widths · a clip of door → launch → first wave → results.

## Acceptance

Door and results captures pass the vision rubric beside their frames; draft/refit read as the same
bench; every selector is a tile with a picture; the seed and records work; the temperature is
white-hot on the door and cools on results; keyboard/pad reach everything.

## The way this gets faked

Selector rows as words with a lit underline; tiles with placeholder colours; results as a table.
