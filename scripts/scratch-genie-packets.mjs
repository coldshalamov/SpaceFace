// Builds .genie-packets/ — one zip per commission for the 60-minute cloud genius agent.
// Files are extracted from HEAD (committed state) so packets match what the GitHub connector sees.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, '.genie-packets');
const COMMIT = execSync('git rev-parse --short HEAD').toString().trim();
const REPO = 'https://github.com/coldshalamov/SpaceFace';

fs.rmSync(OUT, { recursive: true, force: true });

const CONVENTIONS = `# Conventions you must know

## The game
SpaceFace is a top-down 2.5D space game (Three.js rendering, custom simulation): fly, mine, trade,
fight, smuggle, upgrade in one persistent, deterministic pocket universe. Six sectors, factions at
war, a physical tether called the Massline as the signature mechanic.

## Architecture laws (non-negotiable in anything you ship)
- Flat GameState object; systems registered in src/core/registry.js run in a fixed order.
- Event bus at src/core/eventBus.js: systems publish facts, other systems subscribe. No direct
  cross-writes to other systems' state.
- 60 Hz fixed-timestep simulation, fully decoupled from rendering. Gameplay is 2D on the XZ plane
  (y is up, presentation-only).
- Sim code NEVER touches Three.js, the DOM, or wall time. All randomness goes through state.rng;
  all time through state.simTime. Same seed + same inputs = same world, always.
- ES modules, no external dependencies, no build step. Plain modern JavaScript.

## Deliverable contract
- Ship COMPLETE, WORKING files against the interfaces included in this packet. Not a design doc —
  the thing itself, with any new modules you need alongside it.
- Include a fixture: a small standalone harness or test that demonstrates your component working
  on its own, with a fixed seed.
- Include INTEGRATION-NOTES.md: where your files attach, what events you consume/emit, what a
  local engineer must wire.
- We integrate, run our checks, and measure the result locally. Creation is yours; wiring is ours.

## Your budget
You have about 60 minutes. Everything essential is IN this packet — spend your time creating, not
exploring. You may pull a handful of individual files from the GitHub repo ( ${REPO} , commit
${COMMIT} ) if you need to check a signature, but treat that as garnish, not research.
`;

const packets = [
  {
    id: '01-chronicler',
    title: 'The Chronicler — a world that remembers',
    files: [
      ['docs/program-compass/2026-09-ACTUAL-GAME.md', 'Measurement report: how storyless the game is today'],
      ['src/core/eventBus.js', 'The event bus every system publishes to'],
      ['src/core/eventTrace.js', 'Event tracing utilities'],
      ['src/core/dirtyJournal.js', 'An existing journaling idea'],
      ['src/combat/killCausality.js', 'Kill attribution: who killed whom and why'],
      ['src/systems/heat.js', 'Crime, heat, WANTED status'],
      ['src/systems/aftermathWrecks.js', 'Battle aftermath persistence'],
      ['src/systems/salvage.js', 'Salvage system'],
      ['src/systems/salvageActions.js', 'Salvage actions'],
      ['src/systems/lootShards.js', 'Loot drops'],
      ['src/systems/aceMemory.js', 'Pilot memory (existing seed of the idea)'],
      ['src/systems/moralMemory.js', 'Moral memory'],
      ['src/systems/bandRadio.js', 'Pirate band radio'],
      ['src/data/barks.js', 'One-line voice lines by faction/stance'],
      ['src/data/namedAces.js', 'Named ace pilots'],
      ['src/data/factionContactGrammar.js', 'How factions talk'],
    ],
    brief: `SpaceFace is a top-down space game — one persistent little universe where hundreds of
ships mine, trade, smuggle, fight and die, fully simulated. The systems underneath are deep. And
yet when you play for ten hours, nothing that happened matters: the world does not remember. We
measured it — 63 hours of continuous play, 76 ships killed, cargo spilled, salvage left drifting,
and the world produced zero complete stories. No news. No legends forming. No radio ever referring
to the battle you fought an hour ago. Nobody in this universe can say "remember when."

We believe there is a missing organ between our event stream and everything that could react to
it: something that notices events, understands which small fraction actually matter, connects them
into chains of cause and consequence, and offers those stories to anything that wants them — news
tickers, radio, rival behavior, the way a station greets you, the way a bounty forms.

We are deliberately not prescribing what this is or how it works. The packet has our event bus,
the systems that emit the raw material of lives (kill attribution, aftermath, salvage, crime and
punishment, faction radio), and a report measuring exactly how storyless the game is today. Design
and build the memory a living universe deserves, as a working module we can wire in.`,
  },
  {
    id: '02-tension-director',
    title: 'The tension director — sessions with a shape',
    files: [
      ['docs/program-compass/2026-09-ACTUAL-GAME.md', 'Measurement report: flat session shape, hour-1 = hour-8'],
      ['src/core/eventBus.js', 'The event bus'],
      ['src/core/registry.js', 'How systems register and run'],
      ['src/core/activityScheduler.js', 'Existing activity scheduling'],
      ['src/ai/director.js', 'The current encounter director'],
      ['src/systems/encounterDirector.js', 'The encounter spawn pipeline'],
      ['src/data/difficulty.js', 'Difficulty data'],
    ],
    brief: `Our game has no sense of drama. We instrumented long sessions and the shape of play is
a flat line: hour one and hour eight are literally the same activities with the same rhythm.
Threats, opportunities and quiet arrive by accident, not intent. Nothing escalates. Nothing
breathes. Nothing ever saves a twist for the right moment. Two things make human-made games feel
authored: a world that remembers (separate project), and a director constantly deciding what the
next thirty minutes should feel like — tension, release, escalation, calm — so the player
unknowingly lives inside a story shape.

That director does not exist here. What does exist: an encounter director that commands spawns, a
difficulty table, and a rich event stream describing everything happening to this specific
player. Design and build the missing piece: the thing that reads the recent past and shapes the
immediate future, using only levers the simulation already has. It must be deterministic, bounded,
and inspectable. Ship it as a working module; we will measure it against our session-shape bars.`,
  },
  {
    id: '03-nemesis',
    title: 'The nemesis engine — someone who studies you',
    files: [
      ['src/systems/aceMemory.js', 'Memory layer: grudges, loyalty, return scheduling'],
      ['src/data/namedAces.js', 'Named aces and their stances'],
      ['src/systems/tacticalAI.js', 'How ships actually fight'],
      ['src/ai/squad.js', 'Wing/squad execution'],
      ['src/ai/factionBehavior.js', 'Faction behavior'],
      ['src/ai/specialistPlans.js', 'Specialist maneuver plans'],
      ['src/data/factionDoctrines.js', 'Faction fight doctrines'],
      ['src/data/dossArchive.js', 'Dossiers/lore archive'],
      ['src/combat/killCausality.js', 'Kill attribution'],
      ['scripts/check-people-who-remember.mjs', 'Our existing acceptance check for the memory layer'],
    ],
    brief: `We just landed a memory layer: named captains now hold grudges and loyalty, come back
heavier if you crossed them, break off if you beat them. It works. And it is not enough — because
grudges are not a character. There is no one in this universe who STUDIES you. Nothing adapts to
how you personally fight. Every player gets the same opponents making the same mistakes forever.

We want a genuine antagonist: a named ace — with a name, a ship, a voice — who pays attention
across an entire campaign. Who notices that you kill with tether slings and stops lining up
behind you. Who fits a counter-loadout after you burn three wings. Who escalates when crossed,
retreats to learn when beaten, and eventually forces a final confrontation that tests everything
you have actually become, not a scripted finale that ignores it.

Build the engine and the character together: the adaptation machinery (deterministic, bounded, no
per-frame learning tricks) and the authored arc of one unforgettable rival. Our memory layer and
tactical AI are in the packet as the substrate to build on. Working code, plus the fixture that
shows the nemesis responding to two genuinely different player styles.`,
  },
  {
    id: '04-massline',
    title: 'The Massline control law — make the signature sing',
    files: [
      ['docs/program-compass/2026-09-ACTUAL-GAME.md', 'Measured: releases happen by timeout, payoff is a seed coin-flip'],
      ['src/systems/tetherGameplay.js', 'The 3,100-line tether module itself'],
      ['src/systems/masslineInputGrammar.js', 'Input grammar'],
      ['src/systems/masslineImpacts.js', 'Tether impact model'],
      ['src/systems/masslineImpactDamage.js', 'Impact damage'],
      ['src/systems/masslineThrow.js', 'The throw/release verb'],
      ['src/combat/tetherFireControl.js', 'Fire/attach control'],
      ['src/combat/tetherWebs.js', 'Multi-tether webs'],
      ['src/data/flightTuning.js', 'Flight tuning tables'],
      ['src/data/flightFeelEnvelopes.js', 'Flight feel envelopes'],
      ['scripts/lib/bench/crucibleBench.mjs', 'The bench harness we test combat with'],
    ],
    brief: `Our signature mechanic is a physics tether called the Massline: grab any object, tow
it, swing around it, pay out line, cut loose at the perfect moment and turn momentum into a
weapon. It is the mechanic the entire game is named after and built around. After months of
iteration by competent engineers it works — and it does not sing. Measured facts: most releases
happen because the player gave up, not because they chose the moment. Whether a swing becomes a
kill is close to a seed coin-flip. There is no skill ceiling a pilot can feel climbing toward.

We suspect the control law itself is shaped wrong — response curves, tension language, the
cut-timing decision, the rhythm of a swing — and that no amount of incremental tuning will find
the version that feels inevitable. You are getting the real module (all 3,100 lines), the input
grammar, the impact model, our flight feel envelopes, and the bench we test with. Redesign what
commanding a tether should feel like as a learnable skill, from the response laws up. Ship
working code in place of the parts you redesign, plus the fixture that demonstrates the
difference between old and new on a fixed seed.`,
  },
  {
    id: '05-enemy-mind',
    title: 'The enemy mind — wings that fight like crews',
    files: [
      ['docs/program-compass/2026-09-ACTUAL-GAME.md', 'Measurement context'],
      ['src/systems/tacticalAI.js', 'The tactical AI system'],
      ['src/ai/squad.js', 'Squad execution'],
      ['src/ai/doctrine.js', 'Doctrine layer'],
      ['src/ai/combatDoctrine.js', 'Combat doctrines'],
      ['src/ai/maneuver.js', 'Maneuver library'],
      ['src/ai/perception.js', 'Perception'],
      ['src/ai/shipDecision.js', 'Ship-level decisions'],
      ['src/ai/gunnery.js', 'Gunnery'],
      ['src/ai/fireDiscipline.js', 'Fire discipline'],
      ['src/ai/specialistCounterplay.js', 'Specialist counterplay'],
      ['src/ai/specialistPlans.js', 'Specialist plans'],
      ['src/ai/fodderCohort.js', 'Fodder cohorts'],
      ['src/ai/stack.js', 'AI stack'],
      ['src/data/combatDefs.js', 'Combat definitions incl. doctrine overrides'],
      ['src/data/attackTraits.js', 'Attack traits'],
      ['src/data/factionDoctrines.js', 'Faction doctrines'],
      ['src/data/encounters.js', 'Encounter definitions'],
    ],
    brief: `Seventeen enemy ship types. Until last week, seven of them flew literally the
identical intercept — same machine, different health bar. We patched the sameness with per-hull
doctrine overrides, and the fights are distinguishable now. But underneath, the minds are still
state machines: approach, circle, shoot, occasionally flee. Wings stack instead of coordinating.
Nobody feints. Nobody baits. Nobody panics like a living thing with survival instincts — or
retreats in good order to a better position, or sacrifices for the wing, or makes the believable
mistake a veteran player learns to exploit.

Design and build the decision core for hostile pilots: wings that behave like crews with motives,
fear, discipline and plans — coordination that emerges from per-ship decisions, not a puppet
master. It must be fully deterministic (state.rng only), degrade gracefully at 50 simultaneous
ships, and ship with weights clearly marked where we should tune later. The existing AI stack is
in the packet both as substrate and as the interface you must fit. Fixture: two wing-vs-policy
fights on fixed seeds that show the new mind creating a fight a human would call "clever."`,
  },
  {
    id: '06-spawner',
    title: 'The arranger — a world that reads as designed',
    files: [
      ['src/systems/world.js', 'The 5,000-line world generator itself'],
      ['src/systems/massSeed.js', 'Seeding'],
      ['src/data/sectorAnchors.js', 'Sector anchors'],
      ['src/data/fields.js', 'Asteroid field definitions'],
      ['src/data/authoredPlaces.js', 'Authored places'],
    ],
    brief: `Our universe is generated by hashing coordinates. It is deterministic, cheap, and
completely artless: rocks scattered by formula, stations where the data table says, wrecks
uniform, nothing ever ARRANGED. A human looking at a screenshot sees noise that functionally
works and visually reads as generated. Real places feel authored because someone chose where
everything goes relative to everything else: the sightline that lands on the landmark, the
negative space that makes the refinery feel enormous, the rock that frames the station, the
rhythm of dense and empty, the silhouette that tells you what a thing is before the HUD does.

We want you to build the arranger: a placement layer with a genuine compositional grammar —
silhouette, framing, sightlines, negative space, density rhythm, per-sector character — running
on top of our deterministic generator, so every sector stops being scattered and starts being
staged. It must stay deterministic and respect the performance envelope the current generator
operates in (the same object counts, no new per-frame cost). Ship the layer as working code plus
the per-sector parameter sets you author. We will judge it on real screenshots of the live game —
make your fixture render or emit evidence that composition exists.`,
  },
  {
    id: '08-economy',
    title: 'The economy, derived — a pulse instead of a flatline',
    files: [
      ['docs/program-compass/2026-09-ACTUAL-GAME.md', 'Measured: all income in hours 0-3, then nine flat hours'],
      ['src/systems/economy.js', 'The economy system (2,900 lines)'],
      ['src/systems/economyContracts.js', 'Economy contracts'],
      ['src/systems/economyCycles.js', 'Economy cycles'],
      ['src/data/commodities.js', '47 commodities with moral tags'],
      ['src/data/economyDemandProfiles.js', 'Demand profiles per place type'],
      ['src/data/economyContractTemplates.js', 'Contract templates'],
      ['src/data/tech.js', 'Tech tree costs'],
      ['src/data/missions.js', 'Mission payouts and offer mix tables'],
    ],
    brief: `Our economy flatlines. Measured across long playthroughs: a pilot earns essentially
everything in the first three hours — then nothing for nine. Asteroid fields deplete and the next
one is fourteen thousand units of empty space away. Prices barely answer to anything. Missions
keep serving starter-tier offers to a veteran. The result is that the mid-game has no money
story, and money is how this game lets you express what you are becoming.

The pieces of a real economy are all here — demand profiles, contracts, cycles, forty-seven
commodities with moral tags — assembled without a designed pulse. We want the economy DERIVED,
not tuned: a model in which prices, payouts, depletion, and progression costs follow from what
the player should be able to do and afford in each phase of play. Produce the model, produce the
replacement data tables generated from it, and include the small verifier that recomputes your
tables so we can check them locally. If your model needs behavior changes in the included
systems, ship those as working diffs against the files in the packet.`,
  },
  {
    id: '09-bosses',
    title: 'Three capital bosses, authored',
    files: [
      ['src/data/missions.js', 'Contains CAPITAL_BOSSES definitions'],
      ['src/data/combatDefs.js', 'Combat profiles, subsystems, statuses, doctrine overrides'],
      ['src/data/encounters.js', 'The authored encounter format'],
      ['src/data/attackTraits.js', 'Attack trait vocabulary'],
      ['src/systems/tacticalAI.js', 'How ships execute'],
      ['src/ai/squad.js', 'Wing execution'],
      ['src/combat/subsystems.js', 'Subsystem mechanics'],
      ['src/combat/statuses.js', 'Status effects'],
      ['FINDINGS.md', 'Why the current bosses fail (measured)'],
    ],
    brief: `We have three capital bosses. Our instrument measured one of them dying in twelve
seconds — because a boss here is a health bar with escorts. No acts, no readable turns, no
learned counterplay, no arc. A player who fights one remembers nothing about it.

We are asking for authorship, not a system: three complete boss encounters, written to our
encounter format, each with its own identity and physical story — acts that change the fight,
tells a pilot can learn, counterplay that teaches, damage budgets tuned so every skill tier gets
a narrative (the losing tier dies understanding why; the winning tier wins at 20% hull with a
story to tell). Use the mechanics vocabulary in the packet — subsystems, statuses, doctrine
overrides, wing grammar — to its full depth. The FINDINGS file in the packet has the measured
failure mode; the encounter format file shows exactly what a complete authored fight must
express. Ship all three, fully written, ready for us to load and fight.`,
  },
  {
    id: '10-endings',
    title: 'Five endings, written',
    files: [
      ['src/systems/story.js', 'The 47-A conspiracy corpus and endgame events'],
      ['src/story/campaign47a/embodiedMissions.js', 'Story missions already embodied'],
      ['src/data/missionConditions.js', 'Mission condition vocabulary'],
      ['src/data/factions.js', 'The factions'],
      ['src/data/dossArchive.js', 'Lore dossiers'],
      ['src/systems/heat.js', 'Crime history'],
      ['src/systems/moralMemory.js', 'Moral memory'],
      ['SAVE_SCHEMA.md', 'What the save file records about a life'],
      ['FINDINGS.md', 'The current state of endings (nothing)'],
    ],
    brief: `SpaceFace has no ending. Underneath the game there is a literary conspiracy — the
47-A "Mass Discrepancy," a story about mass, accounting, and bodies-as-inventory — delivered
through comms, graffiti and HUD lies. There are factions at war, crime and reputation, wealth and
salvage, a whole ledger of who you have been. On paper there are five endings. In the game:
nothing resolves. A captain plays twenty hours and the story just stops being present.

We are asking for the endings themselves, written: the decision model that reads a captain's
actual recorded history — wealth, crimes, faction standings, the 47-A thread, who lives because
of them — and decides which ending they have earned; the finale content for each of the five; the
writing itself, in the voice the existing corpus establishes (read story.js carefully — it is
good); and the epilogue, what the universe looks like afterward. Complete, in our data formats,
ready to load. The save schema shows you exactly what history a life leaves behind — that ledger
is your raw material.`,
  },
];

const FINDINGS_09 = `# Why the current bosses fail (measured)

- A scripted 2v2 duel against a capital boss resolves in ~12.25 seconds (baseline arms and
  post-identity arms both). The same exists in stock doctrine — it is a capital-kill-model
  problem, not an AI-identity problem.
- CAPITAL_BOSSES currently: 3 entries (Tollman/ALA + one encounter id). Mega-heists: 2.
- Combat framing (B3b bench): improved to ~99% in-frame — readability is no longer the excuse;
  bosses fail on choreography and damage budget, not camera.
- Accepted bar for this commission: every skill tier gets a story. Losing tiers should die
  learning something; the winning tier should win at ~20% hull with resources spent.
`;

const FINDINGS_10 = `# The current state of endings (measured)

- Zero endings implemented. story.js emits canonical comms, graffiti, HUD lies and endgame
  EVENTS, but nothing resolves; the campaign thread (47-A) is presented, not concluded.
- On-paper design: five endings and a continuing universe (design/program/FINISH_THE_GAME.md
  lineage), never built.
- The instrument (docs/program-compass) measured the vision chain — combat -> aftermath ->
  salvage -> economy -> law — completing zero times in ~63 hours. The endings must be reachable
  from what the sim actually records about a life, not from a quest flag.
- The save schema (SAVE_SCHEMA.md) is the ledger of a life: that is the decision model's input.
`;

// ---- assemble ----
fs.mkdirSync(OUT, { recursive: true });
let totalFiles = 0;
const missing = [];

for (const p of packets) {
  const dir = path.join(OUT, p.id);
  fs.mkdirSync(dir, { recursive: true });

  const inventory = [];
  for (const [rel, note] of p.files) {
    const dest = path.join(dir, 'repo', rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      const content = execSync(`git show HEAD:${rel}`, { maxBuffer: 64 * 1024 * 1024 });
      fs.writeFileSync(dest, content);
      inventory.push(`repo/${rel} — ${note}`);
      totalFiles++;
    } catch {
      missing.push(`${p.id}: ${rel}`);
    }
  }

  let findings = '';
  if (p.id === '09-bosses') {
    fs.writeFileSync(path.join(dir, 'FINDINGS.md'), FINDINGS_09);
    findings = '\n- FINDINGS.md — the measured failure mode of the current bosses\n';
  }
  if (p.id === '10-endings') {
    fs.writeFileSync(path.join(dir, 'FINDINGS.md'), FINDINGS_10);
    findings = '\n- FINDINGS.md — the current state of endings\n';
  }

  const brief = `# ${p.title}\n\n${p.brief}\n\n## What is in this packet\n\n${inventory.map(i => '- ' + i).join('\n')}\n${findings}\n## Ground rules\n\nRead CONVENTIONS.md first — architecture laws, deliverable contract, and how to spend\nyour hour. You may pull a few individual files from ${REPO} (commit ${COMMIT})\nif a signature matters, but everything essential is here. We would rather have one\nbrilliant finished thing than a broad sketch: spend the budget creating.\n`;
  fs.writeFileSync(path.join(dir, 'BRIEF.md'), brief);
  fs.writeFileSync(path.join(dir, 'CONVENTIONS.md'), CONVENTIONS);
}

// root index + prompts file
const index = `# Genie packets — built ${new Date().toISOString()} from commit ${COMMIT}\nRepo: ${REPO} (pushed through ${COMMIT})\n\n${packets.map(p => `- ${p.id}.zip — ${p.title}`).join('\n')}\n\nUpload one zip per session. The chat prompt for each is in PROMPTS.md and mirrored in the\nzip's BRIEF.md. Delete this folder when done.\n`;
fs.writeFileSync(path.join(OUT, 'INDEX.md'), index);

const promptsMd = `# Chat prompts for each packet (paste alongside the zip upload)\n\n${packets.map(p => `## ${p.id} — ${p.title}\n\n${p.brief}\n\n(Context: the zip contains the files listed in its BRIEF.md, plus CONVENTIONS.md with our\narchitecture laws and what "done" means. You can pull a few individual files from the GitHub\nrepo at ${REPO}, commit ${COMMIT}, but the packet is the whole brief — spend your hour\nbuilding, not exploring.)\n`).join('\n---\n\n')}`;
fs.writeFileSync(path.join(OUT, 'PROMPTS.md'), promptsMd);

console.log(`packets: ${packets.length}, files extracted: ${totalFiles}`);
if (missing.length) console.log('MISSING:\n' + missing.join('\n'));
