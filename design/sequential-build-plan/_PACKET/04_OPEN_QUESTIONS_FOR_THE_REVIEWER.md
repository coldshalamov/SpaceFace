# 04 — Open questions for the reviewer

> Each question is decision-shaped, with the context and the conflicting signals.
> The user wants concrete recommendations, not re-statements of options. Where you
> can, pick a side and defend it; where you genuinely can't, name the one fact that
> would decide it and where to get that fact.
>
> These are grouped: (A) the program-authority decisions, (B) the control/feel
> decisions, (C) the scope/restraint decisions, (D) the cross-package reconciliation
> decisions, (E) the implementation-risk decisions.

---

## A. Program-authority decisions (the biggest ones)

### Q1. Fold, supersede, or parallel? (THE central question)
The SF-00…SF-35 sequence overlaps ~22 of 36 prompts with existing roadmap packets or
depth-program chunks. Three options:
- **(A) Fold-in:** map each SF-XX to existing IDs; update in place.
- **(B) Supersede:** SF is the new plan; tombstone `design/depth-program/BUILD_PLAN.md`.
- **(C) Parallel:** keep SF-XX but respect existing IDs for overlap.

**Context:** `PLAN_REGISTRY.md` says *"only `program/roadmap/**` owns packet work
order."* The depth-program is explicitly subordinate to `program/`. The atlas program
(2026-07-19) already superseded the atlas prompt pack's sequencing.

**My read (for you to confirm/overturn):** (A) is lowest-risk and matches the repo's
own rule. (B) discards depth-program research provenance. (C) is what naive execution
produces and is worst. **Decide and state which SF-XX prompts become which existing
IDs, and what happens to the depth-program.**

### Q2. Is the SF-00 bootstrap redundant with the live `program/` roll-up?
SF-00 produces a `SEQUENCE_BASELINE.md` reconciling the queue against live truth. But
`design/program/NOW.md`, `02_REMAINING_WORK.md`, and `PLAN_REGISTRY.md` already do
exactly this and are kept current by the lead. Does SF-00:
- (a) duplicate effort the lead already owns?
- (b) add value by producing a *queue-specific* baseline (mapping each SF-XX to live
  status) the existing roll-up doesn't provide?
- (c) get folded into the lead's existing reconciliation duty?

**Recommend a concrete answer.** If (b), define exactly what artifact SF-00 should
produce that doesn't already exist.

### Q3. Where do genuinely-new SF-XX prompts get stable IDs?
SF-07 (G-mode fix), SF-08 (compound collision), SF-11/12/13 (gravity weapons family),
SF-22 (env hazards), SF-29 (twin bridle) have no existing roadmap packet. The repo
rule says new work gets a roadmap ID assigned by the lead before execution. Should
these become new T/A/W packets, or a new family, or stay in
`06_RETAINED_FUTURE_BACKLOG.md`? **Propose the ID assignment.**

### Q4. What is the depth-program's fate?
`design/depth-program/BUILD_PLAN.md` covers Wreck Cathedral (H1a), Ship's Ledger (A2),
visual families (S1–S4), planets (W1/W2) — all of which SF-XX also covers. Three
sub-decisions:
- Does the depth-program chunk ID space (H1a, A2, etc.) survive as the canonical
  content ID, with SF-XX as just a re-statement?
- Or does SF-XX become canonical and the depth-program gets tombstoned?
- The 16 IP-CP chunks are mostly NOT recoverable from committed master
  (`PROGRESS_LEDGER.md:5–7`). Does that change your answer?

---

## B. Control & feel decisions (the user cares most about these — "optimal and fun")

### Q5. RESOLVED BY USER — preserve G auto-target/draw-to-fly; reject pursuit-slot/autopursuit
The reviewer must not reinterpret uncertainty in an old transcript as permission to replace the
control. The user explicitly rejected the derived target-relative pursuit-slot implementation on
2026-07-24. Preserve relative clutchable draw-to-fly as direct ship intent while locked-target weapon
lead remains independent. Do not add MMB pursuit selection, automatic target-relative station
keeping, pursuit impulses, pursuit HUD/toasts, or an alternate historical-plan route that can restore
them. No A/B or prototype is authorized.

### Q6. Should orbit-assist be a default-on assist or an explicit toggle?
SF-05 formalizes the user's orbit-assist idea (L421). Gravity package offers strength
settings: Full / Standard (default) / Light / Off. Question: is **Standard** the right
default, or should new players start on **Full** (more forgiving) and graduate down?
The user's phrasing — *"what else could I possibly be trying to do holding these 2
buttons tethered to something besides spin and slingshot off it"* (L423) — suggests he
wants it to feel automatic, not toggled. **Recommend a default and an onboarding path.**

### Q7. Massline button: Space (gravity package 02's recommendation) or "rebindable, thumb-accessible" (Brief 02's softening)?
User L1664: *"it's possible tether might have to be upgraded to a more central feature
and be triggered with the thumb with the space bar."* But Space may conflict with other
bindings, and `input.js` is Lead-only-edit. **Recommend the canonical binding and the
migration path from the current F.**

### Q8. How is the slingshot release-timing UI made accessible (not red/green alone)?
User L1656 wants a screen-edge red→green→red gradient. But the VFX doc (gravity 05 §15)
and a11y rules forbid red/green as the sole channel. The design package adds shape/
pulse-frequency differences. **Specify exactly what the secondary cue is** (pulse
frequency? shape change? a moving tick mark?) so an implementer doesn't default to
color-only.

### Q9. Player impact hull damage: zero (gravity 01 Law 2 "immunity") or small (Law 7 "little or no hull damage")?
Two laws in the same doc disagree (see digest §F10). The user said (L458) *"if I
didn't take physics damage"* — implying immunity. But total immunity makes collision
consequenceless. **Recommend a specific policy:** zero hull damage + knockback +
shield-flicker + heat + capacitor cost (Law 7's list), or a small hull damage floor
to preserve stakes?

### Q10. Is "bullet time" / Flyby Focus a dependency or a nicety?
Flyby Focus 2.0 (gravity 02 §8) slows time during high-speed passes to help targeting.
The user casually noted (L1652) it *"doesn't work right now."* Multiple SF prompts
(SF-03 acquisition, SF-06 release, SF-14 planet sling) would benefit from it. Should
Flyby Focus be:
- (a) a hard dependency that must be fixed first (adds scope)?
- (b) optional — the targeting/release systems must work without it?
- (c) deferred to a later polish phase?

**Recommend one.** Note: it's a determinism concern (time-scale changes must be
sim-coupled, not render-coupled).

---

## C. Scope & restraint decisions (the user explicitly warned against over-ambition — L1851)

### Q11. Which of the 10 physics weapons actually ship in the first vertical slice?
Depth 02 lists 10 (concussion, vector mine, recoil lance, gravity puck, repulsor,
RCS disruptor, anchor charge, tractor pulse, ricochet slug, tether cutter). Depth 08
Wave 4 and SF-10 narrow to 3 (concussion, vector mine, RCS disruptor). **Confirm the
3, and state which (if any) of the other 7 are worth adding before SF-33 (gold
corridor).** The user wants expendable-swarm twitchy-fun (L1706), which favors
impulse/displacement tools over DPS tools.

### Q12. Which of the 8 alternative massline heads ship, and in what order?
Gravity 06 Phase 9 priority: Tractor → Elastic Whip → Frame Coupler → Monofilament →
Twin Bridle → Drag Net. Orbital Spool is the baseline (not a variant). The user
personally proposed: dragnet (L1692), twin bridle (L1694, object-to-object), monofilament
(L1690), transverse snare (L1696). **Confirm or revise the order.** Note Frame Coupler
is a dependency for Meteor Express (gravity Brief 11) which is in Phase 8 — a real
ordering inversion (digest §F15).

### Q13. How many sectors get recomposed, and is it Ceres Belt or one of the 12 seeds?
SF-21 recomposes "one sector." Depth 08 Wave 6 names **Ceres Belt** (not one of the 12
seeds in depth 03). The atlas program already owns sector recomposition via W07–W10
(Helios/Ceres/Tethys postcards). **Pick the canonical first-recomposition sector and
reconcile with W07–W10.** Note `check:journey:textile` is already at 10/11 on the
Helios→Tethys route — that corridor is the live candidate.

### Q14. Does the Wreck Cathedral live in a specific sector seed?
Depth 04 doesn't name a sector. The Blackglass Lease and Carrier Grave seeds (depth 03)
overlap thematically. The atlas program's planet/sector records must reconcile. **Name
the sector** (or declare it sector-agnostic for the first slice).

### Q15. Are black holes, Lagrange nodes, and gravity-course contracts in scope for the first pass?
Gravity package 04 §14–16 proposes these as late/handcrafted content. The user warned
(L1851) some ideas are "a lot of work for minimal benefit." **Recommend which (if any)
of these three are worth building before SF-33, and which defer to post-release.**

---

## D. Cross-package reconciliation decisions

### Q16. Who owns VFX — atlas pack's VFX/RCS/env agent OR gravity pack's physics-VFX agent?
Both packages propose near-identical VFX systems with the same forbidden-shortcut list
(see digest §C.3 collision #2). Two agents building competing VFX systems is a real
hazard. **Recommend the single VFX owner** (likely a roadmap R-packet or a new dedicated
packet) and state which package's spec is canonical.

### Q17. Who owns propulsionKernel.js — atlas pack's propulsion agent OR depth-playbook's Agent A?
Atlas pack scopes its propulsion agent to NOT own route planning/map UI/speed-line
rendering/physical-lane gameplay. Depth-playbook's Agent A owns physics/controls/
collision including propulsion. **Two packages assume ownership. Recommend the single
owner** and the seam between them.

### Q18. How do planets reconcile across atlas (map record) and gravity (physics body)?
Atlas's Canonical Atlas record for a planet (bounds/orbit/trajectory) and gravity's
planet-as-physics-body must share one stable identity. Neither package names the other.
**Specify the contract:** what fields the atlas record provides, what the physics body
adds, and where the join lives.

### Q19. How do wrecks reconcile across atlas (entry) and depth (monumental site)?
Atlas's lightweight "wreck record" and depth's "Wreck Cathedral" (300–600 wu) must
reconcile — a player flying to a wreck on the map expects the physical site, not a
radius-9 blob. **Specify the wreck-tier system** (e.g. minor aftermath = small entity +
atlas record; monumental = full World Site + atlas record).

### Q20. Does the atlas pack's "Travel Burn" survive the atlas program's own inversion?
The atlas program (2026-07-19) said the spatial foundation exists and only the route
spine is missing. The atlas *pack* (the prompt pack) proposed Travel Burn + route
executor + physical lanes as substantial new work. **Which of these are still needed
given the live `check:journey:textile` 10/11 state?** Recommend whether SF-26 is
mostly `ALREADY_SATISFIED` with narrow gaps, or genuinely greenfield.

---

## E. Implementation-risk decisions

### Q21. The orbit-assist controller has NO numeric constants (Kr, Kd, ωmax, aRadialMax, Rmin, anchorMassRatioMin). How should an implementer tune them?
Gravity 02 gives the PD law `radialCorrection = -Kr * lengthError - Kd * vRadial` but
no values. This is the single biggest implementation risk for SF-05. **Recommend a
tuning methodology:** start with values from analogous controllers? Derive from ship
stats? Use the deterministic lab (SF-02) to grid-search? **Give the implementer a
concrete starting procedure**, not "tune through playtesting."

### Q22. The predictor cadence (10–20 Hz) vs Arm-mode "next valid solution frame" (reads as 60 Hz) — which wins?
Digest §F9. Arm mode (gravity 02 §11.4) cuts "on the next valid solution frame" but the
predictor samples at 10–20 Hz (gravity 06 §18). Either Arm needs higher cadence, or
"frame" means "sampled solution." **Resolve this explicitly** so an implementer doesn't
build the wrong one.

### Q23. NPC cargo collection: "statistically" or "physically"? (digest §F14)
Gravity 04 §12 says cargo is collected "statistically or physically." Gravity 06 §16.2
says cargo is sole-writer-owned. "Statistically" could bypass the cargo owner.
**Specify which**, and how statistical collection routes through the cargo owner
anyway (e.g. emit `cargo:add` intents from the job controller, not direct writes).

### Q24. What happens to the depth-program's 16 IP-CP chunks that aren't recoverable from master?
`PROGRESS_LEDGER.md:5–7` says most July-14 implementation lived in a dirty-tree
satellite and isn't in committed master. The roll-up marks them IP-CP but
`02_REMAINING_WORK.md:111–114` warns IP-CP ≠ accepted. **For each IP-CP chunk the SF
plan depends on (A2 Ship's Ledger, W1 planets, S3/S4 ships, etc.), recommend: re-verify
at HEAD, or treat as TODO?**

### Q25. The broad `npm run check` is DEAD ON ARRIVAL (NOW.md:135). How does the plan verify integration?
`check-m1-tether-mass-grounding.mjs:24` asserts old `check:ci` inlining. The broad
chain is broken. SF-00/SF-35 rely on broad verification. **Recommend the verification
strategy:** fix the precheck first (out of scope?), route around it with focused
checks, or declare the precheck fix a dependency of SF-00?

### Q26. The physics single-writer membrane has ~17 violations (POLISH_BRIEFING.md:70). Does SF-09 fix this first or route around it?
SF-09 (universal weapon impulse) requires routing impulse through physics authority.
But the membrane is "aspirational, not enforced" with ~17 existing violations.
**Recommend:** does SF-09 include enforcing the membrane (scope expansion), or assume
it and flag violations as they appear?

### Q27. What is the minimum viable set of prompts that delivers the user's "fun, beautiful, professional" bar?
The user wants the end result to be optimal/professional/beautiful/fun. Not all 36
prompts contribute equally to that. **Identify the critical path** — the smallest
subset of prompts that, done excellently, delivers the user's bar — and the prompts
that are nice-to-have. This helps prioritize when scope pressure rises.

---

## F. The "stimulate questions" flags (the user asked you to flag possible problems, not necessarily solve them)

These are things that *might* be wonky but the user explicitly said *"I don't want you
to make these judgements but possibly flag things that might have problems just to
stimulate questions."* Surface them; let the reviewer decide.

- **F-q1:** The depth-playbook's "24 sectors" (file 00) vs the 12 pasteable seeds
  (file 03) vs Ceres Belt (file 08 Wave 6, not in the 12) — the canonical sector
  inventory is unclear.
- **F-q2:** The 7-stage progression ladder (depth 05) vs the 5-stage arc (depth 00)
  don't map 1:1 — which is the player-facing progression?
- **F-q3:** "Cloaked ballistic drift" (gravity 04 §13.3) appears as an escape technique
  but cloaking is never defined anywhere — is this lore or an underspecified mechanic?
- **F-q4:** "Ancient object whose orbit reveals a hidden anchor" (gravity 04) — hidden
  anchors are mentioned but no system defines how one becomes unhidden.
- **F-q5:** "Storm cells" in atmosphere (gravity 04 §5) — mentioned once, never defined
  as a system; gameplay-critical or cosmetic?
- **F-q6:** Gravity Lens (gravity 01 §6.2 lists as core; gravity 03 §6.3 defers heavily)
  — near-term scope unclear.
- **F-q7:** The VFX "exact agent prompt" asymmetry (gravity 05 gives full prompts for
  Mass Seed/Repulsor/reentry/camera but NOT for massline/concussion/Inertial Shunt/
  atmosphere skim/drag net/twin bridle/black hole) — implementers of the prompt-less
  effects have less direction.
- **F-q8:** The "Autonomous bridle node" (gravity 03 §7.6, if the player doesn't stay
  attached during Twin Bridle setup) — undefined elsewhere.
- **F-q9:** "Mass Seed as large body forbidden as both Twin Bridle endpoints but valid
  as one" (gravity 03 §7.6) — but combination grammar "Mass Seed Anchor → Bomb
  propulsion" implies seed can be a sling anchor — is it a "large body"?
- **F-q10:** Performance LOD (gravity 05 §14, 06 §18 mandate reducing particle count
  at far zoom) vs "lowering quality is forbidden" (gravity 08 forbidden shortcuts) —
  the distinction is subtle and an agent could over-apply the forbidden rule.
- **F-q11:** "Two focused iterations" stop condition (gravity 06 §19) — what counts as
  a focused iteration? Undefined unit.
- **F-q12:** One `masslineVariants` feature flag for all six variants (gravity 06 §15)
  but Phase 9 prioritizes them in order — should each have its own flag?
- **F-q13:** The Wreck Cathedral's first story package (depth 06 §12) starts with "The
  Missing Convoy" but the wreck itself (depth 04 §8.1) is described as a capital hull
  with no active registry — the convoy→capital-hull link is implied but not stitched
  across files.
- **F-q14:** Depth-playbook files 07, 09, 12 are referenced everywhere but are the
  largest/most-procedural files — confirm they're consistent with the digest in
  `02_SOURCE_AND_PLAN_DIGEST.md` (the digest covered 00–06, 08, 10, 11; 07/09/12 were
  noted but not fully digested).
- **F-q15:** The `reference/SpaceFace_Dev_Plans.txt` inside the original Sequential
  system is byte-identical to `ORIGINALS/SpaceFace_Dev_Plans.txt` — but if the reviewer
  finds a discrepancy, the ORIGINALS copy is canonical (it's the direct download).
