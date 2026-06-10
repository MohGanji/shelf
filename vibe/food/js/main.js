import { FOODS } from "./data.js";
import { searchProducts } from "./off.js";
import { axisScores, dayScores, combine, rdaPct, VITAMINS, MINERALS, AXES } from "./score.js";
import { hexSVG, catAbbr, fmt } from "./hexcard.js";
import { loadMeals, saveMeals, loadProfile, saveProfile, PRESETS } from "./store.js";

const $ = (sel) => document.querySelector(sel);

const state = {
  tab: "ing", // ing | off | meals
  query: { ing: "", off: "", meals: "" },
  axisFilter: null, // "PRO" | "CAR" | "FAT" | "FIB" | "VIT" | "MIN" | null
  offResults: [],
  offStatus: "idle", // idle | loading | error | done
  selected: [null, null], // [primary, compare]
  pinned: false,
  meals: loadMeals(),
  profile: loadProfile(),
  dayMode: false,
  builder: null, // {id, name, parts:[{food, grams}], query}
};

let offAbort = null;
let refs = new Map(); // list item ref -> food object

// phone: the results list is a dropdown over the stage; open while picking, close on selection
const phone = window.matchMedia("(max-width: 760px)");

function setListOpen(open) {
  document.querySelector(".panel").classList.toggle("open", open);
}

// ---------- selection ----------

function select(item) {
  const sel = { item, portion: item.cat === "meal" ? item.weight : 100 };
  if (state.pinned && state.selected[0] && state.selected[0].item !== item) {
    state.selected[1] = sel;
  } else {
    state.selected = [sel, null];
    state.pinned = false;
  }
  renderStage();
  renderList();
  if (phone.matches) {
    setListOpen(false);
    $("#search").blur();
    $("#stage").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ---------- meals as items ----------

function mealAsItem(meal) {
  const { per100, weight } = combine(meal.parts.map((p) => ({ food: p.food, grams: p.grams })));
  return { name: meal.name, cat: "meal", source: "meal", id: meal.id, parts: meal.parts, weight: Math.round(weight), ...per100 };
}

// ---------- list panel ----------

function listRow(food, ref, axisScore) {
  const sel = state.selected.some((s) => s && s.item === food);
  const kcal = food.kcal !== undefined ? `${Math.round(food.kcal)} kcal` : "";
  const axis = axisScore !== undefined ? `<span class="row-axis">${axisScore}</span>` : "";
  return `<button class="row${sel ? " sel" : ""}" data-ref="${ref}">
    <span class="row-cat">${catAbbr(food.cat)}</span>
    <span class="row-name">${food.name}</span>
    ${axis}<span class="row-kcal">${kcal}</span>
  </button>`;
}

// when an axis filter is on: keep items genuinely heavy in that nutrient, strongest first
function applyAxisFilter(items) {
  if (!state.axisFilter) return items.slice(0, 60).map((f) => ({ f }));
  return items
    .map((f) => ({ f, score: axisScores(f)[state.axisFilter] }))
    .filter((x) => x.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 60);
}

function renderList() {
  const el = $("#results");
  refs = new Map();
  let html = "";
  let candidates = null;
  if (state.tab === "ing") {
    const q = state.query.ing.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    candidates = FOODS.filter((f) => words.every((w) => f.name.toLowerCase().includes(w)));
  } else if (state.tab === "off") {
    if (state.offStatus === "loading") html = `<div class="hint">searching Open Food Facts…</div>`;
    else if (state.offStatus === "error") html = `<div class="hint">Open Food Facts search failed — check your connection and try again</div>`;
    else if (state.offStatus === "idle") html = `<div class="hint">search packaged products live from Open Food Facts — the same database Yuka uses</div>`;
    else candidates = state.offResults;
  } else {
    if (!state.meals.length) html = `<div class="hint">no saved meals yet — combine ingredients into a dish and it gets its own hex</div>`;
    else {
      const mq = state.query.meals.trim().toLowerCase();
      candidates = state.meals.filter((m) => !mq || m.name.toLowerCase().includes(mq)).map(mealAsItem);
    }
  }
  if (candidates) {
    const rows = applyAxisFilter(candidates);
    rows.forEach(({ f, score }, i) => {
      refs.set(`r${i}`, f);
      html += listRow(f, `r${i}`, score);
    });
    if (!rows.length) {
      html = state.axisFilter
        ? `<div class="hint">nothing here is heavy in ${state.axisFilter} — clear the filter or broaden the search</div>`
        : `<div class="hint">no matches</div>`;
    }
  }
  el.innerHTML = html;
  document.querySelectorAll(".afilter").forEach((b) => b.classList.toggle("on", b.dataset.axis === state.axisFilter));
  $("#search").placeholder =
    state.tab === "ing" ? `search ${FOODS.length} USDA ingredients…` : state.tab === "off" ? "search packaged products (press Enter)…" : "your saved meals";
  $("#search").value = state.query[state.tab];
  $("#new-meal").hidden = state.tab !== "meals";
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === state.tab));
}

// ---------- stage / cards ----------

function nutrientsFor(sel) {
  return sel.item; // both bundled foods and meal items carry per-100g values directly
}

function scoresFor(sel) {
  const n = nutrientsFor(sel);
  return state.dayMode && state.profile ? dayScores(n, sel.portion, state.profile) : axisScores(n);
}

function statRows(n, portion) {
  const f = portion / 100;
  const rows = [
    ["Calories", n.kcal !== undefined ? Math.round(n.kcal * f) + " kcal" : "–"],
    ["Protein", fmt(n.protein * f) + " g"],
    ["Carbs", fmt(n.carbs * f) + " g"],
    ["· sugar", n.sugar !== undefined ? fmt(n.sugar * f) + " g" : "–"],
    ["Fat", fmt(n.fat * f) + " g"],
    ["· saturated", n.satfat !== undefined ? fmt(n.satfat * f) + " g" : "–"],
    ["Fiber", n.fiber !== undefined ? fmt(n.fiber * f) + " g" : "–"],
    ["Sodium", n.sodium !== undefined ? fmt(n.sodium * f, 0) + " mg" : "–"],
    ["Vitamins", fmt(rdaPct(n, VITAMINS) * f, 0) + "% RDA"],
    ["Minerals", fmt(rdaPct(n, MINERALS) * f, 0) + "% RDA"],
  ];
  return rows.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join("");
}

function badges(item) {
  const out = [];
  if (item.nutriscore) out.push(`<span class="badge ns ns-${item.nutriscore}">Nutri-Score ${item.nutriscore.toUpperCase()}</span>`);
  if (item.nova) out.push(`<span class="badge nova nova-${item.nova}">NOVA ${item.nova}</span>`);
  if (item.additives !== null && item.additives !== undefined) out.push(`<span class="badge">${item.additives} additive${item.additives === 1 ? "" : "s"}</span>`);
  if (item.source === "off" && !item.hasMicros) out.push(`<span class="badge dim">no micro data — VIT/MIN unscored</span>`);
  return out.length ? `<div class="badges">${out.join("")}</div>` : "";
}

function partsList(item) {
  if (item.cat !== "meal") return "";
  const rows = item.parts.map((p) => `<div class="stat"><span>${p.food.name}</span><b>${p.grams} g</b></div>`).join("");
  return `<div class="parts"><div class="parts-title">ingredients · ${item.weight} g total</div>${rows}
    <div class="meal-actions"><button class="ghost" data-edit-meal="${item.id}">edit</button><button class="ghost danger" data-del-meal="${item.id}">delete</button></div></div>`;
}

function cardHTML(sel, slot, single) {
  const item = sel.item;
  const scores = scoresFor(sel);
  const pinBtn =
    slot === 0
      ? `<button class="pin${state.pinned ? " on" : ""}" id="pin" title="pin to compare with another item">${state.pinned ? "pinned — pick a rival" : "⚔ compare"}</button>`
      : `<button class="pin" id="unpin" title="remove">✕</button>`;
  return `<article class="card slot${slot}">
    <header class="card-head">
      <div class="card-kcal"><b>${item.kcal !== undefined ? Math.round(item.kcal) : "?"}</b><span>kcal/100g</span></div>
      <div class="card-pos">${catAbbr(item.cat)}</div>
      ${pinBtn}
    </header>
    <h2 class="card-name">${item.name}</h2>
    ${badges(item)}
    ${single ? hexSVG(scores) : ""}
    <div class="portion">
      <label>portion <input type="number" min="1" max="2000" step="5" value="${sel.portion}" data-portion="${slot}"> g</label>
    </div>
    <div class="stats">${statRows(item, sel.portion)}</div>
    ${partsList(item)}
  </article>`;
}

function renderStage() {
  const el = $("#stage");
  const [a, b] = state.selected;
  if (!a) {
    el.innerHTML = `<div class="empty">
      <div class="empty-hex">${hexSVG({ PRO: 70, CAR: 45, FAT: 30, FIB: 60, VIT: 80, MIN: 55 })}</div>
      <p>pick an ingredient, product, or meal to see its stat card —<br>like a player card, but for food.</p>
    </div>`;
    return;
  }
  const modeBar = state.profile
    ? `<div class="modebar">
        <button class="mode${!state.dayMode ? " on" : ""}" data-mode="100">per 100 g</button>
        <button class="mode${state.dayMode ? " on" : ""}" data-mode="day">% of my day</button>
      </div>`
    : "";
  if (a && b) {
    const sA = scoresFor(a);
    const sB = scoresFor(b);
    el.innerHTML = `${modeBar}
      <div class="versus">
        <div class="legend"><span class="dot a"></span>${a.item.name}<span class="vs">vs</span><span class="dot b"></span>${b.item.name}</div>
        ${hexSVG(sA, sB, 320)}
      </div>
      <div class="duo">${cardHTML(a, 0, false)}${cardHTML(b, 1, false)}</div>`;
  } else {
    el.innerHTML = `${modeBar}<div class="solo">${cardHTML(a, 0, true)}</div>`;
  }
}

// ---------- meal builder ----------

function renderBuilder() {
  const panel = $("#builder");
  if (!state.builder) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const b = state.builder;
  const q = (b.query || "").trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const hits = q ? FOODS.filter((f) => words.every((w) => f.name.toLowerCase().includes(w))).slice(0, 8) : [];
  const hitRows = hits
    .map((f, i) => `<button class="row" data-add="${i}"><span class="row-cat">${catAbbr(f.cat)}</span><span class="row-name">${f.name}</span></button>`)
    .join("");
  b._hits = hits;
  const parts = b.parts
    .map(
      (p, i) => `<div class="part-row">
        <span class="row-name">${p.food.name}</span>
        <input type="number" min="1" max="2000" step="5" value="${p.grams}" data-grams="${i}">
        <span class="unit">g</span>
        <button class="ghost danger" data-rm="${i}">✕</button>
      </div>`
    )
    .join("");
  const { per100, weight } = combine(b.parts);
  const preview = b.parts.length
    ? `<div class="builder-preview">${hexSVG(axisScores(per100), null, 220)}
       <div class="hint">${Math.round(weight)} g · ${Math.round((per100.kcal || 0) * (weight / 100))} kcal total</div></div>`
    : `<div class="builder-preview"><div class="hint">add ingredients to see the dish hex form</div></div>`;
  panel.innerHTML = `<div class="builder-inner">
    <header><h3>${b.id ? "edit meal" : "new meal"}</h3><button class="ghost" id="builder-close">✕</button></header>
    <input id="meal-name" type="text" placeholder="meal name (e.g. salmon avocado bowl)" value="${b.name || ""}">
    <input id="meal-search" type="text" placeholder="add ingredient…" value="${b.query || ""}">
    <div class="builder-hits">${hitRows}</div>
    <div class="builder-parts">${parts}</div>
    ${preview}
    <button id="meal-save" class="primary" ${b.parts.length && (b.name || "").trim() ? "" : "disabled"}>save meal</button>
  </div>`;
  const search = $("#meal-search");
  if (b._focusSearch) {
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
    b._focusSearch = false;
  }
}

function saveBuilderMeal() {
  const b = state.builder;
  const meal = {
    id: b.id || "m" + Date.now().toString(36),
    name: b.name.trim(),
    parts: b.parts.map((p) => ({ food: p.food, grams: p.grams })),
  };
  const idx = state.meals.findIndex((m) => m.id === meal.id);
  if (idx >= 0) state.meals[idx] = meal;
  else state.meals.push(meal);
  saveMeals(state.meals);
  state.builder = null;
  state.tab = "meals";
  renderBuilder();
  renderList();
  select(mealAsItem(meal));
}

// ---------- profile ----------

function renderProfile() {
  const panel = $("#profile-panel");
  if (panel.hidden) return;
  const p = state.profile;
  const presetBtns = Object.entries(PRESETS)
    .map(([k, v]) => `<button class="chip" data-preset="${k}">${v.label}</button>`)
    .join("");
  const fields = ["kcal", "protein", "carbs", "fat", "fiber"]
    .map(
      (k) => `<label class="pfield">${k}${k === "kcal" ? "" : " (g)"}
        <input type="number" min="0" data-target="${k}" value="${p ? p[k] : ""}" placeholder="–"></label>`
    )
    .join("");
  panel.querySelector(".profile-inner").innerHTML = `
    <header><h3>my diet profile</h3><button class="ghost" id="profile-close">✕</button></header>
    <p class="hint">set daily targets, then flip any card to “% of my day” to see how a portion covers your needs. VIT/MIN axes use standard RDAs.</p>
    <div class="chips">${presetBtns}</div>
    <div class="pfields">${fields}</div>
    <div class="meal-actions">
      <button id="profile-save" class="primary">save profile</button>
      ${p ? '<button id="profile-clear" class="ghost danger">remove profile</button>' : ""}
    </div>`;
}

function readProfileFields() {
  const out = {};
  for (const inp of document.querySelectorAll("[data-target]")) {
    const v = Number(inp.value);
    if (!v || v <= 0) return null;
    out[inp.dataset.target] = v;
  }
  return out;
}

// ---------- events ----------

function bind() {
  $("#tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    state.tab = t.dataset.tab;
    setListOpen(true);
    renderList();
  });

  $("#axis-filters").addEventListener("click", (e) => {
    const b = e.target.closest(".afilter");
    if (!b) return;
    state.axisFilter = state.axisFilter === b.dataset.axis ? null : b.dataset.axis;
    setListOpen(true);
    renderList();
  });

  $("#search").addEventListener("focus", () => setListOpen(true));

  $("#search").addEventListener("input", (e) => {
    state.query[state.tab] = e.target.value;
    setListOpen(true);
    if (state.tab !== "off") renderList();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".panel")) setListOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setListOpen(false);
  });

  $("#search").addEventListener("keydown", async (e) => {
    if (e.key !== "Enter" || state.tab !== "off") return;
    const q = state.query.off.trim();
    if (!q) return;
    if (offAbort) offAbort.abort();
    offAbort = new AbortController();
    state.offStatus = "loading";
    renderList();
    try {
      state.offResults = await searchProducts(q, offAbort.signal);
      state.offStatus = "done";
    } catch (err) {
      if (err.name === "AbortError") return;
      state.offStatus = "error";
    }
    renderList();
  });

  $("#results").addEventListener("click", (e) => {
    const row = e.target.closest(".row");
    if (row && refs.has(row.dataset.ref)) select(refs.get(row.dataset.ref));
  });

  $("#new-meal").addEventListener("click", () => {
    state.builder = { name: "", parts: [], query: "" };
    renderBuilder();
  });

  $("#stage").addEventListener("click", (e) => {
    if (e.target.id === "pin") {
      state.pinned = !state.pinned;
      if (!state.pinned) state.selected[1] = null;
      renderStage();
    } else if (e.target.id === "unpin") {
      state.selected[1] = null;
      state.pinned = false;
      renderStage();
      renderList();
    } else if (e.target.dataset.mode) {
      state.dayMode = e.target.dataset.mode === "day";
      renderStage();
    } else if (e.target.dataset.editMeal) {
      const meal = state.meals.find((m) => m.id === e.target.dataset.editMeal);
      if (meal) {
        state.builder = { id: meal.id, name: meal.name, parts: meal.parts.map((p) => ({ ...p })), query: "" };
        renderBuilder();
      }
    } else if (e.target.dataset.delMeal) {
      state.meals = state.meals.filter((m) => m.id !== e.target.dataset.delMeal);
      saveMeals(state.meals);
      state.selected = [null, null];
      state.pinned = false;
      renderStage();
      renderList();
    }
  });

  $("#stage").addEventListener("change", (e) => {
    if (e.target.dataset.portion !== undefined) {
      const slot = Number(e.target.dataset.portion);
      const v = Math.max(1, Number(e.target.value) || 100);
      if (state.selected[slot]) {
        state.selected[slot].portion = v;
        renderStage();
      }
    }
  });

  $("#builder").addEventListener("click", (e) => {
    const b = state.builder;
    if (!b) return;
    if (e.target.id === "builder-close") {
      state.builder = null;
      renderBuilder();
    } else if (e.target.closest("[data-add]")) {
      const f = b._hits[Number(e.target.closest("[data-add]").dataset.add)];
      if (f) b.parts.push({ food: f, grams: 100 });
      b.query = "";
      b._focusSearch = true;
      renderBuilder();
    } else if (e.target.dataset.rm !== undefined) {
      b.parts.splice(Number(e.target.dataset.rm), 1);
      renderBuilder();
    } else if (e.target.id === "meal-save") {
      saveBuilderMeal();
    }
  });

  $("#builder").addEventListener("input", (e) => {
    const b = state.builder;
    if (!b) return;
    if (e.target.id === "meal-search") {
      b.query = e.target.value;
      b._focusSearch = true;
      renderBuilder();
    } else if (e.target.id === "meal-name") {
      b.name = e.target.value;
      $("#meal-save").disabled = !(b.parts.length && b.name.trim());
    } else if (e.target.dataset.grams !== undefined) {
      const p = b.parts[Number(e.target.dataset.grams)];
      if (p) p.grams = Math.max(1, Number(e.target.value) || 1);
      const { per100, weight } = combine(b.parts);
      const preview = $(".builder-preview");
      if (preview && b.parts.length) {
        preview.innerHTML = `${hexSVG(axisScores(per100), null, 220)}
          <div class="hint">${Math.round(weight)} g · ${Math.round((per100.kcal || 0) * (weight / 100))} kcal total</div>`;
      }
    }
  });

  $("#profile-btn").addEventListener("click", () => {
    $("#profile-panel").hidden = false;
    renderProfile();
  });

  $("#profile-panel").addEventListener("click", (e) => {
    if (e.target.id === "profile-close" || e.target.id === "profile-panel") {
      $("#profile-panel").hidden = true;
    } else if (e.target.dataset.preset) {
      const preset = PRESETS[e.target.dataset.preset];
      for (const inp of document.querySelectorAll("[data-target]")) inp.value = preset[inp.dataset.target];
    } else if (e.target.id === "profile-save") {
      const p = readProfileFields();
      if (!p) return;
      state.profile = p;
      saveProfile(p);
      $("#profile-panel").hidden = true;
      $("#profile-btn").classList.add("on");
      renderStage();
    } else if (e.target.id === "profile-clear") {
      state.profile = null;
      state.dayMode = false;
      saveProfile(null);
      $("#profile-panel").hidden = true;
      $("#profile-btn").classList.remove("on");
      renderStage();
    }
  });
}

// ---------- boot ----------

bind();
if (state.profile) $("#profile-btn").classList.add("on");
renderList();
renderStage();
