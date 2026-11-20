<!-- LIFETIME: STABLE -->
# design/ agent orientation

What the game should be: [`design/overhaul/`](./overhaul/README.md). The rule and the live board are
in the root `AGENTS.md`; nothing in this folder assigns, orders or blocks work.

`ARCHITECTURE.md` is the technical contract, `VISION.md` the owner's statement of the fantasy and
UVP, and `GDD_2_0.md` the product pillars and intended experience. Current code, checks, and
player-route evidence are the implementation truth.

Archived documents, handoffs, reviews, worker packets, transcripts, and tool plans are history, not
current authority. Superseded ADRs and retired plan suites live in git history — retrieve by commit,
never by keeping them in the working tree.

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

## Facts that still hold

- Preserve valuable future intent, but label it retained/partial instead of claiming it is admitted
  or implemented.
- Plans specify outcomes and contracts, not universal visual recipes, asset ceilings, technique
  quotas, iteration counts, or permanent ownership lanes.
- Runtime/build dependencies and authored media follow
  [`../docs/OPEN_SOURCE_INTAKE.md`](../docs/OPEN_SOURCE_INTAKE.md) §0. That section names what to
  bring in. License, performance, determinism/save, and maintenance stay documented.
- Acceptance comes from the relevant checks plus player-facing evidence where applicable; worker
  reports, self-scores, and transcript claims are not proof.

For policy classification and conflict handling, see `docs/POLICY_MANIFEST.md`.
