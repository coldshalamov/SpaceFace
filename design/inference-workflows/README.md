<!-- LIFETIME: STABLE -->
# SpaceFace production inference workflows

These workflows help an agent choose and build useful game improvements. They are domain checklists,
not a mandatory multi-agent ceremony and not an acceptance system.

The authoritative execution contract is
[`../program/INFERENCE_LANES.md`](../program/INFERENCE_LANES.md).

## Core rule

An `INFERENCE N` request means `N` sequential, committed production units unless the user stops the
task or every remaining eligible unit is concretely blocked. Production changes runtime code,
player-consumed data, shipped assets, or live integration. Plans, candidate matrices, tests, reviews,
receipts, probes, and harnesses support production but never count as units.

A unit may terminate as:

- `implemented` after sufficient direct verification of its implementation-level claim, with any
  broader route claim labeled `unproven` or `focused_green`; or
- `accepted` with current ordinary-route evidence.

Separate review is optional unless the user or an active packet explicitly requires it, or a
material high-risk boundary makes the independent perspective load-bearing.

## Reading order

For an ordinary INFERENCE unit, read only:

1. root `AGENTS.md`;
2. `design/program/INFERENCE_LANES.md`;
3. the relevant architecture/GDD slice;
4. the selected workflow file;
5. the live owner and focused checks.

Do not read the entire workflow library, reference library, portfolio protocol, queue, or acceptance
archive before beginning production.

## Workflow catalog

| ID | Workflow | One production unit usually means |
|---|---|---|
| WF-01 | NPC Occupations & Living World | one live occupation/response behavior |
| WF-02 | Enemy Roster & Encounters | one distinct combat role on a reachable encounter |
| WF-03 | Sector & World Composition | one player-visible activity pocket improvement |
| WF-04 | Stations, Planets & World Sites | one embodied destination operation |
| WF-05 | Weapons, Physics Tools & Modules | one mechanically distinct live tool |
| WF-06 | Economy, Industry & Logistics | one visible value-flow behavior |
| WF-07 | Progression, Ships & Infrastructure | one live capability milestone |
| WF-08 | Missions, Heists & Activities | one reachable activity package |
| WF-09 | Narrative, Characters & Ledger | one live narrative consequence or thread |
| WF-10 | Exploration & Discovery | one reachable discovery chain |
| WF-11 | Graphics Asset Families | one shipped/integrated asset-family slice |
| WF-12 | VFX, Camera & Visual Feel | one semantic presentation improvement |
| WF-13 | Audio & World Sound | one live semantic audio family |
| WF-14 | UI, UX & Onboarding | one complete player task/information improvement |
| WF-15 | Gameplay Feel & Balance | one resolved player-facing feel defect |
| WF-16 | Variants, States & Aftermath | one meaningful live state/aftermath package |
| WF-17 | Vertical Slice Integration | one coherent playable beat |
| WF-18 | Design Recovery & Simplification | one recovered intended behavior |
| WF-19 | Technical Production & Scaling | one measured quality-enabling production change |

Use `07_WORKFLOW_ROUTER.md` only when the symptom does not identify a domain.

## Optional supporting files

- `00_SPACEFACE_TEAM_MINDSET.md` — product lens.
- `01_SCALE_AND_DISPATCH.md` — bounded `N` semantics.
- `02_CREATIVE_CONVERGENCE_LOOP.md` — optional per-unit thinking loop.
- `03_REFERENCE_GAME_PATTERN_LIBRARY.md` — references, read only when needed.
- `04_REPO_SEAM_AND_AUTHORITY_MAP.md` — owner hints; verify against live code.
- `05_ADVERSARIAL_REVIEW_PROTOCOL.md` — bounded review when review is justified.
- `06_PORTFOLIO_INTEGRATION_AND_LEARNING.md` — optional portfolio work after production exists.
- `MASTER_AGENT_PROMPT.md` — copy-ready production prompt.

## Governing sentence

> Production first; proportionate proof second; recursive process never.
