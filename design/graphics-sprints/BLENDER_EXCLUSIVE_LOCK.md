# Blender Exclusive Lock — One MCP Agent at a Time

## Rule

**At most one agent/session may use Blender MCP or write source GLBs in a sprint.**

Threads **A** (kit quality) and **E** (wholeship repair) compete for this lock. Thread **B** acquires it only when A/E release it.

Threads **C** and **D** must never acquire the lock.

## Lock file

Path: `assets/ships/blender.LOCK`

Format (plain text):

```
owner: thread-A | agent-session-id | 2026-07-08T14:30:00Z
asset_ids: engine_vector, engine_resonator
expires: none
contact: optional
```

### Acquire (before first `execute_blender_code`)

1. Check `assets/ships/release.__building/` — if present, **stop** (release build in progress).
2. If `blender.LOCK` exists, read owner — **stop** unless you are resuming that session.
3. Create `blender.LOCK` with your thread ID and planned `asset_ids`.
4. `git add -N assets/ships/blender.LOCK` if untracked.

### Release (after sprint batch or handoff)

1. Finish evidence bundle per `QUALITY_RITUAL.md`.
2. Delete `blender.LOCK` (or hand off to integrator with note in HANDOFF).
3. Do **not** delete another agent's lock.

## Coordination with release lock

| Lock | Meaning |
|------|---------|
| `assets/ships/blender.LOCK` | Blender MCP / source GLB authoring |
| `assets/ships/release.__lock/` | Graphics lane ownership — no `src/render/**` edits |
| `assets/ships/release.__building/` | Release script running — no GLB edits |

**Order:** release building → wait → blender work → release build → integrate.

## Thread B (world places)

Thread B sprint plan is **data + concept + queue** until Blender lock free. When lock acquired:

- Prefer one place ID per sub-sprint when hero-scale review would otherwise become diffuse.
- Follow `design/world-identity/PIPELINE.md` bootstrap → promote flow.

## Violations

If two agents write GLBs concurrently, **stop both** and run `npm run check:asset-status` before continuing. Trust evidence folders over chat claims.
