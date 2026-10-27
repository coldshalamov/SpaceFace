# SpaceFace — Strategic Chaos

**Owner-requested foundation and implementation package · 26 October 2026, America/New_York.**
Inspected source: `2f1078e9a3ba54f21064f8163b3fca3476d49182`.

The goal is not an RTS pasted onto a space shooter. It is personally piloted physical play with readable opponents, useful command, information advantages, competing objectives and consequences that survive the explosion. See the situation, form a plan, intervene, improvise, escape or recover, then meet the changed world.

## What is implemented here

A dependency-free authoring/evidence toolchain: validated agent commissions; copy-ready briefs; a bounded adapter invoking the existing five-seed Ceres B12 proof; a fail-closed auditor that distinguishes malformed/incomplete output from a genuine miss; a diagnostic paired-strategy comparator; and an additive, dirty-file-safe build-map installer. Focused tests exercise these real tools. This package does not claim that the thirteen gameplay commissions have been implemented, that an imported report is authentic, or that a passing fixture proves the game is fun.

The source-only ZIP additionally includes the exact additive build-map patch and an overlay installer. The PR retains the same map installer so a host with the live board can apply it without replacing the large concurrently edited file. See [integration](INTEGRATION.md) for the explicit boundary.

## Start here

| Document | Purpose |
|---|---|
| [Program and crosswalk](PROGRAM.md) | Thirteen commissions, dependencies and existing owners |
| [Architecture](ARCHITECTURE.md) | Information, command, physical causality, ownership and performance contracts |
| [Operations](OPERATIONS.md) | Three concrete multi-party situations and distinct strategies |
| [Agent workflow](AGENT_WORKFLOW.md) | Director, implementer, reviewer and integration loops; bounded grunt work |
| [Foundations](FOUNDATIONS.md) | Executable commands, data formats and evidence limits |
| [Integration](INTEGRATION.md) | Safe board insertion, delivery/application and overlap rules |
| [Evidence](EVIDENCE.md) | Inspected source, limitations and repeatable verification |

```sh
node scripts/strategic-chaos.mjs validate
node scripts/strategic-chaos.mjs brief SC-01
node --test test/strategic-chaos-*.test.mjs
```

On the source-only ZIP use `validate --bundle`; its output explicitly says source-path checks were not run. A full checkout is required for `proof`:

```sh
node scripts/strategic-chaos.mjs proof
```

That command invokes the existing `runProofSixtySecondsSuite()` with its defaults. It does not inject a new system, tape, teleport or successful result. The existing B12 producer is the evidence owner. A strategic-play, ordinary-route, visual or performance claim still needs its own evidence through existing repo workflows.

## Scope discipline

`build_map.md` remains the dispatch authority. SC-01 through SC-13 are document labels, not new global queue IDs. Current status and claims stay on existing boards. Extend the existing `spaceface.simScenario.v1` lab for generic scenarios; `spaceface.scenarioContract.v1` is a separate Campaign 47-A contract and remains untouched. Extend existing tactical AI, wingmen, law, cargo, economy, memory and presentation owners; do not duplicate them.

No new dependencies, altered save schema, gameplay defaults, physics rules, renderer, deployment, paid-agent launch or automatic merge is included. Source and component checks are not a replacement for observed play. The first product milestone is one reliably interesting encounter, not a count of added systems.
