```yaml
packet: P22
title: The Title, live — the veto point
lane: CODE
tool: local (the controller, or Codex/Grok with the controller reviewing)
dependsOn: [P20, P21, P14]
current: [title, new-game]
inputs: [design/frontend/direction/approved/frame-title.png, design/frontend/direction/approved/kit-notes.md]
returns: commits + receipt design/frontend/direction/receipts/P22-REPORT.md + the side-by-side
mutex: [ui-kit, meta-shell]
```

# P22 — The Title, live on the default route

## Objective

The first real screen built to a frame: boot the game and the approved Title frame is what you
see — the hangar stage with the hull turning slowly (P20), the stencil logotype (P14), the legend
rail (P10/P11), the words in the display face, the status light, the version — with the P17
reveal (words stamp in after the hull) and the P17 sounds on focus and confirm. New Game reuses
the stage with the hull and its sentence.

This is the point at which the owner looks. Nothing after it starts until it is right.

## Write set

`src/ui/screens/mainMenu.js`, `src/ui/screens/newGame.js`, `src/ui/views/menuFrames.js`,
`styles/orbital.css` (title rules retire), `styles/fh.css` (title layout additions only).

## Checks and evidence

`npm run check:baseline` · `npm run check:title-continue-runtime` · `npm run check:ui-a11y` ·
`npm run check:responsive` · `npm run check:wcag-contrast` · `node scripts/capture-ui-matrix.mjs
--world --headed --only=title,new-game --out=.devshots/frontend/P22` at 1280/1920/2560 and
reduced-motion · a 6-second boot clip.

**Review:** the 1920 capture beside `frame-title.png`, judged by a memoryless vision reviewer with
`_COMMON/02_ART_DIRECTION.md` §2 and §5 and this rubric: materials match · type matches · the
world is lit and dimensional · the eye lands in the frame's order · nothing reads as a web page.
Iterate until it passes; then the controller looks; then the owner.

## Acceptance

The side-by-side passes the rubric; keyboard and pad reach every word; the focus ring is visible;
reduced motion is a cut; the 12 px floor holds; the receipt carries the captures and the reviewer's
verdict verbatim.

## The way this gets faked

Matching the frame's layout with the old materials; a hull that is a PNG; a title that passes
headless but is black on the owner's machine (test on the constrained-GPU path too).
