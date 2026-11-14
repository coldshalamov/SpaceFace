# SpaceFace — build the places, finish the experience

**Experience commissioning library · v1.0 · 2026-11-08**

This package supplies **52 complete implementation commissions**: 25 sectors, 7 Swarm arenas, 4 Swarm round blocks, the separate authored thirty-wave Crucible, and 15 shared experiences. Each commission contains its own execution instructions. Give an agent the relevant Markdown file and repository access; it does not need this conversation or a second lead-agent prompt.

The design premise is simple: **a sector owner delivers a place someone can play in, not an inventory of things that might one day become that place.** Shared owners finish the camera, people/mission affordances, lighting, sound, combat, fitting, businesses, consequences and continuity that make those places work together. Geography determines the experience responsibility, not unlimited ownership of shared source files.

## What is already authored here

Every sector has an arrival treatment, spatial construction, recurring roles, useful ordinary work, headline jobs, smaller interactions, sensory direction, growing value, connections to other places, native reuse anchors, inspection questions, negative cases and an explicit completion decision. The 25 briefs allocate **40 headline mission slots, 76 smaller opportunities, 73 routine loops and 79 social/occupational roles**. These are authored coverage targets, not additional runtime entities or proof that all of them need new code. Reuse already-working content; expand the closest existing experience instead of duplicating it.

The 40 headline slots deliberately fit the native W2 forty-mission campaign. They are not another forty on top of it. The eight inherited Open Reach districts retain all 24 native opportunities; several are carried as smaller local stories, but none has been dropped from completion scope. New working titles are proposed slots, not automatically new runtime IDs or newly established canon.

The Swarm library separates **room design** from **wave composition**. An arena owner makes a room with a recognizable physical law; round-block owners improve the native planner across those rooms. The authored thirty-wave Crucible has a separate commission, because its finale and records must not leak into endless Swarm. Racing, practice, the Range and other public doors also have an owner, so they do not disappear behind the Adventure/Swarm priorities.

## Use one commission at a time per implementation owner

Select an area or shared owner from the index below. The agent reads the full file, inspects current native authority and source, checks claims/open PRs, and runs the ordinary player route before deciding what really needs building. Its first useful output is production work, not another campaign plan. It may delegate disjoint specialist work while retaining integration responsibility.

The file is a complete direct assignment. It does not contain a smaller prompt asking an agent to write another prompt. An excellent agent has latitude to improve staging, mechanism, dimensions, pacing and presentation, but cannot silently remove the named experience or swap a physical outcome for a menu acknowledgment.

For an already-open matching PR, the agent should continue that outcome where permissions, ownership and branch state permit. Otherwise use a focused dependent PR or a new area PR. A convenient unrelated UI branch is not an integration strategy. No commission authorizes merging, deploying or bypassing approval.

## A sensible first dispatch

Start with a **small coherent front**, not 52 uncoordinated writers:

- **Helios/Lantern Ward:** [EC-S01 — Helios Prime — A harbor worth coming home to](commissions/sectors/EC-S01-helios-prime.md). Complete the home port, its people, work and all three inherited stories. Use the existing lamp source rather than starting it again.
- **Foundry plus the first Swarm block:** [EC-A01 — Ricochet Foundry](commissions/swarm/EC-A01-ricochet-foundry.md) and [EC-Z01 — The Pack — rounds 1–10](commissions/swarm/EC-Z01-the-pack.md). These can be one accountable lead with two specialists, or two coordinated owners with disjoint room/planner paths. The first complete arcade route is the test.
- **The defects that would spoil both:** current engine owner uses [EC-G11 — A machine that keeps its promises — smoothness, residency and load](commissions/shared/EC-G11-a-machine-that-keeps-its-promises.md); camera owner uses [EC-G02 — The camera is a trustworthy instrument — scale, enclosure and navigation](commissions/shared/EC-G02-the-camera-is-a-trustworthy-instrument.md); current art/presentation owner uses [EC-G03 — A lit, materially coherent universe — environments, scale and asset integration](commissions/shared/EC-G03-a-lit-materially-coherent-universe.md). These are extensions of the existing lanes, not new competing teams. Keep the native X1 visual approval gate explicit.

Have [EC-G13 — Integration director — complete coverage without a new bureaucracy](commissions/shared/EC-G13-integration-director.md) integrate those outcomes through existing native status/claims. The next authored expansion is Ceres and Tethys, alongside people/interaction, meaningful fitting and ordinary work. Charon then proves visible consequences; Dione/Io and owned operations establish a growing political/economic world. Other sector owners can progress concurrently when their exact paths and shared interfaces are clear. This is a recommended order, not a replacement scheduler or a rule that all shared systems must be perfect before any content can ship.

## What “finished” means

A sector is not complete because a lamp pays credits, a worker animates, or a mission passes a fixture. Its **full named scope** must be reachable and coherent: approach, recognizable place, meaningful residents/routines, discoverable actions, actual outcomes, failure/recovery, continued value and truthful return after saving. The acceptance review also judges whether those pieces form an understandable and inviting place at the real gameplay camera.

Hard checks catch false state, broken transactions, dead routes and regressions. Subjective critique catches a dull composition, an unreadable interaction and a technically correct scene that still feels like an asset showroom. Neither replaces the other. Reviewers must cite concrete scenes and defects rather than declaring “optimal” without evidence. Current native batch rules govern checks; this pack does not demand an arbitrary ritual of reviewers, recordings or repeated green runs.

A PR can be a useful intermediate delivery without closing the area. A session limit is a checkpoint. A genuinely missing tool or shared dependency must be named and its affected acceptance left open, while other eligible work continues. No one must pretend an agent can run indefinitely; no one should treat a session boundary as proof that the job is finished.

## Deduplication and source truth

The source review is pinned to `f95de0eb1ba7560839209936afba48c7b96fe41a`. The build-map header closes old dispatch and points to the current master plan/lanes; INFERENCE §0.2 explicitly permits this kind of area ownership. This package maps to those parents and preserves their existing IDs. **EC labels are document addresses, not new queue entries.**

The parent/experience overlap has been reconciled. The entire current INFERENCE catalog, every working-tree hunk and every live PR were not exhaustively certified. They can also change between this document and execution. Use the included read-only reconciliation tool against the actual checkout before assigning edits, and inspect the live PRs through the available GitHub/local workflow. It searches complete local board files; its matches are review candidates, not proof that a feature is done.

```bash
python /path/to/SpaceFace_Experience_Commissions_v1/tools/reconcile.py --repo /path/to/SpaceFace --commission EC-S01
```

The tool reads files and Git metadata only. It does not execute repository scripts, claim work, edit a board, fetch a remote, merge anything or install packages. Missing files are reported as unknown, not as empty/complete. See [the native crosswalk](02_NATIVE_CROSSWALK.md) and [source notes](04_SOURCE_NOTES.md).

## Browse the library

Open `SpaceFace_Commission_Library.html` locally for search, category filtering, native-parent information and a **Copy full commission** button. It uses no external scripts, fonts, network calls or services. The Markdown files are the canonical editable deliverables; the HTML is a convenience viewer. The full text is included, not linked to a future deliverable.

### Adventure — all 25 sectors

| Commission | Existing sector | Headline jobs | Smaller opportunities |
|---|---|---|---|
| [EC-S01 — Helios Prime — A harbor worth coming home to](commissions/sectors/EC-S01-helios-prime.md) | sector_helios_prime | 3 | 4 |
| [EC-S02 — Ceres Belt — The mountain has mouths, and people work inside them](commissions/sectors/EC-S02-ceres-belt.md) | sector_ceres_belt | 3 | 3 |
| [EC-S03 — Tethys Junction — A town built in the wrong siding](commissions/sectors/EC-S03-tethys-junction.md) | sector_tethys_junction | 3 | 4 |
| [EC-S04 — Dione Lane — The standing army has a morning routine](commissions/sectors/EC-S04-dione-lane.md) | sector_dione_lane | 3 | 3 |
| [EC-S05 — Vesta Forge — Ore becomes something you can bolt to your ship](commissions/sectors/EC-S05-vesta-forge.md) | sector_vesta_forge | 2 | 3 |
| [EC-S06 — Pallas Drift — A street through the ribs of dead ships](commissions/sectors/EC-S06-pallas-drift.md) | sector_pallas_drift | 2 | 3 |
| [EC-S07 — Sker Haven — Hospitality has a price, and a workshop](commissions/sectors/EC-S07-sker-haven.md) | sector_sker_haven | 2 | 3 |
| [EC-S08 — Io Reach — The flag changes; the mail still comes](commissions/sectors/EC-S08-io-reach.md) | sector_io_reach | 2 | 3 |
| [EC-S09 — Charon Expanse — A garden can become a siege without changing its address](commissions/sectors/EC-S09-charon-expanse.md) | sector_charon_expanse | 2 | 3 |
| [EC-S10 — Veil Nebula — The instrument is useful before the mystery is explained](commissions/sectors/EC-S10-veil-nebula.md) | sector_veil_nebula | 1 | 3 |
| [EC-S11 — Ashfall Reach — The sky is a hull, and people live in its scars](commissions/sectors/EC-S11-ashfall-reach.md) | sector_ashfall_reach | 2 | 3 |
| [EC-S12 — Nyx March — The freight without papers still belongs to somebody](commissions/sectors/EC-S12-nyx-march.md) | sector_nyx_march | 1 | 3 |
| [EC-S13 — Hyperion Cut — A heavy load teaches the shape of the yard](commissions/sectors/EC-S13-hyperion-cut.md) | sector_hyperion_cut | 1 | 3 |
| [EC-S14 — Kepler Scar — A market beneath a capsized hull](commissions/sectors/EC-S14-kepler-scar.md) | sector_kepler_scar | 1 | 3 |
| [EC-S15 — Orcus Shadow — One courier is enough to make silence inhabited](commissions/sectors/EC-S15-orcus-shadow.md) | sector_orcus_shadow | 1 | 2 |
| [EC-S16 — Rhea Cinder — The cargo is hot before anyone steals it](commissions/sectors/EC-S16-rhea-cinder.md) | sector_rhea_cinder | 1 | 3 |
| [EC-S17 — Haumea Rift — The ice answers when you ask it properly](commissions/sectors/EC-S17-haumea-rift.md) | sector_haumea_rift | 1 | 3 |
| [EC-S18 — Eris Margin — The gap in the sweep is a road](commissions/sectors/EC-S18-eris-margin.md) | sector_eris_margin | 1 | 3 |
| [EC-S19 — Phoebe Echo — A refuge where quiet is an action](commissions/sectors/EC-S19-phoebe-echo.md) | sector_phoebe_echo | 2 | 3 |
| [EC-S20 — Nereid Shoal — A shift measured in ice and a fair scale](commissions/sectors/EC-S20-nereid-shoal.md) | sector_nereid_shoal | 1 | 3 |
| [EC-S21 — Proteus Well — The sounding is not the sale](commissions/sectors/EC-S21-proteus-well.md) | sector_proteus_well | 1 | 3 |
| [EC-S22 — Triton Wake — The only witness is moving](commissions/sectors/EC-S22-triton-wake.md) | sector_triton_wake | 1 | 3 |
| [EC-S23 — Eunomia Gulf — Salvage with witnesses](commissions/sectors/EC-S23-eunomia-gulf.md) | sector_eunomia_gulf | 1 | 3 |
| [EC-S24 — Sedna Dark — A lit window at the edge is not a fuel pump](commissions/sectors/EC-S24-sedna-dark.md) | sector_sedna_dark | 1 | 3 |
| [EC-S25 — The Bolus — Inside a machine that has become something else](commissions/sectors/EC-S25-the-bolus.md) | sector_the_bolus | 1 | 3 |

### Swarm and the authored Crucible

| Commission | Scope |
|---|---|
| [EC-A01 — Ricochet Foundry](commissions/swarm/EC-A01-ricochet-foundry.md) | helios_core |
| [EC-A02 — Lagrange Crucible](commissions/swarm/EC-A02-lagrange-crucible.md) | lagrange_crucible |
| [EC-A03 — Cinder Sluice](commissions/swarm/EC-A03-cinder-sluice.md) | cinder_sluice |
| [EC-A04 — Cryo Drift](commissions/swarm/EC-A04-cryo-drift.md) | cryo_drift |
| [EC-A05 — Storm Lattice](commissions/swarm/EC-A05-storm-lattice.md) | storm_lattice |
| [EC-A06 — Asteroid Mill](commissions/swarm/EC-A06-asteroid-mill.md) | asteroid_mill |
| [EC-A07 — The Hive](commissions/swarm/EC-A07-the-hive.md) | the_hive |
| [EC-Z01 — The Pack — rounds 1–10](commissions/swarm/EC-Z01-the-pack.md) | 1–10 |
| [EC-Z02 — The Wing — rounds 11–20](commissions/swarm/EC-Z02-the-wing.md) | 11–20 |
| [EC-Z03 — The Anvil — rounds 21–30](commissions/swarm/EC-Z03-the-anvil.md) | 21–30 |
| [EC-Z04 — The Choir — rounds 31–40 and continued mastery](commissions/swarm/EC-Z04-the-choir.md) | 31–40 |
| [EC-C01 — The thirty-wave Crucible — a course with an ending](commissions/swarm/EC-C01-the-thirty-wave-crucible.md) | Separate thirty-wave arc |

### Shared experiences

| Commission | Native parents |
|---|---|
| [EC-G01 — People with addresses — residents, conversations and mission signals](commissions/shared/EC-G01-people-with-addresses.md) | W4, W5, X3, X5, LW-02 |
| [EC-G02 — The camera is a trustworthy instrument — scale, enclosure and navigation](commissions/shared/EC-G02-the-camera-is-a-trustworthy-instrument.md) | X5, W3, E1, LW-07, LW-08 |
| [EC-G03 — A lit, materially coherent universe — environments, scale and asset integration](commissions/shared/EC-G03-a-lit-materially-coherent-universe.md) | X1, X2, E6, E7, W3, P4 |
| [EC-G04 — The universe answers — audio, music and physical feedback](commissions/shared/EC-G04-the-universe-answers.md) | X4, X3, W3, SWARM |
| [EC-G05 — Own places, operate routes, change the balance of the galaxy](commissions/shared/EC-G05-own-places-operate-routes-change-the-balance-of-the-galaxy.md) | W1, P3, W3, PQ-177, PQ-155, LW-11, LW-12 |
| [EC-G06 — The world bears the result — visible consequences, infestation and recovery](commissions/shared/EC-G06-the-world-bears-the-result.md) | W3, W4, LW-09, LW-11, PQ-151 |
| [EC-G07 — A ship you build and keep — meaningful fittings and physical identity](commissions/shared/EC-G07-a-ship-you-build-and-keep.md) | P1, P2, P3, P4 |
| [EC-G08 — Combat worth mastering — shared verbs and enemy character](commissions/shared/EC-G08-combat-worth-mastering.md) | SWARM, PQ-137, PQ-139, PQ-140, PQ-174, PQ-175, PQ-176 |
| [EC-G09 — One continuing Adventure — campaign, contacts and long-term progression](commissions/shared/EC-G09-one-continuing-adventure.md) | W1, W4, P3, LW-11, LW-12 |
| [EC-G10 — The first hour is already the game](commissions/shared/EC-G10-the-first-hour-is-already-the-game.md) | W5, W1, X3, X5 |
| [EC-G11 — A machine that keeps its promises — smoothness, residency and load](commissions/shared/EC-G11-a-machine-that-keeps-its-promises.md) | E1, E2, E3, E4, E5, E6, E7, E8, E9, E10 |
| [EC-G12 — Persistence and recovery — the same universe after Continue](commissions/shared/EC-G12-persistence-and-recovery.md) | Q2, Q5, W1, P3, LW-02 |
| [EC-G13 — Integration director — complete coverage without a new bureaucracy](commissions/shared/EC-G13-integration-director.md) | Q1, Q2, Q3, Q4, Q5, W2, W3 |
| [EC-G14 — Finish the other doors — racing, practice and public mode continuity](commissions/shared/EC-G14-finish-the-other-doors.md) | X5, Q2, Q5, RF-01, RF-02, RF-03, RF-08 |
| [EC-G15 — Work that is enjoyable — mining, trade, salvage and rescue loops](commissions/shared/EC-G15-work-that-is-enjoyable.md) | W2, W5, PQ-177, PQ-155, PQ-151, PQ-148 |

## Package contents

`01_EXPERIENCE_STANDARD.md` holds the common product/production standard. `02_NATIVE_CROSSWALK.md` explains overlap and authority. `03_COVERAGE_AND_INTEGRATION.md` provides the coverage and interface map. `04_SOURCE_NOTES.md` distinguishes evidence from authored proposals. `05_WORKING_WITH_OPEN_PRS.md` describes continuation without scope drift. `manifest.json` is a read-only inventory; `sources.json` records source references. Templates are short PR/checkpoint aids to use inside existing owner workflows, not another report bureaucracy. Tools include reconciliation, structural validation and offline fixture tests.

**This delivery is the specification library, not an implementation of the game. No repository branch, PR, runtime file or board status was changed while authoring it. No live playthrough or hardware-performance verdict is claimed.**
