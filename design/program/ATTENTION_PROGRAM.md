<!-- LIFETIME: ACTIVE_PROGRAM -->
# ATTENTION PROGRAM — the 50x detail pass

Owner direction 2026-10-24: every experience in the game must carry roughly fifty times
more authored attention to detail than it does today. The mechanism is an army of
agents who catalogue every player-reachable surface, reason over what is weak, debate
the creative direction adversarially, and fill it out — with redundant review at every
step. This document is the law of that program. The claimable units live in
[`ATTENTION_LEDGER.md`](./ATTENTION_LEDGER.md); the board rows are `build_map.md` §1O.

## What this program is (and is not)

- **Density, not breadth.** Inference lanes add new systems and encounters. This
  program deepens surfaces that already exist — a station the player docks at fifty
  times earns one-offs, easter eggs, texture, named wrecks, bark, stencils, memory.
- **Attention is the product.** A unit is an agent spending real cycles imagining a
  player standing in one exact place and authoring what makes it feel inhabited.
- **Not new machinery.** Detail lands through existing schemas: encounters, barks,
  comms popups, props, recipes, overlays, manifest flavor, mission params. Do not
  build attention infrastructure; build attention.

## The pipeline for every unit

1. **CATALOG** (done once per surface family — the ledger holds the verdict):
   an agent reads the surface's code and any existing art/renders and writes a
   short audit — what the player literally perceives, what is thin, what the
   surface's tone register is.
2. **PERSONA DRAFTS** — three creative subagents with assigned perspectives each
   draft ideas for that surface (see personas below). Personas must argue from
   different grounds; no two drafts may converge to the same proposal.
3. **TRIBUNAL** — the three drafts are scored by a judge subagent against the
   rubric below; the judge may splice the best parts of two drafts. Output is
   ONE synthesized plan for the surface.
4. **3× REVIEW LAW** — every step's artifact (audit, synthesized plan, and the
   finished implementation) must earn three successive subagent approvals. One
   rejection resets the count. Reviewers must cite the artifact, not taste.
5. **IMPLEMENT** — a working agent lands the approved plan through the normal
   pathspec flow, and the row gets a LANDED_REVIEW entry like any other unit.

## Personas (assign three per unit, rotate)

- **The Drifter** — a working-class regular. Cares that the world feels lived:
  scuffs, debts, in-jokes, things broken and half-fixed.
- **The Archivist** — continuity and memory. Cares that the world references
  itself: prior contracts, named dead, consequences of other stories.
- **The Skeptic** — the player who pokes at edges. Files the "nothing happens
  here" verdicts; cares that poking gets rewarded.
- **The Set Dresser** — visual storyteller. Cares that a place tells what it is
  before any text: dressing, stencils, wrecks, light.
- **The Accountant** — systems reality-check. Every proposal must name the
  schema it lands through and its cost; rejects anything unshippable.

## Tribunal rubric (judge scores each draft 1–5 per axis)

- **Critical-path weight** — how many player-hours touch this surface.
- **Authenticity** — fits the surface's authored register (ledger column 4);
  rejects genre-generic flavor.
- **Specificity** — named things, real numbers, concrete props — not vibes.
- **Cost** — lands through existing schemas; no new systems.
- **Non-redundancy** — doesn't duplicate what the surface or its neighbors
  already have.

## The standing 3× rule — mechanics

Nothing in this program is "done" on one agent's say-so. Audit, plan, and
implementation each need three consecutive approvals — same loop the graphics
sweep used. Mechanics:

- **Three distinct reviewers per gate.** The artifact's author and the tribunal
  judge do not count toward their own work's three.
- **Approvals are recorded** in the artifact itself (an `## Approvals` footer
  naming reviewer + verdict) so a resume can read the streak.
- **Staged row status** in the ledger: `open → audit✓3 → plan✓3 → impl✓3 →
  landed`. A CLAIMED row left mid-stage is resumable — the stamps say where.
- One rejection resets that gate's count; fix and restart the streak.

This rule governs attention-program units only. It does not re-impose reviewer
counts on FINISH_LANES or other lanes whose own law differs.

## Artifact home

All program artifacts live in `design/archive/program/attention/` (tracked — not
`.devshots`, which is gitignored): `dossier-*.md` for the evidence phase,
`<row>-audit.md`, `<row>-draft-<persona>.md`, `<row>-plan.md` with its
Approvals footer, and `<row>-impl-note.md` on landing.

## Guardrails

- **UI surfaces.** Units touching `src/ui/**` or `styles/**` (T-01, V-rows)
  propose micro-copy and content only — layout and redesign belong to the
  ORRERY frontend lane (`design/frontend/ORRERY.md`, root AGENTS.md §1). Keep
  diffs minimal and consistent.
- **Flight HUD** is already claimed by `design/HUD_FLIGHT_ATTENTION.md` —
  attention units defer to it, not duplicate it.
- **Frontend lane protection stands.** No attention unit takes ORRERY sessions
  or revives superseded briefs.

## Evidence already gathered (dossier phase)

`design/archive/program/attention/` holds the first dossier:
`dossier-first-hour.md` (audit of the onboarding rail and hour-1→10 emptiness
— measured: 0 missions completed in 60 sim-hours), plus audio/feel,
world-memory, and economy/failure dossiers as they land. Every catalog step
should read the relevant dossier first.
