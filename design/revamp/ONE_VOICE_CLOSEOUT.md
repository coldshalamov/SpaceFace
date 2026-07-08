# One-Voice Closeout

**Date:** 2026-07-08
**Scope:** flight HUD transient text. Authority: `00_MASTER_TASTE.md` §2 pillar 3, `spec2/06` §1
(top-center = one voice), `SPEC3-F10` §40. Resolves debt #3 of `FRONTEND_REBOOT_AUDIT.md`
("one-voice not mechanical — alerts + comms + toasts + mission text simultaneous").

## The law
There is **one** transient-attention line. It is owned by the existing `src/ui/voiceArbiter.js`
(a single priority queue — do **not** build a second one). Everything that speaks transiently routes
through it; it surfaces exactly one message at a time.

## Decision: hybrid (arbiter serializes on the bus, alerts.js presents top-center)

Neither pure option was right. Bottom-right toasts for combat danger is a UX regression and violates
spec2/06; moving the arbiter's whole surface top-center perturbs bus behavior the golden may hash.
So:

- **voiceArbiter.js** keeps re-emitting its surfaced floor as a `toast` **byte-identically**
  (`_fromVoice:true`) — golden-safe, and the `check-one-voice` system-wrapper contract is untouched.
  It **additionally** emits `voice:surface {id,channel,priority,text,kind,ttl}` on promotion / in-place
  text update and `voice:clear {id}` on release. These two events are **not** in the `eventTrace`
  allowlist, so they cannot move any golden.
- **alerts.js is the presenter AND the adapter for its own inputs.** It renders the floor as the top
  pill in `#alerts` (`.sf-alert--floor`, CSS `order:-1` keeps it above the status pills). It also
  forks its `alert` inputs: **finite ttl → `voice.say`** (channel `alert`); **`ttl:Infinity` /
  condition-bound → a persistent status pill** (dock, gate, missile-lock, low-vitals).
- **toasts.js suppresses `_fromVoice`** so the voice is never double-surfaced bottom-right. Mechanical
  action toasts (buy/sell/errors/pickups — ~150 sites) are an **allowed, exempt** separate channel.

## Three honest classes (state this taxonomy; don't collapse it)
1. **Transient-attention floor** — arbiter-owned, top-center, one at a time (danger, tutorial,
   objective, story, news, barks).
2. **Persistent-status pills & trackers** — condition/affordance-bound (dock & gate prompts, missile
   lock, low-shield/hull, the mission/objective/nav trackers). Exempt; they are status, not speech.
3. **Ambient textures** — bottom-right action toasts, and the left-edge comms "channel noise" feed.
   Exempt (deliberate design). Player-addressed comms lines are marked `_viaVoice` by `story.js` so
   `comms.js` logs them to the **backlog only** (they already show on the floor — no double).

## Channels (do NOT renumber the existing five)
`story:100 · alert:80 · tutorial:70 (new) · objective:60 (new) · bark:50 · news:30 · info:10`.
Life-critical danger passes an explicit **`priority:110`** (via `alerts.js announce()`) so it tops
even story — the spec's "danger first" without renumbering any channel. `'comms'` still falls back to
`info(10)`; adding a comms tier was out of scope (only tutorial+objective were added) — deferred.

## Routed stragglers
| Surface | File | Transient → | Persistent part kept |
|---|---|---|---|
| Combat/state alerts | `alerts.js` | `announce()` → channel `alert` | dock/gate/lock pills |
| External `alert` events | `alerts.js` | finite-ttl → `voice.say` | `ttl:Infinity` → pill |
| Tutorial beats + hints | `onboarding.js` | `voice.say` channel `tutorial` (keeps `tutorial:say`) | `#sf-onboarding` panel |
| Tracked-mission nudge | `missions.js` | `voice.say` channel `objective` | mission tracker |
| Player-addressed comms | `story.js` / `comms.js` | already `voice.say`; `_viaVoice` → backlog-only | comms backlog |

## Do NOT
- Build `attentionArbiter.js` or any second queue. Extend the one that exists.
- Un-suppress `_fromVoice` in toasts.js (re-doubles every voice).
- Renumber/rename story/alert/bark/news/info.
- Force `ttl:Infinity` prompts (dock/gate) through the queue — they would jam the floor forever.
- Add wall-clock timers to the presenter — it is event-driven off the sim-stepped queue.

## Verification
`check:one-voice` (augmented: tier arbitration, surface/clear parity, straggler source-contract, tiers
in the 10-min soak), `check:encounter-voice`, `check:ui-a11y`, `check:wcag-contrast`, `check:onboarding`,
`check:balance` — all green. Live DOM proof: story→floor, danger(110) preempts→one floor, `aria-live`
assertive for danger, zero `_fromVoice` toasts, action toasts still render. `check:sim` fails on a
**pre-existing** `projectileHits` combat assertion (identical with my sim edits reverted) — unrelated.
