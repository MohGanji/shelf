# NFS Drive — Three.js Racing Game

## Goal

Build a Need for Speed Most Wanted-style driving game as a vibe project. Third-person chase cam, arcade drift physics (brake-to-drift), small open-world city blocks, daytime aesthetic. Garage car selector with 3 real car models from Sketchfab. Single self-contained HTML file, Three.js + cannon-es from CDN.

## Product

- **Target feel**: NFS Most Wanted (2005) — arcade, drifty, satisfying
- **Core loop**: Select car in garage → drive around city freely → drift corners
- **Cars**: Lamborghini Gallardo, BMW M3 GTR E46, Mitsubishi Lancer Evo IX
- **Map**: Flat city blocks (~6 blocks), roads with turns, physical barriers (buildings, guardrails)
- **Camera**: Third-person chase cam
- **UI**: Minimal — speedometer, gear indicator

## Files to Create/Modify

| File | Action |
|------|--------|
| `vibe/drive/index.html` | **Create** — entire game in one file |
| `vibe/index.html` | **Edit** — add "NFS Drive" nav link |

## Architecture

Single `<script type="module">` with Three.js 0.160.0 + cannon-es 0.20.0 from CDN via importmap. GLTFLoader for Sketchfab models. Code organized in commented sections:

```
Constants & Config → Physics World → Scene Setup → Car Models (GLB URLs) →
Garage Screen → World Builder → Vehicle Physics → Player Controller →
Camera System → HUD → Game Loop
```

## 3D Models (Sketchfab CDN)

All CC BY 4.0. Load GLB via Sketchfab's CDN download API or direct URLs.

| Car | Model | Author | Tris | URL |
|-----|-------|--------|------|-----|
| Lamborghini Gallardo | Gallardo 2004 | ALIEEEN | 82K | `e6a7d7e98f4c46ca841eb930184b0f09` |
| BMW M3 GTR E46 | NFS MW | Q.SARDOR | 21K | `d90658fa572a48d7b4fff084f354bbde` |
| Mitsubishi Evo IX | Evo IX | madizon | 11K | `ff50f6f7ac164e44a153c479d525b01e` |

Note: Sketchfab doesn't provide direct CDN links for GLB files — they require authentication/download. We'll need to either:
- Host the GLB files on a static asset CDN we control
- Or find alternative model sources with direct URLs

**Fallback approach**: If direct Sketchfab CDN loading isn't viable, we generate procedural low-poly car meshes in code (colored BoxGeometry groups shaped like each car) with appropriate proportions. This keeps the single-file pattern clean and avoids external dependencies. The shapes would be recognizable silhouettes — Lambo is low/wide/angular, BMW is medium sedan, Evo is rally box shape. We can upgrade to real models later.

## Core Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Physics | cannon-es `RaycastVehicle` | Industry-standard arcade vehicle physics, tunable drift |
| Camera | Chase cam with spring damping | Classic NFS feel, lerp behind car with height offset |
| Drift | Lower rear `frictionSlip` + handbrake drops it further | Brake-to-drift like NFS MW |
| Ground | Large plane + canvas texture for roads | Same pattern as stick RPG, one draw call |
| Buildings | BoxGeometry barriers with collision bodies | Simple, physical, can't drive through |
| Guardrails | Thin box collision bodies along map edges | Keeps player in bounds |
| Car models | Procedural low-poly (initial), GLB upgrade path | Zero external dependencies, instant load |
| Garage | Separate game state — dark scene, spotlight, turntable | NFS MW style car select |

## Driving Physics Tuning

Target: NFS Most Wanted arcade feel

| Parameter | Value | Notes |
|-----------|-------|-------|
| Chassis mass | 150 | Light enough for arcade feel |
| Max engine force | 1500 | Strong acceleration |
| Max brake force | 50 | Moderate braking |
| Max steer | 0.5 rad (~28°) | Responsive turning |
| Front frictionSlip | 2.5 | Good front grip |
| Rear frictionSlip (normal) | 2.0 | Slight oversteer tendency |
| Rear frictionSlip (handbrake) | 0.5 | Kicks rear out for drift |
| Suspension stiffness | 30 | Sporty but not stiff |
| Damping compression | 4.4 | Standard |
| Damping relaxation | 2.3 | Standard |
| Roll influence | 0.01 | Prevent rollovers |
| Max speed | ~200 km/h | Speed-limited via force tapering |

### Drift Mechanic

1. Player holds Space (handbrake)
2. Rear wheel `frictionSlip` drops from 2.0 → 0.5
3. Rear wheels lock and car rotates
4. Player counter-steers to hold the drift angle
5. Release Space → friction restores → car grips and exits drift
6. Optional: slight engine force boost during drift for style

## Garage / Car Selector

- **Scene**: Dark background (near-black), single SpotLight from above
- **Car**: Centered, slowly rotating on invisible turntable (~10°/sec)
- **UI**: Car name, stats bars (Speed, Acceleration, Handling, Drift), left/right arrows to browse
- **Stats**: Different per car to give meaningful choice
- **"START" button**: Transitions to game (fade out garage, fade in world)

### Car Stats

| Car | Speed | Accel | Handling | Drift | Physics tweaks |
|-----|-------|-------|----------|-------|----------------|
| Lamborghini Gallardo | 9 | 8 | 7 | 6 | Highest top speed, less drift |
| BMW M3 GTR | 7 | 7 | 8 | 9 | Best drift, iconic MW car |
| Mitsubishi Evo IX | 6 | 9 | 9 | 7 | Best acceleration & handling |

## City Layout

```
~300x300 world units, TILE_SIZE=2

     North
  ┌──────────────────────────────┐
  │  ┌───┐     ┌───┐     ┌───┐  │
  │  │ B1│     │ B2│     │ B3│  │  ← Buildings (collision)
  │  └───┘     └───┘     └───┘  │
  │ ═══════════════════════════  │  ← E-W Road
  │  ┌───┐     ┌───┐     ┌───┐  │
  │  │ B4│  P  │ B5│     │ B6│  │  P = Player spawn
  │  └───┘  ↓  └───┘     └───┘  │
  │ ═══════════════════════════  │  ← E-W Road
  │  ┌───┐     ┌───┐     ┌───┐  │
  │  │ B7│     │ B8│     │ B9│  │
  │  └───┘     └───┘     └───┘  │
  │ ═══════════════════════════  │  ← E-W Road
  └──────────────────────────────┘
       ║         ║         ║
     N-S Roads (3 columns)

  Guardrails around entire perimeter
  3x3 grid of city blocks with roads between
  Buildings are solid collision boxes
  Roads are ~12 units wide (2 lanes each way)
```

## Implementation Steps

### Phase 1: Scaffold + Garage (~400 lines)
1. HTML boilerplate: meta, Inter font, styles, importmap (three + cannon-es)
2. Header: "NFS Drive" title + back link
3. Loading screen with progress bar (shows while models/scene initialize)
4. Garage scene: dark background, SpotLight, OrbitControls disabled (auto-rotate only)
5. Build 3 procedural car meshes (Lambo, BMW, Evo) — colored box groups with recognizable proportions
6. Car selector UI: name, stat bars (Speed/Accel/Handling/Drift), left/right arrows, START button
7. Turntable rotation animation
8. START click → fade transition → init game world

### Phase 2: World + Physics (~400 lines)
9. cannon-es world setup (gravity, broadphase, contact materials)
10. Ground plane: Three.js mesh + cannon-es static body
11. Road texture via CanvasTexture (asphalt with lane markings, intersections)
12. Building definitions: 9 buildings in 3x3 grid layout
13. Build buildings: BoxGeometry visual + CANNON.Box static body for each
14. Perimeter guardrails: thin box static bodies around map edges
15. Some visual props: streetlights along roads, traffic cones at corners

### Phase 3: Vehicle (~350 lines)
16. `createVehicle(carDef)`: CANNON.RaycastVehicle with chassis body
17. 4 wheels with tuned suspension/friction per car stats
18. Attach selected car mesh to chassis body
19. Create simple wheel meshes (dark cylinders)
20. Input handler: W/Up=accelerate, S/Down=brake, A/D or Left/Right=steer, Space=handbrake
21. `updateVehicle(dt)`: Apply engine force, steering, braking based on input
22. Handbrake: drop rear frictionSlip, lock rear wheels
23. Speed-dependent steering reduction (less turn at high speed)
24. Top speed limiter (reduce force as approaching max speed)

### Phase 4: Camera + HUD (~200 lines)
25. Chase camera: positioned behind+above car, lerps to follow, rotates with car heading
26. Camera spring: offset behind car by ~8 units, height ~4, look-ahead ~3 units in front
27. Camera smoothing: position lerp 5/sec, rotation slerp 3/sec
28. HUD: speedometer (km/h, large number), gear indicator, drift indicator
29. Speed calculation from chassis velocity magnitude
30. Glassmorphism HUD panel (bottom-center or bottom-left)

### Phase 5: Polish (~250 lines)
31. Tire screech effect: when rear wheels slip beyond threshold, show "drift" UI flash
32. Skid marks: thin dark planes spawned at rear wheel positions during drift
33. Engine sound pitch (optional — may skip to avoid audio complexity)
34. Shadows: sun directional light with shadow map, buildings cast, car casts
35. Speed lines / FOV increase at high speed (subtle)
36. Brake lights: red emissive planes on car rear, activate on brake
37. Headlights: small SpotLights on car front (subtle glow)
38. Reset car: R key teleports back to spawn if stuck
39. Minimap (stretch goal — small top-right canvas showing car position on map)
40. Update `vibe/index.html` with nav link

## HUD Design

```
┌─────────────────────────────────────────────┐
│                                             │
│                                             │
│                                             │
│                                             │
│                                    ┌──────┐ │
│                                    │ 142  │ │
│                                    │ km/h │ │
│                                    │  3rd │ │
│                                    └──────┘ │
└─────────────────────────────────────────────┘
         Glassmorphism panel, bottom-right
```

## Garage UI Design

```
┌─────────────────────────────────────────────┐
│                                             │
│            ◄  BMW M3 GTR  ►                 │
│                                             │
│           ┌─────────────────┐               │
│           │   [Car Model    │               │
│           │    rotating     │               │
│           │    on stage]    │               │
│           └─────────────────┘               │
│                                             │
│    Speed     ████████░░  8                  │
│    Accel     ███████░░░  7                  │
│    Handling  ████████░░  8                  │
│    Drift     █████████░  9                  │
│                                             │
│              [ START ]                      │
└─────────────────────────────────────────────┘
```

## Verification

1. Open `vibe/drive/index.html` — loading screen appears, then garage
2. Garage shows car rotating under spotlight, stats visible, arrows switch cars
3. Click START — smooth transition to game world
4. WASD drives car with arcade physics, feels responsive
5. Space triggers handbrake drift — rear kicks out, can hold drift through corners
6. Chase camera smoothly follows behind car
7. Can't drive through buildings (collision works)
8. Guardrails keep car on the map
9. Speedometer shows current speed, updates in real-time
10. R key resets car to spawn if stuck
11. `vibe/index.html` shows "NFS Drive" link
