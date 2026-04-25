/**
 * P6.4 — Properties panel: edit selected floor object or gate (plan § Editor Properties).
 */

import { floorObjectTopLeftLabel, setEditorObjectPlacement } from "./editorLevel.js";
import { getFloorObjectFootprint } from "./footprints.js";

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ENEMY_CATEGORIES = ["easy", "medium", "hard", "boss"];

/**
 * @typedef {{ type: "floor"; list: string; index: number } | { type: "gate"; index: number }} EditorPickLike
 */

/**
 * @param {HTMLElement} root
 * @param {{
 *   level: Record<string, unknown>;
 *   getSelection: () => EditorPickLike | null;
 *   onApply: () => void;
 *   beforeMutation?: () => void;
 * }} opts
 */
export function mountEditorPropertiesPanel(root, opts) {
  const { level, getSelection, onApply } = opts;
  const beforeMutation = opts.beforeMutation;

  root.classList.add("editor-props");
  root.innerHTML =
    '<p class="editor-props__empty">Select a floor object or gate to edit properties.</p>';

  function clampInt(n, lo, hi) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, v));
  }

  function clampFloat(n, lo, hi) {
    const v = Number(n);
    if (!Number.isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, v));
  }

  function appendSizeFields(wrap, list, o, fixedSize) {
    const fp = getFloorObjectFootprint(list, o);
    for (const [key, label, value] of [
      ["width", "Width", fp.width],
      ["depth", "Depth", fp.depth],
    ]) {
      const field = document.createElement("label");
      field.className = "editor-props__field";
      field.innerHTML = `<span class="editor-props__label">${label}${fixedSize ? " (fixed)" : ""}</span>`;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.step = "1";
      input.className = "editor-props__input";
      input.value = String(value);
      input.disabled = fixedSize;
      input.addEventListener("change", () => {
        beforeMutation?.();
        o[key] = clampInt(input.value, 1, 99);
        if (typeof o.gridX === "number" && typeof o.gridZ === "number") {
          setEditorObjectPlacement(level, list, o, o.gridX, o.gridZ);
        }
        input.value = String(o[key]);
        onApply();
      });
      input.addEventListener("keydown", (e) => e.stopPropagation());
      field.appendChild(input);
      wrap.appendChild(field);
    }
  }

  function sync() {
    const sel = getSelection();
    root.replaceChildren();

    if (!sel) {
      const p = document.createElement("p");
      p.className = "editor-props__empty";
      p.textContent = "Select a floor object or gate to edit properties.";
      root.appendChild(p);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "editor-props__inner";

    if (sel.type === "gate") {
      const wo = level.wallObjects;
      if (!Array.isArray(wo) || !wo[sel.index]) {
        const p = document.createElement("p");
        p.className = "editor-props__empty";
        p.textContent = "Gate not found.";
        root.appendChild(p);
        return;
      }
      const g = /** @type {Record<string, unknown>} */ (wo[sel.index]);
      const role = typeof g.role === "string" ? g.role : "?";
      const edge = typeof g.edge === "string" ? g.edge : "?";
      const pos = typeof g.position === "number" ? g.position : 0;
      const dest = g.destination;
      const signText = typeof g.signText === "string" ? g.signText : "";

      wrap.innerHTML = `
        <h3 class="editor-props__title">Gate</h3>
        <dl class="editor-props__dl">
          <div class="editor-props__row"><dt>Role</dt><dd>${escapeHtml(role)}</dd></div>
          <div class="editor-props__row"><dt>Edge</dt><dd>${escapeHtml(edge)}</dd></div>
          <div class="editor-props__row"><dt>Position</dt><dd>${escapeHtml(String(pos.toFixed(2)))} <span class="editor-props__hint">(drag gate on wall)</span></dd></div>
          <div class="editor-props__row"><dt>Destination</dt><dd>${dest == null ? "—" : escapeHtml(String(dest))}</dd></div>
        </dl>
      `;

      if (role === "exit") {
        const label = document.createElement("label");
        label.className = "editor-props__field";
        label.innerHTML = `<span class="editor-props__label">Exit sign text</span>`;
        const input = document.createElement("input");
        input.type = "text";
        input.className = "editor-props__input";
        input.value = signText;
        input.maxLength = 64;
        input.addEventListener("change", () => {
          beforeMutation?.();
          g.signText = input.value;
          onApply();
        });
        input.addEventListener("keydown", (e) => e.stopPropagation());
        label.appendChild(input);
        wrap.appendChild(label);
      } else {
        const ro = document.createElement("p");
        ro.className = "editor-props__ro";
        ro.textContent =
          role === "entrance"
            ? "Sign text is empty (entrance) — read-only."
            : "Sign text is fixed for this gate role — read-only.";
        wrap.appendChild(ro);
      }

      root.appendChild(wrap);
      return;
    }

    const list = sel.list;
    const arr = level[list];
    if (!Array.isArray(arr) || !arr[sel.index]) {
      const p = document.createElement("p");
      p.className = "editor-props__empty";
      p.textContent = "Object not found.";
      root.appendChild(p);
      return;
    }
    const raw = arr[sel.index];
    const o = /** @type {Record<string, unknown>} */ (raw);
    const fp = getFloorObjectFootprint(list, o);

    const title = document.createElement("h3");
    title.className = "editor-props__title";

    if (list === "barriers") {
      const t = o.type;
      title.textContent = `Barrier — ${t}`;
      wrap.appendChild(title);

      const xy = document.createElement("p");
      xy.className = "editor-props__ro";
      xy.textContent = `Top-left: ${floorObjectTopLeftLabel(level, list, o)} · footprint ${fp.width}x${fp.depth}`;
      wrap.appendChild(xy);

      if (t === "building" || t === "wall") {
        appendSizeFields(wrap, list, o, fp.fixedSize);
      }

      if (t === "building") {
        const shape = typeof o.shape === "string" ? o.shape : "square";
        const height = clampInt(o.height, 1, 5);

        const shLabel = document.createElement("label");
        shLabel.className = "editor-props__field";
        shLabel.innerHTML = `<span class="editor-props__label">Shape</span>`;
        const shSel = document.createElement("select");
        shSel.className = "editor-props__input";
        for (const opt of ["square", "triangle"]) {
          const op = document.createElement("option");
          op.value = opt;
          op.textContent = opt;
          if (opt === shape) op.selected = true;
          shSel.appendChild(op);
        }
        shSel.addEventListener("change", () => {
          beforeMutation?.();
          o.shape = shSel.value;
          onApply();
        });
        shSel.addEventListener("keydown", (e) => e.stopPropagation());
        shLabel.appendChild(shSel);
        wrap.appendChild(shLabel);

        const hLabel = document.createElement("label");
        hLabel.className = "editor-props__field";
        hLabel.innerHTML = `<span class="editor-props__label">Height (1–5)</span>`;
        const hIn = document.createElement("input");
        hIn.type = "number";
        hIn.min = "1";
        hIn.max = "5";
        hIn.step = "1";
        hIn.className = "editor-props__input";
        hIn.value = String(height);
        hIn.addEventListener("change", () => {
          beforeMutation?.();
          o.height = clampInt(hIn.value, 1, 5);
          hIn.value = String(o.height);
          onApply();
        });
        hIn.addEventListener("keydown", (e) => e.stopPropagation());
        hLabel.appendChild(hIn);
        wrap.appendChild(hLabel);
      } else if (t === "structure") {
        const variant = typeof o.variant === "string" ? o.variant : "pylon";
        const vLabel = document.createElement("label");
        vLabel.className = "editor-props__field";
        vLabel.innerHTML = `<span class="editor-props__label">Variant</span>`;
        const vSel = document.createElement("select");
        vSel.className = "editor-props__input";
        for (const opt of ["pylon", "column", "obelisk"]) {
          const op = document.createElement("option");
          op.value = opt;
          op.textContent = opt;
          if (opt === variant) op.selected = true;
          vSel.appendChild(op);
        }
        vSel.addEventListener("change", () => {
          beforeMutation?.();
          o.variant = vSel.value;
          onApply();
        });
        vSel.addEventListener("keydown", (e) => e.stopPropagation());
        vLabel.appendChild(vSel);
        wrap.appendChild(vLabel);
      } else {
        const note = document.createElement("p");
        note.className = "editor-props__ro";
        note.textContent = "Wall segments have no extra properties.";
        wrap.appendChild(note);
      }

      root.appendChild(wrap);
      return;
    }

    if (list === "gameObjects") {
      const typ = o.type;
      title.textContent = typ === "portal" ? "Portal" : "Boost pad";
      wrap.appendChild(title);

      const xy = document.createElement("p");
      xy.className = "editor-props__ro";
      xy.textContent = `Top-left: ${floorObjectTopLeftLabel(level, list, o)} · footprint ${fp.width}x${fp.depth}`;
      wrap.appendChild(xy);

      if (typ === "boost_pad") {
        appendSizeFields(wrap, list, o, fp.fixedSize);
      }

      if (typ === "portal") {
        const pid = typeof o.pairId === "string" ? o.pairId : "";
        const pcol = typeof o.pairColor === "string" ? o.pairColor : "";
        const rot = typeof o.rotation === "number" ? o.rotation : 0;

        const pairRo = document.createElement("p");
        pairRo.className = "editor-props__ro";
        pairRo.innerHTML = `<strong>Pair ID</strong> ${escapeHtml(pid)} · <strong>Color</strong> ${escapeHtml(pcol)}`;
        wrap.appendChild(pairRo);

        const rLabel = document.createElement("label");
        rLabel.className = "editor-props__field";
        rLabel.innerHTML = `<span class="editor-props__label">Rotation (rad)</span>`;
        const rIn = document.createElement("input");
        rIn.type = "number";
        rIn.step = "0.01";
        rIn.className = "editor-props__input";
        rIn.value = String(rot);
        rIn.addEventListener("change", () => {
          beforeMutation?.();
          o.rotation = clampFloat(rIn.value, -100, 100);
          onApply();
        });
        rIn.addEventListener("keydown", (e) => e.stopPropagation());
        rLabel.appendChild(rIn);
        wrap.appendChild(rLabel);
      } else {
        const note = document.createElement("p");
        note.className = "editor-props__ro";
        note.textContent = "Boost pads use default strength — no extra fields.";
        wrap.appendChild(note);
      }

      root.appendChild(wrap);
      return;
    }

    if (list === "powerups") {
      const ptype = typeof o.type === "string" ? o.type : "?";
      const cat = typeof o.category === "string" ? o.category : "?";
      title.textContent = `Power-up — ${ptype}`;
      wrap.appendChild(title);

      const meta = document.createElement("dl");
      meta.className = "editor-props__dl";
      meta.innerHTML = `
        <div class="editor-props__row"><dt>Category</dt><dd>${escapeHtml(cat)}</dd></div>
        <div class="editor-props__row"><dt>Top-left</dt><dd>${escapeHtml(floorObjectTopLeftLabel(level, list, o) ?? "?")}</dd></div>
        <div class="editor-props__row"><dt>Footprint</dt><dd>${fp.width}x${fp.depth} fixed</dd></div>
      `;
      wrap.appendChild(meta);

      const note = document.createElement("p");
      note.className = "editor-props__ro";
      note.textContent = "Type and category are fixed when placed.";
      wrap.appendChild(note);

      root.appendChild(wrap);
      return;
    }

    if (list === "enemies") {
      title.textContent = "Enemy";
      wrap.appendChild(title);

      const xy = document.createElement("p");
      xy.className = "editor-props__ro";
      xy.textContent = `Top-left: ${floorObjectTopLeftLabel(level, list, o)} · fixed footprint ${fp.width}x${fp.depth}`;
      wrap.appendChild(xy);

      const cLabel = document.createElement("label");
      cLabel.className = "editor-props__field";
      cLabel.innerHTML = `<span class="editor-props__label">Cycle color</span>`;
      const cIn = document.createElement("input");
      cIn.type = "color";
      cIn.className = "editor-props__input editor-props__input--color";
      const hex = typeof o.color === "string" && /^#/.test(o.color) ? o.color : "#ff6600";
      cIn.value = hex.length === 7 ? hex : "#ff6600";
      cIn.addEventListener("pointerdown", () => beforeMutation?.(), { capture: true });
      cIn.addEventListener("input", () => {
        o.color = cIn.value;
        onApply();
      });
      cIn.addEventListener("keydown", (e) => e.stopPropagation());
      cLabel.appendChild(cIn);
      wrap.appendChild(cLabel);

      const category = ENEMY_CATEGORIES.includes(String(o.category)) ? String(o.category) : "easy";
      o.category = category;
      const catLabel = document.createElement("label");
      catLabel.className = "editor-props__field";
      catLabel.innerHTML = `<span class="editor-props__label">Category</span>`;
      const catSel = document.createElement("select");
      catSel.className = "editor-props__input";
      for (const opt of ENEMY_CATEGORIES) {
        const op = document.createElement("option");
        op.value = opt;
        op.textContent = opt;
        if (opt === category) op.selected = true;
        catSel.appendChild(op);
      }
      catSel.addEventListener("change", () => {
        beforeMutation?.();
        o.category = catSel.value;
        onApply();
      });
      catSel.addEventListener("keydown", (e) => e.stopPropagation());
      catLabel.appendChild(catSel);
      wrap.appendChild(catLabel);

      const rLabel = document.createElement("label");
      rLabel.className = "editor-props__field";
      rLabel.innerHTML = `<span class="editor-props__label">Facing (rad)</span>`;
      const rIn = document.createElement("input");
      rIn.type = "number";
      rIn.step = "0.01";
      rIn.className = "editor-props__input";
      const r0 = typeof o.rotation === "number" ? o.rotation : 0;
      rIn.value = String(r0);
      rIn.addEventListener("change", () => {
        beforeMutation?.();
        o.rotation = clampFloat(rIn.value, -100, 100);
        onApply();
      });
      rIn.addEventListener("keydown", (e) => e.stopPropagation());
      rLabel.appendChild(rIn);
      wrap.appendChild(rLabel);

      root.appendChild(wrap);
      return;
    }

    title.textContent = "Selection";
    wrap.appendChild(title);
    const p = document.createElement("p");
    p.className = "editor-props__ro";
    p.textContent = "No property editor for this object type.";
    wrap.appendChild(p);
    root.appendChild(wrap);
  }

  return {
    sync,
    dispose() {
      root.classList.remove("editor-props");
      root.replaceChildren();
    },
  };
}
