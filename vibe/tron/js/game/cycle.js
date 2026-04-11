import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Build the procedural light cycle mesh
function buildCycleMesh(color) {
    const group = new THREE.Group();

    const emissiveColor = new THREE.Color(color);
    const bodyColor = new THREE.Color(0x111111);
    const darkColor = new THREE.Color(0x080808);

    // --- Materials ---
    const bodyMat = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0.8,
        roughness: 0.3,
    });
    const panelMat = new THREE.MeshStandardMaterial({
        color: darkColor,
        emissive: emissiveColor,
        emissiveIntensity: 0.6,
        metalness: 0.9,
        roughness: 0.2,
    });
    const stripMat = new THREE.MeshStandardMaterial({
        color: emissiveColor,
        emissive: emissiveColor,
        emissiveIntensity: 1.5,
        metalness: 1.0,
        roughness: 0.1,
    });
    const wheelMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        emissive: emissiveColor,
        emissiveIntensity: 0.8,
        metalness: 0.9,
        roughness: 0.3,
    });

    const L = CONFIG.CYCLE_LENGTH;   // 0.8
    const W = CONFIG.CYCLE_WIDTH;    // 0.3
    const H = CONFIG.CYCLE_HEIGHT;   // 0.4
    const halfL = L / 2;
    const halfW = W / 2;

    // --- Main body ---
    // Sleek elongated body: wider at back, tapers toward front
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-halfL, 0);
    bodyShape.lineTo(-halfL * 0.7, halfW * 0.9);
    bodyShape.lineTo(halfL * 0.3, halfW * 0.7);
    bodyShape.lineTo(halfL, halfW * 0.15);
    bodyShape.lineTo(halfL, -halfW * 0.15);
    bodyShape.lineTo(halfL * 0.3, -halfW * 0.7);
    bodyShape.lineTo(-halfL * 0.7, -halfW * 0.9);
    bodyShape.closePath();

    const extrudeSettings = {
        steps: 1,
        depth: H * 0.35,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.01,
        bevelSegments: 1,
    };
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
    bodyGeo.rotateX(-Math.PI / 2);
    bodyGeo.translate(0, H * 0.3, 0);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(bodyMesh);

    // --- Canopy / windshield (upper fairing) ---
    const canopyGeo = new THREE.BoxGeometry(L * 0.35, H * 0.18, W * 0.5);
    const canopyMesh = new THREE.Mesh(canopyGeo, new THREE.MeshStandardMaterial({
        color: 0x050510,
        emissive: emissiveColor,
        emissiveIntensity: 0.15,
        metalness: 0.95,
        roughness: 0.1,
        transparent: true,
        opacity: 0.7,
    }));
    canopyMesh.position.set(-L * 0.05, H * 0.52, 0);
    group.add(canopyMesh);

    // --- Side panels (emissive accent) ---
    const panelGeo = new THREE.BoxGeometry(L * 0.55, H * 0.08, 0.015);
    const panelLeft = new THREE.Mesh(panelGeo, panelMat);
    panelLeft.position.set(-L * 0.05, H * 0.3, halfW * 0.85);
    group.add(panelLeft);
    const panelRight = panelLeft.clone();
    panelRight.position.z = -halfW * 0.85;
    group.add(panelRight);

    // --- Light strips running along sides ---
    const stripGeo = new THREE.BoxGeometry(L * 0.7, 0.012, 0.012);
    const stripLeft = new THREE.Mesh(stripGeo, stripMat);
    stripLeft.position.set(0, H * 0.22, halfW * 0.92);
    group.add(stripLeft);
    const stripRight = stripLeft.clone();
    stripRight.position.z = -halfW * 0.92;
    group.add(stripRight);

    // Top spine strip
    const spineGeo = new THREE.BoxGeometry(L * 0.5, 0.012, 0.012);
    const spine = new THREE.Mesh(spineGeo, stripMat);
    spine.position.set(-L * 0.05, H * 0.62, 0);
    group.add(spine);

    // --- Nose light ---
    const noseGeo = new THREE.BoxGeometry(0.02, 0.04, W * 0.35);
    const nose = new THREE.Mesh(noseGeo, stripMat);
    nose.position.set(halfL - 0.01, H * 0.32, 0);
    group.add(nose);

    // --- Tail light ---
    const tailGeo = new THREE.BoxGeometry(0.02, H * 0.2, W * 0.6);
    const tail = new THREE.Mesh(tailGeo, stripMat);
    tail.position.set(-halfL + 0.01, H * 0.3, 0);
    group.add(tail);

    // --- Front wheel ---
    const wheelRadius = H * 0.22;
    const wheelWidth = W * 0.12;
    const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 12);
    wheelGeo.rotateX(Math.PI / 2);
    const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
    frontWheel.position.set(halfL * 0.65, wheelRadius, 0);
    frontWheel.userData.isWheel = true;
    group.add(frontWheel);

    // Front wheel glow ring
    const ringGeo = new THREE.TorusGeometry(wheelRadius, 0.008, 6, 16);
    const ringMat = stripMat;
    const frontRingA = new THREE.Mesh(ringGeo, ringMat);
    frontRingA.position.copy(frontWheel.position);
    frontRingA.position.z += wheelWidth / 2 + 0.005;
    group.add(frontRingA);
    const frontRingB = frontRingA.clone();
    frontRingB.position.z = frontWheel.position.z - wheelWidth / 2 - 0.005;
    group.add(frontRingB);

    // --- Rear wheel ---
    const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
    rearWheel.position.set(-halfL * 0.55, wheelRadius, 0);
    rearWheel.userData.isWheel = true;
    group.add(rearWheel);

    // Rear wheel glow rings
    const rearRingA = new THREE.Mesh(ringGeo, ringMat);
    rearRingA.position.copy(rearWheel.position);
    rearRingA.position.z += wheelWidth / 2 + 0.005;
    group.add(rearRingA);
    const rearRingB = rearRingA.clone();
    rearRingB.position.z = rearWheel.position.z - wheelWidth / 2 - 0.005;
    group.add(rearRingB);

    // --- Engine glow (underneath) ---
    const engineGeo = new THREE.BoxGeometry(L * 0.3, 0.02, W * 0.4);
    const engine = new THREE.Mesh(engineGeo, new THREE.MeshStandardMaterial({
        color: emissiveColor,
        emissive: emissiveColor,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.5,
    }));
    engine.position.set(-L * 0.1, 0.02, 0);
    group.add(engine);

    return group;
}

export class LightCycle {
    constructor(scene, color = CONFIG.PLAYER_COLOR, position = new THREE.Vector3(0, 0, 0), heading = 0) {
        this.scene = scene;
        this.color = color;

        // Physics state
        this.speed = 0;
        this.heading = heading; // radians, 0 = facing +Z (north)
        this.steerInput = 0;    // -1 = left, +1 = right, 0 = none

        // Attributes (level 1 defaults)
        this.topSpeed = CONFIG.DEFAULT_TOP_SPEED;
        this.acceleration = CONFIG.DEFAULT_ACCELERATION;
        this.handling = CONFIG.DEFAULT_HANDLING;

        // Nitro state
        this.nitroBars = CONFIG.NITRO_BARS;
        this.nitroMaxBars = CONFIG.NITRO_BARS;
        this.nitroActive = false;
        this.nitroBurstTimer = 0;
        this.nitroRechargeTimer = 0;

        // Animation state
        this.currentTilt = 0;
        this.currentPitch = 0;

        // Build mesh
        this.mesh = buildCycleMesh(color);
        this.mesh.position.copy(position);
        this.mesh.rotation.y = heading;
        scene.add(this.mesh);

        // Cache wheel references
        this.wheels = [];
        this.mesh.traverse((child) => {
            if (child.userData && child.userData.isWheel) {
                this.wheels.push(child);
            }
        });

        // Whether this cycle has started moving (for game-start trigger)
        this.hasStarted = false;
    }

    update(dt, input) {
        // --- Steering ---
        let steer = 0;
        if (input.steerLeft) steer -= 1;
        if (input.steerRight) steer += 1;
        this.steerInput = steer;

        // Speed-dependent steering: effectiveTurnRate = baseTurnRate / (1 + speed * k)
        let effectiveTurnRate = this.handling / (1 + this.speed * CONFIG.STEERING_SPEED_FALLOFF);

        // Nitro handling penalty
        if (this.nitroActive) {
            effectiveTurnRate *= CONFIG.NITRO_HANDLING_MULTIPLIER;
        }

        // Apply steering (works at any speed including zero)
        this.heading += steer * effectiveTurnRate * dt;

        // --- Nitro ---
        this.updateNitro(dt, input);

        // --- Acceleration / braking / coasting ---
        const nitroTopSpeed = this.topSpeed * CONFIG.NITRO_MAX_SPEED_MULTIPLIER;

        if (this.nitroActive) {
            // Nitro overrides brake - accelerate toward nitro cap
            this.speed += this.acceleration * 1.5 * dt;
            if (this.speed > nitroTopSpeed) this.speed = nitroTopSpeed;
        } else if (input.accelerate) {
            if (!this.hasStarted) this.hasStarted = true;

            if (this.speed > this.topSpeed) {
                // Post-nitro speed return: smoothly decrease to normal top speed
                const returnRate = (nitroTopSpeed - this.topSpeed) / CONFIG.NITRO_SPEED_RETURN_TIME;
                this.speed -= returnRate * dt;
                if (this.speed < this.topSpeed) this.speed = this.topSpeed;
            } else {
                // Normal acceleration
                this.speed += this.acceleration * dt;
                if (this.speed > this.topSpeed) this.speed = this.topSpeed;
            }
        } else if (input.brake) {
            // Braking - no reverse
            this.speed -= CONFIG.BRAKE_DECELERATION * dt;
            if (this.speed < 0) this.speed = 0;
        } else {
            // Coasting
            this.speed *= Math.pow(CONFIG.CYCLE_FRICTION, dt * 60);
            if (this.speed < 0.01) this.speed = 0;

            // Speed return from nitro while coasting
            if (this.speed > this.topSpeed) {
                this.speed *= Math.pow(CONFIG.CYCLE_FRICTION, dt * 60);
            }
        }

        // --- Movement ---
        const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
        this.mesh.position.addScaledVector(forward, this.speed * dt);

        // Face the heading direction
        this.mesh.rotation.y = this.heading;

        // --- Animations ---
        this.updateAnimations(dt, input);
    }

    updateNitro(dt, input) {
        // Recharge
        if (this.nitroBars < this.nitroMaxBars) {
            this.nitroRechargeTimer += dt;
            if (this.nitroRechargeTimer >= CONFIG.NITRO_BAR_RECHARGE_TIME) {
                this.nitroRechargeTimer -= CONFIG.NITRO_BAR_RECHARGE_TIME;
                this.nitroBars = Math.min(this.nitroBars + 1, this.nitroMaxBars);
            }
        }

        // Active burst countdown
        if (this.nitroActive) {
            this.nitroBurstTimer -= dt;
            if (this.nitroBurstTimer <= 0) {
                this.nitroActive = false;
                this.nitroBurstTimer = 0;

                // Chain if still holding space and bars available
                if (input.nitro && this.nitroBars > 0) {
                    this.activateNitro();
                }
            }
        } else if (input.nitro && this.nitroBars > 0) {
            this.activateNitro();
        }
    }

    activateNitro() {
        if (this.nitroBars <= 0) return;
        this.nitroBars--;
        this.nitroActive = true;
        this.nitroBurstTimer = CONFIG.NITRO_BURST_DURATION;
        this.nitroRechargeTimer = 0; // reset recharge on use
    }

    updateAnimations(dt, input) {
        // --- Tilt on steering ---
        const targetTilt = -this.steerInput * CONFIG.CYCLE_TILT_MAX;
        this.currentTilt += (targetTilt - this.currentTilt) * Math.min(1, CONFIG.CYCLE_TILT_SPEED * dt);

        // --- Pitch on accel/brake ---
        let targetPitch = 0;
        if (CONFIG.CYCLE_PITCH_ON_ACCEL && input.accelerate && this.speed < this.topSpeed) {
            targetPitch = -CONFIG.CYCLE_PITCH_AMOUNT; // nose down on accel
        } else if (CONFIG.CYCLE_LEAN_ON_BRAKE && input.brake && this.speed > 0) {
            targetPitch = CONFIG.CYCLE_LEAN_AMOUNT; // nose up on brake
        }
        this.currentPitch += (targetPitch - this.currentPitch) * Math.min(1, CONFIG.CYCLE_PITCH_SPEED * dt);

        // Apply tilt (roll) and pitch to mesh — on top of heading rotation
        // Reset to heading first, then apply tilt and pitch
        this.mesh.rotation.set(this.currentPitch, this.heading, this.currentTilt);

        // --- Wheel rotation ---
        const wheelRotSpeed = this.speed * 8; // visual spin
        for (const wheel of this.wheels) {
            wheel.rotation.x += wheelRotSpeed * dt;
        }
    }

    setColor(hexColor) {
        const newColor = new THREE.Color(hexColor);
        this.mesh.traverse((child) => {
            if (child.isMesh && child.material && child.material.emissive) {
                child.material.emissive.copy(newColor);
            }
        });
        this.color = hexColor;
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
}
