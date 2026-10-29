<!-- LIFETIME: STABLE -->
# Policy and document map

This page identifies document roles; it does not create extra rules. Root [`AGENTS.md`](../AGENTS.md)
is the concise operating front door. Current Finish assignments and completion criteria are in
[`design/program/finish/README.md`](../design/program/finish/README.md) and the active lane boards.
For the authority order and shared-checkout contract, follow those sources rather than repeating
their text here.

## Roles

| Role | Examples | How to use |
|---|---|---|
| Inherited instructions | Root and nested `AGENTS.md` | Apply to the task and paths in scope. Root summarizes navigation and shared-tree safety; nested files describe local ownership/contracts. |
| Current program or selected design | Finish README and lane boards; activated packet/spec; `ARCHITECTURE.md`, `VISION.md`, `GDD_2_0.md` | Read the relevant section. The Finish program directs current completion work; architecture and product docs supply technical and product intent. |
| Executable contract | Tests, schemas, manifests, checks | Run the relevant check for the behavior or artifact being changed. These constrain behavior; they do not prescribe unrelated process. |
| Generated index | `docs/SYSTEM_REGISTRY.md`, `docs/EVENT_ROUTING.md` | Use for navigation and regenerate from the owning source; do not hand-edit as authority. |
| Current status | Finish lane boards and `design/program/NOW.md` | Boards carry current task order/status. `NOW.md` and checkpoint tools help resolve exact live path overlap; neither creates broad subsystem ownership. |
| Historical evidence | Archived plans, old reviews, handoffs, receipts, completed-work records | Use when the active task needs historical context. They do not dispatch work or override current direction. |
| Local/generated residue | Captures, transcripts, build output, scratch and tool state | Inspect only for a named task or diagnostic need; never treat as policy or source authority. |

## Conflict handling

Follow current user direction, then the repository's technical contracts and product intent, then
the active Finish program/task specification, then supporting references. A historical document
does not regain authority because it contains imperative wording. Live source and relevant behavior
checks establish whether descriptive claims are currently true.

When a stale instruction would send an agent to the wrong owner or cause unnecessary work, correct
the specific navigation text. Do not copy a full rule set into multiple documents; link to the owner.

## Lifetimes

Control documents may identify themselves as stable routing, active packets, generated indexes, or
historical evidence. A stable navigation page should not copy live status. A generated index follows
its source. An archived packet records what was true for its work; it is not a current assignment
unless the Finish program explicitly selects it.

For changes to this control surface, run `node scripts/check-program-docs.mjs` and check the links
you changed.
