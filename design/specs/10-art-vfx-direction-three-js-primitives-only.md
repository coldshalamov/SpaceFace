# Art & VFX direction (Three.js primitives only)

## Summary
A fully procedural visual layer for a semi-3D top-down space game: every mesh is built from Three.js r160 primitives (BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, TorusGeometry, OctahedronGeometry) merged via BufferGeometryUtils.mergeGeometries, every texture is a runtime <canvas> (noise/gradient/greeble/star), and every glow uses additive sprite halos + emissive materials plus ONE cheap single-pass bloom (bright-extract -> separable blur at 1/4 res -> additive composite via three custom ShaderMaterials and two WebGLRenderTargets, no postprocessing addon). The look is moody, high-contrast, near-black space with saturated per-faction emissive accents under a single tilted top-down chase camera. The VFX module owns a pooled GPU-Points/Sprite particle system driven entirely by event-bus events (weapon.fired, entity.damaged, entity.destroyed, mining.tick, shield.hit, ship.thrust, jump.start) so it never reaches into other systems' logic — it only reads transform/visual hints off GameState entities and spawns ephemeral visuals. A central VisualFactory caches geometries/materials/textures by key so 200+ entities share a handful of GPU resources. Determinism is preserved by seeding all procedural noise from entity.id; VFX particles are purely cosmetic and excluded from save/load.

## Mechanics
- RENDERER SETUP: WebGLRenderer({antialias:true, powerPreference:'high-performance', alpha:false}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); outputColorSpace=THREE.SRGBColorSpace; toneMapping=THREE.ACESFilmicToneMapping; toneMappingExposure=1.1; renderer.setClearColor(0x05060a,1). Scene.fog = new THREE.FogExp2(0x05060a, 0.00035) for far-depth haze.
- CAMERA: PerspectiveCamera(fov=42, near=2, far=4000). Chase rig: camera sits at player position + offset (0, 220, 130) in world units, lookAt(player + (0,0,-8)) giving a ~58deg downward tilt (top-down but angled so ship silhouettes read as 3D). Gameplay plane = XZ (y=0). Camera follows player with critically-damped lerp: camPos += (targetPos - camPos) * (1 - exp(-12*dt)). Zoom levels: combat 130wu height, cruise 220wu, map-peek 600wu (changed via offset scalar).
- LIGHTING (3-light moody rig, all directional/ambient — no per-entity point lights for perf): (1) KEY DirectionalLight color 0xbfd4ff intensity 1.6 from (-0.4,1,0.5) normalized, casts the primary form-defining highlight. (2) RIM/FILL DirectionalLight color 0x35507a intensity 0.55 from (0.6,0.3,-0.7) for cool shadow side. (3) AmbientLight color 0x101826 intensity 0.6 baseline so shadows never go pure black. NO shadow maps (top-down, cost not worth it) — depth read comes from the angled camera + emissive accents. Local glow is faked with additive sprite halos, not lights.
- MATERIALS POLICY: hulls = MeshStandardMaterial (metalness 0.6, roughness 0.5) with a procedural canvas albedo+roughness+emissive-mask texture; accent strips/engines/windows = MeshBasicMaterial or emissiveIntensity-boosted Standard (emissive picks up bloom). Projectiles/beams/halos/particles = MeshBasicMaterial or PointsMaterial with blending=THREE.AdditiveBlending, depthWrite=false, transparent=true so they glow without lighting. Nebula/starfield = Points with custom ShaderMaterial, additive, depthWrite=false.
- VISUAL FACTORY: getGeometry(key,builderFn) and getMaterial(key,builderFn) memoize into Maps; getTexture(key,canvasFn) memoizes CanvasTexture (set .anisotropy=4, .colorSpace where albedo). Ships of the same shipDefId+factionId share one geometry and one material instance; only the Object3D transform differs. Target: <40 unique geometries, <30 materials, <20 canvas textures for the whole game.
- SHIP CONSTRUCTION (generic recipe): build per shipClass from merged primitives in local space facing -Z (nose forward), then mergeGeometries into ONE BufferGeometry per class for 1 draw call. Apply faction material. Add a separate child Group 'accents' = additive emissive strip meshes (thin BoxGeometry 0.15 thick) + engine-glow Sprites. Scale whole ship to its def.length (wu). Pivot at center of mass. groups[]: hull, accents, engineSprites, shieldBubble(hidden until hit).
- ASTEROID CONSTRUCTION: IcosahedronGeometry(radius, detail=2 for small / 3 for large), then displace each vertex along its normal by fbmNoise(pos*freq, seed=entity.id) so radius varies +/-35%. Recompute normals (computeVertexNormals) and set flatShading=true on the material for faceted crystalline read. Per ore-type material/texture (see content). Slow tumble: rotation += seededAngularVel*dt on 2-3 axes.
- STATION CONSTRUCTION: central greebled core = cluster of 6-14 BoxGeometries of varied size merged ('greeble box cluster'), wrapped by 1-2 TorusGeometry rings (radius = core*1.6, tube 0.08*core) on different axes, plus 2-4 CylinderGeometry docking spars. Blinking nav lights = pool of small additive Sprites whose opacity is driven by a per-light phase: op = 0.3 + 0.7*step(0.5, fract(t*blinkHz + phase)). Slow ring rotation (0.05 rad/s). Window strips = emissive canvas texture on the core.
- PROJECTILE/BEAM VISUALS: bolt = small stretched additive mesh (CylinderGeometry r=0.5 len=6 oriented along velocity) MeshBasicMaterial color=weapon.color + a billboard Sprite halo (size 3x bolt) for glow. Beam (mining/laser) = a single CylinderGeometry between emitter and target, scaled.y to distance each frame, additive, with animated UV scroll via texture.offset for energy flow; core thin bright + outer wider faint cylinder.
- PICKUP VISUALS: spinning glowing gem = OctahedronGeometry(0.8) MeshStandardMaterial emissive=commodity.color emissiveIntensity 1.4, metalness 0.9 roughness 0.15, + additive halo Sprite (size 2.2, opacity pulsing op=0.5+0.3*sin(t*3)). Continuous spin rotation.y += 2.2*dt, rotation.x += 1.1*dt, and a bob y = baseY + 0.6*sin(t*2 + phase). Credits pickup uses gold gem, ore uses ore color, module uses faction-cyan.
- WRECK/DEBRIS: on entity.destroyed spawn a darkened static wreck = reuse the ship/asteroid geometry with a swapped 'charred' material (metalness 0.3, roughness 0.95, emissive 0, color multiplied 0.25) that fades alpha 1->0 over 8s then despawns; plus 6-12 small box/tetra debris chunks given outward impulse + tumble, handled by the particle/debris pool.
- PARTICLE SYSTEM ARCHITECTURE: one pooled THREE.Points cloud (BufferGeometry, dynamic position/color/size/age attributes, MAX 4000 live particles) using a custom additive ShaderMaterial that scales point size by 1/dist and fades by age. Plus a small pool (256) of textured Sprites for larger discrete effects (explosion flash, shockwave ring, muzzle flash). Emitters are spawn requests, not objects: each event pushes N particles with {pos,vel,life,size,color0,color1,drag,gravity=0}. Update integrates pos+=vel*dt, vel*=(1-drag*dt), age+=dt, recycles dead.
- ENGINE THRUST TRAIL: while ship.thrust active, emit 1 particle every ~16ms from each engine nozzle at ship rear: vel = -forward*(20..40) + jitter, life 0.35s, size 2.0->0, color0 = faction engine-hot (e.g. 0x66ccff) -> color1 dark blue, additive. Plus a persistent engine-glow Sprite at nozzle whose size/opacity tracks throttle (op = 0.2 + 0.8*throttle).
- MUZZLE FLASH: on weapon.fired spawn 1 Sprite at muzzle, size 4*scale, color=weapon.color, life 0.08s, scale punch 1.0->1.6 while opacity 1->0; plus 4-6 spark particles ejected along aim cone +/-12deg, life 0.15s.
- IMPACT SPARKS: on entity.damaged (kind='hull') spawn 8-14 spark particles at hit point, vel = reflect(incoming)*rand(15,35)+cone jitter, life 0.25s, color hot-white->weapon.color, size 1.4->0, drag 3.0; plus a tiny additive flash Sprite life 0.06s.
- EXPLOSION (on entity.destroyed): composite of (a) core flash Sprite size = 6*radius, white->orange, life 0.18s, scale 0.4->1.3; (b) 30-60 ember particles, color hot-yellow->ember-red->smoke-grey, vel radial rand(20,70), life 0.6-1.1s, drag 1.5, size 2.5->0; (c) expanding shockwave RING = a thin TorusGeometry or a ring Sprite scaled radius 0->8*size over 0.4s, opacity 0.8->0, color cool-white; (d) 6-10 debris chunks (small boxes) tumbling outward life 1.5s. Camera shake impulse emitted via event.
- MINING BEAM + ORE SPARKS: on mining active, draw beam cylinder emitter->asteroid (orange-white, animated UV); at asteroid contact point on mining.tick spawn 6-10 ore-spark particles colored by ore-type, vel back toward miner + jitter, life 0.3s, plus a small dust puff Sprite. When ore yields, spawn the pickup gem.
- SHIELD HIT RIPPLE: each ship has a hidden shieldBubble = IcosahedronGeometry(radius*1.15, detail 3) with a custom additive ShaderMaterial (fresnel rim + hex pattern from canvas). On shield.hit set bubble.visible, set shader uniforms uHitPoint(local), uTime=0, uColor=faction-shield; ripple expands from hit point as a sin pulse, full alpha 0.9 fading to 0 over 0.45s, then hide. Fresnel: alpha = pow(1-dot(normal,viewDir), 2.5).
- JUMP/WARP STREAK: on jump.start, (1) radial streak burst = 120 line-stretched particles spawned around player flying outward fast (vel 200) with elongated size, blue-white, life 0.5s; (2) a brief full-screen tunnel feel via temporarily scaling starfield streak length (star shader uStretch uniform 0->1->0 over 1.2s) and pushing exposure to 1.6 then back. On arrival, reverse inward streak.
- PARALLAX STARFIELD (3 layers, all THREE.Points, depthWrite=false, additive): L1 far = 1400 pts, size 1.0, color dim white/blue, parallax factor 0.05; L2 mid = 700 pts, size 1.6, factor 0.15; L3 near = 250 pts, size 2.4, colored sparkles, factor 0.35. Each layer is a big box volume (8000wu) recentered on camera each frame (modulo wrap) so it appears infinite. Star sprite = radial-gradient canvas texture. uStretch uniform turns dots into streaks during warp.
- NEBULA: 2-4 large additive Sprites (size 1500-3000wu) per sector using a procedurally generated soft fbm cloud canvas texture tinted by sector palette, placed far (y deep, behind play plane), parallax factor 0.02, very low opacity (0.12-0.25). Optionally a second THREE.Points dust field (300 pts, size 40, factor 0.08) tinted to sector for volumetric specks.
- CHEAP BLOOM (single lightweight post-pass, no addons): render scene to rtScene (HalfFloat). Pass1 bright-extract -> rtBright at 1/2 res (threshold uThreshold=0.65 on luminance, knee soft). Pass2/3 separable Gaussian blur (9-tap) horizontal then vertical at 1/4 res into rtBlurA/rtBlurB. Pass4 composite: fullscreen quad samples rtScene + uBloomStrength*rtBlur, additive, tonemap, output to screen. Total = scene + 3 cheap fullscreen quads. Implemented with 3 ShaderMaterials on an OrthographicCamera+PlaneGeometry quad and 3 WebGLRenderTargets; resize handler rebuilds RTs. Fallback flag bloomEnabled=false just renders scene directly for low-end.
- PER-FACTION VISUAL IDENTITY: each faction has palette{hull, accent(emissive), engine, shield} hex + a silhouette bias (Independent=blocky utilitarian, Syndicate=sleek angular, Federation=clean symmetric, Pirate=asymmetric jagged, Alien=organic curved via more cones/spheres). Material+accent color chosen from faction.palette at build time so a 'Pirate Frigate' and 'Federation Frigate' share the silhouette family but read instantly different by color+greeble density.
- PER-SECTOR MOOD: sector def carries {bg, fogColor, fogDensity, nebulaTint[], starTint, ambientTint, exposure}. On sector load, VFX applies these to fog, clear color, ambient light color, nebula sprites, starfield tint, and exposure — so each sector feels distinct (cold blue frontier vs green toxic nebula vs red conflict zone) with zero new assets.
- LOD & PERF: entities cull when outside camera frustum + margin (Frustum.intersectsObject). Beyond 1500wu, ships swap to a single billboard Sprite (icon) instead of mesh. Particles hard-capped at 4000; if pool full, oldest recycled. Accent sprite halos use a shared texture+material. Asteroid fields use InstancedMesh per ore-type when count>20 (one draw call per type). Target 60fps with ~150 visible entities + 2000 particles on mid hardware.

## State Owned
- render.scene: THREE.Scene — root scene graph (owned by render/VFX layer, not serialized)
- render.camera: THREE.PerspectiveCamera — chase camera (not serialized; recomputed from player transform)
- render.cameraOffset: {x,y,z} — current chase offset / zoom level (UI/settings, serialized)
- vfx.particles: pooled Points buffers {position:Float32[MAX*3], color, size, age, life, vel, alive:int} — runtime only, NOT serialized
- vfx.spritePool: Sprite[256] discrete-effect pool — runtime only
- vfx.shake: {mag:number, decay:number} — current camera-shake impulse, runtime only
- settings.bloomEnabled: bool — toggle the post bloom pass (serialized in settings)
- settings.bloomStrength: number (default 0.9), settings.bloomThreshold: number (default 0.65) — serialized tunables
- settings.particleQuality: 'low'|'med'|'high' -> caps MAX particles 1500/3000/4000 (serialized)
- settings.pixelRatioCap: number (default 2) — serialized
- entity.view: per-entity {root:Object3D, accents:Group, engineSprites:Sprite[], shieldBubble:Mesh, isBillboard:bool} — runtime handle attached on spawn, rebuilt from def on load, NOT serialized
- _visualSeed (derived from entity.id): used to seed procedural noise so meshes are deterministic across loads — not stored separately, recomputed

## Content
- FACTION PALETTE Independent | hull 0x6b7280 | accent/emissive 0x39d0ff (cyan) | engine 0x66ccff | shield 0x44aaff | silhouette: blocky utilitarian, low greeble
- FACTION PALETTE Federation | hull 0xd8dee9 | accent 0x4f9dff (clean blue) | engine 0x9fd0ff | shield 0x7fb8ff | silhouette: symmetric, paneled, clean
- FACTION PALETTE Syndicate(corp) | hull 0x2b2f3a | accent 0xc8a24a (gold) | engine 0xffcc66 | shield 0xe0b85a | silhouette: sleek angular wedge
- FACTION PALETTE Pirate | hull 0x3a2622 | accent 0xff3b30 (red) | engine 0xff7a3c | shield 0xff5540 | silhouette: asymmetric jagged, heavy greeble, spikes
- FACTION PALETTE Alien/Precursor | hull 0x223a2e | accent 0x46f0a0 (bio-green) | engine 0x7affc0 | shield 0x50ffb0 | silhouette: organic, cones+spheres, glowing veins
- FACTION PALETTE Mercenary/Guild | hull 0x4a3f55 | accent 0xb05cff (violet) | engine 0xc98cff | shield 0xa060ff | silhouette: mixed, modular
- SECTOR PALETTE Frontier(cold) | bg 0x05060a | fog 0x07101c density 0.00035 | nebulaTint [0x1c3a6e,0x103048] | starTint 0xcfe0ff | ambient 0x101826 | exposure 1.1
- SECTOR PALETTE Toxic Nebula | bg 0x06100a | fog 0x0a2016 density 0.0006 | nebulaTint [0x1d6b3a,0x0e4030] | starTint 0xbfeccd | ambient 0x12241a | exposure 1.05
- SECTOR PALETTE Conflict/Red Zone | bg 0x0d0606 | fog 0x200a0a density 0.0005 | nebulaTint [0x6e1c1c,0x401010] | starTint 0xffd2cf | ambient 0x261212 | exposure 1.15
- SECTOR PALETTE Core/Industrial | bg 0x080a0c | fog 0x141a22 density 0.00045 | nebulaTint [0x5a4a1c,0x2c2c3a] | starTint 0xfff0d0 | ambient 0x1c1e26 | exposure 1.1
- SECTOR PALETTE Deep/Precursor | bg 0x04060a | fog 0x0a0a18 density 0.0004 | nebulaTint [0x3a1c6e,0x16104a] | starTint 0xe0d0ff | ambient 0x161226 | exposure 1.2
- SHIP CLASS Scout/Shuttle | length 8wu | recipe: 1 cone nose (r1,h3) + 1 box body (3x1x4) + 2 thin engine cylinders rear | accents: 2 thin strips along body + 2 engine sprites | mass-feel: tiny, agile
- SHIP CLASS Fighter | length 12wu | recipe: cone nose + flattened box hull (4x0.8x6) + 2 swept wing boxes + 2 engines | accents: cockpit emissive dot + wing-edge strips | engine sprites x2
- SHIP CLASS Freighter/Hauler | length 28wu | recipe: long box spine (4x3x18) + stacked cargo-pod boxes (greeble) + bridge box front + 4 large engines rear | accents: running-light strips, cargo glow | sprites x4 | slow-feel bulky
- SHIP CLASS Frigate(combat) | length 22wu | recipe: wedge prow (cone+box) + segmented hull boxes + 2 side turret cylinders + 3 engines | accents: weapon-port glows, hull strips | sprites x3
- SHIP CLASS Cruiser/Capital | length 45wu | recipe: large multi-box spine + tower superstructure (greeble cluster) + 4-6 engines + torus sensor ring | accents: dense window strips, turret glows | sprites x6 | imposing
- SHIP CLASS Drone(mining/combat) | length 4wu | recipe: octahedron core + 2-3 small arm cylinders + 1 engine | accents: single pulsing core emissive | sprite x1
- ASTEROID TYPE Rock(barren) | material color 0x4a4540 roughness 0.95 metalness 0.05 flatShading | low emissive | sizes 6-40wu
- ASTEROID TYPE Iron ore | color 0x6b5a4a, emissive 0x804020 intensity 0.15, rusty speckle texture | metalness 0.4
- ASTEROID TYPE Ice/Water | color 0x9fd8e8 roughness 0.2 metalness 0.1, slight transmission look (high roughness fallback), emissive 0x2a6080 0.2
- ASTEROID TYPE Crystal/Rare | color 0x6a4aa0, emissive 0xb060ff intensity 0.5, sharp facets (detail 2 flat), inner glow halo sprite | high value cue
- ASTEROID TYPE Gas/Volatile | mostly a tinted additive sprite cloud + small core rock, emissive 0x40d090 0.4 | shimmering
- PROJECTILE Pulse bolt | color by weapon (cyan/red/gold) | cylinder r0.5 len6 + halo | speed visual matches sim velocity
- PROJECTILE Plasma blob | sphere r1.2 additive + trailing particles | color 0x40ff90
- PROJECTILE Railgun slug | thin long cylinder r0.3 len12 white-hot + long faint trail | very fast
- PROJECTILE Missile | small box body + cone tip + engine-trail particle stream | tracking
- BEAM Mining laser | orange-white animated cylinder + contact spark cluster
- BEAM Combat laser | continuous thin red/blue cylinder + flicker noise on opacity
- PICKUP Credits | gold octahedron gem 0xffcc44 emissive 1.4 + gold halo
- PICKUP Ore | gem tinted to ore-type color + matching halo
- PICKUP Module/Loot | cyan/violet gem 0x9b6cff + faction halo
- STATION Trade Hub | large greeble core + 2 torus rings + 4 docking spars + dense window strips + green/blue nav blinkers
- STATION Pirate Den | asymmetric jagged greeble + 1 tilted ring + red blinkers + spiky antenna cylinders
- STATION Mining Platform | flat industrial box cluster + ore conveyor cylinders + amber work-lights + attached refinery glow
- STATION Gate/Jump | large torus ring (r60) with inner additive swirling portal sprite (animated UV) + 8 ring blinkers

## Formulas
- Camera follow (critically damped): camPos += (playerPos + cameraOffset - camPos) * (1 - exp(-12*dt))
- Camera shake: shakeOffset = (rand2()-0.5) * shake.mag; shake.mag *= exp(-shake.decay*dt) [decay≈8]; applied to camera.position after follow
- Parallax layer recenter: layer.position = camera.position * (1 - parallaxFactor) (so layer drifts slower); wrap each star by ((p - cam) mod boxSize) to fake infinity
- Vertex displacement (asteroid): pos += normal * (baseR * (1 + 0.35*(fbm(pos*0.15, seed)*2-1)))
- fbm(p,seed) = sum_{o=0..3} amp_o * valueNoise(p*freq_o + seed), freq_o=2^o, amp_o=0.5^o, normalized to [0,1]
- Particle integrate: vel *= (1 - drag*dt); pos += vel*dt; age += dt; alpha = 1 - (age/life); dead when age>=life
- Particle screen size (vertex shader): gl_PointSize = size * (uScale / -mvPosition.z) clamped [1,64]; size lerps size0->size1 by age/life
- Particle color: color = mix(color0, color1, age/life)
- Engine glow opacity: op = 0.2 + 0.8*throttle; engine sprite scale = baseScale*(0.8 + 0.4*throttle)
- Explosion shockwave radius: r = 8*entityRadius * easeOutCubic(t/0.4); opacity = 0.8*(1 - t/0.4)
- easeOutCubic(x) = 1 - pow(1-x, 3)
- Pulsing pickup halo: op = 0.5 + 0.3*sin(t*3 + phase); gem bob y = baseY + 0.6*sin(t*2 + phase)
- Blinking nav light: op = 0.3 + 0.7*step(0.5, fract(t*blinkHz + phase)) [blinkHz≈0.6-1.2]
- Shield fresnel (shader): rim = pow(1 - max(dot(N, V), 0), 2.5); alpha = rim * uHitFade * (0.4 + 0.6*hexMask)
- Shield ripple from hit: ripple = sin(distance(localPos, uHitPoint)*0.4 - uTime*12) * exp(-uTime*4); alpha += clamp(ripple,0,1)*0.6
- Bloom bright-extract: b = max(luminance(c) - uThreshold, 0); bloomColor = c * (b / max(luminance(c),1e-4)); luminance = dot(c, vec3(0.2126,0.7152,0.0722))
- Gaussian 9-tap weights [0.227,0.194,0.121,0.054,0.016] (center+4 each side), step = texelSize * direction
- Bloom composite: outColor = sceneColor + uBloomStrength * blurColor; then ACES tonemap; uBloomStrength default 0.9
- Beam length scale: beamMesh.scale.y = distance(emitter,target); beamMesh.position = midpoint; quaternion = setFromUnitVectors(up, normalize(target-emitter))
- Billboard LOD swap: if distance(cam,entity) > 1500 -> show icon Sprite, hide mesh; hysteresis band 1400/1500 to avoid flicker
- Nebula/sprite far-fade: opacity = baseOp * smoothstep(farFade+200, farFade, distToCam) to hide pop-in

## Interactions
- ON 'entity.spawned' {id, defId, kind, factionId, transform} -> VisualFactory builds/clones mesh via shared geometry+material, attaches entity.view, adds root to scene. Reads: entity def (shipClass/oreType), faction.palette. Writes: entity.view (runtime).
- ON 'entity.removed' {id} -> dispose-free remove of root from scene, return any pooled sprites; no particle spawn (clean despawn).
- ON 'entity.destroyed' {id, pos, radius, factionId} -> spawn explosion (flash+embers+shockwave+debris), spawn fading wreck mesh, emit 'camera.shake' {mag: 0.6*radius clamp 4}. Reads pos/radius. Writes vfx pools.
- ON 'entity.damaged' {id, pos, hitPoint, normal, kind, amount} -> if kind=='shield' trigger shield ripple on entity.view.shieldBubble (set visible+uniforms); if kind=='hull' spawn impact sparks+flash at hitPoint. Reads transform.
- ON 'shield.hit' {id, hitPoint, factionId} (alias used by combat) -> same shield ripple path.
- ON 'weapon.fired' {ownerId, muzzlePos, dir, weaponDef} -> muzzle flash sprite + spark cone at muzzlePos; projectile visual is created via its own 'entity.spawned' (projectiles are entities). Reads weaponDef.color.
- ON 'projectile.impact' {pos, normal, weaponColor} -> impact sparks + flash (no entity needed).
- ON 'ship.thrust' {id, throttle, nozzles[]} (or read GameState.player.throttle each tick) -> emit trail particles per nozzle, update engine-glow sprite size/opacity. Reads throttle + nozzle local offsets from def.
- ON 'mining.start'/'mining.stop' {minerId, targetId} -> create/destroy mining beam between miner.view and target.view.
- ON 'mining.tick' {contactPos, oreType} -> ore-spark particles tinted by oreType + dust puff. ON 'mining.yield' {pos, oreType, qty} -> spawn ore pickup gem (its own entity.spawned).
- ON 'pickup.collected' {pos, commodityId} -> small sparkle burst + upward fade sprite (collection feedback).
- ON 'jump.start' {fromPos}/'jump.arrive' {toPos} -> warp streak burst + starfield uStretch ramp + exposure pulse; on arrive reverse.
- ON 'sector.loaded' {sectorDef} -> apply sector palette: scene.fog color/density, renderer clearColor, ambientLight.color, nebula sprite textures/tints, starfield uTint, exposure. Rebuild nebula sprites for the sector.
- ON 'camera.shake' {mag, decay?} -> set vfx.shake (max of current and new).
- ON 'camera.zoom' {level} -> lerp cameraOffset toward preset (combat/cruise/map).
- ON 'settings.changed' {bloomEnabled, bloomStrength, particleQuality, pixelRatioCap} -> toggle bloom pass, set uniforms, resize particle cap, set renderer.setPixelRatio.
- READS each tick from GameState: player + all active entities' position/rotation/throttle/alive to sync entity.view transforms (single pass), and frustum-cull. WRITES nothing back to sim state (pure presentation); VFX is excluded from save serialization.

## UI Needs
- DOM HUD must NOT be 3D — VFX provides screen-space hooks only: project(worldPos)->screenXY helper (camera.project) so the HUD overlay can place target reticles, damage numbers, nav markers, and offscreen-direction arrows over the canvas.
- World-to-screen projection API for: enemy lock-on brackets, mining-progress ring over target asteroid, pickup labels, station-dock prompt position.
- Low-health / low-shield screen vignette: VFX exposes a 'damageVignette' intensity (0-1) the DOM overlay renders as a red radial-gradient CSS layer (kept in DOM per the HTML-UI rule, fed by GameState.player.hull%).
- Settings panel controls (DOM) bound to settings.bloomEnabled, bloomStrength, bloomThreshold, particleQuality, pixelRatioCap, cameraOffset zoom — emit 'settings.changed'.
- Sector-entry title card + palette swatch: DOM reads sectorDef name/tint to show a brief banner; VFX only supplies the tint hex.
- Map view (DOM/canvas overlay): VFX can provide simplified top-down icon colors per faction (faction.palette.accent) so the map matches in-world ship colors.
- Photo/screenshot mode toggle: DOM button -> emit 'camera.zoom' + hide HUD; VFX bumps exposure/bloom for a 'beauty' frame.
- Performance readout: VFX exposes live particleCount, drawCalls (renderer.info.render.calls), fps for an optional DOM debug overlay.

## Risks
- 
