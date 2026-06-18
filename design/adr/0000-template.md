# ADR-NNNN: <short decision title>

- **Status:** Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
- **Date:** YYYY-MM-DD
- **Deciders:** <who made the call>
- **Tags:** <e.g. engine, persistence, ui, build>

> **What an ADR is.** A short, immutable record of *one* architecturally significant decision: the
> context that forced a choice, the options weighed, the option taken, and the consequences accepted.
> ADRs are append-only — you do not edit a decision after it's Accepted; you write a new ADR that
> **Supersedes** it. This keeps the *reasoning* discoverable months later, so the next person doesn't
> re-litigate a settled call (or worse, silently undo it).
>
> **When to write one.** Anything expensive to reverse: stack/runtime choices, persistence format,
> the simulation model, a cross-system contract, a build/packaging decision. Not for routine code.

---

## Context

What forces a decision *now*? The problem, the constraints (perf, team size, zero-build mandate,
browser limits, Steam target), and any prior ADRs or design docs that bound the space. State the
forces honestly — including the ones pulling the other way.

## Decision

The single choice, stated plainly in active voice: *"We will …"*. Be specific enough that someone
could implement from this line alone. If the decision freezes numbers or names, list them.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| A (chosen) | | | **Chosen** |
| B | | | Rejected — <why> |
| C | | | Rejected — <why> |

## Consequences

- **Positive:** what this buys us.
- **Negative / costs:** what we pay, and what we now *can't* easily do.
- **Risks / follow-ups:** what must be watched or tested because of this (link QA/playtest rows).
- **Reversal cost:** how hard is it to undo if we're wrong?

## References

- Source rationale (ARCHITECTURE.md §, V2_MASTER_PLAN.md PART/§, spec file).
- Related ADRs (supersedes / superseded-by / depends-on).
