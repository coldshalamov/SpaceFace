# Agent policy manifest

This file identifies which repository surfaces may direct an agent. It is a routing map, not another
design bible. If a rule-bearing file is not activated by the task or by directory scope, it is context,
not authority.

## Classes

| Class | Meaning | Examples | Activation |
|---|---|---|---|
| `ACTIVE_AUTOMATIC` | Instructions automatically inherited from the working directory | root and nested `AGENTS.md` | Always for files in scope |
| `ACTIVE_MANUAL` | Current contracts or plans selected for a task | `ARCHITECTURE.md`, `design/GDD_2_0.md`, `design/program/`, an activated spec | Only when root routing or the task points to it |
| `MACHINE_ENFORCED` | Executable checks and schemas | `package.json`, `scripts/check-*.mjs`, tests, schemas, manifests | The checks relevant to the changed seam |
| `HISTORICAL` | Evidence or superseded decisions | `design/_ARCHIVE/`, `docs/handoffs/`, old reviews, superseded ADRs | Never implementation authority unless explicitly requested for archaeology |
| `IGNORED_RESIDUE` | Local tool state, transcripts, generated builds, screenshots, scratch | `.campaign/`, `.zcode/`, `.serena/`, `terminals/`, `.devshots/`, `build/`, scratch trees | Never authority; inspect only for a named forensic need |

## Conflict order

1. User direction for the current task.
2. `ARCHITECTURE.md` for technical invariants.
3. `design/GDD_2_0.md` for product intent.
4. `design/program/` for current status and admitted work.
5. The specific activated spec or plan.
6. Supporting references.

Live code, current check output, and player-route evidence determine whether descriptive claims are
still true. A lower item cannot impose a palette, layout recipe, asset ceiling, process quota, or
ownership prohibition that contradicts a higher item.

## Rule admission test

Keep an automatic or machine rule only when it protects at least one of:

- determinism, save compatibility, data ownership, or security;
- accessibility or input reachability;
- licensing, provenance, or reproducible asset production;
- a demonstrated runtime/performance invariant without lowering visual quality;
- a player-facing behavior proven by current evidence.

Remove or demote rules whose main effect is prescribing taste, effort, or organizational ceremony:
fixed palettes, blur bans, triangle/texture ceilings, technique counts, deficiency quotas, iteration
floors, self-scores, report-only completion, permanent lane restrictions, and source-pattern checks
that do not prove player behavior.

## Family map

| Surface | Class | Purpose | Important limitation |
|---|---|---|---|
| Root and nested `AGENTS.md` | `ACTIVE_AUTOMATIC` | Concise routing, hazards, ownership, verification | Must not duplicate volatile status or design recipes |
| `ARCHITECTURE.md` | `ACTIVE_MANUAL` | Engine and data contracts | Not a visual-style guide |
| `design/GDD_2_0.md` | `ACTIVE_MANUAL` | Product pillars and intended experience | Technique follows evidence |
| `design/program/` | `ACTIVE_MANUAL` | Done/open/acceptance/resume truth | Single global status surface |
| `design/vision/`, `design/depth-program/`, `design/spec2/`, `design/spec3/`, `design/revamp/`, `design/graphics-sprints/` | `ACTIVE_MANUAL` | Task-specific detail and retained ideas | Read only the activated slice; old tokens and process rituals are non-binding |
| `design/production/` | `ACTIVE_MANUAL` | Optional production-controller workflow | Applies only when a production campaign is explicitly activated; ordinary agents implement directly |
| `.grok/skills/` | `ACTIVE_MANUAL` | Tool-specific Blender technique help | Technique suggestions are optional; quality is judged in game |
| `scripts/check-*.mjs`, tests, schemas | `MACHINE_ENFORCED` | Executable contracts | Checks must test behavior/contracts, not freeze an aesthetic recipe |
| Asset manifests and release metadata | `MACHINE_ENFORCED` | Exact asset identity, status, provenance, reachability | Exact IDs outrank prose inventories |
| `design/_ARCHIVE/`, `docs/handoffs/`, reviews | `HISTORICAL` | Decision and integration history | Never current status |
| `.campaign/` | `IGNORED_RESIDUE` | Local dispatch/result state | Never start an agent in a captured workspace; full snapshots stay outside the repo |
| `.zcode/`, `.serena/`, terminals, agent-tools, advisor-artifacts | `IGNORED_RESIDUE` | Tool/session memory and transcripts | May contain stale task-local prohibitions |
| `.devshots/` | `IGNORED_RESIDUE` | Visual evidence | A referenced capture can prove a claim; surrounding files do not define policy |
| `build/`, `dist/`, scratch and temporary trees | `IGNORED_RESIDUE` | Generated or disposable output | Never search by default or edit as source |

## Maintenance

- Put global status only in `design/program/`.
- Put volatile inventories in generated indexes, manifests, or report commands.
- Prefer links over copied rules.
- A nested `AGENTS.md` earns its place only at a real ownership, technology, or risk boundary.
- When an automatic rule conflicts with live truth, fix or delete it in the same change.
