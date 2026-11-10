# 05 — Agent Capability Matrix and Bake-Off

> **Manual scheduling reference.** Use only in an explicitly activated multi-agent campaign.
> Capability labels are routing hypotheses, not permanent prohibitions; assign by the live task,
> available tools, and demonstrated results, then independently review consequential work.

**Status:** PROVISIONAL — user experience plus current local-tool inspection; must be benchmarked

## 1. Current candidate roles

| Agent/model | Reported strengths | Tools/limits | Initial production role |
|---|---|---|---|
| Codex | repo grounding, architecture, synthesis, verification, subagents, available image generation | strong local orchestration; generated asset usefulness still needs bake-off | product director, scheduler, integrator, final acceptance owner, bounded concept/2D candidates |
| Claude Code / `claude-fable-5`, max effort | exceptional frontend, 3D/game design, planning, general implementation | verified CLI support; usage more limited than Grok | default high-leverage co-director, architecture, creative direction, any difficult implementation, independent critic |
| Grok CLI / grok-4.5 | high capability and effectively large usage; local Blender MCP verified; user reports image/video generation | image/video generation is not exposed by the currently verified CLI/plugin surface; one Blender session; prone to self-satisfying broad goals | persistent asset author after gates, research/ideation variants, large bounded implementation campaigns |
| OpenCode npm 1.17.13 / `opencode-go/kimi-k2.7-code` | strong visual reasoning and code, useful frontend | pin npm executable because PATH is stale 1.14.33; quality/balance still require bake-off | visual implementation, screenshot critic, bounded code lane |
| agy 1.1.1 | decent one-shot frontend; user reports image generation | small usage allowance; image path unverified; explicit conversation IDs required for resume | small isolated overflow tasks and targeted alternatives |
| Codex subagents | strong analysis/code/review | same workspace/concurrency constraints | repo audits, bounded implementation, independent verification |

No role is permanent merely because the table says so. The bake-off decides.

## 2. Required phased bake-off

Agents never see each other's output before verdict. CAP-000 is read-only and can run now. Mutating
bake-offs use the sole relevant lease and controller-supervised integration under the current SAFE
waiver; no worker self-integrates.

1. **CAP-000 — capability smoke:** exact versions, model/variant availability, session-ID capture,
   resume/continue, cancellation, structured output, vision attachments, Blender MCP, and image/video tools.
2. **CAP-001 — code/product:** planning/synthesis, one bounded real frontend screen, and one bounded
   live gameplay behavior with determinism/observatory evidence. Models run serially in isolated
   candidate workspaces.
3. **CAP-002 — 3D:** blind art-direction critique followed by one representative Blender
   source→maps→GLB→runtime candidate under the exclusive Blender lease.
4. **CAP-003 — generated media:** concept, trim/mask/decal, icon/portrait, and motion-reference tasks
   judged for provenance and downstream usability.
5. **Cross-phase review:** find seeded/unseeded defects in clips/contact sheets and measure whether
   each model reports failure honestly.

Record quality, defect discovery, completion honesty, tool use, iterations to acceptance, human cleanup,
and cost/usage. Do not rank on self-reported success or first-pass speed.

## 3. Routing policy

- Use the strongest agent for the highest-leverage uncertain decision, not only for code volume.
- Treat Fable 5 as a general high-leverage planner/implementer/critic rather than restricting it to
  frontend work; route by value and available usage.
- Use Grok's capacity for repeated bounded execution, but keep acceptance external.
- Use cross-model ideation when the design space matters; synthesize into one contract before writing.
- Do not ask multiple agents to edit the same hot files or share Blender.
- When a model repeatedly fails a defect class, reroute that class and update this matrix with evidence.

## 4. Open verification items

- Claude image-generation path and practical usage allowance.
- OpenCode Kimi screenshot/vision behavior and best reasoning variant.
- agy image tooling and practical allowance.
- Practical continuation/session-ID capture in each agent's structured-output mode.
- Comparative quality of each image generator for concept, texture/mask, icon, portrait, and reference video.

## 5. Invocation law

The locally verified CLI surfaces are recorded in `02_ORCHESTRATOR_SPEC.md`. Its persistent recipes
are target commands for the future transactional runner; this matrix never authorizes worker self-
integration. The current controller waiver permits only exclusive-lane authoring plus targeted,
supervised integration. `$validatedVariant` and model routes are populated only by CAP-000.
Read-only critics receive write-deny/plan-mode restrictions. Auto-approval or permission bypass is
allowed only inside a proven write boundary, never as a convenience flag in the dirty live tree.
