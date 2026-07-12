# 07 — Operational Professional-Quality Standard

**Status:** DRAFT

## 1. Meaning of the target

“A professional $30 Steam game” is a product ambition, not a self-certifying requirement. For
SpaceFace it means that the accepted core route has no weakest-link break in control, readability,
balance, pacing, visual cohesion, audio/feedback, content variety, or operational reliability. A
large amount of shallow content does not compensate for one visibly unfinished core interaction.

Quality is established by comparative evidence on real player routes. It is never established by
iteration count, file size, feature count, technique count, a weighted average, or an author's
opinion that the result feels professional.

## 2. Acceptance card for every player surface

Every major feature, encounter, screen, asset family, or milestone compiles an acceptance card that
validates against `design/production/schemas/quality-acceptance-card.schema.json`:

1. Player promise and intended emotion or decision.
2. Canonical public route and representative/held-out seeds.
3. Two or more actual admired screenshots/clips for specific qualities, plus an actual failure
   example; all are hash-bound, provenance-recorded, and attached to every worker/reviewer context.
4. SpaceFace-specific identity constraints; reference use never means imitation.
5. Critical moments and observable setup → action → consequence chain.
6. Objective hard gates and subjective review dimensions.
7. Required video, incident, runtime, asset, performance, and accessibility evidence.
8. Critical/major/minor defect definitions and the rejection owner.
9. Accepted benchmark hash once the first exemplar passes.

Pure control-plane packets use the same schema in `control_plane` mode: at least two hash-bound good
controls and one hostile/failure fixture replace visual media. This is a packet-appropriate external
standard, not a reference-free exemption.

The accepted benchmark is the family floor. Later variants are compared to it and may not lower
craft, readability, runtime behavior, or evidence completeness merely to increase output volume.

## 3. Quality dimensions

| Dimension | Required question | Typical proof |
|---|---|---|
| Promise/readability | Can a new player understand what is happening and why it matters? | novice route, incident clips, cue/action/consequence alignment |
| Control/feel | Does input create intentional, responsive, learnable motion and impact? | input tape, state timeline, headed replay, frame pacing |
| Counterplay/balance | Is danger telegraphed with enough information and reaction opportunity? | warning→hit→death reconstruction, policy cohorts, held-out fights |
| Depth/pacing | Do decisions and states evolve before repetition becomes monotonous? | activity fingerprints, choice intervals, progression/reward cadence |
| Visual craft/cohesion | Do form, material, lighting, motion, UI, and VFX share an intentional language? | blind reference comparison, game-camera video, held-out angles |
| Audio/feedback | Does every important event have proportionate, non-fatiguing feedback? | synchronized audio/event review, mix and repetition analysis |
| World/content variety | Is space dense and varied enough without random incoherence? | exposure distributions, travel-to-action ratio, family/repetition audit |
| Product reliability | Does the same quality survive save/load, browser/Electron, settings, and load? | public-route checks, soaks, migration, accessibility and performance gates |

These dimensions diagnose defects; they are not averaged into a completion score.

## 4. Defect classes

- **Critical (P0):** prevents or corrupts the route, violates an authority/safety contract, uses a
  fallback presented as final, destroys determinism/save truth, or makes the experience unusable.
- **Major (P1):** a normal player will notice a broken promise: confusing hostility, unfair death,
  unreadable interaction, jarring or clearly unfinished art, severe repetition, major hitch, missing
  consequence, or materially false UI.
- **Minor (P2):** localized craft or polish debt that does not break comprehension or the promise.

Acceptance requires zero unresolved P0/P1 defects. A disputed P0/P1 remains blocking until fresh
evidence or adjudication resolves it; majority voting cannot silently erase a concrete defect.

## 5. Independent review protocol

1. Technical/runtime evidence passes before taste review.
2. Two fresh critics from different model families independently review a hash-bound blind packet.
3. They do not see author identity, self-score, cycle count, or claimed completion.
4. Agreement on `PASS` advances the candidate to orchestrator acceptance.
5. Any concrete P0/P1 or split verdict triggers a fresh adjudicator with the disputed evidence.
6. The author receives defect IDs and evidence, never a vague “make it better” instruction.
7. User taste feedback overrides model consensus and becomes a versioned benchmark decision.

Until the capability bake-off calibrates reviewers, all passes are provisional and the conservative
verdict wins. Review quorum is a defense layer, not proof that subjective taste is fully automated.

## 6. Milestone saturation

When the known cards pass, adversarial agents search for omitted surfaces, weak transitions, and
held-out failures. A milestone exits only after its coverage ledger is L7, its route has no P0/P1,
and the exact consecutive clean-wave floor in `01_BUILD_PROGRAM.md` finds no new category-level
omission. “Everything named was touched” is the start of saturation testing, not the end.
