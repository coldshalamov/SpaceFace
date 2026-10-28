# Public gameplay route — blocked before startup

The canonical local server served the actual unmodified game entry point in a fresh browser
context with no player save store. The script did not replace audio or station implementations.
The two audio imports returned HTTP 404 before the first-run Play button appeared. Therefore
New Game, Launch, flight controls, gameplay screenshots and frame metrics were not reached.

- [Raw route report](report.json)
- [Missing tracked paths at both inspected mainline revisions](missing-imports.json)
- [Observed startup screen](startup-blocked.png)
- [Reproducible route script](../../../../scripts/check-nocturne-gameplay.mjs)

The absent stationLife module is an additional static-import finding; the blocked audio graph
prevented reaching its UI route. The failed screenshot is retained as failure evidence, not
visual acceptance. Lighting authoring/transport fixtures are documented separately.
