# 10 — Execution Roadmap

## Status

This is a dependency map and packet quarry, not automatic admission into the active global queue.

Packets use AE identifiers so they can be discussed without colliding with current PQ work. When implementation is formally admitted, map each bounded packet into the repo's active roadmap system rather than creating a competing status ledger.

## Phase 0 — Canon and collision cleanup

Goal:
one coherent ontology before code multiplication.

### AE-000 — Ratify ontology
Inputs:
00_CANON_SYNTHESIS.

Decisions:
- Vethari fungus is the single biological phenomenon;
- Understory is classification/ecology, not separate species;
- Vael are human;
- Verge-Layers are precursor machine institutions;
- creators remain off-frame/mythic.

Output:
canon patch list.

### AE-001 — Understory content census
Audit:
- faction file;
- encounters;
- assets;
- worldbuilding;
- Mycelia references;
- commodities;
- barks;
- maps.

Output:
keep/retcon/delete table.

### AE-002 — Vael alien-metadata census
Find every place where Vael being "alien" is mechanical or prose.

Output:
safe correction plan.

### AE-003 — Verge-Layer census
Audit existing precursor implementation and planned assets.

Output:
machine-layer reuse map.

### AE-004 — Vethari canon protection test
Create static/document check preventing accidental renderable Vethari body assets or direct combat roster entries unless owner explicitly changes canon.

Optional but valuable.

Exit:
no unresolved duplicate ontology.

## Phase 1 — Data foundations

### AE-010 — alienEcology data schema
Add pure data:
- contamination;
- strains;
- species;
- site profiles.

No runtime behavior yet.

### AE-011 — contamination helper
Pure deterministic C lookup.

### AE-012 — revelation vocabulary
Map player knowledge to scanner labels.

### AE-013 — Charon slice site definition
One zone/site.

### AE-014 — contaminated salvage metadata contract
One item class and quarantine state.

Exit:
tests prove clean core unchanged and slice data deterministic.

## Phase 2 — Infestation art foundation

### AE-020 — fungal surface language
Create art brief and material contract.

### AE-021 — filament kit
6–12 reusable modules.

### AE-022 — infestation placement anchors
Define deterministic attachment/placement method.

### AE-023 — Charon hero wreck dressing
Transform one existing wreck.

### AE-024 — spore/field VFX
Pooled effects.

### AE-025 — infestation LOD/perf pass
Prove density scales.

Exit:
one static infested site looks intentional at gameplay camera.

## Phase 3 — Fauna primitive

### AE-030 — fauna entity contract
Minimal entity metadata.

### AE-031 — drive state machine
IDLE/DRIFT/FORAGE/INVESTIGATE/DEFEND/FLEE etc.

### AE-032 — first fauna asset
Membrane ray or equivalent.

### AE-033 — group stimulus sharing
Low-cost local alert/interest propagation.

### AE-034 — relay coherence primitive
Relay modifies group behavior.

### AE-035 — relay creature asset
Blind Shepherd equivalent.

### AE-036 — hull leech behavior
Attachment mechanic.

### AE-037 — hull leech asset
Small hero interaction creature.

Exit:
fauna are recognizably non-human in behavior and not always hostile.

## Phase 4 — Charon vertical slice

### AE-040 — arrival pacing
Long/medium/close beats.

### AE-041 — scanner interactions
Unknown -> biological.

### AE-042 — power-restoration escalation
Player causally changes site.

### AE-043 — black-box objective
Reuse mission/salvage framework.

### AE-044 — aftermath states
Careful/relay destroyed/bloom/burned.

### AE-045 — persistence
Save/load.

### AE-046 — economy/research reward
First sample, no alien gun.

### AE-047 — audio pass
Field, fauna, attachment.

### AE-048 — player-facing review
Behavior comprehension.

### AE-049 — performance scenario
alien_charon_slice.

Hard gate:
No broad rollout before AE-040–049 passes.

## Phase 5 — Ecology toolkit

### AE-050 — species definition schema
Data-only extension.

### AE-051 — stimulus vocabulary
heat, vibration, scan, mass, weapon, precursor tone, spore density.

### AE-052 — host memory priors
Small deterministic vector.

### AE-053 — aggregation/LOD
Distant swarms and cosmetic microfauna.

### AE-054 — cyst carrier primitive
Rupture/transport.

### AE-055 — migration path primitive
Zone-to-zone route behavior.

### AE-056 — ecological interaction events
predation/feed/flee/relay.

### AE-057 — noncombat encounter support
Director can schedule ecology without hostile squad.

### AE-058 — scan anatomy
relay/cyst/host tissue.

### AE-059 — capture/relocation support
Massline-compatible.

Exit:
three distinct species can share one site and interact.

## Phase 6 — Content wave A: frontier ecology

### AE-060 — Lantern Cyst
### AE-061 — Casket Worm
### AE-062 — Bristle Ram
### AE-063 — Mourning Kite
### AE-064 — one Anchor Beast
### AE-065 — Charon second site
### AE-066 — Veil low-C site
### AE-067 — quarantine cargo encounter
### AE-068 — biological survey mission
### AE-069 — contaminated claim mission

Exit:
alien layer feels like ecology, not one location.

## Phase 7 — Contamination progression

### AE-070 — regional C map
Author baselines across live graph.

### AE-071 — world dressing integration
Growth density by C.

### AE-072 — encounter weighting integration
Ecology deck by C.

### AE-073 — scanner noise/field coherence presentation
### AE-074 — map contamination knowledge
### AE-075 — station quarantine rules
### AE-076 — filters/consumables
### AE-077 — contaminated salvage market
### AE-078 — faction-specific reactions
### AE-079 — revelation progression

Exit:
travel deeper visibly changes game texture.

## Phase 8 — Content wave B: active ecology

### AE-080 — Furnace Maw
### AE-081 — Glassback
### AE-082 — Wake Eel
### AE-083 — Spindle Mother
### AE-084 — Archive Crab
### AE-085 — integrated wreck colony
### AE-086 — colonized station section
### AE-087 — carrier-diversion mission
### AE-088 — relay-mapping mission
### AE-089 — missing-crew investigation

Exit:
C3 regions support varied sessions.

## Phase 9 — Precursor machine foundation

### AE-090 — Verge-Layer ontology patch
### AE-091 — protocol-state model
unknown/observed/compliant/witnessed/exception/violation/revoked.

### AE-092 — machine directive grammar
### AE-093 — Surveyor Prism behavior
### AE-094 — Custodian behavior
### AE-095 — Auditor behavior
### AE-096 — suppression field primitive
### AE-097 — precursor scan language
### AE-098 — gate protocol interaction
### AE-099 — machine audio identity

Exit:
one functioning machine encounter is memorable without combat.

## Phase 10 — Precursor structures

### AE-100 — quarantine pylon kit
### AE-101 — survey monolith
### AE-102 — null corridor
### AE-103 — gate-underlayer reveal
### AE-104 — machine ossuary
### AE-105 — black vault
### AE-106 — active maintenance scene
### AE-107 — machine/biology crossover encounter
### AE-108 — revoked route
### AE-109 — Witness Mark unlock

Exit:
players infer containment history spatially.

## Phase 11 — Deep-region progression

### AE-110 — C4 networked-region profile
### AE-111 — mixed-species relay encounter
### AE-112 — giant carrier
### AE-113 — transformed station/wreck complex
### AE-114 — deep filter route gate
### AE-115 — precursor safe corridor
### AE-116 — deep-trace memory event
### AE-117 — Wren field-recognition beat
### AE-118 — Vethari-scale architecture evidence
### AE-119 — domain-threshold audio/visual profile

Exit:
deep space feels categorically different from frontier.

## Phase 12 — Unlock economy

### AE-120 — Bio-Spectral Pass
### AE-121 — Field Coherence scanner
### AE-122 — Quarantine Locker
### AE-123 — Filter Stack
### AE-124 — Heat Lure
### AE-125 — Quiet Mask
### AE-126 — Relay Needle
### AE-127 — Capture Cradle
### AE-128 — precursor handshake
### AE-129 — containment seal / null map

Exit:
alien progression opens behaviors and routes, not only damage.

## Phase 13 — Faction integration

### AE-130 — Concord quarantine contract set
### AE-131 — Meridian xenotech extraction set
### AE-132 — DMC contaminated-worksite set
### AE-133 — Quiet sample-running set
### AE-134 — Reach weaponization set
### AE-135 — Free Frontier research set
### AE-136 — Choir relic interpretation set
### AE-137 — Vael containment clause set
### AE-138 — faction economy events
### AE-139 — faction consequence persistence

Exit:
same ecology produces different human stories.

## Phase 14 — Late-game setpieces

### AE-140 — first precursor intervention
### AE-141 — giant migration
### AE-142 — failed quarantine gate
### AE-143 — machine route revocation
### AE-144 — integrated wreck cathedral
### AE-145 — field silence / grief-static sequence
### AE-146 — Vethari vessel-scale shadow
### AE-147 — return-leg evidence
### AE-148 — creator-machine unresolved signal
### AE-149 — postgame deep route

Exit:
the alien arc has scale without normalizing the apex mystery.

## Phase 15 — Convergence

### AE-150 — full content census
### AE-151 — duplicate-mechanic removal
### AE-152 — ecology difficulty tuning
### AE-153 — economy tuning
### AE-154 — performance dense-scene pass
### AE-155 — save migration audit
### AE-156 — accessibility
### AE-157 — audio mix
### AE-158 — narrative terminology audit
### AE-159 — canon contradiction audit

## Recommended staffing

High-reasoning agents:
- ontology;
- architecture;
- systemic ecology;
- machine protocol;
- economy consequences;
- progression.

Art-capable agents:
- infestation kit;
- fauna silhouettes;
- precursor structures;
- hero sites.

Ordinary coding agents:
- data entries;
- encounter wiring;
- scanner labels;
- mission variants;
- deterministic tests;
- reward recipes.

Long-running clean VM:
- dense-scene performance comparison;
- asset admission/precompile;
- multi-site deterministic playthroughs.

## Parallelism

Safe parallel after foundations:
- infestation art and fauna behavior;
- mission writing and scanner taxonomy;
- precursor concept art and contamination data;
- faction contract writing and reward recipes.

Do not parallelize:
- competing contamination models;
- two fauna frameworks;
- multiple interpretations of Understory;
- multiple machine protocol systems;
- asset placement systems before one grammar is selected.

## First implementation sequence

If only ten packets are funded, do:

AE-000
AE-001
AE-010
AE-011
AE-020
AE-021
AE-030
AE-034
AE-040–046 as one bounded vertical-slice integration packet
AE-049

That yields evidence before commitment.

## Stop conditions

Stop scaling and fix foundation if:
- fauna mostly behave like enemy ships;
- contamination becomes palette/fog rather than ecology;
- every site needs bespoke code;
- adding one species requires edits across many unrelated systems;
- deep sectors hitch on first exposure;
- player receives alien DPS gear faster than understanding;
- Vethari become ordinary targets;
- precursor machines become another reputation faction.

## Definition of program success

The work is mature when:
- clean core remains clean;
- several alien species coexist;
- infestation can transform existing assets cheaply;
- the player can manipulate ecology;
- human factions create meaningful secondary conflicts;
- precursor machines open a second kind of mystery;
- deep travel has a clear escalation gradient;
- no apex mystery has been converted into routine content.
