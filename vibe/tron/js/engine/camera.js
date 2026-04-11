import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class ChaseCamera {
    constructor(camera) {
        this.camera = camera;
        this.camera.fov = CONFIG.CAMERA_FOV;
        this.camera.updateProjectionMatrix();

        // Current smooth state
        this.currentPosition = new THREE.Vector3(0, CONFIG.CAMERA_HEIGHT, CONFIG.CAMERA_DISTANCE);
        this.currentLookAt = new THREE.Vector3();

        // Target state (computed each frame)
        this.targetPosition = new THREE.Vector3();
        this.targetLookAt = new THREE.Vector3();

        // Shake state
        this.shakeIntensity = 0;
        this.shakeOffset = new THREE.Vector3();

        // FOV transition
        this.currentFov = CONFIG.CAMERA_FOV;
        this.targetFov = CONFIG.CAMERA_FOV;

        // Reusable vectors
        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._offset = new THREE.Vector3();
    }

    update(dt, cycle) {
        if (!cycle) return;

        const heading = cycle.heading;
        const speed = cycle.speed;
        const steerInput = cycle.steerInput || 0;

        // Forward direction from cycle heading (heading = rotation around Y)
        this._forward.set(-Math.sin(heading), 0, -Math.cos(heading));
        this._right.set(-Math.cos(heading), 0, Math.sin(heading));

        // Camera offset: behind and above cycle
        const distance = CONFIG.CAMERA_DISTANCE + (cycle.nitroActive ? CONFIG.CAMERA_NITRO_PULL_BACK : 0);
        this._offset.copy(this._forward).multiplyScalar(-distance);
        this._offset.y = CONFIG.CAMERA_HEIGHT;

        // Lateral offset for turn feel
        this._offset.addScaledVector(this._right, -steerInput * CONFIG.CAMERA_TURN_OFFSET);

        // Target position
        this.targetPosition.copy(cycle.mesh.position).add(this._offset);

        // Target look-at: ahead of the cycle
        this.targetLookAt.copy(cycle.mesh.position);
        this.targetLookAt.addScaledVector(this._forward, CONFIG.CAMERA_LOOK_AHEAD);

        // Smooth follow with damping
        const damping = 1.0 - Math.pow(1.0 - CONFIG.CAMERA_DAMPING, dt * 60);
        this.currentPosition.lerp(this.targetPosition, damping);
        this.currentLookAt.lerp(this.targetLookAt, damping);

        // Apply shake
        if (this.shakeIntensity > 0.001) {
            this.shakeOffset.set(
                (Math.random() - 0.5) * 2 * this.shakeIntensity,
                (Math.random() - 0.5) * 2 * this.shakeIntensity,
                (Math.random() - 0.5) * 2 * this.shakeIntensity
            );
            this.shakeIntensity *= Math.exp(-CONFIG.CAMERA_SHAKE_DECAY * dt);
        } else {
            this.shakeOffset.set(0, 0, 0);
            this.shakeIntensity = 0;
        }

        // Apply to camera
        this.camera.position.copy(this.currentPosition).add(this.shakeOffset);
        this.camera.lookAt(this.currentLookAt);

        // Smooth FOV transition (for nitro)
        this.targetFov = cycle.nitroActive ? CONFIG.CAMERA_NITRO_FOV : CONFIG.CAMERA_FOV;
        this.currentFov += (this.targetFov - this.currentFov) * damping;
        if (Math.abs(this.currentFov - this.camera.fov) > 0.01) {
            this.camera.fov = this.currentFov;
            this.camera.updateProjectionMatrix();
        }
    }

    shake(intensity) {
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    }

    // Snap camera immediately to target (no lerp) — use on spawn/teleport
    snap(cycle) {
        if (!cycle) return;

        const heading = cycle.heading;
        this._forward.set(-Math.sin(heading), 0, -Math.cos(heading));
        this._right.set(-Math.cos(heading), 0, Math.sin(heading));

        this._offset.copy(this._forward).multiplyScalar(-CONFIG.CAMERA_DISTANCE);
        this._offset.y = CONFIG.CAMERA_HEIGHT;

        this.currentPosition.copy(cycle.mesh.position).add(this._offset);
        this.currentLookAt.copy(cycle.mesh.position);
        this.currentLookAt.addScaledVector(this._forward, CONFIG.CAMERA_LOOK_AHEAD);

        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookAt);
        this.currentFov = CONFIG.CAMERA_FOV;
        this.camera.fov = this.currentFov;
        this.camera.updateProjectionMatrix();
    }
}
