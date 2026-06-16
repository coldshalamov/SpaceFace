# Procedural Audio + Save/Load & Meta

## Summary
Two service-layer ES modules wired into the fixed update order and the event bus. AudioSystem builds a Web Audio graph (master->limiter->buses) and renders all SFX/music procedurally from oscillators, noise buffers, ADSR envelopes and biquad filters; it listens to gameplay events, plays positional one-shots with distance attenuation relative to the player ship, and runs a 4-layer adaptive music bed (calm/tense/combat/docked) crossfaded from a derived threat level. SaveSystem owns serialization: it walks a fixed registry of systems that each expose serialize()/deserialize(data), assembles a versioned save envelope, writes autosave + manual slots to localStorage and to an exportable/importable JSON file, runs ordered migrations on load, and provides new-game initialization. Both compose only through GameState + emit/on; neither hardcodes content (synth recipes and slot config are data).

## Mechanics
- AUDIO GRAPH: one AudioContext (created lazily on first user gesture to satisfy autoplay policy; ctx.resume() on click). Graph: per-voice source -> voiceGain(ADSR) -> [optional biquad] -> busInput. Buses: sfxBus(GainNode) and musicBus(GainNode) both -> masterGain(GainNode) -> masterLimiter(DynamicsCompressorNode thr -6dB, knee 6, ratio 12, atk 0.003, rel 0.25) -> ctx.destination.
- GAIN MODEL: settings volumes 0..1 are perceptual; convert to linear amplitude g = v^2 (equal-ish loudness). masterGain.gain = master^2, sfxBus.gain = sfx^2, musicBus.gain = music^2. Mute = ramp target to 0 over 0.05s.
- VOICE POOL: cap 24 concurrent SFX voices. If at cap, steal the oldest non-loop voice. Each one-shot fully disconnects on envelope end (scheduled stop) to free nodes; never leak OscillatorNodes.
- ENVELOPE helper env(param,t0,peak,{a,d,s,r,sus}): setValueAtTime(0,t0); linearRampToValueAtTime(peak,t0+a); linearRampToValueAtTime(peak*sus,t0+a+d); hold at sustain; at release t1: setValueAtTime(current,t1); exponentialRampToValueAtTime(0.0001,t1+r). Exponential tails, linear attack.
- NOISE: pre-generate one 2s white-noise AudioBuffer at ctx.sampleRate, reused via BufferSource (loop for sustained, one-shot for transients). Pink-ish = white through lowpass 1200Hz.
- ONE-SHOT API: Audio.play(recipeId, {position?:{x,z}, gain?:1, detune?:0, rate?:1}). Recipes are data. Recipe = array of layers; layer = {type:'osc'|'noise', wave, freq, freqEnd?, glideT?, filter?, amp, env}.
- POSITIONAL ATTENUATION (cheap 2D, no HRTF): for SFX at world (x,z), d=dist(pos,playerPos). attGain = clamp(1-(d-dNear)/(dFar-dNear),0,1)^2 with dNear=40wu, dFar=900wu. If d>dFar, cull (skip voice). Stereo pan via StereoPannerNode: pan=clamp((x-playerX)/panSpan,-1,1) panSpan=600wu, rotated into camera space using camera yaw. Doppler optional: rate*=clamp(1-radialVel/8000,0.9,1.1).
- MINING-BEAM LOOP: sustained voice started on 'mining:start', released on 'mining:stop'. Held saw 70Hz through lowpass (LFO 6Hz sweeping 400->900Hz) + amplitude tremolo LFO 11Hz depth 0.25; gain 0.18. Tracks targeted asteroid position each frame for attenuation.
- ALARMS: 'lowShield' = repeating two-tone beep (880/660Hz square, 0.12s each, 0.18s gap) gain 0.12 while shieldPct<0.25, cleared at >=0.25 or death. 'lowHull' = slower 440Hz sine pulse 0.25s on/0.4s off gain 0.16 while hullPct<0.20. Scheduled via ctx.currentTime lookahead (25ms tick, 0.1s horizon), no setInterval drift.
- MUSIC BED: 4 stem layers, each a looping generative pad/arp from oscillators (no samples). A drone(calm), B harmonic pad(tense), C percussion+bass pulse(combat), D warm filtered chord(docked). Shared tempo grid 96 BPM (beat 0.625s). Mix = target weights per state; each stem gain crossfades to target over xfadeT=2.5s (combat enter 1.0s). Stems run continuously; only gains change.
- MUSIC STATE MACHINE: state in {calm,tense,combat,docked}. docked forced when player.docked. Else combat if threat>=0.6, tense if threat>=0.2, else calm. threat = clamp(0.5*min(nearbyHostiles,3)/3 + 0.5*(1-shieldPct)*inCombatRecent, 0,1); inCombatRecent=1 if last damage <6s ago. Hysteresis: hold new state 1.5s before switching.
- STEM WEIGHTS (gain targets) calm:[A1,B0,C0,D0] tense:[A0.7,B0.8,C0,D0] combat:[A0.4,B0.5,C1,D0] docked:[A0.2,B0.2,C0,D0.9]. Only stem gains move; musicBus unaffected.
- DUCKING: on explosion_large / jump, duck musicBus *0.5 over 0.08s, recover over 0.8s (sidechain feel).
- SAVE ENVELOPE: { fmt:'spaceface-save', version:N, savedAt:isoString, playtimeS:Number, slot:String, checksum:String, data:{ <systemKey>:<systemState> } }. checksum = FNV-1a hex of JSON.stringify(data) for corruption detection (not security).
- SERIALIZATION REGISTRY: SYSTEM_ORDER = ['meta','player','fleet','inventory','economy','factions','missions','tech','map','world','settings']. Save calls systems[k].serialize(); load calls deserialize(data[k]) in the SAME order so deps restore (player before fleet, economy before missions).
- SERIALIZE CONTRACT: every saveable system implements serialize():PlainJSON (no class instances, no Three.js objects, no functions, no Infinity/NaN; drift fields rounded <=4dp) and deserialize(data):void rebuilding runtime + re-emitting needed 'restored' events. Missing key on load => system uses newGame() defaults. Unknown extra keys preserved/ignored (forward-compat).
- AUTOSAVE: every 120s of unpaused play AND on 'player:docked','sector:changed','mission:completed' debounced to max 1 write / 10s. Slot 'auto'. Never autosaves while player.dead or during a jump transition.
- MANUAL SAVES: slots 'slot0'..'slot4' + 'auto' + 'quick'. localStorage keys 'sf.save.<slot>'. Quicksave F5, quickload F9 (rebindable).
- FILE EXPORT/IMPORT: export = Blob([JSON.stringify(envelope)],'application/json') download 'spaceface_<slot>_<date>.json'. import = FileReader -> JSON.parse -> validate fmt+version -> migrate -> load. Reject if fmt!=='spaceface-save'.
- MIGRATION: MIGRATIONS = ordered [{from:N,to:N,fn(data)}]. loadEnvelope runs each step from save.version to CURRENT_VERSION, mutating data; if version>CURRENT_VERSION refuse (newer game). If a migration throws, abort load, emit error, do not corrupt current state.
- LOAD SEQUENCE: pause sim -> validate -> migrate -> clear transient runtime (despawn entities) -> deserialize in SYSTEM_ORDER -> emit 'save:loaded' -> rebuild scene from GameState -> unpause. Atomic: build candidate state; only swap into live GameState if all deserializers succeed.
- CORRUPTION HANDLING: on parse/checksum failure do NOT overwrite; emit 'save:error' with reason. localStorage write wrapped try/catch for QuotaExceeded -> emit 'save:error' quota, suggest export-to-file.
- NEW GAME: SaveSystem.newGame(seed) calls each system's newGame() to populate GameState from data defaults, sets meta.version=CURRENT_VERSION, meta.seed=seed||Date.now(), playtimeS=0, emits 'game:started'.
- PLAYTIME: meta.playtimeS accumulates fixed-dt only while not paused; serialized as integer seconds.

## State Owned
- GameState.meta.version: int — save schema version the running state conforms to (== CURRENT_VERSION after load/migrate)
- GameState.meta.seed: int — world RNG seed, set at new-game, never changes
- GameState.meta.playtimeS: int — total active play seconds, autosave-accumulated
- GameState.meta.createdAt / lastSavedAt: ISO string — bookkeeping
- GameState.settings.audio.master: float 0..1 (default 0.8)
- GameState.settings.audio.sfx: float 0..1 (default 0.9)
- GameState.settings.audio.music: float 0..1 (default 0.6)
- GameState.settings.audio.muted: bool (default false)
- GameState.settings.keybinds: map action->code (quicksave 'F5', quickload 'F9', ...)
- GameState.settings.gfx.parallaxLayers/shadows/etc: render-owned but serialized under settings
- GameState.audioRuntime (NON-serialized transient): { ctx, masterGain, sfxBus, musicBus, limiter, voices:[], stems:{A,B,C,D}, musicState, threat, alarms:{lowShield,lowHull} } — rebuilt each session, never saved
- GameState.save (NON-serialized transient): { lastAutosaveAt, dirty:bool, currentSlot } — runtime save bookkeeping
- SaveSystem owns NO gameplay data; it orchestrates other systems' serialize/deserialize. Audio settings live under settings (owned here for the volume sliders).

## Content
- RECIPE pulse_laser | osc square 1200Hz->600Hz glide 0.06s | bandpass 1500Hz Q4 | amp 0.22 | env a0.002 d0.05 s0 r0.05 | dur ~0.11s
- RECIPE beam_laser | saw 440Hz + sine 442Hz beat | lowpass 2500Hz | amp 0.18 | env a0.04 sustain-while-firing r0.12 | loop voice released on fire-stop
- RECIPE autocannon | noise burst + square 180Hz->90Hz 0.03s | highpass 300Hz then lowpass 3500Hz | amp 0.25 | env a0.001 d0.04 s0 r0.03 | dur 0.06s per round, min-retrigger 60ms
- RECIPE missile_launch | noise whoosh lowpass sweep 300->2000Hz over 0.4s + sine 120Hz thump | amp 0.3 | env a0.01 d0.3 s0.2 r0.25 | dur ~0.6s
- RECIPE explosion_small | noise lowpass sweep 1800->120Hz 0.4s + sine 90->40Hz | amp 0.5 | env a0.002 d0.35 s0 r0.2 | dur ~0.55s
- RECIPE explosion_large | noise lowpass 2200->60Hz 0.9s + sine 70->30Hz sub + crackle noise bursts | amp 0.8 | env a0.003 d0.8 s0 r0.5 | ducks music | dur ~1.4s
- RECIPE mining_beam_loop | saw 70Hz, lowpass LFO 6Hz 400-900Hz, tremolo LFO 11Hz depth0.25 | amp 0.18 | loop start/stop
- RECIPE shield_hit | sine 600Hz + ring-mod 90Hz, bandpass 800Hz Q8 | amp 0.3 | env a0.001 d0.12 s0 r0.08 | dur 0.18s
- RECIPE hull_hit | noise burst lowpass 900Hz + square 140Hz | amp 0.35 | env a0.001 d0.08 s0 r0.06 | dur 0.12s
- RECIPE ui_click | sine 1000Hz | amp 0.12 | env a0.001 d0.03 s0 r0.02 | dur 0.05s
- RECIPE ui_confirm | sine 800Hz->1200Hz glide 0.08s | amp 0.14 | env a0.002 d0.1 s0 r0.06 | dur 0.16s
- RECIPE ui_deny | square 300Hz->200Hz glide 0.1s | amp 0.16 | env a0.002 d0.12 s0 r0.06 | dur 0.18s
- RECIPE docking_clamp | noise thunk lowpass 500Hz + square 80Hz two hits 0.0s & 0.12s | amp 0.4 | env per-hit a0.001 d0.1 r0.08 | dur 0.3s
- RECIPE jump_warp | saw 100Hz->1500Hz rising glide 1.2s + noise riser highpass sweep + boom sine 60Hz | amp 0.5 | ducks music | dur ~1.5s
- RECIPE item_pickup | sine 880Hz->1320Hz two-note arp 0.0/0.07s | amp 0.18 | env a0.001 d0.08 r0.05 | dur 0.18s
- RECIPE credits_gained | triangle 660/990/1320Hz arp 0.0/0.05/0.10s | amp 0.16 | env a0.001 d0.06 r0.05 | dur 0.2s
- RECIPE alarm_low_shield | square 880/660Hz alternating 0.12s, 0.18s gap | amp 0.12 | repeats until cleared
- RECIPE alarm_low_hull | sine 440Hz pulse 0.25s on/0.4s off | amp 0.16 | repeats until cleared
- MUSIC stem A (drone/calm) | 2 detuned saw 55Hz & 55.3Hz -> lowpass 600Hz + slow LFO | continuous loop
- MUSIC stem B (pad/tense) | triad sine cluster (root,min3,5th) 110-330Hz, lowpass 1400Hz, 3 detuned voices chorus | continuous
- MUSIC stem C (combat) | square bass arp 8ths @96BPM + noise hat offbeats + sub kick sine 50Hz beats 1&3 | continuous, gain-gated
- MUSIC stem D (docked) | warm triangle chord maj add9, lowpass 1100Hz, 0.2Hz amplitude swell | continuous
- SAVE SLOTS | localStorage keys: sf.save.auto, sf.save.quick, sf.save.slot0..slot4 | index key sf.save.index = [{slot,savedAt,playtimeS,credits,sectorName,shipName}] for menu listing without parsing full saves
- CURRENT_VERSION = 3 (example) | MIGRATIONS: {1->2 add factions.rep defaults}, {2->3 rename economy.drift->economy.markets, add per-good lastTradeTick}
- NEW-GAME DEFAULTS | credits 5000cr | ship 'shuttle_mk1' | cargo empty cap 50u | sector 'sol_gate' | faction rep all 0 (range -100..100) | tech none | map: only start sector+station discovered | settings audio {0.8/0.9/0.6} | playtimeS 0

## Formulas
- linearGain(v) = clamp(v,0,1)^2   // perceptual slider -> amplitude
- busGain = settings.muted ? 0 : linearGain(settings.audio.<bus>)
- voiceFinalGain = min(recipe.amp * callGain * attGain, 1.0)  // before bus
- attGain(d) = clamp(1 - (d - dNear)/(dFar - dNear), 0, 1)^2,  dNear=40, dFar=900 (wu)
- pan(x,z) = clamp(((x-playerX)*cosYaw - (z-playerZ)*sinYaw)/panSpan, -1, 1),  panSpan=600
- doppler rate = clamp(1 - vRadial/8000, 0.9, 1.1)
- threat = clamp(0.5*min(nearbyHostiles,3)/3 + 0.5*(1 - shieldPct)*inCombatRecent, 0, 1)
- musicState = docked? 'docked' : threat>=0.6?'combat' : threat>=0.2?'tense' : 'calm'  (1.5s hysteresis)
- stemGain_target = STEM_WEIGHTS[state][stem]; stemGain -> target over xfadeT (combat enter 1.0s else 2.5s) via setTargetAtTime
- envelope: peak at t0+a; decay to peak*sus at t0+a+d; release exp to 0.0001 over r
- FNV-1a checksum: h=2166136261; for each char: h=(h ^ c)*16777619 >>>0; output hex(h)
- playtimeS += 1 on each whole-second boundary of accumulated unpaused dt
- autosaveDue = (now-save.lastAutosaveAt)>=120s OR (triggerEvent AND now-lastWrite>=10s)
- marketDrift serialized: per good {price:int, stock:int, lastTick:int} ONLY for visited sectors; unvisited regenerate from seed on demand
- newGameSeed = seed || Date.now()

## Interactions
- ON 'weapon:fired' {weaponType,position,ownerId} -> Audio.play(recipeForWeapon[weaponType],{position}); pulse->pulse_laser, beam->beam_laser(loop), auto->autocannon, missile->missile_launch
- ON 'weapon:beamStop' {ownerId} -> release the beam_laser/mining loop voice for that owner
- ON 'mining:start' {asteroidId,position} -> start mining_beam_loop tracking asteroid; ON 'mining:stop' -> release it
- ON 'entity:hit' {targetId,shieldAbsorbed,position} -> Audio.play(shieldAbsorbed?'shield_hit':'hull_hit',{position})
- ON 'entity:destroyed' {size,position} -> Audio.play(size>=large?'explosion_large':'explosion_small',{position}); large ducks music
- AudioSystem derives low-shield/low-hull from GameState.player.shieldPct/hullPct each tick -> arm/clear alarm loops (or ON 'player:lowShield'/'player:lowHull')
- ON 'player:docked' -> docking_clamp + force music 'docked'; ON 'player:undocked' -> recompute music
- ON 'jump:start' -> jump_warp + duck music; sector change handles new bed
- ON 'sector:changed' {sectorId} -> trigger autosave; music recomputes threat next tick
- ON 'item:pickup' {kind} -> item_pickup; ON 'credits:changed' {delta} delta>0 -> credits_gained
- ON 'ui:click'/'ui:confirm'/'ui:deny' (from DOM UI) -> UI sfx, center pan
- ON 'settings:changed' {section:'audio'} -> AudioSystem re-reads settings, ramps bus gains over 0.05s
- ON 'damage:dealt'/'damage:taken' -> set inCombatRecent timestamp (feeds threat)
- SAVE: ON 'player:docked','sector:changed','mission:completed' -> SaveSystem.requestAutosave() debounced
- SAVE emits 'save:started','save:completed' {slot}, 'save:error' {reason}, 'save:loaded' {slot}, 'game:started' — UI shows toast on these
- SAVE reads from EVERY saveable system via systems[k].serialize() and restores via deserialize(); SaveSystem registered LAST so all systems exist; serialize loop runs on-demand not per-tick
- AudioSystem.update(dt): resume ctx if needed, recompute threat+music crossfades, update positional attenuation for active loop voices, tick alarm scheduler; reads player pos/shield/hull, writes nothing to GameState
- AudioSystem.serialize() = none for runtime (only settings.audio persists under settings system); restore = re-read settings on init
- NOTIFICATION coupling: 'save:completed' -> toast 'Game saved (slot X)'; 'save:error' -> red toast

## UI Needs
- Settings panel: 3 volume sliders (master/sfx/music 0-100%) bound to settings.audio.* emitting 'settings:changed', a Mute toggle, a 'test sfx' button per category
- Save/Load menu: list of 7 slots (auto, quick, slot0-4) each showing from sf.save.index: timestamp, playtime (Hh Mm), credits, current sector name, ship name; Save/Load/Delete/Export per slot
- Import button: file picker accepting .json -> validate -> on success refresh slot list and offer Load
- Export feedback: triggers browser download; toast 'Exported spaceface_slotX_date.json'
- Toast surface: 'save:completed' green 2s; 'save:error' red sticky with reason + 'Export to file' fallback button on quota error
- Confirm dialog for overwriting an occupied slot and for loading (discards unsaved progress) — wired to ui:confirm/ui:deny sounds
- On-screen low-shield/low-hull alarm indicator (pulsing red border) matching audio alarm state, driven by same shieldPct/hullPct thresholds
- Main menu New Game / Continue (loads 'auto' or last slot) buttons; Continue disabled if no saves in sf.save.index

## Risks
- AudioContext autoplay policy: ctx must be created/resumed on a user gesture or all audio is silent — gate AudioSystem init behind first input and queue early events
- Node leak / GC: every one-shot must disconnect after release+tail; leaked OscillatorNodes degrade a long session — enforce via voice pool with scheduled teardown
- Voice storms: rapid autocannon/many enemies exceed the 24-voice cap and clip the limiter — per-recipe min-retrigger (autocannon 60ms) + oldest-voice stealing
- Music CPU/clicks: recreating oscillators on state change pops — only change gains, never restart stems; crossfade with setTargetAtTime
- Clicks/pops generally: start envelopes from ~0, release via exponentialRampToValueAtTime to 0.0001 (never 0), avoid abrupt gain.value writes mid-sound
- localStorage quota (~5MB): per-sector market drift can grow — persist only VISITED sectors, regenerate rest from seed; keep lightweight sf.save.index separate so the menu never parses big blobs
- Migration correctness: each migration pure & re-runnable; never load version>CURRENT_VERSION; abort-on-throw must not partially mutate live GameState (build candidate, then swap)
- Serialization purity: a stray Three.js Object3D, Map, Set, function, Infinity or NaN breaks JSON/restore — serialize() must return plain JSON; dev-mode assert JSON.parse(JSON.stringify(x)) round-trips
- Determinism on load: deserialize in SYSTEM_ORDER so cross-refs (fleet->player ship defs, missions->factions) resolve; document and enforce the order
- Save/scene desync: after load, clear all transient runtime (entities, voices) and rebuild from GameState or ghosts persist — explicit despawn-all-then-rebuild step
