# SpaceFace PQ-146 — Tuning notes, expansions and failure analysis

**Design revision:** 1.0 · 14 September 2026  
**Status:** Pure design deliverable. No game code, repository clone, simulation runs or capture tests were performed. Arithmetic examples have been checked separately; that does not constitute balance or feel validation.

## 1. Authority reconciliation: do not revive the retired mistake

The handoff contains an explicit conflict, not an ambiguity to hide. The older PQ-146.01 row says a physics kit must score at least twice a gun kit and the free Pulse cannot top the board. The same packet's September 10 owner revision says newer directions supersede contradictory older acceptance wording. The supplied master plan's **“Corrections to older success criteria,” item 1** explicitly retires both mandatory two-to-one kit rankings and Pulse exclusion. Section 24.1 separately puts farthest Swarm round first and requires equal base kill value.

**Decision:** implement the later owner intent in the design. Preserve the requested mathematical demonstration of a three-act physics chain exceeding 2× against equal-class direct kills, but treat it as an example and mastery target—not a forced winner, weakened starter or universal acceptance inequality. A shooter surviving a farther round wins the main record. A Pulse pilot doing real physics earns the same style as anyone else.

| Authority | What this packet takes from it | What this packet does not infer |
|---|---|---|
| `context/PQ-146.md` — Owner revision, Leaves, Non-goals, quality budget | Four design outcomes; ≥12 deterministic recognitions; causal truth; Adventure ledger; rare moments; bounded work | Historical checked boxes or receipt names establish that today's implementation passes |
| `context/FEEL_CONTRACT.md` — B4/B5/B6/B11, plus B1/B3/B9/B13 | Shove, displacement, lethal terrain, universal stun; conserved earned speed; framing; impact response; ordinary-flight stability | A score award can substitute for deficient physical response |
| `context/VISION.md` — Massline, physical agency, failure, ordinary life, 60-second fantasy | Simple actions, complex consequences; light ships as ammunition; ordinary life contrasting with disruption; an honest remembering world | Every activity must have a meter, reward, title or cinematic |
| `context/CRUCIBLE_SURVIVAL_MASTER_PLAN.md` — September 10 revision and corrections; §§7.6, 9, 11.1, 24, 26, 35 | Immediate viable tools, round cash rhythm, neutral gun pay, finite lineage, sparse spectacle, future replay possibilities | The extended content bank is all shipped, global boards are ready, or every candidate root already exists |

The uploaded context snapshot is the design authority for this deliverable. A connected GitHub search was used only for orientation; repository report text was not substituted for the supplied owner's contracts. This is a replacement design proposal, not a runtime audit or a PQ leaf completion receipt.

## 2. Why these values are the first values to try

### 2.1 The physical bars are not negotiable scoring inputs

| Feel bar | Exact relevant requirement from the supplied contract | Design consequence | Bad tuning to reject |
|---|---|---|---|
| **B4 — Shove magnitude** | Dedicated shove changes a light hostile's velocity by ≥30% of cruise; starter ≥5%; aligned shove can add speed above cruise | A single dedicated shove can establish material manipulation; a few genuinely aligned starter hits can accumulate force. Trivial tags cannot steal a doomed collision | A 5% Pulse tap grants ownership over every later accident; or special weapons get score just for firing |
| **B5 — Shove displacement** | After 2 s, a shove-weapon target is ≥one screen depth off its old line and has not fired | A 5 s combo window accommodates setup, watching the displacement, repositioning and payoff. A physical setup can add up to 3 s of bridge time | A 1 s chain window forces frantic spam because the real B5 result itself takes 2 s |
| **B6 — Terrain is lethal** | Light at ≥50% cruise into rock loses ≥60% hull and helm; at ≥75% dies; heavy at that speed loses ≤15% and keeps helm | Terrain recipes use pre-solve normal closing speed and actual outcomes. Heavies serve as geometry/ammunition, not secretly stun-compliant light targets | Awarding a fatal-slam name on a harmless heavy scrape; multiplying damage to satisfy a trick condition |
| **B11 — Universal hitstun** | One physical law uses ΔV/cruise and attacker/victim mass ratio; lights at ≥30% ΔV lose helm ≥1 s; heavies at gun-scale ΔV do not | Nonlethal material-payoff recognition requires actual 1 s helm loss. All tools use the same evidence. One-Two has time to revise a real moving target | Giving rope impacts a secret 1 s stun while gun impacts recover instantly, or inferring stun because a button was used |

B4 and B6 explain the **0.15-cruise attribution floor** and **0.50-cruise terrain contact floor**. The 0.10-cruise steering exception additionally requires a ≥15° miss-to-hit redirection; otherwise it would just be a tag exploit. These are attribution thresholds, not alternative physical laws.

B5 explains why a five-second link window is not indulgently long. The player needs time to *read* the result, not merely produce another receipt. B11 gives the nonlethal payoff an observable loss of control rather than a made-up achievement condition. B6 also warns against interpreting capped solver impulse as the whole impact: the supplied audit explicitly distinguishes pre-solve collision severity from the solver's rate-limited exchange.

### 2.2 Parameter rationale and sensitivity

| Parameter | Initial value | Why | First sensible sensitivity comparison |
|---|---:|---|---|
| Base light kill | 100 score / 10 cash | Makes arithmetic legible; no gun bias | Change the whole scale together, not individual gun coefficients |
| Rarity bases | 50 / 90 / 140 / 200 | Increasing execution complexity without order-of-magnitude jackpots | ±15%, watching whether weapons still feel useful without the meter |
| Execution factor | 1.00–1.50 | Mass and impulse matter, but don't square spectacle into runaway score | Maximum 1.35 versus 1.50 |
| Per-primary raw cap | 300 | Contains lucky chains and large collateral labels | 250 versus 300; preserve victim caps in either case |
| Per-victim raw budget | 100% of its base score over one life; 50% unlock nonlethally | Prevents repair/stun farming while allowing a setup to count | Nonlethal unlock 35% versus 50% |
| Pure escape budget | 40; at most one multiplier step per combo | Makes movement useful without paying for an obstacle treadmill | 30 versus 40; never cash without combat income |
| Combo link | 5.0 s; up to 8.0 s with two proved bridges | Setup breathing room grounded in B5 | 4.5 versus 5.5 s, especially for less practiced players |
| Distinct-ID / family increments | +0.35 / +0.15 | Encourages different solutions without forcing every tool family | Reduce family term to 0.10 if specialists feel taxed |
| Combo ceiling | ×3.00 | A visible, reachable ceiling; no exponential score tower | ×2.75 versus ×3.00 |
| Quiet banking | 2.0 s of genuine safety, no unresolved chain | Lets a clean escape or earned relief feel like landing a line | 1.5 versus 2.0 s; never bank while an obvious own payload is about to land |
| Style cash ceiling | +20% of base round income | Adds satisfaction, not compulsory choreography to afford a gun | 10% versus 20%; isolate cash from score tuning |
| Attribution lifetime / hop | 8.0 s / 3.0 s | Supports a legible local chain; does not claim every later world event | 6/2.5 versus 8/3, checking true long-route misses |
| Moment normalization | 0.20 × reference light momentum | Meaningful charge impulse can support a rare escape moment; trivial knock cannot | Compare distributions before changing this global scale |
| Moment threshold / global gap | H ≥3.60 / 12.0 s | Reserve interruption for consequence plus execution | 3.6 versus 4.0; keep ordinary-flight causal gates absolute |
| Live micro-slow | 0.80× for 0.20 sim s | Adds only 0.05 viewing seconds per event | Flow profile: no live slow, same scoring |

All comparisons above are **candidate experiments**, not findings. Do not tune a detector down until its fixture turns green. If a manoeuvre is dull without its label, change the opportunity and physical affordance, not merely the font or payout.

### 2.3 The combo is a choice, not a debt

The player's meaningful question is: **“Can I turn this result into another result before I need to breathe?”** Ordinary gunfire preserves survival; physical bridges buy preparation time; clean safety banks the line. A failed attempt can still produce a new tactical state. The system removes only unbanked linking premium on a real hard crash, so routine incoming damage does not feel like an arbitrary judge knocking the controller out of the player's hands.

The repeated-trick factor does not erase truth or viability. Repeated Rock Discovery still kills efficiently and pays the same base cash as shooting. Variety becomes the extra layer for a player who is ready, not the entry fee to enjoy the opening round.

## 3. Five principal exploit families and exact guards

| Exploit | How it would work | Exact guard | Legitimate play preserved |
|---|---|---|---|
| **1. Provenance laundering** | Tap an already doomed enemy; tag a body, wait for an unrelated well; claim enemy-on-enemy destruction | C2 miss-to-hit/severity witness; directed retained influence ≥0.15 cruise and ≥60%, or ≥0.10 plus 15° steering; typed field-entry causality; 8 s root / 3 s hop / four transfers; canonical unknown remains unclaimed | A small real lateral correction of a fast body; deliberate injection into existing arena gravity |
| **2. Alias and descendant multiplication** | One death emits several compatibility events; every fragment generates a new kill/root; one Bolas is scored as six names | One canonical victim-life/death award; one primary per critical path/payoff; modifiers amend one event; fragment lineage remains one family; max 300 raw per primary, eight detailed terminals; finite parent budgets for subsystems/adds | A real three-ship cascade still has three base kills and one expressive Collateral modifier |
| **3. Stable contraption / immortal-target farm** | Keep a spinning wreck or wall-bank setup running; repeatedly stun/repair one target; camp infinite adds | Fresh contingent transformation required by each recipe; one lifetime raw victim budget; only half unlocks on nonlethal payoff; 1/.5/.25/.1 repetition; repeats never raise n/d, and zero-value recognitions cannot raise n/d or refresh the paid timer; finite cohort/add reward reserves | A good trap remains a good weapon and clears legitimate new enemies; it does not print novelty |
| **4. Movement and bridge treadmill** | Fly between parked props; mine-jump in safety; graze own cargo; extend combo on slack links forever | Identified live hostile threat; actual prevented hit and completed escape; max 40 raw per threat; escape ≤25% of combat raw and one multiplier step; two +1.5 s bridges, deadline ≤8 s since last paid payoff; no passive proximity | A dangerous narrow correction, consequential self-launch or fresh loaded link can genuinely connect a line |
| **5. Save, shop and witness laundering** | Reload title/bark rewards; reset staleness by pausing; drop cargo to inflate mass ratio; self-drone reports; teleport reputation through a dead witness | Persistent canonical dedupe separate from 240 visible entries; simulation clocks freeze; novelty does not reset on shop toggle; round-fixed dry mass/reference speeds; only external observer/actual report; bounded carry +.5 with zero raw rollover | Normal save/restore, upgrade reading, a living witness's immediate reaction and genuine report propagation |

Additional explicit negatives: health loss never grants style; player death has no stunt premium; civilian harm is not positive Crucible income; changing display names cannot change identities; taking offscreen camera screenshots cannot count as witness LOS; graphics settings cannot change physical attribution.

## 4. False-positive budget: define the denominator before celebrating a percentage

### 4.1 What is a false positive?

A **recognition false positive** is any emitted named trick/grade attribution for which the independently reviewed physical facts fail the published recipe: wrong actor, missing consequential edge, pre-existing doomed trajectory, wrong target life, nonexistent interception, excessive time gap or fabricated witness. It counts even if its style award was zero. A duplicate event presented as a second earned act is also a false positive.

A **payment error** additionally includes incorrect cash/base/style amounts, double settlement, illegal multiplier growth or reward leakage to Adventure. Track these separately; a correctly named event can still be mispaid.

A **moment false positive** is a live cinematic/stinger/clip request lacking a qualified primary, legible consequence, correct H or cooldown eligibility. Ordinary collision hit sounds and existing B9 feedback are not new “holy shit” events. A significant unclaimed traffic crash may correctly receive normal physical feedback while receiving **zero** player moment events.

A **reputation false positive** is a ledger/title/bark claim exceeding causal truth or observer/report coverage. “There was a crash” may be true while “you threw that ship” is unsupported.

A real, accidentally executed trick is not automatically a false positive. The observer cannot infer intention from an identical receipt stream. It must prove the external manoeuvre and contain repeated reward, not pretend to read minds.

### 4.2 Required measures

| Measure | Definition | Proposed acceptance |
|---|---|---|
| Ordinary-tape false-positive rate | Number of fixed-length ordinary tapes with ≥one erroneous recognition / ordinary tapes reviewed | **<5%**, with numerator, denominator, tape duration and uncertainty reported |
| False-discovery rate | Erroneous recognitions / all emitted recognitions on a separate mixed positive/negative corpus | <5%; undefined when no recognitions occur, not “0% perfect” |
| Moment ordinary-flight false alarms | Erroneous new live moments per ordinary-flight hour | Zero on the named regression corpus; broader operational target **<0.5/hour** |
| Recognition coverage | Distinct correctly recognized taxonomy entries | ≥12 minimum, **16 designed**; no counting aliases as separate primary acts |
| Positive recall | Recognized genuine recipe instances / independently identified genuine instances, by detector | Initial target ≥90%; publish evidence-unavailable/ambiguous cases separately |
| Duplicate settlement | Additional payout/title increment for the same canonical identity | **0** |
| Wrong actor / public witness claim | Any unsupported player ownership or NPC knowledge | **0** in explicit adversarial cases |

**Small, honest first sample:** sixty independently seeded one-minute ordinary tapes with zero erroneous labels give a one-sided 95% binomial upper bound of `1 − 0.05^(1/60) ≈ 4.87%` for a tape containing any false positive, under the independence/model assumptions. Merely observing 2/60 false tapes would not establish an upper confidence bound below 5%.

**Broader release sample:** 360 such one-minute tapes, six total hours, with zero erroneous labels give an upper bound of approximately **0.829% per tape**. Zero false moments in six hours gives an approximate one-sided 95% Poisson upper rate `−ln(0.05)/6 ≈ 0.499/hour`. These are sample-size calculations, not recorded results or guarantees of universal “never.” Correlated clips from the same encounter are not independent seeds; report scene/hull strata and avoid treating adjacent windows as hundreds of independent experiments.

### 4.3 Ordinary flight and confusers

Ordinary tapes include docking, mining traffic, convoy passage, cargo towing without hostile pressure, navigation near a stationary rock, background battles, safe field exposure, legitimate NPC–NPC collisions and ordinary starter firing. A genuinely executed player stunt within a mixed tape is labeled as such and belongs in positive accounting; do not relabel every unusual background accident as a player trick to rescue the detector's precision.

| Detector | Specific negative that must remain silent | Main discriminant |
|---|---|---|
| Bolas | Slack-link enemy drifts into another enemy | Loaded ≥60° swing, release identity, consequential new corridor |
| Wrecking Ball | Parked attached mass hit by ambient traffic | Player-caused loaded arc and actual terminal damage/stun |
| Clothesline | Ship crosses only the rendered rope | Real line interception plus follow-on impact |
| Collateral | One target emits ten contacts or an ordinary blast hits three targets | Distinct terminal lives and a secondary physical transfer |
| Close Shave | Projectile was already missing; harmless civilian flyby | Prior interception, material player correction and resolved threat escape |
| Tow-kill | Enemy autonomously thrusts into a rock while tethered | Tow force changes its corridor and remains causal at death |
| Rock Discovery | One weak hit tags an already fatal rock trajectory | Miss-to-hit / sub-material-to-material witness plus retained directed influence |
| Well Golf | Ambient current collects an enemy with no player-caused injection | Exact field entry, measured bend, exit and terminal edge |
| Dead Man's Mass | Cosmetic fragment automatically spawns and hits something | Substantial wreck, prior death, fresh post-death manipulation |
| Razor Release | Perfectly rated release into empty space | Same release's confirmed consequential descendant |
| Bank Job | Held primary ricochets from fixed wall into routine traffic | Actual repositioned firing/surface solution and previously inaccessible target |
| Return to Sender | Enemy projectile bounces from a passive stationary shield | New material intercept/redirect and same original attacker |
| Kickstart | Repeated self-blast in a safe area | Actual retained launch impulse and distinct threat/payoff |
| Needle Thread | Player-made parked slalom corridor | Independently moving narrowing boundaries plus actual pursuit escape |
| One-Two | Collinear autofire creates two force receipts | Separated free path, ≥45° second correction and changed target corridor |
| Slingshot Golf | Tether tag followed by unrelated well kill | Entire swing–release–injection–curve–exit–impact path |

The false-positive result is invalid if the detector simply never emits. Positive coverage, recall and missing-evidence counts belong alongside precision.

## 5. The 60-second proof: a paper scenario, not a fake success report

### 5.1 Scene assumptions

Use the default assisted route and shipping camera. The scene has a working industrial operation, one departing hauler, a finite hostile interception group, a heavy anchor, actual cargo, a visible patrol/report path, and a usable impulse charge. No special score-only mass, invisible collision surface, altered projectile physics or hand-awarded event is permitted.

A reference light hull for the **illustrative calculation only** is mass 20, cruise 100 WU/s, giving p_ref = 400. Actual fixture values must be reported instead of quietly substituted. A stronger charge is not required merely to reach the H threshold: a 0.44-cruise impulse on that reference player gives p = 880 and P = 2.2. Whether the real mine's radius, exposure and player hull deliver it remains a measurement.

### 5.2 Timeline and measurements

| Simulation time | World/player beat | What is measured | Expected design result |
|---|---|---|---|
| 0–6 s | Operation works; cargo loads; hauler departs | Actual work/transfer identities; ordinary event count | No tricks, no moments |
| 6–10 s | Pirates intercept; player intervenes | Threat IDs, actor identities, real first shove ΔV | B4 shove, not a trick just for firing |
| 10–13 s | Second lateral intervention sends first pirate into terrain | First/second root order; free-flight gap; ≥45° change; terrain closing speed; damage/helm/death | **One-Two**, Rock Discovery as explanatory subtag; moment at **13 s**, H = **5.40** in target realization |
| 16–22 s | Player repositions around the heavy anchor and establishes the approach | Actual geometry, threats and approach velocity | No paid root for approach alone |
| 23–25 s | A material Massline load begins at 23 s; player swings and releases | Tautness, ≥60° arc, actual tension, retained velocity, root tick 23 s | A real setup; no release-only award |
| 25–30 s | Released pirate strikes another, with the three material outcomes resolving in one ≤3 s contact cascade | Complete lineage; distinct terminal lives; root age ≤8 s; death aliases deduped | **Bolas · Collateral ×2** first crosses at **28 s**, H = **4.20**; ×3 at 30 s updates peak H to **6.48**, not another moment |
| 30–35 s | Cargo spills; hauler flees; a witness speaks | Cargo identity, actual panic route, observer LOS/report, safe radio gap | Ledger/title/bark in Adventure; no flight points; no new moment for every fragment |
| 35–42 s | Patrol responds; player grabs a valuable pod | Actual law/report response; loaded pickup; no fake trick for attachment | Preserve the world's causal reaction; no free combo credit |
| 44–49 s | A real charge propels the player out of an actual interception; retained speed carries the pod away | Owned impulse, speed ≥1.25 cruise, ≥90% retained after 0.75 s, actual avoided hit and 1 s safety | **Kickstart** with an optional Close Shave modifier; third moment at **49 s**, H = **3.96** |
| 49–60 s | Escape completes; aftermath remains | Cargo persistence, relevant WANTED state, real patrol/hauler behavior, quiet banking | No repeated moments on drifting aftermath; one consistent incident history |

For the escape to end WANTED, the pod must still have a real non-player owner under the world's existing law, and an actual unauthorized-taking/report event must occur. Abandoned salvage cannot be declared stolen just to stage the intended ending.

The sequence preserves the original B12 industrial/hauler/pirate/shove/swing/projectile/collateral/spill/flee/patrol/pod/escape fantasy; the second shove and consequential charge launch add controllable variety rather than three copies of the same collision.

**Root horizon detail:** the material swing root occurs at 23 s, release by 25 s, first contact by 28 s and the last consequence by 30 s. The seven-second root age, at most three-second release-to-contact delay and bounded collateral amendment fit the declared limits. If the actual load begins earlier, report its real tick; do not rename an old root to pass the clock. The early approach is not a hidden physical root.

### 5.3 What this minute can and cannot establish

It can show three distinct opportunities and, when eventually run, whether the event stream, visible consequences and presentation line up. It cannot alone demonstrate <5% false positives, general game balance, long-term variety, optimal economy, all sixteen detectors, or six hours of ordinary-flight reliability.

Record, for each major payoff: root/parent/terminal identities; source/transfer/payoff ticks; normal closing speed; actor/victim mass references; attributed ΔV; H factors; canonical death count; primary versus modifiers; base cash/base score/raw style/bank multiplier; witness coverage; actual bark/clip availability. For the three matched-kill scoring examples, equal target classes, seed, rules, opportunity and ending round are essential.

For actual feel review, ask whether the player can describe **what changed the next trajectory**, not merely read a label. The proof's numerical count is insufficient if the camera hid the body that caused it. No footage, runtime numbers or acceptance checkmarks are supplied with this design archive.

## 6. Two expansions worth shipping

### 6.1 Your Best Line — a local rival made from your own causal replay

**Purpose:** turn a surprising success into a learnable skill. The player should be able to say, “I nearly understood that; let me see the line again,” without studying a spreadsheet.

**Product shape:** from a Best Line result or ledger-compatible practice entry, open a **12–20 s causal replay** of the actual record, then repeat a same-seed practice opportunity with a single optional ghost line. The ghost is explicitly **your prior attempt**, not a fabricated human rival. Reuse actual stored trajectory/root/impact markers; the strongest teaching view highlights the three decisive moments: where force changed the path, where a release handed momentum onward, and where the payoff occurred.

**What is shown:** one low-attention trajectory and at most three causal markers. The player may compare a current attempt with the last best line's topology: one bank versus two; sling-to-well versus direct release; terminal victims and whether the same corridor was reached. No red “behind schedule” race clock is needed. “One more useful transformation” is a better rival than “0.18 seconds late.”

**Physics boundary:** the ghost has no mass, collider, attacks, witness status, target influence or score entitlement. It cannot become moving cover. Your new intervention changes the world's future, so the old enemy trajectories are **historical explanation, not a prediction**. Once scene divergence invalidates the old corridor, fade that guide and label the replay branch as diverged; do not move current enemies to match the ghost.

**Availability and integrity:** live ghost guidance defaults off in normal Adventure/record runs; use replay and practice first. If guided record runs are later allowed, identify the guidance profile. Comparable reenactment requires matching scene seed, starting physical state, kit and physics version. On a revision mismatch, offer the archived causal account/video without claiming deterministic replay still reproduces it. No network service, global leaderboard or online account is needed.

**Reward:** understanding and a better personal line, not additional Arena Credits for watching a replay. Practice records are visibly separate from normal runs. Save at most five automatically selected local lines; explicitly pinned/exported records are user-managed.

**Ship judgment:** this is the highest-value expansion because it closes the loop between accident, explanation and repeatable authorship. Measure repeat-attempt rate, whether the player improves *the causal route* and whether ghost clutter hides live danger. Kill live overlays before compromising readability.

### 6.2 Open Line Contracts — optional puzzles with more than one answer

**Purpose:** give physical experimentation a concrete intention without turning every fight into choreography demanded by a checklist.

**Product shape:** offer three optional contracts at the round-clear screen or Adventure job/ledger surface. One can be active; all remain accessible. They are deterministic opportunity cards tied to a known scene/ruleset, not expiring daily chores. Selection and progress live outside flight; no mission marker is necessary on every prop. Completion is derived only from the same causal receipts and witnessed/ownership rules.

| Contract | Concrete success | At least two valid approaches | Failure changes the situation |
|---|---|---|---|
| **Wrong Side of Cover** | Defeat a finite target whose direct line was occluded at the opening of the proved chain | Bank Job; Well Golf / Slingshot Golf into the occluded corridor | Missed projectile or payload remains physical; target can leave cover; no forced restart |
| **Second-Hand Violence** | Use an already dead substantial hull in a consequential defeat of a live target | Dead Man's Mass throw; attached Wrecking Ball with a post-death setup | Wreck breaks, target survives, or salvage value is lost; the situation still proceeds |
| **Leave With It** | Escape a real hostile interception while retaining a specific independently acquired cargo pod and causing no new civilian harm in that escape episode | Kickstart; Needle Thread | Pod lost or civilian hurt leaves real salvage/law consequences; contract remains incomplete, not an erased world |

**Fairness:** contracts award a persistent **line card** containing the proven route, a fitting/ship cosmetic mark or recognition line, not combat power, bonus competitive score or a second currency. They do not alter base kill pay. Repeating a completed contract grants no extra reward. The same completed technique can still improve a normal Best Line record through the ordinary rules.

**Availability:** choose from opportunities that actually exist in the admitted scene and starter toolkit. Show a physical goal, not a demand for an unavailable named trick. No “throw a cruiser” card when the hull cannot load it. A card's alternatives are descriptions of the desired physics; the detector, not a mission-specific scripted exception, decides completion.

**No forced expiration:** new daily seed suggestions can be a later presentation layer, but the contract archive remains playable. Daily reward streaks and scarcity timers do not make the physical toy better.

**Ship judgment:** launch after the base recognizers are trustworthy. Measure whether contracts increase distinct attempted solutions, not merely completion count. If most players memorize one corridor and stop experimenting, widen valid outcomes rather than adding more chores.

### 6.3 Expansion explicitly not selected: another crowd meter

The combo meter already expresses composition; physical effects express consequence; witnesses express social response. A separate crowd excitement resource would add another bar, another farm loop and another reason to interrupt ordinary life. Use restrained arena audio response at existing bank/moment boundaries instead of a third scalar the player has to feed.

## 7. Operational bounds and information quality

These are product budgets and observability requirements, not a file-specific implementation plan.

| Surface | Initial design budget / requirement |
|---|---|
| Concurrent player stunt candidates | At most 32 active episodes, each ≤8 s |
| Detailed evidence per episode | ≤32 causal nodes, four transfer edges on any scored path, eight detailed terminal bodies |
| Simulation allocation | No new per-tick allocation; scoring observes physical truth and never changes it |
| Added evaluation cost | Initial target ≤0.25 ms p95 and ≤0.75 ms p99 per gameplay frame on the target integrated-graphics machine; measurement still required |
| Pending Adventure barks | Eight incidents, with expiry and semantic priority |
| Visible ledger | Existing total cap 240 entries; modifiers amend one incident |
| New save payload | ≤512 KiB including compact witnesses, titles, dedupe and unresolved observation |
| Automatic clips | Five / 64 MiB; optional recording; overlapping windows merge |
| Cinematic frequency | At most three per rolling 60 sim s; ≥12 s separation; primary-specific 30 s repeat restraint |

At capacity, settled oldest evidence can be compacted, but an incomplete chain cannot be declared complete. Count candidate/evidence saturation and withheld awards. If real play repeatedly exceeds these limits and loses legitimate recognitions, the design has not met coverage; do not hide the failure by deleting enemies, reducing effects, shortening draw distance or changing physics. Representation and recognition breadth need refinement without lowering the world's quality.

Offscreen chains still receive correct underlying combat ownership where provable. Their **live cinematic** may be suppressed for readability. A camera restriction is not a reason to falsify base kills or global simulation outcomes. Missing evidence, failed recording and suppressed accessibility presentation are distinct states, not interchangeable excuses.

## 8. Designer's verdict: what survives the reference-game test

The reference games are transfer points, not authority over SpaceFace's physics. The official sources below support narrow mechanical comparisons; they do not prove the proposed thresholds are fun.

| Reference | Supported precedent | Transfer | Refuse |
|---|---|---|---|
| Tony Hawk's Pro Skater 1 + 2 [E1] | Official scoring guidance rewards linked tricks and reduces repeated-trick value | Legible names, a line worth extending, variety, recognizable settlement | Infinite amplification of semantic aliases or losing a whole fight's earned money to a small scrape |
| Bulletstorm [E2] | EA describes named creative-kill Skillshots and score comparison | Turn a physical solution into a memorable verb with an understandable payoff | A catalogue whose main achievement is checking off arbitrary button combinations |
| Rocket League [E3] | Official training changes support targeted retries, navigation, saved progress and mirrored practice | Make a good physical line easy to revisit, inspect and try differently | Treating a ghost trajectory as an oracle after current-world physics diverges |

**Would their designers nod?** The defensible answer is: this proposal has the right structural ingredients—readable execution, consequence, variation, repeatable learning, bounded reward—but a document cannot certify their approval or the player's grin. The weak points to challenge first are the Bank Job repositioning witness, near-miss counterfactual accuracy, whether 5–8 s feels fluid rather than lax, and whether the rarity/scene-normalization combination produces too many highlights in skilled play.

A manoeuvre that merely holds a button is not rescued by a clever name. Conversely, the game should not reject a legitimate physical line because the pilot held fire while flying it. Physical authorship, not input bureaucracy, is the organizing principle.

## 9. Source register and reproducibility of this proposal

### Supplied authority snapshot

All source references above identify sections within the handoff's four context documents. Hashes make the exact snapshot unambiguous; they are not runtime acceptance evidence.

| Source | SHA-256 |
|---|---|
| `context/PQ-146.md` | `2ea75ade79bc5b3f0a5e4a68357bb3d4d28d70262bcde67b43ff4cb088823264` |
| `context/FEEL_CONTRACT.md` | `c4b525b5d6d1851c35f968e406ec883938a669801da4f0f68182f8f99f2f2ea5` |
| `context/VISION.md` | `8af87a8129ee124f4dc6235a02425b858cb6b77d76ade422d1a6108f20782b5b` |
| `context/CRUCIBLE_SURVIVAL_MASTER_PLAN.md` | `95c75c257628e3f1c728a98316a696438e6bfa25a7115cd1bfea5de0c31e1a74` |

### Narrow external precedents

**[E1] Activision Support.** *Tony Hawk's Pro Skater 1 + 2 Scoring and Combos*. September 3, 2020. Accessed September 14, 2026. `https://support.activision.com/content/atvi/support/web/en/tony-hawks-pro-skater-1-2/articles/tony-hawks-pro-skater-1-2-scoring-and-combos.html`

**[E2] Electronic Arts.** *Epic Games and EA Kick-Start the New Year With a Demo for Bulletstorm*. 2011. Accessed September 14, 2026. `https://news.ea.com/press-releases/press-releases-details/2011/Epic-Games-and-EA-Kick-Start-the-New-Year-With-a-Demo-for-Bulletstorm/default.aspx`

**[E3] Psyonix / Rocket League.** *Season 7: Changes Coming to Custom Training*. June 13, 2022. Accessed September 14, 2026. `https://www.rocketleague.com/news/season-7-changes-coming-to-custom-training`

External sources motivate only the transfer table. All SpaceFace formulas, thresholds, title text, contracts and budget decisions are original proposals constrained by the supplied authority. No empirical result, installed receipt field, working video recorder or completed leaf is inferred from those precedents.
