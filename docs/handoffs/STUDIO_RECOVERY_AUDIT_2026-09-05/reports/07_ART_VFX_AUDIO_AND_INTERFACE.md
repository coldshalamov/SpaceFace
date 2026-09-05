# 07 — Art direction: stylized industrial energy
## Less polished metal, more authored expression

The visual target should be stated plainly: **solid, readable industrial forms with expressive luminous machinery and effects**. Not photorealism assembled imperfectly. Not flat cartoon tiles. Not a generic neon filter over the current assets. The present owner request asks for a more artistic, brighter, glowy arcade expression; older rulings still provide useful protection against primitive stand-ins and the flattening of the rover. Those requirements are compatible. [VISION] [ROVERLAW] [VFXLAW]

This chapter is an art-direction proposal derived from the request and inspected source rules. No fresh gameplay screenshot was visually inspected in this audit. I therefore do not assign current assets an invented visual score or claim a particular material is visibly wrong at the audited commit.

## 7.1 What the visual grammar should communicate

A ship's first read is direction, role, mass, and active state. A target's first read is intention and vulnerability. A scene's first read is navigable space, useful matter, and danger. Details that do not support those reads need a strong secondary purpose to justify their cost.

Use broad, matte or satin color masses on hull structure. Reserve tightly controlled specular response for selected edges, tools, exposed mechanisms, glass, or deliberate accent materials. Paint is not simply colored bare metal; author its surface response accordingly. Keep material variation large enough to survive the actual camera rather than relying on tiny scratches that disappear in motion.

Use emission to explain activity: engines generating force, an energized tool, a loaded Massline, a charged attack, a stressed shield, a productive machine, a blocked output. A luminous feature should have a state and a reason. A hull covered in permanent equally bright lines makes the active state harder to identify.

Give each role a coherent silhouette language. A tow specialist can advertise a clear load path and attachment apparatus. A fast craft can look directional without being covered in shiny fins. A heavy work hull can show payload and processing equipment without requiring every bolt to be individually modeled. The existing asset standard already places macro form before microdetail; that principle should become the art team's practical priority. [ASSETLAW]

## 7.2 Three levels of visual attention

**Primary:** the player's action, an imminent threat, the selected physical relation, or an irreversible consequence. These can use the strongest luminance, sharpest motion, most directional shapes, and best synchronized audio.

**Secondary:** other combatants, useful cargo, nearby industrial state, and navigational geometry. These must remain legible, but they should not continuously compete with the primary event.

**Atmosphere:** distant stars, planets, nebular structure, remote traffic, and noncritical environmental motion. These establish place and scale. They should leave contrast room for the action.

This hierarchy is dynamic. A quiet cargo pod becomes primary when it is the contested payload. A distant ship becomes primary when it telegraphs an attack. The solution is not to permanently darken everything except the player; it is to let state allocate attention.

Measure this at the gameplay camera with motion, normal HUD, and representative density. A neutral asset turntable remains useful for authoring, but it cannot prove that a ship is readable during a fast turn. The current asset standard correctly rejects unsupported close-up beauty shots as evidence of gameplay-camera quality. [ASSETLAW]

## 7.3 Revise technique prohibitions into an effect-specific matrix

The VFX standard correctly diagnoses hard clipping, cheap blurry stand-ins, rigidly attached histories, and effects with no designed internal form. Keep those rejection criteria. But its all-effects construction rules overgeneralize one excellent thin-plasma reference into techniques that every other phenomenon must use. [VFXLAW]

| Effect class | Preferred construction to prototype | What must survive at play scale | What to reject |
|---|---|---|---|
| Engine jet | Short authored geometric sheets or a high-quality hybrid tied to nozzle state | Direction, thrust envelope, clear hot core and internal motion | A rigid long cone, striped cylinder, featureless transparent blob |
| Flight history | Bounded world-space ribbon or trail mesh with shared materials | The path actually flown, controlled aging, continuity through turns | A long tail that rotates wholesale with the ship |
| Heavy impact | Directional mesh/sheet impulse, structured flash and fragments; an authored flipbook can support it | Contact point, normal/tangent, severity and timing | An identical round bloom for every weapon and surface |
| Shield response | Surface-local arc or shell treatment plus a brief directional accent | Which side was hit and whether the shield held, broke, or recovered | Permanent bright bubble hiding the hull |
| Gas, smoke, dust | Purpose-specific hybrid or authored volume/flipbook within a bounded fill budget | Dense/empty structure, depth and collision/context relationship | Giant repeated soft squares or unbounded transparent overdraw |
| Debris and cargo | Opaque authored or instanced solid forms; emission only where justified | Mass, silhouette, ownership, interaction state | Glowing transparent primitives replacing solid matter |
| Massline | Stable endpoint geometry, line state, loaded/reeling/selected distinctions | The physical relation and its next consequence | A screen-space stroke detached from the actual bodies |
| Background | Seeded regional composition, distant star fields, depth-separated landmarks | Scale, stable place identity, calm contrast behind gameplay | Clipping hero geometry, repeated near-field domes, atmospheric noise everywhere |

A technique is not inherently professional because it is expensive or inherently cheap because it uses a quad. The failed result is the placeholder appearance: no authored shape, poor depth, bad clipping, wrong scale, and insufficient temporal structure. An authored impact flipbook used appropriately is different from a radial-gradient blob used as the whole effect. The revised standard should explain that distinction instead of encouraging agents to spend weeks proving that every spark is real geometry.

Retain the useful separation between a short jet and a long history. Retain world-space aging, asymmetric state transitions, bounded lifetime, and camera-scale review. Permit geometry, textures, and hybrids to contribute in proportions appropriate to the effect. [VFXLAW]

## 7.4 Glow requires composition, not just higher bloom strength

The current post processor already uses an HDR scene target, a compact multi-scale bloom path, and a shared presentation composite. Its default bloom strength is 0.52, and the inspected Helios profile no longer applies the old large reduction identified in an earlier audit. Turning up an obsolete constant is not the recovery task. [BLOOM] [SECTORART] [ALIGNMENT]

Design the source radiance first. A thin bright core with a structured surrounding falloff produces a different image from a large moderately bright area, even under the same bloom setting. Reserve headroom for peaks and prevent the additive sum of many effects from washing out orientation and target color.

The inspected composite applies its scene tone-map choice and then adds bloom before final encoding/clamping. That can be an intentional aesthetic choice; it is not automatically a color-management bug. It can also clip saturated combined highlights differently from a pipeline that combines radiance before tone mapping. Compare the two on actual intended effect colors, dense overlap, and bloom-off parity. Do not change the pipeline based on a generic rule without preserving the target image. [BLOOM]

Keep color-space handling explicit. Three.js uses a linear working color space; UI-style color inputs and texture data need the intended conversion. The repository's custom shader composition must not accidentally encode sRGB twice. Verify against the actual library revision and the existing post route rather than mixing current documentation examples into an older custom pipeline. [THREECOLOR] [BLOOM]

A small presentation envelope can make a state feel responsive without a hard pop:

```js
// Presentation-only example. Integrate into the existing effect owner.
function stepEnvelope(current, target, dt, attackSeconds, releaseSeconds) {
  const tau = target > current ? attackSeconds : releaseSeconds;
  if (!Number.isFinite(dt) || dt < 0 || !(tau > 0)) return current;
  const alpha = -Math.expm1(-dt / tau);
  return current + (target - current) * alpha;
}
```

Drive reach, core radiance, internal motion, or carefully authored coverage from that envelope. Do not make every channel increase together. A machine spooling up may brighten before its plume extends; a cooling trail may lose its core while retaining a broader colder form. This is a design sketch, not a replacement for the existing VFX state machine.

## 7.5 Backgrounds should establish place without entering the physical foreground

The sector visual profiles already separate composition, density/structure, lighting, and post parameters. They also contain projection-aware hero placement. Preserve that data-driven regional foundation. Do not return to random independent background objects whose combined composition nobody authored. [SECTORART]

Define a stable regional identity through large-scale arrangement: open void with a dominant limb, a broken dust lane, clustered stars with a calm navigation corridor, or distant industrial light. Variation should alter composition and structure, not simply apply a different tint.

Keep far-sky objects at a consistent depth policy and out of collision/interaction logic. A planet can be a carefully authored far-sky representation; it need not be an enormous detailed mesh near the flight camera. Check projection, horizon crossing, near/far clipping, and transitions across the full legal camera envelope. A rule pinning one landmark to an exact screen coordinate should not prevent a better composition once the camera or owner direction changes.

Do not make the background busier to compensate for uninteresting foreground play. The important activity belongs in the navigable space: useful objects, readable traffic, work, and conflict. Background art supplies scale and mood while leaving those events room to speak.

## 7.6 Effects, camera, and sound are one event

The current feel system already includes collision response, hit-stop requests, FOV punch, refractory behavior for impacts, and speed-line ceilings. Treat it as the coordinator for emphasis rather than adding a new shake or zoom in every weapon. [FEELFX]

A single event should have an authored sequence: anticipation, contact, consequence, recovery. Sound often establishes timing more precisely than a broad screen effect. A heavy release can combine a short mechanical transient, a body-weight sound, a directional impulse, and a diminishing tail. A sustained tool should change its sound with work state rather than replaying the same impact sample at every tick.

Prioritize audio that makes action understandable: successful attachment, loaded line, release, valid and invalid drilling, shield break, weapon vent, engine mode change, committed purchase, and blocked production. This minimum audio layer belongs in the first playable proof even though broad audio direction is currently grouped with release work. [BUILD]

Avoid constant full-volume impact stacking. Repeated low-value events can mask the attack the player needs to hear. Use event priority, concurrency limits, spatial relevance, and distinct frequency/temporal character. These are proposed mix principles, not a claim that the current audio engine lacks every one of them; its full implementation was not audited here.

Respect the existing reduced-motion path. Reduced shake must not mean reduced information. Preserve directional cues, state transitions, and readable timing without mandatory FOV changes or time distortion. The owner wants expressive effects, not the camera behaving like it lost an argument with the ship.

## 7.7 Interface: direct decisions, not ornamental instrumentation

The outfitting screen already uses a central engineering stage, fit tree, hardpoint highlights, gauges, previews, and explicit purchase/fit validation. A recommendation to “add a professional 3D fitting screen” would miss the actual problem. The question is whether the player can compare a meaningful alternative and act on it without unnecessary work. [OUTFIT]

For fitting, prioritize current versus proposed capability, the exact blocker, the actual cost, and a reversible test. For trading, prioritize load, whole-transaction proceeds, destination relevance, and information age. For the rover, prioritize the working face, placement consequence, and output state. For flight, prioritize immediate actionable information over a general dashboard.

Do not apply one homogeneous visual grammar so rigidly that all these tasks become the same collection of panels. Shared typography, spacing, focus behavior, and controls are useful. Information hierarchy should follow the task. The current build map's frontend grammar requirement should support that distinction rather than turn a matrix into the definition of usability. [BUILD]

Generate key labels from the actual binding source. Preserve keyboard focus, back/cancel behavior, scalable text, and non-color-only distinctions. A stylish amber warning is useless if the only way to distinguish it from normal status is hue, or if the button it describes uses an outdated binding.

## 7.8 Art acceptance before whole-fleet production

Approve a small style slice: the starter, one contrasting enemy, one useful solid object, one landmark, one industrial machine, and a representative set of action effects. Evaluate them together at the shipping camera in quiet flight, dense combat, and the rover. Those are proposed review contexts, not a request to restart the entire asset catalog.

Accept only when the scene reads as one authored world, the player's action has expressive feedback, and the target hardware budget holds. Then derive reusable material families, effect recipes, LOD rules, and regional composition profiles. This turns the next asset task into execution of an observed style rather than another agent's independent interpretation of “premium.”

Retain independent visual acceptance. A geometry validator, source-art ledger, or test suite cannot certify artistic quality. But make the proof burden proportional to the asset's actual visibility and role. The highest craft is not the largest audit form; it is a consistent, expressive result the player can read while moving.

<!-- Source links are pinned to the audited commit. -->
[VISION]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/VISION.md
[BUILD]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/CANONICAL_BUILD_MAP.md#L1-L145
[ALIGNMENT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/VISION_ALIGNMENT_PLAN.md#L1-L180
[OUTFIT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/ui/screens/outfitting.js#L1-L180
[ROVERLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/ASTEROID_WORKS_DESIGN_LAW.md#L1-L210
[BLOOM]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/render/bloom.js#L1-L190
[SECTORART]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/sectorVisualProfiles.js#L1-L150
[FEELFX]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/render/feel.js#L1-L190
[VFXLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/docs/visual-assets/VFX_TECHNIQUE_STANDARD.md#L1-L145
[ASSETLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md#L1-L140
[THREECOLOR]: https://threejs.org/docs/pages/Color.html
