```yaml
packet: P38
title: The reading screens — missions log, codex, help, tech tree — and Asteroid Works reconciled
lane: CODE
tool: local (Codex or Grok in an isolated checkout; the controller integrates)
dependsOn: [P22, P10, P13]
current: [mission-log, codex, help, tech-tree, asteroid-works]
inputs: [design/frontend/direction/approved/frame-mission-log.png, design/frontend/direction/approved/frame-codex.png, design/frontend/direction/approved/kit-notes.md]
returns: commits + receipt design/frontend/direction/receipts/P38-REPORT.md
mutex: [reading-screens, asteroid-works-ui]
```

# P38 — The reading screens and Asteroid Works

## Objective

**Missions log** to its frame (engraved rows with icons; the focused mission as an instrument with
the route etched). **Codex** to its frame (the paper insert material, entry names as engraved rows,
plate images from P16 hull tiles and P15 plates). **Help** as engraved rows of action and key with
P11 key-bind cells. **Tech tree**: lanes as etched paths on the held world, nodes as small tiles
with module icons, the selected node at 96 with its cost and UNLOCK as one key. **Asteroid Works**:
its accepted law keeps its board; its chrome (top strip, leave key, heat/charge readouts) moves to
the EDGE materials so it is the same game.

## Write set

`src/ui/screens/missionLog.js`, `codex.js`, `help.js`, `techTree.js`, `src/ui/asteroid/*`
(chrome only; the board and sim untouched), `styles/asteroid-ops.css` (chrome rules), `styles/fh.css`.

## Checks and evidence

`npm run check:baseline` · `npm run check:mission-log-map` · the Asteroid Works checks in
`PQ-185.md` · `node scripts/capture-ui-matrix.mjs --world --headed
--only=mission-log,codex,help,tech-tree,asteroid-works --out=.devshots/frontend/P38`.

## Acceptance

Missions log and codex pass the rubric beside their frames; the tech tree's canvas text is in the
kit face at ≥ 12 px; Asteroid Works' board is pixel-identical and only its chrome changed.

## The way this gets faked

A codex that is a two-column web page; a tech tree of boxes and arrows; touching the Works board.
