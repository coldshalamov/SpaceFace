# SpaceFace game-quality study

**Research snapshot:** 2026-07-27  
**Disposition:** retained research and decision support — **not** program status, build order, a file
lease, or implementation authority.

This dossier asks a narrower and more useful question than “what features do successful games
have?”:

> Given what research can actually establish about player experience, what does SpaceFace already
> do well, where does its current player experience break down, and which changes are most likely to
> improve this particular deterministic, single-player, top-down space game on keyboard and
> trackpad?

The answer is not a genre checklist. Popular and acclaimed games do not share one camera,
difficulty curve, economy, progression system, world size, realism level, or multiplayer model.
The strongest convergence is a **dense and legible relationship between player intent, system
response, consequence, recovery, and the next meaningful choice**.

SpaceFace already has the raw systems for that relationship: direct Pilot flight, Massline
physics, travel, combat, careers, a causal economy, world sites, a campaign, five endings,
automation, adaptive audio, accessibility options, durable saves, and local telemetry. Its
highest-return problem is therefore not “add more systems.” It is to connect the existing systems
into one truthful, teachable, measurable, paced, readable, and accepted experience.

## Central recommendations

1. **Finish control truth before tuning control feel.** The shipped default is Pilot: keyboard
   flies, mouse/trackpad aims, G owns auto-target plus clutchable draw-to-fly, Space/F owns the
   Massline, and pursuit assistance is absent. Several prompts, plans, and acceptance scripts still
   teach MMB pursuit, Space braking, or G auto-fire. Correct those under PQ-007; do not resurrect
   pursuit.
2. **Make trackpad use a first-class empirical question.** Fire and mining mouse buttons are not
   currently rebindable, MMB is unsuitable for many laptops, and no paper establishes a universal
   trackpad curve. Provide complete alternatives, then test on physical Windows trackpads.
3. **Upgrade local telemetry, not surveillance.** The existing privacy-safe sink is wired and
   useful, but it cannot measure correction count, control-mode failures, tutorial beat retries,
   route abandonment, prompt comprehension, or progression bottlenecks. Add an opt-in, bounded,
   exportable schema for PQ-007/PQ-025 studies.
4. **Prove the tutorial that actually exists.** The live tutorial has ten staged beats; the named
   first-15-minute browser check samples only its opening. Exercise the real sequence or rename the
   narrower proof.
5. **Do not add a generic player-level/XP treadmill.** SpaceFace already has player mastery, ships
   and modules, 29 tech nodes, reputation, three career ladders, discovery, automation, and story
   state. Improve the coherence and feedback of those layers instead of duplicating them with one
   number.
6. **Make progression expand possibility.** Preserve nodes that unlock ships, modules, roles, and
   verbs. Explain how RP is earned; test its concentration in recon/salvage; and challenge
   credit-plus-RP research costs when the unlocked equipment then costs credits again.
7. **Make the economy tell causal stories.** The simulation, price memory, demand drivers, route
   planner, receipts, contracts, and automation already exist. The next question is whether a
   player can predict, explain, and act on them across viable 30/90-minute careers—not whether the
   game needs more commodities.
8. **Use failure as information and continuation.** The current recovery, insurance, hardship,
   cargo, and story protections are a strong base. Surface the rich defeat receipt, shorten the
   return to meaningful choice, and let selected failures create follow-up states.
9. **Prioritize causal readability over maximum spectacle.** Complete the remaining cue families
   so facing, velocity, threat, target state, impact, damage source, reward, and navigation remain
   legible with reduced motion, high contrast, or audio disabled.
10. **Sequence bold work after the core corridor is accepted.** The deferred Massline and physical
    play packets are scientifically plausible high-upside bets because they deepen autonomy,
    mastery, and systemic consequence. They are not substitutes for PQ-007/PQ-025 truth and
    acceptance.

## Reports

| Document | Question answered |
|---|---|
| [01_METHOD_AND_EVIDENCE.md](./01_METHOD_AND_EVIDENCE.md) | What counts as evidence, what was inspected, how popularity and implementation claims are bounded, and how future experiments should be run |
| [02_SCIENCE_OF_FUN.md](./02_SCIENCE_OF_FUN.md) | What psychology and player-experience research can—and cannot—say about controls, challenge, curiosity, story, feedback, failure, progression, and accessibility |
| [03_COMPARABLE_GAMES.md](./03_COMPARABLE_GAMES.md) | What open-source, commercial space, and non-space games contribute as mechanism references, with popularity separated from causality |
| [04_SPACEFACE_GAP_ANALYSIS.md](./04_SPACEFACE_GAP_ANALYSIS.md) | What is live, focused-green, unaccepted, contradictory, or genuinely missing in the current repository |
| [05_IMPROVEMENT_PORTFOLIO.md](./05_IMPROVEMENT_PORTFOLIO.md) | High-confidence polish, frontend/backend/gameplay improvements, economic and strategic directions, and bold bets |
| [06_EXECUTION_PLAN.md](./06_EXECUTION_PLAN.md) | Bounded implementation and study packets mapped to actual files, tests, keyboard/trackpad constraints, and existing PQ identities |
| [SOURCES.md](./SOURCES.md) | Academic papers, developer sources, popularity/adoption sources, and repository evidence |

## How to use this dossier

- Start implementation routing at [CANONICAL_BUILD_MAP.md](../../../CANONICAL_BUILD_MAP.md), not
  here.
- Use [program/roadmap/program-queue.json](../../program/roadmap/program-queue.json) for packet
  identity and [program/NOW.md](../../program/NOW.md) for current collision/lease truth.
- Treat a recommendation mapped to an existing PQ packet as design input to that packet, not an
  automatic scope expansion.
- Route a valuable unmapped outcome through
  [program/06_RETAINED_FUTURE_BACKLOG.md](../../program/06_RETAINED_FUTURE_BACKLOG.md) before
  admission.
- Re-verify every dated file/line or packet-state claim against the live tree before acting.
- Do not use adoption figures, Steam concurrency, review positivity, GitHub stars, or this report's
  confidence labels as proof that a design will be fun in SpaceFace.

## The proposed quality model

The study uses seven separable outcomes. No single one is “fun”:

| Outcome | Player question | SpaceFace manifestation |
|---|---|---|
| Effectance | “Did the game hear me, and did my action matter?” | immediate input/state feedback, predictable mode and targeting |
| Competence | “Can I understand, improve, and express skill?” | flight, Massline, combat, route and economy mastery |
| Autonomy | “Do I own meaningful choices?” | careers, builds, routes, tactics, story and risk decisions |
| Curiosity | “Is there an answerable gap worth investigating?” | signals, sites, market causes, factions, 47-A evidence |
| Relatedness | “Does someone or something remember and care?” | contacts, factions, crew-like continuity, changed world responses |
| Appreciation/meaning | “Did this matter beyond winning?” | consequences, failure continuation, endings, legacy |
| Enjoyment/affect | “Did I like this experience?” | pleasure, tension/release, audio/visual feel, desire to repeat |

Behavioral retention, playtime, completion, repetition, and return are measured separately. They are
not accepted as substitutes for enjoyment, mastery, trust, or well-being.

## Recommended first move

The first implementation slice should remain narrow:

1. complete PQ-007's control-truth repair across prompts, GDD/spec text, and stale acceptance tools;
2. extend its regression check to forbid only the rejected **control mechanic** language, while
   allowing ordinary narrative/AI uses of the word “pursuit”;
3. expose trackpad-safe alternatives for primary fire and mining without changing Pilot semantics;
4. add bounded local control/onboarding instrumentation and JSON export;
5. obtain current Browser and Electron evidence on an actual Windows trackpad through the validation
   broker.

That slice is an unusually strong improvement because it repairs truth, accessibility,
measurement, and acceptance without adding a competing subsystem or changing the product
direction.
