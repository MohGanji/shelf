/**
 * Vibe Jam 2026 webring: lobby south gate → hub redirect, optional return to `?ref=` when arriving with `?portal=true`.
 */

import * as THREE from "../vendor/three-module.js";

const VJ_HUB = "https://vibejam.cc/portal/2026";

/**
 * @returns {boolean}
 */
export function isVibeJamPortalArrival() {
  const v = new URLSearchParams(window.location.search).get("portal");
  return v === "true" || v === "1";
}

/**
 * Raw `ref` query (previous game URL), if any.
 * @returns {string | null}
 */
export function getVibeJamRefParam() {
  return new URLSearchParams(window.location.search).get("ref");
}

/**
 * Canonical ref for *this* game (for webring `ref=`). No search string.
 * @returns {string}
 */
export function getVibeJamGameRefUrl() {
  const path = window.location.pathname.replace(/\/$/, "");
  return `${window.location.origin}${path === "" ? "/" : path}`;
}

/**
 * @param {{ save: import("../data/savedata.js").PlayerSave; playerBody: import("cannon-es").Body }} opts
 * @returns {string}
 */
export function buildVibeJamExitToHubUrl(opts) {
  const { save, playerBody } = opts;
  const out = new URLSearchParams();
  const inc = new URLSearchParams(window.location.search);
  for (const [k, v] of inc) {
    if (k === "ref") continue;
    out.append(k, v);
  }
  out.set("portal", "true");
  out.set("ref", getVibeJamGameRefUrl());
  const col = (save?.player?.cycleColor || "#00FFFF").replace(/^#/, "");
  out.set("color", col);
  const sp = Math.hypot(playerBody.velocity.x, playerBody.velocity.z);
  out.set("speed", String(Math.round(sp * 1000) / 1000));
  if (![...out.keys()].includes("username")) out.set("username", "rider");
  return `${VJ_HUB}?${out.toString()}`;
}

/**
 * @param {string | null | undefined} refParam
 * @param {{ save: import("../data/savedata.js").PlayerSave; playerBody: import("cannon-es").Body }} opts
 * @returns {string}
 */
export function buildVibeJamReturnToRefUrl(refParam, opts) {
  const { save, playerBody } = opts;
  let base = (refParam || "").trim();
  if (!base) return buildVibeJamExitToHubUrl(opts);
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  const out = new URLSearchParams();
  const inc = new URLSearchParams(window.location.search);
  for (const [k, v] of inc) {
    if (k === "ref") continue;
    out.append(k, v);
  }
  out.set("portal", "true");
  out.set("ref", getVibeJamGameRefUrl());
  const col = (save?.player?.cycleColor || "#00FFFF").replace(/^#/, "");
  out.set("color", col);
  const sp = Math.hypot(playerBody.velocity.x, playerBody.velocity.z);
  out.set("speed", String(Math.round(sp * 1000) / 1000));
  if (![...out.keys()].includes("username")) out.set("username", "rider");
  const q = out.toString();
  return base + (base.includes("?") ? "&" : "?") + q;
}

/**
 * Optional torus + disc at the south webring gate when arriving from another game (return path).
 * @param {THREE.Group} gateGroup
 */
export function attachVibeJamReturnPortalVfx(gateGroup) {
  const w = 5;
  const tor = new THREE.Mesh(
    new THREE.TorusGeometry(w * 0.42, 0.22, 10, 48),
    new THREE.MeshStandardMaterial({
      color: 0xff2266,
      emissive: 0xff0044,
      emissiveIntensity: 1.1,
      metalness: 0.2,
      roughness: 0.45,
      transparent: true,
      opacity: 0.88,
    }),
  );
  tor.rotation.x = Math.PI / 2;
  tor.position.set(0, 1.15, 0.95);
  gateGroup.add(tor);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(w * 0.36, 32),
    new THREE.MeshBasicMaterial({
      color: 0xff1155,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0, 1.12, 0.96);
  gateGroup.add(disc);

  gateGroup.userData.vibejamReturnVfx = { tor, disc };
}
