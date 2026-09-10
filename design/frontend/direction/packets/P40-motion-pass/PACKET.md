```yaml
packet: P40
title: The motion pass — every screen moves like the register says
lane: CODE
tool: local (the controller, or Grok with the controller reviewing)
dependsOn: [P30, P31, P32, P33, P34, P35, P36, P37, P38]
current: [title, station-dock, flight]
inputs: [design/frontend/direction/approved/kit-notes.md]
returns: commits + receipt design/frontend/direction/receipts/P40-REPORT.md + clips
mutex: [ui-kit]
```

# P40 — The motion pass

## Objective

Walk every screen with the P17 library and the register tables: POSTER reveals with mass, BENCH
plates sliding with weight and legends lighting, EDGE instruments easing and alerts pulsing once;
the docking arrival choreography (the shell peels, the berth lands, keys light in sequence); the
first-undock choreography (instruments come online one by one with a tone each); the wanted
temperature move; the Crucible strike. Reduced motion: every one a cut. Nothing loops in flight;
ambient drift only on paused screens.

## Write set

Presentation sections of every screen module touched by P30–P38, `src/ui/kit/motion.js`,
`styles/fh.css`, `styles/hud.css`. No new DOM.

## Checks and evidence

`npm run check:ui-effects` · `npm run check:command-deck-ui` · `npm run check:ui:perf` (no
idle rAF; frame-sleep) · reduced-motion captures for every surface · thirteen clips: boot, first
undock, going wanted, docking, market buy, chart route, THE SHIP orbit, Crucible enter, Crucible
results, pause, load, game over, photo mode.

## Acceptance

Every clip matches its register's numbers; every motion names its state; reduced motion is cuts
throughout; frame budgets hold.
