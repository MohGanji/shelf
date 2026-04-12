/**
 * Re-export Three.js from a full URL so ES modules work without import maps
 * (e.g. file://, embeds, or environments that skip document import maps).
 * Keep version aligned with index.html preload / three/addons paths.
 */
export * from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
