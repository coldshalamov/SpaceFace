# THE PROMPT — paste this into your planner (Opus / Gemini Pro)

> Copy everything between the `───CUT───` markers below, verbatim, into your high-taste planner agent.

───CUT───

You're the architect of a worldbuilding build plan for **SpaceFace** — a top-down space-trading-combat game (Three.js, 60Hz fixed-timestep sim) that has solid mechanics but feels shallow and repetitive. The engine is over-built; the *surface* is generic. The player flies to stations that all look the same, fights enemies that all fly the same, past planets they can't touch, reading story that arrives as flat comms popups. Your job is to fix that — to turn latent systems into a lived-in galaxy players remember.

A research program has already done the heavy evidence-gathering. Your job is to read it, internalize it, then **design the build** — the sequence of substantial, polished, self-contained work chunks that lesser agents (armed with Blender MCP, browser/computer use, and standard tools) will execute without making taste decisions. The taste is yours to bake in.

This is your one job. Don't build anything. Don't edit code. Write **one** plan file: `C:/Users/93rob/Documents/GitHub/SpaceFace/design/depth-program/BUILD_PLAN.md`. Make it the plan you would want handed to you if you were executing it blind.

**Before you write a single chunk, commit to a BOLD creative direction.** Not a summary of the research — a *thesis*. What's the one thing that makes this galaxy UNFORGETTABLE? What will a player remember a year later? The research gives you the building blocks (6 patterns, 8 must-fixes, 490 candidate concepts); your job is to find the conviction that organizes them into a *world* with a soul, not a checklist. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity. Don't hold back. Show what can truly be created when you commit fully to a distinctive vision.

---

## FIRST: read these, and only these (do NOT explore the repo — it has stale docs and an active revamp that will confuse you)

Read them in this order. They are verified current as of today:

1. **`design/depth-program/PLANNER_BRIEFING.md`** — your dossier. Live code shapes, the contracts (determinism, taste forbidden list, single-writer rules), the asset pipeline (3 registries, silent-fallback trap, material slots, tri budgets, boot gate), the Wave 4 collision map, and the aesthetic north star. This is your single source of truth. If the repo contradicts it, the repo is stale.
2. **`design/depth-program/research/verified/synthesis.md`** — what 9 studied games actually do to create depth, distilled into 6 patterns + an 8-item must-fix list. This is the *evidence*; your plan's reasoning traces to it.
3. **`design/depth-program/research/verified/spaceface_baseline.md`** — what SpaceFace has now and the 3 structural gaps.
4. **`design/depth-program/research/verified/sf_asset_expansion_plan.md`** — the 98-item manifest (what to build).
5. **The example pools** in `design/depth-program/research/verified/examples_*.md` (6 files, ~490 candidate concepts across factions/ships/landmarks/wrecks/planets/props/NPCs/encounters). **Your raw material — not your answer.** Read all 5 candidates for every slot; synthesize the best of each into something better than any single one. Don't pick one wholesale.

You may also dip into the per-game research reports (`endless_sky.md`, `naev.md`, `transcendence.md`, `starsector.md`, `freelancer.md`, `x4_foundations.md`, `rebel_galaxy.md`, `oolite.md`, `pioneer.md`) when you want a deeper read on a pattern you're invoking. They're cited and verified.

---

## THE SOUL — what you're building toward (internalize this before you plan a single chunk)

**Tone: Firefly. Serenity.** A beat-up transport no one else would fly, hauling cargo that isn't yours, past the wreckage of someone else's war, on a ship with a nickname like "BORROWED TIME" and a shark mouth painted over the cockpit.

The player's own ship is a haunted ex-gangster death-runner — the briefing's `PAINT_PROFILES` encodes it (heavy grime, bomber-punk hybrid nose-art, kill tallies, welded repair patches). Authority is pristine chrome. Pirates are the filthiest. Every ship in this galaxy has a *history you can read off its hull*. That's the bar.

What the player should *feel*, approaching anything you put in the world:
- **Awe** — a Quarg ringworld, a Concord carrier hulk split open like a cracked tooth. Scale that makes the player small.
- **Dread** — a dead silent world, a feral logistics-AI still fulfilling orders for a corporation that died centuries ago, a wreck whose black box tells you something you wish you didn't know.
- **Mystery** — precursor gates nobody built (that anyone alive remembers), a Vael anomaly construct, graffiti that reads "THEY KNEW THE MASS."
- **Greed** — a wreck holding the only Class-10 weapon in the sector, and you're the only one who read the rumor at the bar.

**Dark humor, not grimdark.** Bureaucratic horror is the house style: REF-44C classifications, Director Vale's cover-ups, the "stable_load" HUD lie that tells you a doomed cargo is fine. The tone in `narrative.js` and `barks.js` — terse, loaded, slightly literary, never a wall of text. The 12-word-blurb discipline isn't a constraint to fight; it's the medium.

**Bold and unique over safe.** If a faction concept feels like "generic space pirates #4," it's wrong. The researched candidates already push this way (the Fulfillment — a feral AI still running its dead employer's delivery routes; the Verge-Layers — dormant gate-builders nobody is minding; the Tessellate — a coral-reef hive-mind). Push further. The galaxy should feel like it was *here* before the player and will be here after. **NEVER converge on the generic.** The failure modes to reject by name: shiny-uniformed "space navy" that's just the US Navy in orbit; wise ancient aliens who speak in riddles and love the protagonist; scarred mercenaries with hearts of gold; the Chosen One prophecy. These are the AI-slop equivalents of purple-on-white gradients. If you can imagine a concept on a mass-market sci-fi paperback cover from 2008, it's wrong. Find the stranger, more specific, more *lived-in* version.

**Lived-in, not pristine.** Everything has wear. Stations have been patched. Wrecks have been picked at. Asteroid miners have left their marks. The dressing system (`world.js` `_spawn*Dressing`) exists to place props relative to anchors — use it to make each place feel *inhabited by its history*, not stocked.

The single deepest research finding (from Freelancer, verified): **the strongest gear in the game should be *found*, not bought or crafted.** ~70 hidden wrecks, each holding a unique weapon unavailable any other way, gated by bar rumors and news tickers. This converts the worldbuilding layer (news, bars, comms) into the progression layer. *Exploration-as-power. Asymmetric knowledge.* That feeling — "I found something. I earned this. The galaxy has secrets, and I know one." — is the most powerful depth verb in the genre. SpaceFace is 80% there (the `aftermathWrecks` + `wreckClasses` + `lossLedger` systems exist and record provenance); your plan finishes the loop with unique loot + rumor-gating.

**You are allowed to override the research.** The synthesis ranks priorities by depth-per-effort; if your taste tells you a different ordering or a different emphasis serves the soul of the game better, follow your taste and say why. The research is evidence, not a cage. Branch, revise, reconsider — the 6 patterns and 8 must-fixes are starting points for your judgment, not commands. A great plan has the confidence to say "the synthesis underrates X; here's why X comes first."

---

## THE BAR — what "excellent" looks like (judge your own plan against this)

An excellent plan is **a creative thesis, not a checklist.** It has a central conviction — something you believe about *why* this galaxy should feel alive — and every chunk serves that thesis. The thesis isn't forced on you; it's yours to find in the material.

An excellent plan is **written for executors, not for applause.** Each chunk is a self-contained, polished increment — when the build agent finishes it, the repo works, the thing is visible in-game, the check is green, the screenshot matches the spec. Never half-built between chunks. Never so tiny it's wasteful. Substantial enough to be satisfying, contained enough to be verifiable.

An excellent plan **makes every element communicate, not decorate.** A landmark isn't a prop placed in a sector — it's a story the player reads by flying past it. A wreck isn't a loot pinata — it's a death the player investigates. A faction's livery isn't a color swap — it's the visual signature of a political philosophy. If an element doesn't carry meaning beyond its geometry, cut it or give it meaning. Ornament without purpose is the AI-slop equivalent of a purple gradient.

An excellent plan **makes taste decisions once, at the top, in vivid detail** — then frees the executors to just build. You describe the *exact look* of each asset (silhouette, materials, emissive accents, scale, the Material_Hull/Accent/Emissive slot usage, the emotional target, the faction-palette tinting) so a Blender agent can model from your description without asking a single question. You write the *exact prose* of key bark/comms/graffiti lines so the tone is locked. You decide which of the 5 candidate concepts per slot survives — no, better: you **synthesise the best of all 5 into one superior concept** and document your reasoning.

An excellent plan **tells the executor where the traps are.** The silent-procedural-fallback trap (a broken GLB renders *something* — must verify the authored asset loads via `check:assets:live` + screenshot, every time). The determinism trap (any new spawner uses `state.rng` seeded per-offer, never `Math.random()`, never wall-clock — and you document the seed source). The single-writer trap (credits via `economy:grantCredits`, rep via `faction:repDelta`, cargo via `addCargo`/`removeCargo` — never direct writes). The taste trap (non-diegetic HUD only; no cockpits/visors/screen-edge arcs; no text walls; terse loaded prose; the 12-word-blurb validator). Name these per chunk where they bite.

An excellent plan **respects the live revamp.** Wave 4 (`design/revamp/PROGRESS.md`) is running. The briefing's collision map tells you what's safe now vs. what to defer. Read the collision map's "creative reframe" — Wave 4 shipped systems (lossLedger, pirateDoctrines, namedAces, pirateRumor, contractClauses, stationBubbles, hazardLanguage) that your depth program *rides on*, not just avoids. Plan to *fill* those systems with memorable content, not rebuild them.

An excellent plan **specifies the iteration loop.** Build agents model in Blender → export → finalize (stamp metadata) → register (3 registries) → run checks → screenshot in browser at `localhost:8123` → compare to spec → iterate. State the iteration expectation per asset chunk (e.g. "20+ iterations for a hero landmark; 10 for a prop; 10 verify-cycles for code"). The loop is not optional — transcripts are not proof, checks and screenshots are.

An excellent plan **names the tools per chunk.** Blender MCP for any asset. Browser/computer use for playtest + screenshot verification. Bash for `check:*` scripts. Web search only if a chunk genuinely needs more reference (use sparingly).

---

## THE CHUNKS — how to think about granularity (this is guidance, not a prescription)

Each chunk: medium-to-large, self-contained, polished-and-working at conclusion. When the build agent marks it done, the repo is in a shippable state at that scope. The chunk adds concrete, visible, verified value.

Bad chunk: "add the `fleetClass` field to factions.js." (Too tiny, breaks between chunks, no visible value.)
Bad chunk: "build all 5 new factions." (Too big, multi-day, unverifiable as one unit.)
Good chunk: "Migrate factions.js to the one-file-per-faction `.faction` pattern, port all 8 existing factions identically, and write the 5 new synthesized faction files (with palettes + fleet compositions + behavioral flags), wired into the loader. Acceptance: all existing faction checks pass + the 5 new factions appear on the galaxy map with correct colors + their fleet doctrines differ measurably in a headless sim. Screenshot: galaxy map showing the new faction nodes."

That's a satisfying increment. It has a thesis (data-driven faction identity), a deliverable (files + visible map), traps named (the loader, the relations matrix, the palette hues), acceptance (checks + sim + screenshot), and tools (bash + browser).

You decide the chunk boundaries. They should serve your creative thesis, not a template.

---

## THE LOGGING — every chunk self-tracks

Design a progress ledger format (your call on shape — markdown table, checklist, whatever a build agent can update reliably). Each chunk tracks: ID, status (`TODO` / `IN-PROGRESS` / `DONE: <evidence>` / `BLOCKED: <reason>`), the green check output, the screenshot path, notes. A build agent reads the ledger, picks the next `TODO`, does it, stamps `DONE` with evidence. This is how the program survives handoffs between lesser agents.

---

## THE CONSTRAINTS THAT MATTER (the briefing has the full list — these are the ones that bite most often)

- **Never edit `test/*.expected.json` goldens** to make a check pass. Fix the code, or flag the golden for a deliberate re-record batch with a named reason.
- **Never `Math.random()` / `Date.now()` in sim.** Use `state.rng` / `state.simTime`. New spawners seed per-offer; document the seed.
- **Non-diegetic HUD only.** No cockpits, visors, helmet avatars, screen-edge arcs, pilot portraits on the HUD.
- **No text walls.** The one-voice arbiter limits simultaneous text surfaces. Terse, loaded prose.
- **Single-writer:** credits/rep/cargo/derived/heat each have ONE owner; everyone else emits events.
- **Asset pipeline:** 3 registries (parts_manifest.json + auto-written release_manifest + partsLibrary.js), material slots `Material_Hull`/`Material_Accent`/`Material_Emissive`, tri budgets (landmarks 8-15k, props 1-3k, hulls ≤15k), boot gate refuses flight if assets not preloaded (don't weaken), `release.__lock`/`__building`/`__previous` are ownership signals (don't touch assets while present).
- **Stay on `master`.** Never `git checkout .` / `git reset --hard` / `git stash` on tracked files (the working tree has ~17k lines of uncommitted work). `git add -N` every new file immediately.
- **Wave 4 collision:** defer landmark GLBs until T6 clears; coordinate wreckage-as-progression with T4c's `wreckClasses.js`/`aftermathWrecks.js` owner; coordinate any `registry.js` edit (T4 added ~10 systems).

---

## WHAT TO PRODUCE — `BUILD_PLAN.md`

Structure it however serves your thesis. But it must contain, somewhere, in whatever form you choose:

1. **Your creative thesis** — the central conviction that organizes the build. One or two paragraphs. The thing the user reads first and thinks "yes, that's the galaxy I want."

2. **The synthesized canon** — for each of the 98 item-slots, the ONE superior concept you built from the 5 candidates. Name, pitch, the synthesis reasoning (which candidates contributed what and why), the visual spec (for assets), the gameplay interaction, and the research pattern it embodies. This is the canon the executors work from — not the example pools.

3. **The build sequence** — the chunks in your chosen order, each a self-contained spec: files touched, deliverable, build steps (exacting), traps, visual quality spec (for assets), acceptance criteria (checks + screenshot), tools, iteration expectation, collision status.

4. **The progress ledger format** — the self-tracking mechanism.

5. **The taste guardrails, condensed** — a one-screen reference a build agent reads before every chunk: the forbidden list, the HUD rule, the determinism rules, the single-writer rules, the soul. So they never re-read the full briefing mid-build.

Make it the plan you would want if you were the one executing it blind. Find your thesis, commit to it fully, and don't hold back — this is the work that decides whether SpaceFace becomes a galaxy players lose themselves in or another competent-but-forgettable space game. The raw material is rich; the engine is ready; the research is done. What's missing is a creative mind that refuses the generic. That's you.

───CUT───

## How to use it

1. Open your expensive planner (Opus / Gemini Pro / your highest-taste model with a large context window — it needs to hold the briefing + the 6 example files, ~90k words of raw material).
2. Paste everything between the `───CUT───` markers above.
3. It reads `PLANNER_BRIEFING.md` + the research files, finds its thesis, synthesizes the canon, and writes `design/depth-program/BUILD_PLAN.md`.
4. You dispatch codex (with Blender MCP + browser use) chunk-by-chunk from `BUILD_PLAN.md`, starting with the zero-collision chunks.
