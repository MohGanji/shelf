import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Collision groups (bit flags for cannon-es collision filtering)
export const COLLISION_GROUPS = {
  WALL: 1,
  CYCLE: 2,
  BARRIER: 4,
  TRIGGER: 8,
};

/**
 * Arena — builds the 3D scene + physics world from level data JSON.
 *
 * Usage:
 *   const arena = new Arena(scene, physicsWorld);
 *   arena.build(levelData);  // constructs everything
 *   arena.dispose();         // tears down for level transitions
 */
export class Arena {
  constructor(scene, physicsWorld, config = {}) {
    this.scene = scene;
    this.world = physicsWorld;
    this.config = config;

    // Tracked objects for disposal
    this._meshes = [];
    this._bodies = [];
    this._lights = [];

    // Placeholder positions populated during build()
    this.barrierPositions = [];
    this.gameObjectPositions = [];
    this.powerupPositions = [];
    this.enemyPositions = [];
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Build the full arena from level data JSON.
   * @param {object} levelData - Parsed level JSON (see schema.js)
   */
  build(levelData) {
    const width = levelData.arenaWidth ?? 400;
    const depth = levelData.arenaDepth ?? 400;
    const wallHeight = this.config.wallHeight ?? 3;

    this.arenaWidth = width;
    this.arenaDepth = depth;
    this.wallHeight = wallHeight;

    this.createFloorGrid(width, depth);
    this.createPerimeterWalls(width, depth, wallHeight);
    this.createLighting(width, depth);

    if (levelData.barriers) {
      this.placeBarriers(levelData.barriers);
    }
    if (levelData.gameObjects) {
      this.placeGameObjects(levelData.gameObjects);
    }
    if (levelData.powerups) {
      this.placePowerups(levelData.powerups);
    }
    if (levelData.enemies) {
      this.placeEnemies(levelData.enemies);
    }
  }

  /**
   * Remove all arena objects from the scene and physics world.
   */
  dispose() {
    for (const mesh of this._meshes) {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    }
    for (const body of this._bodies) {
      this.world.removeBody(body);
    }
    for (const light of this._lights) {
      this.scene.remove(light);
    }
    this._meshes = [];
    this._bodies = [];
    this._lights = [];
    this.barrierPositions = [];
    this.gameObjectPositions = [];
    this.powerupPositions = [];
    this.enemyPositions = [];
  }

  // ── Floor ───────────────────────────────────────────────────

  /**
   * Glowing grid lines at 1-unit spacing on a dark floor.
   * Tron-style blue-tinted grid (#1a1a3e base).
   */
  createFloorGrid(width, depth) {
    const halfW = width / 2;
    const halfD = depth / 2;

    // Dark base plane
    const floorGeo = new THREE.PlaneGeometry(width, depth);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a3e,
      roughness: 0.85,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this._meshes.push(floor);

    // Grid lines — BufferGeometry lines for performance
    const gridBrightness = this.config.gridBrightness ?? 0.4;
    const gridColor = new THREE.Color(0x00ffff).multiplyScalar(gridBrightness);

    const positions = [];

    // Lines parallel to X axis (varying Z)
    for (let z = -halfD; z <= halfD; z += 1) {
      positions.push(-halfW, 0.005, z, halfW, 0.005, z);
    }
    // Lines parallel to Z axis (varying X)
    for (let x = -halfW; x <= halfW; x += 1) {
      positions.push(x, 0.005, -halfD, x, 0.005, halfD);
    }

    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );

    const gridMat = new THREE.LineBasicMaterial({
      color: gridColor,
      transparent: true,
      opacity: gridBrightness,
    });

    const grid = new THREE.LineSegments(gridGeo, gridMat);
    this.scene.add(grid);
    this._meshes.push(grid);

    // Static physics plane (y = 0)
    const groundBody = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
    groundBody.addShape(new CANNON.Plane());
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);
    this._bodies.push(groundBody);
  }

  // ── Perimeter Walls ─────────────────────────────────────────

  /**
   * 4 enclosing walls (north/south/east/west).
   * Emissive neon panel materials matching Tron Legacy aesthetic.
   * Each wall gets a cannon-es Box shape in the WALL collision group.
   */
  createPerimeterWalls(width, depth, wallHeight) {
    const halfW = width / 2;
    const halfD = depth / 2;
    const halfH = wallHeight / 2;
    const wallThickness = 0.5;
    const halfT = wallThickness / 2;

    const neonIntensity = this.config.neonIntensity ?? 1.0;

    // Wall definitions: [sizeX, sizeY, sizeZ, posX, posY, posZ]
    const walls = [
      {
        name: 'north',
        size: [width, wallHeight, wallThickness],
        pos: [0, halfH, -halfD - halfT],
      },
      {
        name: 'south',
        size: [width, wallHeight, wallThickness],
        pos: [0, halfH, halfD + halfT],
      },
      {
        name: 'east',
        size: [wallThickness, wallHeight, depth],
        pos: [halfW + halfT, halfH, 0],
      },
      {
        name: 'west',
        size: [wallThickness, wallHeight, depth],
        pos: [-halfW - halfT, halfH, 0],
      },
    ];

    for (const wall of walls) {
      const [sx, sy, sz] = wall.size;
      const [px, py, pz] = wall.pos;

      // Visual mesh — emissive neon panels
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0a0a1a,
        emissive: 0x00ffff,
        emissiveIntensity: 0.15 * neonIntensity,
        roughness: 0.3,
        metalness: 0.8,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, pz);
      mesh.userData.wallName = wall.name;
      this.scene.add(mesh);
      this._meshes.push(mesh);

      // Emissive edge strip on top of each wall
      const stripHeight = 0.1;
      const stripGeo = new THREE.BoxGeometry(
        wall.name === 'east' || wall.name === 'west' ? wallThickness + 0.02 : sx + 0.02,
        stripHeight,
        wall.name === 'east' || wall.name === 'west' ? sz + 0.02 : wallThickness + 0.02
      );
      const stripMat = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 1.5 * neonIntensity,
        roughness: 0.1,
        metalness: 1.0,
      });
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.set(px, wallHeight + stripHeight / 2, pz);
      this.scene.add(strip);
      this._meshes.push(strip);

      // Bottom edge strip
      const bottomStrip = strip.clone();
      bottomStrip.material = stripMat.clone();
      bottomStrip.position.set(px, stripHeight / 2, pz);
      this.scene.add(bottomStrip);
      this._meshes.push(bottomStrip);

      // Physics body
      const shape = new CANNON.Box(
        new CANNON.Vec3(sx / 2, sy / 2, sz / 2)
      );
      const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
      body.addShape(shape);
      body.position.set(px, py, pz);
      body.collisionFilterGroup = COLLISION_GROUPS.WALL;
      body.collisionFilterMask = COLLISION_GROUPS.CYCLE;
      body.userData = { type: 'wall', name: wall.name };
      this.world.addBody(body);
      this._bodies.push(body);
    }
  }

  // ── Lighting ────────────────────────────────────────────────

  /**
   * Ambient + point lights for neon glow atmosphere.
   */
  createLighting(width, depth) {
    // Ambient — dim base illumination
    const ambient = new THREE.AmbientLight(0x111133, 0.3);
    this.scene.add(ambient);
    this._lights.push(ambient);

    // Hemisphere — subtle sky/ground differentiation
    const hemi = new THREE.HemisphereLight(0x1a1a3e, 0x000011, 0.4);
    this.scene.add(hemi);
    this._lights.push(hemi);

    // Point lights at arena corners for neon glow pools
    const cornerIntensity = Math.max(width, depth) * 0.8;
    const cornerDistance = Math.max(width, depth) * 1.2;
    const halfW = width / 2;
    const halfD = depth / 2;
    const lightY = this.wallHeight * 3;

    const cornerPositions = [
      [-halfW, lightY, -halfD],
      [halfW, lightY, -halfD],
      [-halfW, lightY, halfD],
      [halfW, lightY, halfD],
    ];

    for (const [cx, cy, cz] of cornerPositions) {
      const point = new THREE.PointLight(0x00ffff, cornerIntensity, cornerDistance);
      point.position.set(cx, cy, cz);
      this.scene.add(point);
      this._lights.push(point);
    }

    // Central overhead light — warm fill
    const centerLight = new THREE.PointLight(
      0x4444ff,
      cornerIntensity * 0.5,
      cornerDistance
    );
    centerLight.position.set(0, lightY * 1.5, 0);
    this.scene.add(centerLight);
    this._lights.push(centerLight);

    // Fog for depth/atmosphere
    const fogDensity = this.config.fogDensity ?? 0.01;
    this.scene.fog = new THREE.FogExp2(0x000011, fogDensity);
  }

  // ── Barriers ────────────────────────────────────────────────

  /**
   * Place barrier objects from level data (walls, buildings, structures).
   * Creates visual meshes and physics bodies. Slide on contact (not lethal).
   */
  placeBarriers(barriers) {
    for (const barrier of barriers) {
      const pos = { x: barrier.x, z: barrier.z, type: barrier.type };

      switch (barrier.type) {
        case 'wall':
          this._createBarrierWall(barrier);
          break;
        case 'building':
          this._createBarrierBuilding(barrier);
          break;
        case 'structure':
          this._createBarrierStructure(barrier);
          break;
      }

      this.barrierPositions.push(pos);
    }
  }

  _createBarrierWall(data) {
    const height = this.wallHeight;
    const geo = new THREE.BoxGeometry(1, height, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0a2a,
      emissive: 0x00ffff,
      emissiveIntensity: 0.2 * (this.config.neonIntensity ?? 1.0),
      roughness: 0.3,
      metalness: 0.7,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(data.x, height / 2, data.z);
    mesh.userData = { type: 'barrier', subtype: 'wall' };
    this.scene.add(mesh);
    this._meshes.push(mesh);

    const shape = new CANNON.Box(new CANNON.Vec3(0.5, height / 2, 0.5));
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
    body.addShape(shape);
    body.position.set(data.x, height / 2, data.z);
    body.collisionFilterGroup = COLLISION_GROUPS.BARRIER;
    body.collisionFilterMask = COLLISION_GROUPS.CYCLE;
    body.userData = { type: 'barrier', subtype: 'wall' };
    this.world.addBody(body);
    this._bodies.push(body);
  }

  _createBarrierBuilding(data) {
    const height = data.height ?? 2;
    const shape3D = data.shape ?? 'square';
    const neonIntensity = this.config.neonIntensity ?? 1.0;

    let geo;
    switch (shape3D) {
      case 'triangle':
        geo = new THREE.CylinderGeometry(0, 0.5, height, 3);
        break;
      case 'hexagon':
        geo = new THREE.CylinderGeometry(0.5, 0.5, height, 6);
        break;
      case 'square':
      default:
        geo = new THREE.BoxGeometry(1, height, 1);
        break;
    }

    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0a2a,
      emissive: 0x0088ff,
      emissiveIntensity: 0.25 * neonIntensity,
      roughness: 0.3,
      metalness: 0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(data.x, height / 2, data.z);
    mesh.userData = { type: 'barrier', subtype: 'building', shape: shape3D };
    this.scene.add(mesh);
    this._meshes.push(mesh);

    // Physics — always use a box approximation for simplicity
    const physShape = new CANNON.Box(new CANNON.Vec3(0.5, height / 2, 0.5));
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
    body.addShape(physShape);
    body.position.set(data.x, height / 2, data.z);
    body.collisionFilterGroup = COLLISION_GROUPS.BARRIER;
    body.collisionFilterMask = COLLISION_GROUPS.CYCLE;
    body.userData = { type: 'barrier', subtype: 'building' };
    this.world.addBody(body);
    this._bodies.push(body);
  }

  _createBarrierStructure(data) {
    const variant = data.variant ?? 'pylon';
    const neonIntensity = this.config.neonIntensity ?? 1.0;
    const height = 2;

    let geo;
    let emissiveColor;

    switch (variant) {
      case 'column':
        geo = new THREE.CylinderGeometry(0.3, 0.3, height, 12);
        emissiveColor = 0x00ffff;
        break;
      case 'obelisk':
        geo = new THREE.CylinderGeometry(0.15, 0.4, height, 4);
        emissiveColor = 0xff6600;
        break;
      case 'pylon':
      default:
        geo = new THREE.CylinderGeometry(0.15, 0.15, height, 8);
        emissiveColor = 0x00ff88;
        break;
    }

    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0a1a,
      emissive: emissiveColor,
      emissiveIntensity: 0.4 * neonIntensity,
      roughness: 0.2,
      metalness: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(data.x, height / 2, data.z);
    mesh.userData = { type: 'barrier', subtype: 'structure', variant };
    this.scene.add(mesh);
    this._meshes.push(mesh);

    const physShape = new CANNON.Box(new CANNON.Vec3(0.3, height / 2, 0.3));
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
    body.addShape(physShape);
    body.position.set(data.x, height / 2, data.z);
    body.collisionFilterGroup = COLLISION_GROUPS.BARRIER;
    body.collisionFilterMask = COLLISION_GROUPS.CYCLE;
    body.userData = { type: 'barrier', subtype: 'structure' };
    this.world.addBody(body);
    this._bodies.push(body);
  }

  // ── Game Objects (placeholder positions) ────────────────────

  /**
   * Place game objects from level data (boost pads, portals).
   * Creates visual placeholder markers and records positions.
   */
  placeGameObjects(gameObjects) {
    for (const obj of gameObjects) {
      const marker = this._createPlaceholderMarker(
        obj.x,
        obj.z,
        obj.type === 'boost_pad' ? 0xffff00 : (obj.pairColor ?? 0xff00ff),
        obj.type
      );
      marker.userData = { ...obj };
      this.gameObjectPositions.push({ ...obj, mesh: marker });
    }
  }

  // ── Power-ups (placeholder positions) ───────────────────────

  /**
   * Place power-ups from level data.
   * Creates colored placeholder markers by category.
   */
  placePowerups(powerups) {
    const categoryColors = {
      instant: 0x00ff66,
      level_permanent: 0x0088ff,
      equippable: 0xcc00ff,
    };

    for (const pu of powerups) {
      const color = categoryColors[pu.category] ?? 0xffffff;
      const marker = this._createPlaceholderMarker(pu.x, pu.z, color, pu.type);
      marker.userData = { ...pu };
      this.powerupPositions.push({ ...pu, mesh: marker });
    }
  }

  // ── Enemies (placeholder positions) ─────────────────────────

  /**
   * Place enemy spawn markers from level data.
   */
  placeEnemies(enemies) {
    for (const enemy of enemies) {
      const color =
        typeof enemy.color === 'string'
          ? parseInt(enemy.color.replace('#', ''), 16)
          : (enemy.color ?? 0xff6600);

      const marker = this._createPlaceholderMarker(
        enemy.x,
        enemy.z,
        color,
        'enemy'
      );
      marker.userData = { ...enemy };
      this.enemyPositions.push({ ...enemy, mesh: marker });
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  /**
   * Create a floating glowing marker to represent a placeholder position.
   * These will be replaced by full implementations (powerups.js, objects.js, etc.)
   */
  _createPlaceholderMarker(x, z, color, label) {
    const geo = new THREE.OctahedronGeometry(0.3, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 1.0,
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.8, z); // Float slightly above ground
    mesh.userData.placeholderType = label;
    this.scene.add(mesh);
    this._meshes.push(mesh);
    return mesh;
  }
}

// ── Wall Collision Response ───────────────────────────────────

/**
 * Compute wall slide response: speed reduction = sin(impactAngle) * currentSpeed.
 *
 * @param {THREE.Vector3} velocity - Current cycle velocity (mutated in place)
 * @param {THREE.Vector3} wallNormal - Outward normal of the wall surface
 * @param {number} currentSpeed - Current speed scalar
 * @returns {number} New speed after wall collision
 */
export function wallSlideResponse(velocity, wallNormal, currentSpeed) {
  if (currentSpeed < 0.001) return 0;

  const moveDir = velocity.clone().normalize();
  // Impact angle: angle between movement direction and wall surface.
  // dot with normal gives cos(angle-to-normal), so sin(impact) = |dot|
  const dot = Math.abs(moveDir.dot(wallNormal));
  const speedReduction = dot * currentSpeed; // sin(impactAngle) * currentSpeed
  const newSpeed = Math.max(0, currentSpeed - speedReduction);

  // Project velocity onto wall plane (slide along surface)
  const normalComponent = wallNormal.clone().multiplyScalar(velocity.dot(wallNormal));
  velocity.sub(normalComponent);

  // Rescale to new speed
  const slideLen = velocity.length();
  if (slideLen > 0.001) {
    velocity.multiplyScalar(newSpeed / slideLen);
  } else {
    velocity.set(0, 0, 0);
  }

  return newSpeed;
}
