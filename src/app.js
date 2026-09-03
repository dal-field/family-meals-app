import {
  FAMILY,
  SEED_MEALS,
  SLOTS,
  TYPE_ORDER,
  emptySlot,
  formatWeekRange,
  mondayOfWeek,
  normalizeIngredients,
  rollingDays,
  shiftMonday,
  slugify,
  storeColor,
} from "./data.js";
import {
  clearDayPlan,
  dayHasMeals,
  deleteUserMeal,
  hideSeedMeal,
  loadGrocery,
  loadMeals,
  loadPlan,
  resolveDayPlan,
  saveGrocery,
  savePlan,
  saveSeedEdit,
  saveUserMeal,
  setPlanSlot,
  slotHasMeal,
  swapDaySlots,
} from "./storage.js";
import { compressImageFile, deleteMealPhoto, getMealPhoto, putMealPhoto, resolvedMealPhotoSrc } from "./photos.js";

const TYPE_LABEL = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const TABS = [
  { id: "week", label: "This Week" },
  { id: "meals", label: "Meals" },
  { id: "groceries", label: "Groceries" },
  { id: "add", label: "Add" },
];

function emptyForm() {
  return {
    name: "",
    types: [],
    notes: "",
    recipeUrl: "",
    ingredients: [],
    makeAhead: false,
  };
}

function emptyPhotoDraft() {
  return { status: "empty" };
}

export function createApp(root) {
  const state = {
    tab: "week",
    meals: loadMeals(),
    plan: loadPlan(),
    grocery: loadGrocery(),
    query: "",
    mealFilter: "all",
    showHidden: false,
    selectedId: null,
    picker: null,
    clearConfirm: null,
    daySheet: null,
    weekSlotDetail: null,
    dinnerIdea: null,
    dinnerQuery: "",
    pickerQuery: "",
    oneOff: "",
    editingId: null,
    form: emptyForm(),
    ingredientDraft: "",
    groceryItemDrafts: {},
    storeDialog: null,
    storeNameDraft: "",
    toast: "",
    photoDraft: emptyPhotoDraft(),
    photoCache: {},
    photoViewer: null,
    weekAnchor: mondayOfWeek(new Date()),
  };

  let toastTimer = 0;

  function toast(message) {
    state.toast = message;
    render();
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      state.toast = "";
      render();
    }, 2200);
  }

  function refresh() {
    state.meals = loadMeals();
  }

  function mealById(id) {
    return state.meals.find((meal) => meal.id === id) || null;
  }

  function visibleMeals() {
    return state.meals.filter((meal) => state.showHidden || !meal.hidden);
  }

  function slotText(slot) {
    if (slot.label) return slot.label;
    if (slot.mealId) {
      const meal = mealById(slot.mealId);
      if (meal) return meal.name;
    }
    return "";
  }

  function parseHash() {
    const hash = (location.hash || "#week").replace(/^#/, "");
    const [tab, extra] = hash.split("/");
    if (TABS.some((item) => item.id === tab)) state.tab = tab;
    else state.tab = "week";

    state.selectedId = state.tab === "meals" && extra ? extra : null;

    if (state.tab === "add" && extra) {
      const meal = mealById(extra);
      if (meal) fillForm(meal);
    } else if (state.tab === "add" && !extra && !state.editingId) {
      state.form = emptyForm();
      state.ingredientDraft = "";
      if (state.photoDraft.status !== "empty") clearPhotoDraft();
    }
  }

  function go(hash) {
    if (location.hash === `#${hash}`) {
      parseHash();
      render();
      return;
    }
    location.hash = hash;
  }

  function fillForm(meal) {
    state.editingId = meal.id;
    state.form = {
      name: meal.name,
      types: [...meal.types],
      notes: meal.notes || "",
      recipeUrl: meal.recipeUrl || "",
      ingredients: normalizeIngredients(meal.ingredients),
      makeAhead: Boolean(meal.makeAhead),
    };
    state.ingredientDraft = "";
    void loadPhotoDraft(meal.id);
  }

  function filteredLibrary(query, type) {
    const q = query.trim().toLowerCase();
    return visibleMeals()
      .filter((meal) => {
        if (type === "makeAhead") return meal.makeAhead;
        if (type !== "all" && !meal.types.includes(type)) return false;
        if (!q) return true;
        const blob = [meal.name, meal.notes, meal.ingredients.join(" "), meal.recipeUrl].join(" ").toLowerCase();
        return blob.includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function weekSlotReplaceMeals(slotId, query) {
    const q = query.trim();
    return filteredLibrary(query, q ? "all" : slotId);
  }

  function persistMeal(meal) {
    if (SEED_MEALS.some((seed) => seed.id === meal.id)) saveSeedEdit(meal);
    else saveUserMeal(meal);
    refresh();
  }

  function revokePhotoUrls(entry) {
    if (!entry) return;
    if (entry.url) URL.revokeObjectURL(entry.url);
    if (entry.thumbUrl) URL.revokeObjectURL(entry.thumbUrl);
  }

  function clearPhotoDraft() {
    revokePhotoUrls(state.photoDraft);
    state.photoDraft = emptyPhotoDraft();
  }

  function cachePhotoRecord(mealId, record) {
    const previous = state.photoCache[mealId];
    if (previous && previous !== "none") revokePhotoUrls(previous);
    if (!record?.blob) {
      state.photoCache[mealId] = "none";
      return null;
    }
    const cached = {
      url: URL.createObjectURL(record.blob),
      thumbUrl: URL.createObjectURL(record.thumbBlob || record.blob),
    };
    state.photoCache[mealId] = cached;
    return cached;
  }

  async function ensurePhotoCached(mealId) {
    if (!mealId) return null;
    if (state.photoCache[mealId] === "none") return null;
    if (state.photoCache[mealId]) return state.photoCache[mealId];
    try {
      const record = await getMealPhoto(mealId);
      return cachePhotoRecord(mealId, record);
    } catch {
      state.photoCache[mealId] = "none";
      return null;
    }
  }

  async function loadPhotoDraft(mealId) {
    state.photoDraft = { status: "loading" };
    try {
      const record = await getMealPhoto(mealId);
      if (state.editingId !== mealId) return;
      if (!record?.blob) {
        state.photoDraft = emptyPhotoDraft();
      } else {
        const cached = cachePhotoRecord(mealId, record);
        state.photoDraft = {
          status: "ready",
          blob: record.blob,
          thumbBlob: record.thumbBlob || record.blob,
          mime: record.mime,
          width: record.width,
          height: record.height,
          url: cached.url,
          thumbUrl: cached.thumbUrl,
        };
      }
    } catch {
      if (state.editingId !== mealId) return;
      state.photoDraft = emptyPhotoDraft();
    }
    if (state.tab === "add") render();
  }

  async function attachPhotoFromFile(file) {
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      revokePhotoUrls(state.photoDraft);
      state.photoDraft = {
        status: "ready",
        ...compressed,
        url: URL.createObjectURL(compressed.blob),
        thumbUrl: URL.createObjectURL(compressed.thumbBlob),
      };
      render();
    } catch {
      toast("Could not save the photo on this phone");
    }
  }

  async function persistMealPhoto(mealId) {
    try {
      if (state.photoDraft.status === "ready" && state.photoDraft.blob) {
        await putMealPhoto(mealId, state.photoDraft);
        cachePhotoRecord(mealId, state.photoDraft);
      } else if (state.photoDraft.status === "removed") {
        await deleteMealPhoto(mealId);
        cachePhotoRecord(mealId, null);
      }
    } catch {
      toast("Could not save the photo on this phone");
    }
    clearPhotoDraft();
  }

  function photoField() {
    const draft = state.photoDraft;
    if (draft.status === "loading") {
      return `
        <div class="photo-field">
          <div class="hint">Photo</div>
          <p class="hint">Loading photo…</p>
        </div>`;
    }
    if (draft.status === "ready") {
      return `
        <div class="photo-field">
          <div class="hint">Photo</div>
          <div class="photo-preview">
            <img src="${escapeAttr(draft.thumbUrl || draft.url)}" alt="Attached meal photo" />
            <div class="photo-preview-actions">
              <label class="ghost photo-file-btn">
                Replace
                <input class="sr-only" type="file" accept="image/*" data-photo-choose />
              </label>
              <button class="danger" type="button" data-photo-remove>Remove</button>
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="photo-field">
        <div class="hint">Photo</div>
        <div class="photo-pickers">
          <label class="ghost photo-file-btn">
            Take photo
            <input class="sr-only" type="file" accept="image/*" capture="environment" data-photo-capture />
          </label>
          <label class="ghost photo-file-btn">
            Choose photo
            <input class="sr-only" type="file" accept="image/*" data-photo-choose />
          </label>
        </div>
      </div>`;
  }

  function mealPhotoButton(mealId) {
    if (!mealId) return "";
    const cached = state.photoCache[mealId];
    if (cached !== "none" && cached == null) requestMealPhoto(mealId);
    const src = resolvedMealPhotoSrc(cached);
    if (!src) return "";
    return `
      <button class="meal-photo-btn" type="button" data-open-photo="${mealId}">
        <img src="${escapeAttr(src)}" data-meal-photo="${mealId}" alt="" />
        <span>Photo</span>
      </button>`;
  }

  function photoViewerSheet() {
    const viewer = state.photoViewer;
    if (!viewer) return "";
    return `
      <div class="photo-viewer" data-close-photo-viewer role="dialog" aria-modal="true" aria-label="Meal photo">
        <button class="photo-viewer-close" type="button" data-close-photo-viewer>Close</button>
        <img src="${escapeAttr(viewer.url)}" alt="${escapeAttr(viewer.title || "Meal photo")}" />
      </div>`;
  }

  function overlayMealIds() {
    const ids = new Set();
    if (state.selectedId) ids.add(state.selectedId);
    if (state.dinnerIdea?.mealId) ids.add(state.dinnerIdea.mealId);
    if (state.weekSlotDetail) {
      const meal = resolveWeekSlotDetail(state.weekSlotDetail)?.meal;
      if (meal?.id) ids.add(meal.id);
    }
    return [...ids];
  }

  const photoLookups = new Set();

  function requestMealPhoto(mealId) {
    if (!mealId || state.photoCache[mealId] != null || photoLookups.has(mealId)) return;
    photoLookups.add(mealId);
    ensurePhotoCached(mealId).then((cached) => {
      photoLookups.delete(mealId);
      if (cached) render();
    });
  }

  async function hydrateMealPhotos() {
    overlayMealIds().forEach(requestMealPhoto);
  }

  function render() {
    root.innerHTML = `
      <div class="app-shell ${state.tab === "week" ? "is-week" : ""}">
        ${state.tab === "week" ? weekNavHeader() : `
        <header class="topbar">
          <div>
            <p class="kicker">${FAMILY}</p>
            <h1>${headerTitle()}</h1>
          </div>
        </header>`}
        ${view()}
      </div>
      <nav class="nav" aria-label="Main">
        ${TABS.map(
          (tab) => `
            <button class="nav-btn ${state.tab === tab.id ? "is-on" : ""}" data-tab="${tab.id}" type="button">
              ${tab.label}
            </button>`
        ).join("")}
      </nav>
      ${state.selectedId ? mealSheet() : ""}
      ${state.picker ? pickerSheet() : ""}
      ${state.daySheet ? dayActionSheet() : ""}
      ${state.clearConfirm ? clearConfirmSheet() : ""}
      ${state.weekSlotDetail ? weekSlotDetailSheet() : ""}
      ${state.dinnerIdea ? dinnerIdeaSheet() : ""}
      ${state.storeDialog ? storeDialogSheet() : ""}
      ${state.photoViewer ? photoViewerSheet() : ""}
      ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
    `;

    bind();
    hydrateMealPhotos();
  }

  function headerTitle() {
    if (state.tab === "meals") return "Meals";
    if (state.tab === "groceries") return "Groceries";
    return state.editingId ? "Edit meal" : "Add meal";
  }

  function weekNavHeader() {
    const days = weekDays();
    const start = dateFromDayKey(days[0].key);
    const end = dateFromDayKey(days[6].key);
    return `
      <header class="topbar week-nav">
        <p class="kicker">${FAMILY}</p>
        <div class="week-nav-row">
          <button class="week-nav-btn" type="button" data-week-shift="-1" aria-label="Previous week">‹</button>
          <h1>${escapeHtml(formatWeekRange(start, end))}</h1>
          <button class="week-nav-btn" type="button" data-week-shift="1" aria-label="Next week">›</button>
        </div>
      </header>`;
  }

  function dateFromDayKey(key) {
    const [year, month, day] = String(key).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function view() {
    if (state.tab === "week") return weekView();
    if (state.tab === "meals") return mealsView();
    if (state.tab === "groceries") return groceryView();
    return addView();
  }

  function weekDays() {
    return rollingDays(state.weekAnchor, new Date());
  }

  function weekView() {
    const days = weekDays();
    const dinners = filteredLibrary(state.dinnerQuery, "dinner");

    return `
      <section class="week-grid-card" aria-label="Weekly meal plan">
        <div class="week-grid">
          <div class="week-grid-corner" aria-hidden="true"></div>
          ${SLOTS.map(
            (slot) => `<div class="week-grid-h ${slot.id === "dinner" ? "is-dinner" : ""}" title="${escapeAttr(slot.label)}">${escapeHtml(slot.compact)}</div>`
          ).join("")}
          ${days
            .map((day) => {
              const plan = resolveDayPlan(state.plan, day);
              return `
                <button
                  class="week-grid-day ${day.isToday ? "is-today" : ""}"
                  type="button"
                  data-open-day="${day.key}"
                  aria-label="${escapeAttr(day.title)} actions"
                >
                  <span class="week-grid-dow">${escapeHtml(day.compact)}</span>
                  <span class="week-grid-date">${escapeHtml(day.dateLabel)}</span>
                </button>
                ${SLOTS.map((slot) => {
                  const value = slotText(plan[slot.id]);
                  const filled = Boolean(value);
                  return `
                    <button
                      class="week-grid-cell ${slot.id === "dinner" ? "is-dinner" : ""} ${filled ? "" : "is-empty"} ${day.isToday ? "is-today" : ""}"
                      type="button"
                      aria-label="${escapeAttr(`${day.title} ${slot.label}: ${value || "empty"}`)}"
                      ${filled ? `data-view-slot="${day.key}:${slot.id}"` : `data-assign-slot="${day.key}:${slot.id}"`}
                    >${escapeHtml(value || "—")}</button>`;
                }).join("")}`;
            })
            .join("")}
        </div>
      </section>

      <section class="section dinner-ideas">
        <h2>Dinners</h2>
        <input
          class="search"
          type="search"
          placeholder="Search dinners"
          value="${escapeAttr(state.dinnerQuery)}"
          data-dinner-search
        />
        <div class="dinner-idea-grid">
          ${
            dinners.length
              ? dinners
                  .map(
                    (meal) => `
                      <button class="dinner-idea" type="button" data-dinner-idea="${meal.id}">
                        <span class="meal-name">${escapeHtml(meal.name)}</span>
                        <span class="meal-meta">${meal.makeAhead ? "Make-ahead" : meal.recipeUrl ? "Recipe" : "Dinner"}</span>
                      </button>`
                  )
                  .join("")
              : `<p class="empty">No dinners match that search.</p>`
          }
        </div>
      </section>
    `;
  }

  function mealsView() {
    const meals = filteredLibrary(state.query, state.mealFilter);
    const hiddenCount = state.meals.filter((meal) => meal.hidden).length;
    const filters = [
      ["all", "All"],
      ["breakfast", "Breakfast"],
      ["lunch", "Lunch"],
      ["dinner", "Dinner"],
      ["snack", "Snack"],
      ["makeAhead", "Make-ahead"],
    ];

    return `
      <input class="search" type="search" placeholder="Search meals" value="${escapeAttr(state.query)}" data-search />
      <div class="filters" role="tablist" aria-label="Meal type">
        ${filters
          .map(
            ([id, label]) => `
              <button class="chip ${state.mealFilter === id ? "is-on" : ""}" type="button" data-filter="${id}">
                ${label}
              </button>`
          )
          .join("")}
      </div>
      <p class="hint">${meals.length} meal${meals.length === 1 ? "" : "s"}</p>
      <div class="meal-list">
        ${
          meals.length
            ? meals
                .map(
                  (meal) => `
                    <button class="meal-row" type="button" data-open-meal="${meal.id}">
                      <span class="meal-main">
                        <span class="meal-name">${escapeHtml(meal.name)}</span>
                        <span class="meal-meta">${mealMeta(meal)}</span>
                      </span>
                      <span class="meal-meta">${meal.hidden ? "Hidden" : meal.recipeUrl ? "Recipe" : ""}</span>
                    </button>`
                )
                .join("")
            : `<p class="empty">No meals match that search.</p>`
        }
      </div>
      ${
        hiddenCount
          ? `<button class="ghost hidden-toggle" type="button" data-toggle-hidden>
              ${state.showHidden ? "Hide hidden meals" : `Show ${hiddenCount} hidden meal${hiddenCount === 1 ? "" : "s"}`}
            </button>`
          : ""
      }
    `;
  }

  function groceryView() {
    const stores = state.grocery.stores || [];
    return `
      ${
        stores.length
          ? stores.map((store) => groceryStoreSection(store)).join("")
          : `<p class="empty">Add a store to start your list.</p>`
      }
      <div class="grocery-footer">
        <button class="ghost add-store-btn" type="button" data-open-add-store>Add store</button>
      </div>
    `;
  }

  function groceryStoreSection(store) {
    const color = storeColor(store.name);
    const draft = state.groceryItemDrafts[store.id] || "";
    return `
      <section class="section grocery-store-section">
        <div class="store-heading">
          <span class="store-badge" style="background:${color.bg};color:${color.fg}">${escapeHtml(store.name)}</span>
          <span class="hint">${store.items.length}</span>
          <span class="store-heading-actions">
            <button class="text-btn" type="button" data-rename-store="${store.id}">Rename</button>
            <button class="text-btn" type="button" data-delete-store="${store.id}">Delete</button>
          </span>
        </div>
        <div class="card grocery-store-card">
          ${
            store.items.length
              ? store.items.map((item) => groceryRow(store.id, item)).join("")
              : `<p class="hint grocery-store-empty">No items yet.</p>`
          }
          <div class="store-item-add">
            <input
              type="text"
              data-store-item-draft="${store.id}"
              placeholder="Add an item"
              value="${escapeAttr(draft)}"
              autocomplete="off"
            />
            <button class="primary" type="button" data-add-store-item="${store.id}">Add</button>
          </div>
        </div>
      </section>
    `;
  }

  function groceryRow(storeId, item) {
    return `
      <div class="grocery-item ${item.checked ? "is-done" : ""}">
        <label class="grocery-check">
          <input type="checkbox" ${item.checked ? "checked" : ""} data-grocery-check="${storeId}:${item.id}" />
          <span>${escapeHtml(item.name)}</span>
        </label>
        <button class="ghost grocery-delete" type="button" data-grocery-delete="${storeId}:${item.id}" aria-label="Remove ${escapeAttr(item.name)}">✕</button>
      </div>
    `;
  }

  function storeDialogSheet() {
    const dialog = state.storeDialog;
    if (!dialog) return "";
    const store = dialog.storeId ? findGroceryStore(dialog.storeId) : null;

    if (dialog.type === "delete" && store) {
      return `
        <div class="sheet-backdrop" data-close-store-dialog>
          <aside class="sheet sheet-confirm" role="dialog" aria-modal="true" aria-labelledby="store-delete-title">
            <div class="sheet-body">
              <p class="kicker">Groceries</p>
              <h2 id="store-delete-title">Delete ${escapeHtml(store.name)}?</h2>
              <p class="hint">This removes the store and its ${store.items.length} item${store.items.length === 1 ? "" : "s"}.</p>
            </div>
            <div class="actions sheet-actions">
              <button class="danger" type="button" data-confirm-delete-store="${store.id}">Delete store</button>
              <button class="ghost" type="button" data-close-store-dialog>Cancel</button>
            </div>
          </aside>
        </div>
      `;
    }

    const title =
      dialog.type === "add" ? "Add store" : dialog.type === "rename" ? `Rename ${store?.name || "store"}` : "";
    const submitLabel = dialog.type === "add" ? "Save store" : "Save name";

    return `
      <div class="sheet-backdrop" data-close-store-dialog>
        <aside class="sheet sheet-confirm" role="dialog" aria-modal="true" aria-labelledby="store-dialog-title">
          <div class="sheet-body">
            <p class="kicker">Groceries</p>
            <h2 id="store-dialog-title">${escapeHtml(title)}</h2>
            <label class="store-name-field">
              Store name
              <input type="text" data-store-name-draft value="${escapeAttr(state.storeNameDraft)}" placeholder="e.g. Costco" autocomplete="off" />
            </label>
          </div>
          <div class="actions sheet-actions">
            <button class="primary" type="button" data-submit-store-dialog>${submitLabel}</button>
            <button class="ghost" type="button" data-close-store-dialog>Cancel</button>
          </div>
        </aside>
      </div>
    `;
  }

  function addView() {
    const form = state.form;
    return `
      <form class="form card" style="padding:16px" data-meal-form>
        <label>
          Name
          <input name="name" required placeholder="e.g. Sheet pan nachos" value="${escapeAttr(form.name)}" />
        </label>
        <div>
          <div class="hint" style="margin-bottom:8px">Meal types</div>
          <div class="type-picks">
            ${TYPE_ORDER.map(
              (type) => `
                <label>
                  <input type="checkbox" name="types" value="${type}" ${form.types.includes(type) ? "checked" : ""} />
                  ${TYPE_LABEL[type]}
                </label>`
            ).join("")}
          </div>
        </div>
        <label>
          Notes
          <textarea name="notes" placeholder="Sides, Costco notes, reminders">${escapeHtml(form.notes)}</textarea>
        </label>
        <label>
          Recipe URL
          <input name="recipeUrl" type="text" inputmode="url" autocomplete="off" placeholder="https://" value="${escapeAttr(form.recipeUrl)}" />
        </label>
        ${photoField()}
        <div>
          <div class="hint" style="margin-bottom:8px">Ingredients</div>
          <div class="ingredient-add">
            <input
              type="text"
              data-ingredient-draft
              placeholder="e.g. Tortillas"
              value="${escapeAttr(state.ingredientDraft)}"
              autocomplete="off"
            />
            <button class="primary" type="button" data-add-ingredient>Add</button>
          </div>
          ${
            form.ingredients.length
              ? `<ul class="ingredient-list">
                  ${form.ingredients
                    .map(
                      (item, index) => `
                        <li class="ingredient-row">
                          <span>${escapeHtml(item)}</span>
                          <button class="ghost" type="button" data-remove-ingredient="${index}" aria-label="Remove ${escapeAttr(item)}">✕</button>
                        </li>`
                    )
                    .join("")}
                </ul>`
              : `<p class="hint">Add one item at a time. Each stays its own row.</p>`
          }
        </div>
        <label class="check-row">
          <input type="checkbox" name="makeAhead" ${form.makeAhead ? "checked" : ""} />
          Make-ahead
        </label>
        <div class="actions">
          <button class="primary" type="submit">${state.editingId ? "Save changes" : "Save meal"}</button>
          ${
            state.editingId
              ? `<button class="ghost" type="button" data-cancel-edit>Cancel</button>`
              : ""
          }
        </div>
      </form>
    `;
  }

  function mealDetailBlocks(meal) {
    const ingredients = normalizeIngredients(meal.ingredients);
    return `
      ${mealPhotoButton(meal.id)}
      <div class="badge-row">
        ${meal.types.map((type) => `<span class="badge">${TYPE_LABEL[type]}</span>`).join("")}
        ${meal.makeAhead ? `<span class="badge">Make-ahead</span>` : ""}
        ${meal.hidden ? `<span class="badge">Hidden</span>` : ""}
      </div>
      ${
        meal.notes
          ? `<div class="detail-block"><h3>Notes</h3><p>${escapeHtml(meal.notes)}</p></div>`
          : ""
      }
      ${
        ingredients.length
          ? `<div class="detail-block">
              <h3>Ingredients</h3>
              <ul class="ingredient-bullets">
                ${ingredients.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </div>`
          : ""
      }
      ${
        meal.recipeUrl
          ? `<a class="recipe-link" href="${escapeAttr(meal.recipeUrl)}" target="_blank" rel="noopener noreferrer">Open recipe</a>`
          : ""
      }
    `;
  }

  function weekSlotDetailSheet() {
    const detail = state.weekSlotDetail;
    const context = resolveWeekSlotDetail(detail);
    if (!context || !detail) return "";
    const { day, slotMeta, meal, oneOffName } = context;
    const slot = detail.slot;
    const panel = detail.panel || null;
    const title = meal ? meal.name : oneOffName;
    const ingredients = meal ? normalizeIngredients(meal.ingredients) : [];

    if (panel === "clearConfirm") {
      return `
        <div class="sheet-backdrop" data-close-week-slot>
          <aside class="sheet sheet-confirm" role="dialog" aria-modal="true" aria-labelledby="week-clear-title">
            <div class="sheet-body">
              <p class="kicker">${escapeHtml(day.title)} · ${escapeHtml(slotMeta.label)}</p>
              <h2 id="week-clear-title">Clear ${escapeHtml(slotMeta.label.toLowerCase())}?</h2>
              <p class="hint">${escapeHtml(slotClearHint(day, slot))}</p>
            </div>
            <div class="actions sheet-actions">
              <button class="danger" type="button" data-confirm-week-slot-clear>Clear slot</button>
              <button class="ghost" type="button" data-week-slot-back>Cancel</button>
            </div>
          </aside>
        </div>
      `;
    }

    if (panel === "swap") {
      const others = weekDays().filter((item) => item.key !== day.key);
      return `
        <div class="sheet-backdrop" data-close-week-slot>
          <aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="week-swap-title">
            <div class="sheet-body">
              <button class="text-btn week-slot-back" type="button" data-week-slot-back>← Back to details</button>
              <p class="kicker">${escapeHtml(day.title)} · ${escapeHtml(slotMeta.label)}</p>
              <h2 id="week-swap-title">Switch with another day</h2>
              <p class="hint">${escapeHtml(slotSwapHint(slot))}</p>
              <div class="meal-list">
                ${others
                  .map((other) => {
                    const text = slotText(resolveDayPlan(state.plan, other)[slot]) || "empty";
                    return `
                      <button class="meal-row" type="button" data-week-slot-swap-target="${other.key}">
                        <span class="meal-main">
                          <span class="meal-name">${escapeHtml(other.title)}</span>
                          <span class="meal-meta">${escapeHtml(text)}</span>
                        </span>
                      </button>`;
                  })
                  .join("")}
              </div>
            </div>
            <div class="actions sheet-actions">
              <button class="ghost" type="button" data-week-slot-back>Cancel</button>
            </div>
          </aside>
        </div>
      `;
    }

    if (panel === "replace") {
      const meals = weekSlotReplaceMeals(slot, detail.replaceQuery || "");
      return `
        <div class="sheet-backdrop" data-close-week-slot>
          <aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="week-replace-title">
            <button class="text-btn week-slot-back" type="button" data-week-slot-back>← Back to details</button>
            <p class="kicker">${escapeHtml(day.title)} · ${escapeHtml(slotMeta.label)}</p>
            <h2 id="week-replace-title">Replace meal</h2>
            <p class="hint">Now: ${escapeHtml(title)}</p>
            <input
              class="search"
              type="search"
              placeholder="Search the library"
              value="${escapeAttr(detail.replaceQuery || "")}"
              data-week-slot-replace-search
            />
            <form class="form" data-week-slot-one-off>
              <label>
                Or type a one-off
                <input name="oneOff" value="${escapeAttr(detail.oneOff || "")}" placeholder="Something simple for tonight" />
              </label>
            </form>
            <div class="sheet-body">
              <div class="meal-list">
                ${meals
                  .slice(0, 40)
                  .map(
                    (item) => `
                      <button class="meal-row" type="button" data-week-slot-pick-meal="${item.id}">
                        <span class="meal-main">
                          <span class="meal-name">${escapeHtml(item.name)}</span>
                          <span class="meal-meta">${mealMeta(item)}</span>
                        </span>
                      </button>`
                  )
                  .join("")}
              </div>
            </div>
            <div class="actions sheet-actions">
              <button class="primary" type="button" data-week-slot-submit-one-off>Use this</button>
              <button class="ghost" type="button" data-week-slot-back>Cancel</button>
            </div>
          </aside>
        </div>
      `;
    }

    return `
      <div class="sheet-backdrop" data-close-week-slot>
        <aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="week-slot-title">
          <div class="sheet-body">
            <p class="kicker">${escapeHtml(day.title)} · ${escapeHtml(slotMeta.label)}</p>
            <h2 id="week-slot-title">${escapeHtml(title)}</h2>
            ${
              meal
                ? mealDetailBlocks(meal)
                : `<div class="badge-row"><span class="badge">One-off plan</span></div>`
            }
          </div>
          <div class="week-slot-actions" aria-label="Meal slot actions">
            <button class="week-slot-action" type="button" data-week-slot-panel="swap" aria-label="Switch with another day">
              ${swapIcon()}
              <span>Switch</span>
            </button>
            <button class="week-slot-action" type="button" data-week-slot-panel="replace" aria-label="Replace meal">
              <span class="week-slot-action-icon" aria-hidden="true">↺</span>
              <span>Replace</span>
            </button>
            ${
              meal
                ? `<button class="week-slot-action" type="button" data-edit-from-week-slot="${meal.id}" aria-label="Edit meal">
                    <span class="week-slot-action-icon" aria-hidden="true">✎</span>
                    <span>Edit</span>
                  </button>`
                : ""
            }
            <button class="week-slot-action" type="button" data-week-slot-panel="clearConfirm" aria-label="Clear slot">
              <span class="week-slot-action-icon" aria-hidden="true">×</span>
              <span>Clear</span>
            </button>
          </div>
          <div class="actions sheet-actions">
            ${
              meal && ingredients.length
                ? `<button class="primary" type="button" data-send-grocery="${meal.id}">Add to groceries</button>`
                : ""
            }
            <button class="ghost" type="button" data-close-week-slot>Close</button>
          </div>
        </aside>
      </div>
    `;
  }

  function mealSheet() {
    const meal = mealById(state.selectedId);
    if (!meal) return "";
    const ingredients = normalizeIngredients(meal.ingredients);
    return `
      <div class="sheet-backdrop" data-close-sheet>
        <aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="meal-title">
          <div class="sheet-body">
            <p class="kicker">${meal.seed ? "Family recipe" : "Your meal"}</p>
            <h2 id="meal-title">${escapeHtml(meal.name)}</h2>
            ${mealDetailBlocks(meal)}
          </div>
          <div class="actions sheet-actions">
            ${
              ingredients.length
                ? `<button class="primary" type="button" data-send-grocery="${meal.id}">Add to groceries</button>`
                : ""
            }
            <button class="ghost" type="button" data-edit-meal="${meal.id}">Edit</button>
            ${
              meal.seed
                ? `<button class="danger" type="button" data-hide-meal="${meal.id}">${meal.hidden ? "Unhide" : "Hide"}</button>`
                : `<button class="danger" type="button" data-delete-meal="${meal.id}">Delete</button>`
            }
            <button class="ghost" type="button" data-close-sheet>Close</button>
          </div>
        </aside>
      </div>
    `;
  }

  function swapIcon() {
    return `
      <svg class="week-slot-action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h13l-3.2-3.2" />
        <path d="M20 17H7l3.2 3.2" />
      </svg>`;
  }

  function dayActionSheet() {
    const day = state.daySheet;
    if (!day) return "";
    const plan = resolveDayPlan(state.plan, day);
    const canClear = dayHasMeals(state.plan, day);
    return `
      <div class="sheet-backdrop" data-close-day-sheet>
        <aside class="sheet sheet-confirm" role="dialog" aria-modal="true" aria-labelledby="day-sheet-title">
          <div class="sheet-body">
            <p class="kicker">${day.isToday ? "Today" : "This week"}</p>
            <h2 id="day-sheet-title">${escapeHtml(day.title)}</h2>
            <ul class="day-slot-summary">
              ${SLOTS.map((slot) => {
                const value = slotText(plan[slot.id]) || "Empty";
                return `<li><strong>${escapeHtml(slot.label)}</strong> ${escapeHtml(value)}</li>`;
              }).join("")}
            </ul>
            <p class="hint">Tap a meal cell to view or change it. Clear all meals removes this date’s dinner and ${escapeHtml(day.label)}’s usual breakfast, lunch, and snack.</p>
          </div>
          <div class="actions sheet-actions">
            ${
              canClear
                ? `<button class="danger" type="button" data-clear-day="${day.key}">Clear all meals</button>`
                : ""
            }
            <button class="ghost" type="button" data-close-day-sheet>Close</button>
          </div>
        </aside>
      </div>
    `;
  }

  function clearConfirmSheet() {
    const day = state.clearConfirm;
    if (!day) return "";
    return `
      <div class="sheet-backdrop" data-close-clear>
        <aside class="sheet sheet-confirm" role="dialog" aria-modal="true" aria-labelledby="clear-title">
          <div class="sheet-body">
            <p class="kicker">This week</p>
            <h2 id="clear-title">Clear all meals for ${escapeHtml(day.title)}?</h2>
            <p class="hint">This will:</p>
            <ul class="hint-list">
              <li>Clear <strong>${escapeHtml(day.label)}’s dinner on ${escapeHtml(day.dateLabel)} only</strong></li>
              <li>Clear the usual <strong>${escapeHtml(day.label)} breakfast, lunch, and snack</strong> for every ${escapeHtml(day.label)}</li>
            </ul>
          </div>
          <div class="actions sheet-actions">
            <button class="danger" type="button" data-confirm-clear>Clear meals</button>
            <button class="ghost" type="button" data-close-clear>Cancel</button>
          </div>
        </aside>
      </div>
    `;
  }

  function dinnerIdeaSheet() {
    const idea = state.dinnerIdea;
    if (!idea) return "";
    const meal = mealById(idea.mealId);
    if (!meal) return "";
    const panel = idea.panel || null;

    if (panel === "confirm" && idea.confirmDay) {
      const current = slotText(resolveDayPlan(state.plan, idea.confirmDay).dinner) || "Empty";
      return `
        <div class="sheet-backdrop" data-close-dinner-idea>
          <aside class="sheet sheet-confirm" role="dialog" aria-modal="true" aria-labelledby="dinner-replace-title">
            <div class="sheet-body">
              <p class="kicker">${escapeHtml(idea.confirmDay.title)}</p>
              <h2 id="dinner-replace-title">Replace dinner?</h2>
              <p class="hint">This replaces <strong>${escapeHtml(current)}</strong> with <strong>${escapeHtml(meal.name)}</strong> on ${escapeHtml(idea.confirmDay.title)} only. Breakfast, lunch, and snack stay as they are.</p>
            </div>
            <div class="actions sheet-actions">
              <button class="primary" type="button" data-confirm-dinner-assign>Replace dinner</button>
              <button class="ghost" type="button" data-dinner-idea-panel="assign">Cancel</button>
            </div>
          </aside>
        </div>
      `;
    }

    if (panel === "assign") {
      return `
        <div class="sheet-backdrop" data-close-dinner-idea>
          <aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="dinner-assign-title">
            <div class="sheet-body">
              <button class="text-btn week-slot-back" type="button" data-dinner-idea-panel="">← Back to details</button>
              <p class="kicker">${escapeHtml(meal.name)}</p>
              <h2 id="dinner-assign-title">Assign to a day</h2>
              <p class="hint">Choosing a night with a dinner already planned will ask before replacing it.</p>
              <div class="meal-list">
                ${weekDays()
                  .map((day) => {
                    const current = slotText(resolveDayPlan(state.plan, day).dinner) || "Empty";
                    return `
                      <button class="meal-row" type="button" data-assign-dinner-day="${day.key}">
                        <span class="meal-main">
                          <span class="meal-name">${escapeHtml(day.title)}</span>
                          <span class="meal-meta">${escapeHtml(current)}</span>
                        </span>
                      </button>`;
                  })
                  .join("")}
              </div>
            </div>
            <div class="actions sheet-actions">
              <button class="ghost" type="button" data-dinner-idea-panel="">Cancel</button>
            </div>
          </aside>
        </div>
      `;
    }

    return `
      <div class="sheet-backdrop" data-close-dinner-idea>
        <aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="dinner-idea-title">
          <div class="sheet-body">
            <p class="kicker">Dinner idea</p>
            <h2 id="dinner-idea-title">${escapeHtml(meal.name)}</h2>
            ${mealDetailBlocks(meal)}
          </div>
          <div class="actions sheet-actions">
            <button class="primary" type="button" data-dinner-idea-panel="assign">Assign to a day</button>
            <button class="ghost" type="button" data-edit-from-dinner-idea="${meal.id}">Edit</button>
            <button class="ghost" type="button" data-close-dinner-idea>Close</button>
          </div>
        </aside>
      </div>
    `;
  }

  function pickerSheet() {
    const { day, slot } = state.picker;
    const slotMeta = SLOTS.find((item) => item.id === slot);
    const current = slotText(resolveDayPlan(state.plan, day)[slot]);
    const meals = weekSlotReplaceMeals(slot, state.pickerQuery);
    return `
      <div class="sheet-backdrop" data-close-picker>
        <aside class="sheet" role="dialog" aria-modal="true">
          <p class="kicker">${escapeHtml(day.title)}</p>
          <h2>Add ${slotMeta.label.toLowerCase()}</h2>
          ${current ? `<p class="hint">Now: ${escapeHtml(current)}</p>` : ""}
          <p class="hint">${escapeHtml(slotAssignHint(day, slot))}</p>
          <input class="search" type="search" placeholder="Search the library" value="${escapeAttr(state.pickerQuery)}" data-picker-search />
          <form class="form" data-one-off>
            <label>
              Or type a one-off
              <input name="oneOff" value="${escapeAttr(state.oneOff)}" placeholder="Something simple for tonight" />
            </label>
          </form>
          <div class="sheet-body">
            <div class="meal-list">
              ${meals
                .slice(0, 40)
                .map(
                  (meal) => `
                    <button class="meal-row" type="button" data-pick-meal="${meal.id}">
                      <span class="meal-main">
                        <span class="meal-name">${escapeHtml(meal.name)}</span>
                        <span class="meal-meta">${mealMeta(meal)}</span>
                      </span>
                    </button>`
                )
                .join("")}
            </div>
          </div>
          <div class="actions sheet-actions">
            <button class="primary" type="button" data-submit-one-off>Use this</button>
            <button class="ghost" type="button" data-clear-slot>Clear slot</button>
            <button class="ghost" type="button" data-close-picker>Cancel</button>
          </div>
        </aside>
      </div>
    `;
  }

  function bind() {
    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.editingId = null;
        state.form = emptyForm();
        state.ingredientDraft = "";
        clearPhotoDraft();
        go(button.dataset.tab);
      });
    });

    root.querySelectorAll("[data-week-shift]").forEach((button) => {
      button.addEventListener("click", () => {
        const weeks = Number(button.dataset.weekShift);
        if (!weeks) return;
        state.weekAnchor = shiftMonday(state.weekAnchor, weeks);
        render();
      });
    });

    const dinnerSearch = root.querySelector("[data-dinner-search]");
    if (dinnerSearch) {
      dinnerSearch.addEventListener("input", () => {
        state.dinnerQuery = dinnerSearch.value;
        render();
        const next = root.querySelector("[data-dinner-search]");
        if (next) {
          next.focus();
          next.setSelectionRange(state.dinnerQuery.length, state.dinnerQuery.length);
        }
      });
    }

    root.querySelectorAll("[data-dinner-idea]").forEach((button) => {
      button.addEventListener("click", () => {
        state.dinnerIdea = { mealId: button.dataset.dinnerIdea, panel: null, confirmDay: null };
        render();
      });
    });

    root.querySelectorAll("[data-close-dinner-idea]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (node.classList.contains("sheet-backdrop") && event.target !== node) return;
        state.dinnerIdea = null;
        render();
      });
    });

    root.querySelectorAll("[data-dinner-idea-panel]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!state.dinnerIdea) return;
        state.dinnerIdea = {
          ...state.dinnerIdea,
          panel: button.dataset.dinnerIdeaPanel || null,
          confirmDay: null,
        };
        render();
      });
    });

    root.querySelectorAll("[data-assign-dinner-day]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!state.dinnerIdea) return;
        const day = weekDays().find((item) => item.key === button.dataset.assignDinnerDay);
        if (!day) return;
        const current = resolveDayPlan(state.plan, day).dinner;
        if (slotHasMeal(current)) {
          state.dinnerIdea = { ...state.dinnerIdea, panel: "confirm", confirmDay: day };
          render();
          return;
        }
        assignDinnerToDay(day, state.dinnerIdea.mealId);
      });
    });

    const confirmDinnerAssign = root.querySelector("[data-confirm-dinner-assign]");
    if (confirmDinnerAssign) {
      confirmDinnerAssign.addEventListener("click", () => {
        if (!state.dinnerIdea?.confirmDay) return;
        assignDinnerToDay(state.dinnerIdea.confirmDay, state.dinnerIdea.mealId);
      });
    }

    root.querySelectorAll("[data-edit-from-dinner-idea]").forEach((button) => {
      button.addEventListener("click", () => {
        const meal = mealById(button.dataset.editFromDinnerIdea);
        if (!meal) return;
        state.dinnerIdea = null;
        fillForm(meal);
        go(`add/${meal.id}`);
      });
    });

    root.querySelectorAll("[data-open-day]").forEach((button) => {
      button.addEventListener("click", () => {
        const day = weekDays().find((item) => item.key === button.dataset.openDay);
        if (!day) return;
        state.daySheet = day;
        render();
      });
    });

    root.querySelectorAll("[data-close-day-sheet]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (node.classList.contains("sheet-backdrop") && event.target !== node) return;
        state.daySheet = null;
        render();
      });
    });

    root.querySelectorAll("[data-view-slot]").forEach((button) => {
      button.addEventListener("click", () => {
        const context = parseWeekSlotRef(button.dataset.viewSlot);
        if (!context) return;
        state.weekSlotDetail = {
          day: context.day,
          slot: context.slot,
          panel: null,
          replaceQuery: "",
          oneOff: "",
        };
        render();
      });
    });

    root.querySelectorAll("[data-assign-slot]").forEach((button) => {
      button.addEventListener("click", () => {
        openWeekSlotPicker(parseWeekSlotRef(button.dataset.assignSlot));
      });
    });

    root.querySelectorAll("[data-close-week-slot]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (node.classList.contains("sheet-backdrop") && event.target !== node) return;
        state.weekSlotDetail = null;
        render();
      });
    });

    root.querySelectorAll("[data-week-slot-panel]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!state.weekSlotDetail) return;
        state.weekSlotDetail = {
          ...state.weekSlotDetail,
          panel: button.dataset.weekSlotPanel,
        };
        render();
      });
    });

    root.querySelectorAll("[data-week-slot-back]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!state.weekSlotDetail) return;
        state.weekSlotDetail = {
          ...state.weekSlotDetail,
          panel: null,
          replaceQuery: "",
          oneOff: "",
        };
        render();
      });
    });

    root.querySelectorAll("[data-week-slot-swap-target]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!state.weekSlotDetail) return;
        const target = weekDays().find((item) => item.key === button.dataset.weekSlotSwapTarget);
        if (!target || target.key === state.weekSlotDetail.day.key) return;
        swapDaySlots(state.plan, state.weekSlotDetail.day, target, state.weekSlotDetail.slot);
        savePlan(state.plan);
        const slotMeta = SLOTS.find((item) => item.id === state.weekSlotDetail.slot);
        toast(`Swapped ${slotMeta.label.toLowerCase()}`);
        state.weekSlotDetail = null;
        render();
      });
    });

    const weekSlotReplaceSearch = root.querySelector("[data-week-slot-replace-search]");
    if (weekSlotReplaceSearch) {
      weekSlotReplaceSearch.addEventListener("input", () => {
        if (!state.weekSlotDetail) return;
        state.weekSlotDetail = {
          ...state.weekSlotDetail,
          replaceQuery: weekSlotReplaceSearch.value,
        };
        render();
        const next = root.querySelector("[data-week-slot-replace-search]");
        if (next) {
          next.focus();
          next.setSelectionRange(state.weekSlotDetail.replaceQuery.length, state.weekSlotDetail.replaceQuery.length);
        }
      });
    }

    root.querySelectorAll("[data-week-slot-pick-meal]").forEach((button) => {
      button.addEventListener("click", () => {
        const meal = mealById(button.dataset.weekSlotPickMeal);
        if (!meal || !state.weekSlotDetail) return;
        writeSlot(state.weekSlotDetail.day, state.weekSlotDetail.slot, { mealId: meal.id, label: meal.name });
        state.weekSlotDetail = null;
        toast("Weekly plan updated");
        render();
      });
    });

    const weekSlotSubmitOneOff = root.querySelector("[data-week-slot-submit-one-off]");
    if (weekSlotSubmitOneOff) {
      weekSlotSubmitOneOff.addEventListener("click", () => {
        root.querySelector("[data-week-slot-one-off]")?.requestSubmit();
      });
    }

    const weekSlotOneOff = root.querySelector("[data-week-slot-one-off]");
    if (weekSlotOneOff) {
      const oneOffInput = weekSlotOneOff.querySelector('[name="oneOff"]');
      if (oneOffInput) {
        oneOffInput.addEventListener("input", () => {
          if (!state.weekSlotDetail) return;
          state.weekSlotDetail = { ...state.weekSlotDetail, oneOff: oneOffInput.value };
        });
      }
      weekSlotOneOff.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = String(new FormData(weekSlotOneOff).get("oneOff") || "").trim();
        if (!value || !state.weekSlotDetail) return;
        writeSlot(state.weekSlotDetail.day, state.weekSlotDetail.slot, { mealId: null, label: value });
        state.weekSlotDetail = null;
        toast("Weekly plan updated");
        render();
      });
    }

    const confirmWeekSlotClear = root.querySelector("[data-confirm-week-slot-clear]");
    if (confirmWeekSlotClear) {
      confirmWeekSlotClear.addEventListener("click", () => {
        if (!state.weekSlotDetail) return;
        writeSlot(state.weekSlotDetail.day, state.weekSlotDetail.slot, emptySlot());
        state.weekSlotDetail = null;
        toast("Slot cleared");
        render();
      });
    }

    root.querySelectorAll("[data-edit-from-week-slot]").forEach((button) => {
      button.addEventListener("click", () => {
        const meal = mealById(button.dataset.editFromWeekSlot);
        if (!meal) return;
        state.weekSlotDetail = null;
        fillForm(meal);
        go(`add/${meal.id}`);
      });
    });

    root.querySelectorAll("[data-clear-day]").forEach((button) => {
      button.addEventListener("click", () => {
        const day = weekDays().find((item) => item.key === button.dataset.clearDay);
        if (!day || !dayHasMeals(state.plan, day)) return;
        state.daySheet = null;
        state.clearConfirm = day;
        render();
      });
    });

    root.querySelectorAll("[data-close-clear]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (node.classList.contains("sheet-backdrop") && event.target !== node) return;
        state.clearConfirm = null;
        render();
      });
    });

    const confirmClear = root.querySelector("[data-confirm-clear]");
    if (confirmClear) {
      confirmClear.addEventListener("click", () => {
        const day = state.clearConfirm;
        if (!day) return;
        clearDayPlan(state.plan, day);
        savePlan(state.plan);
        state.clearConfirm = null;
        toast(`Cleared ${day.title}`);
        render();
      });
    }

    root.querySelectorAll("[data-open-meal]").forEach((button) => {
      button.addEventListener("click", () => go(`meals/${button.dataset.openMeal}`));
    });

    root.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.mealFilter = button.dataset.filter;
        render();
      });
    });

    const search = root.querySelector("[data-search]");
    if (search) {
      search.addEventListener("input", () => {
        const scrollY = window.scrollY;
        state.query = search.value;
        render();
        window.scrollTo(0, scrollY);
        const next = root.querySelector("[data-search]");
        if (next) {
          next.focus();
          next.setSelectionRange(state.query.length, state.query.length);
        }
      });
    }

    const hiddenToggle = root.querySelector("[data-toggle-hidden]");
    if (hiddenToggle) {
      hiddenToggle.addEventListener("click", () => {
        state.showHidden = !state.showHidden;
        render();
      });
    }

    root.querySelectorAll("[data-grocery-check]").forEach((input) => {
      input.addEventListener("change", () => {
        const item = findGroceryItem(input.dataset.groceryCheck);
        if (item) item.checked = input.checked;
        saveGrocery(state.grocery);
        render();
      });
    });

    root.querySelectorAll("[data-grocery-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        deleteGroceryItem(button.dataset.groceryDelete);
        saveGrocery(state.grocery);
        render();
      });
    });

    root.querySelectorAll("[data-store-item-draft]").forEach((input) => {
      input.addEventListener("input", () => {
        state.groceryItemDrafts[input.dataset.storeItemDraft] = input.value;
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addItemToStore(input.dataset.storeItemDraft);
        }
      });
    });

    root.querySelectorAll("[data-add-store-item]").forEach((button) => {
      button.addEventListener("click", () => addItemToStore(button.dataset.addStoreItem));
    });

    root.querySelectorAll("[data-open-add-store]").forEach((button) => {
      button.addEventListener("click", () => {
        state.storeDialog = { type: "add" };
        state.storeNameDraft = "";
        render();
        focusStoreNameDraft();
      });
    });

    root.querySelectorAll("[data-rename-store]").forEach((button) => {
      button.addEventListener("click", () => {
        const store = findGroceryStore(button.dataset.renameStore);
        if (!store) return;
        state.storeDialog = { type: "rename", storeId: store.id };
        state.storeNameDraft = store.name;
        render();
        focusStoreNameDraft();
      });
    });

    root.querySelectorAll("[data-delete-store]").forEach((button) => {
      button.addEventListener("click", () => {
        const store = findGroceryStore(button.dataset.deleteStore);
        if (!store) return;
        if (store.items.length) {
          state.storeDialog = { type: "delete", storeId: store.id };
          render();
          return;
        }
        removeGroceryStore(store.id);
        saveGrocery(state.grocery);
        toast(`Removed ${store.name}`);
        render();
      });
    });

    root.querySelectorAll("[data-close-store-dialog]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (node.classList.contains("sheet-backdrop") && event.target !== node) return;
        state.storeDialog = null;
        state.storeNameDraft = "";
        render();
      });
    });

    const submitStoreDialog = root.querySelector("[data-submit-store-dialog]");
    if (submitStoreDialog) {
      submitStoreDialog.addEventListener("click", () => submitStoreDialogForm());
    }

    const storeNameDraft = root.querySelector("[data-store-name-draft]");
    if (storeNameDraft) {
      storeNameDraft.addEventListener("input", () => {
        state.storeNameDraft = storeNameDraft.value;
      });
      storeNameDraft.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submitStoreDialogForm();
        }
      });
    }

    root.querySelectorAll("[data-confirm-delete-store]").forEach((button) => {
      button.addEventListener("click", () => {
        const store = findGroceryStore(button.dataset.confirmDeleteStore);
        if (!store) return;
        removeGroceryStore(store.id);
        saveGrocery(state.grocery);
        state.storeDialog = null;
        toast(`Removed ${store.name}`);
        render();
      });
    });

    const form = root.querySelector("[data-meal-form]");
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        readMealForm(form);
        const name = state.form.name.trim();
        if (!name) return;
        const types = state.form.types;
        const meal = {
          id: state.editingId || uniqueId(name),
          name,
          types: types.length ? types : ["dinner"],
          notes: state.form.notes.trim(),
          recipeUrl: state.form.recipeUrl.trim(),
          ingredients: normalizeIngredients(state.form.ingredients),
          makeAhead: state.form.makeAhead,
        };
        persistMeal(meal);
        await persistMealPhoto(meal.id);
        state.editingId = null;
        state.form = emptyForm();
        state.ingredientDraft = "";
        toast("Saved on this phone");
        go(`meals/${meal.id}`);
      });

      form.querySelectorAll("[data-photo-capture], [data-photo-choose]").forEach((input) => {
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          input.value = "";
          void attachPhotoFromFile(file);
        });
      });

      const removePhoto = form.querySelector("[data-photo-remove]");
      if (removePhoto) {
        removePhoto.addEventListener("click", () => {
          revokePhotoUrls(state.photoDraft);
          state.photoDraft = { status: "removed" };
          render();
        });
      }

      const draft = form.querySelector("[data-ingredient-draft]");
      if (draft) {
        draft.addEventListener("input", () => {
          state.ingredientDraft = draft.value;
        });
        draft.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addIngredientRow(form);
          }
        });
      }

      const addIngredient = form.querySelector("[data-add-ingredient]");
      if (addIngredient) {
        addIngredient.addEventListener("click", () => addIngredientRow(form));
      }

      form.querySelectorAll("[data-remove-ingredient]").forEach((button) => {
        button.addEventListener("click", () => {
          readMealForm(form);
          const index = Number(button.dataset.removeIngredient);
          if (Number.isNaN(index)) return;
          state.form.ingredients = state.form.ingredients.filter((_, itemIndex) => itemIndex !== index);
          render();
          formFocus("[data-ingredient-draft]");
        });
      });
    }

    const cancel = root.querySelector("[data-cancel-edit]");
    if (cancel) {
      cancel.addEventListener("click", () => {
        state.editingId = null;
        state.form = emptyForm();
        state.ingredientDraft = "";
        clearPhotoDraft();
        go("add");
      });
    }

    root.querySelectorAll("[data-close-sheet]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (node.classList.contains("sheet-backdrop") && event.target !== node) return;
        state.selectedId = null;
        go("meals");
      });
    });

    root.querySelectorAll("[data-send-grocery]").forEach((button) => {
      button.addEventListener("click", () => {
        const meal = mealById(button.dataset.sendGrocery);
        if (!meal) return;
        const added = addMealIngredientsToGrocery(meal);
        if (added) toast(`Added ${added} item${added === 1 ? "" : "s"} to Groceries`);
        else toast("Those ingredients are already on Groceries");
      });
    });

    root.querySelectorAll("[data-edit-meal]").forEach((button) => {
      button.addEventListener("click", () => {
        const meal = mealById(button.dataset.editMeal);
        if (!meal) return;
        fillForm(meal);
        go(`add/${meal.id}`);
      });
    });

    root.querySelectorAll("[data-hide-meal]").forEach((button) => {
      button.addEventListener("click", () => {
        const meal = mealById(button.dataset.hideMeal);
        if (!meal) return;
        hideSeedMeal(meal.id, !meal.hidden);
        refresh();
        toast(meal.hidden ? "Meal is back in the library" : "Hidden from the library");
        go("meals");
      });
    });

    root.querySelectorAll("[data-delete-meal]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!confirm("Delete this meal from this phone?")) return;
        const mealId = button.dataset.deleteMeal;
        deleteUserMeal(mealId);
        cachePhotoRecord(mealId, null);
        void deleteMealPhoto(mealId).catch(() => undefined);
        refresh();
        toast("Meal deleted");
        go("meals");
      });
    });

    root.querySelectorAll("[data-close-picker]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (event.target === node) {
          state.picker = null;
          render();
        }
      });
    });

    const pickerSearch = root.querySelector("[data-picker-search]");
    if (pickerSearch) {
      pickerSearch.addEventListener("input", () => {
        state.pickerQuery = pickerSearch.value;
        render();
        const next = root.querySelector("[data-picker-search]");
        if (next) {
          next.focus();
          next.setSelectionRange(state.pickerQuery.length, state.pickerQuery.length);
        }
      });
    }

    root.querySelectorAll("[data-pick-meal]").forEach((button) => {
      button.addEventListener("click", () => {
        const meal = mealById(button.dataset.pickMeal);
        if (!meal || !state.picker) return;
        writeSlot(state.picker.day, state.picker.slot, { mealId: meal.id, label: meal.name });
        state.picker = null;
        toast("Weekly plan updated");
        render();
      });
    });

    const submitOneOff = root.querySelector("[data-submit-one-off]");
    if (submitOneOff) {
      submitOneOff.addEventListener("click", () => {
        root.querySelector("[data-one-off]")?.requestSubmit();
      });
    }

    const oneOff = root.querySelector("[data-one-off]");
    if (oneOff) {
      const oneOffInput = oneOff.querySelector('[name="oneOff"]');
      if (oneOffInput) {
        oneOffInput.addEventListener("input", () => {
          state.oneOff = oneOffInput.value;
        });
      }
      oneOff.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = String(new FormData(oneOff).get("oneOff") || "").trim();
        if (!value || !state.picker) return;
        writeSlot(state.picker.day, state.picker.slot, { mealId: null, label: value });
        state.picker = null;
        toast("Weekly plan updated");
        render();
      });
    }

    const clearSlot = root.querySelector("[data-clear-slot]");
    if (clearSlot) {
      clearSlot.addEventListener("click", () => {
        if (!state.picker) return;
        writeSlot(state.picker.day, state.picker.slot, emptySlot());
        state.picker = null;
        toast("Slot cleared");
        render();
      });
    }

    root.querySelectorAll("[data-open-photo]").forEach((button) => {
      button.addEventListener("click", async () => {
        const mealId = button.dataset.openPhoto;
        const cached = await ensurePhotoCached(mealId);
        if (!cached) {
          toast("Photo is not available");
          return;
        }
        const meal = mealById(mealId);
        state.photoViewer = { url: cached.url, title: meal?.name || "Meal photo" };
        render();
      });
    });

    root.querySelectorAll("[data-close-photo-viewer]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (node.classList.contains("photo-viewer") && event.target !== node) return;
        state.photoViewer = null;
        render();
      });
    });
  }

  function readMealForm(form) {
    const data = new FormData(form);
    state.form.name = String(data.get("name") || "");
    state.form.notes = String(data.get("notes") || "");
    state.form.recipeUrl = String(data.get("recipeUrl") || "");
    state.form.types = [...form.querySelectorAll('input[name="types"]:checked')].map((input) => input.value);
    state.form.makeAhead = Boolean(form.querySelector('[name="makeAhead"]')?.checked);
  }

  function addIngredientRow(form) {
    readMealForm(form);
    const item = state.ingredientDraft.trim();
    if (!item) return;
    const exists = state.form.ingredients.some((row) => row.toLowerCase() === item.toLowerCase());
    if (!exists) state.form.ingredients.push(item);
    state.ingredientDraft = "";
    render();
    formFocus("[data-ingredient-draft]");
  }

  function formFocus(selector) {
    const next = root.querySelector(selector);
    if (next) next.focus();
  }

  function writeSlot(day, slotId, value) {
    setPlanSlot(state.plan, day, slotId, value);
    savePlan(state.plan);
  }

  function assignDinnerToDay(day, mealId) {
    const meal = mealById(mealId);
    if (!meal || !day) return;
    writeSlot(day, "dinner", { mealId: meal.id, label: meal.name });
    state.dinnerIdea = null;
    toast(`Dinner set for ${day.label}`);
    render();
  }

  function slotClearHint(day, slotId) {
    if (slotId === "dinner") {
      return `This removes dinner on ${day.title} only. Other nights stay as they are.`;
    }
    const slotMeta = SLOTS.find((item) => item.id === slotId);
    return `This clears the usual ${day.label} ${slotMeta.label.toLowerCase()} for every ${day.label}, not just ${day.dateLabel}.`;
  }

  function slotSwapHint(slotId) {
    if (slotId === "dinner") {
      return "Same meal type only. This switches the two dates’ dinners. An empty night is fine.";
    }
    return "Same meal type only. This switches the usual weekday meals, so future weeks follow the new order.";
  }

  function slotAssignHint(day, slotId) {
    if (slotId === "dinner") {
      return `This fills dinner on ${day.title} only.`;
    }
    const slotMeta = SLOTS.find((item) => item.id === slotId);
    return `This updates every ${day.label} ${slotMeta.label.toLowerCase()}.`;
  }

  function parseWeekSlotRef(ref) {
    const [dayKey, slotId] = String(ref || "").split(":");
    const day = weekDays().find((item) => item.key === dayKey);
    if (!day || !SLOTS.some((item) => item.id === slotId)) return null;
    return { day, slot: slotId };
  }

  function resolveWeekSlotDetail(detail) {
    if (!detail?.day || !detail.slot) return null;
    const slotMeta = SLOTS.find((item) => item.id === detail.slot);
    if (!slotMeta) return null;
    const cell = resolveDayPlan(state.plan, detail.day)[detail.slot];
    if (!slotHasMeal(cell)) return null;
    const meal = cell.mealId ? mealById(cell.mealId) : null;
    const oneOffName = meal ? null : slotText(cell);
    if (!meal && !oneOffName) return null;
    return { day: detail.day, slotMeta, meal, oneOffName };
  }

  function openWeekSlotPicker(detail) {
    if (!detail?.day || !detail.slot) return;
    state.weekSlotDetail = null;
    state.picker = { day: detail.day, slot: detail.slot };
    state.pickerQuery = "";
    state.oneOff = "";
    render();
  }

  function findGroceryStore(storeId) {
    return state.grocery.stores.find((store) => store.id === storeId) || null;
  }

  function findGroceryItem(ref) {
    const [storeId, itemId] = String(ref || "").split(":");
    const store = findGroceryStore(storeId);
    if (!store) return null;
    return store.items.find((item) => item.id === itemId) || null;
  }

  function groceryStoreNameTaken(name, exceptId = null) {
    const key = name.trim().toLowerCase();
    return state.grocery.stores.some(
      (store) => store.id !== exceptId && store.name.trim().toLowerCase() === key
    );
  }

  function addGroceryStore(name) {
    const trimmed = name.trim();
    if (!trimmed || groceryStoreNameTaken(trimmed)) return null;
    const store = { id: `s-${Date.now()}`, name: trimmed, items: [] };
    state.grocery.stores.push(store);
    return store;
  }

  function removeGroceryStore(storeId) {
    state.grocery.stores = state.grocery.stores.filter((store) => store.id !== storeId);
    delete state.groceryItemDrafts[storeId];
  }

  function addItemToStore(storeId) {
    const store = findGroceryStore(storeId);
    if (!store) return;
    const name = (state.groceryItemDrafts[storeId] || "").trim();
    if (!name) return;
    const exists = store.items.some((item) => item.name.trim().toLowerCase() === name.toLowerCase());
    if (!exists) {
      store.items.push({
        id: `g-${Date.now()}`,
        name,
        checked: false,
      });
      saveGrocery(state.grocery);
    }
    state.groceryItemDrafts[storeId] = "";
    render();
    const next = root.querySelector(`[data-store-item-draft="${storeId}"]`);
    if (next) next.focus();
  }

  function deleteGroceryItem(ref) {
    const [storeId, itemId] = String(ref || "").split(":");
    const store = findGroceryStore(storeId);
    if (!store) return;
    store.items = store.items.filter((item) => item.id !== itemId);
  }

  function focusStoreNameDraft() {
    const next = root.querySelector("[data-store-name-draft]");
    if (next) {
      next.focus();
      next.setSelectionRange(state.storeNameDraft.length, state.storeNameDraft.length);
    }
  }

  function submitStoreDialogForm() {
    const name = state.storeNameDraft.trim();
    if (!name || !state.storeDialog) return;

    if (state.storeDialog.type === "add") {
      if (groceryStoreNameTaken(name)) {
        toast("You already have a store with that name");
        return;
      }
      addGroceryStore(name);
      saveGrocery(state.grocery);
      state.storeDialog = null;
      state.storeNameDraft = "";
      toast(`Added ${name}`);
      render();
      return;
    }

    if (state.storeDialog.type === "rename") {
      const store = findGroceryStore(state.storeDialog.storeId);
      if (!store) return;
      if (groceryStoreNameTaken(name, store.id)) {
        toast("You already have a store with that name");
        return;
      }
      store.name = name;
      saveGrocery(state.grocery);
      state.storeDialog = null;
      state.storeNameDraft = "";
      toast("Store renamed");
      render();
    }
  }

  function targetStoreForMealIngredients() {
    if (state.grocery.stores.length) return state.grocery.stores[0];
    return addGroceryStore("To buy");
  }

  function addMealIngredientsToGrocery(meal) {
    const store = targetStoreForMealIngredients();
    if (!store) return 0;
    const existing = new Set(store.items.map((item) => item.name.trim().toLowerCase()));
    let added = 0;
    for (const name of normalizeIngredients(meal.ingredients)) {
      const key = name.toLowerCase();
      if (existing.has(key)) continue;
      store.items.push({
        id: `g-${Date.now()}-${added}`,
        name,
        checked: false,
      });
      existing.add(key);
      added += 1;
    }
    if (added) saveGrocery(state.grocery);
    return added;
  }

  function uniqueId(name) {
    const base = slugify(name) || "meal";
    let id = `user-${base}`;
    let n = 2;
    while (state.meals.some((meal) => meal.id === id)) {
      id = `user-${base}-${n}`;
      n += 1;
    }
    return id;
  }

  function mealMeta(meal) {
    const types = meal.types.map((type) => TYPE_LABEL[type]).join(" · ");
    return meal.makeAhead ? `${types} · Make-ahead` : types;
  }

  window.addEventListener("hashchange", () => {
    parseHash();
    render();
  });

  parseHash();
  render();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
