<!-- LIFETIME: DURABLE -->
# SpaceFace game design research and golden standard

## Purpose and central recommendation

This document turns research on motivation, motor learning, attention, decision making and game evaluation into a design standard for SpaceFace. It is written for Robin and the agents developing the game. It explains which experience to build, why particular interventions are promising, how to evaluate the actual implementation, and how to turn findings into finite improvements.

The strongest direction is **expressive physical mastery with consequential build choices**. Make steering, momentum, tethering, displacement and attacks a compact set of dependable tools. Put them in situations where geometry, mass, enemy commitments and objectives change which tool is useful. Let the player learn a rule, exploit it deliberately, produce a disproportionate payoff, and discover a new use for it later. Progression should expand this ability to act, rather than merely multiply numbers.

This is a research-informed design conclusion, not a direct finding from a single experiment. The research supplies tested interventions, evidence about candidate mechanisms, and formal tools for analyzing choices; SpaceFace supplies the desired identity, constraints and implementation. The purpose is to make better decisions, not to avoid decisions because transfer is imperfect.

Research date: 2 October 2026. Current-source evaluation is pinned to master **74c31b50a94f6c14889f0182b0c7894b63743159**. Selected task owners were subsequently compared through **18a338a1fbe50d79b523efa141e0f917299b0730**, then refreshed after the merge to **d410e64435cf6e30f2587c5ee5f05be8c2a92283**. ADMITTED_REPAIRS.md credits resolved scanner/fit work and narrows the current scope. The code findings are a targeted source audit with isolated production-code probes, not a complete rendered playthrough. The delivered research package contains the fuller source audits; the admitted task brief here carries the implementation-specific evidence and checks.

**Repository use:** supporting research only. Current task admission is limited to ADMITTED_REPAIRS.md and the canonical build-map rows; examples elsewhere in this reference are not newly authorized implementation. The rubric is not a mandatory new score, receipt or release gate. Newer explicit owner decisions, including the Swarm Arcade progression/crossover direction, outrank recommendations in this research.

## How to use this document

Read the mechanism sections before generating tasks. Use the grading rubric to locate a specific weak experience. Read the source audit to avoid proposing work already implemented. Select one improvement brief, reconcile it with the current owner and existing packet, then use the evaluation workflow. The research appendices provide original source links, study designs, limitations and additional implementation examples.

This standard is an evaluation reference for the existing BUILD_MAP, finish lanes and INFERENCE process. It is not another dispatcher or an independent task queue. A claim that a task is shipped must be interpreted against the task's actual acceptance scope; later research can identify a residual without invalidating its completed work.

## What the research can establish

Experiments have demonstrated effects of particular control, feedback, challenge and choice manipulations on performance and reported experience. These findings justify directional design decisions. Formal game theory can establish properties of choices and strategies under stated assumptions. Observational sales research supplies additional commercial evidence, with stronger identification assumptions than a randomized intervention.

We will distinguish four kinds of statement:

- **Experimental evidence:** a manipulated variable changed a measured outcome in a specified study
- **Association or synthesis:** a relationship or theoretical account that may explain experience, with its inferential limits
- **Formal result:** a property of a mathematical model, conditional on its definitions
- **SpaceFace design decision:** our chosen application, to be tested against this game's behavior and identity

The first three inform the fourth. They do not excuse indecision. Conversely, a computer-controlled ship completing a maneuver is evidence that the maneuver works under its constraints; it is not a new experiment measuring human enjoyment. Fully agentic development remains the operating model. We use existing human research as evidence and autonomous execution as implementation verification, with no required human-playtest gate.

## The experience we are trying to create

SpaceFace should let a player say:

1. I can make the ship do what I intend, and I can tell what happened
2. I can get substantially better at using the same tools
3. Position and momentum create opportunities, even without shooting
4. My chosen build changes how I approach a situation
5. The world reacts according to rules I can learn and combine
6. I can turn preparation and judgment into an outrageous physical payoff
7. A mistake often leaves an interesting recovery decision
8. My actions leave an understandable consequence in the local world
9. New content gives familiar skills a new purpose
10. The game respects my time, attention and ability to stop

These are product commitments, not psychometric survey results. They preserve the fast physics playground and RPG identity. They do not require every battle to be close, every build to be equally strong, or every moment to demand concentration.

## Mechanisms that should drive design

### 1 Reliable cause and effect makes power legible

The useful psychological distinction is between causing an effect and demonstrating skill. Registering a command supports control; recognizing a successful difficult action supports competence. Kao and colleagues' 2024 action-RPG experiment supports making feedback depend on successful outcomes, while showing that extra amplification can backfire. Their proposed agency explanation is not itself a separately randomized mechanism. [Original study](https://doi.org/10.1145/3613904.3642656)

**SpaceFace decision:** build a causal sequence for each physical action: intention, accepted command, applied effect, contact, consequence and reward. A shove into empty space should acknowledge activation; a redirected attacker should visibly change course; a collision should reveal its contact and force; a kill should be confirmed only when it happened. All of these should not trigger the same dramatic signal.

**What improves:** the player can connect an input to a physical result, learn the rules and deliberately reproduce it. More particles are useful when they clarify or emphasize this chain. They are harmful when they obscure its participants.

**Judge:** can a reviewer identify the initiating action, affected object, meaningful outcome and reason for success from the ordinary presentation? Is that account consistent with the authoritative event trace? If only hidden telemetry reveals the explanation, the mechanical and presentation claims have different grades.

### 2 Stable dynamics create something worth mastering

Experimental motor-learning research shows adaptation to lawful dynamics and systematic aftereffects when those dynamics change. The transferable lesson is predictability, not a demand for literal space realism. [Shadmehr and Mussa-Ivaldi](https://doi.org/10.1523/JNEUROSCI.14-05-03208.1994)

**SpaceFace decision:** preserve one understandable relationship between flight input, heading, velocity, braking and tether release. Make cargo, environmental forces and assistance changes observable. Difficulty should primarily come from what the player must accomplish with the law, rather than unexplained changes to the law.

The current assisted-release contract takes priority over old notebook aspirations. Do not resurrect an obsolete minimum-coasting-speed target or globally alter drag to make a demonstration look exciting. A distinctive movement fitting may intentionally modify a rule, but the modification needs its own comprehensible contract.

**Judge:** can the same learned maneuver transfer to a different approach direction and geometry? Does a documented state explain every change in response? Test exact production owners, not a convenient imitation in a separate simulator.

### 3 Movement becomes play when the arrival state matters

Fitts' work establishes speed–accuracy relationships in endpoint tasks; Accot and Zhai distinguish continuously constrained steering. Neither supplies spaceship tuning constants. They support treating spatial tolerance and route geometry as deliberate task variables. [Fitts](https://doi.org/10.1037/h0055392), [Accot and Zhai](https://doi.org/10.1145/258549.258760)

**SpaceFace decision:** a useful route ends with the right velocity, angle, timing, cargo condition or cover, not merely at a coordinate. A straight approach can be easy but expose the ship. A curved current-assisted route can save time but demand preparation. A tether release can trade precision against speed. A wide bypass remains viable.

Movement can also be enjoyable as free play, rhythmic control or self-chosen experimentation; it does not need a mission payout every time. Meaningful arrival states are one way to give practiced control further purpose, not a requirement that every swing be instrumentally optimal.

This is the way to pursue the user's GTA-driving analogy without transplanting ramps into space indiscriminately. A jump is enjoyable partly because approach, commitment, trajectory, landing and recovery matter. SpaceFace needs analogous physical decisions using its own rules.

**Judge:** first use matched action traces to establish causal effects. Then compare several legal approaches, allowing bounded replanning after removing an interaction, on completion, time, exposure, resource cost and recovery. Demote an interaction only when its promised advantages remain absent across the tested approaches and contexts. Reaching the same endpoint by a swing can still have a different cost or expressive value. Do not force terrain usage with arbitrary bonus points merely to make its usage metric rise.

### 4 Selection and execution are different kinds of difficulty

Pointing and assistance studies show that acquisition tolerances and goal-helping assistance change performance; experienced agency is not reducible to literal obedience to every raw input. [Wen and colleagues](https://doi.org/10.1371/journal.pone.0125226)

**SpaceFace decision:** make choosing the intended target reliable. Let spatial execution, timing, exposure and resource commitment provide most of the combat skill. Tab selection, weapon lead, flight assistance and the physical interaction cursor must retain their distinct meanings. Existing assistance modes should remain explicit and predictable.

**Judge:** test crowded targets, crossing trajectories, temporary occlusion, destruction, focus loss and rebinding. Check acquisition errors separately from correctly selected but badly timed attacks. Do not cure a aiming problem by making the wrong target easier to select, or grade perfect targeting as proof of good piloting.

### 5 Teach prediction rather than memorized instructions

Learning studies distinguish guided performance from retention and transfer. Faded guidance and interleaved practice can improve later execution in studied motor tasks, even when immediate practice performance is worse. [Winstein and Schmidt](https://doi.org/10.1037/0278-7393.16.4.677), [Shea and Morgan](https://doi.org/10.1037/0278-7393.5.2.179)

**SpaceFace decision:** establish a relationship in a safe, simple situation, then vary its use. Teach stopping distance through an actual arrival task; teach tether release through a useful trajectory; then mix them with an intercept or load. Fade ghost paths and repeated coaching while retaining state feedback. Keep help available on demand.

**Judge:** a controller that depended on tutorial-only waypoints must not certify the ordinary route. Test the same rules with new geometry, velocity and objective order. This establishes structural transfer opportunity, not a measured human learning curve.

### 6 Curiosity needs learnable uncertainty

Research distinguishes interest in resolving uncertainty from success alone. A prediction-before-feedback intervention can increase curiosity in its studied learning setting; game studies also link uncertain outcomes to engagement. The specific shipping design remains our inference, detailed in the motivation section of RESEARCH_EVIDENCE.md.

**SpaceFace decision:** show an intelligible possibility whose result the player can investigate: a movable body near a firing lane, a current beside a cargo route, a vulnerable mount behind a shielded approach. Let the player ask whether a familiar tool works in this new situation, try it cheaply enough to learn, and observe the answer.

The rule should remain dependable even when the situation is novel. Randomly changing whether a known object is grippable creates uncertainty, but damages learning. A mystery needs an observable resolution; a hidden immunity is not automatically depth.

**Judge:** enumerate opportunities to form a prediction, take an intervention and see a disambiguating outcome. Add negative cases showing which objects or conditions differ and why. An unbounded pile of random outcomes is not scored as curiosity support.

### 7 Competence and autonomy need consequential choices

Self-determination research supplies evidence connecting autonomy and competence to game experience, including experiments manipulating supportive feature bundles. These findings support enabling choices and intelligible mastery, not treating badges or any one bundle component as independently proven. See the original studies and sample details in the motivation section of RESEARCH_EVIDENCE.md.

**SpaceFace decision:** a player should be able to choose a goal, an approach or a build with a comprehensible consequence. Progression should introduce a new timing, target relationship, resource tradeoff or environmental use. A numerical improvement can be valuable, especially when it changes a practical threshold, but a catalog of tiny percentages does not establish expressive depth.

**Judge:** for each advertised build identity, demonstrate an ordinary acquisition path and a situation in which it changes a useful plan. Preserve room for preference and style; not every option must maximize the same objective.

### 8 Earned overwhelming power can coexist with tension

Experiments on close versus lopsided contests support a role for outcome uncertainty in enjoyment, within their tested competitive tasks. That does not require equalizing every SpaceFace fight. The game's vision values earned physical unfairness.

**SpaceFace decision:** place uncertainty in preparation, timing, target choice, positioning or consequences, then let a successful setup pay off decisively. A player who uses a hulk to disable an overwhelming attacker should not have the reward erased by invisible enemy scaling. Later situations can introduce a different constraint rather than simply more health.

**Judge:** identify what made the payoff earned, what could have gone differently and how the player could learn it. Include safe mastery moments and low-pressure use of acquired skill. Reject a universal 50% win-rate target.

### 9 Counterplay is information plus a feasible response

Decision theory formalizes why information can matter when it changes a choice. A visible warning is useful only if an available response can still affect the outcome. This is a formal and engineering deduction, not a universal human reaction-time threshold. [Blackwell](https://doi.org/10.1214/aoms/1177729032)

**SpaceFace decision:** threats should commit in readable ways, with responses appropriate to their role: move out of an arc, use cover, disrupt, redirect, defend or deliberately accept damage for a better position. A guardian can protect a route; displacement can change the protection geometry. A sniper can ask for cover and interception rather than just faster firing.

**Judge:** compare correct, absent and delayed cues with an observation-limited controller. Record the last feasible response time and the action that changes the outcome. Distinguish avoidable damage, deliberate tradeoff and unavoidable consequence of an earlier mistake.

### 10 Strategic depth is conditional value

Dominance, dynamic programming and matchup analysis explain how apparently numerous actions can collapse to one answer, or how a modest repertoire can stay useful across changing states. These are formal lenses, not direct enjoyment measures. Sources and assumptions appear in the formal and structural section of RESEARCH_EVIDENCE.md.

**SpaceFace decision:** inspect the existing heat, energy, cooldown, ammunition, cargo and positional costs before adding another meter. Ask when keeping a resource has more value than spending it now. Make different enemies, geometry and goals change the answer. A loadout that is best everywhere should be a deliberate earned endpoint, not an accidental default that makes the rest of customization irrelevant.

**Judge:** compare complete payoff vectors: progress, time, exposure, damage, retained resources and future options. Require meaningful context reversals where the design promises tradeoffs. A mathematically tiny disadvantage does not rescue an otherwise irrelevant option.

### 11 Consistent interactions make assets multiply one another

Emergence is a useful structural design concept: compact rules can produce varied outcomes. It is not synonymous with randomness or a guaranteed benefit. [Juul](https://jesperjuul.net/text/openandtheclosed.html)

**SpaceFace decision:** prioritize objects that participate in several existing relationships. A movable hulk can obstruct fire, redirect a route, accept a force and carry salvage consequences. Author scenarios that expose those relationships. Keep material differences intentional and signaled: the earlier audit found ordinary rock absorbs projectiles while bank stone reflects; consistency does not mean making all materials identical.

**Judge:** disable one interaction and compare the same scenario. A useful combination should change a plan or result, not merely increase the number of logged effects. Bound lifetimes and resource growth so reusable physical play does not become a performance leak or farming exploit.

### 12 Recoverable mistakes support continued agency

Risk involves the distribution and interpretation of consequences, not only expected reward. Prospect theory motivates careful treatment of loss framing but supplies no universal game-loss coefficient. [Kahneman and Tversky](https://doi.org/10.2307/1914185)

**SpaceFace decision:** distinguish losing speed, position, cargo condition, money, a mission and an entire run. Let many errors create active recovery: detach, catch, brake, reroute, salvage, repair or abandon one objective for another. State irreversible consequences before commitment where practical.

**Judge:** perturb an otherwise successful route and observe whether a meaningful recovery remains. Measure recoverable state and active decisions, not only time until the player reaches the old location. Preserve consequences; automatic rescue that erases every error also removes a source of judgment.

### 13 Attention is a scarce design resource

Visual-search experiments demonstrate that target features, clutter and abrupt onsets change selection performance under particular conditions. Particle count alone is not perceptual load. [Treisman and Gelade](https://doi.org/10.1016/0010-0285(80)90005-5), [Rosenholtz and colleagues](https://doi.org/10.1167/7.2.17), [Yantis and Jonides](https://doi.org/10.1037/0096-1523.10.5.601)

**SpaceFace decision:** protect selected targets, meaningful motion, contact points and imminent threat cues. Use persistent shape/outline plus restrained transient emphasis. Let decorative effects yield locally. Audio can carry an important distinction when visuals are crowded, but competing sounds also require priority. Give success, danger and ambient life different jobs.

**Judge:** evaluate actual crowded frames and event timing. Telemetry access to entity identity cannot certify perceptual legibility. Test reduced effects and non-color distinctions. Keep essential information available even when the initial flash is missed.

### 14 Accessibility preserves the intended challenge

Targeted input-assistance experiments show heterogeneous benefits. The practical lesson is to address specific barriers rather than assume a single easy mode serves all players. [Trewin and colleagues](https://doi.org/10.1080/17483100701273128)

**SpaceFace decision:** support rebinding, appropriate hold/toggle behavior and explicit assistance without making dexterity-heavy chords the only way to use the core physics. Preserve strategic and spatial decisions across supported input profiles. Do not model a disability with arbitrary noise and claim accessibility has been proven.

**Judge:** every required action must be reachable, cancelable and safe on focus loss under the declared profile. Follow the real selected input route. Alternative settings can satisfy the same player intent without identical motor demands.

### 15 World meaning comes from consequences the player can care about

Enjoyment, appreciation, attachment and relatedness are distinguishable constructs. A feeling of significance is not reducible to a longer session or an NPC count. Research on meaningful games is useful here but often involves recalled experiences rather than randomized game features; the motivation section of RESEARCH_EVIDENCE.md identifies that boundary.

**SpaceFace decision:** show who benefited or suffered from a physical intervention. Preserve a rescued load, a damaged worksite, a changed service, a witness or an altered route when the game's rules promise it. Reuse consequences in later decisions. Build personality through what a place and its occupants do, not only through labels.

**Judge:** compare intervention and no-intervention outcomes across the promised persistence boundary. Do not invent social simulations, multiplayer or long dialogue trees merely because relatedness appears in a theory. Use the existing world's strongest consequence chain first.

### 16 Production value is coherent behavior at the moment of use

The prior mechanisms converge on an engineering priority: an asset has to work on the actual route where the player encounters it. A polished model with unreachable animation, a power absent from the shop, or a tutorial that teaches a different control law cannot deliver its intended experience.

**SpaceFace decision:** prefer complete playable situations over disconnected completion of model, code, effects and text subtasks. Include acquisition, use, interruption, failure, recovery and persistence in the appropriate owner contract. Spend visual complexity where it communicates action, state or identity.

**Judge:** require evidence appropriate to the claim. The research VM currently supports CPU code execution; no hardware GPU or working WebGL renderer has been established. Its source and simulation evidence cannot certify target-device smoothness. This limits a claim, not the whole research or development effort.

## Commercial success as a separate causal problem

There is scientific evidence relevant to commercial outcomes. Social-influence experiments show that visibility of other people's choices can change collective outcomes. Game-sales studies estimate relationships involving reviews and quality signals. The evidence supports investing in a clear, credible promise and a strong delivered experience; it does not convert a design rubric into a sales forecast. [Salganik and colleagues](https://doi.org/10.1126/science.1121066), [Kraemer and colleagues](https://doi.org/10.1016/j.jbusres.2024.115034)

Our commercial design decision is to make the niche easy to demonstrate: a player uses movement and physical tools to produce an impressive, understandable consequence, then changes the approach through a build choice. The opening public route, ordinary acquisition and captured footage should tell the same story. This is more coherent than promising an enormous space game whose distinctive interactions are buried behind setup.

Judge commercial readiness separately: target audience, promise clarity, truthful footage, first-session delivery, hardware expectations, reliability, pricing rationale and distribution plan. Most of those have not been audited in this project. Do not assign them invented grades or claim that shipping more features automatically raises sales. Avoid manufactured reviews, compulsory daily routines and deceptive scarcity; they are not prerequisites for engagement.

## The golden grading rubric

Use a profile of grades, not a weighted universal total. A severe save or control defect cannot be offset by beautiful effects. Grade a named route, build and supported platform, not the abstract repository. Record the evidence tier and coverage beside every grade.

### Shared grade meanings

- **U Unmeasured:** the necessary evidence is missing. U is not zero and cannot be promoted by confidence or prose
- **0 Broken:** a promised behavior fails or a serious contradiction prevents the experience
- **1 Isolated:** the component exists, but only works in a narrow demonstration or leaves essential parts disconnected
- **2 Usable:** one ordinary route fulfills the basic promise with understandable limitations
- **3 Robust:** the promise survives relevant varied situations, interruptions and recovery, with the required evidence
- **4 Expressive:** the robust feature supports deliberate alternative approaches, transfer or consequential reuse that fits SpaceFace's identity

Not every supporting feature needs grade 4. Use 4 for the game's defining strengths and 3 for important supporting promises. Those are proposed product targets, not scientifically calibrated thresholds. For cosmetic features, grade4 means coherent support for identity and action, not arbitrary strategic complexity.

### Twelve dimensions with concrete anchors

**A Physical control and trust.** Grade 0: accepted commands fail silently or the same declared state behaves inconsistently. Grade 2: steering, braking and selected power work on an ordinary route. Grade 4: practiced combinations transfer across geometry while cause and consequence remain readable. Inspect input mapping, solver ownership, residency, contact and feedback. Protected constraint: no hidden changes to the learned law.

**B Movement as a source of decisions.** Grade 0: required route is infeasible or routinely loses control. Grade 2: approach speed and exit state matter in a complete encounter. Grade 4: several useful trajectories trade time, exposure and future options across combat and noncombat. Inspect geometry and ablations. Protected constraint: retain a viable lower-demand approach where promised.

**C Learning and discovery.** Grade 0: essential rules are contradicted or unavailable. Grade 2: a player can encounter, try and observe each core relationship. Grade 4: familiar skills solve new situations with optional rather than mandatory coaching. Inspect ordinary progression and held-out combinations. Protected constraint: no tutorial-only physics or privileged hints in public-route evidence.

**D Combat decisions and counterplay.** Grade 0: necessary responses are unavailable or cues systematically mislead. Grade 2: one ordinary encounter offers a meaningful response to a threat. Grade 4: role, geometry and commitments change the best intervention, including earned dominant payoffs. Inspect response windows, target priorities and strategy comparisons. Protected constraint: no universal 50/50 balance requirement.

**E Build expression and progression.** Grade 0: promised legal options are unreachable or progression is lost. Grade 2: an earned fitting changes a practical action or tradeoff. Grade 4: several identifiable builds change plans across contexts and can be learned without punitive experimentation. Inspect eligibility, acquisition, fitting, use and persistence. Protected constraint: counts and percentage variants are not depth evidence.

**F Systemic environment.** Grade 0: declared interaction rules fail at critical boundaries. Grade 2: a world object has a useful physical role on a real route. Grade 4: the same rules support several causal combinations with bounded consequences. Inspect material/capability contracts and rule ablations. Protected constraint: purposeful material differences remain allowed.

**G Goals and pacing.** Grade 0: the player cannot find or complete a relevant objective. Grade 2: a complete short sequence includes a goal, commitment and resolution. Grade 4: contrasting situations vary pressure and opportunity without filler or erasing mastered advantages. Inspect objective dependencies and encounter timing. Protected constraint: pressure telemetry is not measured emotion.

**H Recovery and stakes.** Grade 0: ordinary interruptions corrupt progress or leave a softlock. Grade 2: a mistake has understandable consequences and a valid continuation. Grade 4: mistakes produce several active recovery choices with meaningful costs. Inspect failure branches, checkpoints and save/resume. Protected constraint: do not remove all consequences to inflate completion.

**I Perceptual and audiovisual clarity.** Grade 0: essential state is misleading or obscured. Grade 2: a rendered ordinary sequence makes target, action and outcome distinguishable. Grade 4: crowded scenes preserve a coherent hierarchy and meaningful payoff across declared settings. Inspect actual pixels, timing and audio. Protected constraint: no source-only visual grade.

**J World identity and consequence.** Grade 0: narrative or economic feedback contradicts actual state. Grade 2: an action changes an identifiable local situation. Grade 4: bounded persistent consequences give places and play styles distinct character. Inspect specific world chains. Protected constraint: NPC count or animation count is insufficient.

**K Access and production reliability.** Grade 0: a core supported route cannot boot, save, resume or accept necessary input. Grade 2: the intended route works on a declared configuration. Grade 4: a coherent, efficient product experience survives relevant input profiles and lifecycle transitions. Inspect setup, interruption, performance and accessibility contracts. Protected constraint: target-hardware evidence for hardware claims.

**L Niche and promise delivery.** Grade 0: advertised core actions are absent from ordinary play. Grade 2: a short real sequence demonstrates the intended physics-plus-build identity. Grade 4: several distinctive sequences demonstrate depth using the same understandable principles. Inspect footage-to-route traceability and early access to meaningful tools. Protected constraint: this grades promise delivery, not sales probability.

### Evidence recorded beside a grade

Use the repository's existing evidence classes and receipts. At minimum distinguish source inspection, focused production-owner execution, integrated simulation, public-input route, rendered/audio observation and target-hardware measurement. These are not automatically a simple ladder: audio and persistence answer different questions. A grade must cite its actual artifact and supported envelope. A decisive source contradiction can falsify a narrow contract without a full playthrough; source presence alone cannot establish that a complete public route succeeds. Mark unknown dimensions U rather than averaging them away.

Record confidence as high, medium or low with a reason: reproducible mechanism, bounded sample, imperfect observer, ambiguous transfer or missing environment. Do not multiply confidence by grade. Also record the strongest counterexample and the next evidence that could change the decision.

## Small improvements with clear upside

The strongest candidates for improvements without a player-experience tradeoff are repairs to an already intended contract: truthful state, reachable legal actions, preserved intent, exactly-once transactions, reliable cancellation and consistent continuation. These do not require claiming that everyone prefers the same art, difficulty or pacing.

A candidate belongs in the small-fix batch only when it passes all of these questions:

1. Which existing promise is violated, and on which reachable route?
2. Can a minimal case demonstrate the violation rather than merely an absent test?
3. Does the fix preserve successful behavior, costs, challenge rules and information restrictions?
4. Does it avoid moving the problem into another input profile, mode or lifecycle state?
5. Can it be verified at the owning seam with a small adjacent check?
6. Is its implementation and runtime cost bounded, without a new subsystem or recurring ceremony?

Examples include reporting save deletion only after success, exposing an existing legal selection through keyboard navigation, using the same eligibility truth for a preview and its transaction, preserving cargo reservations across all consumers, and refusing a malformed explicit seed rather than silently promising a reproducible run. These are candidate categories; the companion audit identifies which have actual current-source evidence.

Useful information is not automatically safe to expose. A corrected price preview must preserve intentional uncertainty; a targeting fix must preserve fog-of-war rules; an error message must not promise success when the owner still refuses. Similarly, removing an unnecessary step is good only after distinguishing redundant friction from a meaningful commitment or destructive-action confirmation.

Use three labels in the improvement list: **contract repair**, **investigation before repair**, and **design experiment**. The labels describe the evidence and decision, not arbitrary priority. A contract repair can outrank a large feature because it makes many existing features trustworthy. A design experiment can be worthwhile, but must name its tradeoffs rather than borrow the certainty of a bug fix.

## Research to evaluation to improvements

### Stage 1 Select a player facing question

Start from the intended experience and a concrete route. Example: why does movement feel like travel rather than an opportunity? Candidate explanations are weak control, weak geometry, low stakes, illegible state, missing interactions or no useful objective. Do not jump immediately to adding a ship or a power.

### Stage 2 Write the research mechanism

State the manipulated factor and expected consequence in plain language. Include a source, study type and important transfer difference. For example: stable dynamics should support learned prediction; an arrival-velocity constraint should give that prediction a purpose. The second statement is our application, not a result measured in the original motor experiment.

### Stage 3 Inspect the real implementation

Pin source. Follow input, selected owner, state change, presentation and persistence. Check active work and the original task scope. A catalog entry is not availability; generated animation is not lifecycle integration; an authored wave recipe is not proof that the active mode consumes it.

### Stage 4 Establish the smallest discriminating baseline

Use the existing focused fixture or lab. Pick a comparison that separates explanations: environment enabled versus disabled, cue timely versus late, legal catalog versus visible offers, intervention versus no intervention. Use player-available observations for public-route claims. A privileged diagnostic controller is still useful, but gets a different evidence label.

### Stage 5 Make one coherent intervention

An intervention can be a coupled experience change when its parts are necessary: a route plus its cue and objective, for example. Do not simultaneously retune damage, economy, physics and visuals unless the hypothesis actually requires it. Preserve a control so the reason for improvement remains interpretable.

### Stage 6 Judge outcomes and guardrails

Pair baseline and candidate on scenarios and seeds where appropriate. Use distinct discovery and held-out cases. Compare practical outcomes, failure distributions, recovery and cost. Test the observer with a known bad case. A thousand frames from one run are not a thousand independent trials. Predeclare acceptance rationale from the product contract or measured feasible envelope; do not move it after seeing failure.

### Stage 7 Batch only the expensive verification

Keep fast owner tests with their changes. Share rendered/public-route checks at compatible integration boundaries. Keep exact source, asset and harness provenance. The recent UI-baseline run illustrates why: it completed slowly with large capture gaps, then could not publish against changed master. Complete capture coverage and revision binding are separate requirements; a rerun alone repairs neither.

### Stage 8 Update the existing plan and stop

Close the claim that was established, preserve remaining claims explicitly, and retain the smallest useful regression. If the comparison fails, reject or revise the design rather than hide it behind asset growth. If evidence is inconclusive and a larger run is unlikely to change the decision, keep the baseline. No new implementation task is created merely because this research mentions an idea.

## Asset and architecture decisions from first principles

Before adding an asset, ask which missing relationship it supplies. New geometry is justified when existing objects cannot communicate or implement a needed affordance. New enemy art is justified when a new role must be recognized. More debris variants can improve identity, but cannot by themselves establish new movement decisions.

Before adding a system, ask whether the existing owner can express the relationship. Extend selected production systems, preserve deterministic authority, and avoid duplicate directors, inventories, save formats or test harnesses. A narrow interaction capability or authoritative contact record may have compounding value; a universal object framework is not justified by the word emergence.

Before adding progression, ask what changes in the player's decisions. A new fitting that opens a reliable environmental use can be worth more than several numerical tiers. A price reduction that makes experimentation affordable can reveal existing depth without adding content. An acquisition fix can have high value because an unavailable option contributes no ordinary-play experience.

Before adding polish, ask which perceptual job it performs. Feedback that clarifies force, state, anticipation, contact, consequence or identity earns its complexity. Ambient motion should express function and condition; deliberately dead ships should remain dead-looking. More motion everywhere is not the design target.

## The first development sequence

The proposed order is to repair a demonstrated access defect, establish a complete physical encounter, improve its causal presentation, then use it to expose build differences and progression. Current-source findings and finite implementation briefs are in the accompanying evaluation and improvement document. That document distinguishes defects, partially verified risks, already landed work and creative hypotheses.

This sequence is designed to compound: the first scene becomes a teaching route, a combat test, a build comparison, an audiovisual reference and an honest demonstration of the niche. Its value comes from reusing a functioning experience, not from requiring a new framework for each purpose.

## What would count as a better game

The next version is stronger if the player has clearer intentional control, more useful consequences from the same verbs, more legible reasons to choose a build, and more interesting situations in which to apply that knowledge, while retaining reliability and reasonable performance. Research explains why those ingredients deserve priority. The implementation and evaluation must show that SpaceFace actually provides them.

The standard should evolve when new evidence or an explicit design decision changes the target. Keep its causal reasoning and counterexamples, not merely its grades. A golden document is valuable because it improves decisions over time, not because it makes its first recommendations untouchable.

## Companion documents

- RESEARCH_EVIDENCE.md contains compact primary-source evidence cards, study types, access limits and design implications
- [ADMITTED_REPAIRS.md](ADMITTED_REPAIRS.md) specifies the selected research findings and canonical board ownership
- [DECISIONS_FOR_REVIEW.md](DECISIONS_FOR_REVIEW.md) retains unadmitted proposals for discussion

This repository intake contains original synthesis, citations and pinned source links. Diagnostic witnesses and their minimal source extracts remain in the separately delivered research package; they are not bundled in this planning PR. The cited evidence supports particular decisions rather than an undifferentiated claim that every proposed feature is scientifically proven.
