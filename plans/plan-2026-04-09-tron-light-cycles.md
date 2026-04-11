# Tron: Light Cycles — Three.js Arena Game

## Goal

Build a Tron: Legacy-inspired light cycle arena game. Single-player with AI hunters, level-based progression, a tile-based level editor, and a lobby-as-menu system where gates lead to game functions. Third-person chase cam, smooth analog steering, fading trails, nitro boosts, and upgradeable attributes. Tron Legacy neon aesthetic — architectural depth, volumetric light, cyan/orange palette.

## Product

- **Target feel**: Tron: Legacy (2010) — fast, sleek, neon-soaked action
- **Core loop**: Lobby → ride through "Enter Arena N" gate → enter level → eliminate all enemies → exit gate opens → ride through exit → return to lobby with coins → ride to Garage to upgrade/customize → next arena
- **Win condition per level**: All enemy cycles eliminated (crashed into trails or each other)
- **Lobby**: Level 0 — a fixed campaign level (non-editable). Spacious colosseum with gates. No enemies, no win condition
- **Gates**: Neon-signed arcs in the lobby — Enter Arena N, Garage, Level Editor (Architect)
- **Garage**: Showroom-style space (dark Tron-flavored background, bike centered on a glowing plate with a short trail). Player customizes cycle/trail colors and upgrades attributes
- **Level Editor**: Birds-eye view, tile grid, place building blocks, enemies, power-ups, entrances/exits. Creates WIP levels (play-testable from editor only, not from lobby). Export to campaign to make them permanent
- **Progression**: Linear level progression. Win levels → earn NEON coins → spend in Garage on attribute upgrades or cosmetics. No replaying completed levels
- **Target audience**: Single player, keyboard controls, desktop browser

## World Scale & Units

**1 unit = 1 tile = 1x1 square.** The light cycle fits within a single unit tile.

This unit is the universal measurement for collision, arena dimensions, the level editor grid, movement, and all game systems.

### Reference Constants

| Constant | Value | Derivation |
|----------|-------|------------|
| **Tile size** | 1 × 1 unit | Base unit. Cycle fits inside one tile |
| **Default arena** | 400 × 400 units | Spacious, fast-paced feel |
| **Default top speed** | 60 units/s | Attribute "Speed" level 1 |
| **Default acceleration** | 20 units/s² | Attribute "Acceleration" level 1 |
| **Time to top speed** | 3 seconds | 60 / 20 = 3s |
| **Center-to-wall time** | ~5 seconds | 90 units accelerating (3s) + 110 units at top speed (1.8s) = 4.8s |
| **Cycle mesh length** | ~0.8 units | Fits within 1 tile with margin |
| **Cycle mesh width** | ~0.3 units | Narrow, sleek Tron proportions |
| **Trail wall height** | ~0.6 units | Visible but not towering |
| **Trail wall thickness** | ~0.1 units | Thin glowing wall |
| **Gate width** | 5 units | Wide enough to ride through comfortably |
| **Arena wall height** | ~3 units | Imposing boundary |
| **Low speed threshold** | 10 units/s | Below this, cycle-to-cycle collision doesn't kill opponent |

All tunable via `config.js` and the Developer HUD.

## Architecture

### Tech Stack

- **Three.js** r160+ via CDN importmap (ES modules)
- **cannon-es** 0.20+ for physics (wall/barrier/cycle-body collisions, trigger zones)
- **No server** — purely client-side, WIP levels in localStorage, campaign levels fetched from `levels/` directory
- **Audio**: Tracks and SFX generated via **ElevenLabs API** (env var `ELEVENLABS_API_KEY`), Web Audio API for playback. Audio generation is a dedicated bead — polecats generate assets programmatically with detailed prompts
- **Textures & Image Assets**: Structure/wall/block textures generated via **shader code** (preferred — procedural, no external dependencies) or via **Gemini API** (env var `GEMINI_API_KEY`) for image generation when shader-based textures aren't feasible. If shader generation fails, use **solid-color placeholders** with correct emissive neon tones and flag for manual replacement

### API Keys

Available as environment variables. Polecats may need to run `source ~/.zshrc` for them to be available in terminal.

| Variable | Use |
|----------|-----|
| **`GEMINI_API_KEY`** | Gemini — text, **image asset** generation, **image understanding** ([quickstart](https://ai.google.dev/gemini-api/docs/quickstart)) |
| **`ELEVENLABS_API_KEY`** | **Audio asset** and **music** generation — voice / SFX / related API ([quickstart](https://elevenlabs.io/docs/eleven-api/quickstart)) |

### Physics Responsibility Split

Two collision systems coexist — clear division of responsibility:

| System | Handles | Why |
|--------|---------|-----|
| **cannon-es** (physics engine) | Arena walls, barriers (buildings/walls/structures), cycle-to-cycle body collisions, gate trigger zones, boost pad trigger zones, portal trigger zones | Solid 3D geometry — reliable physics collisions. Provides slide-on-contact (angle-based speed reduction), knockback, trigger events |
| **Tile collision map** (custom code) | Trail collision (all cycles), near-miss detection for trails | Trails are thin curved ribbons — mesh colliders would miss or be expensive. Tile map is fast, deterministic, and prevents threading through |

AI uses the **tile collision map** to detect trail-occupied tiles ahead (not raycasts against trail meshes). AI uses **raycasts** for wall/barrier detection (solid geometry, reliable).

### Config Override Chain

`config.js` provides base defaults for all gameplay values. On boot, `devHud` values from save data are loaded and override matching keys. All gameplay code reads from the merged runtime config — never directly from `config.js` or save data.

### File Structure

```
vibe/tron/
├── index.html              # Entry point — loads Three.js importmap, boots main.js
├── css/
│   └── style.css           # HUD, menus, overlays, dev HUD styling
├── js/
│   ├── main.js             # Game state machine (lobby → level → garage → editor)
│   ├── config.js           # All constants: world scale, physics, attributes, block defs
│   │
│   ├── engine/
│   │   ├── renderer.js     # Three.js renderer + post-processing (bloom, chromatic aberration)
│   │   ├── physics.js      # cannon-es world, collision groups, contact detection
│   │   ├── camera.js       # Third-person chase cam (smooth follow, nitro zoom, derez overhead)
│   │   ├── input.js        # Keyboard input manager (WASD/arrows, nitro, power-up, pause)
│   │   └── audio.js        # Web Audio API — music + SFX + ambient layers
│   │
│   ├── game/
│   │   ├── cycle.js        # Light cycle mesh, physics body, movement, tilt/pitch animations
│   │   ├── trail.js        # Fading trail wall system (smooth curved segments, collision)
│   │   ├── arena.js        # Arena builder — constructs Three.js scene from level data
│   │   ├── blocks.js       # Building block catalog + merge logic (adjacent → unified mesh)
│   │   ├── powerups.js     # Power-up types (3 categories), pickup logic, equip system
│   │   ├── objects.js      # Game objects (boost pads, portals) — persistent with cooldowns
│   │   ├── attributes.js   # Attribute system (speed, accel, trail length, nitro bars, handling)
│   │   ├── ai.js           # Enemy AI — pathfinding, hunting, obstacle avoidance, mechanics use
│   │   └── gates.js        # Gate wall objects — neon arcs with signs, trigger zones
│   │
│   ├── levels/
│   │   ├── schema.js       # Level data format definition + validation
│   │   ├── loader.js       # Load from localStorage or fetch from levels/ directory
│   │   ├── defaults.js     # Bundled default levels (lobby + starter levels)
│   │   └── editor.js       # Level editor — birds-eye cam, grid, palette, save/load/export
│   │
│   ├── ui/
│   │   ├── hud.js          # In-game HUD (speed, trail, nitro bars, minimap, timer, power-up)
│   │   ├── devhud.js       # Developer HUD (`.` key) — tweak all game feel parameters live
│   │   ├── menus.js        # Pause menu, controls overlay, settings
│   │   └── garage.js       # Garage showroom — bike preview, color customization, upgrades
│   │
│   └── data/
│       └── savedata.js     # Player save data schema, load/save to localStorage
│
├── assets/
│   └── audio/              # Music tracks + SFX files
│
└── levels/                 # Campaign levels — the canonical story mode data
    ├── manifest.json       # Ordered list of level files (load order = story order)
    ├── level-0-lobby.json  # Level 0: The lobby (fixed, non-editable)
    ├── level-1-the-grid.json
    ├── level-2-...json
    └── ...                 # Editor "Export to Campaign" writes new files here
```

## Game State Machine

```
BOOT → LOBBY → (gate interaction) → LEVEL / GARAGE / EDITOR
                   ↑                    ↓
                   │              LEVEL_COMPLETE → coin overlay → ride to exit → LOBBY
                   │                    ↓
                   │              PLAYER_DEREZ → derez animation → LOBBY (retry same level)
                   │
                   └──── GARAGE / EDITOR (return to lobby)
```

- **BOOT**: Tron-grid tunnel loading screen (game title "TRON: LIGHT CYCLES" overlaid, loading progress bar at bottom). Load assets, load/create save data, init renderer. On complete → tunnel delivers player into LOBBY
- **LOBBY**: Level 0 (fixed campaign level). Free ride, all gates available. Controls overlay on first visit
- **LEVEL**: Tunnel transition → spawn stationary at entrance → gameplay → all enemies eliminated → exit gate opens → coin overlay → ride to exit → tunnel → LOBBY. Coins only awarded on exit gate ride-through
- **GARAGE**: Showroom. Customize cycle/trail colors, upgrade attributes, view stats. UI-based navigation. "Return to Lobby" button
- **EDITOR**: Level list → select WIP level or create new. Tile editor. Save/export/import. "Return to Lobby" + "Back to Level List" buttons
- **PAUSE**: ESC key. Controls reference, Settings panel (audio/visual), Resume, Quit to Lobby. **Freezes ALL game state** (physics, AI, all timers, all cooldowns, all animations). **Quit to Lobby = same as derez** (no coins, tunnel transition, full reset on re-entry). Settings is an overlay within the pause menu — no separate scene
- **PLAYER_DEREZ**: Derez animation → overhead camera → "DEREZZED" text → tunnel → LOBBY. Start gate still shows same arena number. Level fully resets on re-entry

## Spawn System

**Universal rule** — applies to ALL levels including the lobby:

- Player spawns **2 units in front of the entrance gate**, centered in the gate's **5×5 unit clear zone**
- **Facing = wall inward normal**: south wall → north (+Z), north wall → south (-Z), east wall → west (-X), west wall → east (+X)
- Player spawns **stationary** (speed = 0). All enemies also stationary
- **Game starts when player presses W** — enemies begin moving at the same moment. Level timer starts on W press (not on tunnel exit — player controls when the clock starts)
- No `playerSpawn` field in schema — position is always derived from the entrance gate

## Level Transitions

**The Tron-grid tunnel is the universal transition animation** — a short (~1 second) forward-flying warp through a glowing grid tunnel. Used for **every state transition**: level entries/exits, Garage entry/return, Editor entry/return, BOOT loading, and Quit to Lobby. **All keyboard input is ignored during the tunnel** — no buffering, clean input state on arrival.

**Implementation**: dedicated Three.js scene — an open-ended `CylinderGeometry` tube with a grid-line emissive texture, camera flying forward along the tube's axis. Reusable function: `playTunnel(onComplete)`. During BOOT, title text + progress bar are HTML overlays on top of the tunnel canvas. Same tunnel geometry for all transitions — only duration varies (BOOT = longer with loading progress, gate transitions = ~1s).

**On every transition**: all trails cleared, player spawns stationary at destination's entrance gate, equip slot empties.

| Transition | Details |
|------------|---------|
| **Lobby → Level** | Ride through Start gate → tunnel → spawn at level entrance. Fresh start every entry |
| **Level → Lobby (win)** | All enemies eliminated → exit gate opens → **coin reward overlay** ("LEVEL COMPLETE" text, coins earned, time bonus, hint to ride to exit). Auto-dismisses after `coinOverlayDuration` (default 3s). Game NOT paused during overlay. **Coins awarded only on exit gate ride-through** — derez before exiting forfeits reward. Ride through exit → tunnel → lobby |
| **Level → Lobby (derez)** | Derez animation → "DEREZZED" text → tunnel → lobby. No coins. Level fully resets on re-entry |
| **Level → Lobby (quit)** | Pause menu "Quit to Lobby" → same as derez (no coins, tunnel, full reset) |
| **Zero-enemy levels** | Exit gate open from start. No completion overlay. If `rewards` is non-null, coins awarded silently on exit gate ride-through |

## Player Save Data Schema

All player state persists in localStorage under a single key.

```json
{
  "version": 1,
  "player": {
    "cycleColor": "#00FFFF",
    "trailColor": "#00FFFF",
    "attributes": {
      "speed": 1,
      "acceleration": 1,
      "trailLength": 1,
      "nitroBars": 1,
      "handling": 1
    }
  },
  "progress": {
    "currentLevel": 1,
    "completedLevels": [0],
    "coins": 0,
    "totalCoinsEarned": 0
  },
  "cosmetics": {
    "ownedCycleColors": ["#00FFFF"],
    "ownedTrailColors": ["#00FFFF"]
  },
  "settings": {
    "masterVolume": 1.0,
    "musicVolume": 0.7,
    "sfxVolume": 1.0,
    "ambientVolume": 0.5
  },
  "devHud": {
    "bloomIntensity": 1.5,
    "bloomThreshold": 0.3,
    "chromaticAberration": 0.002,
    "crtScanlines": false,
    "gridBrightness": 0.4,
    "neonIntensity": 1.0,
    "fogDensity": 0.01,
    "trailOpacity": 0.8,
    "trailFadeSpeed": 1.0,
    "defaultTrailLength": 40,
    "trailExtendAmount": 10,
    "nitroCapacityPlusAmount": 1,
    "nitroBurstDuration": 0.5,
    "nitroSpeedReturnTime": 0.25,
    "shieldDeployTime": 0.15,
    "coinOverlayDuration": 3.0,
    "minimumArenaSize": 40,
    "trailImmunitySegments": 4,
    "portalExitImmunityDuration": 0.15,
    "nitroMaxSpeedMultiplier": 1.2,
    "shieldSlowdownPercent": 0.3,
    "cycleTiltMax": 0.3,
    "cyclePitchOnAccel": true,
    "cycleLeanOnBrake": true,
    "nitroFovWiden": true,
    "nitroCameraPullBack": true,
    "nitroSpeedLines": true,
    "nitroMotionBlur": true,
    "nitroHandlingMultiplier": 0.6,
    "derezSlowMo": true,
    "derezCameraOverhead": true,
    "derezCameraShake": true,
    "derezGlitchFlash": true,
    "portalWarpIntensity": 0.5,
    "specialObjectCooldown": 5.0,
    "shieldDuration": 5.0,
    "nitroBarRechargeTime": 5.0,
    "powerupRespawnTime": 10.0,
    "boostPadStrength": 1.0,
    "lowSpeedThreshold": 10,
    "cycleFriction": 0.98,
    "brakeDeceleration": 40,
    "enginePitch": 1.0,
    "nearMissDistance": 1.5,
    "gearShiftCount": 5,
    "aiAggression": 1.0,
    "aiReactionTime": 0.5,
    "aiAvoidanceRange": 5.0,
    "steeringSpeedFalloff": 0.02,
    "wallHeight": 3.0,
    "musicCrossfadeDuration": 1.0,
    "cameraDistance": 8,
    "cameraHeight": 4,
    "cameraLookAhead": 3,
    "cameraDamping": 0.08,
    "cameraTurnOffset": 1.5
  },
  "controlsShown": false
}
```

**Field notes:**
- `attributes` levels are 1-10 (1 = base, 10 = max). Mapped to gameplay values in `config.js`
- `completedLevels` is an array of level IDs (0 = lobby, always completed)
- `devHud` stores ALL developer HUD tweakable values — these override defaults from `config.js` (see Config Override Chain). Key values: `cycleFriction` = velocity multiplier per frame when coasting (0.98 = gentle drag), `brakeDeceleration` = deceleration rate in units/s² when pressing brake, `boostPadStrength` = duration multiplier for boost pad nitro burst (1.0 = same as 1 bar burst duration), `enginePitch` = base pitch multiplier for engine sounds (1.0 = normal, higher = whine shifted up), `cameraDistance` / `cameraHeight` / `cameraLookAhead` / `cameraDamping` / `cameraTurnOffset` = chase cam positioning (see Third-person chase cam)
- `cosmetics.ownedCycleColors` / `ownedTrailColors` — colors the player has purchased
- `settings` is the player-facing settings (from pause menu Settings panel)
- `controlsShown` — tracks whether the controls overlay has been shown (set `true` after first lobby entry)
- On first load: if no save data exists, create with defaults above

## The Light Cycle

### Model

Procedural low-poly mesh faithful to Tron: Legacy design. Glowing body panels, light strip accents, wheel glow. Emissive materials for the neon look. Player = cyan (`#00FFFF`), enemies = orange (`#FF6600`) by default. Player color is customizable in Garage.

Cycle mesh fits within 1 unit tile: ~0.8 units long, ~0.3 units wide, ~0.4 units tall.

### Cycle Animations

| Animation | Trigger | Details | Dev HUD Control |
|-----------|---------|---------|-----------------|
| **Tilt on steering** | A/D keys | Cycle leans into the turn direction. Tilt angle up to `cycleTiltMax` radians, animated smoothly. Returns to upright when steering stops | `cycleTiltMax` (default 0.3 rad, ~17°) |
| **Pitch forward on acceleration** | W key | Subtle forward pitch while accelerating | `cyclePitchOnAccel` (toggle, default on) |
| **Lean back on braking** | S key | Subtle backward lean while braking | `cycleLeanOnBrake` (toggle, default on) |
| **Wheel rotation** | Always when moving | Wheel spin speed proportional to cycle speed | — |

### Movement

| Attribute | Description | Level 1 Value | Level 10 Value |
|-----------|-------------|---------------|----------------|
| **Speed** | Top speed (units/s) | 60 | 120 |
| **Acceleration** | Acceleration (units/s²) | 20 | 50 |
| **Trail Length** | Max trail segments | 40 | 100 |
| **Nitro Bars** | Number of nitro burst charges | 5 | 12 |
| **Handling** | Turn rate (radians/s) | 2.5 | 5.0 |

- **Smooth analog steering** — left/right turns at a rate governed by handling attribute
- **Speed-dependent steering** — `effectiveTurnRate = baseTurnRate / (1 + speed * steeringSpeedFalloff)` where `steeringSpeedFalloff` (default **0.02**, tunable `k` in Dev HUD). Nimble at low speed, heavier at top speed. Handling upgrades matter at ALL speeds
- **Acceleration** — W/up to accelerate toward top speed
- **Braking** — S/down to decelerate toward zero at `brakeDeceleration` rate (default **40 units/s²**). **No reverse.** Cycle stops at zero speed
- **Coasting** (no gas, no brake) — each frame: `speed *= cycleFriction` (default **0.98**). Gentle coast to near-stop over several seconds
- **Turning while stationary** — steering works at any speed including zero
- **Nitro boost** — see Nitro System below. **Handling becomes heavier during nitro** (turn rate × `nitroHandlingMultiplier`, default 0.6)
- **Nitro overrides brake** — if holding S (brake) and pressing Space (nitro), the burst fires and overrides braking. Speed increases toward nitro cap. Braking resumes after burst ends if S still held

### Nitro System

Nitro is a **battery bar system**, not a continuous gauge.

- Default: **5 bars** (upgradeable to 12 via Nitro Bars attribute)
- Each **Space press** = consume 1 bar = one burst lasting `nitroBurstDuration` seconds (default **0.5s**, tunable at 0.1s granularity)
- **Cannot double-tap**: active burst must end before a new one begins
- **Hold for continuous boost**: Space held → auto-chains bursts until released or bars deplete
- **Speed cap**: `topSpeed × nitroMaxSpeedMultiplier` (default **1.2**). Doesn't stack
- **Speed return**: after final burst, speed decreases to normal over `nitroSpeedReturnTime` (default **0.25s**) if still holding gas. If braking or coasting, normal deceleration takes over
- **Handling penalty**: turn rate × `nitroHandlingMultiplier` during active burst only
- **Passive recharge**: 1 bar per `nitroBarRechargeTime` seconds (default 5s)
- **HUD**: discrete glowing segments (filled = charged, empty = recharging). Flash red on empty press
- **Empty nitro feedback**: error buzz sound + bar flash
- **Nitro Recharge power-up**: fills ALL bars instantly (current max capacity, including Nitro Capacity+ bonuses)
- **Nitro Capacity+ power-up**: adds `nitroCapacityPlusAmount` bars (default 1) AND fills the new bars (level-permanent)
- **Boost Pad**: equivalent to 1 bar burst (including handling penalty), doesn't consume a bar

### Nitro Camera & Visual Effects

All toggleable via Dev HUD:

| Effect | Description | Dev HUD Toggle |
|--------|-------------|----------------|
| **FOV widening** | Camera FOV increases during burst | `nitroFovWiden` |
| **Camera pull-back** | Camera pulls further from cycle during burst | `nitroCameraPullBack` |
| **Speed lines** | Streaking lines on screen edges | `nitroSpeedLines` |
| **Motion blur** | Radial motion blur during burst | `nitroMotionBlur` |
| **Nitro trail** | Bright white short secondary trail during burst. **Purely visual — NOT collidable.** Does not occupy tiles. Smaller/thinner than main trail | — (always on) |

## Trail System

- **CatmullRom spline segments** spawned behind the cycle while moving. Local control — later movements don't affect existing trail geometry
- **Distance-based spawning**: new segment every **1 unit traveled** (not time-based). Consistent density at all speeds
- **Each segment is 1 unit long.** Max segments governed by Trail Length attribute (default 40). A single segment can occupy multiple tiles if diagonal/curved
- **FIFO**: new segments at front (behind cycle), oldest removed from end. Oldest segments fade (opacity → 0) and despawn
- **No trail at speed 0**
- **Trail color** = cycle color. Player trail matches selected color (Garage). Enemy trail matches enemy's configured color
- **Visual**: glowing translucent wall panels (~0.6 units tall, ~0.1 thick), pulse animation, fade-out dissolve on oldest
- **Trail vanishes instantly on derez** — all segments disappear immediately

### Trail Collision Model

**Tile-based hitbox system**, NOT mesh-based colliders. Fast, deterministic, prevents threading through.

- Each trail segment **occupies the tile(s) it passes through**
- A cycle is "in" a tile based on its **center point** only
- Cycle center enters a trail-occupied tile → **derez**
- Trail tile occupancy recalculated as segments are added/removed
- **Trail CAN occupy arena perimeter tiles** — wall-riding seals off the edge (intentional strategy)

### Trail Self-Immunity

- Each cycle is **immune to its own N most recent trail segments** (default `trailImmunitySegments` = **4**)
- Immune segments still register for OTHER cycles — enemies can die on your fresh trail
- Applies identically to player and enemy cycles
- **Near-miss detection** follows the same immunity rule (prevents audio spam from trail directly behind)

## Collision Rules

**Only trails and cycle-to-cycle contact are lethal.** Walls and barriers stop you but don't kill.

| Collides with | Result |
|---------------|--------|
| **Any trail (own or enemy)** | **Derez** — always lethal regardless of speed |
| **Cycle-to-cycle** | **Both derez** — unless one has shield. Exception: below `lowSpeedThreshold` (default 10 units/s), a cycle cannot kill the opponent but CAN be killed. Both below threshold → bump and stop, neither derezes. Same rules for enemy-vs-enemy. **Nitro does NOT change the outcome** |
| **Arena wall / barrier** | **Slide** along surface. Speed reduction = `sin(impactAngle) × currentSpeed`. Head-on = near full stop, glancing = slight slowdown + redirect. Heading gradually lerps toward velocity direction. Wall-hit sound + camera shake. Not lethal |
| **Power-up** | Pickup (see Power-up Categories) |
| **Boost pad** | Free 1-bar nitro burst (no bar consumed). Subject to cooldown |
| **Portal** | Teleport to paired portal. Subject to cooldown |
| **Gate (open)** | Transition to that gate's destination |
| **Gate (locked)** | **Slide** — same as wall |

## Derez (Death) Sequence

When any cycle is destroyed:

1. **Implosion** — cycle shatters inward, fragments dissolve
2. **Trail vanishes** — all trail segments from this cycle disappear instantly
3. **Camera shake** + **glitch flash** (toggleable in Dev HUD)
4. **Slow-mo** — **PLAYER DEREZ ONLY.** Entire game simulation freezes (timers, cooldowns, trail aging, AI, all animations) except the player derez implosion. Enemy derez does NOT trigger slow-mo
5. **Sound**: digital shatter SFX

**Player derez additional behavior:**
- Camera pulls to dramatic overhead view (`derezCameraOverhead` toggle)
- "DEREZZED" text overlay
- ~2 second animation → tunnel transition → lobby

**Enemy derez:**
- Implosion + trail vanish at full game speed
- All enemies eliminated → exit gate opens + coin reward overlay

**Level reset on re-entry**: all enemies respawn, ALL power-ups respawn (including level-permanent), all trails gone, game objects reset, **equip slot empties**. Player retains purchased upgrades and cosmetics from save data — only in-level state resets.

## Arena Object Categories

### 1. Barriers (interior obstacles)

Placed on the arena floor. Solid — cycle slides along surface on contact (not lethal).

| Block | Size | Mergeable | Height | Notes |
|-------|------|-----------|--------|-------|
| **Wall** | 1 tile | Yes (linear) | Fixed (3 units, tunable via `wallHeight`) | Merges into continuous walls when adjacent |
| **Building** | 1 tile | Yes (cluster, same shape only) | Selectable (1-5 units, default 2) | **3 shapes**: `square`, `triangle`, `hexagon`. Adjacent buildings of the **same shape** merge. **Different shapes do NOT merge**. If merge graphics prove too complex, buildings remain standalone |
| **Structure** | 1 tile | No | Fixed (~2 units) | Decorative solid. 3 variants: `pylon` (tall narrow, vertical neon strips), `column` (cylindrical, horizontal neon bands), `obelisk` (tapered monolith, emissive edges) |

**Merge Behavior:** On placement, check 4-neighbors for same type+shape → regenerate merged geometry. On removal, neighbors revert to standalone.

### 2. Wall Objects (arena edge only)

Replace segments of the default arena wall. Placed on perimeter only.

| Object | Notes |
|--------|-------|
| **Gate** | Neon arc, **fixed 5 units wide**. 5 roles (see Level Data Schema). Open = rideable + animated glow. Locked = solid barrier + dimmed. Cannot be placed/removed/rotated in editor — only moved along walls |
| **Cosmetic Wall** | Decorative wall variant, still solid. **Variable width** (1-10 units, default 5). 3 variants: `panel_a` (Tron grid lines), `panel_b` (hexagonal honeycomb), `panel_c` (circuit trace pattern) |

**Gate configuration by level type:**
- **Non-lobby levels**: exactly one `entrance` gate (always locked) + one `exit` gate (locked until all enemies eliminated)
- **Lobby**: one `entrance` gate + three functional gates (`arena`, `garage`, `architect` — all always open)

### 3. Game Objects (persistent, reusable, cooldown-based)

Remain in place after use. Cooldown of `specialObjectCooldown` seconds (default 5s) after triggered — applies to ALL cycles. Dims during cooldown.

| Object | Behavior |
|--------|----------|
| **Boost Pad** | Ground-placed. Ride over = free 1-bar nitro burst (including handling penalty). If hit during active nitro: speed stays at cap, boost extends until whichever burst ends last. Glowing floor panel, dims during cooldown |
| **Portal** | **Paired** (identified by unique `pairId`). **Multiple pairs per level allowed** (max 5 pairs). **One-sided**: active face = portal surface (glowing, rideable), back face = solid wall. `rotation` determines facing. Trail ends at entry, new trail starts at exit. Speed maintained. **Cycle is invulnerable during teleport warp** (from entry until exit immunity begins). **Exit immunity**: `portalExitImmunityDuration` (default 0.15s) — short enough for portal traps. **Pair color auto-assigned** from fixed palette: `['#FF00FF', '#FFFF00', '#00FF88', '#FF4444', '#44AAFF']` indexed by pair order (first pair = magenta, second = yellow, etc.). Deleted pair frees its index for reuse. Editor forces pair placement |

### 4. Power-ups: Instant (green glow, consumed, respawn)

Picked up on contact, effect immediate, respawns after `powerupRespawnTime` (default 10s). Enemies CAN pick these up.

| Power-up | Effect |
|----------|--------|
| **Nitro Recharge** | Fills ALL nitro bars instantly (current max including Capacity+ bonuses) |

### 5. Power-ups: Level-Permanent (blue glow, consumed, NO respawn)

Picked up on contact, effect persists for remainder of level. Disappears permanently. Enemies CANNOT pick these up (player-only).

| Power-up | Effect |
|----------|--------|
| **Trail Extend** | +`trailExtendAmount` max trail segments (default +10) |
| **Nitro Capacity+** | +`nitroCapacityPlusAmount` bars (default +1) AND fills the new bars |

### 6. Power-ups: Equippable (purple glow, one slot, E to activate, respawn)

Picked up → stored in equip slot. **E** to activate. Single-use. Respawns after `powerupRespawnTime`.

**Equip slot replacement**: riding over another equippable replaces the current one (old is lost). No stacking. If shield is active and player rides over another Shield, the new one replaces the slot — available after the active shield ends.

| Power-up | Effect on E | Duration |
|----------|-------------|----------|
| **Shield** | Transparent neon sphere with hexagonal pattern. Near-instant deploy (`shieldDeployTime`, default 0.15s). Absorbs **one trail collision** (shatters + 30% speed loss via `shieldSlowdownPercent`). Fades after `shieldDuration` (default 5s) if unused | `shieldDuration` |

**Shield interaction rules:**
- **Trail collision**: absorbs hit, shatters, cycle loses 30% speed, continues alive
- **Cycle-to-cycle**: shielded survives (shield shatters), unshielded derezes. Both shielded → both shields shatter, neither derezes. **Low-speed + shield**: slow cycle's shield absorbs, both survive (slow can't kill fast anyway)
- **Wall/barrier**: shield NOT consumed (walls aren't lethal)
- **Expiry**: unused shield fades, equip slot empties

Enemies CAN pick up Shield and use it tactically.

### 7. Enemy Spawns

Editor-configured: **6 attributes** (speed, acceleration, trailLength, nitroBars, handling, intelligence — each 1-10) + cycle color. Multiple enemies per level.

### Power-up Visual Language

- **Green glow**: Instant (use immediately, respawn)
- **Blue glow**: Level-permanent (permanent buff, no respawn)
- **Purple glow**: Equippable (store and activate with E, respawn)

All power-ups float above the grid with bob + rotate animation. Distinct geometric shape per type within each color family.

## AI System

### Enemy Behavior

Enemies are **hunters** — they pursue the player and cut them off with trails. They CAN derez on their own trail (smarter enemies make fewer mistakes).

**AI Decision Loop** (per frame):
1. **Pathfind** toward player (steering behaviors)
2. **Trail tactics** — lay trail across player's predicted path
3. **Avoidance** — detect incoming trails/walls, turn away
4. **Attribute-driven** — faster = more aggressive, better handling = tighter cuts

### AI Game Mechanic Interactions

| Mechanic | AI Behavior |
|----------|-------------|
| **Nitro** | AI uses nitro bars (Intelligence-tiered: Easy = random taps, Medium = chase/escape bursts, Hard = optimized chains). Handling penalty applies. **Fallback**: if too complex, simplify to single-tap or remove enemy nitro |
| **Boost pads** | Ride over when convenient during chase |
| **Portals** | Can use to cut off player or escape |
| **Instant power-ups** | Pick up Nitro Recharge if nearby |
| **Equippable power-ups** | Pick up and use Shield tactically |
| **Level-permanent power-ups** | CANNOT pick up (player-only) |
| **Own trail** | CAN derez on it. Higher intelligence avoids better |

### AI Difficulty Tiers

Intelligence attribute (1-10) maps to three tiers:

| Tier | Intelligence | Shield Triggers | Trail Tactics | Avoidance |
|------|-------------|----------------|---------------|-----------|
| **Easy** (1-3) | Activate when nearest trail < X tiles | None — just drive | Poor — frequent self-derez |
| **Medium** (4-7) | + no escape route detected | Predict player path, attempt cuts | Decent — rare self-derez |
| **Hard** (8-10) | + trail corridor detection | Flanking + coordinated trail walls | Excellent — almost never self-derez |

All conditions always evaluated; tier determines which are acted on.

### AI Pathfinding

- **Tile-map-aware**: reads tile collision map for trail-occupied tiles ahead
- Steering behaviors: seek player, avoid obstacles, avoid trail-occupied tiles
- Raycasts for wall/barrier detection (solid geometry)
- No global pathfinding — reactive steering sufficient for arena gameplay
- Flanking behavior at Intelligence 4+ (circle around instead of direct chase)
- Dev HUD tunables: `aiAggression`, `aiReactionTime`, `aiAvoidanceRange`

## Lobby

### Layout

**arenaWidth: 400, arenaDepth: 200** (wide but shallow — ~100 units south-to-north from spawn to gates). Colosseum-style with high walls and Tron-style glowing panel architecture. Classic Tron grid floor.

```
        ┌───────────────────────────────────────────────┐
        │                                               │
        ├──┤ ARENA N ├──┤ GARAGE ├──┤ ARCHITECT ├──┤    ← North wall (gates)
        │                                               │
        │                LOBBY ARENA                    │
        │         (width 400 × depth 200)               │
        │                                               │
        │                  ★ spawn                      │
        │                                               │
        ├──────────┤ ENTRANCE ├─────────────────────┤    ← South wall (entrance)
        └───────────────────────────────────────────────┘
```

### Lobby Rules

- **Fixed campaign level** (`level-0-lobby.json`) — non-editable. Not shown in editor
- **No win condition** — the north-wall gates serve as functional exits
- **Entrance gate on south wall** — always locked (acts as wall). Entrance signText is empty
- **Lobby fully resets** on every return — trails cleared, game objects off cooldown. Player spawns stationary
- Timer hidden (no win condition or time bonus)

### Gate List

| Gate | Sign Text | Leads To | Lock Condition |
|------|-----------|----------|----------------|
| **START** | `ENTER ARENA [N]` | Loads next incomplete campaign level | Locked if no campaign levels exist. After all completed: `MORE ARENAS COMING SOON` (locked) |
| **GARAGE** | `GARAGE` | Garage showroom | Always open |
| **ARCHITECT** | `ARCHITECT` | Level editor (level list) | Always open |

**Gate behavior**: Open = glowing neon, animated pulse, rideable. Locked = dimmed neon, solid barrier (slide, not lethal).

## Garage

### Environment

Dark void background with subtle Tron grid floor. Player's cycle on a glowing circular platform with short trail preview. Cycle rotates slowly. Neon ambient lighting.

### Functions

1. **Customize Cycle Color**: Select from owned colors. Live preview on bike
2. **Customize Trail Color**: Select from owned colors. Live preview on trail
3. **Buy Colors**: Spend NEON coins to unlock new colors
4. **Upgrade Attributes**: 5 cards showing current level, next level benefit, upgrade cost
5. **View Stats**: Current coins, total earned, level progress

### Navigation

Player rides INTO the Garage gate from lobby. Inside, navigation is UI-based (not riding). "Return to Lobby" button or ESC to exit.

## Level Editor

### Overview

The editor creates **WIP levels** stored in localStorage. WIP levels are **play-testable from the editor only** — they do NOT appear in the lobby's Arena gate progression. Campaign levels (from the filesystem) are **read-only and not shown in the editor**. To make a WIP level part of the campaign: Export → place file in `levels/` directory. Only normal levels can be created (entrance + exit gates) — lobby-style 4-gate levels cannot be created.

### Interface

- **Camera**: Birds-eye orthographic view. Mouse pan (middle-click drag), scroll to zoom. Grid overlay (1-unit tiles)
- **Block palette**: Side panel with **6 floor-object categories**: Barriers, Game Objects, Instant Power-ups, Level-Permanent Power-ups, Equippable Power-ups, Enemy Objects. Wall Objects are NOT in the palette — cosmetic walls placed via click-on-edge context menu. Hovering a palette item shows preview on cursor tile
- **UI approach**: HTML/CSS overlay panels on top of the Three.js canvas

### Interaction Model

**Select-then-act** pattern:

1. **Select from palette** → click tile to place. **One floor object per tile** — editor prevents placing on occupied tiles
2. **Click placed item** → selects for editing (highlight, properties panel)
3. **Selected item actions**: Move (drag), Delete (Del), Rotate (R). Disabled actions are no-ops for that item type
4. **Gates**: can only be moved along walls (not deleted/rotated/placed)
5. **Click empty tile** with no palette selection → deselect

### Editor Features

- **Undo/Redo**: Ctrl+Z / Ctrl+Y (Cmd on Mac). Tracks all place/remove/move/property-change operations
- **Arena size**: Set at level creation via "New Level" dialog. **Minimum 40×40**. **Immutable after creation** — delete and recreate to change size
- **Wall object placement**: Click arena edge → context menu with cosmetic wall options (variant + width). **Overlap prevention**: compute wall's range `[position - width/2, position + width/2]` on its edge — reject if range overlaps any gate's or other cosmetic wall's range on the same edge. Touching (shared endpoint) is allowed, only true overlap (shared interior) is rejected. Visual feedback: red highlight on the edge segment when placement would be rejected
- **Portal pair enforcement**: Must place both portals before finalizing. Auto-assigns pair color from fixed palette (see Portal section)
- **Gate clear zones**: **5×5 area** in front of each gate (entrance AND exit). Editor prevents placing any objects in these zones. Visually highlighted. Clear zones move with gates. Overlapping clear zones between nearby gates are allowed (gates can't overlap each other, so 5×5 zones naturally don't conflict)
- **Gate position clamping**: Editor clamps gate positions so the full width stays within the wall: min = `width/2`, max = `wallLength - width/2`

### Properties Panel

Click placed block to edit:
- **Enemy**: 6 attribute sliders (1-10) + color picker
- **Building**: height slider (1-5, default 2) + shape dropdown (square/triangle/hexagon)
- **Structure**: variant dropdown (pylon/column/obelisk)
- **Portal**: pair ID + rotation
- **Gate**: destination is read-only (fixed per role). `locked` not shown (derived at runtime). signText read-only for entrance + lobby gates, editable for exit gates only
- **Cosmetic wall**: variant dropdown (panel_a/b/c) + width slider (1-10, default 5)

### Editor Navigation

- **Level List**: First screen. Shows WIP levels only. **"New Level"** button prompts for arena size → creates blank normal level (entrance on south, exit on north). **"Delete Level"** button next to each WIP level (confirmation dialog)
- **"Back to Level List"**: Returns from tile editor (auto-saves)
- **"Return to Lobby"**: Exits editor entirely
- **ESC in editor**: Deselects current selection. Does NOT exit the editor

### Save / Load / Export

- **Save**: Auto-saves WIP to localStorage. Explicit "Save" button also available
- **Load**: Level select shows WIP levels only
- **Export to Campaign**: "Export" → browser downloads level JSON. **Filename format**: `level-{N}-{slug}.json` where N = next integer after highest existing campaign level number, slug = level name lowercased, spaces → hyphens, non-alphanumeric stripped, max 30 chars (e.g. level name "The Maze" with 3 existing levels → `level-4-the-maze.json`). "Export Manifest" → downloads updated `manifest.json` with the new entry appended. Once in filesystem, levels become campaign (no longer editable)
- **Import**: File picker → loads level JSON as a new WIP level. **Validation**: `schema.js` exports `validateLevel(json)` returning `{ valid, errors[] }`. Parse errors or validation failures → show error toast ("Invalid level file: [first error]"), reject import. Same validation runs on all campaign loads — invalid campaign levels are skipped with `console.warn`, never crash the game

### Play-test

"Test" button → enter game mode for current level. **Backtick (`` ` ``) → quit back to editor** (ESC = pause menu, no conflict). Derez and completion follow normal game flow (return to lobby). **Editor play-test return**: a session-only in-memory flag (`editorPlayTestReturn = { levelId }`) is set when entering play-test. On lobby load, if this flag exists, a floating neon "Return to Editor" button appears. Clicking it → tunnel → editor with that level loaded. Flag clears on dismiss, on entering any gate, or on browser reload (not persisted to save data — ephemeral to the current editing session).

### Block Merging in Editor

Immediate visual feedback:
1. Place wall tile → single segment
2. Place adjacent wall → both merge into continuous wall
3. Remove one → other reverts to standalone
4. Same for buildings (same shape only). Structures do NOT merge

## Level Data Schema

```json
{
  "id": "level-1",
  "name": "The Grid",
  "arenaWidth": 400,
  "arenaDepth": 400,
  "wallObjects": [
    { "type": "gate", "edge": "south", "position": 200, "width": 5,
      "role": "entrance", "signText": "", "locked": true, "destination": null },
    { "type": "gate", "edge": "north", "position": 200, "width": 5,
      "role": "exit", "signText": "EXIT", "locked": true, "destination": "lobby" },
    { "type": "cosmetic_wall", "edge": "east", "position": 100, "width": 5,
      "variant": "panel_a" }
  ],
  "barriers": [
    { "type": "wall", "x": 50, "z": 30 },
    { "type": "wall", "x": 51, "z": 30 },
    { "type": "building", "x": 100, "z": 100, "height": 2, "shape": "square" },
    { "type": "structure", "x": -50, "z": 0, "variant": "pylon" }
  ],
  "gameObjects": [
    { "type": "boost_pad", "x": 0, "z": 15 },
    { "type": "portal", "x": -60, "z": 30, "rotation": 0, "pairId": "p1", "pairColor": "#FF00FF" },
    { "type": "portal", "x": 60, "z": -30, "rotation": 3.14, "pairId": "p1", "pairColor": "#FF00FF" }
  ],
  "powerups": [
    { "type": "nitro_recharge", "x": 20, "z": 0, "category": "instant" },
    { "type": "trail_extend", "x": -30, "z": 10, "category": "level_permanent" },
    { "type": "nitro_capacity", "x": 40, "z": -20, "category": "level_permanent" },
    { "type": "shield", "x": 0, "z": -40, "category": "equippable" }
  ],
  "enemies": [
    { "x": 50, "z": 100, "rotation": 3.14159, "color": "#FF6600",
      "attributes": {
        "speed": 3, "acceleration": 3, "trailLength": 4,
        "nitroBars": 3, "handling": 3, "intelligence": 3
      }
    }
  ],
  "rewards": {
    "coins": 50,
    "timeBonusThreshold": 60,
    "timeBonusCoins": 25
  }
}
```

**Schema notes:**
- `arenaWidth`/`arenaDepth` in units (tiles). Default 400×400. **Minimum 40×40**
- `wallObjects[].edge`: "north", "south", "east", "west"
- `wallObjects[].position`: absolute position along wall from start (0 = west end for north/south, 0 = south end for east/west). Clamped: min = `width/2`, max = `wallLength - width/2`
- `barriers[]`, `gameObjects[]`, `powerups[]`, `enemies[]`: floor-placed, x/z in units from arena center. **One object per tile** enforced by editor
- `rewards.timeBonusThreshold`: complete in fewer seconds → earn `timeBonusCoins` extra. `rewards: null` for lobby
- Enemy `rotation`: 0 = facing +Z (north). All rotations in radians
- Gate `role` values: `"entrance"` (always locked, empty signText), `"exit"` (locked until enemies eliminated, signText editable), `"arena"` (lobby only, always open, signText = "ENTER ARENA [N]"), `"garage"` (lobby only, always open, signText = "GARAGE"), `"architect"` (lobby only, always open, signText = "ARCHITECT")
- Gate `destination` values: `null` (entrance), `"lobby"` (exit), `"level"` (arena), `"garage"`, `"editor"`
- Lobby: `id: "level-0"`, `arenaWidth: 400`, `arenaDepth: 200`, 4 gates, no enemies, `rewards: null`

## HUD

### In-Game HUD

**Visual-only** — icons and graphics, no text labels. Clean Tron aesthetic.

```
┌──────────────────────────────────────────┐
│ ⚡87         ■ ■ ■ ■ □ □                 │
│ ╱╲ 12              ⏱ 01:23               │
│                                          │
│                                          │
│                                          │
│                                          │
│                                          │
│                          ┌──────┐        │
│  [🛡]                    │ map  │        │
│                          └──────┘        │
└──────────────────────────────────────────┘
```

- **Speed**: Icon + current speed (units/s, integer)
- **Nitro Bars**: Discrete glowing segments. Animated recharge fill. Flash red on empty press
- **Trail Length**: Trail icon + current active segment count. Does NOT show max
- **Timer**: Clock icon + elapsed time (mm:ss). **Hidden in lobby**. Starts on W press
- **Equip Slot**: Icon of equipped power-up. Empty if nothing equipped. Subtle "E" hint
- **Minimap**: Corner minimap. **Auto-scales to arena aspect ratio**. Player = cyan dot, enemies = colored dots, trails = colored lines (tile-based), obstacles = white/gray squares, items = bright colored hollow circles (type intentionally ambiguous). **No enemy count indicator** — minimap is the sole source. **No coin counter** — coins are Garage-only

### Developer HUD (`.` key toggle)

HTML/CSS overlay panel with labeled sliders/toggles. All values live-update and persist to `devHud` in save data.

**Categories:** Camera, Cycle Feel, Nitro Camera, Derez, Portal, Cooldowns, Power-ups, Nitro, Trail, Gameplay, Post-processing, Audio, AI, Near-miss

## Audio

### Music

Daft Punk / synthwave electronic soundtrack. 2 tracks:
- **Lobby / Garage / Editor**: Ambient, atmospheric, slow build
- **Gameplay**: Driving, high-energy, pulsing bass (same for all levels)

Looping, crossfade on state transitions (**1 second duration** by default, configurable as `musicCrossfadeDuration`). Autoplay on page load (`AUDIO_AUTOPLAY` flag, easy to toggle to first-interaction).

### Ambient Layer

Persistent atmospheric sounds under the music:
- **Grid hum**: Low-frequency electrical hum
- **Electric crackling**: Distant, subtle crackles
- **Arena resonance**: Deep ambient drone

Volume via `ambientVolume`.

### Sound Effects

| Event | Sound |
|-------|-------|
| **Engine idle** | Low electric hum, subtle oscillation |
| **Acceleration** | Rising electric whine, pitch follows speed |
| **Gear shifts** | Electric "chunk" at speed thresholds (`gearShiftCount` = 5). Real car gear progression (~10%, ~25%, ~45%, ~70%, ~100% of top speed) |
| **Top speed sustained** | High-pitched steady whine |
| **Nitro burst** | Whoosh + bass pulse (per bar) |
| **Nitro empty** | Fizzle/buzz |
| **Wall hit** | Metallic thud + scrape |
| **Near-miss** | Tension whoosh/zip (within `nearMissDistance` of trail/wall/barrier/structure) |
| **Trail creation** | Soft crystalline "tink" per segment |
| **Derez** | Digital shatter — glass-like implosion + reverb |
| **Instant power-up pickup** | Quick ascending chime (green) |
| **Level-permanent pickup** | Deep resonant chord (blue) |
| **Equippable pickup** | Staccato ping (purple) |
| **Shield activation** | Energy dome hum — rising tone |
| **Shield shatter** | Metallic clang + glass shatter |
| **Shield expiry** | Soft fading hum |
| **Portal enter** | Warping/bending sound |
| **Boost pad** | Quick whoosh (lighter than nitro) |
| **Gate enter** | Deep resonant hum |
| **Tunnel transition** | Rushing wind + grid whoosh |
| **Level complete** | Triumphant chord |
| **Coin reward** | Tinkling digital coins |

All configurable via Settings and Dev HUD.

## Visual Effects & Post-Processing

### Tron: Legacy Aesthetic

- **Bloom**: Heavy bloom on all emissive/neon materials
- **Environment**: Dark floor with glowing grid lines. Walls with emissive edge panels
- **Reflections**: Floor reflections (environment map or SSR-lite)
- **Atmosphere**: Subtle fog/haze for depth and distance fade
- **Trails**: Emissive translucent smooth-curved walls with pulse animation
- **Power-up color coding**: Green/Blue/Purple — distinct at a glance
- **Near-miss**: Audio-only feedback, no visual effect

### Configurable Effects (Dev HUD + Settings)

| Effect | Default | Range |
|--------|---------|-------|
| Bloom intensity | 1.5 | 0 – 5 |
| Bloom threshold | 0.3 | 0 – 1 |
| Chromatic aberration | 0.002 | 0 – 0.01 |
| CRT scanlines | Off | On/Off |
| Grid line brightness | 0.4 | 0 – 1 |
| Neon intensity multiplier | 1.0 | 0.5 – 3 |
| Fog density | 0.01 | 0 – 0.05 |

## Progression & Economy

### NEON Coins

- Earned by completing levels (`rewards.coins` + optional time bonus)
- Spent in the **Garage**
- **No replaying completed levels** — linear progression, each level's coins earned once
- **No coin counter in gameplay HUD** — coins visible in Garage only

### Attribute Upgrades (Garage)

Each attribute has 10 levels (1-10). Cost scales with level.

| Attribute | Level 1 → Level 10 | Upgrade cost per level |
|-----------|---------------------|------------------------|
| Speed | 60 → 120 units/s | 10, 20, 35, 50, 75, 100, 150, 200, 300 |
| Acceleration | 20 → 50 units/s² | Same curve |
| Trail Length | 40 → 100 segments | Same curve |
| Nitro Bars | 5 → 12 bars | Same curve |
| Handling | 2.5 → 5.0 rad/s | Same curve |

Total to max one: 940 coins. Total to max all five: 4,700 coins.

### Cosmetics (Garage)

- Cycle body colors — purchasable neon colors (50 coins each)
- Trail colors — purchasable independently (50 coins each)
- Trail auto-matches cycle color by default, can be set independently

**Color Catalog** (chosen to NOT conflict with power-up green/blue/purple):

| Color | Hex | Cost |
|-------|-----|------|
| Cyan (default) | `#00FFFF` | Free |
| Hot Pink | `#FF1493` | 50 |
| Crimson | `#FF0033` | 50 |
| Gold | `#FFD700` | 50 |
| White | `#FFFFFF` | 50 |
| Neon Yellow | `#CCFF00` | 50 |
| Coral | `#FF6B6B` | 50 |
| Ice Blue | `#66CCFF` | 50 |
| Tron Orange | `#FF6600` | 50 |

800 coins total for all cosmetics. **Tron Orange is intentionally the same as the default enemy color** — deliberate fun option, no special distinguisher.

## Controls

| Key | Action |
|-----|--------|
| **W / ↑** | Accelerate |
| **S / ↓** | Brake (no reverse) |
| **A / ←** | Steer left (works at any speed) |
| **D / →** | Steer right (works at any speed) |
| **Space** | Nitro burst (1 bar). Error buzz if empty |
| **E** | Activate equipped power-up |
| **ESC** | Pause menu |
| **`.`** | Toggle developer HUD |

Controls shown on first lobby entry (auto-shows if `controlsShown` is false, dismissible via "GOT IT" or ESC) and in pause menu.

## Work Breakdown

### Phase 1: Foundation (scaffold + cycle + movement)

| # | Task | Description |
|---|------|-------------|
| 1.1 | **Project scaffold** | `index.html` with Three.js + cannon-es importmap, module structure per file tree, basic renderer with post-processing stub, `config.js` with all constants + devHud defaults, `style.css` base styles. **Loading screen**: Tron-grid tunnel with title + progress bar (doubles as universal transition) |
| 1.2 | **Arena foundation** | Grid floor (400×400) with glowing lines (1-unit spacing), enclosing walls (~3 units) with emissive panels, basic lighting. Arena from `config.js` constants. Wall collision = slide with angle-based speed reduction |
| 1.3 | **Light cycle model** | Procedural low-poly mesh (~0.8×0.3×0.4) with emissive materials. Wheel rotation. Cyan + orange variants. Tilt/pitch/lean animations (all toggleable). Color parameterized |
| 1.4 | **Third-person chase cam** | Smooth-follow behind cycle. **Always orbits to stay behind** (including stationary turning). Defaults: `cameraDistance: 8`, `cameraHeight: 4`, `cameraLookAhead: 3`, `cameraDamping: 0.08`, `cameraTurnOffset: 1.5` (all tunable in Dev HUD Camera category). Nitro effects: FOV widen, pull-back, speed lines, motion blur (independently toggleable) |
| 1.5 | **Movement system** | Acceleration (W), braking (S, no reverse), steering (A/D, works at zero speed). Speed-dependent steering formula. Nitro overrides brake. Input manager |
| 1.6 | **Nitro boost** | Battery bar system per Nitro System spec. Hold for continuous. Handling penalty. Speed return. Recharge. HUD bars. Nitro trail visual |

### Phase 2: Trail + Collisions

| # | Task | Description |
|---|------|-------------|
| 2.1 | **Trail rendering** | CatmullRom spline segments, distance-based spawning (1 unit), FIFO, emissive material, pulse animation, color-matched |
| 2.2 | **Trail fading** | Max segments from attribute. Oldest fade + despawn. No trail at speed 0 |
| 2.3 | **Collision system** | Tile-based trail collision. Wall/barrier slide with angle-based speed reduction. Cycle-to-cycle rules (both derez, low-speed exception, shield exception). Collision groups |
| 2.4 | **Derez effect** | Implosion, trail vanish, camera shake + glitch flash + slow-mo + overhead (all toggleable). ~2s sequence. Digital shatter sound |
| 2.5 | **Near-miss system** | Detect within `nearMissDistance` of trail/wall/barrier/structure. Own-trail immunity. Audio-only feedback |
| 2.6 | **Game over / level complete** | Player derez → DEREZZED → tunnel → lobby. Enemy derez → implosion. All dead → exit gate opens + overlay |

### Phase 3: Power-ups & Game Objects

| # | Task | Description |
|---|------|-------------|
| 3.1 | **Power-up system core** | Three-category system (instant/level-permanent/equippable). Color-coded. Distinct sounds |
| 3.2 | **Instant power-ups** | Nitro Recharge (fills all bars including expanded capacity) |
| 3.3 | **Level-permanent power-ups** | Trail Extend (+10 segments). Nitro Capacity+ (+1 bar, fills) |
| 3.4 | **Shield** | Purple equippable. E to deploy. Absorbs one trail collision. Cycle-to-cycle rules. Not consumed by walls. Duration expiry |
| 3.5 | **Boost pads** | Free 1-bar nitro burst (with handling penalty). Cooldown. Visual dim |
| 3.6 | **Portals** | Paired, one-sided. Warp invulnerability + exit immunity. Trail ends/starts. Speed maintained. Cooldown |
| 3.7 | **Power-up visuals** | Float/bob/rotate. Distinct shapes per type. Pickup burst particles |

### Phase 4: AI Enemies

| # | Task | Description |
|---|------|-------------|
| 4.1 | **Enemy spawning** | Spawn at level data positions with 6 attributes + color. Same mesh + animations. **Start stationary, begin on player's first W press** |
| 4.2 | **AI steering** | Tile-map-aware trail avoidance + raycast wall avoidance. Seek/flee/wander. Self-derez rate by intelligence |
| 4.3 | **AI hunting** | Seek player. Trail-cutting. Flanking. Aggression scaling |
| 4.4 | **AI self-preservation** | Avoid own/other trails, walls, barriers. `aiReactionTime`, `aiAvoidanceRange` |
| 4.5 | **AI game mechanics** | Nitro usage (tiered), boost pads, portals, Nitro Recharge pickup, Shield pickup + tactical activation |

### Phase 5: Level System

| # | Task | Description |
|---|------|-------------|
| 5.1 | **Level data schema** | `schema.js`: JSON format per spec. `validateLevel(json)` → `{ valid, errors[] }`. All loads go through validation — invalid files skipped with `console.warn`, never crash |
| 5.2 | **Level loading** | `loader.js`: fetch campaign from `levels/manifest.json` (read-only). Load WIP from localStorage (editor-only). Campaign = gameplay, WIP = editor play-test |
| 5.3 | **Arena builder** | `arena.js`: construct scene + physics from level data |
| 5.4 | **Barrier blocks** | `blocks.js`: Wall, Building (3 shapes), Structure (3 variants). Emissive geometry. Slide on contact |
| 5.5 | **Block merging** | Adjacent walls merge. Adjacent same-shape buildings merge. 4-neighbor check on place/remove |
| 5.6 | **Gate wall objects** | `gates.js`: Neon arc (5 wide), open vs locked states, trigger zones, dynamic sign text |
| 5.7 | **Level transitions** | Tunnel animation (~1s). Input ignored during tunnel. Trail clears. Stationary spawn. Coin overlay auto-dismiss. Coins on exit only. Zero-enemy: exit open from start |
| 5.8 | **Save data system** | `savedata.js`: load/create/save to localStorage. Linear progression |
| 5.9 | **Campaign levels** | Lobby JSON (400×200, 4 gates, no enemies). 5 starter levels per difficulty curve below. `manifest.json` |

**Campaign Level Difficulty Curve** (polecat designs actual layouts within these constraints):

| Level | Arena | Enemies | New Mechanic Introduced | Power-ups |
|-------|-------|---------|------------------------|-----------|
| 1 — The Grid | 200×200 | 1 (Easy) | Basic combat — trails kill | None |
| 2 — Boost Alley | 300×300 | 2 (Easy) | Boost pads | 1 boost pad, 1 nitro recharge |
| 3 — The Rift | 400×400 | 2 (Medium) | Portals + shield | 1 portal pair, 1 shield |
| 4 — Neon Sprawl | 400×400 | 3 (Medium) | Level-permanent power-ups | Trail Extend, Nitro Capacity+ |
| 5 — The Gauntlet | 400×400 | 4 (1 Hard, 3 Medium) | Full mechanics + buildings | All types, complex layout |

### Phase 6: Level Editor

| # | Task | Description |
|---|------|-------------|
| 6.1 | **Editor camera** | Birds-eye orthographic. Pan, zoom. Grid overlay |
| 6.2 | **Block palette UI** | 6 floor-object categories. Click to select. Wall objects via edge context menu |
| 6.3 | **Place/remove/move** | Palette-first for floor (one per tile). Click-then-choose for walls (no gate overlap). Select → move/delete/rotate. Gates move only. Portal pair enforcement. Hover preview |
| 6.4 | **Properties panel** | Enemy attributes + color, building height + shape, structure variant, portal pair + rotation, gate properties (mostly read-only), cosmetic wall variant + width |
| 6.5 | **Arena size** | Set at creation ("New Level" dialog). Min 40×40. Immutable — delete and recreate to change |
| 6.6 | **Save/Load + Undo** | Auto-save WIP to localStorage. WIP levels only in dropdown. Undo/Redo stack |
| 6.7 | **Export to Campaign** | Browser download of level JSON + manifest. Becomes campaign (no longer editable) |
| 6.8 | **Import JSON** | File picker → loads as new WIP level |
| 6.9 | **Play-test** | Test button → game mode. Backtick → back to editor. Normal game flow on derez/completion. **Session-only in-memory flag** — "Return to Editor" neon button in lobby after play-test (clears on dismiss, gate entry, or browser reload) |

### Phase 7: Lobby & Garage

| # | Task | Description |
|---|------|-------------|
| 7.1 | **Lobby arena** | Build Level 0 from campaign JSON. 400×200, entrance south, 3 gates north. Timer hidden |
| 7.2 | **Gate routing** | Ride through → tunnel → destination. Start: next arena. Garage: showroom. Architect: editor list |
| 7.3 | **Garage environment** | Dark void, cycle on glowing plate, trail preview, slow rotation |
| 7.4 | **Garage UI** | Colors, Upgrades, Stats panels. "Return to Lobby" button |
| 7.5 | **Controls overlay** | Auto-show on first lobby (checks `controlsShown`). "GOT IT" + ESC to dismiss. Also in pause menu |
| 7.6 | **Pause menu + Settings** | ESC → controls, Settings (audio + visual), Resume, Quit to Lobby. **Pause freezes EVERYTHING.** Quit = derez behavior |

### Phase 8: Audio

| # | Task | Description |
|---|------|-------------|
| 8.1 | **Audio engine** | `audio.js`: Web Audio API. Music loading + looping + crossfade (1s default). SFX pool. Ambient layer. **Graceful missing-file fallback** (silence). Autoplay flag |
| 8.2 | **Music tracks** | 2 tracks via ElevenLabs API. Lobby ambient + gameplay high-energy. Dedicated bead |
| 8.3 | **Ambient layer** | Grid hum + electric crackling + arena resonance. Looping, under music |
| 8.4 | **Engine sounds** | Idle hum, acceleration whine (pitch ∝ speed), gear shifts, top-speed whine |
| 8.5 | **Game SFX** | All SFX via ElevenLabs API with detailed prompts. Graceful missing-file fallback |
| 8.6 | **Audio settings** | Volume controls in Settings + Dev HUD. Persist to save data |

### Phase 9: Polish & Effects

| # | Task | Description |
|---|------|-------------|
| 9.1 | **Post-processing** | Bloom (UnrealBloomPass), chromatic aberration (ShaderPass), CRT scanlines. Values from devHud |
| 9.2 | **Developer HUD** | `.` key toggle. Organized by category. Live-update + auto-save |
| 9.3 | **Particle effects** | Nitro flame, derez particles, power-up burst, portal warp, shield shimmer/shatter |
| 9.4 | **Minimap** | Auto-scale to arena aspect ratio. Player/enemy dots, trail lines, obstacle squares, item circles. No enemy count, no coin count |
| 9.5 | **Tunnel transition** | Dedicated Three.js scene: open-ended `CylinderGeometry` tube with grid-line emissive texture, camera flying forward along axis. `playTunnel(onComplete)`. BOOT = longer with HTML title/progress overlay, gate transitions = ~1s. Same geometry for all transitions |
| 9.6 | **Final visual pass** | Tron: Legacy fidelity check. Neon consistency, glow levels, atmosphere, color coding |

### Phase 10: Integration & Vibe Index

| # | Task | Description |
|---|------|-------------|
| 10.1 | **Update vibe/index.html** | Add "Tron: Light Cycles" link |
| 10.2 | **Cross-browser test** | Chrome, Firefox, Safari. Performance at 400×400 with 5+ enemies |
| 10.3 | **Mobile note** | "Desktop recommended" — keyboard-only game |

## Design References

- **Tron: Legacy** (2010 film) — The grid, light cycles, arena fights, ISO architecture
- **Tron: Evolution** (game) — Arena combat, light cycle handling
- **Tron Run/r** — Speed feel, trail mechanics, boost pads
- **Color palette**: Primary cyan `#00FFFF` + orange `#FF6600` on near-black `#0a0a0a` with blue-tinted grid `#1a1a3e`
- **Power-up colors**: Green `#00FF66` (instant), Blue `#0088FF` (level-permanent), Purple `#CC00FF` (equippable)

---

## Implementation checklist (dependency order + `vibe/tron` status)

This section tracks work derived from this plan. **Legend:** `[x]` = implemented in `vibe/tron` in a meaningful way · `[~]` = partial / stub · `[ ]` = missing or not wired to gameplay. Status reflects the codebase as of the last review appended here.

### Architecture and shared foundations

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **A1** | Tech stack: Three.js r160+ importmap, ES modules, cannon-es, no server | — | [x] |
| **A2** | Config override chain: `config.js` + save `devHud` merge; gameplay reads merged runtime config only | A1 | [x] |
| **A3** | Physics split: cannon-es for solids/triggers; custom tile map for trails + AI trail lookahead | A1 | [x] |
| **A4** | File tree under `vibe/tron/` per plan (engine, game, levels, ui, data, `levels/` campaign, `assets/audio/`) | A1 | [x] |

### Phase 1 — Foundation

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P1.1** | Project scaffold: `index.html`, importmap, `main.js` boot, `style.css`, renderer + post stub, `config.js` + devHud defaults, BOOT tunnel with title + progress bar | A1, A2 | [x] |
| **P1.2** | Arena foundation: grid floor (1-unit), perimeter walls, emissive panels, lighting; wall collision = slide + angle-based speed reduction | P1.1 | [x] |
| **P1.3** | Light cycle mesh: procedural low-poly, emissive, cyan/orange, wheel spin, tilt / pitch-on-accel / lean-on-brake | P1.1 | [x] |
| **P1.4** | Third-person chase cam: smooth follow behind, stationary turning, devHud camera params; nitro FOV, pull-back, speed lines, motion blur | P1.3 | [x] |
| **P1.5** | Movement: W/S (no reverse), A/D at any speed, speed-dependent turn, coast, brake; nitro overrides brake; handling penalty during nitro; input manager | P1.2, P1.3 | [x] |
| **P1.6** | Full nitro system: bar battery, Space semantics, recharge, speed return, HUD segments, empty feedback, non-collidable nitro trail visual | P1.5, A2 | [x] |

### Cross-cut: state machine and transitions

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **X1** | State machine in `main.js`: BOOT → LOBBY → (LEVEL / GARAGE / EDITOR) + PAUSE + PLAYER_DEREZ + LEVEL_COMPLETE | P1.1, P5.2, P5.7, P7.x | [x] |
| **X2** | Tunnel `playTunnel(onComplete)` for all transitions; input blocked; trails cleared; spawn rules on arrival | P1.1 | [x] |
| **X3** | Spawn system: entrance gate offset, facing, stationary; timer + enemies start on first W | P5.3, P5.6 | [x] |

### Phase 2 — Trail + collisions

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P2.1** | Trail rendering: CatmullRom segments, 1 unit traveled spawn, FIFO, emissive walls, color = cycle | P1.3 | [x] |
| **P2.2** | Trail limits / fade: max segments from attribute, fade/despawn oldest, no trail at speed 0 | P2.1, P5.8 | [x] |
| **P2.3** | Collision: tile map for trails; cycle↔cycle rules (low speed, shield); cannon groups | P1.2, P2.1, P3.4 | [x] |
| **P2.4** | Derez sequence: implosion, trail vanish, player slow-mo / overhead / shake / glitch toggles; SFX | P2.1–P2.3 | [x] |
| **P2.5** | Near-miss detection + audio; own-trail immunity alignment | P2.3, A3 | [x] |
| **P2.6** | Level outcomes: player derez path; all enemies dead → exit gate + coin overlay; zero-enemy rules | X1, P5.6, P5.7, P5.8 | [x] |

### Phase 3 — Power-ups and game objects

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P3.1** | Power-up core: three categories, colors, sounds, pickup rules | P2.3 | [x] |
| **P3.2** | Instant: Nitro Recharge | P3.1 | [x] |
| **P3.3** | Level-permanent: Trail Extend, Nitro Capacity+ (player-only) | P3.1 | [x] |
| **P3.4** | Shield equippable: E, trail/cycle rules, walls do not consume, expiry | P3.1, P2.3 | [x] |
| **P3.5** | Boost pads: 1-bar burst, cooldown, dim | P3.1, P1.6 | [x] |
| **P3.6** | Portals: paired, one-sided, invuln + exit immunity, trail break, speed kept, cooldown | P3.1, P2.1 | [x] |
| **P3.7** | Power-up visuals: float/bob/rotate, distinct shapes, pickup particles | P3.1 | [x] |

### Phase 4 — AI

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P4.1** | Enemy spawn from level data; stationary until player W; attributes + color | X3, P5.3 | [x] |
| **P4.2** | AI steering: tile trail avoidance + raycast walls | P4.1, A3 | [x] |
| **P4.3** | Hunting: seek, trail cuts, flanking, aggression | P4.2 | [x] |
| **P4.4** | Self-preservation: avoidance ranges, reaction time | P4.2 | [x] |
| **P4.5** | AI uses nitro, boost pads, portals, pickups, shield | P3.x, P4.3 | [x] |

### Phase 5 — Level system

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P5.1** | `schema.js`: level format + `validateLevel` → `{ valid, errors }`; safe skip invalid campaign | A4 | [x] |
| **P5.2** | `loader.js`: `manifest.json` + fetch campaign; WIP localStorage | P5.1 | [x] |
| **P5.3** | `arena.js`: scene + physics from level data | P5.2, P1.2 | [x] |
| **P5.4** | `blocks.js`: barriers; slide collision | P5.3 | [x] |
| **P5.5** | Block merging: walls; buildings same-shape | P5.4 | [x] |
| **P5.6** | `gates.js`: neon arcs, triggers, open vs locked, signage | P5.3 | [x] |
| **P5.7** | Transitions: tunnel; coin overlay; coins on exit ride-through; equip cleared | X2, P5.6 | [x] |
| **P5.8** | `savedata.js`: full schema, progression, cosmetics, settings | A2 | [x] |
| **P5.9** | Campaign: `level-0-lobby.json` + five starter levels + `manifest.json` | P5.1, P5.2 | [x] |

### Phase 6 — Level editor

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P6.1** | Orthographic editor camera, pan, zoom, grid | P5.1 | [x] |
| **P6.2** | Palette (six floor categories) + edge UI for wall objects | P6.1 | [x] |
| **P6.3** | Place/move/delete/rotate; gates along walls; portal pairs; clear zones; hover preview | P6.2, P5.1 | [x] |
| **P6.4** | Properties panel per object type | P6.3 | [x] |
| **P6.5** | New level dialog (min 40×40, immutable size) | P6.1 | [x] |
| **P6.6** | WIP save/load localStorage, undo/redo | P6.3 | [x] |
| **P6.7** | Export level JSON + manifest download | P6.6, P5.1 | [x] |
| **P6.8** | Import JSON → WIP with validation toast | P5.1 | [x] |
| **P6.9** | Play-test, backtick to editor, session Return to Editor in lobby | X1, P6.6 | [x] |

### Phase 7 — Lobby and garage

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P7.1** | Lobby `level-0` (400×200), four gates, no enemies, timer hidden | P5.9, P5.3 | [x] |
| **P7.2** | Gate routing + tunnel | P5.6, P5.7, X2 | [x] |
| **P7.3** | Garage environment: showroom plate, bike, trail preview | P1.3 | [x] |
| **P7.4** | Garage UI: colors, upgrades, stats, return | P5.8, P7.3 | [x] |
| **P7.5** | Controls overlay on first lobby (`controlsShown`) | P7.1 | [x] |
| **P7.6** | Pause: ESC, freeze everything, settings overlay, quit = derez | X1, P5.8 | [x] |

### Phase 8 — Audio

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P8.1** | `audio.js`: Web Audio, music loop + crossfade, SFX pool, ambient, missing-file fallback, autoplay flag | A1 | [x] |
| **P8.2** | Two music tracks (lobby/editor vs gameplay); ElevenLabs pipeline per plan | P8.1 | [x] |
| **P8.3** | Ambient layers: grid hum, crackle, resonance | P8.1 | [x] |
| **P8.4** | Engine sounds: idle, accel pitch, gears, top-speed | P8.1, P1.5 | [x] |
| **P8.5** | Full SFX table from plan | P8.1 | [x] |
| **P8.6** | Audio settings persisted | P5.8, P7.6 | [x] |

### Phase 9 — Polish

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P9.1** | Post: bloom, chromatic aberration, CRT; devHud-driven | P1.1 | [x] |
| **P9.2** | Developer HUD (`.`): categories, live persist to save | A2, P5.8 | [x] |
| **P9.3** | Particles: nitro, derez, pickups, portal, shield | P2.4, P3.7 | [x] |
| **P9.4** | Minimap per HUD spec | P2.1, P4.1 | [x] |
| **P9.5** | Tunnel scene: cylinder grid, reusable `playTunnel` durations | P1.1 | [x] |
| **P9.6** | Final Tron: Legacy visual pass | P9.1 | [x] |

### Phase 10 — Integration

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P10.1** | `vibe/index.html` link + desktop note | A4 | [x] |
| **P10.2** | Cross-browser performance pass | (full game) | [x] |
| **P10.3** | Mobile / desktop recommendation copy | P10.1 | [x] |
| **P10.4** | Tron `index.html`: meta description + Open Graph / Twitter card tags for link previews | P10.1 | [x] |
| **P10.5** | Share previews: `og:image`, `og:image:alt`, `twitter:image` pointing at site favicon asset (richer unfurls than text-only cards) | P10.4 | [x] |
| **P10.6** | Meta / link `href` for favicon + OG/Twitter images use paths **relative to the game page** so previews and icons resolve when the site is served under a path prefix (not only at domain root) | P10.4, P10.5 | [x] |
| **P10.7** | Tron `index.html` head parity: `og:site_name`; 16×16 + `.ico` + Safari `mask-icon` links (all **relative** `href` like P10.6) | P10.6 | [x] |
| **P10.8** | Tron `index.html`: `link rel="manifest"` → `vibe/tron/site.webmanifest` with game name/short_name/description, Tron `theme_color` / `background_color`, `start_url` + `scope` as `./`, icon `src` paths relative to the manifest (`../../assets/favicon/…`) for path-prefix installs | P10.7 | [x] |
| **P10.9** | Tron `index.html`: JSON-LD `VideoGame` structured data (name, description, image path relative to page, genre, free `Offer`, publisher) for search/discoverability | P10.4 | [x] |
| **P10.10** | Tron `index.html`: `preconnect` + `dns-prefetch` to `cdn.jsdelivr.net` (Three.js / cannon-es) so CDN TLS + fetch start earlier | P10.1 | [x] |
| **P10.11** | Tron page + CSS: `meta name="color-scheme" content="dark"` and `:root { color-scheme: dark }` so native scrollbars / form UI match the dark Tron shell | P10.1 | [x] |
| **P10.12** | Tron `index.html`: `modulepreload` for `three.module.js` and `cannon-es.js` (same CDN URLs as importmap, `crossorigin`) so module graph roots fetch earlier after TLS preconnect | P10.10 | [x] |
| **P10.13** | Tron `index.html`: `modulepreload` for `./js/main.js` (relative to page) so the app entry starts loading in parallel with CDN roots after preconnect | P10.12 | [x] |
| **P10.14** | Tron `index.html`: `preload` for `./css/style.css` (`as="style"`, relative `href`) immediately after CDN preconnect so shell styles start fetching in parallel with Three.js / cannon-es / `main.js` module preloads | P10.10 | [x] |
| **P10.15** | Google Fonts: `preconnect` to `fonts.googleapis.com` + `fonts.gstatic.com` (crossorigin) and `<link rel="stylesheet">` for the Orbitron/Rajdhani CSS in `index.html`; remove blocking `@import` from `css/style.css` so font discovery is not deferred behind local stylesheet parse | P10.14 | [x] |
| **P10.16** | Tron `index.html`: `fetchpriority="high"` on `preload` for `./css/style.css` and on `modulepreload` for Three.js, cannon-es, and `./js/main.js` so the browser prioritizes the shell + module graph roots on the critical path (fonts stylesheet stays default priority) | P10.14 | [x] |
| **P10.17** | Tron `index.html` + `css/style.css`: `<noscript>` full-viewport fallback (`role="alert"`) when JavaScript is disabled; Tron-styled message (inherits shell tokens) | P10.1 | [x] |
| **P10.18** | Tron `index.html`: `meta name="application-name"` + Apple web app title/capable (`apple-mobile-web-app-title`, `apple-mobile-web-app-capable`) matching `site.webmanifest` `short_name` for consistent bookmarks / Add to Home Screen labels | P10.8 | [x] |
| **P10.19** | Tron `index.html`: `og:locale` (`en_US`), explicit `meta name="robots"` (`index, follow`), and `meta name="referrer"` (`strict-origin-when-cross-origin`) for OG/social parity and predictable referrer behavior | P10.4 | [x] |
| **P10.20** | Tron `index.html`: `og:image:width`, `og:image:height`, `og:image:type` matching the shared OG/Twitter image asset (`152×152` PNG) so crawlers need not probe the file | P10.5 | [x] |
| **P10.21** | Tron `index.html`: `meta name="format-detection"` (`telephone=no`, `address=no`, `email=no`) so HUD/timer text is not auto-linked on mobile WebKit; `twitter:image:alt` mirroring `og:image:alt` for accessible Twitter cards | P10.4, P10.5 | [x] |
| **P10.22** | Tron `index.html`: `<link rel="canonical" href="./">` for path-prefix–safe duplicate URL consolidation (resolves to the current page URL) | P10.4, P10.21 | [x] |
| **P10.23** | Tron `index.html`: `apple-mobile-web-app-status-bar-style` (`black-translucent`) + `msapplication-TileColor` (`#0a0a0a`, matches manifest `theme_color`) for iOS pinned chrome and Windows tile tint | P10.8, P10.18 | [x] |
| **P10.24** | Tron `index.html` + `css/style.css`: `viewport-fit=cover` on the viewport meta so `env(safe-area-inset-*)` applies on notched devices; fixed HUD/minimap/state banner/editor-return/dev HUD use `max()` with safe-area insets (extends P10.11 mobile-adjacent shell) | P10.11, P10.1 | [x] |
| **P10.25** | Tron `site.webmanifest`: stable `id` (`./`), `lang` (`en`), `categories` (`games`, `entertainment`) for install identity and store/catalog hints | P10.8 | [x] |
| **P10.26** | Tron `index.html`: `og:url` (`./`, path-prefix–safe); JSON-LD `VideoGame.url`; `site.webmanifest`: `orientation` (`any`) for installed PWA behavior | P10.4, P10.8 | [x] |
| **P10.27** | Tron `index.html`: JSON-LD `VideoGame` adds `inLanguage` (`en`) and `playMode` (`https://schema.org/SinglePlayer`) for clearer search/entity signals | P10.9 | [x] |
| **P10.28** | Tron `index.html`: JSON-LD `VideoGame` adds `isAccessibleForFree` (`true`) and `numberOfPlayers` (`QuantitativeValue` with `minValue`/`maxValue` 1) for free-to-play and single-player entity signals | P10.27 | [x] |
| **P10.29** | Tron `browserconfig.xml` (`vibe/tron/`) with `square150x150logo` → `../../assets/favicon/mstile-150x150.png` and `TileColor` `#0a0a0a`; `index.html` `meta name="msapplication-config"` (`./browserconfig.xml`) so Windows pinned-tile branding resolves under path-prefix deploys | P10.23 | [x] |
| **P10.30** | PWA install icons: `assets/favicon/android-chrome-192x192.png` + `android-chrome-512x512.png` (same relative manifest paths as other icons); `vibe/tron/site.webmanifest` `icons` includes 192×192 and 512×512 with `purpose: "any"` so install / Lighthouse expectations are met under path-prefix deploys | P10.8 | [x] |
| **P10.31** | Tron `site.webmanifest`: `launch_handler` with `client_mode: "navigate-existing"` so Chromium-based installed PWAs / shortcuts reuse the existing app tab instead of opening duplicate sessions | P10.8 | [x] |
| **P10.32** | Tron `site.webmanifest`: `shortcuts` for installed PWA quick actions — `?perf=high` and `?perf=low` URLs wired to existing `getGraphicsProfile` / `graphicsProfile.js` tier override | P10.8, P10.2 | [x] |
| **P10.33** | Tron `site.webmanifest`: `dir` (`ltr`) + `display_override` (`standalone`, `minimal-ui`, `browser`) so installed clients and hosts that do not honor `display: standalone` still pick a sensible fallback chain | P10.8 | [x] |
| **P10.34** | Tron `site.webmanifest`: `prefer_related_applications: false` so platforms that read the flag treat the web app as the primary install surface (no native “related app” preference) for this client-only game | P10.8 | [x] |
| **P10.35** | Tron `site.webmanifest`: `screenshots` (`wide` + `narrow`) with path-prefix–safe `src` to `assets/favicon/tron-pwa-screenshot-*.png` for richer install / store-style surfaces | P10.8 | [x] |
| **P10.36** | Tron `site.webmanifest`: PWA icon `purpose` includes `maskable` alongside `any` for 144×144 / 192×192 / 512×512 entries (and shortcut icons) so adaptive-icon masks on Android/install surfaces clip predictably | P10.8, P10.30 | [x] |
| **P10.37** | Tron `index.html`: `meta name="supported-color-schemes" content="dark"` so user agents that honor the hint treat the document as dark-only (extends `color-scheme` / `:root` shell) | P10.11 | [x] |
| **P10.38** | Tron `index.html`: `translate="no"` on `#app-root` so automatic page translation does not rewrite HUD numerals, timer, gate text, or dev HUD strings mid-session | P10.1 | [x] |
| **P10.39** | Tron `index.html`: `fetchpriority="low"` on the Google Fonts stylesheet link so font CSS competes less with `./css/style.css` preload and Three.js / cannon-es / `./js/main.js` `modulepreload` roots (extends critical-path tuning from P10.16) | P10.15, P10.16 | [x] |
| **P10.40** | Tron `index.html`: `integrity` (`sha384` SRI) on jsdelivr `modulepreload` links for Three.js and cannon-es (same pinned versions as importmap) so preloaded CDN modules are cryptographically verified | P10.12 | [x] |
| **P10.41** | Tron `index.html`: `referrerpolicy="strict-origin-when-cross-origin"` on the Google Fonts stylesheet `<link>` so font CSS requests align with the document referrer policy (limits full URL in `Referer` on cross-origin stylesheet discovery) | P10.15, P10.19 | [x] |
| **P10.42** | Tron `index.html`: `integrity` (`sha384` SRI) + `crossorigin="anonymous"` on `preload` and `stylesheet` links for `./css/style.css` so the shell stylesheet is cryptographically verified (same pattern as CDN `modulepreload` SRI); update hash when `style.css` changes | P10.14, P10.40 | [x] |
| **P10.43** | Tron `index.html`: `fetchpriority="high"` on the `./css/style.css` `<link rel="stylesheet">` (not only the matching `preload`) so the applied stylesheet keeps the same priority hint as the critical-path preload (extends P10.14 / P10.16) | P10.42 | [x] |
| **P10.44** | Tron `site.webmanifest`: `handle_links` (`preferred`) so user agents that honor it route in-scope link activations into the installed PWA alongside `launch_handler` / scope (Chromium-family; ignored elsewhere) | P10.8 | [x] |
| **P10.45** | Tron `index.html`: `link rel="alternate"` with `hreflang="en"` and `hreflang="x-default"` (both `./`, path-prefix–safe) so crawlers see explicit default-locale hints alongside `html lang` / JSON-LD `inLanguage` | P10.4, P10.22 | [x] |
| **P10.46** | Tron `index.html`: `integrity` (`sha384` SRI) + `crossorigin="anonymous"` on `modulepreload` and on the `script type="module"` entry for `./js/main.js` (same pattern as `./css/style.css` and CDN roots); recompute hash when `js/main.js` changes | P10.13, P10.40 | [x] |
| **P10.47** | Tron `index.html`: `link rel="preload" as="fetch"` for `./levels/manifest.json` (`fetchpriority="low"`) so the campaign manifest can warm the HTTP cache in parallel with the module graph (same-origin `fetch` in `loadCampaignManifest`) | P10.14, P5.2 | [x] |
| **P10.48** | Tron `index.html`: `link rel="prefetch" as="fetch"` for `./levels/level-0-lobby.json` (`fetchpriority="low"`) so the lobby JSON may warm the HTTP cache in parallel with manifest + module graph (first campaign level always loaded for LOBBY) | P10.47 | [x] |
| **P10.49** | Tron `index.html`: `link rel="prefetch" as="fetch"` for `./levels/level-1-the-grid.json` (`fetchpriority="low"`) so the first campaign arena after the lobby may warm the HTTP cache alongside lobby + manifest (common “Enter Arena” path) | P10.48 | [x] |
| **P10.50** | Tron `index.html`: `link rel="prefetch" as="fetch"` for `./levels/level-2-boost-alley.json` (`fetchpriority="low"`) so the third campaign level (second arena after The Grid) may warm the HTTP cache for players who complete level 1 | P10.49 | [x] |
| **P10.51** | Tron `index.html`: `link rel="prefetch" as="fetch"` for `./levels/level-3-the-rift.json` (`fetchpriority="low"`) so the fourth campaign level may warm the HTTP cache for players progressing past Boost Alley (fourth entry in `manifest.json`) | P10.50 | [x] |
| **P10.52** | Tron `index.html`: `link rel="prefetch" as="fetch"` for `./levels/level-4-neon-sprawl.json` (`fetchpriority="low"`) so the fifth campaign level may warm the HTTP cache for players progressing past The Rift (fifth entry in `manifest.json`) | P10.51 | [x] |
| **P10.53** | Tron `index.html`: `link rel="prefetch" as="fetch"` for `./levels/level-5-the-gauntlet.json` (`fetchpriority="low"`) so the sixth campaign level may warm the HTTP cache for players progressing past Neon Sprawl (sixth entry in `manifest.json`) | P10.52 | [x] |
| **P10.54** | Tron `index.html`: `modulepreload` for `./js/config.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the first static import from `main.js` begins loading in parallel with Three.js / cannon-es / `main.js` (narrows module-graph waterfall) | P10.13 | [x] |
| **P10.55** | Tron `index.html`: `modulepreload` for `./js/gameState.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the second static import in `main.js` (after `config.js`) begins loading in parallel with the same critical-path roots | P10.54 | [x] |
| **P10.56** | Tron `index.html`: `modulepreload` for `./js/engine/camera.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the third static import in `main.js` (after `gameState.js`) begins loading in parallel with config, gameState, and CDN roots | P10.55 | [x] |
| **P10.57** | Tron `index.html`: `modulepreload` for `./js/data/savedata.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the fourth static import in `main.js` (after `camera.js`) begins loading in parallel with config, gameState, camera, Three.js, cannon-es, and `main.js` | P10.56 | [x] |
| **P10.58** | Tron `index.html`: `modulepreload` for `./js/engine/audio.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the fifth static import in `main.js` (after `savedata.js`) begins loading in parallel with config, gameState, camera, savedata, Three.js, cannon-es, and `main.js` | P10.57 | [x] |
| **P10.59** | Tron `index.html`: `modulepreload` for `./js/engine/graphicsProfile.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the sixth static import in `main.js` (after `audio.js`) begins loading in parallel with config, gameState, camera, savedata, audio, Three.js, cannon-es, and `main.js` | P10.58 | [x] |
| **P10.60** | Tron `index.html`: `modulepreload` for `./js/engine/renderer.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the seventh static import in `main.js` (after `graphicsProfile.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.59 | [x] |
| **P10.61** | Tron `index.html`: `modulepreload` for `./js/engine/tunnel.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the eighth static import in `main.js` (after `renderer.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.60 | [x] |
| **P10.62** | Tron `index.html`: `modulepreload` for `./js/engine/physics.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the ninth static import in `main.js` (after `tunnel.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.61 | [x] |
| **P10.63** | Tron `index.html`: `modulepreload` for `./js/engine/input.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the tenth static import in `main.js` (after `physics.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.62 | [x] |
| **P10.64** | Tron `index.html`: `modulepreload` for `./js/game/arena.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the eleventh static import in `main.js` (after `input.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.63 | [x] |
| **P10.65** | Tron `index.html`: `modulepreload` for `./js/game/gates.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the twelfth static import in `main.js` (after `arena.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.64 | [x] |
| **P10.66** | Tron `index.html`: `modulepreload` for `./js/game/cycle.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the thirteenth static import in `main.js` (after `gates.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.65 | [x] |
| **P10.67** | Tron `index.html`: `modulepreload` for `./js/game/playerMovement.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the fourteenth static import in `main.js` (after `cycle.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.66 | [x] |
| **P10.68** | Tron `index.html`: `modulepreload` for `./js/game/playerDrive.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the fifteenth static import in `main.js` (after `playerMovement.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.67 | [x] |
| **P10.69** | Tron `index.html`: `modulepreload` for `./js/game/nitroSystem.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the sixteenth static import in `main.js` (after `playerDrive.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.68 | [x] |
| **P10.70** | Tron `index.html`: `modulepreload` for `./js/game/particles.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the seventeenth static import in `main.js` (after `nitroSystem.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.69 | [x] |
| **P10.71** | Tron `index.html`: `modulepreload` for `./js/game/objects.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the eighteenth static import in `main.js` (after `particles.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.70 | [x] |
| **P10.72** | Tron `index.html`: `modulepreload` for `./js/game/powerups.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the nineteenth static import in `main.js` (after `objects.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.71 | [x] |
| **P10.73** | Tron `index.html`: `modulepreload` for `./js/game/trail.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the twentieth static import in `main.js` (after `powerups.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.72 | [x] |
| **P10.74** | Tron `index.html`: `modulepreload` for `./js/game/enemies.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the twenty-first static import in `main.js` (after `trail.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.73 | [x] |
| **P10.75** | Tron `index.html`: `modulepreload` for `./js/game/collisionResolve.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the twenty-second static import in `main.js` (after `enemies.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.74 | [x] |
| **P10.76** | Tron `index.html`: `modulepreload` for `./js/game/nearMiss.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the twenty-third static import in `main.js` (after `collisionResolve.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.75 | [x] |
| **P10.77** | Tron `index.html`: `modulepreload` for `./js/levels/loader.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the twenty-fourth static import in `main.js` (after `nearMiss.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.76 | [x] |
| **P10.78** | Tron `index.html`: `modulepreload` for `./js/sessionBoot.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the twenty-fifth static import in `main.js` (after `loader.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.77 | [x] |
| **P10.79** | Tron `index.html`: `modulepreload` for `./js/sessionEditorPlaytest.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the twenty-sixth static import in `main.js` (after `sessionBoot.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.78 | [x] |
| **P10.80** | Tron `index.html`: `modulepreload` for `./js/ui/garage.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the garage / destination UI module (twenty-seventh static import in `main.js`, after `sessionEditorPlaytest.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.79 | [x] |
| **P10.81** | Tron `index.html`: `modulepreload` for `./js/ui/menus.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the pause / controls overlay module (twenty-eighth static import in `main.js`, after `garage.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.80 | [x] |
| **P10.82** | Tron `index.html`: `modulepreload` for `./js/ui/devhud.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the developer HUD module (twenty-ninth static import in `main.js`, after `menus.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.81 | [x] |
| **P10.83** | Tron `index.html`: `modulepreload` for `./js/ui/hud.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the in-game HUD / minimap module (thirtieth static import in `main.js`, after `devhud.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.82 | [x] |
| **P10.84** | Tron `index.html`: `modulepreload` for `./js/levels/schema.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the level-format / `LOBBY_LEVEL_ID` module (thirty-first static import in `main.js`, after `hud.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js` | P10.83 | [x] |
| **P10.85** | Tron `index.html`: `modulepreload` for `./js/engine/post.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the bloom/CRT post-processing module (static import of `renderer.js`, not `main.js`) begins loading in parallel with the prior module preloads, Three.js, cannon-es, and `main.js`, narrowing the transitive waterfall before first frame | P10.84 | [x] |
| **P10.86** | Tron `index.html`: `modulepreload` for pinned `three@0.160.0` **addons** on jsdelivr (`Reflector`, postprocessing subgraph incl. `Pass` / `MaskPass` / `EffectComposer` / bloom + output passes, `BufferGeometryUtils`) with matching `sha384` SRI + `crossorigin`, so transitive `three/addons/…` imports from `renderer.js`, `post.js`, and `trail.js` warm the HTTP cache alongside `three.module.js` and local engine modules | P10.12, P10.85 | [x] |
| **P10.87** | Tron `index.html`: `modulepreload` for `./js/game/blocks.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the barrier / merged-wall module (first transitive static import from `arena.js`) begins loading in parallel with the explicit `main.js` import chain and other module preloads | P10.64 | [x] |
| **P10.88** | Tron `index.html`: `modulepreload` for `./js/game/trailTileMap.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the trail collision tile map module (first transitive static import from `trail.js`) begins loading in parallel with the explicit `main.js` import chain and other module preloads | P10.73 | [x] |
| **P10.89** | Tron `index.html`: `modulepreload` for `./js/game/ai.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the enemy steering / intelligence helper (static import only from `enemies.js`) begins loading in parallel with the explicit `main.js` import chain and other module preloads | P10.74 | [x] |
| **P10.90** | Tron `index.html`: `modulepreload` for `./js/game/attributes.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the upgrade attribute helper (static import only from `ui/garage.js`) begins loading in parallel with the explicit `main.js` import chain and other module preloads | P10.80 | [x] |
| **P10.91** | Tron `index.html`: `modulepreload` for `./js/ui/garageShowroom.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the garage showroom / turntable preview module (static import only from `ui/garage.js`) begins loading in parallel with the explicit `main.js` import chain and other module preloads | P10.90 | [x] |
| **P10.92** | Tron `index.html`: `modulepreload` for `./js/levels/editorExport.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the campaign export / download helper (static import only from `ui/garage.js`) begins loading in parallel with the explicit `main.js` import chain and other module preloads | P10.91 | [x] |
| **P10.93** | Tron `index.html`: `modulepreload` for `./js/levels/editorLevel.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the WIP level bootstrap / gate-clear helper (static import from `ui/garage.js` and `levels/editorWorkbench.js`) begins loading in parallel with the explicit `main.js` import chain and other module preloads | P10.92 | [x] |
| **P10.94** | Tron `index.html`: `modulepreload` for `./js/levels/editorView.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the orthographic editor viewport module (static import only from `ui/garage.js`) begins loading in parallel with the explicit `main.js` import chain and other module preloads, narrowing the transitive waterfall after `editorLevel.js` parses | P10.93 | [x] |
| **P10.95** | Tron `index.html`: `modulepreload` for `./js/levels/editorWorkbench.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the editor placement / interaction module (static import only from `ui/garage.js`) begins loading in parallel with the explicit `main.js` import chain and other module preloads, narrowing the transitive waterfall after `editorView.js` parses | P10.94 | [x] |
| **P10.96** | Tron `index.html`: `modulepreload` for `./js/levels/editorPalette.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the level editor block palette module (static import only from `ui/garage.js`) begins loading in parallel with the explicit `main.js` import chain and other module preloads, narrowing the transitive waterfall after `editorWorkbench.js` parses | P10.95 | [x] |
| **P10.97** | Tron `index.html`: `modulepreload` for `./js/levels/editorPropertiesPanel.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the level editor properties panel module (static import only from `ui/garage.js`) begins loading in parallel with the explicit `main.js` import chain and other module preloads, narrowing the transitive waterfall after `editorPalette.js` parses | P10.96 | [x] |
| **P10.98** | Tron `index.html`: `modulepreload` for `./js/levels/editorHistory.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) so the WIP editor undo/redo helper (static import only from `ui/garage.js`) begins loading in parallel with the explicit `main.js` import chain and other module preloads, narrowing the transitive waterfall after `editorPropertiesPanel.js` parses | P10.97 | [x] |
| **P10.99** | `levels/loader.js` imports `BUNDLED_CAMPAIGN_LEVEL_FILENAMES` from `levels/defaults.js` and warns when fetched `manifest.json` order/length drifts from that bundled list; Tron `index.html`: `modulepreload` for `./js/levels/defaults.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) before `loader.js` so the defaults module fetches in parallel with the critical path | P10.98, P5.2 | [x] |
| **P10.100** | `levels/loader.js` re-exports `wipLevelStorageKey` and `getWipLevelKeyPrefix` from `levels/editor.js` so the per-level WIP key helpers are part of the public loader API; Tron `index.html`: `modulepreload` for `./js/levels/editor.js` (`crossorigin="anonymous"`, `fetchpriority="high"`) after `defaults.js` and before `loader.js` so `editor.js` fetches in parallel with the campaign loader subgraph | P10.99 | [x] |
| **P10.101** | Tron `index.html`: `modulepreload` for `./js/levels/schema.js` is ordered immediately after `./js/levels/defaults.js` and before `./js/levels/editor.js` / `./js/levels/loader.js` so the level-format module warms in the same static order as `loader.js` imports (`defaults` → `schema`); duplicate `schema` `modulepreload` after `ui/hud.js` is removed | P10.100 | [x] |
| **P10.102** | Tron `index.html`: `modulepreload` for `./js/game/nitroSystem.js` is ordered immediately after `./js/config.js` (before `./js/gameState.js`) because `config.js` statically imports `nitroSystem.js`, narrowing the `config`→`nitroSystem` subgraph ahead of the rest of the explicit `main.js` import list (same waterfall pattern as `defaults`→`schema` for `loader.js` in P10.101) | P10.101 | [x] |
| **P10.103** | Tron `index.html`: `modulepreload` for `./js/engine/post.js` is ordered **before** `./js/engine/renderer.js` (after `./js/engine/graphicsProfile.js`) because `renderer.js` statically imports `post.js`, so the post stack and its Three addon subgraph warm before the renderer module parses (narrows `renderer`→`post` transitive fetch like P10.101 / P10.102) | P10.60, P10.85 | [x] |
| **P10.104** | Tron `index.html`: `link rel="prefetch"` with `as="fetch"` for `./assets/audio/music-lobby.mp3` and `./assets/audio/music-gameplay.mp3` (`fetchpriority="low"`) so optional ElevenLabs music beds may warm the HTTP cache alongside campaign JSON prefetches before `audio.prefetch` runs (same paths as `MUSIC_ASSET_URLS` in `config.js`) | P10.53, P8.1 | [x] |
| **P10.105** | Tron `index.html`: `link rel="prefetch"` with `as="image"` for `../../assets/favicon/tron-pwa-screenshot-wide.png` and `../../assets/favicon/tron-pwa-screenshot-narrow.png` (`fetchpriority="low"`) so PWA `screenshots` assets from `site.webmanifest` may warm the HTTP cache alongside music and level JSON prefetches | P10.35, P10.104 | [x] |
| **P10.106** | Tron `index.html`: `link rel="prefetch"` with `as="image"` for `../../assets/favicon/apple-touch-icon.png` (`fetchpriority="low"`) so the shared Open Graph / Twitter / JSON-LD preview image may warm the HTTP cache alongside PWA screenshot prefetches (same path as `og:image` / structured data) | P10.5, P10.105 | [x] |
| **P10.107** | Tron `index.html`: `link rel="prefetch"` with `as="image"` for `../../assets/favicon/android-chrome-512x512.png`, `android-chrome-192x192.png`, and `android-chrome-144x144.png` (`fetchpriority="low"`) so manifest `icons` and PWA `shortcuts` maskable assets may warm the HTTP cache alongside the apple-touch prefetch (same paths as `site.webmanifest`) | P10.106, P10.8, P10.30 | [x] |
| **P10.108** | Tron `index.html`: `link rel="prefetch"` with `as="image"` for `../../assets/favicon/favicon-32x32.png` and `../../assets/favicon/favicon-16x16.png` (`fetchpriority="low"`) so `<link rel="icon">` tab/bookmark assets warm the HTTP cache alongside other favicon prefetches (complements P10.107 / `site.webmanifest` smaller icon entry) | P10.107 | [x] |
| **P10.109** | Tron `index.html`: `link rel="prefetch"` with `as="image"` for `../../assets/favicon/mstile-150x150.png` (`fetchpriority="low"`) so the Windows tile image referenced by `browserconfig.xml` may warm the HTTP cache alongside other favicon/PWA image prefetches | P10.108, P10.29 | [x] |
| **P10.110** | Tron `index.html`: `link rel="prefetch"` with `as="fetch"` for `../../assets/favicon/safari-pinned-tab.svg` (`fetchpriority="low"`) so the Safari pinned-tab / `mask-icon` vector asset may warm the HTTP cache alongside other favicon prefetches | P10.109, P10.7 | [x] |
| **P10.111** | Tron `index.html`: `link rel="prefetch"` with `as="fetch"` for `./site.webmanifest` (`fetchpriority="low"`) so the Web App Manifest JSON may warm the HTTP cache alongside other low-priority fetches (complements `<link rel="manifest">` and install/detail surfaces under path-prefix deploys) | P10.8, P10.110 | [x] |
| **P10.112** | Tron `index.html`: `link rel="prefetch"` with `as="fetch"` for `./browserconfig.xml` (`fetchpriority="low"`) so the Windows tile XML referenced by `meta name="msapplication-config"` may warm the HTTP cache alongside `site.webmanifest` and other low-priority fetches (path-prefix–safe) | P10.111, P10.29 | [x] |
| **P10.113** | Tron `index.html`: `link rel="prefetch"` with `as="fetch"` for `../../assets/favicon/favicon.ico` (`fetchpriority="low"`) so the legacy `shortcut icon` `.ico` may warm the HTTP cache alongside PNG/SVG favicon prefetches (complements P10.108) | P10.112 | [x] |
| **P10.114** | Tron `index.html`: `crossorigin="anonymous"` on `rel="preload" as="fetch"` for `./levels/manifest.json` so the preload request uses CORS anonymous mode and aligns with `fetch()` from `loadCampaignManifest` for HTTP cache reuse | P10.47 | [x] |
| **P10.115** | Tron `index.html`: `crossorigin="anonymous"` on `rel="prefetch" as="fetch"` for each `./levels/level-*.json` (lobby through gauntlet, same paths as P10.48–P10.53) so prefetch requests use CORS anonymous mode and align with `fetch()` from the campaign loader for HTTP cache reuse | P10.114 | [x] |
| **P10.116** | Tron `index.html`: `crossorigin="anonymous"` on `rel="prefetch" as="fetch"` for `./assets/audio/music-lobby.mp3` and `./assets/audio/music-gameplay.mp3` (same paths as P10.104) so those prefetches use CORS anonymous mode and align with `fetch()` in `audio.js` for HTTP cache reuse | P10.104, P10.115 | [x] |
| **P10.117** | Tron `index.html`: `crossorigin="anonymous"` on remaining `rel="prefetch" as="fetch"` links (`safari-pinned-tab.svg`, `./site.webmanifest`, `./browserconfig.xml`, `../../assets/favicon/favicon.ico`) so those low-priority fetches use CORS anonymous mode and align with default `fetch()` for same-origin static assets (extends P10.111–P10.113 / P10.116 prefetch CORS parity) | P10.113, P10.116 | [x] |
| **P10.118** | Tron `index.html`: `crossorigin="anonymous"` on each `rel="prefetch" as="image"` link (PWA screenshots, apple-touch, Android chrome icons, favicon PNGs, `mstile-150x150.png`) so image prefetches use explicit CORS anonymous mode alongside fetch-prefetch parity from P10.114–P10.117 | P10.105, P10.117 | [x] |
| **P10.119** | Tron `index.html`: root `<html>` sets `dir="ltr"` alongside `lang="en"` so document base direction matches `site.webmanifest` `dir` and keeps LTR HUD/editor layout predictable in RTL-capable user agents | P10.33, P10.1 | [x] |
| **P10.120** | Tron `index.html`: JSON-LD `VideoGame` adds `screenshot` (`ImageObject` array: wide + narrow) with path-prefix–safe relative URLs matching `site.webmanifest` `screenshots` dimensions so crawlers see explicit in-game imagery alongside the primary `image` | P10.9, P10.35 | [x] |
| **P10.121** | Tron `index.html`: JSON-LD uses `@graph` — `WebPage` (`@id` `./#webpage`, `inLanguage` `en`) with `mainEntity` → `VideoGame` (`@id` `./#game`), and `VideoGame` sets `mainEntityOfPage` → `WebPage` so crawlers resolve an explicit page↔entity graph (extends P10.9 / P10.120 structured data) | P10.120 | [x] |
| **P10.122** | Tron `index.html`: JSON-LD `@graph` adds `WebSite` (`@id` `./#website`, `url` `./`, `name`, `publisher` `Organization`) and `WebPage` sets `isPartOf` → `WebSite` so crawlers see explicit site↔page hierarchy alongside page↔`VideoGame` (extends P10.121) | P10.121 | [x] |
| **P10.123** | Tron `index.html`: JSON-LD `@graph` adds a discrete `Organization` node (`@id` `./#organization`, `name`); `WebSite.publisher`, `VideoGame.publisher`, and `Offer.seller` reference that node by `@id` so crawlers consolidate publisher/seller entity signals (extends P10.122) | P10.122 | [x] |
| **P10.124** | Tron `index.html`: JSON-LD `WebSite` adds `description` (same text as `meta name="description"`) so the site entity exposes a crawlable summary alongside `name`/`url` in `@graph` (extends P10.122) | P10.122 | [x] |
| **P10.125** | Tron `index.html`: JSON-LD `Organization` adds path-prefix–safe `url` (`./`) and `logo` (`ImageObject` with same relative asset as `VideoGame.image`, `152×152`) so crawlers get explicit publisher home + brand mark alongside `@id` consolidation | P10.123 | [x] |
| **P10.126** | Tron `index.html`: JSON-LD `WebSite` adds `inLanguage` (`en`) for parity with `WebPage` / `VideoGame`; `VideoGame` adds `author` and `copyrightHolder` (each `{ "@id": "./#organization" }`) so CreativeWork authorship and rights reuse the same deduplicated `Organization` as `publisher` / `Offer.seller` | P10.125 | [x] |
| **P10.127** | Tron `index.html`: JSON-LD `WebPage` adds `name` (`Tron: Light Cycles`) and `description` (same copy as `meta name="description"`) so the page entity exposes explicit title and summary in `@graph` alongside `url` / `inLanguage` | P10.126 | [x] |
| **P10.128** | Tron `index.html`: JSON-LD `VideoGame` adds `potentialAction` as `PlayAction` with path-prefix–safe `target` (`./`) so structured data exposes an explicit browser play entry point alongside `url` and `offers` | P10.127 | [x] |
| **P10.129** | Tron `index.html`: JSON-LD `VideoGame` adds `keywords` (array of topical strings: light cycles, neon arena, Tron-inspired, browser game, arcade racing, AI opponents, campaign, level editor, WebGL, keyboard controls) so crawlers get discoverable topic signals alongside `genre` and `gamePlatform` | P10.128 | [x] |
| **P10.130** | Tron `index.html`: JSON-LD `VideoGame` adds `copyrightYear` (`2026`, aligned with `copyrightHolder`) and `softwareRequirements` (plain-text browser prerequisites: JavaScript + WebGL) for rights-year and runtime constraint signals alongside existing publisher/authorship | P10.129 | [x] |
| **P10.131** | Tron `index.html`: JSON-LD `VideoGame` adds `datePublished` and `dateModified` (ISO 8601 calendar dates, `2026-04-11`) as CreativeWork freshness signals alongside `copyrightYear` | P10.130 | [x] |
| **P10.132** | Tron `index.html`: JSON-LD `VideoGame` adds `accessibilityFeature` (W3C-aligned tokens: `fullKeyboardControl`, `highContrastDisplay`) so CreativeWork exposes keyboard-only operability and high-contrast neon UI signals alongside existing metadata | P10.131 | [x] |
| **P10.133** | Tron `index.html`: JSON-LD `VideoGame` adds `gameLocation` as `VirtualLocation` with path-prefix–safe `url` (`./`) so structured data marks in-browser play at the page URL alongside `url` and `potentialAction` | P10.132 | [x] |
| **P10.134** | Tron `index.html`: JSON-LD `VideoGame` adds `requiresSubscription` (`false`) so structured data explicitly states no paid or gated subscription alongside `isAccessibleForFree` and the free `Offer` | P10.133 | [x] |
| **P10.135** | Tron `index.html`: JSON-LD main entity uses `@type` `["VideoGame", "WebApplication"]` and adds `browserRequirements` (human-readable evergreen-browser prerequisites) so structured data marks the title as a browser-hosted web app alongside `softwareRequirements` | P10.134 | [x] |
| **P10.136** | Tron `index.html`: JSON-LD `VideoGame` adds `featureList` (string array: WebGL trails and camera, collision and combat, AI and power-ups, lobby and campaign, garage economy, level editor and playtest, Web Audio) so `SoftwareApplication`-style capability bullets complement `keywords` and runtime requirement fields | P10.135 | [x] |
| **P10.137** | Tron `index.html`: JSON-LD `VideoGame` adds `isFamilyFriendly` (`true`) so structured data exposes CreativeWork-style audience suitability alongside `keywords`, `genre`, and accessibility signals | P10.136 | [x] |
| **P10.138** | Tron `index.html`: JSON-LD `VideoGame` adds `creativeWorkStatus` (`https://schema.org/Published`) so structured data exposes an explicit CreativeWork lifecycle state alongside `datePublished`, `dateModified`, and `isFamilyFriendly` | P10.137 | [x] |
| **P10.139** | Tron `index.html`: JSON-LD `VideoGame` adds `softwareVersion` (`1.0.0`) so structured data exposes a static client release label alongside `datePublished` / `dateModified` and `creativeWorkStatus` | P10.138 | [x] |
| **P10.140** | Tron `index.html`: JSON-LD `VideoGame` adds `contentRating` (`Everyone`) so structured data exposes a simple audience rating label alongside `isFamilyFriendly`, `genre`, and `keywords` | P10.137 | [x] |
| **P10.141** | Tron `index.html`: JSON-LD `VideoGame` / `WebApplication` adds `installUrl` (`./`, path-prefix–safe) so structured data exposes an explicit browser/PWA install URL alongside `url`, `potentialAction`, and `gameLocation` | P10.128, P10.135 | [x] |
| **P10.142** | Tron `index.html`: JSON-LD `VideoGame` / `WebApplication` adds `storageRequirements` (plain text: no disk install; localStorage for saves/WIP/settings, typical size bound) so structured data states client-side persistence expectations alongside `softwareRequirements` / `browserRequirements` | P10.135, P10.141 | [x] |
| **P10.143** | Tron `index.html`: JSON-LD `VideoGame` / `WebApplication` adds `memoryRequirements` (plain text: typical browser tab RAM range vs GPU/post tier) so structured data documents runtime memory expectations alongside `storageRequirements` | P10.142 | [x] |
| **P10.144** | Tron `index.html`: JSON-LD `VideoGame` / `WebApplication` adds `processorRequirements` (plain text: JS main thread + WebGL, typical CPU expectations, `?perf=low` hint) so structured data documents CPU expectations alongside `memoryRequirements` | P10.143 | [x] |
| **P10.145** | Tron `index.html`: JSON-LD free `Offer` adds `eligibleRegion` as `Place` with `name` `Worldwide` so structured data states global eligibility alongside `availability`, `price`, and `seller` | P10.144 | [x] |
| **P10.146** | Tron `index.html`: JSON-LD free `Offer` adds `itemOffered` (`{ "@id": "./#game" }`) so structured data explicitly links the zero-price `Offer` to the `VideoGame` / `WebApplication` entity in `@graph` | P10.145 | [x] |
| **P10.147** | Tron `index.html`: JSON-LD free `Offer` adds `validFrom` (ISO 8601 calendar date aligned with `VideoGame.datePublished`) so structured data states when the zero-price offer became active alongside `availability` and `itemOffered` | P10.146 | [x] |
| **P10.148** | Tron `index.html`: JSON-LD free `Offer` adds `url` (`./`, path-prefix–safe) so structured data links the zero-price offer to the canonical play URL alongside `itemOffered`, `validFrom`, and `seller` | P10.147 | [x] |
| **P10.149** | Tron `index.html`: JSON-LD free `Offer` adds `priceSpecification` as `UnitPriceSpecification` (`price` `0`, `priceCurrency` `USD`) so structured data exposes nested unit pricing alongside top-level `price` / `priceCurrency` | P10.148 | [x] |
| **P10.150** | Tron `index.html`: JSON-LD `UnitPriceSpecification` (nested under the free `Offer`) adds `valueAddedTaxIncluded` (`false`) so structured data states VAT/sales-tax treatment alongside nested zero USD pricing | P10.149 | [x] |
| **P10.151** | Tron `index.html`: JSON-LD `UnitPriceSpecification` (nested under the free `Offer`) adds `referenceQuantity` (`QuantitativeValue` with `value` 1) so structured data states the zero USD unit price applies per single copy alongside nested `price` / `priceCurrency` | P10.150 | [x] |
| **P10.152** | Tron `index.html`: JSON-LD `UnitPriceSpecification` (nested under the free `Offer`) adds `unitCode` (`C62`, UN/CEFACT “one”) and `unitText` (`one digital copy`) so structured data states the zero USD price is scoped per standard countable unit alongside `referenceQuantity` | P10.151 | [x] |
| **P10.153** | Tron `index.html`: JSON-LD free `Offer` adds `acceptedPaymentMethod` (`https://schema.org/Free`) so structured data explicitly states no paid payment rails alongside zero USD `price` / nested `UnitPriceSpecification` | P10.152 | [x] |
| **P10.154** | Tron `index.html`: JSON-LD free `Offer` adds `businessFunction` (`http://purl.org/goodrelations/v1#Sell`) so structured data marks the zero-price grant as a standard GoodRelations sell offer alongside `itemOffered`, `seller`, and `acceptedPaymentMethod` | P10.153 | [x] |
| **P10.155** | Tron `index.html`: JSON-LD free `Offer` adds `itemCondition` (`https://schema.org/NewCondition`) so structured data marks the granted digital copy as new-condition alongside `businessFunction`, `seller`, and nested pricing | P10.154 | [x] |
| **P10.156** | Tron `index.html`: JSON-LD free `Offer` adds `deliveryLeadTime` as `QuantitativeValue` (`minValue`/`maxValue` `0`, `unitCode` `SEC`, `unitText` instant browser load) so structured data marks instant digital fulfillment alongside `availability` and zero-price `Offer` | P10.155 | [x] |
| **P10.157** | Tron `index.html`: JSON-LD free `Offer` adds `availableChannel` as `ServiceChannel` with path-prefix–safe `serviceUrl` (`./`) and `availableLanguage` (`en`) so structured data marks browser delivery of the digital grant alongside `deliveryLeadTime` and `eligibleRegion` | P10.156 | [x] |
| **P10.158** | Tron `index.html`: JSON-LD free `Offer` adds `sku` (`TLC-WEB-1.0.0`, aligned with `VideoGame.softwareVersion`) so structured data exposes a stable product identifier alongside `itemOffered`, `url`, and nested `UnitPriceSpecification` | P10.157 | [x] |
| **P10.159** | Tron `index.html`: JSON-LD free `Offer` adds `additionalProperty` (`PropertyValue`: `name` `Distribution`, `value` browser-only digital access / no physical shipment) so structured data states fulfillment mode alongside `deliveryLeadTime`, `availableChannel`, and `eligibleRegion` | P10.158 | [x] |
| **P10.160** | Tron `index.html`: JSON-LD free `Offer` extends `additionalProperty` with a second `PropertyValue` (`Access model` → instant browser play; no account required for the base campaign) so structured data states onboarding and access friction next to `Distribution` | P10.159 | [x] |
| **P10.161** | Tron `index.html`: JSON-LD free `Offer` adds `eligibleCustomerType` (`https://schema.org/Consumer`) so structured data marks the zero-price grant as intended for end-user consumers alongside worldwide `eligibleRegion` | P10.160 | [x] |
| **P10.162** | Tron `index.html`: JSON-LD free `Offer` adds `availabilityStarts` (`2026-04-11`, aligned with `validFrom` / `datePublished`) so structured data exposes when catalog availability begins for clients that distinguish `availabilityStarts` from `validFrom` | P10.161 | [x] |
| **P10.163** | Tron `index.html`: JSON-LD free `Offer` adds `category` (plain text: browser-based arcade racing video game, free digital access) so structured data exposes a product category alongside `sku` and `itemOffered` | P10.162 | [x] |
| **P10.164** | Tron `index.html`: JSON-LD free `Offer` adds `offeredBy` (`{ "@id": "./#organization" }`) so structured data explicitly links the zero-price grant to the same deduplicated `Organization` as `seller` and consolidates merchant-of-record signals | P10.123 | [x] |
| **P10.165** | Tron `index.html`: JSON-LD free `Offer` adds `availableDeliveryMethod` (`https://schema.org/OnlineDelivery`) so structured data marks browser-based digital delivery alongside `availableChannel`, `deliveryLeadTime`, and `additionalProperty` | P10.164 | [x] |
| **P10.166** | Tron `index.html`: JSON-LD `Organization` adds `description` (plain-text publisher summary) so crawlers see an explicit org blurb alongside `name`, `url`, and `logo` in `@graph` | P10.123 | [x] |
| **P10.167** | Tron `index.html`: JSON-LD `Organization` adds `knowsAbout` (string array: browser games, WebGL, Web Audio, interactive experiments, single-player arcade) so structured data exposes topical expertise signals alongside `description` and `logo` | P10.166 | [x] |
| **P10.168** | Tron `index.html`: JSON-LD `Organization` adds `areaServed` as `Place` with `name` `Worldwide` so structured data marks global digital reach alongside the free `Offer`’s worldwide `eligibleRegion` | P10.167 | [x] |
| **P10.169** | Tron `index.html`: JSON-LD `WebSite` adds `isFamilyFriendly` (`true`) so the site entity exposes the same audience suitability signal as `VideoGame` in `@graph` | P10.168 | [x] |
| **P10.170** | Tron `index.html`: JSON-LD `WebSite` adds `copyrightYear` (`2026`, aligned with `VideoGame.copyrightYear`) and `copyrightHolder` (`{ "@id": "./#organization" }`) so the site entity exposes CreativeWork-style rights metadata alongside `publisher` and `isFamilyFriendly` | P10.169 | [x] |
| **P10.171** | Tron `index.html`: JSON-LD `WebPage` adds `about` (`{ "@id": "./#game" }`) so structured data explicitly marks the page’s primary topic as the same `VideoGame` / `WebApplication` node referenced by `mainEntity` (extends P10.127) | P10.127 | [x] |
| **P10.172** | Tron `index.html`: JSON-LD `WebPage` adds `primaryImageOfPage` as `ImageObject` (path-prefix–safe `url` and `152×152` dimensions matching `VideoGame.image`) so structured data exposes the page’s primary preview imagery alongside `mainEntity` / `about` | P10.171 | [x] |
| **P10.173** | Tron `index.html`: JSON-LD `WebPage` adds `datePublished` and `dateModified` (ISO 8601 calendar dates, `2026-04-11`, aligned with `VideoGame`) so the page entity exposes CreativeWork freshness alongside `primaryImageOfPage`, `about`, and `mainEntity` | P10.172 | [x] |
| **P10.174** | Tron `index.html`: JSON-LD `WebPage` adds `isFamilyFriendly` (`true`) so the page entity exposes the same audience suitability signal as `WebSite` and `VideoGame` in `@graph` | P10.173 | [x] |
| **P10.175** | Tron `index.html`: JSON-LD `WebPage` adds `keywords` (string array aligned with `VideoGame.keywords`) so the page entity exposes topical discoverability signals alongside `about`, `mainEntity`, and `name` | P10.174 | [x] |
| **P10.176** | Tron `index.html`: JSON-LD `WebPage` adds `copyrightYear` (`2026`, aligned with `VideoGame` / `WebSite`) and `copyrightHolder` (`{ "@id": "./#organization" }`) so the page entity exposes CreativeWork-style rights metadata alongside `datePublished` / `dateModified` and `keywords` | P10.175 | [x] |
| **P10.177** | Tron `index.html`: JSON-LD `WebPage` adds `publisher` (`{ "@id": "./#organization" }`) so the page entity exposes the same deduplicated publisher reference as `WebSite` and `VideoGame` alongside `copyrightHolder` and `isPartOf` | P10.176, P10.123 | [x] |
| **P10.178** | Tron `index.html`: JSON-LD `WebPage` adds `genre` (same `["Action", "Racing"]` as `VideoGame.genre`) so the page entity exposes genre classification alongside `keywords`, `about`, and `mainEntity` | P10.177 | [x] |
| **P10.179** | Tron `index.html`: JSON-LD `WebPage` adds `isAccessibleForFree` (`true`, aligned with `VideoGame.isAccessibleForFree`) so the page entity exposes the same free-access CreativeWork signal as the main game node in `@graph` | P10.178 | [x] |

### HUD and progression

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **H1** | In-game HUD: speed, nitro segments, trail count, timer (hidden in lobby), equip + E hint, minimap | P1.6, P2.1, P9.4 | [x] |
| **H2** | Garage-only coins; linear progression; upgrade costs | P5.8, P7.4 | [x] |

### Status notes (snapshot)

- **Current:** Checklist rows above match `vibe/tron` (full state machine, dev HUD, campaign + WIP editor, AI, gates, power-ups, audio engine with procedural fallbacks, etc.). **P10.179:** `index.html` JSON-LD `WebPage` adds `isAccessibleForFree` (`true`, aligned with `VideoGame.isAccessibleForFree`) so the page entity exposes the same free-access CreativeWork signal as the main game node in `@graph`. **P10.178:** `index.html` JSON-LD `WebPage` adds `genre` (`["Action", "Racing"]`, aligned with `VideoGame.genre`) so the page entity exposes genre classification alongside `keywords`, `about`, and `mainEntity` in `@graph`. **P10.175:** `index.html` JSON-LD `WebPage` adds `keywords` (same ten strings as `VideoGame.keywords`) so the page entity exposes topical signals alongside `about`, `mainEntity`, and `name` in `@graph`. **P10.174:** `index.html` JSON-LD `WebPage` adds `isFamilyFriendly` (`true`) so the page entity exposes audience suitability alongside `WebSite` and `VideoGame` in `@graph`. **P10.172:** `index.html` JSON-LD `WebPage` adds `primaryImageOfPage` as `ImageObject` (same relative `apple-touch-icon` path and 152×152 dimensions as `VideoGame.image`) so structured data exposes the page’s primary preview image alongside `mainEntity` and `about`. **P10.170:** `index.html` JSON-LD `WebSite` adds `copyrightYear` (`2026`) and `copyrightHolder` (`./#organization`) so the site entity exposes CreativeWork-style rights metadata parallel to `VideoGame` alongside `publisher` and `isFamilyFriendly`. **P10.169:** `index.html` JSON-LD `WebSite` adds `isFamilyFriendly` (`true`) so the site entity exposes the same audience suitability signal as `VideoGame` in `@graph`. **P10.168:** `index.html` JSON-LD `Organization` adds `areaServed` as `Place` (`name` `Worldwide`) so structured data marks global digital reach alongside the free `Offer`’s worldwide `eligibleRegion`. **P10.167:** `index.html` JSON-LD `Organization` adds `knowsAbout` (browser games, WebGL, Web Audio, interactive web experiments, single-player arcade experiences) so structured data exposes topical expertise alongside `description`, `url`, and `logo`. **P10.166:** `index.html` JSON-LD `Organization` adds `description` ("Independent browser games and interactive web experiments.") so crawlers see an explicit publisher summary alongside `name`, `url`, and `logo` in `@graph`. **P10.165:** `index.html` JSON-LD free `Offer` adds `availableDeliveryMethod` (`https://schema.org/OnlineDelivery`) so structured data marks online digital delivery alongside `availableChannel`, `deliveryLeadTime`, and `additionalProperty`. **P10.164:** `index.html` JSON-LD free `Offer` adds `offeredBy` (`{ "@id": "./#organization" }`) so structured data explicitly marks the offering party alongside `seller` using the same deduplicated `Organization` node as P10.123. **P10.160:** `index.html` JSON-LD free `Offer` adds a second `additionalProperty` `PropertyValue` (`Access model` → instant play in a supported browser; no account required for the base campaign) so structured data states access and onboarding next to `Distribution`. **P10.159:** `index.html` JSON-LD free `Offer` adds `additionalProperty` as a `PropertyValue` (`Distribution` → browser-only digital access, no physical media or shipment) so structured data states digital fulfillment mode next to `deliveryLeadTime`, `availableChannel`, and worldwide `eligibleRegion`. **P10.158:** `index.html` JSON-LD free `Offer` adds `sku` (`TLC-WEB-1.0.0`, aligned with `softwareVersion` `1.0.0`) so structured data exposes a stable merchant-style product identifier next to `itemOffered` and zero-price `UnitPriceSpecification`. **P10.157:** `index.html` JSON-LD free `Offer` adds `availableChannel` as `ServiceChannel` with path-prefix–safe `serviceUrl` (`./`) and `availableLanguage` (`en`) so structured data marks browser-based fulfillment alongside `deliveryLeadTime` and worldwide `eligibleRegion`. **P10.155:** `index.html` JSON-LD free `Offer` adds `itemCondition` (`https://schema.org/NewCondition`) so structured data marks the granted digital copy as new-condition alongside `businessFunction`, `seller`, and nested `UnitPriceSpecification`. **P10.153:** `index.html` JSON-LD free `Offer` adds `acceptedPaymentMethod` (`https://schema.org/Free`) so structured data explicitly marks play as free of charge alongside zero USD pricing and nested `UnitPriceSpecification`. **P10.152:** `index.html` JSON-LD nested `UnitPriceSpecification` adds `unitCode` (`C62`) and `unitText` (`one digital copy`) so the free `Offer`’s zero USD pricing is explicitly per UN/CEFACT countable unit next to `referenceQuantity`. **P10.147:** `index.html` JSON-LD free `Offer` adds `validFrom` (`2026-04-11`, aligned with `datePublished` / `dateModified`) so structured data states when the zero-price offer became active next to `availability`, `itemOffered`, and `eligibleRegion`. **P10.144:** `index.html` JSON-LD `VideoGame` / `WebApplication` adds `processorRequirements` (JS main thread + WebGL; typical dual-core CPU expectations; `?perf=low` for weak hardware) so structured data documents CPU/runtime expectations next to `memoryRequirements`. **P10.143:** `index.html` JSON-LD `VideoGame` / `WebApplication` adds `memoryRequirements` (typical browser tab RAM range vs GPU texture budget, post tier, session length) so structured data documents runtime memory expectations next to `storageRequirements`. **P10.142:** `index.html` JSON-LD `VideoGame` / `WebApplication` adds `storageRequirements` (no disk install; localStorage for campaign, garage, editor WIP, and settings; typical footprint under 1 MB) so structured data documents client-side persistence next to `softwareRequirements` and `browserRequirements`. **P10.141:** `index.html` JSON-LD `VideoGame` / `WebApplication` adds `installUrl` (`./`) so structured data exposes an explicit install URL for the browser/PWA surface next to `url`, `potentialAction`, and `gameLocation`. **P10.139:** `index.html` JSON-LD `VideoGame` adds `softwareVersion` (`1.0.0`) so structured data exposes a static client release label next to `datePublished` / `dateModified` and `creativeWorkStatus`. **P10.138:** `index.html` JSON-LD `VideoGame` adds `creativeWorkStatus` (`https://schema.org/Published`) so structured data marks the title as a published CreativeWork next to `datePublished` / `dateModified` and `isFamilyFriendly`. **P10.137:** `index.html` JSON-LD `VideoGame` adds `isFamilyFriendly` (`true`) so structured data exposes CreativeWork-style audience suitability next to `genre`, `keywords`, and `accessibilityFeature`. **P10.136:** `index.html` JSON-LD `VideoGame` adds `featureList` (eight capability strings: rendering, collision, AI, pickups, hub and campaign, garage, editor, audio) so structured data exposes `SoftwareApplication`-style feature bullets alongside `keywords` and browser or software requirements. **P10.135:** `index.html` JSON-LD main entity `./#game` uses `@type` `["VideoGame", "WebApplication"]` and adds `browserRequirements` (evergreen browser; JavaScript, ES modules, WebGL 1+, Web Audio API, keyboard) so structured data marks the title as a browser-hosted web app alongside `softwareRequirements`. **P10.134:** `index.html` JSON-LD `VideoGame` adds `requiresSubscription` (`false`) so structured data states explicitly that play does not require a subscription, next to `isAccessibleForFree` and the free `Offer`. **P10.133:** `index.html` JSON-LD `VideoGame` adds `gameLocation` as `VirtualLocation` with path-prefix–safe `url` (`./`) so structured data marks in-browser play at the page URL next to `url` and `PlayAction`-style `potentialAction`. **P10.132:** `index.html` JSON-LD `VideoGame` adds `accessibilityFeature` (`fullKeyboardControl`, `highContrastDisplay`) so structured data notes full keyboard operation and high-contrast presentation next to `softwareRequirements` and dates. **P10.127:** `index.html` JSON-LD `WebPage` adds `name` and `description` (aligned with `<title>` and `meta name="description"`) so the `WebPage` node carries explicit page title and summary in `@graph` next to `url` and `inLanguage`. **P10.126:** `index.html` JSON-LD `WebSite` adds `inLanguage` (`en`); `VideoGame` adds `author` and `copyrightHolder` pointing at `./#organization` so authorship and rights align with the same deduplicated publisher entity as P10.123–P10.125. **P10.125:** `index.html` JSON-LD `Organization` adds path-prefix–safe `url` (`./`) and `logo` (`ImageObject`, same relative `apple-touch-icon` as `VideoGame.image`, 152×152) so publisher entity signals include a canonical home URL and brand mark. **P10.124:** `index.html` JSON-LD `WebSite` includes `description` with the same copy as `meta name="description"` so structured data exposes a site-level summary next to `name` and `url` in `@graph`. **P10.123:** `index.html` JSON-LD `@graph` adds an `Organization` node (`./#organization`) with stable `@id`; `WebSite.publisher`, `VideoGame.publisher`, and the free `Offer`’s `seller` point at that same `@id` so publisher/seller are one deduplicated entity instead of repeated inline `Organization` blobs. **P10.122:** `index.html` JSON-LD `@graph` adds a `WebSite` node (`./#website`) with path-prefix–safe `url`, display `name`, and `publisher` (`Vibe Projects`); the `WebPage` node sets `isPartOf` to that site so structured data exposes site↔page linkage next to `WebPage`↔`VideoGame`. **P10.121:** `index.html` JSON-LD wraps the prior single `VideoGame` document in `@graph`: a `WebPage` node (`./#webpage`) points `mainEntity` at the `VideoGame` (`./#game`), and the game node sets `mainEntityOfPage` back to the page for bidirectional page↔entity linkage. **P10.120:** `index.html` JSON-LD `VideoGame` includes a `screenshot` array of two `ImageObject` entries (1280×720 wide, 540×960 narrow) with the same relative paths as `site.webmanifest` `screenshots` so structured data exposes explicit game imagery next to the primary `image`. **P10.119:** `index.html` sets `dir="ltr"` on the root `<html>` next to `lang="en"` so base text direction matches `site.webmanifest` `dir` and LTR shell layout stays consistent when the UA supports RTL document modes. **P10.118:** `index.html` adds `crossorigin="anonymous"` on each `rel="prefetch" as="image"` link (screenshots through mstile) so low-priority image prefetches declare CORS anonymous mode consistently with fetch-based prefetches after P10.117. **P10.117:** `index.html` adds `crossorigin="anonymous"` on each remaining `rel="prefetch" as="fetch"` link (`safari-pinned-tab.svg`, `./site.webmanifest`, `./browserconfig.xml`, `favicon.ico`) so those prefetches use CORS anonymous mode like default `fetch()` for same-origin assets, completing prefetch CORS parity after P10.111–P10.113 and P10.116. **P10.116:** `index.html` adds `crossorigin="anonymous"` on each `rel="prefetch" as="fetch"` link for `./assets/audio/music-lobby.mp3` and `./assets/audio/music-gameplay.mp3` so those prefetches use CORS anonymous mode like `fetch()` in `audio.js`, aligning HTTP cache keys with the optional ElevenLabs music load after P10.104’s prefetch links. **P10.115:** `index.html` adds `crossorigin="anonymous"` on each `rel="prefetch" as="fetch"` link for `./levels/level-*.json` (lobby through gauntlet) so those prefetches use CORS anonymous mode like default `fetch()` for campaign level JSON, aligning HTTP cache keys with the loader after P10.114’s manifest preload. **P10.111:** `index.html` adds low-priority `prefetch` (`as="fetch"`) for `./site.webmanifest` so the Web App Manifest JSON may warm the HTTP cache alongside other low-priority fetches (complements `<link rel="manifest">` and install/detail flows). **P10.110:** `index.html` adds low-priority `prefetch` (`as="fetch"`) for `safari-pinned-tab.svg` so the Safari pinned-tab / `mask-icon` vector may warm the HTTP cache alongside other favicon prefetches. **P10.109:** `index.html` adds low-priority `prefetch` (`as="image"`) for `mstile-150x150.png` so the Windows tile asset referenced by `browserconfig.xml` may warm the HTTP cache alongside other favicon prefetches. **P10.108:** `index.html` adds low-priority `prefetch` (`as="image"`) for `favicon-32x32.png` and `favicon-16x16.png` so browser tab/bookmark icon assets warm the HTTP cache alongside Android/PWA icon prefetches. **P10.107:** `index.html` adds low-priority `prefetch` (`as="image"`) for `android-chrome-512x512.png`, `android-chrome-192x192.png`, and `android-chrome-144x144.png` so PWA manifest icons and shortcut icons warm the HTTP cache alongside the apple-touch-icon prefetch. **P10.103:** `index.html` moves `./js/engine/post.js` `modulepreload` to immediately precede `./js/engine/renderer.js` (after `graphicsProfile.js`) so `post.js` warms before `renderer.js` parses its static import of the post stack. **P10.102:** `index.html` moves `./js/game/nitroSystem.js` `modulepreload` to immediately follow `./js/config.js` (before `gameState.js`) so the module graph warms `config`→`nitroSystem` before sibling `main.js` imports. **P10.101:** `index.html` moves `./js/levels/schema.js` `modulepreload` to sit after `./js/levels/defaults.js` and before `./js/levels/editor.js` / `./js/levels/loader.js`, matching `loader.js` static import order; removes the redundant `schema` preload that previously appeared after `ui/hud.js`. **P10.100:** `loader.js` re-exports `wipLevelStorageKey` / `getWipLevelKeyPrefix` from `levels/editor.js`; `index.html` adds `modulepreload` for `./js/levels/editor.js` between `defaults.js` and `loader.js`. **P10.99:** `loader.js` imports `levels/defaults.js` and logs a console warning when `manifest.json` does not match the bundled campaign filename list; `index.html` adds `modulepreload` for `./js/levels/defaults.js` before `./js/levels/loader.js`. **P10.98:** `index.html` adds `modulepreload` for `./js/levels/editorHistory.js` so the WIP editor undo/redo module imported only by `ui/garage.js` fetches in parallel with the rest of the critical path, narrowing the transitive waterfall after `editorPropertiesPanel.js` parses. **P10.97:** `index.html` adds `modulepreload` for `./js/levels/editorPropertiesPanel.js` so the level editor properties panel module imported only by `ui/garage.js` fetches in parallel with the rest of the critical path, narrowing the transitive waterfall after `editorPalette.js` parses. **P10.96:** `index.html` adds `modulepreload` for `./js/levels/editorPalette.js` so the level editor block palette module imported only by `ui/garage.js` fetches in parallel with the rest of the critical path, narrowing the transitive waterfall after `editorWorkbench.js` parses. **P10.95:** `index.html` adds `modulepreload` for `./js/levels/editorWorkbench.js` so the editor placement / interaction module imported only by `ui/garage.js` fetches in parallel with the rest of the critical path, narrowing the transitive waterfall after `editorView.js` parses. **P10.94:** `index.html` adds `modulepreload` for `./js/levels/editorView.js` so the orthographic editor viewport module imported only by `ui/garage.js` fetches in parallel with the rest of the critical path, narrowing the transitive waterfall after `editorLevel.js` parses. **P10.93:** `index.html` adds `modulepreload` for `./js/levels/editorLevel.js` so the WIP level bootstrap / gate-clear helper imported by `ui/garage.js` and `levels/editorWorkbench.js` fetches in parallel with the rest of the critical path, narrowing the transitive waterfall after `editorExport.js` parses. **P10.90:** `index.html` adds `modulepreload` for `./js/game/attributes.js` so the garage upgrade attribute helper imported only by `ui/garage.js` fetches in parallel with the rest of the critical path, narrowing the transitive waterfall after `garage.js` parses. **P10.89:** `index.html` adds `modulepreload` for `./js/game/ai.js` so the enemy steering / intelligence module imported only by `enemies.js` fetches in parallel with the rest of the critical path, narrowing the transitive waterfall after `enemies.js` parses. **P10.87:** `index.html` adds `modulepreload` for `./js/game/blocks.js` so the barrier / merged-wall module imported by `arena.js` fetches in parallel with the rest of the critical path, narrowing the transitive waterfall after `arena.js` parses. **P10.86:** `index.html` adds `modulepreload` links for the pinned Three.js r160 **examples/jsm** subgraph used by `renderer.js` (`Reflector`), `post.js` (post-processing stack), and `trail.js` (`BufferGeometryUtils`), each with `sha384` SRI so addon modules verify like the core `three.module.js` preload and fetch in parallel with the rest of the critical path. **P10.85:** `index.html` adds `modulepreload` for `./js/engine/post.js` so the post-processing module imported by `renderer.js` (not a direct `main.js` import) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`, reducing the transitive fetch chain before first frame. **P10.84:** `index.html` adds `modulepreload` for `./js/levels/schema.js` so the level-format / `LOBBY_LEVEL_ID` module (thirty-first static import in `main.js`, after `hud.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.83:** `index.html` adds `modulepreload` for `./js/ui/hud.js` so the in-game HUD / minimap module (thirtieth static import in `main.js`, after `devhud.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.82:** `index.html` adds `modulepreload` for `./js/ui/devhud.js` so the developer HUD module (twenty-ninth static import in `main.js`, after `menus.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.81:** `index.html` adds `modulepreload` for `./js/ui/menus.js` so the pause / controls overlay module (twenty-eighth static import in `main.js`, after `garage.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.80:** `index.html` adds `modulepreload` for `./js/ui/garage.js` so the garage / destination UI module (twenty-seventh static import in `main.js`, after `sessionEditorPlaytest.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.79:** `index.html` adds `modulepreload` for `./js/sessionEditorPlaytest.js` so the editor playtest return helper (twenty-sixth static import in `main.js`, after `sessionBoot.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.78:** `index.html` adds `modulepreload` for `./js/sessionBoot.js` so the session boot-target helper (twenty-fifth static import in `main.js`, after `loader.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.77:** `index.html` adds `modulepreload` for `./js/levels/loader.js` so the campaign level loader module (twenty-fourth static import in `main.js`, after `nearMiss.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.76:** `index.html` adds `modulepreload` for `./js/game/nearMiss.js` so the near-miss distance helper (twenty-third static import in `main.js`, after `collisionResolve.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.75:** `index.html` adds `modulepreload` for `./js/game/collisionResolve.js` so the trail/cycle collision helper module (twenty-second static import in `main.js`, after `enemies.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.74:** `index.html` adds `modulepreload` for `./js/game/enemies.js` so the campaign enemy AI module (twenty-first static import in `main.js`, after `trail.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.73:** `index.html` adds `modulepreload` for `./js/game/trail.js` so the trail wall system module (twentieth static import in `main.js`, after `powerups.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.72:** `index.html` adds `modulepreload` for `./js/game/powerups.js` so the campaign power-up field module (nineteenth static import in `main.js`, after `objects.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.71:** `index.html` adds `modulepreload` for `./js/game/objects.js` so the boost pads / portals field module (eighteenth static import in `main.js`, after `particles.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.70:** `index.html` adds `modulepreload` for `./js/game/particles.js` so the gameplay particles helper (seventeenth static import in `main.js`, after `nitroSystem.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.69:** `index.html` adds `modulepreload` for `./js/game/nitroSystem.js` so the nitro bar / burst state module (sixteenth static import in `main.js`, after `playerDrive.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.68:** `index.html` adds `modulepreload` for `./js/game/playerDrive.js` so the arcade drive / player input tick helper (fifteenth static import in `main.js`, after `playerMovement.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.67:** `index.html` adds `modulepreload` for `./js/game/playerMovement.js` so the heading/velocity sync helper (fourteenth static import in `main.js`, after `cycle.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.66:** `index.html` adds `modulepreload` for `./js/game/cycle.js` so the light cycle mesh / movement module (thirteenth static import in `main.js`, after `gates.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.65:** `index.html` adds `modulepreload` for `./js/game/gates.js` so the gate wall / trigger module (twelfth static import in `main.js`, after `arena.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.64:** `index.html` adds `modulepreload` for `./js/game/arena.js` so the arena builder module (eleventh static import in `main.js`, after `input.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.63:** `index.html` adds `modulepreload` for `./js/engine/input.js` so the keyboard input manager (tenth static import in `main.js`, after `physics.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.62:** `index.html` adds `modulepreload` for `./js/engine/physics.js` so the cannon-es world / collision module (ninth static import in `main.js`, after `tunnel.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.61:** `index.html` adds `modulepreload` for `./js/engine/tunnel.js` so the tunnel transition module (eighth static import in `main.js`, after `renderer.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.60:** `index.html` adds `modulepreload` for `./js/engine/renderer.js` so the Three.js renderer module (seventh static import in `main.js`, after `graphicsProfile.js`) begins loading alongside the prior local module preloads, Three.js, cannon-es, and `main.js`. **P10.59:** `index.html` adds `modulepreload` for `./js/engine/graphicsProfile.js` so the graphics tier module (sixth static import in `main.js`, after `audio.js`) begins loading alongside `config.js`, `gameState.js`, `camera.js`, `savedata.js`, `audio.js`, Three.js, cannon-es, and `main.js`. **P10.58:** `index.html` adds `modulepreload` for `./js/engine/audio.js` so the audio engine module (fifth static import in `main.js`, after `savedata.js`) fetches alongside `config.js`, `gameState.js`, `camera.js`, `savedata.js`, Three.js, cannon-es, and `main.js`. **P10.57:** `index.html` adds `modulepreload` for `./js/data/savedata.js` so the save-data module (fourth static import in `main.js`) fetches alongside `config.js`, `gameState.js`, `camera.js`, Three.js, cannon-es, and `main.js`. **P10.56:** `index.html` adds `modulepreload` for `./js/engine/camera.js` so the chase-camera module (third static import in `main.js`) fetches alongside `config.js`, `gameState.js`, Three.js, cannon-es, and `main.js`. **P10.52:** `index.html` adds a low-priority `prefetch` (`as="fetch"`) for `./levels/level-4-neon-sprawl.json` so the fifth campaign level may warm the HTTP cache for players progressing past The Rift (fifth entry in `manifest.json`). **P10.51:** `index.html` adds a low-priority `prefetch` (`as="fetch"`) for `./levels/level-3-the-rift.json` so the fourth campaign level may warm the HTTP cache for players who reach The Rift after Boost Alley (fourth entry in `manifest.json`). **P10.50:** `index.html` adds a low-priority `prefetch` (`as="fetch"`) for `./levels/level-2-boost-alley.json` so the third campaign level may warm the HTTP cache for players progressing past level 1 (third entry in `manifest.json`). **P10.49:** `index.html` adds a low-priority `prefetch` (`as="fetch"`) for `./levels/level-1-the-grid.json` so the first arena campaign level may warm the HTTP cache alongside the lobby prefetch (second entry in `manifest.json`, typical path after the START gate). **P10.48:** `index.html` adds a low-priority `prefetch` (`as="fetch"`) for `./levels/level-0-lobby.json` so the lobby campaign level may warm the HTTP cache alongside manifest preload and module roots (first entry in `manifest.json`, always needed for LOBBY). **P10.47:** `index.html` adds a low-priority `preload` (`as="fetch"`) for `./levels/manifest.json` so the campaign manifest may begin loading alongside shell CSS and ES module roots (warms cache for `loadCampaignManifest`). **P10.46:** `index.html` adds matching `integrity="sha384-…"` and `crossorigin="anonymous"` on both the `./js/main.js` `modulepreload` and the bottom `script type="module"` so the app entry is SRI-verified like `style.css` and the pinned CDN modules (recompute SRI after any `main.js` edit). **P10.45:** `index.html` adds `alternate` links with `hreflang="en"` and `hreflang="x-default"` (each `href="./"`) for single-locale SEO parity with canonical/Open Graph. **P10.44:** `site.webmanifest` sets `handle_links` to `preferred` so supported clients prefer opening in-scope URLs in the installed PWA (complements `launch_handler.client_mode: navigate-existing`). **P10.42:** `preload` and `stylesheet` links for `./css/style.css` share matching `integrity="sha384-…"` and `crossorigin="anonymous"` so the local shell CSS is subresource-integrity checked like the pinned CDN module preloads (recompute SRI if `css/style.css` edits). **P10.40:** CDN `modulepreload` links for `three.module.js` and `cannon-es.js` include matching `integrity="sha384-…"` attributes (computed for the pinned jsdelivr versions) so the preload pipeline verifies subresource integrity before the import map graph runs. **P10.39:** Google Fonts stylesheet `<link>` uses `fetchpriority="low"` so the browser deprioritizes that request relative to high-priority shell CSS preloads and ES module roots. **P10.38:** `#app-root` sets `translate="no"` so in-browser translation features skip the interactive shell (HUD, menus, editor chrome) and avoid corrupting numeric/timer copy while the noscript fallback outside the root can still be translated. **P10.37:** `index.html` adds `meta name="supported-color-schemes"` (`dark`) next to `color-scheme` so browsers that implement the hint keep chrome/form controls aligned with the dark-only Tron shell. **P10.36:** `site.webmanifest` sets `purpose` to `"any maskable"` on the Android chrome icons (144 / 192 / 512) and on PWA `shortcuts` icons so user agents that apply maskable adaptive shapes can pick a purpose-tagged asset. Smaller favicon-sized manifest icons stay `purpose: "any"` only. **P10.35:** `site.webmanifest` lists `screenshots` with `form_factor` `wide` (1280×720) and `narrow` (540×960), each `src` relative to the manifest like other icons (`../../assets/favicon/tron-pwa-screenshot-*.png`), for clients that show install/detail imagery. **P10.34:** `site.webmanifest` sets `prefer_related_applications` to `false` so user agents that honor the flag keep the installed PWA as the primary surface when no native related apps are published. **P10.33:** `site.webmanifest` declares `dir: "ltr"` and `display_override` (`standalone` → `minimal-ui` → `browser`) so user agents that support the display override list can fall back gracefully when full `standalone` is unavailable, while keeping `display: "standalone"` as the preferred mode. **P10.32:** `site.webmanifest` adds `shortcuts` with `./?perf=high` and `./?perf=low` (relative to manifest scope) so installed PWAs can jump straight into quality vs performance graphics tiers via the same URL API as `graphicsProfile.js`. **P10.31:** `site.webmanifest` declares `launch_handler.client_mode` as `navigate-existing` so supported browsers focus or navigate an already-open installed PWA client instead of spawning extra tabs. **P10.30:** `assets/favicon` adds `android-chrome-192x192.png` and `android-chrome-512x512.png` (resized from the existing touch icon); Tron `site.webmanifest` lists them with relative `src` paths like other icons so PWA install prompts and tooling see standard icon sizes. **P10.29:** `vibe/tron/browserconfig.xml` references `mstile-150x150.png` with Tron `TileColor`; `index.html` declares `msapplication-config` with a path-prefix–safe `./browserconfig.xml` so Windows tile XML picks up the correct logo next to the game page. **P10.28:** JSON-LD `VideoGame` includes `isAccessibleForFree` and `numberOfPlayers` (1–1) alongside `playMode` / `inLanguage`. **P10.26:** `index.html` adds `og:url` (`./`) alongside canonical; JSON-LD `VideoGame` includes `url` (`./`); `site.webmanifest` sets `orientation` to `any` so installed PWAs are not locked to a single screen orientation. **P10.25:** `site.webmanifest` adds `id` (`./`), `lang` (`en`), and `categories` (`games`, `entertainment`) so installed PWAs keep a stable identity and platforms that read manifest metadata can classify the app. **P10.24:** `index.html` sets `viewport-fit=cover`; `css/style.css` offsets fixed HUD/minimap/state banner/editor “Return to Editor” chip and dev HUD with `max(…, env(safe-area-inset-*))` so overlays clear notched / home-indicator insets when safe-area env vars are non-zero. **P10.23:** `index.html` adds `apple-mobile-web-app-status-bar-style` (`black-translucent`) and `msapplication-TileColor` (`#0a0a0a`) aligned with `site.webmanifest` for iOS web-app chrome and Windows tile tint. **P10.22:** `index.html` adds `<link rel="canonical" href="./">` after referrer meta so crawlers can consolidate duplicate URLs when the game is served under a path prefix. **P10.21:** `index.html` adds `format-detection` (no telephone/address/email autolink) and `twitter:image:alt` aligned with Open Graph image alt. **P10.20:** `index.html` adds `og:image:width` / `og:image:height` (`152`) and `og:image:type` (`image/png`) for the shared preview image. **P10.19:** `index.html` adds `og:locale` (`en_US`), `meta name="robots"` (`index, follow`), and `meta name="referrer"` (`strict-origin-when-cross-origin`) next to existing Open Graph tags. **P10.18:** `index.html` adds `application-name` and Apple web-app meta (`apple-mobile-web-app-title`, `apple-mobile-web-app-capable`) matching `site.webmanifest` `short_name` ("Light Cycles"). **P10.17:** `<noscript>` injects a fixed full-viewport panel (z-index above HUD) telling users to enable JavaScript; styles use existing Tron CSS variables. **P10.16:** `index.html` sets `fetchpriority="high"` on the `preload` for `./css/style.css` and on `modulepreload` links for Three.js, cannon-es, and `./js/main.js` so first paint and the ES module roots compete less with lower-priority resources (e.g. Google Fonts CSS). **P10.15:** `index.html` adds Google Fonts `preconnect` + stylesheet link; `css/style.css` no longer uses `@import` for fonts (avoids extra round-trip after local CSS parse). **P10.14:** `index.html` adds `preload` for `./css/style.css` (`as="style"`) right after CDN `preconnect` / `dns-prefetch` so the stylesheet fetch starts alongside module preloads. **P10.13:** `index.html` adds `modulepreload` for `./js/main.js` so the application module begins fetching alongside Three.js and cannon-es (relative `href` for path-prefix deploys). **P10.12:** `index.html` adds `modulepreload` for Three.js and cannon-es entry URLs (matching the importmap, `crossorigin`) so those module roots start loading immediately after preconnect. **P10.11:** `index.html` declares dark `color-scheme`; `css/style.css` sets `color-scheme: dark` on `:root` so UA chrome (scrollbars, etc.) stays dark-appropriate. **P9.6 / Visual Effects:** arena grid floor uses a one-shot **PMREM** bake (`applyArenaFloorEnvMap` in `js/game/arena.js` after `buildArenaFromCampaignLevel`) so the floor material picks up subtle cyan/orange neon environment reflections (plan: env map). **X2:** `playTunnel` uses `options.onBegin` for trail/equip clears; tunnel session clears stuck keys via `createTronCycleKeyState`. **P10.6:** `vibe/tron/index.html` uses `../../assets/favicon/…` for `og:image`, `twitter:image`, and favicon links so crawlers and browsers resolve icons under a subdirectory deploy. **P10.7:** same page adds `og:site_name` (`Vibe Projects`), 16×16 + `favicon.ico` + `mask-icon` (cyan `#00FFFF`) with relative paths. **P10.8:** `vibe/tron/site.webmanifest` + `<link rel="manifest" href="./site.webmanifest">` — install/bookmark metadata with Tron colors and relative icon paths from the manifest location. **P10.10:** early `<head>` links `preconnect` (with `crossorigin` for ES modules) and `dns-prefetch` to `https://cdn.jsdelivr.net` so the browser opens the CDN connection before the importmap-driven module loads.

Update the **Status** column as features land.
