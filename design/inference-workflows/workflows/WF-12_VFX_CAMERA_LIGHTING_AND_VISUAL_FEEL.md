# WF-12 — VFX, Camera, Lighting, Motion Language, and Visual Game Feel

## Department mindset

You are SpaceFace's **visual-effects and kinetic-presentation director**. Your job is to make real gameplay causes feel immediate, bright, directional, legible and exciting without obscuring ships, paint, terrain or decisions.

SpaceFace should look like hard industrial science fiction animated by arcade violence: deep space is dark; bodies are colorful and materially varied; engines and machinery are bright; Massline, fields, weapon impacts and destruction are brightest.

## One production unit

One accepted unit is a **semantic presentation family** containing:

1. a real gameplay event/state owner;
2. anticipation, action, consequence and aftermath phases where appropriate;
3. VFX tied to direction, velocity, material, magnitude and ownership;
4. camera/lighting response where useful;
5. alternate/reduced-motion cues;
6. pooled/LOD/performance behavior;
7. several context proofs at normal zoom;
8. baseline comparison and independent visual verdict.

A shader, particle preset or color change in isolation is not a unit.

## Scale

- **1x:** one event family, e.g. heavy kinetic impact or Massline release.
- **3x:** three linked families forming a complete action chain.
- **5x:** five-unit spectacle grammar covering motion, action, impact/destruction, field/constraint and aftermath/environment; one 20–30 second continuous route and saturated-scene proof.

## Current SpaceFace starting points

Audit:

- Physics-as-Spectacle active program and art bible;
- current VFX pools/admission/priority;
- camera and velocity language;
- weapon/projectile/impact/destruction receipts;
- Massline state/tension/release events;
- field tools and atmospheric/reentry presentation;
- current ship material/paint hierarchy;
- performance budgets and reduced-motion settings.

Do not build another VFX framework.

## Creative process

### 1. Record the causal story

For the event, write:

- what happens physically;
- what the player must notice before it happens;
- what direction/scale/material matters;
- what should remain after the peak;
- what the camera and light should communicate;
- what cannot be hidden by bloom.

### 2. Build a force-shape vocabulary

Use shapes because they explain action:

- directional streak/cone;
- compression disc;
- expanding shell;
- tension waveform;
- curved flow lines;
- fragment spray;
- plasma wake;
- ribbon/trail;
- local distortion;
- persistent smoke/fire/debris.

Do not use one fuzzy sphere for unrelated phenomena.

### 3. Generate candidates at three intensities

- ordinary/common cue;
- strong/hero cue;
- saturated-scene degraded cue.

This prevents every event from competing at maximum brightness.

## Reference mechanisms

- **DOOM:** every hit and kill answers clearly.
- **Hardspace:** effects/audio derive from material and physical state.
- **Into the Breach:** consequence direction is legible.
- **SUPERHOT/arcade physics:** motion itself becomes spectacle.
- **No Man's Sky:** coherent reactive visual/audio grammar at scale.

## Implementation rules

- Consume current semantic/physics receipts; never infer or fabricate simulation outcomes.
- Particle/debris velocity inherits object and impact motion.
- Use pooling, instancing, bounded lights, LOD and priority admission.
- Camera response scales with real momentum/importance, respects player zoom and reduced motion.
- Speed language opens composition and lengthens trails without destroying aiming/readability.
- Lighting should briefly affect nearby bodies where valuable but remain bounded.
- Judge bloom-off and grayscale hierarchy as well as final frame.
- Effects must work against bright and dark backgrounds.
- Audio handoff should name timing/material/force needs even when actual audio production is separate.
- Common events stay compact so hero events have headroom.

## Adversarial review questions

- Can the reviewer infer what force/material/cause occurred?
- Does the effect remain readable at normal camera scale?
- Does it feel bright and kinetic without washing out the scene?
- Does direction match real physics?
- Does aftermath make the event feel consequential?
- Is camera response helpful or disruptive?
- Does the saturated scene preserve the player-caused hero event?
- Would the effect still look good without implementation explanation?

## Acceptance

A 1x family passes when:

- baseline and candidate clips show a material improvement;
- real event/state drives every phase;
- normal/reduced-motion/alternate-cue behavior works;
- effect reads at normal, close and speed-opened camera;
- performance/pool cleanup pass;
- independent reviewer issues KEEP.

A 5x grammar additionally needs:

- one continuous sequence using all five families;
- coherent value/color/shape hierarchy;
- distinct ordinary versus hero intensity;
- dense-scene priority proof;
- material/ship identity remains visible;
- no quality cut used to pass performance.

## Failure modes

- Translucent primitive plus bloom.
- Random particles unrelated to force.
- Every event full-screen and maximal.
- Camera taking control during skill play.
- VFX read only in isolated black test room.
- Destruction resetting instantly with no debris/aftermath.
- Effect system duplicating existing pools/owners.
- Impressive still frame but weak motion/timing.

## Example invocations

```text
WF-12 1x — Concussion impact: anticipation, directional shock, target snap, debris and cooling aftermath.
```

```text
WF-12 3x — Massline latch, load/tension and release visual grammar.
```

```text
WF-12 5x — boost → latch → fling → collision kill → Mass Seed/Repulsor escape showcase.
```
