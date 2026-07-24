<!-- LIFETIME: STABLE -->
# Agent policy manifest

This file identifies which repository surfaces may direct an agent. It is a routing map, not another design bible. A file can be informative without being authoritative.

## Policy classes

| Class | Meaning | Examples | Activation |
|---|---|---|---|
| `ACTIVE_AUTOMATIC` | inherited instructions at a real scope boundary | root/nested `AGENTS.md` | automatically for paths in scope |
| `ACTIVE_MANUAL` | current contract or selected plan | `ARCHITECTURE.md`, `GDD_2_0.md`, active packet | only when root routing or the task selects it |
| `MACHINE_ENFORCED` | executable behavioral/structural contract | tests, schemas, validation manifests, focused checks | when relevant to changed seams |
| `GENERATED` | index derived from live source | `EVENT_ROUTING.md`, `SYSTEM_REGISTRY.md` | reference only; regenerate from owner |
| `HISTORICAL` | evidence or superseded decision | `docs/handoffs/`, old reviews, archived plans | archaeology only unless explicitly reactivated |
| `IGNORED_RESIDUE` | local tool state, captures, transcripts, builds, scratch | `.campaign/`, `.zcode/`, `.serena/`, `.devshots/`, `build/` | never authority; inspect for a named forensic need |

## Document lifetimes

Control documents declare one of these markers:

- `LIFETIME: STABLE` — durable routing/contracts; no live branch, lease, snapshot, or completion facts.
- `LIFETIME: VOLATILE` — current state with refresh base and expiry; no historical narrative.
- `LIFETIME: ACTIVE_PACKET` — one admitted packet; retired or replaced when integrated or materially replanned.
- `LIFETIME: GENERATED` — derived from code; never hand-edited as source.
- `LIFETIME: HISTORICAL` — evidence that cannot dispatch work.

When a stable file needs a current fact, link the volatile source. When a volatile fact becomes durable evidence, move it to a receipt rather than growing the lease board forever.

## Conflict order

1. Current user direction.
2. Live code, current check output, and player-route evidence.
3. `ARCHITECTURE.md` for technical invariants.
4. `design/GDD_2_0.md` for product intent.
5. `design/program/` for admitted work and status.
6. The selected active packet.
7. Supporting references.
8. Historical material.

A lower item cannot impose a palette, layout recipe, asset ceiling, implementation quota, process ritual, or ownership prohibition that contradicts a higher item.

## Rule admission test

An automatic rule or machine check earns repository authority only when it protects at least one of:

- determinism, save compatibility, state ownership, or security;
- accessibility or input reachability;
- licensing, provenance, or reproducible asset production;
- a demonstrated performance invariant without lowering authored quality;
- a player-facing behavior proven by current evidence.

It must also identify the failure it prevents and the owner it constrains. Prefer a behavioral regression over source-string policing.

Do not admit rules whose main effect is prescribing taste, effort, or ceremony: fixed palettes, blur bans, universal layout recipes, triangle/texture prestige numbers, technique counts, review quotas beyond the finite protocol, self-scores, permanent lane restrictions, exact effect/module counts, CSS-property bans, or a worker agent's preferred implementation style.

A packet may choose an art direction or technique for one outcome. That local decision does not become global policy unless the admission test is independently satisfied.

## Family map

| Surface | Class | Purpose | Limitation |
|---|---|---|---|
| root/nested `AGENTS.md` | `ACTIVE_AUTOMATIC` | concise routing, hazards, ownership, verification | no volatile status or design recipes |
| `ARCHITECTURE.md` | `ACTIVE_MANUAL` | engine/data contracts | not a visual-style guide; reconcile descriptive details with code |
| `design/GDD_2_0.md` | `ACTIVE_MANUAL` | product pillars | technique follows evidence |
| `design/program/` | mixed | global status, active packets, receipts | each file obeys its lifetime marker |
| `design/vision/`, `depth-program/`, `spec2/`, `spec3/`, `revamp/`, `graphics-sprints/` | `ACTIVE_MANUAL` | task-specific intent | read only the activated slice |
| scripts/tests/schemas/manifests | `MACHINE_ENFORCED` | executable contracts | prove behavior/contracts, not taste |
| asset manifests/release metadata | `MACHINE_ENFORCED` | exact identity/provenance/reachability | exact IDs outrank prose inventories |
| handoffs/reviews/archives | `HISTORICAL` | decision and integration history | never current status |
| captures/tool state/build output | `IGNORED_RESIDUE` | evidence or disposable output | no default search or policy authority |

## Maintenance

- Put global status only in `design/program/`.
- Put volatile inventories in `NOW.md`, generated indexes, or report commands.
- Prefer links over copied rules.
- A nested `AGENTS.md` earns its place only at a real ownership, technology, or risk boundary.
- When an automatic rule conflicts with live truth, fix or delete it in the same change.
- Run `node scripts/check-program-docs.mjs` after changing the control surface.
