<!-- LIFETIME: RECEIPT -->
# PQ-022 re-author causal review — 2026-09-10

Covers `PQ-022.refinery-reauthor-review` and `PQ-022.billboard-buoy-reauthor-review`.
Reviewer: campaign controller (vision-capable), inspecting the retained hash-bound stills directly.
Method: each revised candidate judged **only** against the defect its own repair lane was created to
close, as recorded in
[`PQ-022-corridor-assets-h2-disposition-REPORT.md`](./PQ-022-corridor-assets-h2-disposition-REPORT.md).
Stills were magnified for inspection in-session and the crops deleted afterwards (§1.3 rule 2 —
a capture is a process artifact, never a stored deliverable).

## Framing note, which matters for all three verdicts

The **original** Row-7 defect stills were captured at close framing — the disposition receipt says
the billboard failed *"even at this intentionally close framing."* The **revised** evidence is at
`ordinary` (default) framing. The re-authored assets are therefore being judged at a **harder**
framing than the one that condemned them. Two of the three still pass; that makes those two passes
stronger, not weaker. It also means the buoy's failure below is not a framing artifact — it is the
framing the asset must actually survive.

---

## `PQ-022.refinery-reauthor-review` — **PASS**

**Recorded defect:** *"Four nearly identical drums sit on a long flat spine behind a featureless
ochre wall. The image communicates primitive placement, not a connected refining process or
serviceable industrial destination."*

**Required repair:** a connected process story — feed/storage tanks, transfer spine, processing or
thermal zone, service access, and an industrial silhouette that survives ordinary framing.

**What the revised still shows** (`refinery-reauthor/browser/01-refinery-ordinary.png`), every clause
closed:

| Required | Present in the revised candidate |
|---|---|
| Feed / storage | Banded maroon pressure vessels in an orange structural cradle at the near end, on stilted supports |
| Transfer spine | A continuous horizontal truss running the full length and physically connecting each zone |
| Processing / thermal zone | Central stack cluster with red hazard banding and a bright emissive furnace element — the one genuinely hot thing in frame |
| Service access | Grey service module with an articulated arm at the far end; walkways and understructure legible beneath the tanks |
| Industrial silhouette | Asymmetric, multi-height, varied — no primitive repetition, no flat wall |

The old defect was **one flat ochre value across the whole asset**. The revision reads as at least
four deliberate material zones — orange structure, maroon vessels, dark processing towers, and a
metallic exchanger panel array. The process also reads **directionally**, storage → spine → towers →
exchanger, which is what "connected process" means and what the original could not do.

**Verdict: PASS.** The recorded process-chain, silhouette, material-zone and serviceability defects
are closed at ordinary framing.

---

## `PQ-022.billboard-buoy-reauthor-review` — **REVISE (buoy only)**

This unit requires **both** candidates to close. One does and one does not.

### Station billboard — **PASS**

**Recorded defect:** *"A grey horizontal beam with a tiny cyan cap has no dominant display or signal
face. It does not read as a billboard even at this intentionally close framing."*

**Revised:** a framed rectangular display housing whose face is a bright emissive screen, divided
into panels, carrying a large central glyph with text-line bands to the left, right and below, and
amber marker lights set into the frame edge. The display face is now the **dominant** element of the
asset rather than an incidental cap. It reads as a sign at a glance, at default framing, against a
busy belt background.

Role-readability, display/signal: **closed.**

### Navigation buoy — **FAIL, still REVISE**

**Recorded defect:** *"A plain post and base with a small purple cap provide insufficient navigation,
power, service, or lane-authority identity."*

**Required repair:** a legible lane-navigation head, power/service construction, and a durable beacon
signal.

**What the revised candidate actually does at default framing:** it is a small, dark, low-contrast
object that I had to magnify five times to identify at all. Magnified, it has genuinely been given
more construction than the original pale post — a faceted dark head, a narrow cyan signal slit, a red
collar band, and a pale angular panel. None of that survives the distance it is captured at.

Against the three required clauses:

- **Lane-navigation head — not closed.** The head is dark, small and shapeless in silhouette. Nothing
  about it says lane authority; the original's fault was a post with a cap, and this is still
  substantially a post with a cap.
- **Durable beacon signal — not closed.** The signal is a thin cyan slit and a small red band. Both
  are sub-pixel-scale at ordinary framing. A beacon whose signal cannot be seen from the lane it
  marks has not been given a durable signal, whatever it looks like up close.
- **Power / service construction — actively harmed.** The pale angular panel is rendered in the same
  value and hue family as the surrounding asteroids. Rather than reading as a solar or service
  element it **camouflages against the belt**, and on first inspection I read it as a rock partially
  occluding the buoy. This is a new readability problem the original post did not have.

**The decisive point:** a navigation buoy's entire function is to be identified at a distance, in a
cluttered lane, without stopping. It fails hardest at exactly the range it exists to work at.

**Second, procedural finding:** this evidence set contains **no close or diagnostic capture of the
buoy** — only the one ordinary-framing still. The billboard got one usable frame because it happens
to survive that framing; the buoy's head, signal and service construction cannot be judged on their
own terms from what was captured. Any re-review needs a diagnostic-close frame alongside the ordinary
one, exactly as the refinery lane provided.

---

## Dispositions

| Unit | Verdict | Action |
|---|---|---|
| `PQ-022.refinery-reauthor-review` | **PASS** | Close as done. |
| `PQ-022.billboard-buoy-reauthor-review` | **REVISE** | Cannot close — billboard accepted, buoy returned. |

**Repair routing for the buoy**, preserving the exact identity, route envelope, scale, anchors,
collision and LOD contract as the original lane did:

1. Give the head a **silhouette** that is not a post-and-cap — mass or asymmetry readable in outline
   against a black background at default range.
2. Make the beacon **emissive and large enough to carry**, on the scale the billboard's face now
   carries. The billboard proves the range budget is achievable in this same scene.
3. Move the service/solar panel **off the asteroid palette** — it must not share the value and hue of
   the rocks it sits among.
4. Recapture **ordinary and diagnostic-close** in both runtimes, matching the refinery lane's
   evidence shape.

The billboard needs no further work and should not be recaptured with the buoy.
