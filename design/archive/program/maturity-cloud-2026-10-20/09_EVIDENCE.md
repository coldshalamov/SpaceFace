<!-- LIFETIME: DURABLE -->
# 09 · Source evidence, qualifications and reference lenses

## Baseline and method

Primary pinned source: `c25ee0770d3aafa7f172801763522525fd3a1608` on public master, retrieved through
the connected GitHub tools. Some code-search results pointed to later `1e7b59a0...` / `9cb7a5ed...`; those are
entry-point discovery, not proof that the pinned baseline contains a later behavior. Ordinary
source fetches below used the pinned baseline. Open PR descriptions were read separately.

No game build, native simulation, browser playtest or independent reviewer ran during this planning
session. Local artifact validation verifies documents/helper behavior only. These plans contain
proposed acceptance tests, not test results. Search presence does not prove default-route reachability;
a comment describing an intended feature does not prove its visible implementation.

## Source-grounded observations

| Source at baseline | Observed fact | Planning implication |
|---|---|---|
| `AGENTS.md`, `design/AGENTS.md`, `design/program/AGENTS.md` | Current map, existing owners, exact-path safety, ORRERY direction and production-first distinction | Do not add another queue, engine or universal audit tool |
| `build_map.md` §§1C/31/32 | Existing maturation, world, fitting, mission and boss rows | Crosswalk instead of duplicate tasks |
| `design/program/README.md` | Separate lifecycle and acceptance axes | Publication is not integration or route acceptance |
| `src/systems/mining.js`, lines 985–1065 | Ordinary material tag is used as exclusion in acquisition/extraction | D227 is real in this pinned source, but PR464 already owns repair |
| `src/ui/miningHud.js`, lines 180–330 | Existing player-filtered start/stop/heat/tick/rich-core event mirrors with teardown | Extend mining feedback here, not in a parallel HUD system |
| `src/ui/sectorPostcard.js`, lines 1–200 | `buildPostcard` reads the first global news log entry without local filtering in that function | CLOUD-02 requires local provenance and a truthful empty state |
| `src/ui/targetPanel.js`, lines 1–160 | Existing `livingWorkStatusText`; selection and engaged contact are explicitly different | CLOUD-03/04 preserve target identity; no new target system |
| `src/data/alienFauna.js`, lines 1–110 | Species grammar includes anatomy/stimuli; comments describe revelation >=2 | Trace scanner's actual revelation gate before exposing fields |
| `src/core/statistics.js`, lines 1–133 | Missing/invalid numeric inputs fall back to zero; grouped career/save read model exists | CLOUD-05 improves truth and highlights without writing counters |
| `src/ui/screens/statistics.js`, lines 1–114 | Real ORRERY-compatible screen reads careerStats and player.stats | Use existing screen, not a duplicate records modal |
| `src/systems/chronicler.js`, lines 1–130 | Public story views, fact-backed digest, source references and bounded citations exist | CLOUD-06 reuses these; no new memory store or fabricated offline events |
| `src/systems/routePlanner.js`, lines 1–190 | Pure discovered-graph route computation supports fuel/hops and non-consuming gate previews | CLOUD-07 compares these without calling side-effectful transit |
| `src/systems/shipCapabilities.js`, lines 1–150 | Four physical capability predictions already use live simulation laws | CLOUD-08 improves comparison; never rebuild the calculator |
| `src/systems/contractClauses.js`, lines 1–150 | Existing condition observer, mission-owned settlement and protected authored-source skip rules | CLOUD-09 extends one mission family, not the observer architecture |
| `src/systems/capitalBossEncounters.js`, lines 1–150 | Score-owned order/damage/voice facts and explicit rebind/detach lifecycle | CLOUD-10 displays score facts without changing combat |

`test/route-engage-action.test.mjs` was also read at the pinned baseline. It confirms the map
consumer is `src/ui/galaxyMap.js` and that plot, engage, interrupt and resume are distinct actions.
CLOUD-07 preserves those actions.

Canonical permalink prefix for all baseline sources:
`https://github.com/coldshalamov/SpaceFace/blob/c25ee0770d3aafa7f172801763522525fd3a1608/`
Append the exact repository path. Future agents must read current public source, not assume these
line numbers survive refactoring.

## Active work reviewed separately

Open PRs #457–480 were searched for collisions. Particularly relevant: #464 explicitly includes
ordinary metallic/crystal mineability while protecting authored optical structures; #459 repairs
restored local navigation; #458 owns cartography payment history; #461/#462/#466/#470/#474 and
#476–478/#480 implement worker motion/custody/rescue/Orchard work. They were open when checked,
not shipped features of the pinned baseline. Their focused and broader CI outcomes are not copied
into this pack as new measurements.

`NOW.md` and exact changed-file overlap must be refreshed before implementation. A clean public
branch does not establish that another agent has no uncommitted work on its own host.

## Explicitly unverified hypotheses

Coverage gaps in NPC interruption language, anatomy display, return recap, route comparison and
fit comparison require current consumer inspection. Their owners exist; this document does not
assert that every proposed detail is absent. Each packet has an already-implemented exit so an
agent does not produce a duplicate to satisfy an assignment count.

The escort successor is the most integration-sensitive packet. Existing mutation/settlement hooks
must be verified before committing to its implementation. If a new authority or schema is required,
return the precise missing dependency to the existing parent rather than disguising a framework
build as a one-shot. Boss readability likewise needs a reachable current encounter, not only data.

## Comparison lenses and limits

The previous discussion used Teardown/Just Cause for physical improvisation, Hades for run structure,
GTA/Red Dead for recognizable reactions, Factorio/X4 for supply chains, Everspace/Outer Wilds for
place and discovery, and Obra Dinn for evidence. Here these are design analogies and questions to
test in SpaceFace, not comparative benchmark measurements or verified claims of current feature
parity. No sales figures, review grades, market-conversion statistics or speculative valuations are
used to justify the implementation order.
