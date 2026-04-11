/**
 * Post-processing stub — real EffectComposer stack lands in P9.1.
 * Pass-through render keeps the render loop stable for early phases.
 */

/**
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera
 */
export function createPostPipeline(renderer, scene, camera) {
  return {
    /** @param {number} w @param {number} h */
    setSize(w, h) {
      renderer.setSize(w, h, false);
    },
    render() {
      renderer.render(scene, camera);
    },
    dispose() {},
  };
}
