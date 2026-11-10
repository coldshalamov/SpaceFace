# Method and evidence standard

**Research snapshot:** 2026-07-27  
**Disposition:** retained research and decision support. This document does not admit work, set
program order, or prove that a proposed feature is implemented.

## 1. Research question

This study asks:

> Which changes are most likely to improve SpaceFace for its intended players, given the game's
> actual deterministic simulation, single-player structure, top-down presentation, keyboard and
> trackpad constraints, existing systems, and implementation budget?

That question has three distinct parts:

1. What outcomes do players actually value, and how can they be measured without reducing "fun" to
   one number?
2. What causal or correlational evidence exists for the mechanisms that might produce those
   outcomes?
3. Which mechanisms fit SpaceFace well enough to justify a bounded implementation study?

The study does **not** assume that a popular feature caused a game's popularity, that a psychological
theory is already a design recipe, or that a laboratory result transfers unchanged to a long-form
space game.

## 2. Fun is multidimensional

There is no scientifically adequate single "fun score." Player experience research distinguishes
several outcomes that can move independently:

| Outcome | Operational question | Example measures |
|---|---|---|
| Enjoyment | Did the player like the experience? | enjoyment rating, positive affect, voluntary replay with stated liking |
| Effectance | Did the game register the player's intent and show that the action mattered? | action-outcome attribution, perceived control, command-to-feedback latency |
| Competence | Could the player understand, improve, and express skill? | mastery, competence satisfaction/frustration, error reduction |
| Autonomy | Did the player own meaningful and comprehensible choices? | perceived agency, choice consequence recall, autonomy satisfaction/frustration |
| Curiosity | Was there an answerable information gap worth pursuing? | optional investigation, hypothesis formation, delayed recall |
| Relatedness | Did the player experience belonging, reciprocity, or recognition? | relatedness satisfaction/frustration, character/faction recall |
| Appreciation and meaning | Did the experience matter beyond immediate pleasure or victory? | appreciation, insight, moral or narrative consequence |
| Flow and absorption | Was attention deeply organized around the activity? | validated flow/immersion instruments, interruption awareness |
| Trust and fairness | Could the player form and rely on an accurate model of the game? | prediction accuracy, fairness and transparency ratings |
| Frustration and strain | What negative costs accompanied play? | need frustration, tension, fatigue, discomfort, regret |

Behavioral measures such as playtime, completion, repetitions, return rate, session count, purchase,
or click-through are a separate family. They can help locate friction or interest, but they are not
accepted as proxies for enjoyment, mastery, trust, or well-being. A cross-sectional online-game
survey found that obsessive passion predicted more hours while also predicting lower enjoyment and
more post-play tension
([Przybylski et al. 2009](https://doi.org/10.1089/cpb.2009.0083)). That study is correlational, but it
is a strong warning against equating behavioral persistence with quality.

The general measurement problem is well documented. A systematic review of 87 quantitative studies
found that enjoyment is a positive cognitive and affective appraisal distinct from flow and can
occur without substantial challenge or cognitive involvement
([Mekler et al. 2014](https://doi.org/10.1145/2556288.2557078)). A later systematic review of 70
articles found that 60% used ad-hoc enjoyment measures
([Caroux and Pujol 2024](https://doi.org/10.1080/10447318.2023.2210880)). SpaceFace studies should
therefore use validated constructs and state exactly which outcome each metric represents.

## 3. Evidence classes

Every material claim in this dossier should be classifiable as one of the following. Confidence is
reported separately; the class alone does not guarantee quality.

| Code | Evidence class | What it can support | What it cannot support by itself |
|---|---|---|---|
| **CAUSAL** | Randomized or credibly quasi-experimental manipulation | The tested intervention changed the measured outcome in that population and context | Universal transfer, long-term effects, or which element of a bundled intervention was active |
| **META/SYSTEMATIC** | Systematic review or meta-analysis | The shape, consistency, heterogeneity, and gaps of a literature | Causality when the underlying studies are correlational; a universal recipe when pooled studies are sparse or heterogeneous |
| **CORRELATIONAL** | Survey, observational telemetry, longitudinal association, or uncontrolled comparison | Variables co-vary and may identify useful predictors or player segments | Direction of causation or exclusion of confounding |
| **QUALITATIVE** | Interview, observation, thematic analysis, diary, or case study | Mechanisms, meanings, failure modes, and hypotheses that aggregate metrics may miss | Prevalence, average effect size, or causal magnitude |
| **MEASUREMENT** | Scale development, validation, reliability, or measurement-invariance study | A defensible way to distinguish and measure constructs | That improving a score will improve the game or that a mechanic causes the construct |
| **DEVELOPER PRACTICE** | Engine documentation, postmortem, accessibility guidance, platform convention, or experienced-practitioner report | Feasibility constraints, known implementation risks, and candidate techniques | Psychological causality, expected enjoyment effect, or population-level preference |
| **POPULARITY** | Sales, concurrency, review count, ratings, awards, cultural reach, downloads, forks, or stars | Adoption and attention under a particular market and historical context | That any shared feature caused adoption, retention, acclaim, or fun |
| **SPACEFACE HYPOTHESIS** | A mechanism translated into a falsifiable claim for this game | A bounded proposal with outcomes and rejection conditions | Evidence until tested on the live SpaceFace route and intended hardware |
| **IMPLEMENTATION EVIDENCE** | Live code, focused checks, telemetry, Browser/Electron evidence, and player-route observation | What exists, is reachable, behaves as claimed, and passes its current acceptance surface | General player value or scientific causality without an appropriate study |

Theory is recorded as the rationale inside a hypothesis, not treated as an extra proof class.
Self-determination theory, flow theory, predictive-processing accounts, and learning-progress models
can organize questions. They do not establish that a particular control curve, skill tree, reward
schedule, or pacing formula is correct for SpaceFace.

### Confidence labels

Recommendations use the following confidence language:

- **Higher confidence:** replicated or aggregated evidence with a mechanism that transfers directly,
  plus low implementation downside.
- **Moderate confidence:** direct experimental evidence with meaningful context or sample limits, or
  convergent evidence from several weaker designs.
- **Hypothesis:** plausible mechanism but weak or indirect transfer evidence; test before broad
  adoption.
- **Speculative bold bet:** potentially high value and high uncertainty; prototype only after the
  core corridor is truthful and measurable.

These labels are not numerical probabilities and must not be used as program status.

## 4. Study appraisal

Each cited finding is appraised across six dimensions.

### 4.1 Design

- Was the intervention randomized?
- Was the study preregistered?
- Was the comparison between groups, within subjects, yoked, or observational?
- Were the manipulation and outcome measured independently?
- Was the analysis exploratory, confirmatory, or retrospective?

### 4.2 Sample

- Report total sample size and, when relevant, per-condition size.
- Record recruitment source, age range, game experience, disability representation, and attrition
  when the paper provides them.
- Do not treat a large convenience sample as representative merely because it is large.
- Do not hide small samples behind a general citation.

### 4.3 Intervention fidelity

- Distinguish a single mechanic from a bundle of features.
- Confirm whether the intervention changed the player's perceived experience, not merely an
  objective variable.
- Record dose and duration. A 15-minute bespoke game does not establish a 30-hour progression
  effect.

### 4.4 Outcome validity

- Prefer validated, construct-specific scales over an improvised "fun" question.
- Separate liking from wanting, competence satisfaction from competence frustration, and
  appreciation from immediate enjoyment.
- Use behavioral evidence to complement—not replace—subjective experience.

### 4.5 Statistical interpretation

- Report effect size and interval when available, not only a significance threshold.
- Treat high heterogeneity as a reason to study moderators and segments.
- A non-significant, underpowered estimate is not proof of no effect.
- A statistically detectable effect can still be too small or costly to matter in the shipped game.
- Mediation models do not independently randomize the mediator and therefore do not prove the full
  causal chain.

### 4.6 Transfer to SpaceFace

Transfer confidence decreases when a result comes from:

- a non-game work or learning task;
- a simple bespoke game with no long-term learning;
- a console motion controller rather than a keyboard and physical laptop trackpad;
- a multiplayer setting when the proposal uses solo NPCs;
- a short first-session study when the proposal changes long-form economy or progression;
- self-selected retrospective reports;
- a monetized reward context unlike SpaceFace.

A low-transfer study may still identify a mechanism worth testing. It must be labeled as a
SpaceFace hypothesis rather than reported as a settled improvement.

## 5. How comparable games are used

Open-source games are especially valuable for implementation archaeology: source code, issue
history, configuration, contributor discussion, and modding surfaces reveal how a mechanic is
actually built and maintained. Commercial games contribute polished interaction references,
longitudinal player discourse, and market-scale examples. Non-space games are deliberately included
because they can expose mechanisms obscured by genre convention.

The comparison process is:

1. Record the game's actual mechanic and player-facing loop.
2. Record the source of the claim: code, official documentation, developer statement, observation,
   review, or popularity metric.
3. Identify the proposed mechanism: effectance, mastery, autonomy, curiosity, relatedness, meaning,
   pacing, readability, or recovery.
4. Identify major confounds: brand, budget, marketing, price, platform, release timing, network
   effects, franchise history, streaming, mod ecosystem, and audience.
5. Ask whether the mechanism fits SpaceFace's deterministic single-player route and controls.
6. Convert it to a falsifiable SpaceFace hypothesis.

The study does not use statements such as "most popular games have progression" as causal evidence.
Nearly every feature category appears in successful and unsuccessful games. The useful unit of
comparison is the **relationship between intent, response, consequence, recovery, and the next
meaningful choice**, not the presence of a checklist noun.

Popularity measures also answer different questions:

| Measure | Defensible interpretation | Non-defensible interpretation |
|---|---|---|
| Concurrent players | Current activity on a measured platform | Lifetime popularity or enjoyment |
| Copies sold/revenue | Commercial adoption under a price and marketing context | Design quality |
| Review positivity | Sentiment among people who chose to review | Representative satisfaction or causality |
| Awards/critic scores | Institutional or critical recognition | Broad player preference |
| GitHub stars/forks | Developer attention and repository adoption | Player population or game quality |
| Mod count | Ecosystem activity under particular tool and community conditions | Baseline usability or universal appeal |

## 6. Translation discipline

Research reaches implementation through a six-step ladder:

```text
finding -> bounded interpretation -> candidate mechanism -> SpaceFace hypothesis
        -> reversible prototype -> current player-route evidence
```

Example:

1. **Finding:** reduced action-outcome effectance increased frustration in a controlled keyboard
   task.
2. **Bounded interpretation:** reliable and legible action response can matter; the study does not
   prescribe a flight model.
3. **Mechanism:** the player can form and trust a causal model of controls.
4. **Hypothesis:** immediate input/mode feedback plus optional intent-preserving assistance will
   improve novice flight control without reducing expert precision.
5. **Prototype:** a reversible control profile and instrumentation flag.
6. **Evidence:** real trackpad and mouse trials on the shared Browser/Electron route, with precision
   and accessibility guardrails.

An implementation should not be admitted merely because steps 1–4 exist.

## 7. Measurement battery

No single instrument covers the full question. A compact SpaceFace battery can combine:

- The **Player Experience Inventory (PXI)**, developed through expert review and five studies with
  529 participants, for functional and psychosocial constructs including ease of control, progress
  feedback, goals, challenge, mastery, curiosity, autonomy, meaning, immersion, and audiovisual
  appeal ([Vanden Abeele et al. 2020](https://doi.org/10.1016/j.ijhcs.2019.102370)).
- **BANGS**, validated across five studies and 1,246 unique participants, for satisfaction and
  frustration of autonomy, competence, and relatedness
  ([Ballou et al. 2024](https://doi.org/10.1016/j.ijhcs.2024.103289)).
- **GUESS** or its short form for periodic holistic evaluation. The original scale used exploratory
  factor analysis with 629 participants and confirmatory factor analysis with 729 participants
  across more than 450 games
  ([Phan, Keebler, and Chaparro 2016](https://doi.org/10.1177/0018720816669646)).
- Short task-specific questions for attribution, prediction, comfort, consequence recall, and
  comprehension. These should not be mislabeled as validated enjoyment scales.
- Local behavioral telemetry tied to a declared hypothesis.
- A brief structured interview or think-aloud debrief to identify mechanism and misunderstanding.

The battery should be shortened for each study. Asking every scale after every task produces fatigue
and false precision.

## 8. Falsifiable SpaceFace study protocol

### 8.1 Before implementation

For each study, write a one-page protocol containing:

1. **Hypothesis:** one directional claim.
2. **Mechanism:** why the intervention should affect the outcome.
3. **Evidence class:** which prior findings motivate it and how direct their transfer is.
4. **Population:** novice/experienced status, accessibility needs, and intended hardware.
5. **Conditions:** current behavior and one or more precisely defined alternatives.
6. **Primary outcome:** one construct or behavioral task selected in advance.
7. **Secondary outcomes:** explanatory or exploratory measures.
8. **Guardrails:** outcomes that must not regress.
9. **Minimum meaningful effect:** the smallest change worth shipping.
10. **Rejection condition:** evidence that would cause the proposal to be dropped or segmented.

### 8.2 Participants and segmentation

- Separate first-time players from players already fluent in SpaceFace.
- Record relevant experience with flight, action, strategy, and space games.
- Record mouse versus physical trackpad, keyboard form factor, handedness, and assistive technology.
- Include disabled players for accessibility claims; non-disabled simulation of disability is not a
  substitute.
- Do not average away device or expertise interactions.

Early formative studies may be small and qualitative. Any broad control or onboarding claim should
then receive a powered comparison. Power calculations must use the selected primary outcome and a
defensible minimum meaningful effect, not an effect copied uncritically from another game.

### 8.3 Assignment and tasks

- Randomize condition order or group assignment where learning carryover allows.
- Use between-group designs for tutorials when exposure would contaminate a second condition.
- Use within-subject designs for short audiovisual comparisons when counterbalancing is credible.
- Keep content, encounter seed, hardware, frame pacing, and task objective matched unless one is the
  manipulated variable.
- Exercise the live Browser and Electron route when the hypothesis concerns shipped experience.
- Use physical Windows trackpads for trackpad claims.

### 8.4 Minimum control study

A flight-control study should cross at least:

- current versus candidate profile;
- novice versus experienced player;
- mouse versus physical laptop trackpad.

Recommended outcomes:

| Type | Measures |
|---|---|
| Primary task | intentional docking, target acquisition, controlled turn, braking/intercept, or Massline task success |
| Precision | overshoot, correction count, target reacquisition, unintended mode transition, missed input |
| Timing | command-to-visible-feedback latency, time to stabilize, time to recover after pointer-lock loss |
| Learning | error reduction across trials and delayed unaided recall |
| Experience | PXI ease of control/mastery; BANGS competence and autonomy satisfaction/frustration |
| Accessibility | alternative-input success, chord errors, discomfort, fatigue, non-color/audio-independent comprehension |
| Guardrails | expert precision, deterministic input semantics, no hidden override of player intent |

The candidate fails if apparent novice improvement is produced by lost expert precision, opaque
steering, changed simulation truth, or inaccessible mandatory gestures.

### 8.5 Minimum onboarding study

Compare the current route with a contextual, skippable sequence. The primary outcome should be
unaided performance later—not tutorial completion. Record:

- time to first intentional success;
- wrong-action and repeated-error counts;
- help requests;
- delayed recall in a later session;
- tutorial abandonment;
- enjoyment and competence frustration;
- expert skip/test-out success.

Tutorial results must be segmented by prior experience. Large live-game experiments found that
contextual tutorials dramatically helped the complex Foldit but did not help Refraction and reduced
return in Hello Worlds
([Andersen et al. 2012](https://doi.org/10.1145/2207676.2207687)). A mandatory tutorial is therefore
not presumed beneficial.

### 8.6 Longitudinal progression and economy study

First-session tests cannot establish a progression or economy claim. Use fixed checkpoints such as
30 minutes, 90 minutes, and multiple sessions. Record:

- time to the first meaningful build or route choice;
- percentage of unlocks that change available strategy;
- build diversity and unused unlocks;
- respec, regret, and irreversible-choice abandonment;
- resource sources, sinks, inventory dwell, and wealth distribution;
- time spent recovering from ordinary experimentation;
- ability to explain a price change or predict a profitable response;
- competence, autonomy, trust, enjoyment, and tension separately;
- return intention and actual return as secondary behavioral outcomes.

### 8.7 Analysis and reporting

- Preserve all conditions, exclusions, and failed outcomes in the report.
- Report effect sizes and uncertainty intervals.
- Report device and expertise interactions even when the aggregate is null.
- Distinguish confirmatory from exploratory analyses.
- Do not declare "no difference" from a non-significant underpowered result.
- Do not promote a feature because a secondary metric improved while the primary outcome failed.
- Record harms and guardrail regressions alongside benefits.
- Preserve anonymized local receipts and exact build identity needed to reproduce the trial.

## 9. Privacy and ethics

SpaceFace does not need surveillance or coercive engagement optimization to study quality.
Instrumentation should be:

- opt-in for external participants;
- local-first and exportable;
- bounded to declared questions;
- free of message content, unrelated device data, or hidden identity collection;
- documented in plain language;
- removable after the study where it has no continuing diagnostic value.

Do not use opaque reward odds, artificial scarcity, loss aversion, daily obligation, or deliberately
frustrating friction as experimental engagement tools. Randomness can enrich encounters and
uncertainty; it should not obscure whether an input was accepted or whether a player receives value
already earned or purchased.

## 10. Known evidence gaps

The literature does not currently justify a universal prescription for:

- keyboard/trackpad flight curves;
- the ideal amount of input smoothing or assistance;
- a fixed combat/exploration pacing interval;
- skill-tree topology;
- a healthy single-player economy formula;
- optimal narrative branch count;
- whether solo NPC continuity substitutes for multiplayer relatedness;
- the long-term effect of adaptive music;
- an ideal number of choices;
- a universal challenge-success ratio.

These are not reasons to avoid design. They are reasons to prototype reversibly, measure the intended
outcome, and state the rejection condition before implementation expands.

## 11. Rejected inference practices

This study explicitly rejects the following:

- treating retention, hours, completion, or spending as proof of fun;
- treating correlation, mediation, or player recollection as randomized causality;
- treating a theory label as evidence for a mechanic;
- treating developer practice as a psychological outcome study;
- treating popularity or acclaim as causal evidence;
- inferring a universal rule from one bespoke game;
- hiding a weak sample or wide interval behind a citation;
- reporting a null as proof of equivalence without adequate power;
- averaging away novices, experts, trackpad users, and disabled players;
- changing several mechanics and attributing the result to one;
- using worker narration, code presence, or a hidden feature as player-route acceptance;
- promoting an intervention when its primary outcome fails or a guardrail regresses.

The standard for a SpaceFace improvement is therefore not "research-backed" as a slogan. It is a
traceable chain from evidence class, through a bounded mechanism and falsifiable hypothesis, to
current player-route evidence on the intended controls.
