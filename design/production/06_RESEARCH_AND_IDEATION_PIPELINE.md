# 06 — Multi-Agent Research and Ideation Pipeline

> **Optional campaign workflow.** This pipeline applies only when explicitly activated for a named
> research packet. It does not require ordinary implementation work to stop at a report or defer
> integration that is already within the task's scope.

**Status:** DRAFT

## Purpose

Use the complementary creativity, planning, visual reasoning, code understanding, and tool access of
multiple models without turning their suggestions into an incoherent pile or letting consensus replace proof.

## 1. Research cell

For a major feature, visual family, or product decision, dispatch independent lenses before synthesis:

| Lens | Default candidate | Question |
|---|---|---|
| Product/game director | Claude Fable 5 max + Codex | What player fantasy and complete experience are required? |
| Systems/architecture | Codex/subagents | What live foundations, authorities, constraints, and migration paths exist? |
| Visual/art director | Claude Fable 5 or OpenCode Kimi | What form, motion, material, composition, and UI language are missing? |
| Production/asset specialist | Grok 4.5 + Blender research tools | Which techniques and pipeline artifacts can produce it? |
| Adversarial skeptic | fresh cross-model reviewer | How will the proposal fail, drift, clone peers, or be reward-hacked? |
| Player/market research | research agent | What do players praise/criticize and which observable patterns matter? |

Agents work independently before seeing other proposals. Raw outputs are inputs, not decisions.

## 2. Source discipline

- Open-source games: inspect actual code, data, tooling, licenses, and playable behavior.
- Commercial games: describe observable player-facing behavior, reviews, talks, and media; do not
  invent internal architecture.
- Blender/tutorial research: capture transcript/source, problem solved, method, prerequisites,
  export survival, runtime cost, and failure modes.
- Never copy proprietary assets or distinctive designs. Extract principles and adapt them to
  SpaceFace's pillars and constraints.

## 3. Synthesis

Codex produces a contradiction matrix:

`proposal · evidence · player value · reuse fit · cost · risk · originality · testability · verdict`

The synthesis must name what was rejected and why. Chosen ideas become one experience contract and
one implementation/asset packet; agents do not independently implement conflicting proposals.

## 4. Research-to-technique cards

Tutorials and successful experiments become technique cards in the asset library only after a proof asset:

```text
id
visual/functional problem solved
eligible asset profiles
trigger condition
procedure and prerequisites
Blender/source artifacts
GLB/Three.js survival
runtime/performance cost
required evidence
known failure modes
sources/provenance
proof asset and verdict
```

This allows the user to request professional results without first learning every Blender term.

## 5. Ideation bake-off

For image generation, asset concepts, UI alternatives, or motion references, give each available
generator the same bounded brief and evaluate downstream usefulness:

- faithfulness to constraints and palette;
- consistency across a family;
- editability and clean separation/masks;
- absence of baked text/watermark/artifacts;
- value as Blender/UI/VFX input;
- provenance and disclosure readiness;
- human cleanup required.

Do not promote the prettiest isolated image if it cannot be used in the production pipeline.
Every generated output follows `09_GENERATED_MEDIA_PIPELINE.md` and its provenance manifest; this
research lane cannot promote a concept directly into runtime assets.

## 6. Exit

Research ends when it has changed a contract, technique card, priority, or rejection decision. A
large transcript with no production consequence is not progress.
