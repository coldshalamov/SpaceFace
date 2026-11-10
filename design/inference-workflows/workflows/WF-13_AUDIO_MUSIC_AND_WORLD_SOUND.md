# WF-13 — Audio, Music, Machinery, and Physical Sound Language

## Department mindset

You are SpaceFace's **audio and soundscape director**. Your job is to create a coherent sonic language for force, material, machinery, occupation, danger, place and speed. Do not generate a few code-synth tones and call the game scored.

The game is top-down, visually dense and physics-led. Audio must help the player identify what happened, where, how hard, to what material, and whether a situation is ordinary work, threat, failure or spectacle.

## One production unit

One accepted unit is a **semantic audio family** containing:

1. a gameplay/state source and event matrix;
2. a designed sound palette with provenance;
3. useful variation and anti-repetition;
4. spatial/distance/occlusion or transmission rules where relevant;
5. mix priority and voice limits;
6. integration with VFX/camera/action timing;
7. accessibility and settings behavior;
8. normal-route mix proof.

A single sound file, synthesized beep or music loop is not a unit.

## Scale

- **1x:** one complete audio family, such as Massline or mining machinery.
- **3x:** three linked families forming one activity/combat/place soundscape.
- **5x:** five-unit audio tranche spanning player action, world work, combat consequence, sector ambience and adaptive musical/tonal layer.

## Current SpaceFace starting points

Audit through the current module/event maps:

- existing audio manager/events/catalogs;
- weapon, Massline, boost, mining, UI and station cues;
- current generated/procedural audio assets and their weaknesses;
- sector/traffic/job state that can drive ambience;
- Physics-as-Spectacle cue timing;
- settings, loudness, accessibility and Browser/Electron behavior;
- asset/provenance/licensing rules.

## Creative process

### 1. Define the sonic metaphor

For each action/place answer:

- What is physically vibrating or transmitting energy?
- Is the player hearing hull conduction, radio, machinery, field modulation or cinematic abstraction?
- What communicates mass, tension, heat, speed or material?
- What frequencies belong to this role without masking essential cues?
- What remains after the transient?

SpaceFace may take artistic liberties, but the rules should be consistent.

### 2. Build layers

A strong cue often has:

- anticipation/charge;
- core transient;
- body/material resonance;
- mechanical/field texture;
- spatial tail;
- aftermath/state loop.

Not every cue needs all layers.

### 3. Generate candidates across source methods

- recorded/foley source;
- licensed or generated asset with provenance;
- physically informed procedural layer;
- granular/spectral processing;
- designed synthesis for explicitly artificial fields;
- hybrid composed cue.

Reject “all synth because code can make it.”

### 4. Build sector sound identity

Define:

- bed/room tone;
- recurring work sounds;
- route/traffic presence;
- faction/civic signals;
- hazard/anomaly sound;
- quiet-space contrast;
- musical or tonal palette;
- transitions between pockets.

## Reference mechanisms

- **Hardspace: Shipbreaker:** strict physical transmission rules create distinctive sound.
- **No Man's Sky:** reactive music/audio emerges from composed source material and game state.
- **Subnautica:** region identity and danger are carried strongly by ambience and creature/machinery sound.
- **DOOM:** action cues have clear timing, weight and mix priority.
- **FTL:** compact musical identity supports place and pressure without overwhelming play.

## Implementation rules

- Audio consumes semantic events and current state; it never owns gameplay truth.
- Use real production assets or high-quality hybrid design; placeholder synthesis cannot pass final review.
- Vary pitch/timbre/layer selection within authored bounds, not uncontrolled randomness.
- Set voice limits, ducking and priority so essential Massline/impact/danger cues survive density.
- Tie force/material classes to sound families.
- World work should create readable ambience without becoming constant noise.
- Sector silence can be intentional and dramatic.
- Adaptive music needs authored stems/rules and a small state model; do not build a generative-composer science project.
- Provide reduced-intensity/volume controls, subtitles/visual equivalents for essential signals and mono/stereo checks.
- Test speakers/headphones and Browser/Electron output.

## Adversarial review questions

- Could the reviewer distinguish Massline load, boost, impact materials and nearby work without looking?
- Does the mix clarify or clutter the scene?
- Does repetition become obvious within five minutes?
- Does sound match actual timing and force?
- Is sector identity stronger?
- Are cues professional assets or obvious synth placeholders?
- Do critical cues survive dense combat?
- Is quiet used effectively?

## Acceptance

A 1x family passes when:

- event matrix and assets are complete;
- variation survives a repeated-use test;
- mix remains readable in ordinary play;
- VFX/action sync is correct;
- settings/accessibility/provenance pass;
- cold reviewer issues KEEP from audio-plus-video evidence.

A 5x tranche additionally needs:

- coherent shared sonic world;
- distinct sector/activity/combat layers;
- no masking under dense play;
- smooth transitions;
- at least one memorable sonic identity tied to SpaceFace's physics;
- representative CPU/memory/voice budget.

## Failure modes

- Code-generated sine/saw tones presented as final audio.
- One sound per action with no variation.
- Music trying to tell the story instead of gameplay.
- Constant ambience leaving no contrast.
- Effects louder rather than more legible.
- Audio not tied to actual force/material/state.
- Copyright/provenance ignored.

## Example invocations

```text
WF-13 1x — Massline audio family: latch, pay-out/reel, tension load, release and engineered break.
```

```text
WF-13 3x — Ceres mining, cargo transfer and repair-work sound ecology.
```

```text
WF-13 5x — Ceres complete soundscape: traffic/work, Massline, combat consequence, Cathedral ambience and adaptive pressure layer.
```
