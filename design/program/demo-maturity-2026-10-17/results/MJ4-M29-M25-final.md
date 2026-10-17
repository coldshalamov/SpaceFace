M29 now supports both machine orderings, remembers protocol progress across reload, and explains wrong-order refusals.

M25 now lets players compare strains, stimulate a recorded path, and follow it to a physical dock register with salvage and a research outcome that settles once.

Protocol state stays with the machine runtime. Fossil progress uses the site save owner, existing ecology movement, and the existing decision deck.

Changed files:

- Runtime: [machineWork.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/systems/machineWork.js), [asteroidSites.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/systems/asteroidSites.js), [motionFossil.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/world/motionFossil.js)
- Wiring: [physicalJobsPrompt.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/physicalJobsPrompt.js), [mainToSimEventSurface.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/core/mainToSimEventSurface.js), [index.html](/C:/Users/93rob/Documents/GitHub/SpaceFace/index.html)
- Tests: [m29-two-correct-orders.test.mjs](/C:/Users/93rob/Documents/GitHub/SpaceFace/test/m29-two-correct-orders.test.mjs), [m25-fossil-made-of-motion.test.mjs](/C:/Users/93rob/Documents/GitHub/SpaceFace/test/m25-fossil-made-of-motion.test.mjs), [batch3-machine-procedures.test.mjs](/C:/Users/93rob/Documents/GitHub/SpaceFace/test/batch3-machine-procedures.test.mjs), [helpers/mj4-site-runtime.mjs](/C:/Users/93rob/Documents/GitHub/SpaceFace/test/helpers/mj4-site-runtime.mjs)

Validation: **M29 5/5; M25 7/7; combined runtime suite 60/60.** Prompt/event tests, save schema, and preload checks passed.

Adjacent issue: V3 reload hashes match, but comparison reports an expected-golden hash mismatch; the golden remains untouched. Browser acceptance was not run.

Left unstaged and uncommitted as required by the campaign constraints.