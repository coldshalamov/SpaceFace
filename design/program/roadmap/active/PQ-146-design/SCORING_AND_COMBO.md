# SpaceFace PQ-146 — Scoring, combo and moment detector

**Design revision:** 1.0 · 14 September 2026  
**Status:** Numerically specified proposal. Worked examples are calculations, not measured play results.  
**Authority:** the supplied September 10 owner revision supersedes the old Pulse exclusion and mandatory kit ranking. The taxonomy's causal gates apply before every formula here.

## 1. Three things the game must not confuse

**Survival income** buys the next toy. **Personal base score** acknowledges owned kills. **Style** names, combines and celebrates execution. They are separate quantities.

An enemy that dies to the room can still yield its normal round salvage and help clear the cohort. It does not become the player's kill or trick. Direct shooting is not financially punished for being direct. Physics must first create a useful combat opportunity; score recognizes that opportunity rather than compensating for weak combat.

### 1.1 Swarm record ordering

The primary local Swarm record is the **highest round entered**, provided entering a round requires the previous live hostile cohort to be resolved. Always show the associated **last round cleared** and deaths remaining in the reached round, so an entry cannot masquerade as a clear.

The comparison tuple, in descending priority, is:

1. Highest round reached.
2. Fraction of the reached round's finite authored threat budget resolved.
3. Final personal score, `base score + banked style`.

Exact ties share the result; there is no hidden time-played reward. Reaching Round 20 beats any Round 19 score. A Pulse-only pilot may win this record. Kills of non-cohort scenery or infinitely regenerated adds do not advance the fraction.

Also expose **Best Line** as a secondary local record: largest single banked style chain, with its named acts, seed and ruleset. A global leaderboard is not assumed shipped; the master plan explicitly places it in the future. Local comparison is separated by mode, arena, balance/physics revision, difficulty, loadout rules and simulation-assist profile. Matched-seed challenges additionally share the seed and starting kit. Adventure contributes neither Crucible points nor Arena Credits.

A “physics run beats equal kills by ≥2×” example means equal victim classes and comparable opportunity, not three fodder versus three bosses. It is not a universal inequality for every run, nor a requirement to handicap an excellent shooter.

## 2. Base kill pay and exact weapon neutrality

### 2.1 Threat table

Each hostile life gets one immutable threat class and reward budget at admission to the encounter. Highest applicable class wins; classes are not additive. The table is a proposed economy scale, not a claim about current armory tuning.

| Threat class | Arena Credits on resolved cohort death | Personal base score if player-owned | Maximum lifetime raw combat-style budget |
|---|---:|---:|---:|
| Fodder / light standard | 10 | 100 | 100 |
| Skirmisher / specialist standard | 20 | 200 | 200 |
| Heavy standard | 40 | 400 | 400 |
| Elite, including elite heavy | 60 | 600 | 600 |
| Boss | 200 | 2,000 | 2,000 |
| Noncombatant, decorative prop, cosmetic debris, endlessly regenerated unbudgeted add | 0 | 0 | 0 |

An authored, finite boss add can have its own class/budget. If adds are endless, their reward allocation must come from a finite parent encounter reserve; exhausting it stops new reward eligibility, not physical spawning. A boss subsystem may consume a declared fraction of its parent's 2,000/200 budget, never add an unlimited new bounty. Body mass alone cannot promote a prop into a hostile class.

Cash is **run-local salvage entitlement**. Keep physical pickup behavior, but any earned uncollected entitlement is settled at a legitimate round-clear collection stop, rather than disappearing because the player used a long-range gun. It is not paid again when the old pickup is later touched. A mid-round death loses uncollected cash; cash is irrelevant after the run ends. Personal score and causal records are settled from their own receipts, not pickup collection.

### 2.2 Pay per weapon/tool

Amounts below are exact for one standard fodder death. Every other target uses the same threat-table amount, with **weapon coefficient 1.00**. These rows cover roots named in the supplied master plan and immediate-kit revision; they are not an asserted inventory audit of every current mounted gun.

| Gun or causal root | Credits | Player-owned base score | Style for merely equipping/firing it | Eligible earned style |
|---|---:|---:|---:|---|
| Pulse Laser, including free starter | 10 | 100 | 0 | Same proved banks, slams, redirects and compositions as any gun |
| Autocannon | 10 | 100 | 0 | Body/terrain/debris outcomes and proved bank lines |
| Railgun | 10 | 100 | 0 | Proved bank/redirection/impulse outcomes; penetration alone is not this packet's trick |
| Plasma Cannon | 10 | 100 | 0 | Secondary physical chain, not routine splash |
| Missile Rack / Nestbreaker | 10 | 100 | 0 | Proved redirected attack or physical cascade, not automatic homing |
| Beam Laser | 10 | 100 | 0 | A real consequential manipulation; no invented projectile bounce |
| EMP Disruptor | 10 | 100 | 0 | A subsequent proved physical outcome; status application alone earns none |
| Concussion Cannon | 10 | 100 | 0 | Rock Discovery, One-Two and other actual consequences |
| Gravity Marker | 10 | 100 | 0 | Proved field-coupled trajectory, not marker attachment |
| Momentum Sink | 10 | 100 | 0 | Proved redirected trajectory and terminal result |
| Impulse Charges / rear repulsion trap | 10 | 100 | 0 | Kickstart or secondary physical chain; ordinary blast kills retain normal pay |
| Massline | 10 | 100 | 0 | Loaded swing, tow, throw and consequential release |
| Snarl / enemy web | 10 | 100 | 0 | Real tension/geometry and resulting impact, not slow-debuff uptime |
| Well / Repulsor / field Rig | 10 | 100 | 0 | Proved force transfer and useful field routing |
| Player-owned collision / terrain / wreck descendant | 10 | 100 | 0 | Exact named grammar with retained player causality |
| Unclaimed room kill / enemy-on-enemy collision | 10 | **0** | 0 | **0**; contributes only survival income and cohort resolution |
| Any unlisted present or future root | 10 | 100 | 0 | Same rule; no hidden weapon premium or discount |

A canonical death gets one cash entitlement and at most one personal base award. An assist does not duplicate the death. This is a single-player attribution design; future cooperative credit must allocate, not clone, budgets.

### 2.3 Small style stipend, not a mandatory tax on shooting

Let `C_round` be the base cash entitlement earned from resolved eligible deaths in this round, and `S_round` be style banked in this round. The cumulative style stipend entitlement is:

**`C_style = min(floor(0.02 × S_round), floor(0.20 × C_round))`.**

Pay only increases in this cumulative entitlement. A per-bank floor would let bank timing affect income; therefore do not round each bank separately. Pure movement cannot mint cash when `C_round = 0`. Style can add at most **20%** to a round's normal income. No gun has a different stipend coefficient.

As a scale check, six fodder deaths produce 60 base credits for any gun or eligible room clear. A first meaningful 50–60-credit purchase would therefore be reachable after that small cohort, without trick proficiency. This is an economy consistency example, not a required replacement for the existing shop catalogue.

## 3. Raw style: rarity, physical execution and finite consequence

### 3.1 Rarity values

| Tier | Meaning | Primary raw base `B_r` | Moment rarity weight `R_r` |
|---|---|---:|---:|
| R1 · Clean | One clean physical redirection into a useful outcome | 50 | 1.0 |
| R2 · Skilled | Coupled handling or a deliberately established bank corridor | 90 | 1.4 |
| R3 · Exceptional | Mid-flight revision, interception, repurposed wreck or consequential escape | 140 | 1.8 |
| R4 · Signature | Multiple different physical transformations in one controlled route | 200 | 2.2 |

Rarity is paid once. It is not multiplied into base kill pay and then multiplied into the combo a second time.

### 3.2 Physical execution factor

Define:

- `rho = manipulated payload mass / player dry hull mass`, measured at the first material root. Dry hull mass is fixed at round/encounter entry; jettisoning cargo cannot change the denominator. For a self-launch, rho = 1. For a projectile-only bank, use no payload mass bonus. Terrain is never an infinite-mass “attacker bonus.”
- `k = |attributable useful ΔV| / reference cruise` of the manipulated body, measured across the decisive manipulation, excluding unrelated ambient acceleration. It is not the sum of all contact impulses or repeated back-and-forth shoves. For a projectile-only bank with no material body shove, set k = 0.
- `clamp(x,a,b)` limits x to [a,b].

**`E = 1 + 0.15 × clamp(log2(rho), 0, 2) + 0.20 × clamp((k − 0.30)/0.70, 0, 1)`**

For projectile-only banks, the log term is defined as zero, not log2(0). Consequently **1.00 ≤ E ≤ 1.50**. Moving four times one's hull mass contributes at most +0.30; adding one cruise-speed of useful ΔV contributes at most +0.20. The factor is an accent, not an incentive to wear the lightest hull and farm a planet.

Do not insert this formula into the damage or hitstun laws. It evaluates a consequence; it does not create one.

### 3.3 Repetition factor

For each primary trick ID, count consecutive uses in the current round/encounter without completing **two other distinct paid primary IDs** in between:

| Use of the same primary ID | Repetition factor `F` |
|---|---:|
| First | 1.00 |
| Second | 0.50 |
| Third | 0.25 |
| Fourth and later | 0.10 |

Waiting, opening the shop, changing weapon IDs, using modifiers or bouncing off a differently named rock does not reset repetition. A legitimate new round does. Two fresh, differently named primary acts also reset that ID's repetition history. Recognition remains truthful at low F; the event is still Bolas, just no longer a novel composition.

### 3.4 Modifiers and outcome budget

For a primary i, define:

**`A_i = F_i × (B_r × E_i + Q_i + 15 × min(N_i − 1, 4) + G_i)`**

where:

- `Q = 20` for a consequence-linked razor release, `5` for clean, otherwise 0.
- `N` is the number of fresh material hostile terminals of a proved Collateral modifier; absent Collateral, N = 1.
- `G = 10` for one eligible Close Shave linked to this payoff, otherwise 0. A Needle Thread that subsumes the same near-miss has G = 0.

Then:

**`X_i = min(A_i, 300, available raw consequence budget)`**.

The **300-point cap is per primary act before combo multiplication**. It contains even a rare lucky multi-kill. More killed enemies still yield their honest base score and cash.

Raw combat-style budgets are attached to victim lives, not attacks. A nonlethal material consequence can unlock at most **half** of that victim's lifetime style budget; death unlocks the full lifetime ceiling. Earlier awards consume that ceiling. Later death does not refill it. Repair, resurrection aliases, fragment births and repeated contact do not create a new life budget. Spend a multi-victim award proportionally to remaining unlocked victim budgets; use the same deterministic allocation on ties. Budget is consumed when an award is accepted, including awards later cashed out at reduced multiplier on a crash.

For a **pure escape**, replace the consequence budget with **40 raw points per identified threat episode**. Several names describing the same escape share that 40. Each combo can count at most one pure-escape act toward its multiplier. In a combat-containing combo, raw escape contribution is additionally limited to **25% of raw combat contribution** at settlement; keep excess pending up to the hard combo deadline, then discard it. An escape-only chain has M = 1 and can bank at most 40, but remains fully eligible for a legitimate cinematic and Adventure reputation.

These budgets permit a great escape to matter without making a safe slalom a better income source than fighting. They also prevent one target from funding a stun → heal → stun → kill shopping spree.

## 4. The combo meter

### 4.1 What the player sees

A small secondary combat display shows **the current named line, pending raw style, and the active multiplier**. Example: **ROCK DISCOVERY → BOLAS → BANK JOB · ×2.00**. At most three names remain visible; longer history lives in results. One event can read **RAZOR BOLAS · COLLATERAL ×3**, without pretending those are three steps.

Use a five-second outer arc and at most two discrete bridge notches. Never obscure the ship, aiming corridor, rope or incoming attack with points. Banked score quietly joins the run total. No score text, combo HUD or numerical multiplier enters Adventure flight.

### 4.2 Multiplier formula

Let:

- `n` = number of distinct primary IDs with **positive accepted raw style from a fresh eligible consequence** in the open chain, capped at 6. A repeated primary can add reduced raw style but not another n. A zero-value recognition from an exhausted victim budget adds neither n nor d, and refreshes no paid-primary timer. Modifiers never add n.
- `d` = number of distinct primary families represented, capped at 6. Families are tether, impact, field, debris, rebound and escape.
- `c` = carried multiplier premium from a prior safely banked chain; 0 to 0.50.

For a chain with a combat act:

**`M = min(3.00, 1 + c + 0.35 × (n − 1) + 0.15 × (d − 1))`.**

**`banked style = floor(M × Σ X_i)`** after the escape share limit and any bounded amendments settle. For award evaluation, round E downward to three decimal places; retain the resulting fractional raw points until this final floor. Do not round each modifier or each banked contribution independently.

A one-act line starts at ×1.00. Three different IDs from three families yield ×2.00. Three IDs all from tether yield ×1.70. Six IDs from six families hit the ×3.00 ceiling. Repeated easy actions cannot raise M. Rarity and mass contribute through X, not extra exponentials.

Keep fractional raw awards until bank settlement; round once, downward. At a 3× cap, one accepted primary contributes at most 900 points. There is no separate per-run style ceiling: a longer, genuinely varied run may legitimately score more, while the principal record still depends on survival.

### 4.3 Time, bridges and quiet banking

| State / condition | Exact rule |
|---|---|
| First confirmed primary | Opens a chain; initial deadline is payoff tick + **5.0 s** |
| Further confirmed primary with positive accepted raw style | Adds accepted style; refreshes deadline to its payoff tick + **5.0 s**; repeats do not increase n/d |
| Physical setup bridge | At most two bridges between paid primaries; each extends the current deadline **1.5 s**, never beyond **8.0 s after the last paid payoff** |
| Eligible bridge | Confirmed Close Shave; or a new loaded constraint that has already displaced a live hostile by **1 L** or **0.15 u**; or a proved bank contact whose live descendant is still en route to a valid target |
| Ineligible bridge | A pressed button, slack link, held beam, repeated contact, empty release, ordinary gun hit/kill with no trick, or another event from the same setup identity |
| Quiet bank | After **2.0 s** with no incoming hostile physical interception predicted inside **2.0 s**, no materially loaded active manipulation, and no unresolved qualifying descendant/amendment, bank automatically |
| Deadline expires during pressure | Bank confirmed awards at full current M. A timeout is not a bail and does not erase achieved execution |
| Quiet but a known descendant remains in flight | Wait only until its bounded resolution/amendment deadline; never past the relevant **8.0 s root limit** |
| Round resolves / shop opens | Bank settled awards. Freeze clocks while the simulation is paused. Do not punish reading an upgrade or earned relief |

A setup bridge carries **no independent score**. If its payoff never happens, it cannot supply n, d, a title or an extra credit. Two bridges buy up to eight seconds, not an infinite tutorial to the last enemy.

### 4.4 Decay and continuity after banking

On a **safe bank**, retain `c = min(0.50, M − 1)` for **1.0 s** of active combat simulation, then decay c toward zero at **0.25 per second**. Already banked points never decay. A new qualifying chain consumes the available carry premium once.

Banking finalizes the paid episode: later descendants cannot retroactively alter its multiplier or reopen its spent budget. Their real kills and cash still settle under ordinary attribution; a new paid manoeuvre requires a fresh material intervention. A legitimate round-clear intermission freezes that carry; the first **5.0 s of the next active round** protect it from decay so the next cohort's arrival is not a penalty. Starting that next chain consumes the carry. It never carries raw points forward, cannot exceed +0.50, and cannot be farmed by shop toggling. This preserves rhythm without keeping a permanent maximum multiplier.

### 4.5 Risk without arbitrary punishment

Ordinary hits and B13-sized traffic knocks do not break a combo. A **hard player crash** requires both a player-body ΔV of at least **0.30 u_player** and either **1.0 s of actual helm loss** or **20% of encounter-entry hull lost** in the same impact episode. A bare high-speed pass does not qualify.

On a hard crash or player death, settle the still-open line at **×1.00**, removing only its linking premium; previously banked points, base kills and earned cash are not clawed back. The player loses composition, not the truth of what already happened. No grace-point refund is based on health lost.

Pre-death launched objects may settle existing causal awards within their normal windows, at ×1.00 with no new chain/carry or postmortem bonus. They do not create Dead Man's Mass. Pause, focus loss and slow motion do not spend simulation-time windows.

## 5. Worked examples

### Example A — Three composed physics acts versus three ordinary gun kills

All victims are fresh fodder; E = 1, F = 1, no modifiers or carry. Payloads used as tools survive where necessary; only three victims die.

| Time | Act | Family | Raw award | Lifetime victim budget used |
|---|---|---|---:|---:|
| 0.0 s | Rock Discovery kills A | Impact | 50 | 50 / 100 |
| 3.0 s | Bolas kills B | Tether | 90 | 90 / 100 |
| 6.0 s | Bank Job kills C | Rebound | 90 | 90 / 100 |

The chain stays open under pressure; each interval is below five seconds. n = 3, d = 3:

**M = 1 + 0.35 × 2 + 0.15 × 2 = 2.00.**  
**Raw style = 50 + 90 + 90 = 230.**  
**Banked style = 460. Personal score = 300 + 460 = 760.**

Three direct kills with any gun, including Pulse: **300 score, 30 base credits**. This composed line: **760 score, 30 base credits + min(floor(9.2), floor(6)) = 36 total credits**. Score ratio = **760 / 300 = 2.533…×**; income ratio = **1.20×**, not 2.53×.

A Pulse loadout executing the same physical line receives the same 760. The tool did not earn the premium; the result did.

### Example B — A spectacular lucky single cannot dominate a composed line

A Signature Slingshot Golf kills one fresh fodder. Let rho = 4 and k = 1, so E = 1.50. No modifier:

**Candidate raw = 200 × 1.50 = 300.**  
**Victim raw budget = 100; accepted X = min(300, 300, 100) = 100.**  
**One primary means M = 1; total personal score = 100 base + 100 style = 200.**

If the same run then gets two ordinary gun kills, the equal-three-kill total is **400**, well below Example A's **760**. It can still get the strongest clip and a deserved title. Fame and arithmetic need not have the same ceiling.

Against a genuine boss, the larger victim budget can legitimately support more style. That is a different comparison, not a loophole involving fodder renamed “boss.”

### Example C — Repeating the same solution does not create a composed line

Three fresh fodder die to repeated Rock Discovery within one open chain. E = 1; repetition factors 1, 0.50, 0.25:

**Raw style = 50 + 25 + 12.5 = 87.5.**  
**n = 1, d = 1, M = 1.00. Banked style = floor(87.5) = 87.**  
**Personal score = 300 + 87 = 387**, versus 300 for three direct kills and 760 for Example A.

Cash = **30 + min(floor(1.74), 6) = 31**. Waiting near the last enemy or holding the same stationary bank corridor cannot refresh novelty. A specialist still gets full kill pay and a modest truthful style acknowledgment.

### Additional collision-accounting check — three names are not three acts

One **Razor Bolas · Collateral ×3** kills three fresh fodder. E = 1.50, F = 1:

**A = 90 × 1.50 + 20 + 15 × (3 − 1) = 185.**  
**Available combined victim budget = 300, so X = 185. n = d = 1; M = 1.**  
**Personal score = 300 + 185 = 485**, not `(Bolas + Razor + Collateral) × a three-act multiplier`.

A huge consequence is still wonderful; a player who composes three different interventions earns the larger Best Line. Neither result is forced to beat a shooter who survives farther.

## 6. The moment detector: a rare accent, not a traffic siren

### 6.1 Hard gates before the number

A live moment is eligible only when **all** apply:

- A primary physical manoeuvre's minimum consequential recipe is confirmed with full causal evidence; its final style/amendment accounting may still be pending. Modifier-only proximity, generic gun kills and unclaimed world incidents do not qualify.
- The terminal is a material combat or escape consequence. For Adventure civilian/property incidents, a truthful “repercussion” moment can qualify without awarding positive style.
- The player's ship and the important terminal interaction are visible in the existing gameplay frame; the causal object is visually identifiable. No camera teleport to offscreen traffic.
- The eight-second root/transfer limits are satisfied; the moment does not rely on an unknown parent.
- This root family has not already emitted a moment. The global cooldown is **12.0 simulation seconds**, at most **three live moments in any rolling 60.0 simulation seconds**, and the same primary trick ID cannot receive another live moment within **30.0 s**.

These gates, rather than a high score threshold, do most of the false-positive prevention.

### 6.2 Normalize momentum without confusing solver caps with spectacle

Freeze a reference light hull's mass `m_ref` and cruise `u_ref` for each scene/ruleset at entry. Define:

**`p_ref = 0.20 × m_ref × u_ref`.**

The 0.20 reference is a tuning scale, not a physics constant: it puts an actual 0.44-cruise player blast impulse near P = 2.2 for the reference hull, while ordinary small knocks remain well below the moment threshold.

For a qualifying physical contact, define available incoming normal momentum:

**`p_contact = μ × max(0, −v_relative,before · normal)`**,  
**`μ = m_a m_b / (m_a + m_b)`**.

For immovable terrain, use the finite limit μ = moving body's mass. Never assign infinite spectacle to a wall. Only use a contact with a verified material consequence and retained player causality.

For a pure escape launched by a charge, loaded rope or field, use the **measured useful impulse on the player** as that transfer's p. For a Needle Thread without such an impulse, it can earn recognition but P may be too small for a cinematic; geometric danger alone is not invented momentum.

Let `p_star` be the **largest one qualifying transfer** in the episode, not the sum of launch plus all downstream transfers of the same momentum:

**`P = min(3.00, p_star / p_ref)`.**

This distinction matters because the supplied Feel Contract documents a historical collision-solver impulse bound while terrain damage uses pre-solve closing speed. Raw `exchangedMomentum` alone may flatten a dramatic slam. Pre-solve available momentum describes impact severity; actual outcome and provenance remain mandatory. If only capped scalar exchange is available, do not assert the detector has been calibrated—report that specific evidence limitation.

### 6.3 Rarity × momentum × collateral

Use the largest rarity weight among the primary and its **confirmed** Razor/Collateral modifiers, once:

**`R = max(R_primary, R_confirmed_modifiers)`**.

Let N be distinct materially affected terminals in the causal chain, capped at four for cinematic amplification. In Adventure this may include a real non-hostile consequence, but spilled cosmetic pieces are not separate terminals. For one escaped threat, N = 1.

**`C = 1 + 0.25 × min(max(N − 1, 0), 3)`**, so **1.00 ≤ C ≤ 1.75**.

The moment intensity is:

**`H = R × P × C`.**

**Fire at the first chronological confirmed consequence with H ≥ 3.60**, provided every hard gate passes. Record H and its factors for explanation. Later outcomes in the same root family may update the existing clip's peak H and collateral account; they never emit another live slow, stinger or clip request. Do not anticipate future collateral or wait for a conveniently larger final number. Do not rescale by the preceding thirty seconds' observed maximum, by the current player hull, by camera zoom, or by wall-clock load. Otherwise weak scenes inflate themselves and repeatable sequences change meaning.

Across arenas, the reference hull is the same standardized light target for a given ruleset. An arena with heavier authentic collisions can produce stronger moments; the hard rate limits contain presentation. Content may expose different opportunities, but no scene-specific quota secretly lowers the threshold to secure three hits.

### 6.4 Three planned proof moments

The following are **target receipt values for the proposed proof**, not observations from running the game. A normalized numerical realization with m_ref = 20 mass units and u_ref = 100 WU/s has p_ref = 400 momentum units.

| Proof time | Distinct episode | R | P | C | H | Why it should fire |
|---|---|---:|---:|---:|---:|---|
| 13 s | One-Two redirects a pirate into terrain | 1.8 | 3.0 | 1.00 | **5.40** | Two material interventions; terminal available momentum 1,500, normalized and capped from 3.75 |
| 28 s | Bolas reaches Collateral ×2; the chain later reaches ×3 | 1.4 | 2.4 | 1.25 | **4.20** | Available momentum 960; first threshold crossing emits once |
| 49 s | Kickstart uses a real blast to escape pursuit with the pod | 1.8 | 2.2 | 1.00 | **3.96** | Actual player impulse 880 and a resolved escape, not speed alone |

At 30 s, a third terminal in the Bolas episode can raise the recorded peak to 1.8 × 2.4 × 1.5 = **6.48**, but this is an amendment to the 28 s moment, not a fourth event.

Times are 15 and 21 seconds apart, with three primary IDs and three root families, so the cooldown, repetition and rolling limits admit them. In the numerical realization, Kickstart requires a large-enough real charge impulse; if the actual player hull/mine configuration supplies less, its H will be lower. Do not silently replace that measured force with the target 880. Tune the physical opportunity or choose another naturally valid proof beat; do not lower the detector for the fixture.

A single Rock Discovery at R1, even at the P = 3 cap, scores H = 3 and does not steal the chase. Unclaimed traffic, however massive, fails the causal gate before H is considered.

### 6.5 What the event triggers

| Channel | Default local solo treatment | Limit / safety |
|---|---|---|
| Live micro-slow | **0.80× simulation pace for 0.20 simulation seconds**; 0.25 seconds elapsed viewing time | Adds only 0.05 elapsed seconds per event; never changes fixed-step physics equations or impulse magnitudes |
| Camera | At most **4% inward framing push**, ease in 0.10 s and back over 0.45 s | Translation capped at 2% frame width; no roll, target switch or camera teleport; skip inward push if it would crop threats or violate B3's earned-speed framing |
| Impact accent | The existing physical impact receives priority | Do not stack a second full hitstop/trauma on the same B9 receipt |
| Stinger | One **0.45–0.70 s** material/force-specific accent | No new loudness escalation beyond the game's mix; brief 3 dB music duck, not dialogue/critical warning suppression |
| Clip marker | Root-linked marker with **8 simulation seconds before + 4 after** | Merge overlapping windows; preserve causal start, full-speed viewing and event identity |
| Clip playback | Optional **0.35×** around the key transfer for **0.70 source seconds**, then restore full speed | Slow playback is not a gameplay advantage; a normal-speed version remains available |

Live micro-slow is an optional **Cinematic assist profile**. A **Flow profile** leaves live simulation pace at 1× while retaining audio, bounded camera emphasis and slowed clip playback. Reduced-motion can disable framing movement; reduced-flash keeps directional/material sound and optional radio text. These presentation choices never reduce points.

**Fairness boundary:** live time dilation gives a little more real reaction time even when fixed-tick physics is unchanged. Do not call it “purely cosmetic” or pool future competitive records across differing simulation-time assist profiles. Camera/audio/accessibility-only differences do not require separate score rules. All timers, combo windows and cooldowns use simulation ticks; captured media use an explicit mapping between simulation and presentation time.

No camera or cinematic changes the player's input vector, velocity, turn authority, contact geometry, hitbox or invulnerability. No automatic clip upload. Local automatic retention is capped at **five clips / 64 MiB**, with pinned user exports separate; recording-off still keeps the lightweight causal marker. If the recorder cannot capture, show the marker as unavailable video rather than claiming a clip exists. Recognition and scoring cannot depend on encoder completion.
