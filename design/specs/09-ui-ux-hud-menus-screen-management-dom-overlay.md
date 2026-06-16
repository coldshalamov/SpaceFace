# UI/UX — HUD, menus & screen management (DOM overlay)

## Summary
A single HTML/CSS DOM overlay (#ui-root) layered above the Three.js canvas, driven entirely by GameState reads and event-bus signals — the UI never mutates simulation state directly, it only emits intent events (e.g. ui:buy, ui:fitModule, ui:setThrottle) that owning systems handle. A central ScreenManager enforces exactly one modal screen at a time via a screen stack; the in-flight HUD is its own always-mounted layer that auto-hides when any modal/docked screen is open. The overlay has three z-layers: HUD (z 10), MODAL screens (z 100, with backdrop), and TOASTS/ALERTS (z 1000, never blocked). UI updates are split into a 60Hz cheap path (bar widths, numbers via direct style writes, no reflow-heavy DOM creation) and an event-driven rebuild path (lists/menus rebuilt only on data-change events). Cohesive cold-cyan sci-fi style: dark navy glass panels, cyan primary accent, faction-colored blips, monospace numerics, thin glowing borders. Pure CSS variables make it themeable and Steam/Electron-ready. Everything is keyboard+mouse navigable and gamepad-mappable later.

## Mechanics
- ScreenManager: GameState.ui.screenStack: string[] holds modal screen ids. Top of stack = active modal. Empty stack = pure flight (HUD only). pushScreen(id), popScreen(), replaceScreen(id), closeAll(). Only the top screen's DOM is display:flex; others display:none but kept in DOM (cached) so scroll/tab state persists.
- HUD visibility: HUD layer (#hud) is visible only when screenStack is empty AND GameState.ui.docked===false AND GameState.mode==='flight'. Any push() adds class .ui-modal-open to #ui-root which sets #hud{opacity:0;pointer-events:none;transition:120ms}. No teardown — just hidden.
- Docking flow: dock system emits 'docked' -> UI sets ui.docked=true, pushScreen('station'). Station screen is a hub with a left tab-rail (Market/Shipyard/Outfitting/Missions/Services/Factions/Bar) swapping a right content pane. 'Undock' button emits ui:undock -> popScreen, ui.docked=false, HUD returns.
- Pause: ESC in flight pushes 'pause' (translucent, sim frozen via emit('sim:pause')); ESC in a modal pops one level (back navigation). Pause menu: Resume/Settings/Save/Load/Controls/Main Menu.
- Modal backdrop: one shared #modal-backdrop (rgba(4,8,16,.72) + 2px blur) shown whenever stack non-empty; clicking it pops the top screen unless screen has data.locked (e.g. mid-transaction confirm).
- HUD fast-update loop: registered in fixed update order LAST (after all sim). update(dt) reads GameState and writes only to pre-cached element refs via element.style.setProperty/textContent. Bars use transform:scaleX (GPU, no layout). Throttled: numeric text updates at 10Hz (every 6th 60Hz tick), bars every tick.
- Radar/minimap: a 180x180px <canvas> in HUD corner redrawn at 20Hz. Player fixed center, world entities from GameState.entities projected to radar via radarRange (default 4000 wu -> 90px). Blips colored by faction; off-range contacts clamp to edge as hollow chevrons. Current target ringed.
- Target panel: populated from GameState.player.targetId -> entity lookup. Shows name, faction tag (colored), hull%/shield% mini-bars, distance (wu), relative speed. Hidden when targetId null. Cycle target = Tab key emits ui:cycleTarget.
- Contextual alerts: an alert queue in HUD center-top. Systems emit 'alert' events ({key,sev,text,ttl}); UI dedupes by key, shows highest-severity first, auto-expires by ttl. Severities: info(cyan)/warn(amber)/danger(red, pulses). Examples: low-shield, missile-lock (with audio-cue request), can-dock prompt, cargo-full, overheat.
- Toasts: transient notifications (credits earned, mission complete, rep change, item bought) bottom-right, stack max 5, slide-in 160ms, auto-dismiss 4s, click to dismiss. Driven by 'toast' events.
- Objective tracker: top-right compact list of GameState.missions.active[].objectives with progress (e.g. 'Deliver Ore 3/5'), and a directional off-screen arrow pointing to the tracked objective's world position (computed from camera-relative bearing).
- Market screen: table of commodities (name, your qty, stock, buy price, sell price, 24-tick sparkline trend). Buy/Sell with qty stepper (1/10/100/Max), shows total cr and resulting cargo volume. Disabled rows when stock 0 or cargo full. Emits ui:buy/ui:sell {commodityId, qty}.
- Shipyard/Outfitting: Shipyard lists purchasable hulls (stats table + buy/trade-in price delta). Outfitting shows a slot grid (weapon/shield/engine/utility slots from current hull) + an inventory/market module list; drag-or-click to fit. Live stat-delta preview (green/red deltas) before confirm. Emits ui:buyShip, ui:fitModule, ui:unfitModule.
- Mission board: cards (title, faction, type icon, reward cr + rep, risk tier, expiry). Accept disabled if cargo/rep requirements unmet (shows reason). Emits ui:acceptMission/ui:abandonMission.
- Services: refuel (cr per fuel unit), repair hull (cr per hp), buy ammo, insurance toggle. One-click with cost preview; emits ui:service {type,amount}.
- Factions screen: list of factions with rep value (-100..+100), a horizontal rep bar (red->neutral->green), standing label (Hostile/Unfriendly/Neutral/Friendly/Allied), and what each tier unlocks. Read-only.
- Bar/Contacts: list of NPC contacts (portrait = procedural canvas avatar, name, faction, dialog snippet) offering lore/tips/special missions/passive-income hires. Emits ui:talkContact.
- Star-map screen: full-screen pannable/zoomable <canvas> (or SVG) of sectors as nodes + lanes as edges, colored by faction control + danger. Current sector pulsing. Click a reachable sector -> route preview (jumps, fuel cost) -> Set Course emits ui:setCourse {sectorId}. Shows unexplored sectors as '???'.
- Tech-tree screen: node graph of upgrades; nodes show name, cost (cr + tech points/resources), locked/available/owned state (greyscale/cyan/filled). Prereq lines. Hover = tooltip with effect numbers. Click available -> ui:unlockTech {nodeId}.
- Main menu / new-game: full-screen, title logo (CSS/canvas), buttons New Game / Continue (enabled if save exists) / Load / Settings / Quit (Quit hidden in browser, shown in Electron). New Game flow: pick ship name + starting-ship preview + difficulty -> emit game:new {name,difficulty}.
- Settings: tabs Audio (master/sfx/music sliders 0-100), Video (render scale, bloom toggle, vsync, FOV), Controls (rebindable key list), Gameplay (damage numbers, autosave interval, tutorial hints). Persisted to GameState.settings -> save system.
- Controls/help overlay: keybind cheat-sheet grid, toggled by F1/H, semi-transparent, dismiss on any key. Built from GameState.settings.keybinds so it stays accurate after rebinds.
- Input routing: a single keydown listener on document. If a modal is open, keys route to that screen's handler (and ESC=back). In flight, keys are translated to intent events (ui:setThrottle, ui:cycleTarget, ui:fireGroup, ui:toggleMap). UI never reads raw input for sim — it emits events the input/flight system consumes, OR the flight system has its own listener and UI only owns menu keys (recommended: UI owns menu/global keys F1/M/T/ESC/Tab; flight system owns movement/fire). Documented boundary to avoid double-handling.
- Responsiveness: root uses CSS clamp() + a --ui-scale variable (0.75–1.5, user-settable) applied as font-size on #ui-root (rem-based layout) so the whole UI scales for 1080p..4K without per-element math.
- Performance guard: list screens use DocumentFragment batch builds and event-delegation (one listener per list container, not per row). Sparklines/radar/star-map draw to canvas, not DOM. No per-frame innerHTML.

## State Owned
- ui.screenStack: string[] — modal screen ids, top = active; empty = flight HUD only
- ui.docked: boolean — true while at a station (HUD hidden, station hub shown)
- ui.activeStationTab: string — current station sub-screen id ('market'|'shipyard'|'outfit'|'missions'|'services'|'factions'|'bar')
- ui.radarRange: number — current radar/minimap world-unit radius (default 4000 wu)
- ui.toasts: {id,text,kind,ttl,born}[] — live toast queue (max 5 rendered)
- ui.alerts: {key,sev,text,ttl,born}[] — deduped contextual HUD alerts
- ui.trackedMissionId: string|null — mission whose objective gets the off-screen arrow
- ui.starmapView: {cx,cy,zoom} — pan/zoom state of the star-map canvas
- ui.lastScreenForBack: string[] — mirror of stack for ESC back-nav (or derived from stack)
- settings.uiScale: number — 0.75..1.5 global DOM scale multiplier
- settings.showDamageNumbers: boolean — toggle floating combat numbers
- settings.keybinds: {action:string -> code:string} — rebindable keys, also feeds help overlay
- settings.audio: {master,sfx,music} — 0..100, read by audio system
- settings.video: {renderScale,bloom,vsync,fov} — read by render system

## Content
- COLOR — bg-void #04060B | panel #0B1220 (glass: rgba(11,18,32,.82)) | panel-edge #1B2A44 | accent-cyan #36E2FF | accent-cyan-dim #1B7A8C | text-primary #DCE8F5 | text-dim #7E93AD | good #46E08A | warn #FFC24B | danger #FF4D5E | shield-blue #4DA8FF | hull-green #46E08A | energy-violet #B06CFF | heat-orange #FF8A3D
- FACTION BLIP COLORS — Player #36E2FF | Independent/Civilian #9AA8BC | Trader-Guild #46E08A | Patrol/Lawful #4DA8FF | Pirate/Hostile #FF4D5E | Mercenary #FFC24B | Alien/Unknown #B06CFF | Neutral-object(asteroid) #6E7B8C | Pickup #FFE36B
- TYPOGRAPHY — UI font stack: 'Orbitron'-style not available offline -> use system: ui-monospace,'Cascadia Mono','Consolas',monospace for all numerics; -apple-system,'Segoe UI',Roboto,sans-serif for labels/prose. Sizes (rem at uiScale 1): h1 1.5 / h2 1.125 / body .875 / numeric-hud 1.0 / micro .6875. Letter-spacing .04em on labels, uppercase tab/section headers.
- PANEL STYLE — border:1px solid var(--panel-edge); border-radius:6px; background:var(--panel-glass); backdrop-filter:blur(8px); box-shadow:0 0 0 1px rgba(54,226,255,.06) inset, 0 8px 24px rgba(0,0,0,.5); corner accent: 2px cyan L-brackets via ::before/::after.
- GLOW ACCENT — active/hover: box-shadow:0 0 12px rgba(54,226,255,.45); text-shadow:0 0 6px rgba(54,226,255,.5) on accent text; danger pulse: @keyframes 1s ease-in-out infinite alternate on border-color/box-shadow.
- Z-LAYERS — canvas 0 | #hud 10 | #modal-backdrop 90 | #screens 100 | #toasts 1000 | #alerts 1100 (missile-lock always on top).
- HUD LAYOUT — bottom-left: hull(green)/shield(blue)/energy(violet)/heat(orange) vertical-stacked bars 220x14px each + numeric. bottom-center: throttle arc + speed (wu/s) + cargo (used/cap u) + credits. bottom-right: radar 180x180 + target panel above it. top-center: alert queue. top-right: objective tracker + minimap-less compass. weapon group HUD: bottom-center-left, per-group ammo/heat/cooldown pips.
- BAR WIDGET — track #0B1220 inset, fill = colored gradient, fill width via transform:scaleX(value/max), 120ms ease on change; low-threshold (<25%) adds pulsing danger glow.
- RADAR — 180px canvas, concentric rings at 25/50/100% range, player triangle center, blips 3px squares (ships) / 2px dots (objects) / diamonds (pickups), target gets 6px ring, off-range = edge chevron.
- TARGET PANEL — 240x90px: name(h2)+faction tag, hull bar(green) shield bar(blue), distance + closing speed, subtarget hint. Empty state hidden.
- STATION HUB — left tab-rail 180px (7 tabs, icon+label, active = cyan fill + left bar), right content pane fills rest, top bar shows station name+faction+services, bottom-right persistent 'UNDOCK' button.
- MARKET ROW — grid: [icon name] [owned] [stock] [buy cr] [sell cr] [sparkline 60x20] [qty stepper] [buy][sell]. Trend arrow ▲▼ colored. Total + cargo preview footer.
- TOAST — 280px, slide-in from right 160ms, icon + text, kind border-left 3px (good/warn/info), auto-fade at ttl-300ms.
- ALERT — pill, center-top, icon+text, sev color, danger sev shakes 2px + audio request emit.
- STAR-MAP — node: 14px circle, faction-tinted halo, danger ring thickness, label below; lane: 2px line, dashed if jumpgate; current sector cyan pulse; route highlight amber.
- TECH NODE — 120x64 rounded rect, state: locked(#33425C greyscale, lock icon)/available(cyan border, glow)/owned(filled cyan, check). Prereq edges 1px dim cyan.
- KEYBINDS (default, UI-owned) — ESC back/pause | M star-map | T tech-tree | J missions/journal | F1 or H help | Tab cycle-target | Enter dock-when-prompted | P pause. Flight-owned (documented, not handled by UI): W/S throttle, A/D or mouse strafe/turn, Space/LMB fire group1, RMB fire group2, Q/E weapon-group select, F target-nearest-hostile.
- NEW-GAME DIFFICULTIES — content for dropdown: Casual(dmg x0.7, prices x0.9, rep-decay off) | Standard(x1) | Veteran(dmg x1.4, prices x1.15, permadeath off) | Ironman(x1.4, single save slot, permadeath). Emitted in game:new payload, consumed by sim balance systems.

## Formulas
- barFillScale = clamp(value / max, 0, 1) ; applied as transform:scaleX(barFillScale) on fill element (origin left)
- lowThreshold pulse active when (value/max) < 0.25
- radarPixel.x = 90 + (entity.x - player.x) / radarRange * 90 ; radarPixel.y = 90 + (entity.z - player.z) / radarRange * 90 (180px canvas, center 90)
- radarOffRange = hypot(dx,dz) > radarRange -> clamp blip to circle edge: angle=atan2(dz,dx); px=90+cos(angle)*88; py=90+sin(angle)*88; draw chevron
- offscreenArrowAngle = atan2(targetWorld.z - player.z, targetWorld.x - player.x) - camera.yaw ; arrow placed on HUD-edge ellipse at that bearing if target not in viewport frustum
- distanceWU = hypot(target.x-player.x, target.z-player.z) ; display rounded; if >1000 show as (d/1000).toFixed(1)+'k'
- closingSpeed = -dot(relVelocity, normalize(relPosition)) (positive = approaching), wu/s
- sparklinePoint.y = barH - (price - min)/(max - min) * barH over last N=24 price samples (min/max from window)
- tradeTotal = qty * unitPrice ; cargoAfter = cargoUsed + qty * commodity.volumePerUnit ; buy disabled if tradeTotal>credits || cargoAfter>cargoCap
- sellTotal = qty * sellPrice ; sell disabled if qty>ownedQty
- repBarFill = (rep + 100) / 200 (maps -100..100 -> 0..1) ; standing tier by thresholds: <-50 Hostile, -50..-15 Unfriendly, -15..15 Neutral, 15..50 Friendly, >50 Allied
- toast TTL expiry: now - toast.born > toast.ttl -> remove ; render fade alpha = clamp((toast.ttl-(now-born))/300,0,1)
- alert priority sort: sev rank danger(3)>warn(2)>info(1), then by born desc ; show top 3
- uiScaleApply: #ui-root font-size = (16 * settings.uiScale) px ; all layout in rem
- numericThrottle: update text every tick where (tickCount % 6)==0 (10Hz) ; bars/radar every tick(60Hz)/every 3rd tick(20Hz) respectively
- starmap world->screen: sx = (node.x - view.cx)*view.zoom + canvasW/2 ; sy = (node.y - view.cy)*view.zoom + canvasH/2
- routeFuelCost = sum(lane.distance for lane in path) * ship.fuelPerWU ; jumps = path.length

## Interactions
- EMITS ui:setThrottle {value:0..1} -> flight/input system
- EMITS ui:cycleTarget {dir:+1|-1} and ui:targetNearestHostile {} -> targeting system
- EMITS ui:fireGroup {group:1|2} / ui:selectWeaponGroup {group} -> weapons system (or flight owns; documented boundary)
- EMITS ui:dock {} / ui:undock {} -> docking system
- EMITS ui:buy {commodityId,qty} / ui:sell {commodityId,qty} -> market/economy system
- EMITS ui:buyShip {shipId} / ui:fitModule {slotId,moduleId} / ui:unfitModule {slotId} -> shipyard/outfitting system
- EMITS ui:acceptMission {missionId} / ui:abandonMission {missionId} / ui:trackMission {missionId} -> mission system
- EMITS ui:service {type:'refuel'|'repair'|'ammo'|'insurance',amount} -> services/economy system
- EMITS ui:setCourse {sectorId,path} -> navigation/sector system
- EMITS ui:unlockTech {nodeId} -> tech-tree/progression system
- EMITS ui:talkContact {contactId,choiceId} -> dialog/contacts system
- EMITS game:new {name,shipId,difficulty} / game:save {slot} / game:load {slot} / game:quit {} -> game lifecycle system
- EMITS sim:pause {} / sim:resume {} -> simulation loop (freezes fixed-timestep update)
- EMITS settings:changed {key,value} -> settings/audio/render systems (live apply); EMITS audio:cue {id} for alert/missile/ui-click sfx -> audio system
- HANDLES 'docked' {stationId} -> set ui.docked, pushScreen('station'), load station tab data
- HANDLES 'undocked' {} -> clear ui.docked, popScreen, restore HUD
- HANDLES 'toast' {text,kind,ttl} -> push to ui.toasts
- HANDLES 'alert' {key,sev,text,ttl} -> dedupe+insert ui.alerts
- HANDLES 'damage' {targetId,amount,crit} -> spawn floating damage number near projected screen pos (if settings.showDamageNumbers)
- HANDLES 'mission:updated'/'mission:complete' {missionId} -> refresh objective tracker + toast
- HANDLES 'rep:changed' {factionId,delta,value} -> toast + refresh factions screen if open
- HANDLES 'economy:tick' {} -> refresh market sparklines/prices if market screen open (event-driven rebuild, not per-frame)
- HANDLES 'credits:changed' / 'cargo:changed' / 'ship:statsChanged' -> mark HUD/menu dirty for next refresh
- READS GameState.player (hull,shield,energy,heat,throttle,speed,credits,cargo,targetId,position,yaw), GameState.entities (for radar/target), GameState.missions, GameState.factions, GameState.sectors, GameState.ship (slots/stats), GameState.settings — read-only
- READS GameState.mode ('menu'|'flight'|'paused') to decide which root layer renders

## UI Needs
- #ui-root overlay (position:fixed, inset:0, pointer-events:none; interactive children opt back in with pointer-events:auto) above the WebGL canvas
- #hud layer with: 4 status bars (hull/shield/energy/heat) + numerics, throttle/speed/cargo/credits cluster, 180px radar canvas, target panel, top-center alert stack, top-right objective tracker + off-screen arrow layer, weapon-group pips
- #modal-backdrop (single shared blur backdrop, click-to-dismiss)
- #screens container hosting cached screen nodes: station-hub (with 7-tab rail + content pane), star-map, tech-tree, pause, settings, main-menu, new-game, help-overlay, dialog
- #toasts container (bottom-right stack) and #alerts container (top-center, highest z)
- Market table widget with per-row qty stepper, sparkline canvas, buy/sell buttons (event-delegated)
- Outfitting slot-grid + module list with live stat-delta preview panel
- Mission card list with requirement gating + reason tooltips
- Star-map pannable/zoomable canvas with node tooltips + route/Set-Course panel
- Tech-tree node graph canvas/SVG with tooltips + unlock confirm
- Faction standings list with rep bars and tier-unlock descriptions
- Contacts/bar list with procedural canvas avatars and dialog choice buttons
- Settings panel with tabbed audio/video/controls/gameplay forms + key-rebind capture rows
- Main-menu + new-game flow (ship preview slot, name input, difficulty select)
- Floating combat damage-number layer (canvas or pooled DOM spans) projected from world to screen
- Global CSS variable theme block (:root) and --ui-scale font-size hook on #ui-root
- A small canvas-texture/portrait generator hook is fine but UI only needs a 2D <canvas> element it can draw avatars/sparklines/radar into

## Risks
- Double input handling: UI and flight system both listening to keydown can fire actions twice. Fix: strict ownership — UI owns global/menu keys only (ESC,M,T,J,F1,Tab,P,Enter); flight owns movement/fire. Single document listener that dispatches by GameState.mode + screenStack.length is safest.
- Per-frame DOM thrash: rebuilding lists or using innerHTML at 60Hz will GC-stall. Enforce split: 60Hz path writes only textContent/transform on cached refs; list rebuilds only on data-change events.
- Layout reflow from bar updates: animating width triggers layout. Use transform:scaleX with transform-origin:left instead — GPU compositor only.
- Screen-stack desync with sim pause: ensure pushScreen('pause') and sim:pause are atomic; popping must resume only if no other pausing screen remains. Track a pauseDepth or check stack for any screen with data.pausesSim.
- backdrop-filter:blur cost on weak GPUs / Electron: provide a settings toggle to fall back to solid rgba panels (settings.video also gates UI blur).
- Radar/star-map canvas DPI: must scale canvas by devicePixelRatio and CSS-size separately or blips look blurry on 4K/Retina.
- Off-screen objective arrow math must use camera yaw + frustum test, not just world bearing, or it points wrong under the tilted chase camera (account for camera tilt when projecting to screen-edge).
- Event-bus payload contracts must be frozen early (commodityId, slotId, sectorId naming) so UI and owning systems agree; mismatched ids = silent no-ops. Centralize event name constants.
- No font assets allowed: 'Orbitron' sci-fi look must come from system monospace + letter-spacing/uppercase styling or a procedurally-drawn canvas logo, not a downloaded webfont.
- Save/load must serialize only persistent ui/settings fields (settings, trackedMissionId), NOT transient ones (toasts, alerts, screenStack) — exclude or reset on load to avoid restoring a stale open modal.
- Accessibility/Steam: ensure keyboard navigation works for every modal (tab order, focus trap inside active screen, ESC always escapes) so the game is playable without mouse on Steam Deck.
