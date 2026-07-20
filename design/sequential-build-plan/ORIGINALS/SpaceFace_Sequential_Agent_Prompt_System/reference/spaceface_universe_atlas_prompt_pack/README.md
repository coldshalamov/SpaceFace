# SpaceFace — Universe Atlas and Physical Travel Agent Prompt Pack

This pack is designed for Claude Opus 4.8 doing long-horizon agentic engineering in Claude Code, the Claude Agent SDK, or a comparable coding harness.

The prompts use XML lightly: tags separate major kinds of information, while normal Markdown carries the substance. Do not wrap every bullet or sentence in a tag.

## Recommended model configuration

- Model: `claude-opus-4-8`
- Thinking: adaptive
- Effort: `xhigh` for coding, architecture, and difficult investigation
- Starting output budget: 64k tokens for long autonomous runs; tune to your harness
- Do not set non-default `temperature`, `top_p`, or `top_k`

## How to use the pack

1. Save `00_COMMON_CONTEXT.md` in the repository, preferably under an existing authoritative planning directory. Do not create a duplicate if the repository already has an equivalent program brief.
2. Prepend or attach that common context to every worker prompt. Separate Claude Code sessions and agent-team teammates do not inherit the lead's conversation history.
3. Run `01_PROGRAM_LEAD.md` first. The lead must establish evidence, interfaces, ownership, and dependency order before broad implementation begins.
4. Give each implementation agent an isolated branch or worktree. One agent owns each file at a time.
5. Use `12_CONTINUATION_PROMPT.md` for later sessions so each agent resumes from repository state rather than conversational memory.

## Recommended dispatch order

### Wave 0 — read-only orientation and evidence

Run three agents in parallel:

- `01_PROGRAM_LEAD.md`
- `02_EVIDENCE_BASELINE.md`
- `03_PRODUCT_RESEARCH.md`

The lead synthesizes their results into one authoritative feature ledger, contract set, and ownership map.

### Wave 1 — independent foundations

Run these in separate worktrees after the lead defines interfaces:

- `04_ATLAS_SPATIAL_TRUTH.md`
- `07_PROPULSION_TRAVEL_BURN.md`

These workstreams should be able to proceed mostly independently.

### Wave 2 — dependent player-facing systems

Run no more than three or four at once, with explicit file ownership:

- `05_MAP_EXPERIENCE.md`
- `06_NAVIGATION_ROUTE_EXECUTOR.md`
- `08_VFX_RCS_ENVIRONMENT.md`

The Map agent consumes Atlas and Navigation contracts. The Navigation agent consumes Atlas and Propulsion contracts. The VFX agent consumes Propulsion telemetry and Atlas environmental volumes.

### Wave 3 — world richness and authoring

- `09_PHYSICAL_LANES_TRAVEL_ECOLOGY.md`
- `10_CONTENT_PIPELINE_HOLOGRAPHS.md`

These depend on the earlier contracts. Prototype one end-to-end corridor and one end-to-end content registration path before generalizing.

### Wave 4 — independent integration gate

- `11_INTEGRATION_EVALS.md`

The verifier should remain independent of the agents whose work it grades.

## Why the work is separated this way

The project contains one product program but several different engineering systems:

- Spatial truth and content identity
- Map camera, rendering, and information architecture
- Mission and route semantics
- Runtime route execution
- Propulsion and control modes
- VFX and ship actuator presentation
- Physical travel infrastructure and encounter ecology
- Content authoring and asset generation
- End-to-end verification

These systems must share explicit contracts, but they should not be allowed to blur into one giant branch or one giant prompt.

## Suggested persistent program artifacts

Use existing files if they already serve these purposes. Otherwise the Program Lead may create a compact set such as:

- `universe_atlas_features.json` — end-to-end requirements with `unverified`, `failing`, or `passing` status
- `universe_atlas_progress.md` — concise session-to-session progress and current blockers
- `universe_atlas_decisions.md` — accepted architectural decisions and rejected alternatives
- `universe_atlas_interfaces.md` — cross-workstream schemas and runtime contracts

Do not proliferate planning files. Four authoritative artifacts are better than twenty half-overlapping plans.

## Optional agent-team launch prompt

Use this only after the repository is in a safe state and the worktrees or file boundaries are clear:

```text
Use an agent team for this program. Start with three or four teammates, not a swarm.
Give each teammate the shared context in 00_COMMON_CONTEXT.md plus one focused task prompt.
Teammates do not share file ownership. They may communicate about interface questions, but only the named owner edits a given file.
Start with read-only investigation and plan approval. Do not begin broad implementation until the lead has produced a verified evidence matrix, dependency graph, and ownership table.
Wait for teammates to finish their assigned investigations before synthesizing or implementing their work yourself.
```
