# Sources and inspection record

Repository: coldshalamov/SpaceFace. Pinned snapshot: `1e0cf9499613b7c3acad10f34739278136d3d469`. Inspection date: 2026-10-03.

This was a targeted source/design review through the connected GitHub tool. It was not an exhaustive repository census, a local clone, a gameplay playtest, an asset-load test, or a frame-time benchmark. Files mentioned as adjacent integration seams may be confirmed by registry imports rather than fully read. Proposed function signatures and new content ids must be revalidated before implementation.

The user's earlier reports about weak loading, enemy readability, camera clipping and loadout UI are treated as reported problems—not reproduced defects. Prior knowledge of MORROW and VESPER is reinforced by their registration; their complete current implementations were not audited. RAVEL and KNELL were flagged from recent project context as potential overlap; their current branch/merge state remains unverified and must be checked during rebase.

## Repository evidence

### R01 — README / project scope

Inspected project description. Its inventory counts are not treated as current authoritative census.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/README.md

### R02 — Owner vision

Read lines 1–165. Physical agency, working traffic chains, simple inputs and failure that creates new situations.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md

### R03 — Engineering / creative contracts

Inspected architecture, current owners, runtime selection, deterministic simulation, Forge and ORRERY rules.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md

### R04 — Forge asset pipeline

Inspected complete returned document. Author axes, finishes, silhouette-first review, release commands and LOD guidance.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/tools/blender/forge/FORGE.md

### R05 — Enemy roster

Inspected opening roles plus lines 230–410: real silhouettes, physical classes, mining/escort/patrol specializations.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/enemies.js

### R06 — Specialists / Crucible bosses

Read lines 405–560: tether controller, field anchor, Mirrorjaw and Forge Regent; run payout warning.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/enemies.js#L405-L560

### R07 — Live system registration

Read lines 1–170. Confirms registered integration families, not that every gameplay path passes tests.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170

### R08 — Existing authored places

Read lines 1–155: Driftmark, Anvil, Prism Gallery, Throughline and Cinder Nursery.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/authoredPlaces.js#L1-L155

### R09 — Contact / work-role affordances

Read lines 1–110: existing service incidents, work roles, heave-to and cargo-related hails.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/contactHail.js#L1-L110

### R10 — Existing BRACKET character

Read returned file: five-shot physical game, distinctive dialogue and persistent memory.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/bracket.js

### R11 — Existing nemesis owner

Read lines 1–100: evidence-gated named rival, memory, witnessed events, save/load and single-writer behavior.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/systems/nemesis.js#L1-L100

### R12 — Existing fauna grammar

Read lines 1–145: noncombat ecological drives, nonhostile sighting rule, veil_ray sensitivity and collision-free semantic radius.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/alienFauna.js#L1-L145

### R13 — Existing machine ontology

Read lines 1–125: rule-bound machines, off-frame creators, protocol states, auditor/courier/conservator families.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/precursorMachines.js#L1-L125

### R14 — Current design authority

Inspected returned opening sections: Massline near-unbreakability, engineered cuts, physical counters, UI clarity, no engine rewrite.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/GDD_2_0.md

### R15 — Place registration contract

Read lines 1–180: local coordinates, additive zones, atlas gates, proxy cap and no required bespoke art.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/PLACE_REGISTRATION.md#L1-L180

## Comparative and technical primary sources

Accessed 2026-10-03. These support the stated design affordances; they are not controlled evidence that copying a mechanic will improve retention. No popularity or sales ranking was performed.

### E01 — Outer Wilds — Mobius Digital

Handcrafted, changing places invite questions answered by exploration. Transfer the question-to-observation structure, not its time-loop or visual identity.

https://www.mobiusdigitalgames.com/outer-wilds.html

### E02 — Into the Breach — Subset Games

The official design description foregrounds visible enemy attacks and defending civilian structures. Transfer readable intent and displacement consequences into real time; do not copy a turn-based UI literally.

https://subsetgames.com/itb.html

### E03 — Hardspace: Shipbreaker — Blackbird Interactive

Salvage uses physical tools on layered ships with hazards. Transfer inspect–manipulate–recover causality, not first-person cutting technology or the setting.

https://www.blackbirdinteractive.com/shipbreaker

### E04 — Hades — developer-authored Steam page

The description emphasizes a voiced cast, growing relationships and story across repeated attempts. Transfer short state-aware returns to familiar people; do not imitate its characters or promise comparable writing volume.

https://store.steampowered.com/app/1145360/Hades/

### E05 — Endless Sky — official project site

Trading, passenger transport, missions and ship improvement coexist in an explorable galaxy. Transfer overlapping livelihoods and optional routes, not galaxy size as an end in itself.

https://endless-sky.github.io/

### T01 — Three.js GLTFLoader

Current upstream loading/decoder documentation; verify against the repository’s vendored version before use.

https://threejs.org/docs/pages/GLTFLoader.html

### T02 — Three.js KTX2Loader

Current upstream texture-transcoding documentation; preserve the project’s configured loader and device support path.

https://threejs.org/docs/pages/KTX2Loader.html
