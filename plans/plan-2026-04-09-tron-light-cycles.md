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
| **P1.5** | Movement: W/S (no reverse), A/D at any speed, speed-dependent turn, coast, brake; nitro overrides brake; handling penalty during nitro; input manager | P1.2, P1.3 | [~] |
| **P1.6** | Full nitro system: bar battery, Space semantics, recharge, speed return, HUD segments, empty feedback, non-collidable nitro trail visual | P1.5, A2 | [x] |

### Cross-cut: state machine and transitions

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **X1** | State machine in `main.js`: BOOT → LOBBY → (LEVEL / GARAGE / EDITOR) + PAUSE + PLAYER_DEREZ + LEVEL_COMPLETE | P1.1, P5.2, P5.7, P7.x | [ ] |
| **X2** | Tunnel `playTunnel(onComplete)` for all transitions; input blocked; trails cleared; spawn rules on arrival | P1.1 | [~] |
| **X3** | Spawn system: entrance gate offset, facing, stationary; timer + enemies start on first W | P5.3, P5.6 | [ ] |

### Phase 2 — Trail + collisions

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P2.1** | Trail rendering: CatmullRom segments, 1 unit traveled spawn, FIFO, emissive walls, color = cycle | P1.3 | [x] |
| **P2.2** | Trail limits / fade: max segments from attribute, fade/despawn oldest, no trail at speed 0 | P2.1, P5.8 | [x] |
| **P2.3** | Collision: tile map for trails; cycle↔cycle rules (low speed, shield); cannon groups | P1.2, P2.1, P3.4 | [ ] |
| **P2.4** | Derez sequence: implosion, trail vanish, player slow-mo / overhead / shake / glitch toggles; SFX | P2.1–P2.3 | [ ] |
| **P2.5** | Near-miss detection + audio; own-trail immunity alignment | P2.3, A3 | [ ] |
| **P2.6** | Level outcomes: player derez path; all enemies dead → exit gate + coin overlay; zero-enemy rules | X1, P5.6, P5.7, P5.8 | [ ] |

### Phase 3 — Power-ups and game objects

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P3.1** | Power-up core: three categories, colors, sounds, pickup rules | P2.3 | [ ] |
| **P3.2** | Instant: Nitro Recharge | P3.1 | [ ] |
| **P3.3** | Level-permanent: Trail Extend, Nitro Capacity+ (player-only) | P3.1 | [ ] |
| **P3.4** | Shield equippable: E, trail/cycle rules, walls do not consume, expiry | P3.1, P2.3 | [ ] |
| **P3.5** | Boost pads: 1-bar burst, cooldown, dim | P3.1, P1.6 | [ ] |
| **P3.6** | Portals: paired, one-sided, invuln + exit immunity, trail break, speed kept, cooldown | P3.1, P2.1 | [ ] |
| **P3.7** | Power-up visuals: float/bob/rotate, distinct shapes, pickup particles | P3.1 | [ ] |

### Phase 4 — AI

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P4.1** | Enemy spawn from level data; stationary until player W; attributes + color | X3, P5.3 | [ ] |
| **P4.2** | AI steering: tile trail avoidance + raycast walls | P4.1, A3 | [ ] |
| **P4.3** | Hunting: seek, trail cuts, flanking, aggression | P4.2 | [ ] |
| **P4.4** | Self-preservation: avoidance ranges, reaction time | P4.2 | [ ] |
| **P4.5** | AI uses nitro, boost pads, portals, pickups, shield | P3.x, P4.3 | [ ] |

### Phase 5 — Level system

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P5.1** | `schema.js`: level format + `validateLevel` → `{ valid, errors }`; safe skip invalid campaign | A4 | [x] |
| **P5.2** | `loader.js`: `manifest.json` + fetch campaign; WIP localStorage | P5.1 | [x] |
| **P5.3** | `arena.js`: scene + physics from level data | P5.2, P1.2 | [x] |
| **P5.4** | `blocks.js`: barriers; slide collision | P5.3 | [x] |
| **P5.5** | Block merging: walls; buildings same-shape | P5.4 | [x] |
| **P5.6** | `gates.js`: neon arcs, triggers, open vs locked, signage | P5.3 | [ ] |
| **P5.7** | Transitions: tunnel; coin overlay; coins on exit ride-through; equip cleared | X2, P5.6 | [~] |
| **P5.8** | `savedata.js`: full schema, progression, cosmetics, settings | A2 | [x] |
| **P5.9** | Campaign: `level-0-lobby.json` + five starter levels + `manifest.json` | P5.1, P5.2 | [x] |

### Phase 6 — Level editor

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P6.1** | Orthographic editor camera, pan, zoom, grid | P5.1 | [ ] |
| **P6.2** | Palette (six floor categories) + edge UI for wall objects | P6.1 | [ ] |
| **P6.3** | Place/move/delete/rotate; gates along walls; portal pairs; clear zones; hover preview | P6.2, P5.1 | [ ] |
| **P6.4** | Properties panel per object type | P6.3 | [ ] |
| **P6.5** | New level dialog (min 40×40, immutable size) | P6.1 | [ ] |
| **P6.6** | WIP save/load localStorage, undo/redo | P6.3 | [ ] |
| **P6.7** | Export level JSON + manifest download | P6.6, P5.1 | [ ] |
| **P6.8** | Import JSON → WIP with validation toast | P5.1 | [ ] |
| **P6.9** | Play-test, backtick to editor, session Return to Editor in lobby | X1, P6.6 | [ ] |

### Phase 7 — Lobby and garage

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P7.1** | Lobby `level-0` (400×200), four gates, no enemies, timer hidden | P5.9, P5.3 | [ ] |
| **P7.2** | Gate routing + tunnel | P5.6, P5.7, X2 | [ ] |
| **P7.3** | Garage environment: showroom plate, bike, trail preview | P1.3 | [ ] |
| **P7.4** | Garage UI: colors, upgrades, stats, return | P5.8, P7.3 | [ ] |
| **P7.5** | Controls overlay on first lobby (`controlsShown`) | P7.1 | [ ] |
| **P7.6** | Pause: ESC, freeze everything, settings overlay, quit = derez | X1, P5.8 | [ ] |

### Phase 8 — Audio

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P8.1** | `audio.js`: Web Audio, music loop + crossfade, SFX pool, ambient, missing-file fallback, autoplay flag | A1 | [~] |
| **P8.2** | Two music tracks (lobby/editor vs gameplay); ElevenLabs pipeline per plan | P8.1 | [ ] |
| **P8.3** | Ambient layers: grid hum, crackle, resonance | P8.1 | [ ] |
| **P8.4** | Engine sounds: idle, accel pitch, gears, top-speed | P8.1, P1.5 | [ ] |
| **P8.5** | Full SFX table from plan | P8.1 | [ ] |
| **P8.6** | Audio settings persisted | P5.8, P7.6 | [ ] |

### Phase 9 — Polish

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P9.1** | Post: bloom, chromatic aberration, CRT; devHud-driven | P1.1 | [x] |
| **P9.2** | Developer HUD (`.`): categories, live persist to save | A2, P5.8 | [ ] |
| **P9.3** | Particles: nitro, derez, pickups, portal, shield | P2.4, P3.7 | [ ] |
| **P9.4** | Minimap per HUD spec | P2.1, P4.1 | [ ] |
| **P9.5** | Tunnel scene: cylinder grid, reusable `playTunnel` durations | P1.1 | [x] |
| **P9.6** | Final Tron: Legacy visual pass | P9.1 | [~] |

### Phase 10 — Integration

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **P10.1** | `vibe/index.html` link + desktop note | A4 | [x] |
| **P10.2** | Cross-browser performance pass | (full game) | [ ] |
| **P10.3** | Mobile / desktop recommendation copy | P10.1 | [ ] |

### HUD and progression

| ID | Task | Depends on | Status |
|----|------|------------|--------|
| **H1** | In-game HUD: speed, nitro segments, trail count, timer (hidden in lobby), equip + E hint, minimap | P1.6, P2.1, P9.4 | [ ] |
| **H2** | Garage-only coins; linear progression; upgrade costs | P5.8, P7.4 | [ ] |

### Status notes (snapshot)

- **Implemented or largely present:** importmap and cannon-es; `config.js` + devHud defaults; **A2** — `createRuntimeFromPlayerSave`, `getArenaPlaytestConfig(...).world` for trail geometry chain, devHud keyboard toggles persisted to save, attribute speeds via merged runtime + `getArenaPlaytestConfig`; boot tunnel with title/progress; arena grid + walls + wall slide; **P5.4** — `js/game/blocks.js` builds wall / building / structure barriers from level JSON (emissive meshes + static boxes), `applyContinuousBarrierSlide` in `physics.js` so arcade drive slides on barriers; procedural light cycle + chase camera + post (bloom, CA, CRT, nitro blur); core WASD movement with coast/brake; `js/game/trail.js` — CatmullRom trail wall meshes (1u anchors, FIFO cap from Trail Length attribute, save trail color); `js/levels/schema.js` with `validateLevel`; `js/levels/loader.js` — campaign manifest fetch + per-file validation (warn/skip invalid), WIP CRUD in localStorage; first valid campaign level (if any) drives sandbox arena dimensions via `getArenaPlaytestConfig`; `savedata.js`; tunnel helper + input blocking; Tron link on vibe index; partial `audio.js` scaffolding; **A4** — planned module stubs live: `js/ui/{hud,devhud,menus,garage}.js`, `js/game/{attributes,powerups,objects,ai,gates}.js`, `js/levels/{defaults,editor}.js`, `assets/audio/.gitkeep`.
- **Partial:** `main.js` is boot → arena sandbox only (no full state machine); no `.` dev HUD UI; many planned `js/game/*`, `js/ui/*`, `js/levels/{defaults,editor}.js` files not yet present — `assets/audio/README.txt` holds the folder for future tracks; perimeter arena is driven by selected campaign level (`selectPlaytestCampaignLevel` + `buildArenaFromCampaignLevel`); barriers/gates not yet built from JSON.
- **Missing:** trail derez wiring (P2.3), AI, gates, interior barrier merge (P5.5), power-ups, portals, garage, editor, full HUD beyond speed/nitro/trail count, most SFX/music content, Phase 6–7 UI flows.

Update the **Status** column as features land.
