# Core simulation, flight physics & camera

## Summary
Foundational tick layer all other systems compose on. Defines the canonical Entity shape (a single flat struct used for ships/asteroids/stations/projectiles/pickups/drones/wrecks), a fixed-timestep 60 Hz simulation with an accumulator and render interpolation, semi-Newtonian flight physics (thrust accel + linear drag giving a soft max speed, turn-toward-mouse-aim rotation, boost/afterburner, strafe), keyboard-move + mouse-aim control, a spatial-hash broad phase with circle/circle response, and a tilted top-down chase camera with follow lerp, look-ahead and screen-shake. Gameplay is on the world XZ plane (Y = up, world is flat); facing is a yaw angle around +Y. Everything is data-driven and decoupled via GameState + event bus.

## Mechanics
- Coordinate plane: gameplay on XZ plane, +Y up, world is flat. pos/vel are THREE.Vector3 but y is held at 0 for sim; meshes sit at y=0 (stations/asteroids may extend in y visually only). Heading `rot` is yaw in radians measured from +X toward +Z (atan2(dz,dx)). Forward unit = (cos rot,0,sin rot).
- Units: distance world units (wu, ~1 m visually); speed wu/s; accel wu/s^2; ang vel rad/s; mass tonnes (t); money credits (cr); cargo volume u and mass t; time seconds (s).
- Fixed timestep: SIM_HZ=60, DT=1/60 s. Accumulator: accumulator += min(frameTime,0.25); while(accumulator>=DT){ snapshotPrev(); stepSim(DT); accumulator-=DT; }. Render alpha = accumulator/DT lerps pos and rot between prev and current snapshot so visuals are smooth and decoupled from sim rate.
- Sim step order per tick (fixed): 1 sample input -> 2 AI/intents -> 3 flight physics (thrust,drag,rotate) -> 4 weapons/projectile spawn -> 5 integrate positions -> 6 rebuild spatial hash -> 7 broad-phase + collision response -> 8 damage/health resolution -> 9 lifetime/TTL + alive sweep -> 10 spawn/despawn + event flush. Camera follow + render interpolation run in the RENDER loop, not the sim step.
- Entity storage: GameState.entities Map<id,Entity> + flat GameState.entityList for iteration; freed ids recycled. Entities are never spliced mid-step; set alive=false, swept at step end (emit 'entity.destroyed').
- Flight physics (semi-Newtonian): thrust force + linear drag proportional to velocity yields terminal/max speed with no hard clamp. accel=(thrustDir*thrust)/mass; vel += (accel - drag*vel)*DT. Terminal = thrust/(mass*drag); drag is derived per ship so terminal==spec maxSpeed. Safety clamp at 1.15*maxSpeed (2.0*maxSpeed while boosting) catches runaway.
- Rotation: ship turns toward target heading (mouse-aim world angle) at turnRate rad/s, clamped to not overshoot in one tick: d=wrapAngle(tRot-rot); step=clamp(d,-turnRate*DT,+turnRate*DT); rot+=step; angVel=step/DT.
- Thrust modes from input in SHIP-LOCAL frame: W = +forward thrust; S = reverse/brake at 0.5x; A/D = side strafe at 0.6x. Net vector summed then magnitude-clamped to thrust (boost raises the cap). No input => only drag acts (coast and slow).
- Boost/afterburner (Shift): thrust x2.2, speed clamp raised to 2.0x; drains boostEnergy at 28/s, regen 16/s when not boosting. Emits 'ship.boost.start/stop'.
- Control scheme = keyboard move + mouse-aim (chosen over twin-stick). WASD moves in ship-local frame; the mouse cursor projected onto the XZ plane sets desired heading AND is the convergence aim point for weapons; Shift=boost, Space=fire (weapons system reads state.input). Decouples movement from aim, gives precise weapon convergence, ideal for desktop/Steam and the Freelancer/Rebel-Galaxy feel.
- Mouse->world each frame: raycast camera through cursor onto plane y=0 (THREE.Plane(0,1,0,0)); store state.input.aimWorld. Desired heading = atan2(aim.z-ship.z, aim.x-ship.x).
- Camera: PerspectiveCamera fov 50, tilt 60deg from horizontal (0=flat,90=top-down), zoom distance D default 70 wu. Offset is WORLD-axis fixed: (0, D*sin tilt =60.6 wu high, -D*cos tilt =35 wu back). Camera follows position but NOT ship yaw, so the world never spins under the player (anti-nausea).
- Camera follow: focus = player.pos + lookAhead; camPosTarget = focus + camOffset; camera.position.lerp(camPosTarget, 1-exp(-CAM_LERP*frameDt)) (frame-rate-independent). camera.lookAt(focus + shakeOffset).
- Look-ahead: focus shifts ahead along velocity up to LOOKAHEAD_MAX=18 wu (k=0.35) plus a 0.25 nudge toward the mouse aim for situational awareness.
- Screen-shake: additive trauma model. trauma in [0,1], trauma -= 1.6*dt. shakeOffset = maxShake*trauma^2*rand[-1,1] per X/Z axis + 0.04 rad roll. LISTENS 'camera.shake'{amount} -> trauma=min(1,trauma+amount).
- Spatial hash broad phase: uniform grid cell=64 wu, key from floor(x/cell),floor(z/cell). Rebuilt each step from entityList. Query 3x3 neighbor cells for candidates; large static bodies (stations) inserted into every overlapped cell. O(n) at uniform density.
- Collision = circle/circle on XZ via radius (collide if dist < rA+rB). Pair eligibility via collisionMask bitflags. Response by type: ship/ship & ship/asteroid = positional separation + restitution impulse; projectile/target = emit 'projectile.hit' then alive=false; pickup/ship = emit 'pickup.collected'; ship/station = soft bounce + 'dock.range'. Stations/asteroids treated as invMass~0 (immovable).
- Collision impulse (e=0.2): n=(B.pos-A.pos)/d; separate by penetration split by inverse mass; relVN=(B.vel-A.vel)·n; if <0 j=-(1+e)*relVN/(invMa+invMb); apply j*n scaled by each inverse mass. invMass=0 for static bodies.
- Damage resolution (values from combat): on 'projectile.hit'{target,damage} apply to shield then hp: absorbed=min(shield,dmg); shield-=absorbed; hp-=dmg-absorbed; if hp<=0 alive=false, emit 'entity.killed'{id,killerId}. Shield regen owned by combat/module system.
- Lifetime/TTL: projectiles & fx carry ttl(s), ttl-=DT, <=0 => alive=false. Pickups have despawnAt (simTime). Wrecks linger ~25s then fade.
- Determinism: single seeded mulberry32 GameState.rng used by all systems (sim never calls Math.random) for reproducible saves/replays. Float-deterministic given same seed+inputs.
- Pause/timescale: GameState.timeScale (0=pause,1=normal,>1 fast-fwd) gates how many sim steps run; render/camera keep running. Cap steps/frame at 8 to avoid spiral-of-death.

## State Owned
- entities: Map<number,Entity> — authoritative store of all world objects
- entityList: Entity[] — flat iteration array kept in sync with the map
- nextEntityId: number — monotonic id allocator
- freeIds: number[] — recycled entity id pool
- playerId: number — entity id of the player ship
- spatialHash: { cell:number, buckets:Map<string,number[]> } — broad-phase grid, rebuilt each step
- accumulator: number — fixed-timestep accumulator (s)
- simTime: number — total simulated seconds (authoritative clock for TTL/despawn)
- tick: number — integer sim step counter
- timeScale: number — 0=paused, 1=normal, >1 fast-forward (sim only)
- rng: function — seeded mulberry32 PRNG; rngSeed:number persisted for save/load
- input: { moveX:number, moveZ:number, boost:bool, fire:bool, aimWorld:{x,z}, aimAngle:number } — sampled control state
- camera: { obj:THREE.PerspectiveCamera, tilt:number, zoom:number, trauma:number, shakeOffset:Vec3, focus:Vec3, lerp:number, lookAhead:number } — camera runtime state
- bounds: { radius:number, hardRadius:number, center:{x,z} } — soft+hard sector boundary used by physics, set per-sector

## Content
- ENTITY TYPES enum: 'ship' | 'asteroid' | 'station' | 'projectile' | 'pickup' | 'drone' | 'wreck' | 'fx'
- Canonical Entity shape (EVERY object has all of these; per-type payload lives in `data`): { id:number, type:string, alive:boolean, factionId:string|null, pos:Vector3(y=0), vel:Vector3(y=0), prevPos:Vector3, rot:number(yaw rad), prevRot:number, angVel:number, radius:number(wu), mass:number(t), hp:number, maxHp:number, shield:number, maxShield:number, thrust:number(force), turnRate:number(rad/s), maxSpeed:number(wu/s), drag:number(1/s), ttl:number|Infinity, collides:boolean, collisionMask:number(bitflags), team:number, ownerId:number|null, mesh:THREE.Object3D|null, flags:{boosting,docked,invuln,noInterp}, data:object }
- COLLISION MASK bitflags: SHIP=1, ASTEROID=2, STATION=4, PROJECTILE=8, PICKUP=16, DRONE=32, WRECK=64. Pair collides if (A.collisionMask & B.typeBit) && (B.collisionMask & A.typeBit).
- SHIP Scout — mass 18t, thrust 520, maxSpeed 95 wu/s, turnRate 3.4 rad/s, drag 0.304, radius 3.2, maxHp 60, maxShield 40, boostEnergy 100
- SHIP Fighter — mass 28t, thrust 1050, maxSpeed 110 wu/s, turnRate 4.2 rad/s, drag 0.341, radius 3.8, maxHp 110, maxShield 90, boostEnergy 140
- SHIP Miner — mass 60t, thrust 720, maxSpeed 60 wu/s, turnRate 1.8 rad/s, drag 0.20, radius 5.5, maxHp 180, maxShield 60, boostEnergy 90
- SHIP Freighter — mass 120t, thrust 1600, maxSpeed 55 wu/s, turnRate 1.3 rad/s, drag 0.242, radius 7.5, maxHp 320, maxShield 120, boostEnergy 80
- ASTEROID — mass 200-2000t (scales w/ radius), radius 6-22 wu, maxHp=radius*14, drag 0, slow random angVel (visual), invMass~0 in response, data:{ore:'iron'|'copper'|'ice'|'titanium', hardness, yield}
- STATION — mass Infinity (invMass 0), radius 30-60 wu, vel 0, data:{dockRadius=radius*1.8, services:['trade','shipyard','repair'], factionId}; emits 'dock.range' when player inside dockRadius
- PROJECTILE — radius 0.4-1.2, mass ~0 (ignored in response), ttl=range/speed, vel=aimDir*projSpeed + 0.5*ownerVel, data:{damage,damageType,ownerId,weaponId}, collisionMask=SHIP|ASTEROID|STATION|DRONE; swept-circle test to prevent tunneling
- PICKUP — radius 1.5, mass 1, drag 1.2, despawnAt ~simTime+60s, data:{kind:'ore'|'credits'|'cargo'|'module', amount, commodityId}, collisionMask=SHIP|DRONE; magnet toward player within 25 wu
- DRONE — mass 6t, thrust 180, maxSpeed 70, turnRate 3.0, drag 0.43, radius 1.8, maxHp 30, data:{job:'mine'|'haul'|'escort', homeId, targetId}
- WRECK — mass=parent*0.6, radius=parent.radius*0.8, drag 0.5, random angVel, ttl 25s (fade last 5s), data:{loot:[...]}, collisionMask=SHIP
- CAMERA constants: fov 50, tilt 60deg, zoom/D default 70 wu (scroll-wheel clamp 45..130 via 'camera.zoom'), CAM_LERP 6.0 /s, LOOKAHEAD_K 0.35, LOOKAHEAD_MAX 18 wu, aimBias 0.25, near 1, far 4000
- SCREEN-SHAKE constants: SHAKE_DECAY 1.6 /s, maxShake 2.2 wu + 0.04 rad roll. Trauma adds: light hit 0.15, heavy hit 0.35, player explosion 0.8, boost start 0.1, asteroid mined 0.05
- SPATIAL HASH cell 64 wu; large static bodies inserted into all overlapped cells
- BOUNDS: default sector radius 2500 wu (inward accel 40 wu/s^2 + 'leaving.sector' beyond), hard wall 3000 wu reflects velocity

## Formulas
- DT = 1/60 s; clamp frameTime to <=0.25 s before accumulating; cap sim steps per frame at 8
- drag per ship so terminal==maxSpeed: drag = thrust / (mass * maxSpeed)  [1/s]
- linear integrate: accel = thrustVec/mass ; vel += (accel - drag*vel)*DT ; pos += vel*DT
- terminal speed (no boost): vTerm = thrust/(mass*drag) == maxSpeed
- boost: effThrust = thrust*2.2 ; speedClamp = (boosting?2.0:1.15)*maxSpeed ; if |vel|>speedClamp vel.setLength(speedClamp)
- rotation: d = atan2(sin(tRot-rot),cos(tRot-rot)) ; rot += clamp(d,-turnRate*DT,turnRate*DT) ; angVel = step/DT
- wrapAngle(a) = atan2(sin a, cos a)
- forward = (cos rot,0,sin rot) ; right = (-sin rot,0,cos rot)
- local thrust compose: T = forward*((W?1:0)-(S?0.5:0))*thrust + right*((D?1:0)-(A?1:0))*0.6*thrust ; if |T|>effThrust T.setLength(effThrust)
- mouse->world: ray=raycaster(camera,ndcMouse) ; t = -ray.origin.y/ray.dir.y ; aimWorld = ray.origin + ray.dir*t
- desired heading: tRot = atan2(aimWorld.z-ship.z, aimWorld.x-ship.x)
- camera offset (world axes, no ship yaw): camOffset = (0, D*sin(tilt), -D*cos(tilt))
- frame-rate-independent follow: a = 1 - exp(-CAM_LERP*frameDt) ; camera.position.lerp(targetPos, a)
- look-ahead focus: focus = player.pos + velDir*min(speed,maxSpeed)*LOOKAHEAD_K (cap LOOKAHEAD_MAX) + (aimWorld-player.pos)*aimBias
- screen shake: trauma=max(0,trauma-SHAKE_DECAY*frameDt) ; s=trauma^2 ; shake=(rand[-1,1]*maxShake*s,0,rand[-1,1]*maxShake*s) ; roll=rand[-1,1]*0.04*s
- render interpolation: renderPos = lerp(prevPos,pos,alpha) ; renderRot = prevRot + wrapAngle(rot-prevRot)*alpha ; alpha = accumulator/DT (skip if flags.noInterp)
- spatial hash key: cx=floor(x/cell), cz=floor(z/cell), key = `${cx},${cz}`
- collision overlap: dx=bx-ax, dz=bz-az, d2=dx*dx+dz*dz, R=ra+rb ; collide if d2<R*R ; d=sqrt(d2)
- separation: pen=R-d ; n=(dx,dz)/d ; invSum=invMassA+invMassB ; A.pos -= n*pen*invMassA/invSum ; B.pos += n*pen*invMassB/invSum
- impulse: relVN=(B.vel-A.vel)·n ; if relVN<0 j=-(1+e)*relVN/invSum (e=0.2) ; A.vel -= n*j*invMassA ; B.vel += n*j*invMassB
- invMass = (mass===Infinity ? 0 : 1/mass)
- swept projectile vs circle: closest point of segment prevPos->pos to target.pos within (rProj+rTarget) => hit
- damage: absorbed=min(shield,dmg) ; shield-=absorbed ; hp-=dmg-absorbed ; if hp<=0 alive=false
- projectile spawn: vel = aimDir*projSpeed + ownerVel*0.5 ; ttl = weaponRange/projSpeed
- boost energy: boosting -> boostEnergy -= 28*DT (floor 0) ; else boostEnergy = min(max, boostEnergy + 16*DT)
- sector bounds: r=dist(pos,center) ; if r>boundRadius vel += (center-pos)/r*40*DT ; if r>hardRadius reflect vel about radial normal

## Interactions
- EMITS 'entity.spawned' {id,type,entity} — render/audio/minimap create visuals
- EMITS 'entity.destroyed' {id,type} — render disposes mesh, id pooled (swept at step end)
- EMITS 'entity.killed' {id,killerId,type,pos,faction} — spawn makes wreck/loot, combat awards bounty, missions check objectives
- EMITS 'projectile.hit' {targetId,ownerId,damage,damageType,pos} — combat resolves damage, FX/audio impact
- EMITS 'collision' {aId,bId,impulse,pos} — audio clunk, FX sparks, combat handles ram damage
- EMITS 'pickup.collected' {pickupId,collectorId,kind,amount,commodityId} — cargo/economy credits the collector
- EMITS 'dock.range' {stationId,shipId,inRange} — station/UI shows dock prompt
- EMITS 'ship.boost.start' / 'ship.boost.stop' {shipId} — audio pitch, thruster FX
- EMITS 'leaving.sector' {shipId,dist} — UI warning, AI turn-back
- LISTENS 'camera.shake' {amount} — any system adds camera trauma (weapons, explosions, mining, boost)
- LISTENS 'camera.zoom' {delta} — mouse wheel adjusts camera.zoom within clamp
- LISTENS 'sim.pause'/'sim.resume'/'sim.timescale' {scale} — sets GameState.timeScale (menus, bullet-time)
- LISTENS 'entity.spawn.request' {spec} — canonical factory: builds an Entity from data spec, assigns id, inserts into entities/entityList, emits 'entity.spawned'; ALL systems create entities this way
- LISTENS 'entity.kill' {id,killerId} — force-kill (mission scripts, console)
- READS state.input (written by input system) for player intent; AI writes equivalent intent onto NPC entity.data.intent which physics reads identically
- PROVIDES helpers used everywhere: spawnEntity(spec), getEntity(id), queryRadius(pos,r)->Entity[] (spatial hash), raycastToPlane(ndc)->{x,z}, worldToScreen(pos)->{x,y,onScreen} for DOM HUD markers
- SAVE/LOAD: serializeState() dumps entities (minus mesh refs), simTime, tick, rngSeed, camera zoom; loadState() rebuilds entities and re-emits 'entity.spawned' so render re-creates meshes
- UPDATE-ORDER dependency: input -> ai -> THIS(physics/integrate/collision/damage) -> weapons read positions -> economy/cargo on pickup events -> render+camera(interp) last

## UI Needs
- worldToScreen(entity.pos) projection helper so the DOM HUD can anchor off-screen target arrows, enemy/loot/station markers, and floating damage numbers to world entities each frame
- Player vitals feed: hp/maxHp, shield/maxShield, boostEnergy/max, current speed (|vel|) and maxSpeed for HUD bars and throttle readout
- Boost/afterburner state + energy for a HUD energy bar and thruster glow
- Camera zoom level indicator and optional recenter affordance
- Dock prompt: on 'dock.range' inRange=true show 'Press F to dock' near the station marker
- Sector-bounds warning banner driven by 'leaving.sector' (distance + direction-to-center arrow)
- Screen-shake affects only the 3D camera; the screen-space DOM HUD is immune and stays readable — UI layer relies on this
- Radar/minimap feed: queryRadius around player returns nearby entities with type/faction for the DOM radar widget
- Pause overlay hook: when timeScale=0 show menu; sim frozen but camera/UI remain live

## Risks
- Plane/axis convention (XZ, +Y up, yaw from +X toward +Z): every subsystem must agree via one shared forward-vector helper, or aim/movement/camera desync.
- Camera must follow position but NOT ship yaw (world-locked) or the world/starfield spins under the player and induces nausea; keep look-ahead subtle.
- Render interpolation needs prevPos/prevRot snapshotted at the START of each sim step; missing it, or interpolating across teleports/spawns, streaks visuals — use flags.noInterp on those frames.
- Drag-derived max speed: changing thrust/mass without recomputing drag silently changes top speed; always derive drag = thrust/(mass*maxSpeed) at ship build / on module change.
- Spatial hash cell (64 wu) is smaller than big stations (radius up to 60): insert large static bodies into all overlapped cells (or hold them in a separate static list) or they miss collisions.
- Fast small projectiles tunnel through thin targets at 60Hz: use swept segment-vs-circle test for projectiles, not point overlap.
- Treat asteroids/stations as invMass~0 in response; finite-huge mass causes jitter and lets the player shove a mountain.
- Frame-rate-independent smoothing must use a=1-exp(-k*dt); naive lerp(a,b,k*dt) feels different per FPS.
- timeScale>1 runs many steps/frame; cap steps per frame at 8 and clamp frameTime to 0.25s to avoid spiral-of-death on tab refocus.
- Determinism breaks if any system calls Math.random instead of state.rng — enforce the single seeded PRNG.
- The entity.data bag is a coupling risk: namespace per-type payloads and document them so systems don't collide on field names.
- Never delete a THREE mesh inside the sim step (render owns GL resources); set alive=false and let render dispose on 'entity.destroyed'.
