# 04 — Wreck Cathedral Vertical Slice

## 0. Mission

Build one monumental, physical, persistent wreck site that proves SpaceFace can convert its existing semantic systems—wreck provenance, scanning, salvage, massline physics, component state, story fragments, and industrial progression—into an actual top-down player experience.

This brief deliberately does **not** require:

- a walkable 3D interior;
- first-person exploration;
- deformable meshes;
- cinematic animation;
- full triangle collision;
- dialogue choices;
- a bespoke full-screen wreck UI;
- a new combat AI stack.

It does require more than a labeled sphere.

---

# 1. Player-facing promise

From a neighboring activity pocket, the player sees the broken silhouette of a capital ship.

On approach, the wreck resolves into several huge separated sections with navigable channels between them. The player can fly among those sections because collision proxies match the visible hull pieces.

A scan reveals a small number of physical components. The player restores emergency power, cuts structural braces with the industrial beam, pulls a cargo or reactor assembly free with the massline, recovers a black box, and leaves the wreck visibly changed. Later, the player may install a salvage core and turn the site into an automated recovery operation.

The wreck tells a short story through the object and brief fragments. No response menu appears.

---

# 2. Adaptation to top-down gameplay

“Fly through the split hull” does not mean piloting through a detailed volumetric corridor.

It means the wreck is authored as a **top-down navigable debris architecture**:

- port hull slab;
- starboard hull slab;
- command section;
- engine block;
- cargo spine;
- detached armor plates;
- a few dynamic debris pieces.

These pieces sit in the XZ gameplay plane with clear channels between them.

The player flies:

- between split hull halves;
- through a broken hangar mouth;
- around the command section;
- behind the engine block;
- along a cargo-spine corridor.

Closed solid sections remain blocked. Visible gaps remain open.

This is achievable with multi-circle collision proxies before compound OBB/capsule collision exists.

---

# 3. Scale

Minimum footprint:

- overall length: 320–600 world units;
- overall width: 180–360 world units;
- main channels: at least 55–90 world units wide, adjusted to player hull radius;
- individual hero sections: 80–220 world units;
- visible from at least 1,200 world units through silhouette/emissive cues.

The site must dwarf the player ship. A radius-nine wreck entity cannot be the hero object.

A normal-gameplay screenshot should make the player ship appear like a small craft beside a dead capital vessel.

---

# 4. Site layout

Suggested local layout:

```text
                   [COMMAND SECTION]
                       /      \
       [PORT HULL]  --          --  [STARBOARD HULL]
            \                       /
             \    [CARGO SPINE]    /
              \         |         /
                   [ENGINE BLOCK]

     detached plates / small debris outside the main channels
```

Use asymmetry. The wreck should look like it broke under directional force, not like a symmetrical model exploded radially.

Required routes:

1. **outer approach** — wide and safe;
2. **split-hull channel** — visually dramatic, medium width;
3. **cargo corridor** — narrower, component-rich;
4. optional **engine shadow** — cover/combat route.

---

# 5. Visual asset contract

## 5.1 Modeling approach

Use modular hard-surface kitbashing:

- hull slabs;
- trusses;
- bulkhead ribs;
- engine bells;
- cargo containers;
- bridge/command block;
- armor plates;
- cable bundles;
- broken end caps.

The wreck may reuse a ship-family kit at much larger scale, but it must not read as a normal ship scaled up.

## 5.2 Damage language

Required:

- torn structural ends;
- exposed internal trusses;
- uneven missing sections;
- scorch direction;
- dead and intermittent emissives;
- a few glowing emergency systems, not an entirely molten-orange hull;
- material contrast: hull metal, dark interior, insulation, cables, reactor hardware.

Forbidden final visual:

- sphere;
- asteroid with boxes;
- orange molten ball;
- one intact ship model rotated and labeled “wreck”;
- repeated cubes with no dominant silhouette;
- emissive glow used to hide absent geometry.

## 5.3 Materials

Use grounded PBR values:

- mostly rough/oxidized hull;
- limited polished surviving surfaces;
- soot/grime decal masks;
- exposed insulation or ceramic;
- selective emergency amber/red emissive;
- cool scan-reactive components;
- no cartoon outlines;
- no baked text labels in textures.

## 5.4 Three-scale review

Far:

- split capital silhouette readable.

Mid:

- hull halves, engine, command section, cargo spine distinguishable.

Near:

- braces, relays, black-box housing, cut marks, attachment points visible.

## 5.5 LOD and performance

- hero LOD near;
- simplified mid LOD;
- HLOD or merged distant silhouette;
- batch repeated trusses/panels;
- no hundreds of separate draw calls;
- no quality reduction in default route to pass.

---

# 6. Collision contract

## 6.1 Phase-one implementation

Use a parent wreck visual plus multi-circle invisible static proxies aligned to major solid sections.

Example proxy groups:

- port hull: 4–7 circles;
- starboard hull: 4–7 circles;
- engine block: 2–4 circles;
- command section: 2–3 circles;
- cargo spine: 3–5 circles.

Do not place proxies across intended channels.

## 6.2 Debug overlay

Toggle displays:

- parent origin;
- each proxy circle;
- component anchors;
- receiver/extraction zones;
- scan radius;
- massline anchors.

The overlay must be captured over the live GLB before acceptance.

## 6.3 Collision tests

- fly through split-hull channel without contact;
- hit visible port hull and bounce/stop at correct edge;
- fire projectile through open gap;
- projectile strikes visible solid section;
- no invisible central core;
- no proxy appears as a target;
- no docking/receiver volume overlaps solid proxy.

---

# 7. Component roster

Use five to seven components. More is not automatically better.

## 7.1 Power Relay A

- state: offline;
- revealed by scan;
- repairable with industrial beam and one control unit or repair kit;
- activation lights one section and reveals deeper components;
- brief fragment on completion.

## 7.2 Power Relay B

- physically separated;
- requires approach through another channel;
- may be cut off by a blocked brace or hazard;
- activation restores cargo-spine lights.

## 7.3 Port Cargo Brace

- role: cuttable;
- industrial beam work target;
- visible cut line and sparks;
- completion removes brace mesh;
- unlocks/detaches cargo module.

## 7.4 Starboard Cargo Brace

Optional second brace so extraction requires two physical positions. Do not make the player repeat five identical cuts.

## 7.5 Cargo/Weapon Module

- attached visual before cut;
- dynamic payload after braces severed;
- tetherable;
- mass appropriate for reel/throw/tow;
- may contain unique blueprint or materials.

## 7.6 Reactor Assembly

Choose one of two roles:

### Version A — physical payload

- locked by braces;
- can be pulled free;
- dangerous if thrown/impacted;
- delivered to receiver or Asteroid Ops site.

### Version B — stabilizable site component

- overheating/offline;
- industrial beam stabilizes or installs control unit;
- powers emergency systems;
- later enables automated salvage.

Do not implement both in first slice unless existing systems make it trivial.

## 7.7 Black Box

- revealed after power or scan;
- small recoverable object or component;
- collection unlocks illustrated ledger page and exact provenance;
- no choice prompt.

---

# 8. Interaction sequence

## 8.1 Discovery

Trigger:

- rumor, map bearing, or visual discovery.

Flight fragment:

> LONG-RANGE RETURN: CAPITAL HULL. NO ACTIVE REGISTRY.

Map gains fuzzy or exact site marker according to existing unique-wreck system.

## 8.2 Approach scan

Player presses scan.

Results:

- wreck name/class;
- two relay signatures;
- one structural instability;
- one hidden data source.

Do not reveal every component instantly if power restoration is part of the loop.

## 8.3 Restore emergency power

At relay:

- target component;
- target panel says `RMB REPAIR`;
- hold beam;
- beam endpoint remains on relay;
- progress ring;
- relay emissive changes from dead to active;
- local lights animate on;
- second scan may reveal cargo/black box.

Flight fragment:

> RELAY 1 ANSWERS. INTERNAL CLOCK STOPPED FORTY-THREE YEARS AGO.

## 8.4 Cut braces

At brace:

- target panel says `RMB CUT`;
- beam visual changes to cutting mode;
- heat/scorch accumulates;
- progress persists through brief interruption;
- on completion, brace mesh disappears and a small separation motion occurs;
- no ore reward toast.

Flight fragment:

> PORT SPINE FREE. MASS SHIFT DETECTED.

## 8.5 Extract payload

- `F` attaches to the detached module;
- module uses COM-to-COM tow anchor;
- player reels or pulls;
- receiver/extraction zone is visible;
- optional throw solution lets player sling the module into receiver;
- ordinary slow tow also works.

The activity should be fun at low skill and expressive at high skill.

## 8.6 Recover black box

Possible implementations:

- small magnetized pickup after housing opens;
- component recovered by close scan;
- payload socket delivered to receiver.

On recovery:

- one short fragment;
- illustrated ledger page unlocked;
- blueprint or map lead granted through owning system.

## 8.7 Persistent aftermath

After completion:

- cut braces remain gone;
- cargo module remains absent/delivered;
- powered sections remain lit or later go to low-power mode;
- black-box housing remains open;
- site state becomes `partially_recovered` or `recovered`;
- revisiting shows the changed wreck.

---

# 9. Industrial-beam modes used

The same RMB tool supports:

- **repair** on relay;
- **cut** on brace;
- ordinary **extract** on geological targets elsewhere.

Required differences:

- target label;
- beam impact VFX;
- audio cue family;
- progress language;
- completion result;
- no generic mining yield on brace/relay.

This is exactly the kind of contextual depth that adds variety without a new button.

---

# 10. Story delivery

## 10.1 Flight fragments

Maximum roughly 8–20 words each.

Examples:

> BRIDGE PRESSURE RECORD ENDS BEFORE THE IMPACT.

> CARGO CLAMPS WERE RELEASED FROM INSIDE.

> THE FINAL TRANSMISSION IS ADDRESSED TO A SHIP THAT NEVER EXISTED.

Use only a few. Silence gives the object weight.

## 10.2 Ledger page

One illustrated page:

- title;
- recovered image or scan reconstruction;
- 80–180 words;
- map/provenance;
- related object IDs;
- no response buttons.

Possible image forms:

- cinematic reconstruction of the ship before destruction;
- black-box still;
- technical damage scan;
- crew photograph;
- route map.

Do not bake text into generated image.

## 10.3 No branch deletion

The player may later:

- return;
- install salvage core;
- recover another compartment;
- follow map lead;
- use blueprint.

No initial salvage action permanently deletes unrelated story content.

---

# 11. Automated salvage follow-on

This is a later slice, not required for first physical proof.

## 11.1 Claim action

Player installs a Massline/Salvage Core at a visible socket.

Requirements:

- construction module;
- power;
- cargo receiver;
- perhaps sensor coverage.

## 11.2 Output

Site periodically produces:

- scrap;
- electronics;
- rare component chance;
- story/evidence only once.

Output leaves through:

- courier pods;
- salvage tug;
- cargo receiver.

Do not credit invisible money directly if a physical export path exists.

## 11.3 Visual evolution

- salvage core appears;
- work lights activate;
- drones move around wreck;
- stripped areas grow;
- cargo pods accumulate/launch;
- site appears on player network map.

---

# 12. Optional combat use

If enemies appear:

- one small scavenger/pirate encounter;
- wreck pieces provide actual cover;
- impulse weapon can dash enemy into hull;
- massline can use engine block as anchor;
- no complex scripted boss.

The site should remain valuable without combat.

---

# 13. State and persistence

Recommended record:

```js
{
  worldObjectId: 'wreck_cathedral_01',
  state: 'discovered',
  components: {
    relay_a: 'offline',
    relay_b: 'offline',
    brace_port: 'intact',
    brace_starboard: 'intact',
    cargo_module: 'attached',
    black_box: 'sealed'
  },
  discoveries: [],
  automation: null
}
```

Transitions are explicit and idempotent.

Save/load tests:

- after one relay;
- after one brace;
- while payload detached but not delivered;
- after delivery;
- after black-box recovery;
- after leaving and returning.

Do not reconstruct a detached module twice.

---

# 14. File/owner plan

The implementing agent must inspect current owners before choosing exact paths. A plausible separation:

- data definition: `src/data/worldSites/` or equivalent;
- world-object state owner: existing world-record/site system;
- component interaction: shared component/work system;
- beam mode resolver: mining/tool owner;
- payload spawning: world/entity helper;
- massline: reuse current tether/throw systems;
- renderer: visual manifest + GLB;
- UI: target panel/reticle only;
- story: ledger/artifact data;
- tests/scripts: focused site route and visual capture.

Do not put the entire feature into `world.js`, `visualFactory.js`, or one giant UI file.

---

# 15. Agent task decomposition

## Task A — graybox and collision

Deliver:

- top-down graybox;
- gameplay scale;
- multi-circle proxy manifest;
- debug overlay;
- navigable channels;
- no interactions yet.

Acceptance capture before art detail.

## Task B — component grammar

Deliver:

- component anchors;
- screen-space pick;
- relay/brace states;
- work progress;
- persistence;
- placeholder but distinct component visuals.

## Task C — payload extraction

Deliver:

- brace completion detaches module;
- dynamic payload;
- massline attach;
- receiver zone;
- persistence.

## Task D — final visual and story

Deliver:

- hard-surface GLB/kitbash;
- state visual variants;
- short fragments;
- ledger image/page;
- LOD/performance.

Integrate in that order.

---

# 16. Anti-placeholder acceptance contract

The slice fails if any are true:

- the hero wreck is one sphere/ball;
- the visible wreck is mostly an asteroid;
- collision remains one central radius;
- channels are visual only;
- interaction targets the parent center instead of components;
- cutting produces ore;
- “power restored” is only a toast;
- detached module is immediately converted into cargo with no physical stage;
- black box is only a mission flag;
- completion leaves the wreck visually unchanged;
- feature is reachable only through debug/query route;
- screenshots are isolated asset renders instead of gameplay;
- agent claims completion without save/load and current route evidence.

---

# 17. Final acceptance matrix

| Observable | Required proof |
|---|---|
| Monumental scale | Gameplay screenshot with player ship |
| Unique silhouette | Far-approach screenshot |
| Aligned collision | Debug-overlay screenshot and traversal test |
| Open channels | Scripted player route through at least two |
| Component selection | Cursor/reticle capture |
| Relay repair | Before/after visual and state test |
| Brace cutting | Beam contact, removed brace, persisted state |
| Dynamic payload | Live tether/tow/throw capture |
| Black-box recovery | Ledger unlock and one-time grant test |
| Persistent change | Leave/re-enter and save/reload |
| Performance | Frame/draw-call evidence in normal route |
| No hidden route | Browser and Electron/default-path proof as applicable |

---

# 18. Pasteable implementation prompt

> Implement the **Wreck Cathedral vertical slice** against the current SpaceFace repository. Read all owner `AGENTS.md` files and current world, physics, massline, mining/tool, save, render, and unique-wreck seams before editing. Do not create a generic wreck entity or a central spherical collider.
>
> The player-visible outcome is a 320–600 wu split capital wreck made of several visible hull sections with aligned multi-circle or compound collision proxies and at least two traversable channels. The player scans targetable components, repairs at least one relay with the RMB industrial beam, cuts at least one visible brace with the same beam in a distinct CUT mode, causes a cargo/reactor module to detach as a real dynamic tetherable payload, moves that payload to a visible receiver with the massline, recovers a black box, and returns after save/load to a visibly changed wreck.
>
> Before coding, return an owner/file map, state-transition table, collision manifest strategy, component schema, normal-route interaction sequence, and proof plan. Then implement in bounded stages: graybox/collision, components, payload, final presentation. Use the shared physics/event owners; do not write velocity, credits, cargo, or save data from the wrong system. A green unit test is insufficient: provide current gameplay captures with collision overlay, component reticle, before/after state, and live massline extraction. Apply the anti-placeholder contract in this brief.
