Implemented M30: escort the Shepherd charge, repair contamination mid-route, deliver clean or fouled, or retreat together for reduced pay.

The existing escort runtime lacked charge condition and refuge outcomes. M30 now extends that runtime and preserves exposure, repair progress, fault timing, and position across save/reload.

Files changed:

- [src/data/cleanCylinder.js](C:/Users/93rob/Documents/GitHub/SpaceFace/src/data/cleanCylinder.js)
- [src/systems/missions.js](C:/Users/93rob/Documents/GitHub/SpaceFace/src/systems/missions.js)
- [src/systems/precursorMachines.js](C:/Users/93rob/Documents/GitHub/SpaceFace/src/systems/precursorMachines.js)
- [test/m30-clean-cylinder.test.mjs](C:/Users/93rob/Documents/GitHub/SpaceFace/test/m30-clean-cylinder.test.mjs)
- [index.html](C:/Users/93rob/Documents/GitHub/SpaceFace/index.html)

Verification:

- M30 seed 4242: **8 passed, 0 failed**, including native V3/Rapier movement.
- Existing escort and M29 tests: **10 passed, 0 failed**.
- Module preloads synchronized; deterministic reload hashes matched.

Adjacent issues left unresolved: Adventure startup timed out preparing flight materials under SwiftShader, so player-truth **failed before gameplay** ([verdict](C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/mj5-m30-player-truth/verdict.md), [contact sheet](C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/mj5-m30-player-truth/contact-sheet.jpg)). The sim comparison also reported stored expected-hash drift.

Task edits remain uncommitted for the orchestrator.