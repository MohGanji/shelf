/**
 * Save data management for Tron: Light Cycles.
 * Handles load/save/reset of player progress in localStorage.
 */

const SAVE_KEY = 'tron-light-cycles-save';
const SAVE_VERSION = 1;

function createDefaultSaveData() {
  return {
    version: SAVE_VERSION,
    player: {
      cycleColor: '#00FFFF',
      trailColor: '#00FFFF',
      attributes: {
        speed: 1,
        acceleration: 1,
        trailLength: 1,
        nitroBars: 1,
        handling: 1,
      },
    },
    progress: {
      currentLevel: 1,
      completedLevels: [0],
      coins: 0,
      totalCoinsEarned: 0,
    },
    cosmetics: {
      ownedCycleColors: ['#00FFFF'],
      ownedTrailColors: ['#00FFFF'],
    },
    settings: {
      masterVolume: 1.0,
      musicVolume: 0.7,
      sfxVolume: 1.0,
      ambientVolume: 0.5,
    },
    devHud: {
      bloomIntensity: 1.5,
      bloomThreshold: 0.3,
      chromaticAberration: 0.002,
      crtScanlines: false,
      gridBrightness: 0.4,
      neonIntensity: 1.0,
      fogDensity: 0.01,
      trailOpacity: 0.8,
      trailFadeSpeed: 1.0,
      defaultTrailLength: 40,
      trailExtendAmount: 10,
      nitroCapacityPlusAmount: 1,
      nitroBurstDuration: 0.5,
      nitroSpeedReturnTime: 0.25,
      shieldDeployTime: 0.15,
      coinOverlayDuration: 3.0,
      minimumArenaSize: 40,
      trailImmunitySegments: 4,
      portalExitImmunityDuration: 0.15,
      nitroMaxSpeedMultiplier: 1.2,
      shieldSlowdownPercent: 0.3,
      cycleTiltMax: 0.3,
      cyclePitchOnAccel: true,
      cycleLeanOnBrake: true,
      nitroFovWiden: true,
      nitroCameraPullBack: true,
      nitroSpeedLines: true,
      nitroMotionBlur: true,
      nitroHandlingMultiplier: 0.6,
      derezSlowMo: true,
      derezCameraOverhead: true,
      derezCameraShake: true,
      derezGlitchFlash: true,
      portalWarpIntensity: 0.5,
      specialObjectCooldown: 5.0,
      shieldDuration: 5.0,
      nitroBarRechargeTime: 5.0,
      powerupRespawnTime: 10.0,
      boostPadStrength: 1.0,
      lowSpeedThreshold: 10,
      cycleFriction: 0.98,
      brakeDeceleration: 40,
      enginePitch: 1.0,
      nearMissDistance: 1.5,
      gearShiftCount: 5,
      aiAggression: 1.0,
      aiReactionTime: 0.5,
      aiAvoidanceRange: 5.0,
      steeringSpeedFalloff: 0.02,
      wallHeight: 3.0,
      musicCrossfadeDuration: 1.0,
      cameraDistance: 8,
      cameraHeight: 4,
      cameraLookAhead: 3,
      cameraDamping: 0.08,
      cameraTurnOffset: 1.5,
    },
    controlsShown: false,
  };
}

/**
 * Load save data from localStorage. Creates default if none exists.
 * Handles version migration if save format changes.
 */
export function loadSaveData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      const data = createDefaultSaveData();
      saveSaveData(data);
      return data;
    }

    const parsed = JSON.parse(raw);

    // Version check — migrate if needed in the future
    if (!parsed.version || parsed.version < SAVE_VERSION) {
      const fresh = createDefaultSaveData();
      saveSaveData(fresh);
      return fresh;
    }

    // Backfill any missing keys from defaults (handles save data from older builds)
    const defaults = createDefaultSaveData();
    const merged = deepMergeDefaults(parsed, defaults);
    return merged;
  } catch (e) {
    console.warn('Failed to load save data, creating fresh:', e);
    const data = createDefaultSaveData();
    saveSaveData(data);
    return data;
  }
}

/**
 * Save current data to localStorage.
 */
export function saveSaveData(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save data:', e);
  }
}

/**
 * Reset all save data to defaults.
 */
export function resetSaveData() {
  const data = createDefaultSaveData();
  saveSaveData(data);
  return data;
}

/**
 * Recursively merge defaults into target, adding missing keys
 * without overwriting existing values.
 */
function deepMergeDefaults(target, defaults) {
  const result = { ...target };
  for (const key of Object.keys(defaults)) {
    if (!(key in result)) {
      result[key] = defaults[key];
    } else if (
      typeof defaults[key] === 'object' &&
      defaults[key] !== null &&
      !Array.isArray(defaults[key]) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMergeDefaults(result[key], defaults[key]);
    }
  }
  return result;
}
