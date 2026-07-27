<!-- LIFETIME: STABLE -->
# Agent Execution Guide

**Who this is for:** whoever is dispatching agents against
[`PHYSICAL_PLAY_BUILD_PLAN.md`](./PHYSICAL_PLAY_BUILD_PLAN.md), and the agents themselves.

The plan says *what* to build. `00_EXECUTION_PROTOCOL.md` says *how a packet is proved*. This file
says **how to staff the work** — which model, how much context, whether a vision model is needed, what
can run in parallel, and where agents reliably get stuck.

It exists because the plan touches every subsystem in the repository at once, and a cross-cutting
change dispatched badly does not fail loudly. It fails as three agents fighting over `input.js`, a
fourth burning an hour re-running a nondeterministic browser probe, and a fifth confidently reporting
green against a tree that was already red.

---

## 1. Sizing a task before you dispatch it

Every packet handed to an agent should carry a header answering five questions. Guessing wrong on any
of them is the most common cause of a wasted run.

```yaml
agentBrief:
  contextClass:  small | medium | large | xlarge   # see §1.1
  modelClass:    fast | balanced | frontier        # see §1.2
  needsVision:   true | false                      # see §1.3
  parallelism:   solo | fan-out(N) | pipeline      # see §3
  loopRisk:      low | medium | high               # see §4
  mutexes:       [physics-authority, renderer, ...] # from the queue row
```

### 1.1 Context class

Compaction is the silent killer here. When an agent's context is compacted it **loses its sense of how
long it has been working**, which is precisely the condition under which it starts re-running the same
failing probe. Size generously; a too-large context costs money, a too-small one costs a whole run.

| Class | Budget | Use when | Examples from the plan |
|---|---|---|---|
| **small** | ≤256k | one file, one function, a known fix | Phase 0 doc corrections; `combatDefs.js:165` movement 0.25→0; deleting the source-string bans |
| **medium** | ~500k | one subsystem, several files, needs to read a system's neighbours | Phase 1 wiring items; the mining repairs (3.5); audio impact matrix (3.6) |
| **large** | 1M | crosses subsystem boundaries, or must hold a design document plus several owner modules | State layer keystone (Phase 2); HUD arbiter (4.5); Rig slot dispatch (Phase 5) |
| **xlarge** | 1M + explicit checkpointing | must survive many browser probe cycles, or hold an audit of a whole domain | Swarm rebalance (Phase 4); anything that runs `check:flight:clean` more than twice |

**If a task looks like it needs more than 1M, it is two tasks.** Split it at the seam, land the seam
first, and hand the consumers to separate agents.

**Checkpointing rule for large and xlarge:** the agent must write a running progress file to
`scratch/` after each phase — what it has done, what it has proven, what remains. If it is compacted,
that file is how it recovers. Without it, a compacted agent re-derives its own state from the diff and
usually gets it wrong.

### 1.2 Model class

| Class | Use for | Notes |
|---|---|---|
| **fast** | mechanical, well-specified edits with a clear acceptance test | Doc corrections, constant changes, deleting a check, renaming across files |
| **balanced** | most implementation work; frontend/UI work specifically | UI, CSS, HUD layout, and DOM work benefit more from a frontend-strong model than from a reasoning-strong one. Phase 4.5 is the clearest example |
| **frontier** | design judgement, cross-system reasoning, adversarial review, anything where the *right answer is not yet known* | The state layer effect-vocabulary design; the field-tool readability ruling; any "is this a real invariant or fossilized taste" call; final review of a keystone |

Two anti-patterns worth naming:

- **Do not hand a frontier model a mechanical edit.** It will find three adjacent things to improve and
  the diff will stop being reviewable.
- **Do not hand a fast model an ambiguous design call.** It will pick an answer, implement it
  confidently, and the decision will be invisible in the diff. This is exactly how the repository
  accumulated the fossilized rules catalogued in build plan §2.5.

### 1.3 Vision

A vision-capable model is **required**, not optional, for:

- any visual acceptance (Phase 3 entirely — neon retune, state visuals, 3D pose)
- any HUD layout work, because the failure mode is overlap and you cannot see overlap in a DOM tree
- reviewing a contact sheet or a turntable render
- judging whether an authored asset reads at normal game camera distance

It is **not** needed for sim, save, economy, audio, or input work. Do not pay for it there.

**A vision model looking at a screenshot is the only reliable check for the HUD collision problem**
(three surfaces stacked in the same 118–146px band). No static analysis finds that.

---

## 2. What agents can actually produce here

### 2.1 Art — the loop that runs unattended

The Blender pipeline is genuinely agent-executable, which is unusual and worth exploiting. Sixty-plus
Python builders exist under `tools/blender/` and `tools/art/blender/`, invoked headless. The full loop:

1. **Author** — `blender --background --python tools/art/blender/author_place_archetype.py -- <id>`
2. **Texture** — `tools/art/generate_place_pbr_atlases.py` or `tools/foundry/texgen/*` generate
   original PBR maps procedurally. No external model required, no licensing question.
3. **Export** — `tools/blender/spaceface_export.py` validates the contract and refuses by named
   assertion.
4. **Finalize** — `node tools/art/finalize_part.mjs` normalizes the GLB and **auto-writes the manifest
   row**.
5. **Wire** — hand-edit `runtimeSlots` in the manifest *and* `PART_LIBRARY_CONTRACT.slots` in
   `src/render/partsLibrary.js`. **Three places must agree** — this is the step agents miss.
6. **Review** — `python tools/foundry/render_contact_sheet.py` produces a deterministic contact sheet
   that extracts the *actual game camera* (FOV 50, 60° elevation, zoom 72) with a fixed Cycles seed.
   Or `node sx-shot.mjs <labUrl> out.png` against `graphics-lab.html` / `station-lab.html` /
   `_astlab.html` / `_plumelab.html`.
7. **Gate** — `npm run check:art`, including a live-frame CDP proof and a 360-frame stability probe.
8. **Hand off** — a YAML in `design/graphics-sprints/handoffs/` with sha256s and `checks_run`.

**Three things force a human**, and a dispatch that ignores them will stall:

- **Acceptance authority.** Every production document forbids self-scored promotion. An agent can reach
  `review_status: author_review_only, route_accepted: false` and no further. Only a human writes
  `classification: accepted`.
- **Environment.** The Blender binary is a hardcoded absolute Windows path in roughly fifteen places,
  and `assets/ships/blender.LOCK` is a single-writer lock whose staleness resolution requires judgement.
  **Fixing the path to read `SF_BLENDER_PATH` everywhere is a small, high-value chore.**
- **Rights.** CC-BY intake needs lead approval; generated PBR is capped at `production_input` and
  cannot ship as a final material.

**Honest state of the art pipeline:** of 69 manifest entries, 52 have no image evidence at all, and 274
of 676 render-analysis records are `ok: false`. Treat existing asset status claims as unproven until
re-rendered.

### 2.2 Generated media — what to produce and how to hand it over

Agents can write generation prompts even where they cannot execute them. When a task needs imagery,
the deliverable is a **prompt packet** the owner (or a tool-enabled agent) can run later:

- **Concept art / silhouette exploration** — one prompt per subject, plus the negative prompt, plus the
  intended use. Cheap, high value, and it front-loads the design conversation before Blender time is
  spent.
- **Texture and material reference** — remember the constraint: generated PBR enters Blender as
  `production_input` and the authored bake produces the final material. Prompt for *reference*, not for
  a shipping texture.
- **Video with clipped frames** — the useful trick for frame-consistent material: generate a short
  video of a surface or effect, clip frames, and use them as a consistent set rather than generating N
  independent stills that don't match. Specify the clip count and the intended tiling.
- **Provenance is mandatory and machine-checked.** `design/production/schemas/generated-media-manifest.schema.json`
  requires 26 fields including `promptHash`, `seed`, `outputHash`, and `providerTermsRecord`. "The model
  made it" is explicitly not provenance. Write the manifest as part of the prompt packet, not after.

### 2.3 OSS asset sourcing

`docs/OPEN_SOURCE_INTAKE.md` is the contract. Prefer CC0; CC-BY needs lead approval; anything
unclear fails closed. Named-good sources are Poly Haven, ambientCG, Quaternius, and NASA 3D
(reference-only by default). The provenance record is an 11-key YAML and it is not optional.

Assets already brought in this way live under `source/reference/` — **donor material, not runtime.**
An agent sourcing a model should expect to rebuild it, not ship it.

---

## 3. Parallelism — what can and cannot run at once

### 3.1 The mutex reality

The queue declares twelve mutex names, and `scripts/program-dispatch.mjs` **contains zero occurrences
of the word "mutex."** They are metadata that a human is expected to honor. Until dispatch is
mutex-aware (build plan §5.3), treat the mutex list as a manual scheduling constraint and check
`design/program/NOW.md` before dispatching anything.

The contention is heavily concentrated: `physics-authority` appears on 17 of 33 rows, `renderer` on 13,
`browser-gpu` on 11, `save-schema` on 11.

### 3.2 What parallelizes cleanly in this plan

**Safe to fan out — different owners, no shared mutex:**

- Phase 0's document corrections (one agent per document; they touch nothing else)
- Phase 3.5 mining repairs ↔ Phase 3.6 audio ↔ Phase 4.5 trackpad fixes — three different subsystems
- The six §2.5 reversals — each is a different file with a different owner
- Art authoring across different part IDs, **provided** only one holds `assets/ships/blender.LOCK`

**Must be serialized:**

- Anything touching `src/systems/input.js` — one agent at a time, always. It is the most contended file
  in the repository and it is under an explicit ownership rule.
- Phase 2's state layer against anything holding `physics-authority`
- Phase 3's renderer work against Phase 4's pool changes — both hold `renderer`
- Any two tasks that both bump the save version

**Pipeline shape (not fan-out):** the state layer is seam-then-consumers. Land the effect vocabulary,
*then* fan out the individual states. Fanning out first produces four agents each inventing their own
effect kind.

### 3.3 Fan-out that actually pays

The pattern that worked well in producing this plan: **one read-only explorer per domain, running
concurrently, each with a tight question list and an output contract.** Six explorers over sim, render,
combat, input, progression, and process produced findings in one pass that a single agent would have
taken six sequential passes to reach — and crucially, they disagreed with each other in useful ways.

Use it for: pre-admission seam audits, "is this claim still true" sweeps, and adversarial review of a
completed keystone (three reviewers with different lenses beats one reviewer three times).

---

## 4. Where agents get stuck, and how to prevent it

### 4.1 The nondeterministic-probe loop

**The failure:** an agent runs a browser probe, it fails for an environmental reason, the agent tweaks
something unrelated, runs it again, fails again, and burns an hour. Compaction removes its sense of
elapsed time, so it does not notice.

`00_EXECUTION_PROTOCOL.md` already has the right rule — an unchanged failure fingerprint cannot
authorize another identical attempt — but agents need it in their brief, not three documents away.

**Put this in every packet that touches a browser probe:**

> Expensive probes: `check:flight:clean` (~6 min), `check:47a:live-cold-open` (~26 s),
> `check:first-15-runtime` (~33 s), `check:market-first-loop` (~31 s), `check:perf`.
> Budget: at most **two** launches per acceptance cell. If the same failure fingerprint appears twice,
> stop and reduce it to a seconds-scale deterministic regression before any third launch. Report
> `BLOCKED` rather than launching a third time.

### 4.2 The "is the tree already broken" problem

An agent cannot currently answer this cheaply, which is why the preexisting-failure loophole existed.
Two facts every dispatched agent needs up front:

- `npm run check` is a **97-link `&&` chain that reports the first failure and silently skips the
  rest.** It currently dies around link 79, which means every flight, atlas, art, bundle, and
  gate-reachability gate downstream is unreachable. A green `check` run is not evidence of much.
- `npm run check:all:smoke` takes **7m37s**, of which `check:flight:clean` alone is six minutes.

Until a real fast tier exists (build plan Phase 0), a packet must name its own entry commands
explicitly and the agent must run them **before** editing, per the amended Phase A.

### 4.3 Doc-vs-code drift

Five claims in the first draft of the grammar document were falsified by source. This is normal and
expected — the repository has ~60 design documents and code moves faster than prose.

**Rule: before implementing from any design document, verify its `file:line` claims still resolve.**
If a claim has aged, correct the document in the same pass rather than working around it. A design
document that is 80% accurate is more dangerous than one that is obviously stale, because agents trust
the wrong 20%.

### 4.4 The confident-wrong-decision failure

The most expensive failure mode in this repository's history is not an agent that gets stuck. It is an
agent that hits an ambiguous design question, picks an answer, implements it, and writes a test to
protect the answer. Build plan §2.5 is a catalogue of exactly that.

**Rule: an agent that must make a design decision to proceed should stop and ask.** If it cannot stop,
it must record the decision explicitly in its receipt under a `decisionsMade` heading — never silently,
and **never as a new test or check.** New checks are admitted only under the
`docs/POLICY_MANIFEST.md:44-58` test, and taste never qualifies.

---

## 5. Standing constraints for every packet in this plan

Repeat these in each brief. They are the things most likely to be forgotten and most expensive to
retrofit.

1. **Keyboard and trackpad.** No sustained mouse-button holds, no wheel-only affordances, no hover-only
   information, no gestures requiring precision. If the mechanic needs the cursor and the left hand at
   the same time, re-read grammar §7.
2. **Top-down readability.** The camera looks down at 60°. A change that reads well in a perspective
   screenshot and not in the game camera is not done. Use the contact-sheet tool — it extracts the real
   camera.
3. **Physics first.** If a feature can be expressed through existing physical systems instead of a new
   subsystem, express it through physics. If it adds a state, the state must be visible.
4. **The check set is a floor.** Per the amended `00_EXECUTION_PROTOCOL.md` §7, a red check is repaired,
   not inherited. Whether the test or the code is wrong is the agent's call to make and justify.
5. **Do not fossilize taste.** No new source-string scans, palette allowlists, technique counts, or
   "never do X" rules without a cited observed failure. The repository has enough of these already.

---

## 6. Suggested staffing for the plan's phases

| Phase | Context | Model | Vision | Shape |
|---|---|---|---|---|
| 0 — truth and unblocking | small | fast (docs) / frontier (`check:sim:compare` diagnosis) | no | fan-out per document, solo for the sim repair |
| 1 — connect what exists | medium | balanced | no | solo per item; the Massline wiring is one packet |
| 2 — state layer keystone | large | frontier | no | pipeline: seam first, then fan out states |
| 3 — presentation | large | balanced + vision reviewer | **yes** | solo build, fan-out review |
| 3.5 — mining repair | medium | balanced | no | fan-out (three independent repairs) |
| 3.6 — audio | medium | balanced | no | solo |
| 4 — swarm | xlarge | frontier | yes (perf frames) | solo; heavy probe budget |
| 4.5 — HUD + trackpad | large | balanced (frontend-strong) | **yes** | trackpad fixes fan out; arbiter is solo |
| 5 — Rigs | large | frontier | no | serialized on `input.js` |
| 6 — new instruments | large | frontier | yes | pipeline per instrument |
| 7 — economy | medium | frontier | no | solo |

**Review staffing:** for any keystone, use three concurrent reviewers with distinct lenses — one on
correctness, one on determinism/save, one playing the design's advocate asking "does this actually
produce the described player experience." A single reviewer run three times finds the same class of
issue three times.
