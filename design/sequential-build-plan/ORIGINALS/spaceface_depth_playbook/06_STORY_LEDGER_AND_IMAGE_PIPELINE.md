# 06 — Story Ledger and Image Pipeline

## 0. Story objective

Tell a large story without:

- stopping the player for long conversations;
- requiring animated cutscenes;
- relying on low-quality synthetic voice;
- forcing dialogue choices;
- permanently hiding story branches;
- expecting players to read mission prose before following a waypoint.

The story should feel like **evidence accumulating around the player’s actions**.

---

# 1. Three-layer delivery

## 1.1 Flight fragments

Short, automatic, non-blocking.

Length:

- usually 8–20 words;
- rarely two short lines.

Triggers:

- first scan;
- component activation;
- entering a landmark;
- witnessing an NPC event;
- recovering an object;
- finishing construction stage.

Examples:

> THE RECEIVER IS STILL TRACKING A CONVOY THAT VANISHED YEARS AGO.

> RELAY 2 WAS DISABLED MANUALLY. THE IMPACT CAME LATER.

> SURFACE LAUNCH DETECTED. NO COLONY ANSWERS THE MANIFEST.

Presentation:

- stylistic font;
- strong hierarchy;
- 2–5 seconds;
- fade without input;
- stored in ledger automatically;
- critical information also represented by waypoint/target state.

Do not make mission completion depend on reading it.

## 1.2 Physical evidence

The strongest story channel:

- wreck layout;
- missing cargo;
- powered/disabled component;
- route record;
- ship manifest;
- station construction;
- black box;
- faction markings;
- scarred planet;
- convoy behavior;
- abandoned machinery.

The world should make the fragment plausible.

## 1.3 Illustrated ledger page

Optional, persistent, readable later.

Page contains:

- title;
- image or technical illustration;
- 80–180 words;
- location and date if known;
- related people/factions/sites;
- map annotation;
- discovered evidence list;
- follow-up lead.

No choices. No “Continue” button chain.

---

# 2. Story threads remain additive

A thread may have:

- prerequisites;
- discoveries;
- physical state changes;
- consequences;
- follow-up locations.

It should not ordinarily have:

- one irreversible response that deletes two other threads;
- replay-only content;
- a morality menu;
- a requirement to restart the campaign.

Player actions may change:

- order;
- context;
- difficulty;
- reward;
- who occupies a site;
- what a later ledger page says.

The underlying locations and major evidence remain accessible whenever physically plausible.

---

# 3. Artifact-page data model

```js
{
  id: 'artifact_vigilant_bridge_clock',
  threadId: 'thread_vigilant',
  order: 3,
  title: 'The Clock Stopped First',
  deck: 'Recovered bridge telemetry',
  unlock: {
    event: 'component:stateChanged',
    parentId: 'wreck_isc_vigilant',
    componentId: 'relay_bridge',
    nextState: 'active'
  },
  imageRef: 'assets/story/vigilant/bridge_clock.webp',
  body: [
    'The bridge clock stopped eleven minutes before the hull broke.',
    'The impact report was appended afterward by an emergency recorder...'
  ],
  map: {
    sectorId: 'sector_veil_nebula',
    markerId: 'wreck_isc_vigilant'
  },
  related: ['person_...', 'faction_scn'],
  leads: ['artifact_vigilant_receiver_log']
}
```

System requirements:

- one-time unlock;
- deterministic;
- persisted IDs;
- unread/read state;
- no raw credits/cargo writes;
- optional notification;
- accessible from Ship’s Ledger.

---

# 4. Mission/objective separation

The player may ignore prose and still understand:

- where to go;
- what target matters;
- what action is available;
- what changed.

Objective UI:

> VIGILANT RECOVERY  
> Search the marked bearing  
> 0/2 relays active

Story UI:

> THE CLOCK STOPPED FIRST

These are related but not conflated.

---

# 5. Story image types

Use several visual forms so the ledger does not become a gallery of identical portraits.

## 5.1 Cinematic reconstruction

A believable still of:

- battle;
- convoy;
- station before destruction;
- character in environment;
- orbital event.

## 5.2 Recovered photograph

- crew;
- work team;
- family;
- station opening;
- ship commissioning.

## 5.3 Technical scan

- wreck damage map;
- component diagram;
- trajectory;
- signal analysis;
- planet anomaly.

## 5.4 Treasure or route map

- annotated star chart;
- cargo route;
- hand-marked bearing;
- smuggler lane.

## 5.5 Security still

- grainy customs image;
- silhouette;
- dock camera;
- unidentified ship.

## 5.6 Propaganda or archival material

Use sparingly:

- faction poster;
- industrial prospectus;
- memorial image.

Text should be HTML/CSS overlay, not generated inside the image unless the distorted artifact itself matters and exact spelling is not required.

---

# 6. Art direction: preventing cartoon drift

Image models often interpret “sci-fi character portrait” as pulp illustration, comic art, or painterly concept art. Avoid those trigger phrases when realism is desired.

## 6.1 Character prompt language

Prefer:

> cinematic live-action casting portrait; photorealistic production still; physically plausible human anatomy and skin; 85mm lens; restrained documentary lighting; practical wardrobe with worn industrial materials; neutral or guarded expression; natural asymmetry; subtle film grain; grounded contemporary science-fiction production design; no visible text.

Explicitly exclude:

> no illustration, no painted concept art, no comic-book rendering, no cel shading, no thick outlines, no retro pulp cover, no 1950s magazine art, no exaggerated heroic pose, no plastic skin, no anime.

## 6.2 Battle/ship prompt language

Prefer:

> photorealistic cinematic production still of a physically constructed hard-surface spacecraft; believable scale cues; grounded PBR metal, ceramic insulation, soot, thermal discoloration, and practical emissive lighting; restrained lens effects; documentary framing; deep space black levels; asymmetric battle damage; no text.

Exclude:

> no cartoon, no painterly brushwork, no toy-like proportions, no glowing fantasy ornament, no clean showroom render, no retro pulp poster.

## 6.3 Technical image prompt language

Prefer:

> high-resolution forensic spacecraft scan visualization; orthographic damage reconstruction; precise silhouettes; restrained monochrome/cyan instrument palette; fine grid and vector overlays added later in HTML; no baked labels or illegible generated typography.

## 6.4 Generation workflow

Do not ship the first generated image.

1. Generate a contact sheet or several candidates.
2. Reject candidates that violate realism, anatomy, faction identity, or scale.
3. Select one visual direction.
4. Generate consistent follow-up views using the selected image as reference where tooling permits.
5. Crop and color-grade consistently.
6. Store prompt, source, license/provenance, and selected asset ID.
7. Review inside the actual ledger UI.

---

# 7. Image style bible

Create a small reference package containing:

- three approved character portraits;
- three approved ship/world stills;
- two technical scans;
- palette;
- grain/contrast target;
- lens/framing rules;
- wardrobe/material rules;
- forbidden styles.

Every image-generation agent must be given the bible or approved references.

Consistency matters more than each image being individually extravagant.

---

# 8. UI composition

## 8.1 Ledger page

Suggested structure:

- large image occupying 45–60% of page;
- title and deck;
- concise body;
- evidence chips;
- small map/location block;
- next/related items;
- no giant navigation chrome.

## 8.2 Flight fragment

- edge or upper-third placement, not center obstruction;
- max two lines;
- high contrast;
- brief icon/category;
- optional “LOGGED” state;
- no click required.

## 8.3 Discovery montage without cutscene

For a major event:

1. camera briefly eases toward live object;
2. one fragment appears;
3. one or two live component lights change;
4. ledger image unlocks;
5. control remains available or returns immediately.

This produces cinematic punctuation without Blender animation.

---

# 9. Story through construction

The player’s industrial expansion should generate story:

- first site receives a name;
- first lost courier leaves a wreck;
- first station frame attracts workers/raiders;
- a faction reacts through traffic and news;
- an old artifact becomes part of a new machine;
- a region changes from empty to inhabited.

The Ship’s Ledger can record:

- “first production” pages;
- before/after site images;
- route incident maps;
- named constructed stations;
- recovered components installed in new structures.

The player’s own history becomes the longest story thread.

---

# 10. Open storyline structure

Use a graph where nodes unlock but do not delete peers.

```text
rumor
  → site discovery
      → physical evidence A
      → physical evidence B
      → construction consequence
      → faction response
      → deeper location
```

If the player strips a component before reading it:

- the evidence may be recovered from the detached payload;
- a later analyst may interpret it;
- the page changes context;
- the thread is not simply lost.

## 10.1 Soft consequences

Instead of branch deletion:

- different text;
- different route;
- different occupant;
- different price/reputation;
- different visual state;
- delayed access;
- extra repair/material requirement.

---

# 11. Audio policy

Do not block story work on a music or voice pipeline.

Use current audio only for:

- short confirmation cue;
- radio/static texture;
- impact/relay sounds;
- environmental loops;
- optional abstract voice fragments if quality is acceptable.

Text and images carry narrative authority until an authored audio pipeline exists.

Avoid promising “the score tells the story” without an actual composition and implementation workflow.

---

# 12. First story package

Build one five-page thread around the Wreck Cathedral.

1. **The Missing Convoy** — route map.
2. **Capital Hull Located** — cinematic exterior still.
3. **The Clock Stopped First** — technical bridge scan.
4. **Released From Inside** — cargo-clamp evidence.
5. **What Was Carried** — recovered photograph or device image.

Unlock through physical actions. No dialogue choices.

---

# 13. Acceptance

- player can ignore every page and still complete gameplay;
- each page is unlocked by a real event;
- no page duplicates mission instructions;
- images share a consistent style;
- no cartoon portrait slips through realism brief;
- no generated text is relied upon inside image;
- ledger persists read/unread;
- story threads do not disappear due to arbitrary first choice;
- flight fragments are short and non-blocking;
- at least one world object visibly supports each story claim.

---

# 14. Pasteable image-generation prompt: realistic character

> Create a cinematic live-action casting portrait for a grounded hard-science-fiction game. The subject is [CHARACTER DESCRIPTION]. Photorealistic production still, physically plausible anatomy and natural skin texture, restrained documentary lighting, 85mm lens, shallow but believable depth of field, subtle film grain, practical worn industrial clothing, small signs of real use and fatigue, neutral guarded expression, natural asymmetry, contemporary prestige-TV science-fiction production design. Dark simple environment with one contextual industrial detail. No visible text. No illustration, no painted concept art, no comic-book rendering, no cel shading, no thick outlines, no retro pulp-cover style, no 1950s science-fiction magazine look, no anime, no exaggerated heroic pose, no plastic skin.

# 15. Pasteable image-generation prompt: wreck evidence

> Create a photorealistic cinematic production still of [WRECK/EVENT DESCRIPTION] for a grounded top-down space game’s evidence ledger. The vessel is a physically constructed hard-surface machine at enormous scale, with readable structural sections, practical trusses, ceramic insulation, PBR metal and roughness, soot, asymmetric impact damage, torn bulkheads, restrained emergency emissives, and small scale cues from utility craft. Documentary framing, deep-space black levels, restrained lens effects, believable lighting and exposure. No text, no cartoon styling, no painterly concept-art brushwork, no toy proportions, no molten glowing ball, no intact ship merely rotated, no retro pulp poster.
