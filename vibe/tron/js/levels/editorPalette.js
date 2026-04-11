/**
 * P6.2 — Level editor block palette: six floor-object categories + wall-object edge hint.
 * Selection is stored for P6.3 placement / properties wiring.
 */

/**
 * @typedef {{
 *   category: "barrier" | "game_object" | "powerup" | "enemy";
 *   kind: string;
 *   meta?: Record<string, unknown>;
 * }} EditorPaletteSelection
 */

/**
 * @param {HTMLElement} root
 * @param {{ onSelectionChange?: (sel: EditorPaletteSelection | null) => void }} [opts]
 * @returns {{
 *   getSelection: () => EditorPaletteSelection | null;
 *   dispose: () => void;
 * }}
 */
export function mountEditorPalette(root, opts) {
  const onSelectionChange = opts?.onSelectionChange;

  /** @type {EditorPaletteSelection | null} */
  let selection = null;

  root.classList.add("editor-palette");
  root.innerHTML = `
    <div class="editor-palette__header">
      <span class="editor-palette__header-title">Palette</span>
      <span class="editor-palette__header-sub">Floor objects — click to arm (placement: P6.3)</span>
    </div>
    <div class="editor-palette__scroll" role="tabpanel" aria-label="Block categories">
      ${renderCategory("Barriers", "barrier", [
        { label: "Wall", kind: "wall" },
        { label: "Building — square", kind: "building", meta: { shape: "square" } },
        { label: "Building — triangle", kind: "building", meta: { shape: "triangle" } },
        { label: "Building — hex", kind: "building", meta: { shape: "hexagon" } },
        { label: "Structure — pylon", kind: "structure", meta: { variant: "pylon" } },
        { label: "Structure — column", kind: "structure", meta: { variant: "column" } },
        { label: "Structure — obelisk", kind: "structure", meta: { variant: "obelisk" } },
      ])}
      ${renderCategory("Game objects", "game_object", [
        { label: "Boost pad", kind: "boost_pad" },
        { label: "Portal", kind: "portal" },
      ])}
      ${renderCategory("Instant power-ups", "powerup", [
        { label: "Nitro Recharge", kind: "nitro_recharge", meta: { category: "instant" } },
      ])}
      ${renderCategory("Level-permanent", "powerup", [
        { label: "Trail Extend", kind: "trail_extend", meta: { category: "level_permanent" } },
        { label: "Nitro Capacity+", kind: "nitro_capacity", meta: { category: "level_permanent" } },
      ])}
      ${renderCategory("Equippable", "powerup", [
        { label: "Shield", kind: "shield", meta: { category: "equippable" } },
      ])}
      ${renderCategory("Enemy", "enemy", [{ label: "Enemy spawn", kind: "enemy" }])}
    </div>
    <div class="editor-palette__edge" aria-label="Wall objects">
      <div class="editor-palette__edge-title">Wall objects</div>
      <p class="editor-palette__edge-body">
        Gates and cosmetic wall panels are <strong>not</strong> in this palette. Use the arena
        <strong>edge</strong> (perimeter click) to open placement options — wiring lands in P6.3.
      </p>
    </div>
  `;

  /** @param {string} title @param {EditorPaletteSelection["category"]} category @param {{ label: string; kind: string; meta?: Record<string, unknown> }[]} items */
  function renderCategory(title, category, items) {
    const buttons = items
      .map((it, idx) => {
        const id = `pal-${category}-${idx}-${it.kind}`.replace(/[^a-z0-9-]/gi, "-");
        const metaEnc = encodeURIComponent(JSON.stringify(it.meta ?? {}));
        return `<button type="button" class="editor-palette__tile" id="${id}" data-palette-cat="${category}" data-palette-kind="${escapeAttr(
          it.kind,
        )}" data-palette-meta="${metaEnc}">${escapeHtml(it.label)}</button>`;
      })
      .join("");
    return `
      <section class="editor-palette__cat">
        <h3 class="editor-palette__cat-title">${escapeHtml(title)}</h3>
        <div class="editor-palette__tiles">${buttons}</div>
      </section>
    `;
  }

  /** @param {string} s */
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /** @param {string} s */
  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  function setActiveButton(active) {
    root.querySelectorAll(".editor-palette__tile").forEach((el) => {
      el.classList.toggle("editor-palette__tile--active", el === active);
    });
  }

  /** @param {MouseEvent} e */
  function onClick(e) {
    const t = /** @type {HTMLElement | null} */ (e.target?.closest?.("[data-palette-cat]"));
    if (!t) return;
    const cat = /** @type {EditorPaletteSelection["category"]} */ (t.getAttribute("data-palette-cat"));
    const kind = t.getAttribute("data-palette-kind") ?? "";
    let meta = {};
    const raw = t.getAttribute("data-palette-meta");
    if (raw) {
      try {
        meta = JSON.parse(decodeURIComponent(raw)) || {};
      } catch {
        meta = {};
      }
    }
    if (selection && selection.category === cat && selection.kind === kind && JSON.stringify(selection.meta ?? {}) === JSON.stringify(meta)) {
      selection = null;
      setActiveButton(null);
      onSelectionChange?.(null);
      return;
    }
    selection = { category: cat, kind, meta: Object.keys(meta).length ? meta : undefined };
    setActiveButton(t);
    onSelectionChange?.(selection);
  }

  root.addEventListener("click", onClick);

  return {
    getSelection: () => selection,
    dispose() {
      root.removeEventListener("click", onClick);
      root.classList.remove("editor-palette");
      root.innerHTML = "";
      selection = null;
    },
  };
}
