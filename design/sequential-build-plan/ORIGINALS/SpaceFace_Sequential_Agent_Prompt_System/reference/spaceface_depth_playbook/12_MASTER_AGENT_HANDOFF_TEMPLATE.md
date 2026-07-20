# 12 — Master Agent Handoff Template

Use this template when sending one feature brief into a planning model or coding agent. Replace bracketed fields. Attach or paste the relevant numbered brief from this playbook and `07_AGENT_EXECUTION_CONTRACT.md`.

---

## Prompt begins

You are working in the current `coldshalamov/SpaceFace` repository. The repository is active and may contain concurrent changes newer than any quoted commit. Before editing:

1. read the root and nested `AGENTS.md` files governing every path you may touch;
2. inspect `git status --short`, current branch/HEAD, and diffs for candidate files;
3. identify the current authoritative implementation rather than trusting historical design status;
4. do not reset, clean, stash, overwrite, or revert unrelated work;
5. do not update golden expected data merely to make a check pass.

### Feature authority

Implement this feature:

**[PASTE ONE FEATURE BRIEF HERE]**

The following project-wide contract is also authoritative:

**[PASTE `07_AGENT_EXECUTION_CONTRACT.md` OR ITS RELEVANT SECTIONS HERE]**

### Product objective

The player-facing outcome is:

> [ONE SENTENCE DESCRIBING WHAT THE PLAYER CAN NOW DO OR EXPERIENCE]

This is not complete merely because data, code, a hidden route, a test, or an asset exists. It is complete only when the player can reach and operate it through the declared route and current revision evidence proves the result.

### Scope boundary

In scope:

- [BOUNDED MECHANIC OR SITE]
- [EXISTING SYSTEMS TO REUSE]
- [ONE NORMAL OR DEVELOPER FIXTURE]
- [PERSISTENCE/INTEGRATION REQUIRED]
- [PLAYER-FACING PRESENTATION REQUIRED]

Out of scope:

- [LARGER SYSTEM NOT NEEDED]
- [CONTENT REPLICATION]
- [SECONDARY UI REDESIGN]
- [FULL AI/PHYSICS REWRITE]
- [VOICE/CUTSCENE/PROCEDURAL GENERATION]

### Required first response: audit and implementation plan

Do not edit code in your first response. Return the following:

#### A. Current-state audit

- exact current files and functions that own the relevant behavior;
- which existing systems already partially implement the requested feature;
- whether the feature is normal-route reachable, developer-route reachable, focused-test only, or code/data only;
- current collision/input/save/render authority involved;
- conflicts, stale alternatives, feature flags, or historical files that must not be mistaken for live ownership.

#### B. Player-observable contract

Provide a table:

| Step | Player input | Selected target/component | Visible response | State transition | Failure/counterplay |
|---|---|---|---|---|---|

Every input must be unambiguous in the relevant reference frame. State whether the input is ship-relative, target-relative, world-relative, tether-relative, or path-relative.

#### C. Reuse map

List each required behavior and the existing owner/service/event it will use. Explicitly identify any genuinely missing primitive. Do not create a duplicate credits, cargo, reputation, physics, world, target, or save authority.

#### D. File and lease map

List:

- files to edit;
- new files to create;
- owner of each shared file;
- files read-only due to concurrent work or authority;
- integration order.

#### E. Minimal vertical slice

Define the smallest fixture that proves the mechanic. It must include:

- exact entities/structure/pocket;
- initial state;
- public or declared developer route;
- input sequence;
- expected result;
- cleanup/reset method.

#### F. Technical method

Name the technique rather than saying “advanced” or “smooth.” Examples include:

- compound planar proxies with entity broad phase and proxy narrow phase;
- swept circle-versus-capsule collision;
- bounded PD controller in radial/tangential frame;
- target-relative polar slot controller;
- arc-length-resampled spline with pure-pursuit look-ahead;
- hierarchical NPC job state machine;
- witnessed materialization plus statistical absent resolution;
- event-sourced persistent component state;
- instanced modular kit with HLOD.

Provide equations, state diagrams, data shapes, or pseudocode where ambiguity would otherwise remain.

#### G. Failure-mode pre-mortem

List at least ten ways an autonomous implementation could technically satisfy the words while failing the experience. Include any relevant items from this set:

- generic sphere or fallback box;
- unrelated central collider;
- one global progress bar;
- reward toast without physical state change;
- direct velocity writes;
- hidden autopilot;
- mixed reference frames;
- NPC wandering with a job label;
- timers disconnected from world events;
- duplicate state ownership;
- default-off hidden feature called complete;
- special capture route bypassing normal play;
- visual detail invisible at gameplay zoom;
- unbounded entities/receipts/particles;
- save/load state loss;
- browser/Electron divergence.

#### H. Verification plan

Specify:

1. pure/deterministic tests;
2. persistence/migration tests;
3. integration checks;
4. browser route/probe;
5. Electron route if the feature touches desktop/runtime parity;
6. debug overlays/telemetry;
7. same-framing visual captures;
8. performance measurement;
9. mutations each test should catch.

### Implementation requirements

After the plan is reviewed or when proceeding under best judgment:

1. implement one coherent vertical slice;
2. use stable IDs and existing event/ownership seams;
3. expose tuning constants in one named place;
4. add debug instrumentation that can be disabled without removing the mechanic;
5. preserve deterministic fixed-step behavior;
6. make old saves default safely;
7. keep browser, Electron, and packaged route behavior identical;
8. provide a clean fallback only when it does not hide failure;
9. do not replicate content beyond the fixture;
10. stop if the required primitive cannot be implemented honestly within scope and report the exact blocker rather than substituting a weaker representation.

### Anti-placeholder acceptance

The implementation automatically fails acceptance if any of these are true:

- [FEATURE-SPECIFIC PLACEHOLDER FAILURE 1]
- [FEATURE-SPECIFIC PLACEHOLDER FAILURE 2]
- [FEATURE-SPECIFIC PLACEHOLDER FAILURE 3]
- the primary player result exists only in text/UI;
- the visible object and collision/interaction geometry disagree materially;
- the operation has no persistent or systemic consequence where one is claimed;
- a reviewer cannot reproduce the sequence through declared public inputs;
- the feature is only green because expected/golden output was rewritten without a justified re-record decision.

### Final report format

Return:

1. **What changed for the player**
2. **Files and authorities touched**
3. **Exact input sequence**
4. **Focused checks and results**
5. **Normal-route/browser/Electron evidence**
6. **Performance receipt**
7. **Known limitations and unproven claims**
8. **Commit/revision identity**
9. **Next bounded slice, not a broad wishlist**

Use the status terms distinctly:

- code exists;
- implemented in current tree;
- focused check green;
- player route proven;
- visual acceptance passed;
- integrated and recoverable.

Do not collapse them into “done.”

## Prompt ends

---

## Example anti-placeholder insertions

### For a wreck landmark

- primary body may not be a sphere, asteroid, or one generic wreck entity;
- at least five visible components must correspond to independently targetable states;
- solid hull regions and deliberate channels must agree with compound collision proxies;
- salvage cannot be one global RMB progress bar;
- at least one recovered item must exist as a physical detachable payload before reward settlement.

### For a control mode

- no direct velocity assignment or kinematic orbit/path playback;
- no indefinite yaw-rate command from trackpad displacement;
- reference frame must be explicit and singular;
- manual override must disengage within one simulation tick;
- debug overlay must show raw input, desired state, controller output, and actual state.

### For an NPC job

- motion must reveal purpose without relying on a label;
- loading/working/unloading must correspond to real state transitions;
- route must have stuck detection and bounded recovery;
- combat must be an interrupt with resume/abort policy;
- witnessed and absent resolution must reconcile to the same authoritative result.

### For industry exteriorization

- a site milestone must change flight-world geometry, traffic, route, or capability;
- courier launch must correspond to real site policy and inventory;
- player-present loss must reconcile with statistical route state;
- construction cannot jump from zero to complete after a timer;
- final payoff cannot be passive credits alone.

## Minimal invocation pattern

For a planning thread:

> Read the attached SpaceFace feature brief and execution contract. Audit current `master`, then return only sections A–H from the Master Agent Handoff Template. Do not code yet. Resolve ambiguities using the product north star and choose the smallest honest vertical slice.

For a coding thread after a plan exists:

> Implement the approved vertical slice below against current `master`. Treat the player-observable contract, anti-placeholder criteria, owner map, and verification plan as binding. Re-audit files before editing because the tree may have moved. Do not broaden scope. End with the required final report and current evidence.
