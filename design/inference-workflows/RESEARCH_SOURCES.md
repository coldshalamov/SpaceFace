# Research Sources and Bounded Lessons

These sources are mechanism references, not product authority. Current SpaceFace GDD, architecture, live code and user direction remain controlling.

## Selection, diversity, and review mechanisms (2026-08 revision)

Each entry names the mechanism AND where it landed in this system — a source with
no transfer line does not belong here.

- Mouret & Clune — "Illuminating search spaces by mapping elites" (MAP-Elites,
  arXiv:1504.04909, 2015): keep the best solution **per behavioral cell** instead
  of one global optimum; the archive of diverse elites beats single-objective
  search for creative spaces. → Transfer: the director board's mode cells and the
  slate **slots** in `01_SCALE_AND_DISPATCH.md` §6; fingerprint axes as the
  behavior descriptors (`scripts/lib/inferenceCore.mjs`: `buildDirectorBoard`,
  `checkSlate`). Bounded: a handful of hand-chosen cells, not a full QD archive.
- Lehman & Stanley — novelty search ("Abandoning Objectives", Evol. Comp. 2011):
  novelty is measured against an **archive of everything already found**, not the
  current generation. → Transfer: distinctness checked against the recorded
  corpus, not only the tranche (`sameIdea` vs memory; `01` §7).
- Doshi & Hauser — "Generative AI enhances individual creativity but reduces the
  collective diversity of novel content" (Science Advances, 2024): AI-assisted
  ideas are individually better but collectively more similar. → Transfer:
  independent divergent passes with one reference-blind, repo-native pass
  (`02` Phase 4); printed-examples-are-spent rule.
- Liang et al. — "Encouraging Divergent Thinking in LLMs through Multi-Agent
  Debate" (arXiv:2305.19118): self-reflection suffers Degeneration-of-Thought —
  once confident, a context cannot generate novel alternatives; genuinely
  separate contexts can. Debate helps **conditionally**, not automatically. →
  Transfer: passes run in separate contexts; the optional contrarian pass; the
  existing two-strike rule stops infinite self-revision.
- Madaan et al. — "Self-Refine" (arXiv:2303.17651): self-feedback improves output
  only in some regimes and cannot be the acceptance authority. → Transfer: the
  creator never issues its own verdict (`05` Independence rule; enforced by
  `inference-record.mjs` requiring a review artifact).
- Zheng et al. — "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena"
  (arXiv:2306.05685): position bias and verbosity bias flip verdicts. →
  Transfer: pairwise evidence shown in both orders; a flipped verdict records
  UNCERTAIN; reviewers never see effort narratives (`05`).
- Panickssery et al. — "LLM Evaluators Recognize and Favor Their Own Generations"
  (arXiv:2404.13076) and "Self-Preference Bias in LLM-as-a-Judge"
  (arXiv:2410.21819): evaluators score familiar (low-perplexity, own-style) text
  higher. → Transfer: prefer a different model/context for review; calibrate
  against named accepted/cut anchor units; the human reel is the uncorrelated
  check (`05` Human taste gates).
- Eval-driven agent practice: behavior-specific scenarios with synthetic fixtures
  and deterministic seeds, defined by product intent rather than by the agent
  being tested. → Transfer: `test/inference-core.test.mjs` (16 pinned failure
  modes) and `test/inference-detect-live.test.mjs`; the selection logic is pure
  and testable by design.

## Production and vertical slices

- Greg Donovan / Volition — “The Vertical Slice Challenge” (GDC 2015): https://gdcvault.com/play/1022328/The-Vertical-Slice — a slice proves both what the game is and whether the team knows how to produce it.

## Living worlds and group behavior

- Roxanne Blouin-Payer / Ubisoft — “Helping It All Emerge: Managing Crowd AI in Watch Dogs 2” (GDC 2017): https://www.gdcvault.com/play/1024426/Helping-It-All-Emerge-Managing — personality, reactions and bounded unpredictability create anecdotes.
- Ubisoft Toronto — “Branching Out: Watch Dogs Legion's Architecture for Group AI Behaviours” (GDC 2021): https://www.gdcvault.com/play/1027239/AI-Summit-Branching-Out-Watch — multi-actor scenes become richer when roles share group context.

## Procedural breadth and art control

- Grant Duncan / Hello Games — “How I Learned to Love Procedural Art” (GDC 2015): https://www.gdcvault.com/play/1021805/Art-Direction-Bootcamp-How-I — procedural tools require strong artistic grammar and curation.
- Grant Duncan / Hello Games — “Do Artists Dream of Electric Sheep?” (GDC 2015): https://www.gdcvault.com/play/1021935/Do-Artists-Dream-of-Electric — art and programming pipelines must be designed together.
- Innes McKendrick / Hello Games — “Continuous World Generation in No Man's Sky” (GDC 2017): https://www.gdcvault.com/play/1024265/Continuous_World_Generation_in__No_Man_s_Sky_ — generation, population and simulation are separate stages.
- Tom Delboo / Guerrilla — “Taking a Procedural Approach to Texturing the Machines of Horizon Forbidden West” (GDC 2023): https://gdcvault.com/play/1029327/Taking-a-Procedural-Approach-to — reusable workflows should accelerate quality while preserving design/art direction.

## Physics as premise

- Richard Harrison / Blackbird Interactive — “How to Dissect an Exploding Spaceship in Hardspace: Shipbreaker” (2020): https://www.gdcvault.com/play/1026837/How-to-Dissect-an-Exploding — content pipelines must support the physical verb and consequences.
- Bennett Foddy — “Designing with Physics: Bend the Physics Engine to Your Will” (2015): https://gdcvault.com/play/1021921/Designing-with-Physics-Bend-the — physical fidelity is subordinate to solid, controllable feel.
- John Krajewski / Strange Loop Games — “Liquid Intelligence: Connecting AI and Physics in Vessel” (2013): https://gdcvault.com/play/1019279/Liquid-Intelligence-Connecting-AI-and — AI and gameplay become richer when both act through the same physical rules.
- Vicarious Visions — “Supercharged! Vehicle Physics in Skylanders” (2016): https://www.gdcvault.com/play/1023219/Supercharged-Vehicle-Physics-in-Skylanders — keep physics emergent while providing simple designer controls.

## Audio and interface bound to truth

- Ben McCullough / Blackbird — “Breaking the Silence: The Sound of Hardspace: Shipbreaker” (2021): https://gdcvault.com/play/1027227/Breaking-the-Silence-The-Sound — consistent world rules create an original soundscape.
- Vidhi Shah / Blackbird — “Cutting Apart the Diegetic Interface of Hardspace: Shipbreaker” (2021): https://www.gdcvault.com/play/1027158/Cutting-Apart-The-Diegetic-Interface — interface style must serve usability and cohesion.
- Paul Weir / Earcom — “The Sound of No Man's Sky” (2017): https://www.gdcvault.com/play/1024067/The-Sound-of-No-Man — reactive audio needs composed source material and deep state integration, not random synth.

## Procedural worlds and authored specificity

- Whitney Clayton / Compulsion — “You Look Smashing: Procedural Art Direction of We Happy Few” (2017): https://www.gdcvault.com/play/1024239/You-Look-Smashing-Procedural-Art — procedural worlds need setting research, art direction and production controls.
- “Beyond Procedural Horizons” (GDC 2018): https://www.gdcvault.com/play/1025069/Beyond-Procedural-Horizons-Exploring-Different — each generated domain needs authored constraints.

## Space-game and systems references

The workflows use bounded lessons from Freelancer, Endless Sky, EVE Online, Outer Wilds, Subnautica, Kerbal Space Program, FTL, DOOM (2016), Left 4 Dead, Dishonored, Into the Breach and DUST 514. When a source is unavailable, use only the bounded lesson in `03_REFERENCE_GAME_PATTERN_LIBRARY.md` rather than inventing details.
