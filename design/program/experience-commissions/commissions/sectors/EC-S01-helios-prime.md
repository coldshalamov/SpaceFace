# EC-S01 — Helios Prime — A harbor worth coming home to

## Director's card — read this first

*From the creative director, 2026-11-09. The standard, the cast and the build order are in [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md). Where this card and the brief below disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins.*

**Tier A — one of the five towns.** Full recipe, finished standard. This town also holds a *weight gate* (EC-G19): something visible from the first visit that the player cannot move yet, and can once their Line Class is high enough. It moves or it does not; no lock, no level text.

**One line:** the harbor where every family keeps a lamp lit, and one is dark.

**Landmark:** the Candle Fleet — a crescent of forty lived-in hulls, each with one big lamp; the clean white Tower behind it with every light on. **Shift:** Lamps-Up. The harbor horn sounds, shuttles flip direction, the crescent lights lamp by lamp. **Toy:** the Slipway — a curved rail tugs use to sling loads across the harbor; fly into it and it slings you.

**Faces:** **Orla Venn**, lamp-crew chief, checks every clip twice — *"Clip. Then clip again."* · **Pell Arroway**, front desk, hands out the first job and remembers if you finished it — *"Sign here. No, with the ship."* · **Late Benny** (Road Cast) and his bus *Patience*, always behind, always arrives — *"We leave when we leave."*

**Argument:** when power runs short the Fleet's lamps dim and the Tower's never do. **Your mark:** the Venns hang a small lamp for you on the crescent. It is lit whenever you are in the system. That lamp is "home".

**First 90 seconds:** you undock into somebody else's morning — a tug crosses your nose, a shuttle yields to it, the horn goes, the crescent lights up and you can see the gap. Orla hails: *"You've got a rope. We've got a lamp on the wrong side of the harbor."*

**Build first (Slice 1):** The Empty Plinth, with the Slipway, the three faces and your lamp. This is the pilot town: the shared Place Kit (faces, shift, toy, mark, berth board) is built here and lifted out for every other town.

### How to build this town and check your own work

Work in this order. Each step ends with something you looked at.

1. **Look first.** Arrive by the ordinary route and capture what a stranger sees today (`node scripts/capture-sector-identity.mjs` covers Helios and Ceres; for other sectors copy it for yours until the `look` tool from EC-G17 exists). Write the five Stranger Test answers for the place *as it is now* in the PR. That is your "before".
2. **Build the toy alone**, in the no-boot simulation lab (`node scripts/agent-loop.mjs sim <scenario> --trace`), until it is fun with nothing else in the scene. The jobs lean on it.
3. **Then faces, then the shift, then your mark** — each through the system that already owns it (contacts, broadcasts, world records). Do not start a parallel one.
4. **After every step:** the one narrow test (`node --test test/<file>`), then `npm run test:fast`. Never run the full `npm run check` while something is red, and never use the long playthrough battery as a per-change check.
5. **Does it still boot and fly:** `node scripts/check-game-playable.mjs`.
6. **Did it cost frames:** `node scripts/check-hitch-budget.mjs --out=<file>` before and after, back to back in one sitting (this machine swings from 60 to 40 with background load, so a comparison across sessions means nothing).
7. **Stranger Test:** give a fresh agent only your captures — not this file, not the code — and the five questions. Put its answers in the PR, unedited.

**The ways agents have fooled themselves on this project. Check each before you say done.**
- *Green test, nothing on screen.* The thing is defined in data and never appears in play. Go and find it in the running game.
- *Reachable only by a flag, a debug spawn or a test fixture.* A player cannot get there. It is not built.
- *Decoration without behaviour.* A lit window nobody is behind. A crane that does not lift.
- *The working folder passes and the commit does not.* Commit exact paths, then check what you committed, not what is on disk.
- *A reference result edited to make a check pass.* Never.
- *"Done" on a partial.* Say what works, what does not, and what you could not look at.

**How to use this card.** Bold names are fixed so the world stays consistent; everything else is yours to invent — decide, build, look. If an existing character already fills a face's role, keep their name and give them this want and this line. If an idea here plays badly, replace it with something that fills the same line of the Town Recipe and say so in the PR. **This PR is ready when Slice 1 passes the Stranger Test.** The brief's remaining jobs follow in a second PR on the same place.

---

**Direct execution commission · Sector completion**  
**Native parents:** `W2`, `W3`, `W4`, `W5`, `LW-01`, `LW-02`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  
**Existing identity:** `sector_helios_prime`  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## The place you are making

The first thing the pilot sees is someone else having a day. A shuttle yields to a repair tug. Work lamps pick out a worn service arch. Beyond the arch, the Candle Fleet hangs in a crescent of inhabited machinery, not in a museum of isolated props. One family lamp is waiting for a repair. Farther away, the clean administrative tower has all its lights. The harbor offers room to make a clumsy approach without punishment. It should feel generous, busy and quietly unequal: a place whose ordinary kindness is made of people continuing to work.

## Bounded scope and initial composition targets

Own the whole playable sector experience, using **Lantern Ward** as the center of composition rather than deleting the rest of the sector. Complete **3 headline job(s), 4 smaller opportunities, 4 purposeful routine loops, and 4 recurring social/occupational roles** described below. Roles may share native actors; this is not an additive actor-spawn quota. Existing compatible content counts when it genuinely satisfies the outcome; do not create duplicate jobs merely to reach a number.

Start from **4 connected pockets**, approximately **2–4 S** across the local authored experience. Measure S at the default gameplay camera before using it; retain the sector's existing larger geography. Aim for **10–25 seconds** between useful observations/actions along the intended local route. A headline job's first complete approach may occupy roughly **8–12 minutes**; small opportunities generally occupy 20–120 seconds. These are **proposed pacing/composition bands, not measured current values, forced timers, required runtime clocks or rigid acceptance thresholds**. Adjust with evidence when the result plays better. A protected first-home loop, not an arena. Ordinary work remains visible while the novice learns.

Show at least one routine's actual source, work and destination on an ordinary visit. Different visits may expose different phases; no quest acceptance is required to start local life. Use native simulation/actor budgets, not every role and event simultaneously. The numbers define authored coverage, while production must measure and bound actual concurrent load. No more than one incident may demand urgent attention at a time.

**Inherited Open Reach scope:** `lw_helios_empty_plinth`, `lw_helios_shift_change`, `lw_helios_borrowed_cradle`. All three remain mandatory, even when one appears below as a smaller opportunity rather than a headline slot. Do not reduce the original district brief.

## Spatial construction and navigation

Compose four connected pockets: a broad public approach, the memorial-side repair court, passenger berths, and a market/service frontage. The public approach frames both a recognizable destination and a reachable human contact. The repair court remains visible from the passenger route; neither the tug nor the player must cross a blind collision funnel. Keep a wide novice bypass outside the work. Preserve the canonical dark twenty-fifth memorial plinth: the family service lamp is an adjoining object, not a replacement for that narrative identity. Keep Helios sanctuary and its hostile-spawn protections.

## Residents and institutional character

- The Venn-family service crew knows exactly which lamp is theirs; the worker checks a retaining clip twice and has no interest in delivering an exposition monologue.
- The shuttle pilot remembers who cleared the route and who blocked it. They are busy, not eternally waiting for the protagonist.
- A service/front-desk contact offers one comprehensible first job and a useful follow-up; bind an appropriate existing contact rather than minting a rival tutorial NPC.
- A licensed salvor and the standing patrol establish that work and law continue outside the player’s quest.

## Ordinary life, even without an accepted mission

- Repair crew fetches the actual component, brings it to the actual socket, performs attended work, then returns its tool. A missing component changes the routine.
- The shuttle follows meaningful berth-to-berth service with approach, yield, dwell and departure. It does not circle the memorial forever.
- A hauler exchanges finite cargo at a recognizable receiver; a salvor brings useful material back from a real work destination.
- Maintenance services a visible shutter or worklight; the service state, motion and sound stop when the job stops.

## Headline jobs — complete playable sequences

### 1. The Empty Plinth

**Binding:** `lw_helios_empty_plinth`. Preserve the native opportunity identity and extend its current implementation.

Notice the blocked lamp service without accepting a quest. Hail the crew or simply inspect the physical problem. Clear the obstruction, carry the authentic lamp/cradle, or help by recovering its missing part. The complication is the actual shuttle/load clearance, not a surprise pirate attack. The crew installs the correct lamp only when its real requirements are met. Return after departure and Continue to see the same working circuit and a specific acknowledgment. Taking or damaging the object creates truthful shortage and restitution, not a fabricated successful repair.

### 2. Five Minutes Late

**Binding:** `lw_helios_shift_change`. Preserve the native opportunity identity and extend its current implementation.

Meet a shift shuttle trying to reach its berth through a preventable traffic knot. Let the player tow the blocking load, coordinate the other working vessel through existing interactions, or escort an alternate safe route. Establish a visible timetable without turning a first-hour lesson into a lethal timer. The climax is a physically completed docking/transfer. The next shift uses the changed route, and the pilot’s remembered response differs from the lamp crew’s.

### 3. Borrowed, According to You

**Binding:** `lw_helios_borrowed_cradle`. Preserve the native opportunity identity and extend its current implementation.

The cradle is useful beyond the family job. Make its ownership and available permission readable before the player takes it. Borrow and return, compensate its owner, or deliberately steal it through the native custody/law path. Use it on a real load; do not award a menu token called a cradle. A player who returns it late finds someone whose work genuinely waited. Preserve the original hull, cargo and tool identity through leave/return and saving.

## Smaller opportunities and return reasons

- Recover a dropped workpiece and place it at the correct receiver; a brief service gesture acknowledges it.
- An available contract becomes a distinct return marker at the same reachable person after completion.
- A repaired small sign or worklight makes one route easier to read on the next visit.
- A local cargo shortage visibly pauses one stall or repair job until a replacement arrives.

## Light, material, motion and sound

Warm service light, cool navigational light, legible painted surfaces, long structural shadows and quiet domestic windows. Light must describe occupied volumes and work surfaces, not wash the whole sector orange. Hear the shuttle before it crosses, but show its approach clearly with audio muted. The memorial is a composed silhouette at normal play zoom, not tiny ornaments requiring a photo mode.

## Continuing value and visible consequences

This is the player’s first recurring base, not a disposable tutorial. Let earned trust improve access to storage, useful fittings or local work under native progression. Later wealth can fund visible repair/service improvements without buying away the harbor’s identity or turning sanctuary into an involuntary siege.

## Connections beyond this sector

These are proposed causal relationships to realize through existing topology and owners, not new jump links or proof that the shipment already exists.

- Ceres supplies real repair material.
- Tethys carries household freight.
- Dione policy changes may affect peripheral deliveries, never silently strand the new pilot.

## Reuse and deduplication anchors

Inspect these live paths first; their presence does not establish player-route acceptance. The paths are starting points, not blanket write reservations.

- `src/data/lanternWardLayout.js`
- `src/data/lanternWardHardware.js`
- `src/systems/lanternWardWork.js`
- `src/missions/lanternWardStory.js`
- `src/data/lanternWardGuidance.js`
- `src/ui/station/barContacts.js`

## Questions you must answer by inspecting and playing

These questions are your design/research work, not a questionnaire to send back to the owner.

1. From the ordinary arrival, which promised places, people and activities actually appear, at what scale, and how does a stranger find the first useful action? Which apparent absence is a broken connection rather than missing content?
2. What is the smallest spatial arrangement that lets the place's work be understood and physically interrupted? Where are the approach, destination, alternate path and retreat, including a large legal hull and its load?
3. Which existing encounter/contact/asset already serves each named obligation? Which needs expansion, which should be merged into the same story, and which genuinely requires new production?
4. What currently makes interaction unpleasant: camera motion, invisible collision, weak lighting, poor targeting, instructions, latency, missing audio, an unclear outcome, or a dead return path? Reproduce the cause before choosing a remedy.
5. What happens when the player ignores the quest, helps before accepting it, moves the object, fails, leaves, saves, returns, changes ship, or approaches with no sound? What state survives, who owns it, and how does the player perceive it?
6. After all enumerated pieces work, what still makes the area feel like a demonstration rather than a place? Make the highest-impact composition and interaction corrections inside this scope. Do not answer thinness by multiplying decorative entities.

## Area-wide construction and acceptance standard

**Spatial design.** Measure one default gameplay-screen width in world units, denoted S, and the reference starter/tug/large-hull envelopes before placing geometry. Use the travel-time and screen-space bands in this brief as first-pass composition targets, then tune by playing. Keep existing sector IDs, coordinate frames, saved sites, gates and required routes. A district is a composition within the current sector, not a replacement map. Its entrance, center, working edge, refuge and departure must be intelligible without its nameplate. Functional geometry needs believable clearance, a reverse path, and honest collision; an enormous bounding sphere is not an interior.

**Density is an experience, not a spawn count.** Quiet, working and hub profiles intentionally differ. In a working neighborhood, a normal 60–90-second approach should reveal work in progress, a reachable person or service, and an optional intervention, without obliging the player to accept a quest. More than one of these can be the same well-composed event. Along connective travel, let the player see a destination before the current activity exhausts itself. Preserve deliberate silence at the frontier. At most one urgent local incident should seize attention; other routines can remain calm. Do not place an event every fixed number of seconds or create artificial interruptions while someone is reading.

**People have addresses.** Give recurring residents a physically recognizable berth, ship, machine or inhabited threshold; attach their canonical identity to it. Hailing/approaching uses a discoverable contextual action, a concise voice, and optional further conversation through existing contact UI. Make available work, active work and ready-to-return outcomes distinguishable by icon shape plus text/accessibility treatment, not color alone. Only eligible offers receive markers; resolved markers disappear; moved actors remain findable. Dialogue can be optional, but an actor must have a job, an attitude and an observable response. Do not clone a bar contact into an unrelated in-world person or create a generic exclamation-mark carpet.

**Required event depth.** For each headline sequence implement: discoverable setup; an understandable physical or strategic problem; at least two materially different approaches; a complication caused by an actual state change; a playable climax; settlement through the existing owner; and persistent return/recovery. Extra dialogue choices that trigger the same operation are not different approaches. Smaller opportunities may be brief, but must still connect to real work and a visible result. Existing equivalents can satisfy a slot when they meet its promise; upgrade them rather than adding duplicates. These are floors for completeness, not encouragement to pad the map with weak missions.

**World state must be seen.** Every major local consequence changes at least one physical or operational fact—an open berth, a repaired device, a supply queue, a resident's location, a patrol route, an infected surface—and, where relevant, one economic/social fact. Both come from committed state. Leaving, saving, continuing and returning must preserve the same causal result. Do not award a clean service visually while the cargo owner rejected delivery. Failure should create a recoverable problem or honest alternative where possible, not an unannounced permanent loss of the entire area's usefulness.

**A finite acceptance boundary.** Close the commission only when all named headline slots, all explicitly inherited LW opportunities, the specified ordinary routines, usable services/contacts, return states and required connections are working on ordinary routes. No known crash, save corruption, progression softlock, inaccessible required interaction, misleading consequence or materially broken camera/control remains within the scope. Count coverage by outcomes, not lines of code. Attractive optional extras may remain for a later PR; unexplained omissions of promised behavior may not.

**Judge the experience, not just the checklist.** A reviewer playing without this brief must be able to explain what this place is for, who is here, what can be done now, what changed after their action, and why they might return. They must point to screen-visible evidence, not quote the implementation. A place with the right objects but no readable routes, no convincing light, dead conversations or dull interaction fails even if its logic tests pass. Obtain a combined independent product/engineering critique where available. A specific subjective defect is actionable: “the service court reads as an empty parking lot” demands composition and activity, not a documentation fix. Do not claim perfection or stop on an unexplained score.

**Exercise the real negative paths.** Cover first visit without an accepted quest; the intended mission route; a plausible alternative; interruption/rejection; departure and return; save/Continue; and the representative small and large hull/load. Test destroyed or unavailable actors, duplicate settlement, nonzero origins, remapped input, muted audio and reduced motion where relevant. Targeted fixtures can reach rare states quickly but do not replace the ordinary approach. Inspect real rendered captures for appearance and motion for camera/handling claims. When the current environment cannot run the required route, preserve useful implementation and label route/visual acceptance UNVERIFIED—never silently downgrade it to source inspection.


## Sector-specific acceptance scenarios

- An unbriefed pilot discovers a useful person and understands one ongoing job on the ordinary arrival.
- Complete all three inherited opportunities; existing lamp implementation alone cannot close the sector.
- Follow a small ship, a tug and its load through the same repair court; no camera collision or invisible blocking volume.
- Return after helping, borrowing, damaging and restoring: dialogue, markers, lamp state and custody agree.

## Explicitly reject

A safe hub stuffed with enemy encounters; a beautiful memorial with no approachable people; a single 180-credit lamp transaction declared an entire neighborhood; relighting the canonical twenty-fifth plinth.

## Commission execution supplement — branch and proof

**This is already the assigned draft implementation PR.** Add production commits to this PR's existing head branch (`experience-commissions/EC-S01-helios-prime`), not a second planning document or duplicate PR. Compare current remote master, open implementation PRs and the active Finish/NOW path claims before editing; merge current source using permitted repository procedure. The authored brief is a promise, not an assertion that its contents already exist.

**Stop only on real acceptance or a genuine execution limit.** Classify each named obligation as working, inadequate, disconnected, missing, externally blocked or unverified; build and validate each, including negative/return paths. Record partial milestones as **AREA INCOMPLETE** with the precise next implementation action. Keep owner/branch ownership exact and test in ordinary play rather than debug-only fixtures. Honor current three-reviewer acceptance where the native campaign requires it.

**Raise the design above the literal brief.** Before committing to an implementation, compare two or three credible alternatives for its most important interaction or visual composition. Pick the solution with the best player comprehension, agency, memorability and reliability **per measured CPU/GPU/memory cost**. Improve the staging and scope if evidence supports it; do not invent unrelated systems or weaken protected canon. For this sector, the pilot must see meaningful everyday work without accepting a mission, find physical recurring contacts and differentiated mission/return affordances, cause a real local change, and recognize it after leaving. Do not close on the strongest single mission.

**Performance and craft are coupled.** Measure before/after on an actual representative crowded scenario; distinguish worker stalls, presentation jitter, main-thread cost, GPU cost and asset loading. Reuse shared canonical event/state writers; avoid always-awake decorative physics, per-frame scans and duplicate caches. Never satisfy a frame budget by pixelating the camera, eliminating necessary actors, reducing authored identity or hiding a frozen simulation. Screenshot and motion inspection are necessary for visual and camera claims; software-rendered tests cannot prove target-hardware frame rate.

**Required handoff:** name changed production files/commit, player entry route and seed, completed named scope, notable creative design decisions, evidence and actual renderer/hardware, performance delta where relevant, independent critique and remaining defects. Refer to [the v2 execution protocol](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/06_AGENT_PR_EXECUTION_PROTOCOL.md) and [parallel-ownership map](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/07_PARALLEL_AGENT_DEPLOYMENT.md), which support rather than replace current native authority.

## Execution contract — own the experience, not just the files

You are the implementation lead for the named commission. Produce working source and any necessary authored assets in SpaceFace and commit them to this existing draft PR branch; create a separate linked implementation PR only when the canonical shared owner requires it. This is an execution assignment, not a request for another plan, prompt, simulation transcript, catalog, or test-only demonstration. Your responsibility includes design judgment, source integration, presentation, failure recovery, and the ordinary player route. A subordinate's completed component does not discharge your responsibility for the whole.

**Establish truth before replacing things.** Read the current `AGENTS.md`, relevant nested instructions, `design/VISION.md`, the applicable parts of `design/GDD_2_0.md`, and the current master-plan campaign/lane/status. Inspect `git status --short`, exact relevant diffs, open PRs and `design/program/NOW.md`. Read the named native parents in this commission. Inspect the existing route in the running game; trace its source owners. Classify each promised outcome as working, present-but-poor, disconnected, absent, blocked by a shared defect, or unverified. A prose claim, a shipped catalog row, and a passing unit test are not equivalent to a working experience. Preserve the good parts and finish their missing connections.

**Do not start a competing backlog.** The EC-S/EC-G/EC-A/EC-Z/EC-C labels in this document are commission labels, not new queue IDs. `build_map.md` is specification/history with dispatch closed; current master lanes govern execution. `INFERENCE_LANES.md` §0.2 explicitly supports area development. Absorb related `INFERENCE_IDEAS.md` leaves into this outcome; do not count them as unrelated extra accomplishments. Check `build_map_done.md` and live code before rebuilding a shipped feature. Record authoritative status in the existing campaign/lane context. The attached manifest and reconciliation tool are read-only aids, not a second scheduler.

**Make implementation decisions rather than requesting taste decisions from the owner.** Compare two or three credible ways to solve each important missing connection. Select the simplest complete result that preserves the intended feeling and offers useful play. Explain substantial departures briefly in the PR. The arrival treatment, causal outcomes and rejection examples are commitments; incidental set dressing, exact dimensions, incidental dialogue and staging are design variables. Do not preserve a bad parameter merely because it is already in code. Conversely, do not rewrite a sound architecture to make your contribution look larger.

**Work in an integrated loop.** Inspect the public route → identify the most consequential missing/broken experience → implement it through canonical owners → exercise it in the real scene → inspect the resulting image, motion, sound and interaction → fix the material failures → continue through the remaining named scope. Begin actual production once enough is known to make a responsible edit. If research has stopped changing the design decision, stop researching and build. Do not substitute a month of harness construction for one finished encounter.

**Use specialists when available.** Delegate meaningful, disjoint work: spatial composition/assets, gameplay and continuity, interaction/audio, and independent product/engineering critique. Give each specialist an exact deliverable, current source base, read dependencies, reserved write paths and a merge/interface contract. Retain integration ownership yourself. A single-agent environment performs these roles sequentially; do not claim independent review when the same agent merely changed hats. Review the integrated result at a meaningful boundary, not every tiny edit. Follow current repository batch-verification rules rather than inventing screenshot or reviewer quotas.

**Shared code is not owned by geography.** Twenty sector agents must not each replace `world.js`, the camera, the contact renderer or the mission engine. Claim exact current paths, place local composition/behavior in the appropriate existing extension seams, and coordinate a narrowly specified shared fix with its owner. Define the consumer contract and complete other independent work while waiting. A blocked shared fix leaves the affected acceptance claim open; it does not justify stubs or stop unrelated authorized work. Keep concurrent foreign edits; no reset, clean, stash, force-push, broad staging, or unapproved extra worktree. Integrate remote changes by the repository's current permitted workflow.

**One truth for every consequence.** Physics, cargo, economy, missions, law, world records, progression, saves and presentation retain their canonical writers. Send intents and consume committed results. Visuals and dialogue must not invent success, a payment, a death, an infection, a delivered shipment or ownership. Use stable IDs plus generation checks where transient entity IDs can be reused. Use seeded RNG and simulation time, not wall-clock timers or ambient randomness. Do not create a parallel infection ledger, quest database, faction reputation calculator, or private credit balance.

**The current owner's boundaries are part of the design.** Remain ship-scale; this commission does not add an on-foot game. No enemies constructing new structures during combat. Preserve acquired Adventure options: meaningful consequences may change a place, but routine fitting, alliance repair and business recovery must not require a fresh character or forced prestige reset. Swarm is an exuberant combat expression of shared mechanics, not a second incompatible physics game. Ship fittings must change usable capabilities and their presentation, not just numerical labels. Do not manufacture extra complexity as a substitute for finishing ordinary interactions.

**Use the actual asset pipeline.** Check existing shipped and unintegrated assets before authoring replacements. Reuse is not a creative ceiling: produce missing structure, motion, material or audio when the experience needs it, using the current Forge/release workflow and coordinated manifest ownership. Temporary blockouts are useful during development but cannot pass visual acceptance. Never count a turntable, a promotional image, a hidden flag or a debug spawn as the normal game.

**Measure budgets without sacrificing the promise.** Numbers of opportunities and routine roles below are authored coverage, not permission to keep every actor, rigid body, light and effect active. Respect native global budgets; reuse crews between phases; use existing far-state/persistence mechanisms and bounded pools. Measure representative crowded routes, not empty scenes. Do not lower resolution, erase atmosphere, alter physical outcomes or disable necessary behavior to conceal an unprofiled bottleneck. Claims about the owner's device require measurements on that device; software rendering is not hardware-performance evidence.

**Publish honestly.** Keep one focused outcome PR, or a clearly linked dependent stack when shared changes require it. Never put unrelated work into a convenient UI PR or bypass approval requirements. No merge or deployment unless separately authorized. Report the commit, changed production paths, ordinary entry route, what the player can now do, evidence actually obtained, and precisely what remains. A session interruption is a checkpoint, not completion: preserve the next concrete action and unresolved findings in the existing owner context. Continue eligible work while execution remains available; do not stop just because one test or one local story passed.

## Completion decision and PR handoff

Close this commission only after its full named production scope works together on the ordinary route, the local acceptance scenarios pass, required assets/presentation are integrated, and no known material defect invalidates its promise. The relevant current repository quality and performance gates still apply. A successful fixture, one finished mission, or one attractive screenshot cannot close the area. Small unrelated defects may be handed to their existing owners; a missing central interaction, repeated loss of control, false consequence, broken Continue or unreadable place may not.

Use professional judgment for the final experience review: can a player understand the situation, choose a useful action, feel its result, recover from a mistake, and want to return? Ask the reviewer for concrete failures in the actual scene, not a ceremonial word such as “optimal.” An unexplained score is not acceptance. If a material complaint remains, fix it and review the changed boundary; do not repeat unchanged tests for reassurance.

The PR description must name the ordinary route, before/after player outcome, native parent coverage, inherited opportunities completed, source/assets changed, checks actually run, visual/motion/audio evidence actually inspected, and remaining limitations. Reconcile relevant existing INFERENCE leaves individually without declaring unrelated rows complete. Preserve current native status and path ownership. Keep implementation readiness separate from route/visual/hardware acceptance when the environment cannot establish all of them. When a real session limit intervenes, leave a resumable checkpoint and keep the commission open; do not relabel partial scope as a successful smaller assignment.
