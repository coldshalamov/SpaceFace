# design/ agent orientation

Do not read this directory wholesale. Start at `design/program/README.md` for current position and at
`design/PLAN_REGISTRY.md` to select the smallest relevant plan family.

## Authority

1. Root `ARCHITECTURE.md` — technical contract.
2. `GDD_2_0.md` — product pillars and intended experience.
3. `program/` — verified status, admitted work, acceptance, integration, retained backlog.
4. The specific activated plan/spec — task detail.
5. Current code, checks, and player-route evidence — implementation truth.

Archived documents, handoffs, reviews, worker packets, transcripts, and tool plans are history, not
current authority. Superseded ADRs live under `_ARCHIVE/adr/`.

## Plan families

- `spec2/` — polish/release intent and behavior references.
- `spec3/` — expansion and ambition specs.
- `vision/ALPHA_PROGRAM.md` — Alpha scope/order when activated through the program index.
- `depth-program/`, `revamp/`, `graphics-sprints/`, `world-identity/` — focused plan families with
  their own README/index.
- `production/` — optional explicitly activated production-controller workflow, not the default way
  to implement an ordinary feature.

Both spec2 and spec3 may be active for different tasks. `spec2/00_MASTER_TASTE.md` is historical
taste context: its non-diegetic HUD decision remains, while palette, glow, radius, surface, asset,
and process recipes are non-binding.

## Rules

- Read only the selected plan and the GDD/architecture sections it cites.
- Preserve valuable future intent, but label it retained/partial instead of claiming it is admitted
  or implemented.
- Do not copy global status outside `design/program/`.
- Plans specify outcomes and contracts, not universal visual recipes, asset ceilings, technique
  quotas, iteration counts, or permanent ownership lanes.
- Runtime/build dependencies and authored media are allowed under the repository-wide documented
  quality, licensing, performance, determinism/save, and maintenance policy.
- Acceptance comes from the relevant checks plus player-facing evidence where applicable; worker
  reports, self-scores, and transcript claims are not proof.

For policy classification and conflict handling, see `docs/POLICY_MANIFEST.md`.
