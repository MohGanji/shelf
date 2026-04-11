import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Renderer } from './engine/renderer.js';
import { ChaseCamera } from './engine/camera.js';
import { InputManager } from './engine/input.js';
import { LightCycle } from './game/cycle.js';

// --- Arena floor + walls (minimal foundation) ---
function buildArena(scene) {
    const w = CONFIG.DEFAULT_ARENA_WIDTH;
    const d = CONFIG.DEFAULT_ARENA_DEPTH;

    // Grid floor — emissive glowing Tron lines
    const gridSize = 512;
    const tilesPerPatch = 16;

    // Color texture (dark floor, bright grid lines)
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = gridSize;
    colorCanvas.height = gridSize;
    const cCtx = colorCanvas.getContext('2d');
    cCtx.fillStyle = '#050508';
    cCtx.fillRect(0, 0, gridSize, gridSize);
    cCtx.strokeStyle = '#1a1a3e';
    cCtx.lineWidth = 1.5;
    const step = gridSize / tilesPerPatch;
    for (let i = 0; i <= tilesPerPatch; i++) {
        const p = i * step;
        cCtx.beginPath(); cCtx.moveTo(p, 0); cCtx.lineTo(p, gridSize); cCtx.stroke();
        cCtx.beginPath(); cCtx.moveTo(0, p); cCtx.lineTo(gridSize, p); cCtx.stroke();
    }
    const colorTex = new THREE.CanvasTexture(colorCanvas);
    colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
    colorTex.repeat.set(w / tilesPerPatch, d / tilesPerPatch);

    // Emissive map — just the grid lines glow
    const emCanvas = document.createElement('canvas');
    emCanvas.width = gridSize;
    emCanvas.height = gridSize;
    const eCtx = emCanvas.getContext('2d');
    eCtx.fillStyle = '#000000';
    eCtx.fillRect(0, 0, gridSize, gridSize);
    eCtx.strokeStyle = '#ffffff';
    eCtx.lineWidth = 1.5;
    for (let i = 0; i <= tilesPerPatch; i++) {
        const p = i * step;
        eCtx.beginPath(); eCtx.moveTo(p, 0); eCtx.lineTo(p, gridSize); eCtx.stroke();
        eCtx.beginPath(); eCtx.moveTo(0, p); eCtx.lineTo(gridSize, p); eCtx.stroke();
    }
    const emTex = new THREE.CanvasTexture(emCanvas);
    emTex.wrapS = emTex.wrapT = THREE.RepeatWrapping;
    emTex.repeat.set(w / tilesPerPatch, d / tilesPerPatch);

    const floorMat = new THREE.MeshStandardMaterial({
        map: colorTex,
        emissiveMap: emTex,
        emissive: new THREE.Color(CONFIG.GRID_COLOR),
        emissiveIntensity: CONFIG.GRID_BRIGHTNESS,
        roughness: 0.85,
        metalness: 0.15,
    });
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        floorMat
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Arena walls
    const wallH = CONFIG.ARENA_WALL_HEIGHT;
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x0a0a1a,
        emissive: new THREE.Color(CONFIG.GRID_COLOR),
        emissiveIntensity: 0.3,
        metalness: 0.7,
        roughness: 0.4,
    });

    // Wall strip material (emissive accent on top edge)
    const wallStripMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(CONFIG.PLAYER_COLOR),
        emissive: new THREE.Color(CONFIG.PLAYER_COLOR),
        emissiveIntensity: 0.8,
    });

    const wallThickness = 0.2;
    const halfW = w / 2;
    const halfD = d / 2;

    // North wall
    const nWall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, wallThickness), wallMat);
    nWall.position.set(0, wallH / 2, halfD + wallThickness / 2);
    scene.add(nWall);
    const nStrip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, wallThickness + 0.02), wallStripMat);
    nStrip.position.set(0, wallH, halfD + wallThickness / 2);
    scene.add(nStrip);

    // South wall
    const sWall = nWall.clone();
    sWall.position.set(0, wallH / 2, -halfD - wallThickness / 2);
    scene.add(sWall);
    const sStrip = nStrip.clone();
    sStrip.position.set(0, wallH, -halfD - wallThickness / 2);
    scene.add(sStrip);

    // East wall
    const eWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallH, d), wallMat);
    eWall.position.set(halfW + wallThickness / 2, wallH / 2, 0);
    scene.add(eWall);
    const eStrip = new THREE.Mesh(new THREE.BoxGeometry(wallThickness + 0.02, 0.05, d), wallStripMat);
    eStrip.position.set(halfW + wallThickness / 2, wallH, 0);
    scene.add(eStrip);

    // West wall
    const wWall = eWall.clone();
    wWall.position.set(-halfW - wallThickness / 2, wallH / 2, 0);
    scene.add(wWall);
    const wStrip = eStrip.clone();
    wStrip.position.set(-halfW - wallThickness / 2, wallH, 0);
    scene.add(wStrip);

    // Lighting
    const ambient = new THREE.AmbientLight(0x111122, 0.8);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0x8888cc, 0.4);
    dirLight.position.set(50, 100, 50);
    scene.add(dirLight);

    // Hemisphere light for subtle fill
    const hemiLight = new THREE.HemisphereLight(0x1a1a3e, 0x050508, 0.6);
    scene.add(hemiLight);

    return {
        bounds: { minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: halfD },
    };
}

// --- HUD ---
function createHUD() {
    const hud = document.getElementById('hud');
    const speedEl = document.getElementById('hud-speed');
    const nitroContainer = document.getElementById('hud-nitro-bars');

    return {
        update(cycle) {
            speedEl.textContent = Math.round(cycle.speed);

            // Nitro bars
            nitroContainer.innerHTML = '';
            for (let i = 0; i < cycle.nitroMaxBars; i++) {
                const bar = document.createElement('div');
                bar.className = 'nitro-bar' + (i < cycle.nitroBars ? ' filled' : '');
                if (cycle.nitroActive && i < cycle.nitroBars) bar.className += ' active';
                nitroContainer.appendChild(bar);
            }
        }
    };
}

// --- Game init ---
function init() {
    const canvas = document.getElementById('game-canvas');
    const renderer = new Renderer(canvas);
    const input = new InputManager();
    const arena = buildArena(renderer.scene);
    const hud = createHUD();

    // Spawn cycle at center
    const cycle = new LightCycle(
        renderer.scene,
        CONFIG.PLAYER_COLOR,
        new THREE.Vector3(0, 0, 0),
        0 // facing +Z (north)
    );

    const chaseCamera = new ChaseCamera(renderer.camera);
    chaseCamera.snap(cycle);

    // Clock
    const clock = new THREE.Clock();

    // Wall collision (simple box bounds)
    function clampCycleToArena(cycle, bounds) {
        const margin = CONFIG.CYCLE_LENGTH / 2;
        const pos = cycle.mesh.position;
        let hit = false;

        if (pos.x < bounds.minX + margin) { pos.x = bounds.minX + margin; hit = true; }
        if (pos.x > bounds.maxX - margin) { pos.x = bounds.maxX - margin; hit = true; }
        if (pos.z < bounds.minZ + margin) { pos.z = bounds.minZ + margin; hit = true; }
        if (pos.z > bounds.maxZ - margin) { pos.z = bounds.maxZ - margin; hit = true; }

        if (hit) {
            // Angle-based speed reduction (simplified: wall slide)
            const forward = new THREE.Vector3(Math.sin(cycle.heading), 0, Math.cos(cycle.heading));
            // Determine which wall was hit and compute impact angle
            const nx = pos.x <= bounds.minX + margin + 0.01 ? 1 :
                       pos.x >= bounds.maxX - margin - 0.01 ? -1 : 0;
            const nz = pos.z <= bounds.minZ + margin + 0.01 ? 1 :
                       pos.z >= bounds.maxZ - margin - 0.01 ? -1 : 0;
            const wallNormal = new THREE.Vector3(nx, 0, nz).normalize();
            if (wallNormal.length() > 0) {
                const dot = forward.dot(wallNormal);
                const impactAngle = Math.acos(Math.abs(dot));
                const speedReduction = Math.sin(impactAngle);
                cycle.speed *= speedReduction;

                // Slide heading: reflect away from wall
                const reflected = forward.sub(wallNormal.multiplyScalar(2 * dot)).normalize();
                cycle.heading = Math.atan2(reflected.x, reflected.z);

                chaseCamera.shake(0.15);
            }
        }
    }

    // --- Game loop ---
    function animate() {
        requestAnimationFrame(animate);

        const dt = Math.min(clock.getDelta(), 1 / 30); // cap to ~30fps min

        // Update cycle
        cycle.update(dt, input);

        // Wall collision
        clampCycleToArena(cycle, arena.bounds);

        // Camera
        chaseCamera.update(dt, cycle);

        // HUD
        hud.update(cycle);

        // Render
        renderer.render();
    }

    animate();
}

init();
