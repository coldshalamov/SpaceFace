# SpaceFace Sequential Build Plan — reviewer-prep packet

This folder holds the **36-prompt sequential build plan** for SpaceFace's "depth"
expansion (massline physics, gravity weapons, planets, world sites, wrecks, asteroid
ops, story, visual families, gold corridor, release) **plus a reviewer-prep packet**
assembled to let a strong reviewer agent convert the plan into concrete, corrected,
folded-into-the-repo build steps with minimal tool calls.

## Status

- **Not yet reconciled with the live repo's three existing build programs.** The
  reviewer's first job is to decide fold / supersede / parallel. See
  `_PACKET/03_COLLISION_AND_FLAG_MAP.md`.
- This folder is **planning material only**. It does not own packet work order or
  completion status (those live in `design/program/`). Per `PLAN_REGISTRY.md`, only
  `program/roadmap/**` owns packet work order.

## Layout

```
design/sequential-build-plan/
├── README.md                          ← (this file)
├── _PACKET/                           ← the reviewer-prep packet (READ-ONLY)
│   ├── 00_READ_ME_FIRST.md            ← start here
│   ├── 01_THE_USERS_OWN_WORDS.md      ← verbatim user quotes from the planning thread
│   ├── 02_SOURCE_AND_PLAN_DIGEST.md   ← high-fidelity digest of all source packages
│   ├── 03_COLLISION_AND_FLAG_MAP.md   ← SF-XX → existing repo home; 16 flags
│   ├── 04_OPEN_QUESTIONS_FOR_THE_REVIEWER.md
│   ├── 05_REVIEWER_DELIVERABLE_SPEC.md
│   └── 06_THE_REVIEWER_PROMPT.md      ← paste this into a fresh reviewer thread
├── PLANS/                             ← the canonical 36-prompt build plan
│   ├── README.md, SEQUENCE_MATRIX.md, DEPENDENCY_GRAPH.md, …
│   ├── plans/SF-00 … SF-35.md         ← the 36 prompts
│   ├── review/                        ← per-task REVIEWER_PROMPT + REVIEW_TEMPLATE
│   ├── receipts/                      ← where implementation receipts land
│   └── machine/                       ← sequence.json + receipt.schema.json
└── ORIGINALS/                         ← UNTOUCHED backups of ALL source material
    ├── SpaceFace_Dev_Plans.txt        ← the raw conversation thread
    ├── spaceface_depth_playbook/      ← 13 design docs (+ COMBINED)
    ├── spaceface_gravity_massline_package/   ← 9 design docs (+ COMBINED)
    ├── spaceface_universe_atlas_prompt_pack/ ← 14 atlas docs (+ MASTER_PROMPT)
    └── SpaceFace_Sequential_Agent_Prompt_System/ ← the full original prompt system
```

## How to use it

- **To review the plan:** read `_PACKET/00_READ_ME_FIRST.md` and follow its reading
  order. When ready, paste `_PACKET/06_THE_REVIEWER_PROMPT.md` into a fresh strong-
  model thread.
- **To execute a single prompt (once reviewed):** the original workflow is in
  `PLANS/README.md` and `PLANS/WORKFLOW_AND_REVIEW_PROTOCOL.md` — paste exactly one
  `plans/SF-XX_*.md` into a fresh implementation thread, write a receipt to
  `receipts/SF-XX.yaml`, move the prompt to `review/`. **But:** until the reviewer
  resolves the fold/supersede/parallel question (Q1 in `_PACKET/04_*`), do not begin
  execution — you risk duplicating live roadmap packets.

## Provenance

- The 36-prompt system was generated 2026-07-19 from a multi-turn planning conversation
  between the user and a design agent, distilled into sequential form. `MANIFEST.md`
  (in `PLANS/` and `ORIGINALS/SpaceFace_Sequential_Agent_Prompt_System/`) carries the
  SHA-256 hashes binding the package.
- The three upstream design packages (depth playbook, gravity/massline expansion,
  universe atlas prompt pack) and the raw conversation thread are preserved verbatim
  in `ORIGINALS/`.
- The `_PACKET/` files were assembled by a separate prep pass on 2026-07-19 to
  organize, map, and flag the plan for review. They are **digests and maps**, not new
  authority — when they disagree with `ORIGINALS/` or the live repo, the originals and
  live code win.

## Relationship to the rest of `design/`

This folder is **subordinate planning material**. Per `design/PLAN_REGISTRY.md`:
- `design/program/roadmap/` owns packet work order.
- `design/program/01–05` own verified/remaining/acceptance/integration truth.
- `design/depth-program/` owns depth scope (the 31 chunks).
- `design/program/atlas/` owns the atlas program (2026-07-19).

This folder owns none of those. It is a **review input**, not a status surface. When
the reviewer's corrected build plan is accepted, its outcomes should be projected into
the existing `design/program/` and `design/program/roadmap/` authority surfaces by the
lead/integrator — not tracked here.
