# Tron: Light Cycles — Three.js Arena Game

## Goal

Build a Tron: Legacy-inspired light cycle arena game. Single-player with AI hunters, level-based progression, a tile-based level editor, and a lobby-as-menu system where gates lead to game functions. Third-person chase cam, smooth analog steering, fading trails, nitro boosts, and upgradeable attributes. Tron Legacy neon aesthetic — architectural depth, volumetric light, cyan/orange palette.

## Product

- **Target feel**: Tron: Legacy (2010) — fast, sleek, neon-soaked action
- **Core loop**: Lobby → ride through "Enter Arena N" gate → enter level → eliminate all enemies → exit gate opens → ride through exit → return to lobby with coins → ride to Garage to upgrade/customize → next arena
- **Win condition per level**: All enemy cycles eliminated (crashed into trails or each other)
- **Lobby**: Level 0 — same mechanics as any level, spacious colosseum with gates. No enemies by default but can add any via editor for testing. No win condition — lobby is the exception
- **Gates**: Neon-signed arcs in the lobby — Enter Arena N, Garage, Level Editor (Architect)
- **Garage**: Showroom-style space (dark Tron-flavored background, bike centered on a glowing plate with a short trail). Player customizes cycle/trail colors and upgrades attributes here
- **Level Editor**: Birds-eye view, tile grid, place building blocks, enemies, power-ups, entrances/exits. Dev-only tool for now
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

All of these are tunable via `config.js` and the Developer HUD.

## Architecture

### Tech Stack

- **Three.js** r160+ via CDN importmap (ES modules)
- **cannon-es** 0.20+ for physics (wall/barrier/cycle-body collisions, trigger zones)
- **No server** — purely client-side, custom levels in localStorage, campaign levels fetched from `levels/` directory
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
    ├── level-0-lobby.json  # Level 0: The lobby
    ├── level-1-the-grid.json
    ├── level-2-...json
    └── ...                 # Editor "Export to Campaign" writes new files here
```

### Game State Machine

```
BOOT → LOBBY → (gate interaction) → LEVEL / GARAGE / EDITOR
                   ↑                    ↓
                   │              LEVEL_COMPLETE → coin overlay → ride to exit → LOBBY
                   │                    ↓
                   │              PLAYER_DEREZ → derez animation → LOBBY (retry same level)
                   │
                   └──── GARAGE (return to lobby button)
```

- **BOOT**: Show **tunnel loading screen** — the Tron-grid tunnel animation doubles as the loading screen (game title "TRON: LIGHT CYCLES" overlaid on the tunnel, loading progress bar at bottom). Load assets, load/create save data, init renderer. When complete, tunnel delivers player into LOBBY
- **LOBBY**: Level 0, free ride, all gates available. Controls overlay on first visit
- **LEVEL**: Brief Tron-grid tunnel transition → spawn 2 units in front of entrance gate → gameplay → all enemies eliminated → exit gate opens → coin reward overlay (game NOT paused during overlay — player can ride, and if they reach exit gate the overlay disappears and transition triggers). **Coins only awarded on exit gate** — derez after overlay but before exiting forfeits reward → ride through exit → tunnel transition → LOBBY at entrance
- **GARAGE**: Showroom space — bike on glowing plate with trail preview. Customize cycle/trail colors. Upgrade attributes. "Return to Lobby" button
- **EDITOR**: Birds-eye view. Level list (select existing or create new blank level). Tile grid, block palette. Save/export/import. "Return to Lobby" + "Back to Level List" buttons
- **PAUSE**: ESC key — shows controls, settings (audio/visual), resume, quit to lobby. Settings is an **overlay accessed from pause menu only** — no separate gate or 3D scene
- **PLAYER_DEREZ**: Derez animation (implosion + overhead camera pull-back) → respawn at lobby entrance gate → same level gate still shows same arena N

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
    "wallHeight": 3.0
  },
  "controlsShown": false
}
```

**Field notes:**
- `attributes` levels are 1-10 (1 = base, 10 = max). Mapped to gameplay values in `config.js`
- `completedLevels` is an array of level IDs (0 = lobby, always completed)
- `devHud` stores ALL developer HUD tweakable values — these override defaults from `config.js`. Key values: `cycleFriction` = velocity multiplier per frame when coasting (0.98 = gentle drag), `brakeDeceleration` = deceleration rate in units/s² when pressing brake, `boostPadStrength` = duration multiplier for boost pad nitro burst (1.0 = same as 1 bar burst duration), `enginePitch` = base pitch multiplier for engine sounds (1.0 = normal, higher = whine shifted up)
- `cosmetics.ownedCycleColors` / `ownedTrailColors` — colors the player has purchased
- `settings` is the player-facing settings (from pause menu Settings panel)
- `controlsShown` — tracks whether the controls overlay has been shown to the player (set to `true` after first lobby entry). Used to auto-show controls on first visit only
- On first load: if no save data exists, create with defaults above

## The Light Cycle

### Model

Procedural low-poly mesh faithful to Tron: Legacy design. Glowing body panels, light strip accents, wheel glow. Emissive materials for the neon look. Player = cyan (`#00FFFF`), enemies = orange (`#FF6600`) by default. Player color is customizable in Garage.

Cycle mesh fits within 1 unit tile: ~0.8 units long, ~0.3 units wide, ~0.4 units tall.

### Cycle Animations

| Animation | Trigger | Details | Dev HUD Control |
|-----------|---------|---------|-----------------|
| **Tilt on steering** | A/D keys | Cycle leans into the turn direction. Tilt angle is fixed (up to `cycleTiltMax` radians), animated smoothly. Returns to upright when steering stops | `cycleTiltMax` (default 0.3 rad, ~17°) |
| **Pitch forward on acceleration** | W key | Subtle forward pitch while accelerating. Fixed angle, animated | `cyclePitchOnAccel` (toggle, default on) |
| **Lean back on braking** | S key | Subtle backward lean while braking. Fixed angle, animated | `cycleLeanOnBrake` (toggle, default on) |
| **Wheel rotation** | Always when moving | Wheel spin speed proportional to cycle speed | — |

### Movement

| Attribute | Description | Level 1 Value | Level 10 Value | Upgradeable |
|-----------|-------------|---------------|----------------|-------------|
| **Speed** | Top speed (units/s) | 60 | 120 | Yes |
| **Acceleration** | Acceleration (units/s²) | 20 | 50 | Yes |
| **Trail Length** | Max trail segments | 40 | 100 | Yes |
| **Nitro Bars** | Number of nitro burst charges | 5 | 12 | Yes |
| **Handling** | Turn rate (radians/s) | 2.5 | 5.0 | Yes |

- **Smooth analog steering** — left/right turns at a rate governed by handling attribute
- **Speed-dependent steering** — handling attribute sets the **base turn rate multiplier**, and actual agility decreases with speed. At low speed the cycle is nimble; at top speed it's harder to turn. The falloff follows `effectiveTurnRate = baseTurnRate / (1 + speed * steeringSpeedFalloff)` where `steeringSpeedFalloff` (default **0.02**, tunable `k` in Dev HUD) controls how aggressively speed reduces steering. This means handling upgrades make a meaningful difference at ALL speeds, not just low speed
- **Acceleration** — W/up to accelerate toward top speed
- **Braking** — S/down to decelerate toward zero at `brakeDeceleration` rate (default **40 units/s²**, tunable in Dev HUD). **No reverse.** Cycle stops at zero speed
- **Coasting** (no gas, no brake) — cycle slows via drag. Each frame: `speed *= cycleFriction` (default **0.98**). At 60 units/s this means ~1.2 units/s lost per frame at 60fps — gentle coast to near-stop over several seconds
- **Turning while stationary** — steering works at any speed including zero, so player can reorient after stopping
- **Nitro boost** — See Nitro System below. **Handling becomes heavier during nitro** (turn rate multiplied by `nitroHandlingMultiplier`, default 0.6)

### Nitro System

Nitro is a **battery bar system**, not a continuous gauge.

- Default: **5 bars** (upgradeable to 12 via Nitro Bars attribute)
- Each **Space press** = consume 1 bar = one burst of speed lasting `nitroBurstDuration` seconds (default **0.5s**, tunable in Dev HUD at 0.1s granularity)
- **Cannot double-tap**: If nitro is already active, pressing Space again does NOT consume another bar and does NOT restart the burst. The current burst must end before a new one can begin
- **Hold for continuous boost**: If Space is held, as soon as the current burst ends (bar depletion animation completes), the next burst starts automatically consuming the next bar. This creates a continuous boost feeling with all visual/audio effects sustained until the player releases Space or runs out of bars
- **Maximum speed boost cap**: Nitro-boosted max speed = `topSpeed × nitroMaxSpeedMultiplier` (default **1.2**, i.e., topSpeed + 20%). Tunable in Dev HUD. Holding nitro sustains that cap, it doesn't stack higher. Base top speed itself is also tunable via Dev HUD
- **Speed return after burst ends**: When the final burst ends (player releases Space or bars deplete), speed decreases back to normal top speed over `nitroSpeedReturnTime` seconds (default **0.25s** — half the burst duration). This return time only applies if the player is still holding gas (W). If the player releases gas or brakes, normal deceleration takes over (much faster, irrelevant to nitro)
- **Handling penalty** applies only while a nitro burst is active (turn rate × `nitroHandlingMultiplier`). Ends when the burst ends
- Bars **recharge slowly** — 1 bar per `nitroBarRechargeTime` seconds (default 5s, tunable in Dev HUD)
- HUD shows bars as discrete glowing segments (filled = charged, empty = recharging)
- **Empty nitro feedback**: pressing Space with 0 bars plays an error buzz sound (like nitro trying to ignite but fizzling out) and flashes the bar display
- **Nitro Recharge power-up**: fills ALL bars instantly
- **Nitro Capacity+ power-up**: adds `nitroCapacityPlusAmount` bars (default 1) AND fills the new capacity (level-permanent)
- **Boost Pad game object**: equivalent to 1 bar burst but doesn't consume a bar — free boost

### Nitro Camera & Visual Effects

When nitro activates, the game should FEEL powerful. All of these are toggleable via Dev HUD:

| Effect | Description | Dev HUD Toggle |
|--------|-------------|----------------|
| **FOV widening** | Camera FOV briefly increases during burst, returns after | `nitroFovWiden` |
| **Camera pull-back** | Camera pulls slightly further from cycle during burst | `nitroCameraPullBack` |
| **Speed lines** | Streaking lines on screen edges during burst | `nitroSpeedLines` |
| **Motion blur** | Radial motion blur during burst | `nitroMotionBlur` |
| **Nitro trail** | A bright white short secondary trail appears behind the cycle during nitro burst, separate from the main trail. Disappears when burst ends. **Purely visual — NOT collidable.** Does not occupy tiles in the collision map. Smaller/thinner than the main trail | — (always on) |

### Trail System

- Trail is a series of **CatmullRom spline segments** spawned behind the cycle while moving — CatmullRom provides local control so later movements don't affect already-existing trail geometry. Segments follow the exact path the cycle rides, producing natural smooth curves on turns
- **Distance-based spawning**: New segments spawn every **1 unit of distance traveled** (not time-based). This keeps trail density consistent regardless of speed — a fast cycle and a slow cycle produce the same segment spacing. Track cumulative distance since last segment; when it exceeds 1 unit, spawn a new segment
- **Each segment is 1 unit long.** A max of 40 segments = 40 units of trail in a straight line. A single segment can occupy multiple tiles if the trail curves or is diagonal across tile boundaries
- Trail has a fixed max segment count (governed by Trail Length attribute, default 40)
- Oldest segments fade and disappear as new ones are created — **FIFO**: new segments added at the front (behind cycle), oldest removed from the end
- **Trail does NOT spawn while stationary** (speed = 0 → no new segments)
- Trail segments are collidable — touching any trail (yours or enemy's) = **derez** (death)
- Trail color matches cycle color (customizable for player in Garage)
- Visual: glowing translucent wall panels (~0.6 units tall, ~0.1 units thick), slight pulse animation, fade-out dissolve on oldest segments
- **Trail vanishes instantly on derez** — when a cycle is destroyed, all its trail segments disappear immediately

### Trail Collision Model

Trail collision uses a **unit-based (tile-based) hitbox system**, NOT mesh-based colliders. This keeps collision detection fast and deterministic even with many cycles and long trails.

- Each trail segment **occupies the tile(s) it passes through**. A trail is "in" a tile if any part of the trail geometry intersects that tile
- A cycle is "in" a tile based on its **center point** only
- When a cycle's center enters a tile occupied by ANY trail (own or enemy), the cycle **derezes**
- This creates effectively solid walls — trails cannot be "threaded through" because the entire tile is lethal, not just the thin visual ribbon
- Trail tile occupancy is recalculated as segments are added/removed (oldest fading)
- This system also simplifies minimap rendering — trails are just colored tile marks

### Trail Self-Immunity

**Critical**: Without immunity, a cycle would instantly derez on its own newly-spawned trail.

- Each cycle is **immune to its own N most recently spawned trail segments** (default `trailImmunitySegments` = **4**, tunable in Dev HUD)
- The 4 newest segments of a cycle's trail do NOT register tile collision for that cycle (they still register for OTHER cycles — enemies can still die on your fresh trail)
- As the cycle moves forward and spawns new segments, older segments rotate out of the immunity window and become lethal to the owning cycle
- This applies identically to player AND enemy cycles
- **Near-miss detection** follows the same immunity rule: a cycle's own trail within the immunity window does NOT trigger near-miss audio (prevents constant audio spam from the trail directly behind)

### Collision Rules

**Only trails and cycle-to-cycle contact are lethal.** Walls and barriers stop you but don't kill.

| Collides with | Result |
|---------------|--------|
| **Any trail (own or enemy)** | **Derez** (death) — always lethal regardless of speed |
| **Any other cycle body** (player-vs-enemy OR enemy-vs-enemy) | **Both derez** — unless one has shield (see Shield rules). Exception: if a cycle's speed is below `lowSpeedThreshold` (default 10 units/s), it cannot kill the opponent in cycle-to-cycle but CAN still be killed. **If BOTH are below threshold: neither derezes** — they bump and stop. Discourages stationary play. **Same rules apply to enemy-vs-enemy collisions** — enemies can and will kill each other |
| Arena wall | **Slide** — cycle slides along the wall surface with angle-based speed reduction. Head-on (90°) = near full stop. Glancing (small angle) = slight slowdown, cycle redirects along wall. Speed reduction = `sin(impactAngle) × currentSpeed`. **Heading gradually lerps toward velocity direction** — cycle initially still points at the wall, then smoothly rotates to match its slide direction (not instant snap, not stuck facing the wall). Wall-hit sound + slight camera shake. Not lethal |
| Barrier (building, wall, structure) | **Slide** — same as arena wall. Cycle redirects along barrier surface with angle-based speed reduction. Not lethal |
| Power-up (any type) | Pickup (see Power-up Categories) |
| Boost pad | Free 1-bar nitro burst (no bar consumed). Subject to cooldown |
| Portal | Teleport to paired portal. Subject to cooldown |
| Gate (open) | Transition to that gate's function / enter level |
| Gate (locked) | **Slide** — same as wall. Locked gates are solid barriers with angle-based speed reduction |

### Derez (Death) Sequence

When any cycle (player or enemy) is destroyed:

1. **Implosion** — cycle shatters and collapses inward, derezzing into fragments that dissolve
2. **Trail vanishes** — all trail segments from this cycle disappear instantly
3. **Camera shake** + **glitch flash** (both toggleable in Dev HUD)
4. **Slow-mo** — **PLAYER DEREZ ONLY.** Brief slow-motion during player implosion (toggleable in Dev HUD). **All other cycles FREEZE** during the slow-mo — cinematic pause where only the derezzing player cycle animates its implosion while everything else holds still. **Freeze the entire game simulation**: timers, cooldowns, trail aging/FIFO, AI, all animations — everything pauses except the player derez implosion animation. **Enemy derez does NOT trigger slow-mo** — enemies simply implode and the game continues at full speed
5. **Sound**: digital shatter SFX

**Player derez additional behavior:**
- Camera pulls back to a dramatic overhead view (`derezCameraOverhead` toggle)
- "DEREZZED" text overlay
- After ~2 second animation → transition back to lobby (player spawns 2 units in front of lobby entrance gate)
- The Start gate still shows the same arena number — player can re-enter to retry. **Level fully resets on re-entry**: all enemies respawn, ALL power-ups respawn (including level-permanent ones), all trails gone, game objects reset to default state. Player retains their purchased upgrades and cosmetics from save data — only in-level state resets. Level-permanent power-ups are "permanent for that playthrough" — they respawn fresh each time the player enters the level

**Enemy derez:**
- Same implosion (shatter inward into dissolving fragments) + trail vanish
- When ALL enemies are eliminated: exit gate opens with animation + **coin reward overlay** (see Level Transitions — contains "LEVEL COMPLETE" text + coins earned + time bonus + hint to ride to exit gate, all in one overlay)
- **Zero-enemy levels**: If a level has no enemies, the exit gate is **open from the start**. No completion overlay is shown. The player can ride through the exit immediately. This is a valid level configuration (useful for sandbox/test levels). **If `rewards` is non-null**, coins are awarded silently when the player rides through the exit gate (no overlay — player sees their coin count increase in the Garage or HUD)

## Arena Object Categories

All placeable objects fall into one of these categories. The level editor palette is organized by these groups.

### 1. Barriers (interior obstacles, cycle slides along surface on contact)

Placed anywhere on the arena floor. Solid — colliding with them causes the cycle to slide along the surface with angle-based speed reduction (not lethal).

| Block | Size | Mergeable | Height | Notes |
|-------|------|-----------|--------|-------|
| **Wall** | 1 tile | Yes (linear) | Fixed (3 units, tunable via Dev HUD `wallHeight`) | Basic interior wall. Merges into continuous walls when adjacent |
| **Building** | 1 tile | Yes (cluster) | Selectable (1-5 units, default 2, editor slider) | Tron-style glowing structure. All buildings are 1×1 tiles. **3 shape variants**: `square` (default rectangular block), `triangle` (triangular prism — allows angular/diagonal layouts), `hexagon` (hexagonal prism — allows organic/rounded arena shapes). Shape selectable in editor. Adjacent buildings of the same shape visually merge into larger connected structures. If merge graphics prove too complex, buildings remain standalone 1×1 blocks with selectable height and shape for visual variety |
| **Structure** | 1 tile | No | Fixed (~2 units) | Decorative solid. Variants below |

**Structure Variants** (selectable in editor):

| Variant | Description |
|---------|-------------|
| `pylon` | Tall narrow Tron pylon — vertical neon light strip running up each face, sharp angular top |
| `column` | Cylindrical column with horizontal neon ring bands at intervals, glowing cap |
| `obelisk` | Tapered rectangular monolith, emissive edge lines, wider at base |

**Merge Behavior:** When two compatible blocks are placed on adjacent tiles, they visually merge into a single connected piece (like Minecraft double chests). On placement, check 4-neighbors for same type → regenerate merged geometry. On removal, neighbors revert to standalone appearance.

### 2. Wall Objects (arena edge only, replace default walls)

Can **only** be placed on the perimeter tiles of the arena, replacing segments of the default arena wall.

| Object | Notes |
|--------|-------|
| **Gate** | Neon arc, **fixed 5 units wide**. **5 roles**: `entrance` (always locked, empty signText), `exit` (locked until enemies eliminated), `arena`/`garage`/`architect` (lobby only, always open, fixed signText). `locked` is derived at runtime per role (not editable). Destination is fixed per role (not editable). When open: rideable passthrough. When locked: solid barrier (slide, not lethal), dimmed visual |
| **Cosmetic Wall** | Decorative wall variant — different panel patterns. Purely visual, still solid. **Variable width** (1-10 units, default 5, selectable in editor). Variants below |

**Cosmetic Wall Variants** (selectable in editor):

| Variant | Description |
|---------|-------------|
| `panel_a` | Standard Tron grid panel — horizontal neon lines with vertical dividers, subtle pulse |
| `panel_b` | Hexagonal tile pattern — honeycomb layout with emissive edges, darker centers |
| `panel_c` | Circuit trace pattern — PCB-inspired traces running across the wall surface, branching neon lines |

**Entrance and exit are gates.** Every level (including lobby) has exactly one entrance gate (always locked — acts as wall, player spawns 2 units in front facing inward). **Non-lobby levels**: one entrance + one exit gate (exit locked until all enemies eliminated, then opens). **Lobby**: one entrance + three functional gates (Arena N, Garage, Architect — all open by default). Gates cannot be placed or removed in the editor — only moved along walls.

### 3. Game Objects (persistent arena elements, not consumed, have cooldowns)

Remain in place after interaction. Can be used repeatedly but have a **cooldown** of `specialObjectCooldown` seconds (default 5s, tunable in Dev HUD). When any cycle triggers a game object, it goes on cooldown for ALL cycles — no one can use it until the cooldown expires. Visual: object dims during cooldown, brightens when ready.

| Object | Behavior |
|--------|----------|
| **Boost Pad** | Ground-placed. Ride over = instant 1-bar nitro burst (free, no bar consumed). **If hit during an active nitro burst**: the boost pad burst overlaps — speed stays at the nitro cap (does NOT exceed it), and the boost effect extends until whichever burst (pad or pressed) ends latest. Visual: glowing floor panel (no directional arrow — just a pad). Dims during cooldown |
| **Portal** | **Always placed in pairs.** Ride into one → teleport to paired portal. Each pair has a unique neon ring color (auto-assigned randomly in editor). Editor forces pair placement — cannot place just one. **Portals are one-sided** (like a mirror): one face is the active portal surface (glowing, rideable), the other face looks and behaves like a wall (solid, stops/slides cycle). Portal has a `rotation` field in schema that determines which direction the active face points. Editor provides rotation control (R key or rotation handle). Exit orientation: cycle exits facing the portal's active face outward direction. Trail does NOT pass through portals — trail ends at entry, new trail starts at exit. **Speed maintained through portal.** Both players and enemies can use portals. Teleportation visual: brief warp flash + screen distortion (`portalWarpIntensity` in Dev HUD) + warp sound effect. **Portal exit immunity**: very brief immunity (`portalExitImmunityDuration`, default **0.15s**) — just long enough for the cycle to render the warp-out animation, but short enough that a **portal trap is viable** (laying trail near exit portal so enemies who teleport in will derez after the brief animation). The immunity should NOT be long enough for the cycle to ride out of the trail tile — the player/enemy sees their cycle warp in and then derez |

### 4. Power-ups: Instant (consumed on pickup, respawn after timer)

Picked up on contact, effect applies immediately, object disappears, respawns after `powerupRespawnTime` (default 10s, tunable in Dev HUD). Each power-up type has a distinct activation sound effect.

| Power-up | Effect | Color Code |
|----------|--------|------------|
| **Nitro Recharge** | Fills all nitro bars instantly | Green neon |

Enemies CAN pick these up.

### 5. Power-ups: Level-Permanent (consumed on pickup, NO respawn)

Picked up on contact, effect persists for remainder of the level (or until player derez). Object disappears permanently for this level playthrough. Does NOT respawn. Each has a distinct activation sound effect.

| Power-up | Effect | Color Code |
|----------|--------|------------|
| **Trail Extend** | Increases max trail length by `trailExtendAmount` segments (default +10) | Blue neon |
| **Nitro Capacity+** | Adds `nitroCapacityPlusAmount` bars (default +1) to max AND fills the new bars | Blue neon |

Enemies CANNOT pick these up — level-permanent power-ups are player-only.

### 6. Power-ups: Equippable (consumed on pickup, respawn after timer)

Picked up on contact, stored in equip slot. Player presses **E** to activate. Single-use — once activated or expired, slot is empty. Respawns after `powerupRespawnTime`. Has a distinct pickup sound and a distinct activation sound.

**Equip slot replacement rule:** If the player already has an unactivated equippable in the slot and rides over another, the new one **replaces** it. The old one is discarded (lost), and the pickup disappears (respawns on timer). No stacking. Only one equippable at a time. If the player has an active (deployed) shield and rides over another Shield pickup, the pickup is consumed and replaces the slot — when the active shield expires or shatters, the slot holds the new one ready to activate.

| Power-up | Effect on E press | Duration | Color Code |
|----------|-------------------|----------|------------|
| **Shield** | Transparent neon oval sphere with hexagonal tile pattern appears around cycle. **Near-instant deployment** (~`shieldDeployTime`, default 0.15s) with quick animation and sound effect. Absorbs **one trail collision** without derez — shield shatters on hit. If not hit, shield fades out after `shieldDuration` (default 5s). Small knockback/slowdown on absorption | `shieldDuration` (default 5s, tunable) | Purple neon |

**Shield interaction rules:**
- **Activation**: Pressing E deploys the shield near-instantly (`shieldDeployTime`, default 0.15s — range 0.1–0.2s). No interruption to movement or speed. Quick energy-dome animation + sound
- **Trail collision**: Shield absorbs the hit. Shield shatters (visual + sound). Cycle **loses 30% of current speed** (`shieldSlowdownPercent`, default 0.3, tunable in Dev HUD) and continues. Cycle is NOT derezzed
- **Cycle-to-cycle collision**: Shielded cycle survives (shield shatters). Unshielded cycle derezes. If BOTH have shields, both shields shatter, neither derezes
- **Wall/barrier collision**: Shield is NOT consumed. Walls don't kill, so shield doesn't need to activate
- **Expiry**: If unused for `shieldDuration` seconds, shield fades out and equip slot empties

Enemies CAN pick up Shield and will use it tactically.

### 7. Enemy Objects

| Object | Notes |
|--------|-------|
| **Enemy Spawn** | Marks where an enemy cycle spawns at level start. Editor configures: **6 attributes** (speed, acceleration, trailLength, nitroBars, handling, intelligence — each 1-10), cycle color. Multiple enemies per level |

### Power-up Visual Language

Three distinct neon color families so players instantly recognize what they're approaching:
- **Green glow**: Instant power-ups (use immediately, respawn)
- **Blue glow**: Level-permanent power-ups (permanent buff, no respawn)
- **Purple glow**: Equippable power-ups (store and activate with E, respawn)

All power-ups float above the grid with a gentle bob + rotate animation. Distinct geometric shape per specific power-up within each color family.

## AI System

### Enemy Behavior

Enemies are **hunters** — they actively pursue the player and try to cut them off with their trails. Enemies can and will derez on their own trail if their AI makes a mistake — smarter (higher-attribute) enemies make fewer mistakes.

**AI Decision Loop** (per frame):
1. **Pathfind** toward player (steering behaviors)
2. **Trail tactics** — try to lay trail across player's predicted path
3. **Avoidance** — detect incoming trails/walls and turn away
4. **Attribute-driven** — faster enemies are more aggressive, better handling = tighter cuts

### AI Game Mechanic Interactions

Enemies interact with all game systems, not just steering:

| Mechanic | AI Behavior |
|----------|-------------|
| **Nitro** | Enemies have nitro bars (set by attribute). AI decides tap vs chain based on Intelligence tier (Easy: random single taps, Medium: chase/escape bursts, Hard: optimized chains for critical moments). Handling penalty during nitro applies to enemies too. **Simplification fallback**: if AI nitro decision-making proves too complex during implementation, simplify to single-tap only or remove enemy nitro entirely (keep boost pads as the only enemy speed boost) |
| **Boost pads** | Enemies will ride over boost pads when convenient (during chase paths) |
| **Portals** | Enemies can use portals. May use them to cut off player or escape |
| **Instant power-ups** | Enemies will pick up Nitro Recharge if nearby |
| **Equippable power-ups** | Enemies will pick up Shield and activate when in danger |
| **Level-permanent power-ups** | Enemies CANNOT pick these up (player-only) |
| **Own trail** | Enemies CAN derez on their own trail. Higher-attribute enemies avoid this better |

### AI Difficulty Tiers

Each enemy has a **6th attribute: Intelligence** (1-10), which maps to three difficulty tiers:

| Tier | Intelligence | Shield Triggers | Trail Tactics | Nitro Usage | Avoidance |
|------|-------------|----------------|---------------|-------------|-----------|
| **Easy** (1-3) | Basic | Activate when nearest trail < X tiles | None — just drive | Random bursts | Poor — frequent self-derez |
| **Medium** (4-7) | Tactical | + Activate when avoidance raycasts detect no escape route | Predict player path, attempt cuts | Chase/escape bursts | Decent — rare self-derez |
| **Hard** (8-10) | Strategic | + Activate when entering a trail corridor | Flanking + coordinated trail walls | Optimized (save for critical moments) | Excellent — almost never self-derez |

All three trigger conditions are always evaluated; the tier determines which ones the enemy acts on. This is tunable per-enemy in the editor (Intelligence attribute slider 1-10).

### AI Difficulty Scaling

- Governed by the enemy's **6 attributes** (speed, acceleration, trailLength, nitroBars, handling, intelligence — set in editor per enemy spawn)
- Starter levels: slow, short trails, poor handling, few nitro bars, low intelligence
- Later levels: fast, long trails, good handling, more nitro bars, high intelligence
- Multiple enemies create emergent difficulty (crossfire trails)
- Dev HUD tunables: `aiAggression`, `aiReactionTime`, `aiAvoidanceRange`

### AI Pathfinding

- **Tile-aware obstacle detection**: AI reads the tile collision map to know which tiles contain trails, rather than raycasting against thin trail meshes (which could miss). This is consistent with the tile-based collision system the game uses
- Steering behaviors: seek player, avoid obstacles, avoid trail-occupied tiles
- Raycasts used for wall/barrier detection (solid 3D geometry — reliable for raycasts)
- No global pathfinding needed — reactive steering is sufficient for arena gameplay
- Occasional "flanking" behavior: some enemies circle around instead of direct chase (Intelligence 4+)

## Lobby & Gates

### Lobby Layout

A **colosseum-style** arena (**arenaWidth: 400, arenaDepth: 200** — wide but shallow, so player only travels ~100 units south-to-north from spawn to gates). High walls (~3 units) with Tron-style glowing panel architecture. The floor is the classic Tron grid. Level designers can shape the interior with barriers to create any feel (circular, rounded, etc.) but the base arena is always rectangular.

Player spawns 2 units in front of the **entrance gate on the south wall** (same spawn system as all levels). **North wall** has exit/function gates:

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

Each gate is a **neon arc** (5 units wide) with a large glowing text sign above it. Faithful to Tron: Legacy visual language.

### Lobby Special Rules

- **No win condition** — lobby is the only level without enemies (by default). The north-wall gates (Arena N, Garage, Architect) serve as functional exits
- **Entrance gate on south wall** — always locked (acts as wall from inside), player spawns 2 units in front of it (same system as all levels), facing north toward the function gates. Entrance gate signText is empty
- Everything else works normally: trails, physics, power-ups (if placed via editor)
- Enemies CAN be placed in lobby via editor for testing AI behavior
- **Lobby fully resets** on every return (from Garage, Editor, or any level) — same as any level re-entry. All trails cleared, enemies respawn, power-ups reset, game objects off cooldown. Player spawns stationary at entrance gate
- Lobby is Level 0 in the campaign manifest

### Gate List

| Gate | Sign Text | Leads To | Lock Condition |
|------|-----------|----------|----------------|
| **START** | `ENTER ARENA [N]` | Loads arena N (next incomplete) via tunnel transition | Locked if no campaign levels exist in manifest |
| **GARAGE** | `GARAGE` | Garage showroom — customize bike, upgrade attributes | Always open |
| **LEVEL EDITOR** | `ARCHITECT` | Birds-eye editor view (level list → select or create new) | Always open |

The START gate dynamically shows the next arena number. E.g., if player has completed arenas 1-3, sign reads `ENTER ARENA 4`. **After all campaign levels are completed**: gate becomes **locked** with sign text `MORE ARENAS COMING SOON` — dimmed visual, solid barrier (stops cycle, not lethal). Player can still access Garage and Editor.

### Gate Behavior

- **Open gates**: Glowing neon, animated light pulse, rideable. Player rides through → state transition
- **Locked gates**: Dimmed neon, barrier active (solid wall — stops cycle, not lethal). Visual lock indicator

## Level Transitions

**The Tron-grid tunnel is the universal transition animation** — a short (~1 second) forward-flying warp through a glowing grid tunnel. Used for **every state transition**: level entries/exits, Garage entry/return, Editor entry/return, and BOOT loading. Even UI button returns ("Return to Lobby" in Garage/Editor) trigger the tunnel animation. Feels fast and immersive, not jarring.

| Transition | Sequence |
|------------|----------|
| **Lobby → Level** | Ride through Start gate → tunnel animation → **all trail cleared** → spawn 2 units in front of level entrance gate **stationary** (speed = 0), facing inward. **All enemies also stationary.** Game starts when player presses W — enemies begin moving at the same moment. Fresh start every level entry |
| **Level → Lobby (win)** | **Coin reward overlay** appears — single overlay containing: "LEVEL COMPLETE" text, coins earned, time bonus (if any), and hint to ride to exit gate. Half-transparent neon screen. **Auto-dismisses after `coinOverlayDuration` seconds (default 3s, tunable in Dev HUD)** — timer only, no click/key dismiss. **Game is NOT paused during overlay** — player can continue riding. If player reaches exit gate while overlay is still showing, overlay disappears and transition triggers immediately. Player rides to exit gate → tunnel animation → **all trail cleared** → spawn at lobby entrance gate **stationary**. **Coins are awarded only upon riding through the exit gate** — if player derezes after the overlay but before exiting, reward is forfeited |
| **Level → Lobby (derez)** | Derez animation → overhead camera → "DEREZZED" text → tunnel animation → **all trail cleared** → spawn at lobby entrance gate **stationary**. Level fully resets on re-entry. No coins awarded |

## Garage

The Garage is an immersive Tron-styled showroom.

### Environment

- Dark void background with subtle Tron grid on floor
- Player's cycle centered on a glowing circular platform
- Short trail visible behind the bike (preview of current trail color)
- Cycle slowly rotates on the platform (or player can rotate it)
- Neon UI panels floating around the bike

### Functions

1. **Customize Cycle Color**: Select from owned colors. Preview updates live on the bike
2. **Customize Trail Color**: Select from owned colors. Preview updates on the trail behind the bike
3. **Buy Colors**: Spend NEON coins to unlock new cycle/trail colors
4. **Upgrade Attributes**: 5 attribute cards showing current level, next level benefit, and upgrade cost
5. **View Stats**: Current coins, total earned, level progress

### Navigation

Player rides INTO the Garage gate from lobby. Inside the Garage, navigation is UI-based (not riding). Press ESC or a "Return to Lobby" button to exit back to lobby.

## Level Editor

### Interface

- **Camera**: Birds-eye orthographic view looking straight down at the arena
- **Grid overlay**: Visible tile grid (1 unit per tile) over the arena
- **Block palette**: Side bar panel organized by **6 floor-object categories** (Barriers, Game Objects, Instant Power-ups, Level-Permanent Power-ups, Equippable Power-ups, Enemy Objects). **Wall Objects are NOT in the palette** — cosmetic walls are placed via click-on-edge context menu, and gates are pre-existing (move only). Hovering a palette item shows a **preview on the tile under the mouse cursor** in the 3D viewport

### Interaction Model

The editor uses a **select-then-act** pattern:

1. **Select from palette** → click a tile to **place** the item. The item appears in the 3D viewport
2. **Next click on an already-placed item** → **selects it** for editing (highlight, properties panel opens)
3. **Selected item actions**: Move (drag to new tile), Delete (Del key or button), Rotate (R key or button). **All action hotkeys (Move, Delete, Rotate) apply to all placeable item types.** If an item has a disabled action (e.g., gates cannot be deleted), the hotkey is also disabled for that item — pressing Del on a selected gate does nothing
4. **Gates are special**: Gates can only be **moved** along walls — they cannot be deleted or rotated. **Non-lobby levels**: exactly one entrance gate + one exit gate (present by default, cannot be deleted). **Lobby**: one entrance gate + three functional gates (Arena N, Garage, Architect — all present by default, cannot be deleted)
5. **Click empty tile** with no palette selection → deselects current selection

### Additional Editor Features

- **Undo/Redo**: Ctrl+Z / Ctrl+Y (Cmd on Mac). Tracks all place/remove/move/property-change operations in an undo stack
- **Level select**: Dropdown to switch between levels (Lobby, Level 1, 2, 3...). Loads from localStorage (WIP) or campaign files
- **Arena size**: Slider/input to adjust width and depth. **Minimum 40×40 units** (enforced). Walls update. Blocks outside new bounds are removed with confirmation dialog
- **Wall object placement (click-then-choose)**: Clicking on an arena edge tile opens a context menu with cosmetic wall options (variant + width). The cosmetic wall replaces the default wall at that position. **Gates are NOT placeable** — they pre-exist and can only be selected and moved along edges. This is distinct from the palette-first flow used for floor objects
- **Portal pair enforcement**: When placing a portal, editor requires placing the paired portal before finalizing. Auto-assigns a random neon color to the pair
- **Gate clear zones**: A **5×5 unit area** directly in front of each gate (entrance AND exit) is reserved. The editor prevents placing any objects (barriers, game objects, power-ups, enemies) in these zones. Visually highlighted in the editor grid (e.g., subtle tint). Player spawns at the center of the entrance gate's clear zone (2 units in front of the entrance gate). **Clear zones move with their gate** — when a gate is moved in the editor, the clear zone repositions automatically. Any objects that would overlap the new clear zone are flagged/prevented

### Editor Navigation

- **Level List**: First screen when entering editor. Shows all WIP levels (localStorage) and campaign levels. **"New Level" button at the top** creates a blank arena with default size (400×400) and default gate placement: **entrance gate on south wall center, exit gate on north wall center** (opposite walls). No default enemies or objects — only the two gates and the auto-derived spawn point (5×5 clear zone in front of entrance). A zero-enemy level has exit gate open from start
- **"Back to Level List" button**: Returns from the tile editor to the level list (auto-saves to localStorage)
- **"Return to Lobby" button**: Exits the editor entirely and returns to lobby
- **ESC in editor**: Discards current selection — if a palette item is selected, deselects it. If a placed item is selected (with move/delete/rotate overlay active), deselects it. Does NOT exit the editor
- **Saving**: All edits auto-save to localStorage as WIP. An explicit **"Save" button** writes the level update. Export to Campaign is separate (browser download)

### Lobby Editing

The lobby (Level 0) **is editable** in the editor. However:
- All lobby gates (entrance on south wall, Arena N + Garage + Architect on north wall) are present by default and **cannot be deleted** — they can only be moved along their respective walls
- Lobby minimum arena size is 40×40 (same as all levels) — must fit all gates with spacing
- The designer can add barriers, game objects, power-ups, and even enemies to the lobby for testing

### Editor UI Approach

HTML/CSS overlay panels on top of the Three.js canvas (simplest approach). The 3D viewport shows the arena from above; the palette, properties, and controls are HTML elements positioned alongside or overlaying the canvas.

### Save / Load / Export

- **Save**: Stores current level to localStorage (WIP levels). Auto-saves on changes
- **Load**: Level select dropdown loads any WIP level from localStorage or campaign level for editing
- **Export to Campaign**: "Export" button triggers a browser file download of the level as `level-N-slug.json`. A separate "Export Manifest" button downloads an updated `manifest.json`. These files are dropped into the `vibe/tron/levels/` directory to become permanent campaign levels
- **Import**: "Import" button opens a file picker to load any level JSON into the editor for editing
- **Play-test**: "Test" button instantly enters game mode for the current level. Quick iteration loop

### Block Merging in Editor

Visual feedback is immediate:
1. Place a wall tile → single wall segment appears in the 3D viewport
2. Place another wall tile adjacent → both visually merge into one continuous wall
3. Remove one → the other reverts to single segment
4. Same for buildings (cluster merge)
5. Structures and all other types do NOT merge

### Level Data Schema

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
- `arenaWidth`/`arenaDepth` in units (tiles). Default 400×400. **Minimum 40×40** (enforced by editor — lobby requires enough space for all gates on one wall with spacing)
- `wallObjects[].edge`: "north", "south", "east", "west" — which arena wall
- `wallObjects[].position`: absolute position along the wall edge measured from the wall's start (0 = west end for north/south walls, 0 = south end for east/west walls). For a 400-unit wide arena, position 200 = center of the wall. Gate/wall object center is placed at this position (e.g., a 5-wide gate at position 200 spans 197.5–202.5)
- `barriers[]`, `gameObjects[]`, `powerups[]`, `enemies[]`: floor-placed, x/z in units from arena center
- `rewards.timeBonusThreshold`: if player completes in fewer seconds than this, they earn bonus coins
- **No `playerSpawn` field in schema.** Spawn position is **derived from the entrance gate**: player spawns **2 units in front of the entrance gate**, centered in a **5×5 unit clear zone** that the editor enforces (nothing can be placed in this zone). Facing inward (away from the entrance gate). This applies to ALL levels including the lobby
- **Gate clear zones**: 5×5 area directly in front of both entrance and exit gates is reserved. The editor prevents placing any objects in these zones. Clear zones move with their gates when repositioned in the editor. Player spawns at the center of the entrance gate's clear zone
- Enemy `rotation`: 0 = facing +Z (north). All rotations in radians
- **Non-lobby levels**: exactly one entrance gate (always locked, empty signText) + one exit gate (locked until all enemies eliminated). **Lobby**: one entrance gate (always locked, empty signText) + three functional gates (Arena N with `destination: "level"`, Garage with `destination: "garage"`, Architect with `destination: "editor"`). Editor enforces this — gates are present by default and **cannot be placed, removed, or rotated** — only moved along walls
- Gate `role` values: `"entrance"` (always locked, no transition, empty signText — fixed), `"exit"` (locked until enemies eliminated, returns to lobby, signText editable), `"arena"` (lobby only — loads next arena, always open, signText fixed = "ENTER ARENA [N]"), `"garage"` (lobby only — enters garage, always open, signText fixed = "GARAGE"), `"architect"` (lobby only — enters level editor, always open, signText fixed = "ARCHITECT"). Non-lobby levels have exactly `entrance` + `exit`. Lobby has `entrance` + `arena` + `garage` + `architect`
- Gate `destination` values: `null` (entrance — no transition), `"lobby"` (exit — returns to lobby), `"level"` (loads next arena), `"garage"` (enters garage), `"editor"` (enters level editor)
- Lobby level (id: "level-0"): `arenaWidth: 400, arenaDepth: 200`, 4 gates in `wallObjects` (entrance on south with `role: "entrance"`, Arena N with `role: "arena"` + Garage with `role: "garage"` + Architect with `role: "architect"` on north), no enemies, `"rewards": null`

## HUD

### In-Game HUD

**Visual-only HUD** — icons and graphics, no text labels. Clean Tron aesthetic.

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

- **Speed**: Icon (lightning bolt or speedometer visual) + current speed as number (units/s, integer). No "SPEED:" text label
- **Nitro Bars**: Discrete glowing segments — filled (■) = charged, empty (□) = recharging. Animated fill on recharge. Flash red on empty nitro press. No "NITRO:" text label
- **Trail Length**: Trail icon + current active segment count only (e.g., "12"). **Does NOT show max.** No "TRAIL:" text label
- **Timer**: Clock icon + level elapsed time (mm:ss). **Hidden in the lobby** (lobby has no win condition or time bonus)
- **Equip Slot**: Icon of currently equipped power-up (Shield hexagon icon). Empty if nothing equipped. Subtle "E" key hint. No text label
- **Minimap**: Corner minimap — **simplified Tron classic birds-eye view**. Player = cyan dot, enemies = colored dots, trails = colored lines (simplified tile data), obstacles = white/gray squares, items = bright colored hollow circles (type intentionally ambiguous). Clean and readable at speed

### Developer HUD (`.` key toggle)

Overlay panel for live-tweaking. HTML/CSS panel with labeled sliders/toggles. All values persist to `devHud` in save data.

**Categories:**
- **Cycle Feel**: Tilt max, pitch on accel (toggle), lean on brake (toggle)
- **Nitro Camera**: FOV widen (toggle), camera pull-back (toggle), speed lines (toggle), motion blur (toggle), handling multiplier
- **Derez**: Slow-mo (toggle), camera overhead (toggle), camera shake (toggle), glitch flash (toggle)
- **Portal**: Warp intensity
- **Cooldowns**: Special object cooldown, power-up respawn time
- **Power-ups**: Default trail length, trail extend amount, nitro capacity+ amount, shield duration, shield deploy time, boost pad strength
- **Nitro**: Burst duration (0.1 granularity), speed return time, bar recharge time, max speed multiplier
- **Trail**: Trail opacity, trail fade speed, trail immunity segments
- **Gameplay**: Low speed threshold, cycle friction, brake deceleration, coin overlay duration, minimum arena size, portal exit immunity duration, shield slowdown percent, steering speed falloff (`k`), wall height
- **Post-processing**: Bloom intensity, bloom threshold, chromatic aberration, CRT scanlines (toggle), grid brightness, neon intensity, fog density
- **Audio**: Master volume, music volume, SFX volume, ambient volume, engine pitch
- **AI**: Aggression multiplier, reaction time, avoidance range
- **Near-miss**: Detection distance

## Audio

### Music

Daft Punk / synthwave electronic soundtrack. Minimum 2 tracks:
- **Lobby / Garage / Editor**: Ambient, atmospheric, slow build. Shared across non-gameplay states
- **Gameplay**: Driving, high-energy, pulsing bass. Same track for all levels

**Audio autoplay**: Attempt to start music on page load. Use a constant flag (`AUDIO_AUTOPLAY = true`) so it can easily be switched to first-interaction mode if browsers block it.

Looping, crossfade on state transitions.

### Ambient Layer

Persistent atmospheric sounds that play under the music, making the world feel alive:
- **Grid hum**: Low-frequency electrical hum of the arena floor
- **Electric crackling**: Distant, subtle crackles and pops
- **Arena resonance**: Deep ambient drone that gives the space a sense of scale

Volume controlled by `ambientVolume` in settings and Dev HUD.

### Sound Effects

| Event | Sound |
|-------|-------|
| **Engine idle** | Low electric hum, subtle oscillation |
| **Acceleration** | Rising electric whine, pitch follows speed |
| **Gear shifts** | Discrete electric "chunk" sounds at speed thresholds. Number of gears = `gearShiftCount` (default 5). **Thresholds follow real car gear progression** — earlier gears are shorter (1st gear ends early), top gear is long. E.g., for 5 gears: ~10%, ~25%, ~45%, ~70%, ~100% of top speed. Punchy, satisfying kick that makes acceleration feel like surging through gears |
| **Top speed sustained** | High-pitched steady electric whine, slightly different from acceleration |
| **Nitro burst** | Whoosh + deeper bass pulse (per bar consumed) |
| **Nitro empty** | Fizzle/buzz — nitro tries to ignite but sputters out |
| **Wall hit** | Metallic thud + brief scrape |
| **Near-miss** | Tension whoosh/zip when passing within `nearMissDistance` of a trail, wall, barrier, building, or structure. Quick, sharp audio cue that rewards close play |
| **Trail creation** | Soft crystalline "tink" per segment |
| **Derez (death)** | Digital shatter — glass-like implosion + reverb |
| **Instant power-up pickup** | Quick ascending chime (green) |
| **Level-permanent power-up pickup** | Deep resonant chord (blue) |
| **Equippable power-up pickup** | Staccato ping (purple) |
| **Shield activation (E)** | Energy dome hum — rising tone as hexagonal sphere forms |
| **Shield shatter** | Metallic clang + glass shatter + energy dissipation |
| **Shield expiry** | Soft fading hum |
| **Portal enter** | Warping/bending warp sound |
| **Boost pad** | Quick whoosh (lighter than nitro), with own distinct character |
| **Gate enter** | Deep resonant hum |
| **Tunnel transition** | Rushing wind + grid whoosh during level transitions |
| **Level complete** | Triumphant chord |
| **Coin reward** | Tinkling digital coins |

All configurable via pause menu Settings panel and Dev HUD.

## Visual Effects & Post-Processing

### Tron: Legacy Aesthetic

- **Bloom**: Heavy bloom on all emissive/neon materials. The signature Tron glow
- **Environment**: Dark floor with glowing grid lines. Walls with emissive edge panels
- **Reflections**: Floor reflections (environment map or SSR-lite)
- **Atmosphere**: Subtle fog/haze to add depth and distance fade
- **Trails**: Emissive translucent smooth-curved walls with pulse animation
- **Power-up color coding**: Green (instant), Blue (permanent), Purple (equippable) — distinct at a glance
- **Near-miss**: No visual effect, audio-only feedback

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

- Earned by completing levels (base amount set in level data `rewards.coins`)
- Time bonus: complete under `timeBonusThreshold` seconds → earn `timeBonusCoins` extra
- Spent in the **Garage** (accessible via lobby gate)
- **No replaying completed levels** — progression is linear. Each level's coins can only be earned once

### Attribute Upgrades (Garage)

Each attribute has 10 levels (1-10). Cost scales with level.

| Attribute | Level 1 → gameplay value | Level 10 → gameplay value | Upgrade cost per level |
|-----------|--------------------------|---------------------------|------------------------|
| Speed | 60 units/s | 120 units/s | 10, 20, 35, 50, 75, 100, 150, 200, 300 |
| Acceleration | 20 units/s² | 50 units/s² | Same curve |
| Trail Length | 40 segments | 100 segments | Same curve |
| Nitro Bars | 5 bars | 12 bars | Same curve |
| Handling | 2.5 rad/s | 5.0 rad/s | Same curve |

Total cost to max one attribute: 940 coins. Total to max all five: 4,700 coins.

### Cosmetics (Garage)

- Cycle body colors — purchasable neon colors (50 coins each)
- Trail colors — purchasable independently from cycle color (50 coins each)
- Purchased colors are persisted in save data
- Trail color automatically matches cycle color by default, but can be set independently

**Color Catalog** (Tron-themed neons, chosen to NOT conflict with power-up colors green/blue/purple):

| Color | Hex | Included | Cost |
|-------|-----|----------|------|
| Cyan (default) | `#00FFFF` | Free (starter) | — |
| Hot Pink | `#FF1493` | Purchasable | 50 |
| Crimson | `#FF0033` | Purchasable | 50 |
| Gold | `#FFD700` | Purchasable | 50 |
| White | `#FFFFFF` | Purchasable | 50 |
| Neon Yellow | `#CCFF00` | Purchasable | 50 |
| Coral | `#FF6B6B` | Purchasable | 50 |
| Ice Blue | `#66CCFF` | Purchasable | 50 |
| Tron Orange | `#FF6600` | Purchasable | 50 |

8 purchasable colors × 50 coins = 400 coins for all cycle colors + 400 for all trail colors = **800 coins total for full cosmetics.**

## Controls

| Key | Action |
|-----|--------|
| **W / ↑** | Accelerate |
| **S / ↓** | Brake (decelerate to stop, NO reverse) |
| **A / ←** | Steer left (works at any speed, including stationary) |
| **D / →** | Steer right (works at any speed, including stationary) |
| **Space** | Nitro burst (consumes 1 bar). Error buzz if empty |
| **E** | Activate equipped power-up (Shield) |
| **ESC** | Pause menu (controls, resume, quit to lobby) |
| **`.`** | Toggle developer HUD |

Controls shown on first lobby entry (auto-shows if `controlsShown` is false, dismissible via "GOT IT" button or ESC) and in pause menu.

## Work Breakdown

### Phase 1: Foundation (scaffold + cycle + movement)

| # | Task | Description |
|---|------|-------------|
| 1.1 | **Project scaffold** | `index.html` with Three.js + cannon-es importmap, module structure per file tree above, basic renderer with post-processing pipeline stub, `config.js` with all world scale constants + dev HUD defaults, `style.css` for HUD/overlay base styles. **Loading screen**: Tron-grid tunnel animation with game title "TRON: LIGHT CYCLES" overlaid + loading progress bar. Tunnel doubles as both BOOT loader and universal state transition |
| 1.2 | **Arena foundation** | Flat grid floor (400×400 units) with glowing lines (1-unit spacing), enclosing walls (~3 units tall) with Tron-style emissive panels, basic lighting (ambient + point lights for neon glow). Arena built from `config.js` constants. Wall collision = slide along surface with angle-based speed reduction (not death) |
| 1.3 | **Light cycle model** | Procedural low-poly cycle mesh (~0.8×0.3×0.4 units) with emissive materials. Wheel rotation animation. Cyan and orange color variants. Tilt animation on steering (smooth, up to `cycleTiltMax`). Pitch forward on accel, lean back on brake (both toggleable). Color parameterized |
| 1.4 | **Third-person chase cam** | Smooth-follow camera behind cycle. **Always orbits to stay behind** — including when the cycle is stationary and turning in place (camera orbits around the cycle to maintain behind-position). Offset on turns. Slight lag for cinematic feel. Camera distance/height/damping in `config.js`. Nitro camera effects: FOV widening, pull-back, speed lines, motion blur (all independently toggleable via dev HUD) |
| 1.5 | **Movement system** | Acceleration (W), braking to zero (S, no reverse), smooth steering (A/D, works at zero speed), speed cap from attribute. **Speed-dependent steering**: `effectiveTurnRate = baseTurnRate / (1 + speed * steeringSpeedFalloff)` — nimble at low speed, heavier at top speed (`steeringSpeedFalloff` default 0.02, tunable `k` in Dev HUD). Keyboard input manager with key bindings |
| 1.6 | **Nitro boost** | Battery bar system: 5 default bars, Space = consume 1 bar for speed burst lasting `nitroBurstDuration` (default 0.5s). Cannot double-tap during active burst. Hold Space for continuous boost (auto-chains bursts). Speed returns to normal over `nitroSpeedReturnTime` (default 0.25s) after final burst if holding gas. Handling becomes heavier during nitro (`nitroHandlingMultiplier`). Empty press = error fizzle sound + bar flash. Bright white secondary nitro trail during burst. Passive recharge (1 bar / 5s). HUD bar display |

### Phase 2: Trail + Collisions

| # | Task | Description |
|---|------|-------------|
| 2.1 | **Trail rendering** | CatmullRom spline wall segments (~0.6 units tall, ~0.1 thick) spawned behind cycle via **distance-based trigger** (new segment every 1 unit traveled, not time-based — consistent density at all speeds). CatmullRom ensures local control — later movements don't affect existing segments. FIFO: add from front (behind cycle), remove from end (oldest). Emissive material, pulse animation, color-matched to cycle |
| 2.2 | **Trail fading** | Max segment count from Trail Length attribute (default 40). Oldest segments fade out (opacity → 0) and despawn. No trail spawned at speed 0 |
| 2.3 | **Collision system** | **Tile-based trail collision**: trails mark the tiles they occupy, cycle center determines cycle's tile — entering a trail tile = derez. This avoids expensive mesh colliders and prevents "threading through" thin trails. **Wall/barrier collision = slide** along surface with angle-based speed reduction (`sin(impactAngle) × currentSpeed`). Head-on = near full stop, glancing = slight slowdown + redirect along wall. Wall-hit sound + camera shake. Cycle-to-cycle = both derez (low-speed exception: below `lowSpeedThreshold`, cycle can't kill opponent but can still be killed; both below = bump and stop). **Same rules for enemy-vs-enemy.** Collision groups for efficient detection |
| 2.4 | **Derez effect** | Implosion animation — cycle shatters and collapses inward, derezzing into fragments that dissolve. All trail segments vanish instantly. Camera shake + glitch flash + slow-mo + overhead pull-back (all toggleable in dev HUD). ~2 second sequence. Sound: digital shatter implosion |
| 2.5 | **Near-miss system** | Detect when cycle passes within `nearMissDistance` of trail, wall, barrier, building, or structure without colliding. **Own trail follows immunity rules** — the N most recent segments (same as `trailImmunitySegments`) don't trigger near-miss. Play tension whoosh/zip SFX. Audio-only feedback, no visual |
| 2.6 | **Game over / level complete** | Player derez → "DEREZZED" overlay → tunnel transition → lobby at entrance gate (same arena number on Start gate, level fully resets on re-entry). Enemy derez → implosion + trail vanish. All enemies dead → exit gate opens + "LEVEL COMPLETE" notification |

### Phase 3: Power-ups & Game Objects

| # | Task | Description |
|---|------|-------------|
| 3.1 | **Power-up system core** | Three-category system: instant (green, consumed + respawn), level-permanent (blue, consumed + no respawn), equippable (purple, one slot + E to activate + respawn). Color-coded neon glow per category. Distinct activation sounds per power-up type |
| 3.2 | **Instant power-ups** | Nitro Recharge: fills all nitro bars on pickup. Green glow, disappears, respawns after `powerupRespawnTime` |
| 3.3 | **Level-permanent power-ups** | Trail Extend: increases max trail by `trailExtendAmount` (default +10). Nitro Capacity+: adds `nitroCapacityPlusAmount` bars (default +1) + fills them. Blue glow, disappears permanently |
| 3.4 | **Shield** | Purple equippable. Pickup → stored in equip slot. E → transparent neon oval sphere with hexagonal tile pattern forms around cycle. Absorbs one trail collision (shatters + knockback/slowdown). Cycle-to-cycle: shielded survives, unshielded derezes. Not consumed by wall hits. Fades after `shieldDuration` (default 5s) if unused |
| 3.5 | **Boost pads** | Ground-placed game object. Ride over = free 1-bar nitro burst. Stays after use but enters `specialObjectCooldown` (default 5s). Visual dims during cooldown. Distinct whoosh sound |
| 3.6 | **Portals** | Paired game objects. **One-sided**: active face is the portal surface (glowing, rideable), back face is a solid wall (slide on contact). `rotation` field in schema determines facing direction. Ride into active face → brief warp flash + screen distortion (`portalWarpIntensity`) + warp sound → teleport to pair. Exit facing portal's active face outward direction. Speed maintained. Trail ends at entry, new trail starts at exit. Cooldown of `specialObjectCooldown` after use (applies to all cycles). Neon ring color matches pair |
| 3.7 | **Power-up visuals** | Floating + bobbing + rotating animation. Distinct geometric shapes per type within color family. Pickup burst particle effect (color-matched) |

### Phase 4: AI Enemies

| # | Task | Description |
|---|------|-------------|
| 4.1 | **Enemy cycle spawning** | Spawn enemy cycles at level data positions with configured **6 attributes** (speed, acceleration, trailLength, nitroBars, handling, intelligence — each 1-10) and color. Same cycle mesh + tilt animations, different color. **Enemies start stationary** (speed = 0) and **wait for the player to start moving** — AI begins driving only after the player's first input (press W). This gives the player a moment to orient and choose when to engage |
| 4.2 | **AI steering** | **Tile-map-aware** trail avoidance (read tile collision map for trail-occupied tiles ahead) + raycast-based wall/barrier avoidance. Steering behaviors: seek, flee, wander. Enemies CAN derez on their own trail — higher intelligence enemies avoid this better (Easy: frequent, Medium: rare, Hard: almost never) |
| 4.3 | **AI hunting** | Seek player behavior. Trail-cutting tactics (predict player path, lay trail across it). Flanking. Aggression scaled by attributes and `aiAggression` dev HUD value |
| 4.4 | **AI self-preservation** | Avoid own trail, other trails, walls, barriers. Higher handling = better avoidance. `aiReactionTime` and `aiAvoidanceRange` from Dev HUD |
| 4.5 | **AI game mechanics** | Enemies use nitro bars (tactical bursts, handling penalty applies). Ride over boost pads. Use portals. Pick up Nitro Recharge and Shield (not level-permanent). **Shield activation based on Intelligence tier**: Easy = nearest trail < X tiles. Medium = + no escape route detected. Hard = + trail corridor detection. All three conditions evaluated, tier determines which are acted on |

### Phase 5: Level System

| # | Task | Description |
|---|------|-------------|
| 5.1 | **Level data schema** | `schema.js`: JSON format per schema above. Validation function. Arena size, wallObjects, barriers, gameObjects, powerups, enemies, rewards |
| 5.2 | **Level loading pipeline** | `loader.js`: fetch campaign levels from `levels/manifest.json` + individual JSON files. Load WIP levels from localStorage separately. Merge into level list |
| 5.3 | **Arena builder** | `arena.js`: construct full Three.js scene + physics from level data. Build floor grid, walls, place all barriers, game objects, power-ups, enemies. Handle wall object replacements on edges |
| 5.4 | **Barrier blocks** | `blocks.js`: Wall (1×1, fixed height 3u tunable via `wallHeight` in Dev HUD), Building (1×1, selectable height 1-5u, **3 shapes**: square/triangle/hexagon — triangle enables angular layouts, hexagon enables rounded arena shapes), Structure (1×1, fixed height ~2u, 3 variants). Tron-style emissive geometry. All cause slide-along-surface on contact (not death) |
| 5.5 | **Block merging** | Adjacent walls merge into continuous wall mesh. Adjacent buildings merge into complex. Check 4-neighbors on place/remove → regenerate merged geometry |
| 5.6 | **Gate wall objects** | `gates.js`: Neon arc mesh (5 units wide) with glowing text sign. Open state (rideable, animated glow) vs locked state (solid, stops cycle, dimmed). Trigger zone detection. Dynamic sign text (e.g., "ENTER ARENA 4") |
| 5.7 | **Level transitions** | Tron-grid tunnel animation (~1s) for all entries and exits. **Trail clears on every transition** — player starts each level/lobby with no trail. **Player spawns stationary** (speed = 0) after every tunnel, **2 units in front of entrance gate** (derived from gate position, no `playerSpawn` field in schema). **5×5 clear zone** enforced in editor around entrance. Exit: tunnel → trail cleared → spawn at lobby entrance gate stationary. Coin reward overlay (half-transparent neon screen with coins earned, time bonus, celebration) appears when all enemies eliminated — **auto-dismisses after `coinOverlayDuration` seconds (default 3s)**. **Coins only awarded on riding through exit gate** — derez before exiting forfeits reward. Zero-enemy levels: exit gate open from start, no completion overlay |
| 5.8 | **Save data system** | `savedata.js`: Player save data schema (per spec above). Load from localStorage on boot, create with defaults if none. Save on any mutation (level complete, purchase, settings change). Linear progression — no level replay |
| 5.9 | **Campaign levels** | Write lobby (Level 0) as JSON: **arenaWidth: 400, arenaDepth: 200**, entrance gate on south wall (always locked), **3 function gates** on north wall (Arena N with `destination: "level"`, Garage with `destination: "garage"`, Architect with `destination: "editor"`), `"rewards": null`. Write 5 starter levels with increasing difficulty (more enemies, better enemy attributes + intelligence, more complex barrier layouts). Write `manifest.json` |

### Phase 6: Level Editor

| # | Task | Description |
|---|------|-------------|
| 6.1 | **Editor camera** | Birds-eye orthographic view looking down. Mouse pan (middle-click drag), scroll to zoom. Grid overlay (1-unit tiles) |
| 6.2 | **Block palette UI** | HTML/CSS side panel. **6 floor-object categories**: Barriers, Game Objects, Instant Power-ups, Level-Permanent Power-ups, Equippable Power-ups, Enemy Objects. Click to select. **Wall Objects are NOT in the palette** — cosmetic walls placed via click-on-edge context menu |
| 6.3 | **Place/remove/move blocks** | **Floor objects**: select from palette → click tile to place (palette-first). **Wall objects**: click arena edge tile → context menu with cosmetic wall options (click-then-choose). Click any existing item to select → Move (drag), Delete (Del key), Rotate (R key). Gates can only be moved along walls (not deleted/rotated/placed). Portal placement forces pair. Immediate 3D preview. Palette hover shows preview on cursor tile |
| 6.4 | **Properties panel** | HTML/CSS panel. Click placed block → edit: enemy attributes (**6 sliders** 1-10: speed, accel, trailLength, nitroBars, handling, intelligence) + color picker, **building height slider** (1-5 units, default 2) + **shape dropdown** (square/triangle/hexagon, default square), **structure variant** dropdown (pylon/column/obelisk), portal pair ID + rotation, **gate properties** (destination is read-only — fixed per role. **`locked` is not shown** — always derived at runtime per role. **signText is read-only** for entrance + lobby functional gates (fixed values), **editable for exit gates** only. Gates cannot be placed, removed, or rotated — only moved along walls), **cosmetic wall variant** dropdown (panel_a/panel_b/panel_c) + **width slider** (1-10 units, default 5) |
| 6.5 | **Arena size control** | Width/depth inputs. **Minimum 40×40** enforced. Walls rebuild. Blocks outside new bounds are removed with confirmation dialog |
| 6.6 | **Save/Load + Undo** | Auto-save WIP to localStorage. Level select dropdown (WIP levels + campaign levels). Load into editor. **Undo/Redo** (Ctrl+Z / Ctrl+Y): operation stack tracking all place/remove/move/property-change actions |
| 6.7 | **Export to Campaign** | "Export" button → browser downloads `level-N-slug.json`. "Export Manifest" → downloads updated `manifest.json`. Ready to drop into `levels/` directory |
| 6.8 | **Import JSON** | File picker → load level JSON into editor |
| 6.9 | **Play-test** | "Test" button → enter game mode for current level. **Backtick (`` ` ``) key → quit back to editor** (ESC remains pause menu only — no conflict). **Derez and level completion follow normal game flow** — derez returns to lobby (not editor), completion returns to lobby with coins. Backtick is the only editor-specific exit path. Fast iteration loop |

### Phase 7: Lobby & Garage

| # | Task | Description |
|---|------|-------------|
| 7.1 | **Lobby arena** | Build Level 0 from level data. Colosseum-style: **arenaWidth: 400, arenaDepth: 200** (shallow — player only travels ~100 units south-to-north from entrance to gates), high walls with architectural panels. **Entrance gate on south wall** (always locked, empty signText), **3 function gates on north wall** (Arena N, Garage, Architect). Player spawns 2 units in front of entrance gate (same system as all levels). Timer hidden in lobby |
| 7.2 | **Gate routing** | Ride through gate → tunnel transition → state. Start gate: load next incomplete arena. Garage gate: enter Garage. Architect gate: enter Editor (level list screen) |
| 7.3 | **Garage environment** | Dark Tron-themed void room. Player cycle on glowing circular plate, short trail behind it. Cycle rotates slowly. Neon ambient lighting |
| 7.4 | **Garage UI** | HTML/CSS panels over the 3D garage scene. Sections: Customize Colors (cycle + trail, live preview), Upgrade Attributes (5 cards with level/cost/buy), Stats (coins, level progress). "Return to Lobby" button |
| 7.5 | **Controls overlay** | Shown on first lobby entry (checks `controlsShown` save flag — if false, auto-shows and sets to true). Also accessible from pause menu. Shows all key bindings in Tron-styled overlay. **Dismiss**: prominent "GOT IT" button + ESC key to dismiss |
| 7.6 | **Pause menu + Settings** | ESC → overlay with controls reference, **Settings panel** (audio levels: master/music/SFX/ambient, effect toggles), Resume, Quit to Lobby. Game paused (physics + AI frozen). Settings is an overlay within the pause menu — no separate gate or 3D scene |

### Phase 8: Audio

| # | Task | Description |
|---|------|-------------|
| 8.1 | **Audio engine** | `audio.js`: Web Audio API manager. Music track loading + looping + crossfade between states. SFX pool with concurrent playback. Ambient layer system (looping background sounds). **Graceful missing-file handling** — if any audio file doesn't exist, engine falls back to silence (no errors). Autoplay on page load by default (`AUDIO_AUTOPLAY` flag, easy to toggle to first-interaction) |
| 8.2 | **Music tracks** | Generate 2 tracks via **ElevenLabs API** (API key provided as env var `ELEVENLABS_API_KEY`). Lobby/menu ambient + gameplay high-energy. Write detailed generation prompts for each track. Place output in `assets/audio/`. This is a dedicated bead — the polecat generates the assets programmatically via API |
| 8.3 | **Ambient layer** | Grid hum + electric crackling + arena resonance. Looping, always playing under music. Volume via `ambientVolume` |
| 8.4 | **Engine sounds** | Idle hum, acceleration whine (pitch follows speed), gear shift "chunk" sounds at speed thresholds (`gearShiftCount` intervals), sustained top-speed whine |
| 8.5 | **Game SFX** | Generate all SFX via **ElevenLabs API** with detailed prompts per sound. Nitro burst whoosh, nitro empty fizzle, wall hit thud, near-miss zip, trail tink, derez implosion (digital shatter inward), all power-up pickup/activation sounds (per type), shield shatter + expiry, portal warp, boost pad whoosh, gate enter hum, tunnel whoosh, level complete chord, coin tinkle. Each is a dedicated API call with a descriptive prompt. Audio engine must gracefully handle missing files (silent fallback) during development |
| 8.6 | **Audio settings** | Volume controls in Settings + Dev HUD. Persist to save data |

### Phase 9: Polish & Effects

| # | Task | Description |
|---|------|-------------|
| 9.1 | **Post-processing** | Bloom (UnrealBloomPass), chromatic aberration (ShaderPass), optional CRT scanlines. All intensity values from save data devHud section |
| 9.2 | **Developer HUD** | `.` key toggle. HTML/CSS panel organized by category (Cycle Feel, Nitro Camera, Derez, Portal, Cooldowns, Power-ups, Gameplay, Post-processing, Trail, Audio, AI, Near-miss). All values live-update and auto-save to localStorage |
| 9.3 | **Particle effects** | Nitro flame trail behind cycle during burst. Derez implosion particles. Power-up pickup burst (color-matched). Portal warp ring particles. Shield activation shimmer. Shield shatter fragments |
| 9.4 | **Minimap** | Bottom-right corner minimap — **simplified Tron classic birds-eye view**. Player = cyan dot, enemies = colored dots, trails = colored lines (simplified, not full curve detail — leverages tile-based collision data), obstacles/barriers = white/gray squares, items (power-ups, game objects) = bright colored hollow circles (intentionally ambiguous — player can't tell power-up type from minimap). Clean, minimal, readable at a glance |
| 9.5 | **Tunnel transition** | Tron-grid tunnel fly-through animation (~1s). Glowing grid lines rushing past. **Universal transition** — used for BOOT loading (with title + progress bar overlay), all gate transitions, and all UI button returns (Garage/Editor "Return to Lobby"). Single reusable animation system |
| 9.6 | **Final visual pass** | Tron: Legacy fidelity check — neon consistency, glow levels, atmosphere, architectural detail on walls and structures. Ensure color coding is clear at speed |

### Phase 10: Integration & Vibe Index

| # | Task | Description |
|---|------|-------------|
| 10.1 | **Update vibe/index.html** | Add "Tron: Light Cycles" link to the vibe projects page |
| 10.2 | **Cross-browser test** | Verify on Chrome, Firefox, Safari. Performance check at default 400×400 arena with 5+ enemies |
| 10.3 | **Mobile note** | Add "Desktop recommended" note — this is a keyboard-only game |

## Design References

- **Tron: Legacy** (2010 film) — The grid, light cycles, arena fights, ISO architecture
- **Tron: Evolution** (game) — Arena combat, light cycle handling
- **Tron Run/r** — Speed feel, trail mechanics, boost pads
- **Color palette**: Primary cyan `#00FFFF` + orange `#FF6600` on near-black `#0a0a0a` environment with blue-tinted grid `#1a1a3e`
- **Power-up colors**: Green `#00FF66` (instant), Blue `#0088FF` (level-permanent), Purple `#CC00FF` (equippable)
