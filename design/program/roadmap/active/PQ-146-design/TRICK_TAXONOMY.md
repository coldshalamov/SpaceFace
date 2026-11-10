# SpaceFace PQ-146 — Trick taxonomy

**Design revision:** 1.0 · 14 September 2026  
**Status:** Proposed design and tuning values, not implemented or play-validated.  
**Companion documents:** `SCORING_AND_COMBO.md`, `TITLES_LEDGER_BARKS.md`, `TUNING_NOTES.md`.

## 1. The design decision

**Name the player's physical sentence, not every noun in the wreckage.** The grammar is:

**Authored intervention → physical transformation → consequential payoff → optional execution adjective.**

A thrown pirate killing its wingman is **Bolas**. A perfect release makes it **Razor Bolas**, not two independent manoeuvres. The wingman hitting two more enemies makes it **Razor Bolas · Collateral ×3**, not a five-trick combo. A subsequent, genuinely different intervention can continue the combo.

Keep all ten requested recognitions, but give three the right grammatical role: **Collateral** is a consequence modifier; **Near-miss**, displayed as **Close Shave**, is a consequential bridge; **Razor Release** is an execution modifier. Add six primary manoeuvres: **Bank Job, Return to Sender, Kickstart, Needle Thread, One-Two, Slingshot Golf**. This yields **16 recognitions: 13 primary manoeuvres and three modifiers/bridges**. Each has a deterministic positive and negative definition. Recognizing twelve labels is not the same as paying twelve times for one collision.

The September 10 owner revision governs conflicting acceptance language: fair gun pay, farthest Swarm round first, no weapon-specific exclusion from records. The numerical examples exceed 2× for composed play; the design does not guarantee a preferred kit wins. See Tuning Notes §1.

## 2. What a receipt can and cannot establish

### 2.1 Evidence vocabulary

The handoff explicitly identifies the following existing evidence sources:

| Evidence named by the handoff | Permitted inference | Not sufficient by itself |
|---|---|---|
| `tether:releaseRated` | A particular release received razor/clean/good/messy | A release hit anything, helped escape, or deserves points |
| `massline:throw` | A body was thrown by a specified manipulation | Its later collisions still belong to that player |
| `tether:whipImpact` | A rope-related impact occurred | A drawn line actually intercepted a hostile |
| `combat:collisionConsequence` | A physical contact exchanged momentum/changed velocity | Every participant's momentum came from the player |
| `combat:collisionDebris` | Contact produced debris | Every fragment is a new enemy, new root, or new reward |
| Per-entity impulse provenance | Physical influence has recorded ancestry | Last toucher owns the whole subsequent universe |

**Important evidence boundary:** event names alone do not expose every field required below. The packet does not establish that pre-contact normals, trajectory samples, tautness, field crossings, death identities, threat trajectories, or witness LOS are all already available. The following are **required semantic witnesses**, not invented claims about existing event schemas. Their absence means a particular recognition is unproven and must not pay. No button-event fallback is allowed.

| Semantic witness | Required facts |
|---|---|
| Physical intervention | Actor, affected body, stable root identity, simulation tick, actual impulse/constraint force, before/after velocity, material mass and provenance |
| Contact | Both stable body-life identities; point/normal; pre-solve relative velocity; actual post-solve consequence; parent/root identities |
| Constraint interval | Endpoint identities, geometry, continuous taut interval, angular sweep, tension-directed momentum change, attach/release/break order |
| Damage/death | Canonical victim-life identity and death identity; hull lost in the physical episode; actual helm-loss interval; authoritative cause |
| Field interaction | Field identity and owner, physical entry/exit, integrated field impulse, trajectory bend, parent intervention that caused entry |
| Threat/escape | An actual incoming hostile attack or interception; physical positions/velocities before and after the manoeuvre; safe exit and retained cargo identity where relevant |
| Observation | Observer identity, source/transfer/payoff visibility, physical occlusion, observation tick and actual radio transmission where applicable |

A trajectory condition uses authoritative physical samples, not camera motion, render interpolation, cursor displacement, key state, animation state, or a request to perform an action. A scalar momentum receipt without a direction cannot prove a directional deflection.

### 2.2 Shared units and material consequence

All durations below are **simulation seconds**. Angles are in the XZ plane. `u_a` is body a's unmodified reference cruise speed for this encounter; `L_a` is its hull length; `r_a` is its collision envelope radius. For props or wrecks without a retained nominal cruise, use the scene's frozen reference light-hull cruise, never a zero, disabled or current measured speed. These references are fixed at encounter entry so damage, a debuff, camera zoom or equipment dropping cannot manufacture a better ratio. Threshold comparisons are inclusive; convert stated minimum durations to the next whole simulation tick. Order same-tick evidence by canonical causal order and stable identities, never callback arrival or wall-clock time. The precision/rounding convention belongs to the versioned scoring rules. No recognition consumes unseeded randomness.

A **material combat consequence** is either:

- a canonical hostile death caused by the chain; or
- at least **25% of encounter-entry hull lost** through its physical consequence **and at least 1.0 s of real helm loss** in the same episode.

A momentary status, shield tick, cosmetic fragment, ordinary touch, enemy merely being near a rope, and an enemy's pre-existing tumble are not material consequences. Heavy bodies that legitimately resist damage/stun do not secretly qualify; they can instead become anchors, cover or payloads. The physics is not adjusted to rescue the scoring detector.

A **material escape consequence** requires an identified live hostile threat before the manoeuvre, an actual avoided interception or attack, and a resolved escape afterward: travel at least **3 player hull lengths**, increase separation from that threat by **2 hull lengths**, and avoid an actual hit for **1.0 s**. The threat's relevant attack/approach must exist within the preceding **2.0 s**. Crossing an empty checkpoint is not escape.

### 2.3 Conservative player causality

Every paid recognition needs all of C1–C5:

**C1 — Real root.** The actor supplied a physical intervention: impulse, materially loaded constraint, projectile redirection, or a field that actually acted on something. Deploying, targeting, attaching slack rope, pressing release, or being nearby does not establish ownership.

**C2 — It changed the outcome.** At the intervention snapshot, the pre-intervention swept continuation must miss the eventual contact corridor by at least **0.25 × the combined collision radius**, or predict a sub-material contact that the intervention turns into a material one. Use actual geometry and recorded velocities over the relevant flight interval. This is a *local ballistic witness*, not a claim to have rerun an entire alternative universe. A bank also requires the unreflected continuation to miss the eventual victim. Where intervening forces make this local witness ambiguous, require explicit retained-causality evidence; otherwise withhold style.

**C3 — Nontrivial retained influence.** For a body-redirection leg, one of the following must hold at its relevant consequence:

- **Power route:** player-attributable directed ΔV is at least **0.15 u_a** and at least **60%** of the retained helpful intervention component along the contact direction.
- **Steering route:** player-attributable ΔV is at least **0.10 u_a**, turns the relevant trajectory by at least **15°**, and satisfies C2's miss-to-hit proof. This preserves a small, clever sideways nudge of a fast body.

“Helpful” means contributing toward the actual normal/corridor, after cancellation and intervening contacts. It is not a sum of unsigned historical impulses. Ambient incoming momentum is not relabeled as player impulse. Weapon-projectile banks use their exact projectile lineage and geometric miss-to-hit proof rather than requiring a bullet to shove a hull by 15% of cruise. Escape manoeuvres use the player-body criteria specified in their cards.

**C4 — Complete, bounded ancestry.** Every transfer is a recorded causal edge. A consequence occurs within **8.0 s of its first material root**, with no more than **3.0 s between transfer contacts**, at most **four contact/field transfer edges**, and at most **eight individually retained consequential terminals**. Sustained contact, a weak tag, or a fragment spawning does not renew the clock. New, genuinely material re-steering is a new intervention; it can compose with the old one but cannot revive an unrelated dead lineage.

A related arena field may amplify a chain only when the player's proved intervention caused entry into that exact field and the field's impulse is on the ensuing path. A field that would have collected the same victim anyway is not a parent of a player trick. Once another source reverses the useful impulse or makes the old path irrelevant, old ownership ends even before eight seconds.

**C5 — Eligible, settled consequence.** A paid terminal is a finite, hostile, threat-budgeted cohort member, or an expressly defined escape/objective episode. Canonical deaths are consumed once per victim life, regardless of event aliases. Despawn is not death. Friendly/civilian destruction may be a real Adventure incident, but it is not positive Crucible style income.

**The eight-second limit limits stunt recognition, not velocity, physics, legal liability, or the underlying combat kill attribution.** A long-coasting projectile remains physical after its style window ends.

### 2.4 Recognition, perception and reputation are different

“Someone saw it” has three distinct meanings. The simulation has to prove a consequential chain for any trick. A live cinematic also needs a legible, visible player-local event. An Adventure public title or NPC attribution additionally needs a qualified external witness. The player's private black box is not an omniscient town crier. See the dedicated ledger document.

## 3. Catalogue at a glance

| ID | Display name | Decision | Role / family | Rarity | Raw rarity base |
|---|---|---|---|---|---:|
| T01 | Bolas | Keep | Primary / tether | R2 · Skilled | 90 |
| T02 | Wrecking Ball | Keep | Primary / tether | R2 · Skilled | 90 |
| T03 | Clothesline | Keep, demand real interception | Primary / tether | R3 · Exceptional | 140 |
| T04 | Collateral ×N | Keep as consequence modifier | Modifier / no new family | R2 at 2; R3 at 3–4; R4 at 5+ | +15 per additional terminal, max +60 |
| T05 | Close Shave | Rename display; retain Near-miss identity | Bridge / no new family | R1 · Clean | +10 only with a qualifying payoff |
| T06 | Tow-kill | Keep | Primary / tether | R2 · Skilled | 90 |
| T07 | Rock Discovery | Keep | Primary / impact | R1 · Clean | 50 |
| T08 | Well Golf | Keep | Primary / field | R3 · Exceptional | 140 |
| T09 | Dead Man's Mass | Keep; define “dead man” as the wreck | Primary / debris | R3 · Exceptional | 140 |
| T10 | Razor Release | Keep as execution modifier | Modifier / no new family | R3 · Exceptional | +20; clean release +5 |
| T11 | Bank Job | Add | Primary / rebound | R2 · Skilled | 90 |
| T12 | Return to Sender | Add | Primary / rebound | R3 · Exceptional | 140 |
| T13 | Kickstart | Add: mine self-launch with a purpose | Primary / escape | R3 · Exceptional | 140 |
| T14 | Needle Thread | Add: flight through changing geometry | Primary / escape | R3 · Exceptional | 140 |
| T15 | One-Two | Add: a mid-flight second solution | Primary / impact | R3 · Exceptional | 140 |
| T16 | Slingshot Golf | Add: rope-to-field transfer | Primary / field | R4 · Signature | 200 |

These are pre-factor, pre-budget amounts, not guaranteed final awards. Pure escape awards have a separate 40-point budget. Rarity describes physical execution complexity, not item color, unknown global frequency, or whether a player bought a rare weapon.

## 4. Exact recognition cards

### T01 — Bolas

**Player sentence:** “I wound up a live ship and threw it into another.”

**Pattern:** a player-rooted loaded constraint changes the orbit of an intact, previously mobile hostile A; its relative radius sweeps at least **60°** while taut for at least **0.25 s**. `massline:throw` or a causally linked `tether:releaseRated` separates A. Within **3.0 s**, A strikes a distinct hostile B at normal closing speed at least **0.50 u_A**, causing a material combat consequence. A need not die.

**Proof:** player → loaded swing of A → release of A → A/B contact → B damage/helm loss or death. Include both endpoint identities and release identity.

**Guards:** an already uncontrolled hostile drifting into B is not enough; a slack attachment plus an ordinary collision is not enough. One release produces one primary award even when both bodies die. Intact A distinguishes Bolas from Wrecking Ball and Dead Man's Mass. **R2.**

### T02 — Wrecking Ball

**Player sentence:** “I used something heavy as a flail without letting it go.”

**Pattern:** a movable prop or dead hull A is player-tethered; the loaded tether sweeps at least **45°** during **0.25–2.0 s** and A is still attached when it contacts hostile B. A's mass is at least **0.50 × B's mass**; normal closing speed is at least **0.50 u_B**; B suffers a material consequence. Measurable tension redirected A, rather than merely painting a line over its motion.

**Proof:** player → tension on A → moving arc of A → attached A/B impact → consequence.

**Guards:** no payment for orbit duration or every revolution. Repeated contacts with one B consume the same victim budget. A stationary attached rock into which enemies autonomously crash fails the player-redirection witness. A still-live ship used as the flail can be shown as a factual variant, but the primary remains Wrecking Ball only while attached. **R2.**

### T03 — Clothesline

**Player sentence:** “I put a loaded line across a pursuer's route.”

**Pattern:** a player-established taut constraint between two bodies intercepts hostile C, distinct from both endpoints. C crosses the physical line segment; an actual line/contact consequence transfers at least **0.30 u_C** of transverse ΔV. The segment has been taut for **0.15 s**; player motion or endpoint displacement moves it across C's prior corridor within **1.5 s** of impact. C subsequently strikes an endpoint, terrain or another body within **2.0 s**, producing a material consequence.

**Proof:** player → displaced endpoint/loaded segment → line/C physical interception → C's altered trajectory → second collision → consequence. `tether:whipImpact` alone must be corroborated by the identities and transferred force.

**Guards:** merely crossing a rendered rope is zero. An enemy-to-enemy Snarl constraint is eligible only when its player-caused tension/geometry supplies this interception. A stationary web that slowly catches endless arrivals is not endless Clothesline credit. **R3.**

### T04 — Collateral ×N

**Player sentence:** “That one went through the next one.”

**Pattern:** a qualified primary chain causes material outcomes on **N ≥ 2 distinct eligible hostile bodies**, through at least one body/body, body/terrain/debris, or demonstrated transferred-field edge after the initial manipulated body. Displayed N counts consequential terminals, not contacts, fragments, limbs, damage ticks or root projectiles.

**Proof:** player → primary manipulation → A/B impact → B/C impact or lineage-owned debris D/C → outcomes on distinct B, C, etc.

**Guards:** a normal radial blast with no secondary physical transfer is not Collateral. One target hit four times is ×1. The name can upgrade as more terminals settle, but its identity and award are amended rather than paid again. The eight retained terminals bound full chain detail; further confirmed terminals may be summarized as “×8+,” without additional style or moment amplification. **R2/R3/R4; modifier only.**

### T05 — Close Shave / Near-miss

**Player sentence:** “That would have hit me; the line I chose made it miss.”

**Pattern:** a real hostile projectile or committed hostile body has a pre-manoeuvre predicted interception **0.20–1.20 s** away. A player-physical redirection changes velocity direction by at least **20°** or supplies lateral ΔV of **0.20 u_player**. Actual closest approach has positive hull clearance no greater than **0.35 r_player**, relative speed at least **0.75 u_player**, and no collision damage. The player subsequently satisfies material escape or contributes to a material combat payoff within **3.0 s**.

**Proof:** identified threat trajectory → actual player redirection → narrow miss → survival/linked payoff. A pre-existing projectile miss cannot become a dodge retrospectively.

**Guards:** safe asteroid skimming, friendly flybys and proximity to one's own spinning cargo never count. It can bridge an existing combo once per threat episode, but cannot start or indefinitely sustain a paying combo. When Needle Thread uses the same miss, Close Shave is an alias, not a second bonus. **R1; bridge, at most +10.**

### T06 — Tow-kill

**Player sentence:** “I dragged him into something that would not move.”

**Pattern:** a loaded player-rooted constraint displaces intact hostile A by at least **2 L_A** over **0.30–3.0 s**. The normal tow path crosses terrain, industrial machinery or a hostile heavy body that A's pre-tow swept path missed. The constraint remains attached through the fatal contact, or breaks physically at that contact; A dies by that contact.

**Proof:** player → transmitted tow force → changed A corridor → still-attached terminal contact → A's canonical death.

**Guards:** this card requires a kill, not a repeated stun. An enemy independently thrusting itself into a rock while connected is not enough. Attached payload killing someone *else* is Wrecking Ball; tow subject A dying is Tow-kill. If both happen, choose the primary under §5 and record both facts. **R2.**

### T07 — Rock Discovery

**Player sentence:** “I changed his route into geology.”

**Pattern:** an attributable shove or untethered body impulse redirects hostile A; within **3.0 s**, A contacts solid terrain/industrial structure at normal pre-solve closing speed at least **0.50 u_A** and suffers a material consequence. At **0.75 u_A** on a light hull the expected fatal consequence is a B6 physics requirement, not a score-system damage bonus.

**Proof:** player → consequential lateral/forward impulse on A → altered corridor → A/solid contact → hull and helm consequence or death.

**Guards:** require the C2 counterfactual corridor/severity witness. A Pulse tap on an enemy already doomed to strike terrain does not qualify. An enemy-on-enemy impact that was not player-caused remains a world collision. Superseded as primary by One-Two, Well Golf or Tow-kill when those more specific transformations caused the same death. **R1.**

### T08 — Well Golf

**Player sentence:** “I put the shot through the well, not merely into it.”

**Pattern:** a player throw/shove sends A into a specific gravity field that its pre-root path would miss; field impulse bends A's velocity by at least **35°** and contributes ΔV of at least **0.20 u_A**. A exits the field and strikes B or terrain within **3.0 s** of exit, causing a material consequence. Root-to-payoff remains within **8.0 s**.

**Proof:** player → A injection → identified field entry → measured field force/turn → exit → terminal impact.

**Guards:** generic field damage, indefinite orbiting and a victim naturally drifting into an unrelated arena well do not count. A player-owned field does not make every death in its radius a trick. Launch into a pre-existing arena well is valid only with the entry-causality proof. **R3.**

### T09 — Dead Man's Mass

**Player sentence:** “The wreck got a second job.”

**Pattern:** A is already a canonical dead hull or a substantial wreck fragment, not cosmetic debris. A **fresh player manipulation after A's death** redirects it by at least **25°** or adds **0.30 u_ref** of velocity, then A hits hostile B within **3.0 s** and produces a material consequence. A fragment must have at least **0.20 × the reference light-hull mass**.

**Proof:** A's death/wreck identity → later player impulse/throw on that wreck → A/B contact → B consequence.

**Guards:** destruction fragments inherit ancestry, not new authorship. Debris simply continuing a previous kill is Collateral, not Dead Man's Mass. A permanently rotating wreck cannot generate fresh roots each revolution. Player postmortem kills are not this trick and cannot reward suicide. **R3.**

### T10 — Razor Release

**Player sentence:** “I cut the line at precisely the useful instant.”

**Pattern:** `tether:releaseRated` explicitly reports **razor**, and its exact release is an ancestor of a material combat/escape consequence within **3.0 s**. That consequence must also satisfy the primary card; the grade is not independently reconstructed from input timing.

**Proof:** loaded constraint → specific rated release → retained released momentum → qualified consequence.

**Guards:** empty-space release, instant attach/release spam, or a razor grade unrelated to the later impact pays zero. One release grade contributes once, regardless of descendant count. Razor contributes **+20 raw**, clean **+5**, good/messy **0**; no grade creates another combo step. **R3 modifier.**

### T11 — Bank Job

**Player sentence:** “I made the shot go where direct fire could not.”

**Pattern:** a player projectile or launched body physically reflects from an eligible surface by at least **25°**, then hits a hostile behind cover within **2.0 s**, causing a material consequence or an attributable projectile kill. Its original unreflected trajectory misses the victim. In the **2.0 s** before emission, either the player physically changed the bank surface's position by **one surface width** or its orientation by **20°**, or the player's own flight traversed **one hull length** with a **25° velocity-direction change** to establish this firing corridor.

**Proof:** actual repositioned surface/player line → player attack → identified contact normal and reflected continuation → formerly occluded target → consequence.

**Guards:** an automatic ricochet perk paying for routine shots at a fixed wall is cut. Ordinary single-bounce damage remains strong, fairly paid shooting; it is not automatically a named stunt. Same surface/normal corridor and same stationary firing solution share a repetition signature. A gun may stay held while the player flies the bank line: the *line*, not the held gun, earned recognition. **R2.**

### T12 — Return to Sender

**Player sentence:** “I returned an enemy's attack, with force.”

**Pattern:** hostile A emits an actual projectile, explosive object or launched body Q. A subsequent player-owned impulse, moving physical shield/plate or field interaction redirects Q by at least **60°**; Q's original trajectory could not hit A. Q then physically hits A within **2.0 s**, with retained redirect provenance, producing a material consequence or an attributable projectile kill.

**Proof:** A emits Q → Q approaches → player material redirection of Q → Q/A contact → A consequence.

**Guards:** “enemy damage killed enemy” is insufficient. A stationary passive auto-reflect shield is not execution; the relevant shield/plate must have been materially repositioned into the intercepted corridor within **1.0 s**, or a fresh actual force must redirect Q. Returning it to a different enemy is a factual bank variant, not Return to Sender. **R3.**

### T13 — Kickstart

**Player sentence:** “I used the blast as an engine, and spent the speed on something.”

**Pattern:** a player-rooted impulse charge or repulsion blast physically gives the player ΔV of at least **0.30 u_player**, making speed at least **1.25 u_player**. The player retains at least **90%** of that exit speed after **0.75 s**, then within **3.0 s** completes a material escape or uses the carried momentum in a material collision payoff. A real hostile threat exists at the launch; the charge's own damage is not a substitute for the second consequence.

**Proof:** owned charge → measured blast impulse on player → retained speed → avoided interception / momentum-spending contact → outcome.

**Guards:** no points for repeated self-detonation in empty space, health lost, mine count, or speed alone. Self-damage is a cost, never a multiplier. Reusing the same threat or rescued/stolen cargo does not reopen an escape budget. **R3; pure-escape budget applies.**

### T14 — Needle Thread

**Player sentence:** “I threaded moving danger, not a convenient hole.”

**Pattern:** a player-controlled trajectory crosses a gap between two **moving** solid hazard boundaries; minimum open width is between **1.10 and 1.60 player collision diameters** at crossing. Both bodies have meaningful relative motion and the gap width changes by at least **0.20 player diameters** over the preceding **0.50 s**. Player speed at crossing is at least **1.25 u_player**, with no contact. A prior uncorrected path would intercept a boundary; the actual correction changes velocity direction by at least **20°**. A distinct hostile threat is avoided and the material escape is confirmed within **3.0 s**.

**Proof:** changing two-body geometry + identified pursuit → corrected player velocity → verified clearance → pursuit misses / player escapes.

**Guards:** stationary cargo gates and peaceful station flybys are not stunts. The player cannot park two owned props, jiggle them and mint income: both boundary bodies must be hostile-controlled or independently moving world hazards, not solely player-maintained scenery. Close Shave on this path is subsumed. **R3; pure-escape budget applies.**

### T15 — One-Two

**Player sentence:** “I changed the shot after it had already left.”

**Pattern:** a first player impulse/throw puts A on a free path for at least **0.20 s**. A second, physically distinct player intervention arrives **0.20–2.0 s** later, redirects the path by at least **45°**, and contributes ΔV of at least **0.20 u_A**. The pre-second-intervention path misses the final target by the C2 margin. A then causes a material collision consequence within **2.0 s**.

**Proof:** player root 1 → free A trajectory → player root 2 → new A trajectory → A/B or A/terrain impact → outcome.

**Guards:** many collinear bullets, continuous beam pressure and contact jitter are not two interventions. A second intervention must change the solution, not merely add damage. The two setup roots belong to one One-Two primary; they do not count as two combo acts. The first root remains within the eight-second total horizon. **R3.**

### T16 — Slingshot Golf

**Player sentence:** “The rope chose the tangent; the well chose the curve.”

**Pattern:** complete Bolas' loaded **60° swing** and release of A; within **2.0 s**, the released path enters a particular field it would not otherwise enter. The field then bends A at least **35°** with at least **0.20 u_A** of force-derived ΔV. After exit, A hits a distinct hostile or terrain within **2.0 s**, causing a material consequence. The full chain fits **8.0 s**.

**Proof:** player tension → swing → release → exact field-entry edge → curved exit → terminal collision → outcome.

**Guards:** the same terminal cannot independently pay Bolas, Well Golf and Slingshot Golf. Razor and Collateral can modify it, subject to shared budgets. Existing arena fields are legal amplifiers only with proved injection; unrelated ambient well kills remain unclaimed. **R4.**

## 5. Ambiguity, precedence and settlement

### 5.1 One physical achievement, one primary

Primary specificity, from highest to lowest when the **same critical root/path/payoff** satisfies multiple cards:

**Slingshot Golf → One-Two → Return to Sender → Clothesline → Dead Man's Mass → Well Golf → Bolas → Tow-kill → Wrecking Ball → Bank Job → Rock Discovery.**

For a pure escape, **Needle Thread outranks Kickstart** when both describe the same terminal escape; Kickstart remains a factual setup tag. A Kickstart followed by a distinct later combat manipulation can instead be an escape act plus a subsequent combat act, but may not reuse an identical terminal receipt or threat-resolution identity. Escape/combat overlap on one payoff chooses the combat primary and keeps the launch as context.

These rankings choose the more informative name; they do not choose whichever combination yields the largest score. Incomparable simultaneous candidates choose the deepest proved causal transformation, then lowest stable trick ID. Preserve factual lower-level tags in the ledger's explanation without extra steps or titles for unseen sub-events.

### 5.2 When a chain actually gains another act

A new act needs a fresh material intervention that changes the geometry, plus a distinct resolved payoff. Splitting one explosion into children, adding a death alias, changing projectile IDs in a continuous burst, or relabeling one collision does not qualify. Consecutive same-source, same-victim impulses within **0.75 s** and **15°** of one another form one intervention packet for stunt purposes. Their real impulses still accumulate physically.

A primary name can appear immediately when its minimum payoff settles; its still-amendable value is explicitly pending. The canonical, finalized primary identity—not each provisional name—contributes to distinct-ID and family counts. Collateral and execution information may amend that same event for up to **3.0 s** after first payoff, bounded by the root's eight-second limit. Pay only the difference between the old and amended award. Unresolved grades and guessed future victims never pay. Combo banking waits for such a bounded amendment window to close; nothing stays pending indefinitely.

### 5.3 The hold-button test, honestly applied

A receipt stream proves external execution, not private intention. A lucky player can occasionally produce a legitimate physical result. No deterministic observer can tell that result apart from an identical skilled one solely by counting thoughts or buttons.

The enforceable rule is stronger than cosmetic input policing: **steady ordinary fire, passive orbiting, static auto-reflection, stationary traps, and peaceful proximity cannot alone satisfy a paying recipe.** Each primary requires a contingent trajectory, force, topology or timing transformation with a proved payoff. One lucky result is contained by victim budgets and lack of combo growth. Skill becomes the ability to repeat, transfer and compose the result under changing pressure.

## 6. Ideas deliberately cut

| Candidate | Decision and reason |
|---|---|
| Shield-surf on a passive energy bubble | Cut from this release: the supplied context does not prove a collision-bearing shield surface, moving normal or transferable impulse. Reconsider only with those physical witnesses. |
| Spin-to-win / orbit duration | Cut: a held constraint can manufacture time and rotations without consequence. |
| Raw speed record as a trick | Cut: earned speed is an excellent physical reward, but speed alone is not a consequential manoeuvre. It may remain a separate traversal stat. |
| Every ordinary bank or mine kill | Cut as a named trick: fair normal combat, not automatic style. Bank Job and Kickstart demand a second piece of authorship. |
| Postmortem score bonus for player death | Cut: it encourages suicide and confuses Dead Man's Mass. Existing pre-death attribution can settle without a death bonus. |
| Extra score for harming civilians | Cut from Crucible rewards. In Adventure, record the truth and let law, victims and reputation react; admiration and culpability are different axes. |
